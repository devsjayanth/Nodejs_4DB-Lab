'use strict';

const express          = require('express');
const mysql            = require('mysql2/promise');
const { Pool }         = require('pg');
const { createClient } = require('redis');
const mongoose         = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════
//  CONFIG  — all values come from docker-compose environment
// ══════════════════════════════════════════════════════════
const CFG = {
  mysql: {
    host:               process.env.MYSQL_HOST     || 'mysql',
    port:               Number(process.env.MYSQL_PORT) || 3306,
    user:               process.env.MYSQL_USER     || 'userapp',
    password:           process.env.MYSQL_PASSWORD || 'userapp_pass',
    database:           process.env.MYSQL_DATABASE || 'userapp',
    waitForConnections: true,
    connectionLimit:    5,
    connectTimeout:     5000,
  },
  postgres: {
    host:                    process.env.PG_HOST     || 'postgres',
    port:                    Number(process.env.PG_PORT) || 5432,
    user:                    process.env.PG_USER     || 'userapp',
    password:                process.env.PG_PASSWORD || 'userapp_pass',
    database:                process.env.PG_DATABASE || 'userapp',
    max:                     5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis:       30000,
  },
  redis: {
    socket: {
      host:           process.env.REDIS_HOST || 'redis',
      port:           Number(process.env.REDIS_PORT) || 6379,
      connectTimeout: 5000,
    },
    password: process.env.REDIS_PASSWORD || 'userapp_pass',
  },
  mongo: {
    uri: process.env.MONGO_URI ||
      'mongodb://userapp:userapp_pass@mongo:27017/userapp?authSource=admin',
  },
};

// ══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ══════════════════════════════════════════════════════════
// Limit JSON body to 10 kb to prevent payload DoS
app.use(express.json({ limit: '10kb' }));

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
const state = {
  mysql:    { connected: false, error: null, pool:   null },
  postgres: { connected: false, error: null, pool:   null },
  redis:    { connected: false, error: null, client: null },
  mongo:    { connected: false, error: null },
};

