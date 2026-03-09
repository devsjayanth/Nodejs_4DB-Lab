# 🚀Node.js | 4_DB-Lab
![Demo Video](demo/demoimg.png)

**Happy Learning — Made with ❤️ by Dev Jayanth**

---

## 🤔 What Is This?

4_DB-Lab is a learning project designed to teach you how to deploy a real multi-service application from scratch.

The app connects to **MySQL**, **MongoDB**, **PostgreSQL**, and **Redis** at the same time. The UI shows live connection status for each database and lets you interact with all four from a single page.

---

## 🎯 The Challenge

Get this application running. Every service — Node.js, MySQL, PostgreSQL, Redis, MongoDB, and Nginx — must be installed and configured by you. The app should be accessible from a browser.

---

## 📁 Project Structure

```
Nodejs_4DB-Lab/
├── backend/
│   ├── server.js          # Express API — reads DB config from environment variables
│   └── package.json       # Dependencies: express, mysql2, pg, redis, mongoose
├── frontend/
│   ├── index.html         # Single-file UI — no build step needed
│   └── Nginx.conf         # Nginx site config — serves the UI and proxies /api/*
├── Dockerfile
└── docker-compose.yml
```

---

## ⚙️ How the App Works

- The **backend** (`server.js`) is a Node.js/Express API. It reads all database connection details from **environment variables**.
- The **frontend** (`index.html`) is a static single-page app served by **Nginx**. Nginx also proxies all `/api/*` requests to the Node.js backend running on port `7010`.
- The UI polls `/api/status` every 5 seconds to show live connection state for each database.
- The server starts immediately and retries failed database connections every 5 seconds in the background.

---

## 🔧 Environment Variables the App Expects

Set these before starting the Node.js process:

| Variable | Description |
|---|---|
| `PORT` | Port for the Node.js server (default `7010`) |
| `MYSQL_HOST` | MySQL hostname |
| `MYSQL_PORT` | MySQL port |
| `MYSQL_USER` | MySQL username |
| `MYSQL_PASSWORD` | MySQL password |
| `MYSQL_DATABASE` | MySQL database name |
| `PG_HOST` | PostgreSQL hostname |
| `PG_PORT` | PostgreSQL port |
| `PG_USER` | PostgreSQL username |
| `PG_PASSWORD` | PostgreSQL password |
| `PG_DATABASE` | PostgreSQL database name |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password |
| `MONGO_URI` | Full MongoDB connection URI |

---

## 🌐 API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/status` | Connection state of all 4 databases |
| `POST` | `/api/mysql/write` | Insert a row — body: `{ "content": "..." }` |
| `GET` | `/api/mysql/entries` | List all rows |
| `DELETE` | `/api/mysql/entries/:id` | Delete a row |
| `POST` | `/api/postgres/write` | Insert a row |
| `GET` | `/api/postgres/entries` | List all rows |
| `DELETE` | `/api/postgres/entries/:id` | Delete a row |
| `POST` | `/api/redis/write` | Set a key |
| `GET` | `/api/redis/entries` | List all `entry:*` keys |
| `DELETE` | `/api/redis/entries/:key` | Delete a key |
| `POST` | `/api/mongo/write` | Insert a document |
| `GET` | `/api/mongo/entries` | List all documents |
| `DELETE` | `/api/mongo/entries/:id` | Delete a document by ObjectId |

All responses return `{ ok: true/false, ... }`. Write requests expect `Content-Type: application/json`.

---

## 🎩 Installing — RHEL / CentOS Stream / Fedora

### 🟢 Node.js

```bash
# The default dnf version is outdated — install v20 from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node --version   # should say v20.x.x

# Install app dependencies
cd ~/Nodejs_4DB-Lab/backend
npm install
```

### 🌐 Nginx

```bash
sudo dnf install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

Copy the provided config and update the `root` path to match where your project lives:

```bash
sudo cp ~/Nodejs_4DB-Lab/frontend/nginx.conf /etc/nginx/conf.d/4db.conf
sudo nano /etc/nginx/conf.d/4db.conf   # update root path
sudo nginx -t
sudo systemctl reload nginx
```

### 🐬 MySQL

```bash
sudo dnf install -y mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld

# Secure the installation and set a root password
sudo mysql_secure_installation

# Log in and create the app user and database
sudo mysql -u root -p
```

```sql
CREATE DATABASE appdb;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'apppassword';
GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 🐘 PostgreSQL

```bash
sudo dnf install -y postgresql-server postgresql-contrib

# RHEL requires manual initialisation before first start
sudo postgresql-setup --initdb

sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Edit `pg_hba.conf` to switch from `ident` to `md5` authentication — RHEL defaults to `ident` which will block the app:

```bash
sudo nano /var/lib/pgsql/data/pg_hba.conf
```

Find and change these lines:
```
# Before
local   all   all                    ident
host    all   all   127.0.0.1/32     ident

# After
local   all   all                    md5
host    all   all   127.0.0.1/32     md5
```

```bash
sudo systemctl restart postgresql

# Create the app user and database
sudo -i -u postgres psql
```

```sql
CREATE DATABASE appdb;
CREATE USER "appuser" WITH PASSWORD 'apppassword';
GRANT ALL PRIVILEGES ON DATABASE appdb TO "appuser";
EXIT;
```

### 🍃 MongoDB

Create the repository file:

```bash
sudo nano /etc/yum.repos.d/mongodb.repo
```

Paste:
```ini
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
```

```bash
sudo dnf install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Create the app user (must be in the admin database)
mongosh
```

```js
use admin
db.createUser({
  user: "appuser",
  pwd: "apppassword",
  roles: [{ role: "root", db: "admin" }]
})
exit
```

Enable authentication:

```bash
sudo nano /etc/mongod.conf
```

Add under the `security` section:
```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod

# Verify login works
mongosh "mongodb://appuser:apppassword@localhost:27017/appdb?authSource=admin"
```

### 🔴 Redis

```bash
sudo dnf install -y redis
sudo systemctl start redis
sudo systemctl enable redis

# Set a password
sudo nano /etc/redis/redis.conf
```

Find `# requirepass foobared` and replace with:
```
requirepass apppassword
```

```bash
sudo systemctl restart redis

# Verify
redis-cli -a apppassword ping
# Expected output: PONG
```

---

## 🐧 Installing — Debian / Ubuntu

### 🟢 Node.js

```bash
# The default apt version is outdated — install v20 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Verify
node --version   # should say v20.x.x

# Install app dependencies
cd ~/Nodejs_4DB-Lab/backend
npm install
```

### 🌐 Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

Copy the provided config and update the `root` path:

```bash
sudo cp ~/Nodejs_4DB-Lab/frontend/nginx.conf /etc/nginx/sites-available/4db-lab
sudo nano /etc/nginx/sites-available/4db-lab   # update root path

# Enable the site and disable the default
sudo ln -s /etc/nginx/sites-available/4db-lab /etc/nginx/sites-enabled/4db-lab
sudo rm /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
```

### 🐬 MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# Secure the installation
sudo mysql_secure_installation

# Log in and create the app user and database
sudo mysql -u root -p
```

```sql
CREATE DATABASE appdb;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'apppassword';
GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 🐘 PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Edit `pg_hba.conf` to switch from `peer` to `md5` authentication — Ubuntu defaults to `peer` which will block the app:

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Find and change these lines:
```
# Before
local   all   all                    peer
host    all   all   127.0.0.1/32     ident

# After
local   all   all                    md5
host    all   all   127.0.0.1/32     md5
```

```bash
sudo systemctl restart postgresql

# Create the app user and database
sudo -i -u postgres psql
```

```sql
CREATE DATABASE appdb;
CREATE USER "appuser" WITH PASSWORD 'apppassword';
GRANT ALL PRIVILEGES ON DATABASE appdb TO "appuser";
EXIT;
```

### 🍃 MongoDB

```bash
# Install required dependencies
sudo apt install -y gnupg curl

# Add MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add MongoDB repository (Ubuntu 22.04 — change jammy to your codename if different)
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

sudo systemctl start mongod
sudo systemctl enable mongod

# Create the app user (must be in the admin database)
mongosh
```

```js
use admin
db.createUser({
  user: "appuser",
  pwd: "apppassword",
  roles: [{ role: "root", db: "admin" }]
})
exit
```

Enable authentication:

```bash
sudo nano /etc/mongod.conf
```

Add under the `security` section:
```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod

# Verify login works
mongosh "mongodb://appuser:apppassword@localhost:27017/appdb?authSource=admin"
```

### 🔴 Redis

```bash
sudo apt install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Set a password
sudo nano /etc/redis/redis.conf
```

Find `# requirepass foobared` and replace with:
```
requirepass apppassword
```

Also make sure this line is set:
```
supervised systemd
```

```bash
sudo systemctl restart redis-server

# Verify
redis-cli -a apppassword ping
# Expected output: PONG
```

---

## 🔥 UFW Configuration (Debian / Ubuntu)

Ubuntu ships with UFW (Uncomplicated Firewall). Allow HTTP so the browser can reach the app:

```bash
# Allow HTTP
sudo ufw allow 80/tcp

# Allow SSH so you don't lock yourself out
sudo ufw allow ssh

# Enable the firewall if not already enabled
sudo ufw enable

# Verify
sudo ufw status
```

If you want to access Node.js directly during debugging:
```bash
sudo ufw allow 7010/tcp
```

Remove that rule once done — in production only port 80 should be open.

---

## 🔐 SELinux Configuration (RHEL / CentOS)

RHEL enforces SELinux by default. Without these settings Nginx cannot proxy to Node.js and Node.js cannot connect to the databases.

```bash
# Allow Nginx to make network connections (required for proxy to Node.js)
sudo setsebool -P httpd_can_network_connect 1

# Verify the setting is applied
getsebool httpd_can_network_connect
```

If you see SELinux denials in logs:
```bash
# Check what SELinux is blocking
sudo ausearch -m avc -ts recent

# View Nginx-specific denials
sudo grep Nginx /var/log/audit/audit.log | tail -20
```

---

## 🧱 Firewalld Configuration (RHEL / CentOS)

By default RHEL's firewall blocks all ports except SSH. Open port 80 so the browser can reach the app:

```bash
# Allow HTTP traffic on port 80
sudo firewall-cmd --permanent --add-service=http

# Reload firewall to apply
sudo firewall-cmd --reload

# Verify port 80 is open
sudo firewall-cmd --list-all
```

If you want to access the Node.js API directly (bypass Nginx) during debugging:

```bash
sudo firewall-cmd --permanent --add-port=7010/tcp
sudo firewall-cmd --reload
```

Remove that rule once you're done debugging — in production only port 80 should be open.

---

## ✅ Verify Everything Is Running

```bash
# Check all services
sudo systemctl status mysqld postgresql mongod redis Nginx

# Check Node.js is listening
ss -tlnp | grep 7010

# Test API directly
curl http://127.0.0.1:7010/api/status

# Test through Nginx
curl http://localhost/api/status
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express |
| Databases | MySQL 8 · PostgreSQL 16 · Redis 7 · MongoDB 7 |
| Web server | Nginx |

---

## 📄 License

MIT — use freely❤️, learn freely.