// ══════════════════════════════════════════════════════════
//  MYSQL
// ══════════════════════════════════════════════════════════
async function connectMySQL() {
  try {
    if (!state.mysql.pool) state.mysql.pool = mysql.createPool(CFG.mysql);
    const conn = await state.mysql.pool.getConnection();
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS entries (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        content    TEXT      NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    conn.release();
    state.mysql.connected = true;
    state.mysql.error     = null;
    console.log('✅ MySQL connected');
  } catch (err) {
    state.mysql.connected = false;
    state.mysql.error     = err.message;
    console.error('❌ MySQL:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
//  POSTGRESQL
// ══════════════════════════════════════════════════════════
async function connectPostgres() {
  try {
    if (!state.postgres.pool) state.postgres.pool = new Pool(CFG.postgres);
    const client = await state.postgres.pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id         SERIAL    PRIMARY KEY,
        content    TEXT      NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    client.release();
    state.postgres.connected = true;
    state.postgres.error     = null;
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    state.postgres.connected = false;
    state.postgres.error     = err.message;
    console.error('❌ PostgreSQL:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
//  REDIS
// ══════════════════════════════════════════════════════════
async function connectRedis() {
  // Always dispose stale client before creating a new one
  if (state.redis.client) {
    try { await state.redis.client.quit(); } catch (_) {}
    state.redis.client = null;
  }
  try {
    const client = createClient(CFG.redis);
    client.on('error', (err) => {
      state.redis.connected = false;
      state.redis.error     = err.message;
    });
    await client.connect();
    await client.ping();
    state.redis.client    = client;
    state.redis.connected = true;
    state.redis.error     = null;
    console.log('✅ Redis connected');
  } catch (err) {
    state.redis.connected = false;
    state.redis.error     = err.message;
    state.redis.client    = null;
    console.error('❌ Redis:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
//  MONGODB
// ══════════════════════════════════════════════════════════
const MongoEntry = mongoose.model('Entry', new mongoose.Schema({
  content:   { type: String, required: true },
  createdAt: { type: Date,   default: Date.now },
}));

async function connectMongo() {
  const rs = mongoose.connection.readyState;
  if (rs === 1) { state.mongo.connected = true;  state.mongo.error = null; return; }
  if (rs === 2) return; // already connecting — don't stack calls
  try {
    await mongoose.connect(CFG.mongo.uri, { serverSelectionTimeoutMS: 5000 });
    state.mongo.connected = true;
    state.mongo.error     = null;
    console.log('✅ MongoDB connected');
  } catch (err) {
    state.mongo.connected = false;
    state.mongo.error     = err.message;
    console.error('❌ MongoDB:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
//  HEALTH CHECKS  (every 15 s)
// ══════════════════════════════════════════════════════════
async function healthCheck() {
  // MySQL
  try {
    if (state.mysql.pool) {
      await state.mysql.pool.query('SELECT 1');
      state.mysql.connected = true;
      state.mysql.error     = null;
    } else {
      await connectMySQL();
    }
  } catch {
    state.mysql.connected = false;
    state.mysql.pool      = null; // force pool rebuild on next attempt
    await connectMySQL();
  }

  // PostgreSQL
  try {
    if (state.postgres.pool) {
      const c = await state.postgres.pool.connect();
      await c.query('SELECT 1');
      c.release();
      state.postgres.connected = true;
      state.postgres.error     = null;
    } else {
      await connectPostgres();
    }
  } catch {
    state.postgres.connected = false;
    state.postgres.pool      = null;
    await connectPostgres();
  }

  // Redis
  try {
    if (state.redis.client?.isOpen) {
      await state.redis.client.ping();
      state.redis.connected = true;
      state.redis.error     = null;
    } else {
      await connectRedis();
    }
  } catch {
    state.redis.connected = false;
    await connectRedis();
  }

  // MongoDB
  if (mongoose.connection.readyState !== 1) {
    state.mongo.connected = false;
    await connectMongo();
  } else {
    state.mongo.connected = true;
    state.mongo.error     = null;
  }
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
/** Return 503 if the requested DB is not connected. */
function guard(db, res) {
  if (!state[db].connected) {
    res.status(503).json({ ok: false, error: `${db} not connected` });
    return false;
  }
  return true;
}

/** Monotonically unique key for Redis entries (safe under Node's single thread). */
let _seq = 0;
function redisKey() { return `entry:${Date.now()}-${_seq++ % 10000}`; }

// ══════════════════════════════════════════════════════════
//  STATUS
// ══════════════════════════════════════════════════════════
app.get('/api/status', (_req, res) => {
  res.json({
    mysql:    { connected: state.mysql.connected,    error: state.mysql.error },
    postgres: { connected: state.postgres.connected, error: state.postgres.error },
    redis:    { connected: state.redis.connected,    error: state.redis.error },
    mongo:    { connected: state.mongo.connected,    error: state.mongo.error },
  });
});

// ══════════════════════════════════════════════════════════
//  MYSQL  —  write / list / delete
// ══════════════════════════════════════════════════════════
app.post('/api/mysql/write', async (req, res) => {
  const content = req.body?.content?.trim();
  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });
  if (!guard('mysql', res)) return;
  try {
    const [result] = await state.mysql.pool.execute(
      'INSERT INTO entries (content) VALUES (?)', [content]
    );
    res.json({ ok: true, id: result.insertId, message: `Entry #${result.insertId} saved to MySQL` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/mysql/entries', async (_req, res) => {
  if (!guard('mysql', res)) return;
  try {
    const [rows] = await state.mysql.pool.execute(
      'SELECT id, content, created_at AS createdAt FROM entries ORDER BY created_at DESC'
    );
    res.json({ ok: true, entries: rows });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/mysql/entries/:id', async (req, res) => {
  if (!guard('mysql', res)) return;
  try {
    await state.mysql.pool.execute('DELETE FROM entries WHERE id = ?', [req.params.id]);
    res.json({ ok: true, message: `MySQL entry #${req.params.id} deleted` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  POSTGRESQL  —  write / list / delete
// ══════════════════════════════════════════════════════════
app.post('/api/postgres/write', async (req, res) => {
  const content = req.body?.content?.trim();
  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });
  if (!guard('postgres', res)) return;
  try {
    const { rows } = await state.postgres.pool.query(
      'INSERT INTO entries (content) VALUES ($1) RETURNING id', [content]
    );
    res.json({ ok: true, id: rows[0].id, message: `Entry #${rows[0].id} saved to PostgreSQL` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/postgres/entries', async (_req, res) => {
  if (!guard('postgres', res)) return;
  try {
    const { rows } = await state.postgres.pool.query(
      'SELECT id, content, created_at AS "createdAt" FROM entries ORDER BY created_at DESC'
    );
    res.json({ ok: true, entries: rows });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/postgres/entries/:id', async (req, res) => {
  if (!guard('postgres', res)) return;
  try {
    await state.postgres.pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true, message: `PostgreSQL entry #${req.params.id} deleted` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  REDIS  —  write / list / delete
// ══════════════════════════════════════════════════════════
app.post('/api/redis/write', async (req, res) => {
  const content = req.body?.content?.trim();
  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });
  if (!guard('redis', res)) return;
  try {
    const key = redisKey();
    await state.redis.client.set(key, content);
    res.json({ ok: true, key, message: `Saved to Redis → ${key}` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/redis/entries', async (_req, res) => {
  if (!guard('redis', res)) return;
  try {
    const keys = [];
    for await (const k of state.redis.client.scanIterator({ MATCH: 'entry:*', COUNT: 100 })) {
      keys.push(k);
    }
    // Sort newest-first using the timestamp prefix in the key
    keys.sort((a, b) => Number(b.split(':')[1] || 0) - Number(a.split(':')[1] || 0));
    const entries = await Promise.all(keys.map(async (key) => {
      const content = await state.redis.client.get(key);
      const ts      = Number(key.split(':')[1] || 0);
      return { id: key, content, createdAt: ts ? new Date(ts).toISOString() : null };
    }));
    res.json({ ok: true, entries });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/redis/entries/:key', async (req, res) => {
  if (!guard('redis', res)) return;
  try {
    const key = decodeURIComponent(req.params.key);
    await state.redis.client.del(key);
    res.json({ ok: true, message: `Redis key "${key}" deleted` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  MONGODB  —  write / list / delete
// ══════════════════════════════════════════════════════════
app.post('/api/mongo/write', async (req, res) => {
  const content = req.body?.content?.trim();
  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });
  if (!guard('mongo', res)) return;
  try {
    const doc = await MongoEntry.create({ content });
    res.json({ ok: true, id: doc._id, message: `Saved to MongoDB → ${doc._id}` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/mongo/entries', async (_req, res) => {
  if (!guard('mongo', res)) return;
  try {
    const docs = await MongoEntry.find().sort({ createdAt: -1 }).lean();
    res.json({
      ok: true,
      entries: docs.map(d => ({ id: d._id, content: d.content, createdAt: d.createdAt })),
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/mongo/entries/:id', async (req, res) => {
  if (!guard('mongo', res)) return;
  try {
    await MongoEntry.findByIdAndDelete(req.params.id);
    res.json({ ok: true, message: `MongoDB entry ${req.params.id} deleted` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  404 — unknown API routes
// ══════════════════════════════════════════════════════════
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'endpoint not found' });
});

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════
(async () => {
  console.log('🔌 Connecting to databases…');

  // Initial connect — all 4 in parallel
  await Promise.allSettled([
    connectMySQL(),
    connectPostgres(),
    connectRedis(),
    connectMongo(),
  ]);

  // Boot retry: if any DB is still down, keep retrying every 5 s for up to 90 s.
  // Handles the window between depends_on healthcheck passing and the DB
  // actually accepting app-user connections (MySQL can lag a few seconds).
  const bootDeadline = Date.now() + 90_000;
  while (Date.now() < bootDeadline) {
    const allUp = Object.values(state).every(s => s.connected);
    if (allUp) break;
    await new Promise(r => setTimeout(r, 5000));
    const down = Object.entries(state)
      .filter(([, s]) => !s.connected)
      .map(([k]) => k);
    console.log(`⏳ Retrying: ${down.join(', ')}…`);
    await Promise.allSettled([
      !state.mysql.connected    && connectMySQL(),
      !state.postgres.connected && connectPostgres(),
      !state.redis.connected    && connectRedis(),
      !state.mongo.connected    && connectMongo(),
    ]);
  }

  const timer  = setInterval(healthCheck, 15_000);
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 4_DB-Lab API →  http://localhost:${PORT}\n`);
  });

  // Graceful shutdown (Docker stop sends SIGTERM)
  async function shutdown(signal) {
    console.log(`\n${signal} — shutting down…`);
    clearInterval(timer);

    // Force-exit after 8 s if connections don't drain
    const forceExit = setTimeout(() => {
      console.error('Forced exit after timeout.');
      process.exit(1);
    }, 8000);
    forceExit.unref(); // don't block event loop if everything closes cleanly

    server.close(async () => {
      try { if (state.mysql.pool)    await state.mysql.pool.end();        } catch (_) {}
      try { if (state.postgres.pool) await state.postgres.pool.end();     } catch (_) {}
      try { if (state.redis.client)  await state.redis.client.quit();     } catch (_) {}
      try { await mongoose.connection.close();                             } catch (_) {}
      console.log('All connections closed. Goodbye.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
})();