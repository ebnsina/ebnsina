---
title: 'Full-Stack VPS Deployment: React, Node, Go, Postgres, Redis, ClickHouse, Redpanda & More'
description: 'A complete guide to deploying a production-ready full-stack application on a fresh VPS — covering server hardening, message streaming, object storage, search, email, task queues, and observability.'
date: 2026-05-12
tags:
  [
    'devops',
    'vps',
    'postgresql',
    'redis',
    'clickhouse',
    'nginx',
    'security',
    'golang',
    'nodejs',
    'react',
    'redpanda',
    'kafka',
    'garage',
    'typesense',
    'nats'
  ]
minutesRead: 27
---

<script>
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

This guide takes a **fresh Ubuntu 24.04 VPS** from zero to a production-ready deployment running:

- **React** SPA served via Nginx
- **Node.js** API (via PM2)
- **Go** binary service (via systemd)
- **PostgreSQL 16** with pgvector + pg_cron extensions
- **Redis 7** with persistence
- **ClickHouse** for analytics
- **Redpanda** (Kafka-compatible event streaming)
- **NATS** (lightweight pub/sub + job queue)
- **Garage** (S3-compatible object storage, MIT licensed)
- **Typesense** (full-text search)
- **Nginx** reverse proxy with TLS (Certbot)
- **UFW** firewall + Fail2ban
- **Centralized logging** (journald + Vector + ClickHouse)
- **Monitoring** (Prometheus + Grafana, optional)
- **OpenTelemetry** traces + metrics

Estimated time: 2–4 hours on a clean machine depending on which services you need.

---

## 1. Initial Server Setup

### 1.1 First login as root

```bash
ssh root@YOUR_SERVER_IP
```

Update everything before touching anything else:

```bash
apt update && apt upgrade -y
apt install -y curl wget git build-essential unzip ufw fail2ban htop
```

### 1.2 Create a non-root user

```bash
useradd -m -s /bin/bash deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

From this point, all commands run as `deploy` unless noted.

```bash
su - deploy
```

### 1.3 Harden SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Set these values:

```
Port 2222                    # non-default port
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowUsers deploy
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
sudo systemctl restart sshd
```

> **Warning:** Open a second terminal and confirm you can still log in on port 2222 before closing your current session.

---

## 2. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp      # SSH on new port
sudo ufw allow 80/tcp        # HTTP (Certbot challenge)
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
sudo ufw status verbose
```

Services like Postgres, Redis, and ClickHouse should **never** be exposed publicly. They bind to `127.0.0.1` only. If you need remote access, use an SSH tunnel:

```bash
ssh -L 5432:localhost:5432 deploy@YOUR_SERVER_IP -p 2222
```

---

## 3. Fail2ban

```bash
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled  = true
port     = 2222
logpath  = /var/log/auth.log
maxretry = 3
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

---

## 4. PostgreSQL 16

### 4.1 Install

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt install -y postgresql-16 postgresql-contrib-16
```

### 4.2 Create database and user

```bash
sudo -u postgres psql
```

```sql
CREATE USER appuser WITH PASSWORD 'strong_random_password';
CREATE DATABASE appdb OWNER appuser;
\c appdb
-- allow only what is needed
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO appuser;
GRANT CREATE ON SCHEMA public TO appuser;
\q
```

### 4.3 Tune postgresql.conf

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Sensible defaults for a 4 GB RAM VPS:

```
max_connections = 100
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10485kB
min_wal_size = 1GB
max_wal_size = 4GB
```

Scale `shared_buffers` to 25% of RAM and `effective_cache_size` to 75%.

### 4.4 Restrict pg_hba

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Remove or comment all lines that allow remote connections. Keep only:

```
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

### 4.5 Extensions

**pgvector** (embeddings / similarity search):

```bash
sudo apt install -y postgresql-16-pgvector
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**pg_cron** (scheduled jobs inside Postgres):

```bash
sudo apt install -y postgresql-16-pg-cron
```

Add to `postgresql.conf`:

```
shared_preload_libraries = 'pg_cron'
cron.database_name = 'appdb'
```

```bash
sudo systemctl restart postgresql
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS pg_cron;"
```

Schedule a vacuum example:

```sql
SELECT cron.schedule('nightly-vacuum', '0 3 * * *', 'VACUUM ANALYZE');
```

**PostGIS** (geospatial):

```bash
sudo apt install -y postgresql-16-postgis-3
sudo -u postgres psql -d appdb -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

**Automatic backups with pg_dump:**

```bash
sudo mkdir -p /var/backups/postgres
sudo chown deploy:deploy /var/backups/postgres
```

Create `/home/deploy/scripts/pg_backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%Y%m%d_%H%M%S)
PGPASSWORD="strong_random_password" pg_dump \
  -h 127.0.0.1 -U appuser appdb \
  | gzip > /var/backups/postgres/appdb_${DATE}.sql.gz
# Keep last 7 days
find /var/backups/postgres -name "*.sql.gz" -mtime +7 -delete
```

```bash
chmod +x /home/deploy/scripts/pg_backup.sh
crontab -e
# Add:
# 0 2 * * * /home/deploy/scripts/pg_backup.sh
```

---

## 5. Redis 7

### 5.1 Install

```bash
sudo apt install -y redis-server
```

### 5.2 Configure

```bash
sudo nano /etc/redis/redis.conf
```

Key settings:

```
bind 127.0.0.1 -::1
protected-mode yes
requirepass your_redis_password

# Persistence — choose one or both
appendonly yes
appendfsync everysec

# Or RDB only (faster, slightly less durable)
save 900 1
save 300 10
save 60 10000

# Memory limit (adjust per server)
maxmemory 512mb
maxmemory-policy allkeys-lru

# Disable dangerous commands
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command DEBUG ""
```

```bash
sudo systemctl enable --now redis-server
redis-cli -a your_redis_password ping
```

### 5.3 Redis ACL (Redis 6+)

For multi-tenant or multi-service setups, create per-service ACLs:

```bash
redis-cli -a your_redis_password
```

```
ACL SETUSER appuser on >app_password ~app:* &* +@read +@write +@string +@hash +@list +@set
ACL SAVE
```

---

## 6. ClickHouse

### 6.1 Install

```bash
sudo apt install -y apt-transport-https ca-certificates
curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] \
  https://packages.clickhouse.com/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/clickhouse.list

sudo apt update
sudo apt install -y clickhouse-server clickhouse-client
sudo systemctl enable --now clickhouse-server
```

### 6.2 Secure ClickHouse

```bash
sudo nano /etc/clickhouse-server/users.xml
```

Change the default user password and disable passwordless access:

```xml
<users>
  <default>
    <password_sha256_hex>YOUR_SHA256_HASH</password_sha256_hex>
    <networks>
      <ip>::1</ip>
      <ip>127.0.0.1</ip>
    </networks>
    <profile>default</profile>
    <quota>default</quota>
  </default>
</users>
```

Generate the hash:

```bash
echo -n "your_clickhouse_password" | sha256sum | tr -d ' -'
```

Edit `/etc/clickhouse-server/config.xml` to bind only localhost:

```xml
<listen_host>127.0.0.1</listen_host>
```

```bash
sudo systemctl restart clickhouse-server
clickhouse-client --password your_clickhouse_password
```

### 6.3 Create analytics schema

```sql
CREATE DATABASE analytics;

CREATE TABLE analytics.events (
    event_id   UUID DEFAULT generateUUIDv4(),
    user_id    UInt64,
    event_name LowCardinality(String),
    properties String,          -- JSON blob
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_name, created_at, user_id)
TTL created_at + INTERVAL 1 YEAR;
```

### 6.4 Useful ClickHouse extensions / table engines

| Engine                 | Use case                             |
| ---------------------- | ------------------------------------ |
| `MergeTree`            | Default OLAP; time-series, events    |
| `ReplacingMergeTree`   | Upsert-like deduplication            |
| `SummingMergeTree`     | Pre-aggregated counters              |
| `AggregatingMergeTree` | Materialized aggregations            |
| `Kafka`                | Stream ingest directly from Kafka    |
| `PostgreSQL`           | Read Postgres tables from CH queries |

Enable the Postgres engine (to join CH with PG data):

```sql
CREATE TABLE pg_users ENGINE = PostgreSQL(
  '127.0.0.1:5432', 'appdb', 'users', 'appuser', 'strong_random_password'
);
```

---

## 7. Node.js API

### 7.1 Install Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22
```

### 7.2 Install PM2

```bash
npm install -g pm2
```

### 7.3 Deploy app

```bash
mkdir -p /home/deploy/apps/api
cd /home/deploy/apps/api
# Copy your built app or git clone here
```

Create `ecosystem.config.js`:

```js
module.exports = {
	apps: [
		{
			name: 'api',
			script: './dist/server.js',
			instances: 'max',
			exec_mode: 'cluster',
			env: {
				NODE_ENV: 'production',
				PORT: 3001,
				DATABASE_URL: 'postgresql://appuser:strong_random_password@127.0.0.1:5432/appdb',
				REDIS_URL: 'redis://:your_redis_password@127.0.0.1:6379'
			},
			error_file: '/var/log/deploy/api-error.log',
			out_file: '/var/log/deploy/api-out.log',
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
			max_memory_restart: '512M'
		}
	]
};
```

```bash
sudo mkdir -p /var/log/deploy
sudo chown deploy:deploy /var/log/deploy

pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow the printed command to enable on reboot
```

### 7.4 Environment secrets

Never put secrets in `ecosystem.config.js` in source control. Use a `.env` file:

```bash
nano /home/deploy/apps/api/.env
chmod 600 /home/deploy/apps/api/.env
```

Load it in the app with `dotenv` or set `env_file` in PM2. Alternatively, use systemd `EnvironmentFile=` (see Go section below).

---

## 8. Go Binary Service

### 8.1 Install Go

```bash
GO_VERSION=1.23.4
curl -LO https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
go version
```

### 8.2 Build and deploy

```bash
# On your dev machine
GOOS=linux GOARCH=amd64 go build -o bin/service ./cmd/service
scp -P 2222 bin/service deploy@YOUR_SERVER_IP:/home/deploy/apps/go/service
```

### 8.3 systemd unit

```bash
sudo nano /etc/systemd/system/go-service.service
```

```ini
[Unit]
Description=Go API Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/apps/go
ExecStart=/home/deploy/apps/go/service
Restart=always
RestartSec=5

EnvironmentFile=/home/deploy/apps/go/.env

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/log/deploy

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

StandardOutput=journal
StandardError=journal
SyslogIdentifier=go-service

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now go-service
sudo systemctl status go-service
journalctl -u go-service -f
```

---

## 9. React SPA

### 9.1 Build

```bash
# On dev machine
npm run build          # outputs to dist/
scp -P 2222 -r dist/ deploy@YOUR_SERVER_IP:/home/deploy/apps/web/
```

Or build on server:

```bash
cd /home/deploy/apps/web
npm ci
npm run build
```

### 9.2 Nginx static serving

```bash
sudo mkdir -p /var/www/app
sudo cp -r /home/deploy/apps/web/dist/* /var/www/app/
sudo chown -R www-data:www-data /var/www/app
```

---

## 10. Nginx + TLS

### 10.1 Install

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 10.2 Site config

```bash
sudo nano /etc/nginx/sites-available/app
```

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # TLS — filled by Certbot
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    "nosniff"       always;
    add_header X-Frame-Options           "SAMEORIGIN"    always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), microphone=()" always;
    add_header Content-Security-Policy   "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;

    # Logs
    access_log /var/log/nginx/app_access.log combined;
    error_log  /var/log/nginx/app_error.log warn;

    # React SPA — serve index.html for all routes
    location / {
        root  /var/www/app;
        index index.html;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2|ico)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Node.js API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Go service proxy
    location /internal/ {
        proxy_pass         http://127.0.0.1:3002/;
        proxy_http_version 1.1;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
    limit_req zone=api burst=50 nodelay;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 10.3 TLS with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Auto-renewal is handled by a systemd timer — confirm:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 11. Security Hardening

### 11.1 System-level

```bash
# Disable unused services
sudo systemctl disable avahi-daemon cups bluetooth 2>/dev/null || true

# Kernel hardening via sysctl
sudo nano /etc/sysctl.d/99-security.conf
```

```
# IP spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# No source routing
net.ipv4.conf.all.accept_source_route = 0

# SYN flood protection
net.ipv4.tcp_syncookies = 1

# Disable IPv6 if unused
net.ipv6.conf.all.disable_ipv6 = 1

# Restrict core dumps
fs.suid_dumpable = 0

# Restrict dmesg to root
kernel.dmesg_restrict = 1
```

```bash
sudo sysctl -p /etc/sysctl.d/99-security.conf
```

### 11.2 Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

```bash
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

Enable:

```
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "your@email.com";
```

### 11.3 AppArmor

Ubuntu ships with AppArmor enabled. Confirm:

```bash
sudo aa-status
```

Nginx and other services have profiles. Enforce them:

```bash
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx
```

### 11.4 Secrets management

For small teams, store secrets in `/etc/secrets/` with tight permissions:

```bash
sudo mkdir -p /etc/secrets
sudo chmod 700 /etc/secrets
sudo nano /etc/secrets/app.env
sudo chmod 600 /etc/secrets/app.env
```

Reference in systemd units via `EnvironmentFile=/etc/secrets/app.env`.

For larger teams, consider **HashiCorp Vault** or **Infisical** (self-hosted).

### 11.5 File permissions audit

```bash
# World-writable files (should be empty or minimal)
find / -xdev -perm -0002 -type f 2>/dev/null

# SUID/SGID binaries
find / -xdev \( -perm -4000 -o -perm -2000 \) -type f 2>/dev/null
```

---

## 12. Logging

### 12.1 journald configuration

```bash
sudo nano /etc/systemd/journald.conf
```

```
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=2G
SystemKeepFree=500M
MaxRetentionSec=1month
ForwardToSyslog=no
```

```bash
sudo systemctl restart systemd-journald
```

### 12.2 Nginx log rotation

Nginx logs rotate automatically via `/etc/logrotate.d/nginx`. Verify:

```bash
cat /etc/logrotate.d/nginx
```

Add structured JSON logging for easier parsing:

```nginx
log_format json_combined escape=json
  '{'
  '"time":"$time_iso8601",'
  '"remote_addr":"$remote_addr",'
  '"method":"$request_method",'
  '"uri":"$request_uri",'
  '"status":$status,'
  '"bytes_sent":$bytes_sent,'
  '"request_time":$request_time,'
  '"referer":"$http_referer",'
  '"user_agent":"$http_user_agent"'
  '}';

access_log /var/log/nginx/app_access.log json_combined;
```

### 12.3 Centralized logs with Vector + ClickHouse

**Vector** is a high-performance log pipeline agent. Install:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://sh.vector.dev | bash
```

Create `/etc/vector/vector.yaml`:

```yaml
sources:
  journald:
    type: journald
    include_units:
      - go-service
      - nginx
      - postgresql

  nginx_access:
    type: file
    include:
      - /var/log/nginx/app_access.log
    data_dir: /var/lib/vector

transforms:
  parse_nginx:
    type: remap
    inputs: [nginx_access]
    source: |
      . = parse_json!(.message)
      .source = "nginx"

  parse_journald:
    type: remap
    inputs: [journald]
    source: |
      .source = .unit
      .level  = .PRIORITY

sinks:
  clickhouse_logs:
    type: clickhouse
    inputs: [parse_nginx, parse_journald]
    endpoint: http://127.0.0.1:8123
    database: analytics
    table: logs
    auth:
      strategy: basic
      user: default
      password: your_clickhouse_password
    encoding:
      timestamp_format: unix
    compression: gzip
```

Create the ClickHouse logs table:

```sql
CREATE TABLE analytics.logs (
    timestamp   DateTime,
    source      LowCardinality(String),
    level       LowCardinality(String),
    message     String,
    fields      String    -- JSON
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (source, timestamp)
TTL timestamp + INTERVAL 90 DAY;
```

```bash
sudo systemctl enable --now vector
```

Now query logs directly from ClickHouse:

```sql
SELECT timestamp, source, message
FROM analytics.logs
WHERE source = 'nginx' AND timestamp > now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC
LIMIT 100;
```

### 12.4 Application logging best practices

**Node.js** — use `pino` for structured JSON logs:

```js
import pino from 'pino';

const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	timestamp: pino.stdTimeFunctions.isoTime,
	redact: ['req.headers.authorization', 'body.password']
});

export default logger;
```

**Go** — use `log/slog` (stdlib, Go 1.21+):

```go
import "log/slog"

logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
slog.SetDefault(logger)

slog.Info("request handled",
    "method", r.Method,
    "path",   r.URL.Path,
    "status", status,
    "latency", duration,
)
```

---

## 13. Monitoring (optional but recommended)

### 13.1 Prometheus + node_exporter

```bash
# node_exporter — system metrics
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar xzf node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter
```

Create `/etc/systemd/system/node_exporter.service`:

```ini
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter
Restart=always
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now node_exporter
# Metrics available at http://127.0.0.1:9100/metrics
```

Add Postgres exporter, Redis exporter similarly. Bind all exporters to `127.0.0.1`.

### 13.2 Grafana

```bash
sudo apt install -y apt-transport-https software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/grafana-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/grafana-keyring.gpg] https://packages.grafana.com/oss/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt update && sudo apt install -y grafana
sudo systemctl enable --now grafana-server
```

Grafana listens on port 3000. Proxy it through Nginx (same pattern as the API above), then add ClickHouse as a data source using the [grafana-clickhouse-datasource](https://github.com/grafana/clickhouse-datasource) plugin.

---

## 14. Deployment Workflow

A minimal zero-downtime deploy script for the Go service:

```bash
#!/usr/bin/env bash
# deploy.sh
set -euo pipefail

APP_DIR=/home/deploy/apps/go
BINARY=service

echo "Building..."
GOOS=linux GOARCH=amd64 go build -o bin/${BINARY} ./cmd/${BINARY}

echo "Uploading..."
scp -P 2222 bin/${BINARY} deploy@YOUR_SERVER_IP:${APP_DIR}/${BINARY}.new

echo "Swapping..."
ssh -p 2222 deploy@YOUR_SERVER_IP "
  mv ${APP_DIR}/${BINARY}.new ${APP_DIR}/${BINARY}
  sudo systemctl restart go-service
  systemctl is-active go-service
"
echo "Done."
```

For Node.js with PM2:

```bash
pm2 reload ecosystem.config.js --update-env
```

PM2 reload is zero-downtime — it restarts workers one at a time.

---

## 15. Checklist Summary

Before calling this production-ready:

- [ ] SSH on non-default port, root login disabled, key-only auth
- [ ] UFW enabled with minimal open ports
- [ ] Fail2ban active on SSH
- [ ] All services (PG, Redis, ClickHouse) bound to 127.0.0.1 only
- [ ] Postgres using `scram-sha-256`, no trust auth
- [ ] Redis `requirepass` set, dangerous commands renamed
- [ ] ClickHouse password set, remote access disabled
- [ ] TLS certificate issued and auto-renewing
- [ ] Security headers on Nginx (HSTS, CSP, X-Frame-Options)
- [ ] Secrets in `EnvironmentFile`, not in code or PM2 config
- [ ] Unattended security upgrades enabled
- [ ] Kernel hardening sysctl applied
- [ ] Application logs structured (JSON) and shipping to ClickHouse
- [ ] Backups scheduled and tested
- [ ] node_exporter + Grafana dashboard live
- [ ] Rate limiting on API endpoints
- [ ] Redpanda topics created, retention set
- [ ] NATS JetStream streams defined
- [ ] Garage layout applied, buckets created, admin key rotated
- [ ] Typesense collection schema created, search-only key issued
- [ ] OpenTelemetry collector shipping to backend

---

## 16. Redpanda (Kafka-Compatible Streaming)

Redpanda is a drop-in Kafka replacement written in C++. No JVM, no ZooKeeper, single binary, dramatically simpler to operate on a VPS.

### 16.1 Install

```bash
curl -1sLf 'https://dl.redpanda.com/nzc4ZYQK3WRGd9sy/redpanda/cfg/setup/bash.deb.sh' \
  | sudo -E bash
sudo apt install -y redpanda
sudo systemctl enable --now redpanda
```

### 16.2 Configure

```bash
sudo nano /etc/redpanda/redpanda.yaml
```

Key settings for a single-node VPS:

```yaml
redpanda:
  data_directory: /var/lib/redpanda/data
  seed_servers: []
  rpc_server:
    address: 127.0.0.1
    port: 33145
  kafka_api:
    - address: 127.0.0.1
      port: 9092
  admin:
    - address: 127.0.0.1
      port: 9644
  developer_mode: false
  auto_create_topics_enabled: false # explicit topic creation only
```

```bash
sudo systemctl restart redpanda
rpk cluster info
```

### 16.3 Create topics

```bash
# rpk is the Redpanda CLI
rpk topic create orders --partitions 6 --replicas 1
rpk topic create events --partitions 12 --replicas 1
rpk topic create dlq    --partitions 3  --replicas 1

# Set retention (7 days by bytes and time)
rpk topic alter-config orders \
  --set retention.ms=604800000 \
  --set retention.bytes=1073741824
```

### 16.4 ACL / security

Enable SASL authentication:

```yaml
redpanda:
  kafka_api:
    - address: 127.0.0.1
      port: 9092
      authentication_method: sasl
  sasl_mechanisms:
    - SCRAM-SHA-256

rpk:
  kafka_api:
    sasl:
      user: admin
      password: strong_password
      mechanism: SCRAM-SHA-256
```

```bash
rpk acl user create app-producer --password app_pass --mechanism SCRAM-SHA-256
rpk acl create --allow-principal app-producer \
  --operation write --topic orders
```

### 16.5 Produce and consume — Node.js

```bash
npm install kafkajs
```

```js
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
	clientId: 'my-app',
	brokers: ['127.0.0.1:9092'],
	sasl: { mechanism: 'scram-sha-256', username: 'app-producer', password: 'app_pass' }
});

const producer = kafka.producer();
await producer.connect();
await producer.send({
	topic: 'orders',
	messages: [{ key: orderId, value: JSON.stringify(order) }]
});
await producer.disconnect();
```

Consumer:

```js
const consumer = kafka.consumer({ groupId: 'order-processor' });
await consumer.connect();
await consumer.subscribe({ topic: 'orders', fromBeginning: false });
await consumer.run({
	eachMessage: async ({ message }) => {
		const order = JSON.parse(message.value.toString());
		await processOrder(order);
	}
});
```

### 16.6 Produce and consume — Go

```bash
go get github.com/twmb/franz-go/pkg/kgo
```

```go
import "github.com/twmb/franz-go/pkg/kgo"

cl, _ := kgo.NewClient(
    kgo.SeedBrokers("127.0.0.1:9092"),
    kgo.SASL(scram.Auth{User: "app-producer", Pass: "app_pass"}.AsSha256Mechanism()),
)
defer cl.Close()

// Produce
cl.Produce(ctx, &kgo.Record{
    Topic: "orders",
    Key:   []byte(orderID),
    Value: payload,
}, nil)

// Consume
cl.AddConsumeTopics("orders")
for {
    fetches := cl.PollFetches(ctx)
    fetches.EachRecord(func(r *kgo.Record) {
        handleOrder(r.Value)
    })
}
```

### 16.7 Redpanda Console (optional UI)

```bash
sudo apt install -y redpanda-console
sudo nano /etc/redpanda-console/config.yaml
```

```yaml
kafka:
  brokers: ['127.0.0.1:9092']
  sasl:
    enabled: true
    username: admin
    password: strong_password
    mechanism: SCRAM-SHA-256
server:
  listenPort: 8080
  listenAddress: 127.0.0.1
```

Proxy through Nginx at `/console/` (internal access only, or behind auth).

---

## 17. NATS (Pub/Sub + Job Queue + KV Store)

NATS covers lightweight pub/sub, request/reply, and — with JetStream — durable streams and a key/value store. Use it when Redpanda feels heavy, or for inter-service RPC.

### 17.1 Install

```bash
# Download latest release
NATS_VERSION=2.10.18
wget https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-linux-amd64.zip
unzip nats-server-v${NATS_VERSION}-linux-amd64.zip
sudo mv nats-server-v${NATS_VERSION}-linux-amd64/nats-server /usr/local/bin/
nats-server --version
```

### 17.2 Configure

```bash
sudo mkdir -p /etc/nats /var/lib/nats
sudo useradd -rs /bin/false nats
sudo nano /etc/nats/server.conf
```

```
port: 4222
host: "127.0.0.1"
http_port: 8222           # monitoring (localhost only)

authorization {
  token: "your_nats_token"
}

jetstream {
  store_dir: "/var/lib/nats/jetstream"
  max_memory_store: 512M
  max_file_store:   10G
}
```

Create `/etc/systemd/system/nats.service`:

```ini
[Unit]
Description=NATS Server
After=network.target

[Service]
User=nats
ExecStart=/usr/local/bin/nats-server -c /etc/nats/server.conf
Restart=always
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R nats:nats /var/lib/nats
sudo systemctl daemon-reload
sudo systemctl enable --now nats
```

### 17.3 Create JetStream streams

Install the `nats` CLI:

```bash
go install github.com/nats-io/natscli/nats@latest
# or download binary from https://github.com/nats-io/natscli/releases
```

```bash
# Connect with token
nats context save local --server nats://127.0.0.1:4222 --token your_nats_token
nats context select local

# Create a stream
nats stream add JOBS \
  --subjects "jobs.>" \
  --storage file \
  --retention work \
  --max-age 7d \
  --discard old \
  --replicas 1

# Create a consumer (pull-based worker)
nats consumer add JOBS worker \
  --pull \
  --deliver all \
  --ack explicit \
  --max-deliver 3 \
  --backoff linear
```

### 17.4 Publish and consume — Node.js

```bash
npm install nats
```

```js
import { connect, StringCodec } from 'nats';

const nc = await connect({ servers: '127.0.0.1:4222', token: 'your_nats_token' });
const sc = StringCodec();
const js = nc.jetstream();

// Publish to stream
await js.publish('jobs.email', sc.encode(JSON.stringify({ to: 'user@example.com' })));

// Worker consume
const consumer = await js.consumers.get('JOBS', 'worker');
const messages = await consumer.consume();
for await (const msg of messages) {
	await processJob(JSON.parse(sc.decode(msg.data)));
	msg.ack();
}
```

### 17.5 KV store

NATS JetStream includes a distributed key/value store — useful for feature flags, distributed locks, and config:

```bash
nats kv add CONFIG --history 5 --ttl 1h
nats kv put CONFIG feature.dark_mode true
nats kv get CONFIG feature.dark_mode
```

```js
const kv = await js.views.kv('CONFIG');
await kv.put('feature.dark_mode', sc.encode('true'));
const entry = await kv.get('feature.dark_mode');
```

---

## 18. Garage (S3-Compatible Object Storage)

> **Why not MinIO?** MinIO re-licensed to AGPLv3 in 2021, making it incompatible with most commercial products without a paid license. It is also cluster-oriented — its single-node mode is unsupported in production. **Garage** is MIT licensed, written in Rust, explicitly designed for small/single-node deployments, and exposes an identical S3 API so every SDK that works against AWS S3 works unchanged.

Garage stores files, images, backups, and any blob. Your application code stays AWS-S3-compatible — swap the endpoint URL to move to real S3 or Cloudflare R2 later.

### 18.1 Install

```bash
GARAGE_VERSION=1.0.1
wget https://garagehq.deuxfleurs.fr/_releases/v${GARAGE_VERSION}/x86_64-unknown-linux-musl/garage
chmod +x garage
sudo mv garage /usr/local/bin/

sudo useradd -rs /bin/false garage
sudo mkdir -p /var/lib/garage/meta /var/lib/garage/data
sudo chown -R garage:garage /var/lib/garage
```

### 18.2 Configure

```bash
sudo mkdir -p /etc/garage
sudo nano /etc/garage/garage.toml
```

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "lmdb"

replication_factor = 1          # single node

[s3_api]
s3_region = "garage"            # arbitrary, must match in SDK
api_bind_addr = "127.0.0.1:3900"
root_domain = ".s3.local"

[s3_web]
bind_addr = "127.0.0.1:3902"
root_domain = ".web.garage"
index = "index.html"

[admin]
api_bind_addr = "127.0.0.1:3903"
```

Create `/etc/systemd/system/garage.service`:

```ini
[Unit]
Description=Garage S3-Compatible Object Store
After=network.target

[Service]
User=garage
ExecStart=/usr/local/bin/garage -c /etc/garage/garage.toml server
Restart=always
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now garage
```

### 18.3 Bootstrap the cluster (single node)

```bash
# Get the local node ID
garage -c /etc/garage/garage.toml status

# Apply layout (capacity in GB)
NODE_ID=$(garage -c /etc/garage/garage.toml status | awk '/UNCONFIGURED/{print $1}')
garage -c /etc/garage/garage.toml layout assign \
  -z dc1 -c 100G ${NODE_ID}
garage -c /etc/garage/garage.toml layout apply --version 1
garage -c /etc/garage/garage.toml status
```

### 18.4 Create keys and buckets

```bash
# Create an access key
garage -c /etc/garage/garage.toml key create app-key
# Outputs: Key ID + Secret Key — save these

KEY_ID=<your_key_id>

# Create buckets
garage -c /etc/garage/garage.toml bucket create uploads
garage -c /etc/garage/garage.toml bucket create backups
garage -c /etc/garage/garage.toml bucket create avatars

# Grant access
garage -c /etc/garage/garage.toml bucket allow uploads \
  --read --write --owner --key ${KEY_ID}
garage -c /etc/garage/garage.toml bucket allow backups \
  --read --write --owner --key ${KEY_ID}
garage -c /etc/garage/garage.toml bucket allow avatars \
  --read --write --owner --key ${KEY_ID}

# Public-read for avatars (static files via web endpoint)
garage -c /etc/garage/garage.toml bucket website --allow avatars
```

### 18.5 Use from Node.js

The AWS S3 SDK works unchanged — only the endpoint and region differ:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
	endpoint: 'http://127.0.0.1:3900',
	region: 'garage', // must match garage.toml s3_region
	credentials: { accessKeyId: 'GK...', secretAccessKey: '...' },
	forcePathStyle: true // required for path-style S3
});

// Upload
await s3.send(
	new PutObjectCommand({
		Bucket: 'uploads',
		Key: `users/${userId}/${filename}`,
		Body: fileBuffer,
		ContentType: 'image/jpeg'
	})
);

// Pre-signed URL (expiry 1 hour)
const url = await getSignedUrl(
	s3,
	new GetObjectCommand({
		Bucket: 'uploads',
		Key: `users/${userId}/${filename}`
	}),
	{ expiresIn: 3600 }
);
```

### 18.6 Use from Go

```bash
go get github.com/aws/aws-sdk-go-v2/service/s3
```

```go
import (
    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/config"
    "github.com/aws/aws-sdk-go-v2/credentials"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

cfg, _ := config.LoadDefaultConfig(ctx,
    config.WithRegion("garage"),
    config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
        "GK...", "secret...", "",
    )),
    config.WithEndpointResolverWithOptions(
        aws.EndpointResolverWithOptionsFunc(func(service, region string, opts ...interface{}) (aws.Endpoint, error) {
            return aws.Endpoint{URL: "http://127.0.0.1:3900", HostnameImmutable: true}, nil
        }),
    ),
)

client := s3.NewFromConfig(cfg, func(o *s3.Options) { o.UsePathStyle = true })

// Upload
_, err := client.PutObject(ctx, &s3.PutObjectInput{
    Bucket:      aws.String("uploads"),
    Key:         aws.String(fmt.Sprintf("users/%s/%s", userID, filename)),
    Body:        reader,
    ContentType: aws.String("image/jpeg"),
})
```

### 18.7 Backup Postgres to Garage

```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%Y%m%d_%H%M%S)
TMPFILE=$(mktemp)

PGPASSWORD="strong_random_password" pg_dump \
  -h 127.0.0.1 -U appuser appdb | gzip > "$TMPFILE"

AWS_ACCESS_KEY_ID=GK... \
AWS_SECRET_ACCESS_KEY=secret... \
aws s3 cp "$TMPFILE" "s3://backups/postgres/appdb_${DATE}.sql.gz" \
  --endpoint-url http://127.0.0.1:3900 \
  --region garage

rm "$TMPFILE"

# Prune backups older than 30 days
aws s3 ls s3://backups/postgres/ \
  --endpoint-url http://127.0.0.1:3900 --region garage \
  | awk '{print $4}' \
  | while read key; do
      ts=$(echo "$key" | grep -oP '\d{8}')
      [ "$(date -d "$ts" +%s 2>/dev/null)" -lt "$(date -d '30 days ago' +%s)" ] \
        && aws s3 rm "s3://backups/postgres/$key" \
             --endpoint-url http://127.0.0.1:3900 --region garage
    done
```

---

## 19. Typesense (Full-Text Search)

Typesense is a fast, typo-tolerant search engine written in C++. It beats Elasticsearch on RAM, starts in under a second, and has a simpler API than both Elasticsearch and Meilisearch. Add it when Postgres `tsvector` / `ILIKE` queries become a bottleneck or you need ranking, facets, and highlighting.

### 19.1 Install

```bash
TYPESENSE_VERSION=27.1
wget https://dl.typesense.org/releases/${TYPESENSE_VERSION}/typesense-server-${TYPESENSE_VERSION}-amd64.deb
sudo dpkg -i typesense-server-${TYPESENSE_VERSION}-amd64.deb
```

The package installs a systemd service and creates `/etc/typesense/typesense-server.ini`.

### 19.2 Configure

```bash
sudo nano /etc/typesense/typesense-server.ini
```

```ini
[server]
api-address    = 127.0.0.1
api-port       = 8108
data-dir       = /var/lib/typesense
api-key        = your_admin_api_key      # change this
log-dir        = /var/log/typesense
enable-cors    = false
```

```bash
sudo systemctl enable --now typesense-server
curl -s http://127.0.0.1:8108/health   # → {"ok":true}
```

### 19.3 Create collection and schema

Typesense uses **collections** (equivalent to indexes). Define the schema upfront:

```bash
curl -X POST 'http://127.0.0.1:8108/collections' \
  -H 'X-TYPESENSE-API-KEY: your_admin_api_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "products",
    "fields": [
      {"name": "id",          "type": "string"},
      {"name": "name",        "type": "string"},
      {"name": "description", "type": "string"},
      {"name": "tags",        "type": "string[]", "facet": true},
      {"name": "category",    "type": "string",   "facet": true},
      {"name": "price",       "type": "float",    "sort":  true},
      {"name": "in_stock",    "type": "bool",     "facet": true},
      {"name": "created_at",  "type": "int64",    "sort":  true}
    ],
    "default_sorting_field": "created_at"
  }'
```

### 19.4 Scoped API keys

Create a search-only key scoped to specific collections. Never ship the admin key to clients:

```bash
curl -X POST 'http://127.0.0.1:8108/keys' \
  -H 'X-TYPESENSE-API-KEY: your_admin_api_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "description": "Search-only key for frontend",
    "actions": ["documents:search"],
    "collections": ["products"]
  }'
```

For server-to-server use (indexing), create a write key scoped to specific collections and actions.

### 19.5 Use from Node.js

```bash
npm install typesense
```

```js
import Typesense from 'typesense';

const client = new Typesense.Client({
	nodes: [{ host: '127.0.0.1', port: 8108, protocol: 'http' }],
	apiKey: 'your_admin_api_key', // use search-only key on frontend
	connectionTimeoutSeconds: 2
});

// Index documents
await client.collections('products').documents().import(products, { action: 'upsert' });

// Search
const results = await client.collections('products').documents().search({
	q: 'wireless headphones',
	query_by: 'name,description,tags',
	filter_by: 'category:=electronics && in_stock:=true',
	sort_by: 'price:asc',
	facet_by: 'category,tags',
	per_page: 20,
	typo_tokens_threshold: 1
});
```

### 19.6 Use from Go

```bash
go get github.com/typesense/typesense-go/v3
```

```go
import (
    "github.com/typesense/typesense-go/v3/typesense"
    "github.com/typesense/typesense-go/v3/typesense/api"
)

client := typesense.NewClient(
    typesense.WithServer("http://127.0.0.1:8108"),
    typesense.WithAPIKey("your_admin_api_key"),
)

// Upsert document
_, err := client.Collection("products").Documents().Upsert(ctx, &ProductDoc{
    ID:       product.ID,
    Name:     product.Name,
    Price:    product.Price,
    Category: product.Category,
    InStock:  product.InStock,
})

// Search
params := &api.SearchCollectionParams{
    Q:          "wireless headphones",
    QueryBy:    "name,description",
    FilterBy:   typesense.String("category:=electronics"),
    SortBy:     typesense.String("price:asc"),
    PerPage:    typesense.Int(20),
}
results, err := client.Collection("products").Documents().Search(ctx, params)
```

### 19.7 Keep index in sync with Postgres

**Simple pattern** — write to Postgres first, then upsert to Typesense in the same request handler:

```js
await db.query('INSERT INTO products ...', values);
await client.collections('products').documents().upsert({ id, name, description, category, price });
```

**Robust pattern** — publish a Redpanda event on every write; a dedicated indexer service consumes it and calls Typesense. Decoupled, retryable, no blocking the API path.

**Bulk re-index** from Postgres:

```js
const { rows } = await db.query(
	'SELECT id, name, description, category, price, in_stock FROM products'
);
// Typesense import accepts up to 40 docs/batch by default; chunking is handled internally
await client.collections('products').documents().import(rows, { action: 'upsert' });
```

---

## 20. OpenTelemetry (Traces + Metrics)

OpenTelemetry is vendor-neutral instrumentation. Traces show you exactly where time is spent across services; metrics give you RED (Rate, Errors, Duration) dashboards.

### 20.1 OTel Collector

The collector receives spans/metrics from your apps and fans them out to backends (Prometheus, Grafana Tempo, Jaeger, or a cloud provider).

```bash
wget https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.105.0/otelcol-contrib_0.105.0_linux_amd64.deb
sudo dpkg -i otelcol-contrib_0.105.0_linux_amd64.deb
sudo systemctl enable otelcol-contrib
```

```bash
sudo nano /etc/otelcol-contrib/config.yaml
```

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 127.0.0.1:4317
      http:
        endpoint: 127.0.0.1:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    limit_mib: 256

exporters:
  prometheus:
    endpoint: '127.0.0.1:8889' # scrape this from Prometheus
  debug:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

```bash
sudo systemctl restart otelcol-contrib
```

### 20.2 Instrument Node.js

```bash
npm install @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-trace-otlp-http \
            @opentelemetry/exporter-metrics-otlp-http
```

Create `instrumentation.js` — loaded **before** your app:

```js
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
	serviceName: 'api',
	traceExporter: new OTLPTraceExporter({ url: 'http://127.0.0.1:4318/v1/traces' }),
	metricReader: new PeriodicExportingMetricReader({
		exporter: new OTLPMetricExporter({ url: 'http://127.0.0.1:4318/v1/metrics' }),
		exportIntervalMillis: 15_000
	}),
	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-fs': { enabled: false } // too noisy
		})
	]
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

Start your app with:

```bash
node --import ./instrumentation.js dist/server.js
```

This auto-instruments HTTP, Express/Fastify, Postgres (`pg`), Redis (`ioredis`), Kafka (`kafkajs`) — all without code changes.

### 20.3 Instrument Go

```bash
go get go.opentelemetry.io/otel \
       go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc \
       go.opentelemetry.io/otel/sdk/trace \
       go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp
```

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func initTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
    exp, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("127.0.0.1:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exp),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceName("go-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}

// Wrap your HTTP mux
mux := http.NewServeMux()
mux.HandleFunc("/health", healthHandler)
http.ListenAndServe(":3002", otelhttp.NewHandler(mux, "go-service"))
```

Add a custom span:

```go
tracer := otel.Tracer("go-service")
ctx, span := tracer.Start(ctx, "processOrder")
defer span.End()

span.SetAttributes(attribute.String("order.id", orderID))
```

### 20.4 Add Grafana Tempo for trace storage (optional)

```bash
wget https://github.com/grafana/tempo/releases/download/v2.5.0/tempo_2.5.0_linux_amd64.deb
sudo dpkg -i tempo_2.5.0_linux_amd64.deb
sudo systemctl enable --now tempo
```

Update the OTel collector to export traces to Tempo instead of (or in addition to) `debug`:

```yaml
exporters:
  otlp/tempo:
    endpoint: '127.0.0.1:4317'
    tls:
      insecure: true

service:
  pipelines:
    traces:
      exporters: [otlp/tempo]
```

Add Tempo as a data source in Grafana (URL: `http://127.0.0.1:3200`). You can now jump from a slow API log line to its full distributed trace in one click.

---

## 21. Service Communication Patterns

With all these services running, here's how they fit together:

<Mermaid
title="Service communication — Nginx fronts everything"
code={`graph TD
  B["Browser"] --> N["Nginx :443"]
  N --> SPA["React SPA"]
  N -->|"/api/*"| API["Node.js :3001"]
  N -->|"/internal/*"| GO["Go :3002"]
  API --> PG["Postgres"]
  API --> RD["Redis"]
  API --> GA["Garage"]
  API --> TS["Typesense"]
  API --> RP["Redpanda"]
  GO --> PG
  GO --> CH["ClickHouse"]
  GO --> RP
  GO --> NA["NATS"]
  NA --> WK["Workers<br/>email · image · search index"]`}
/>

**Key rules:**

- Every service binds to `127.0.0.1`. Nginx is the only public listener.
- Node.js handles user-facing API; Go handles heavy background workloads and analytics ingestion.
- Redpanda decouples producers from consumers — a slow consumer doesn't slow the API.
- NATS handles short-lived jobs (send email, webhook delivery); Redpanda handles durable event streams (audit log, analytics).
- ClickHouse is write-mostly from Go; query it from Grafana and internal dashboards, never from the user-facing API path.

---

## Further Reading

- [PostgreSQL 16 Release Notes](https://www.postgresql.org/docs/16/release-16.html)
- [Redis Security guide](https://redis.io/docs/management/security/)
- [ClickHouse Security guide](https://clickhouse.com/docs/en/operations/security-changelog)
- [Redpanda documentation](https://docs.redpanda.com/)
- [NATS JetStream documentation](https://docs.nats.io/nats-concepts/jetstream)
- [Garage documentation](https://garagehq.deuxfleurs.fr/documentation/)
- [Typesense documentation](https://typesense.org/docs/)
- [OpenTelemetry Node.js SDK](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry Go SDK](https://opentelemetry.io/docs/languages/go/)
- [Grafana Tempo documentation](https://grafana.com/docs/tempo/)
- [Vector documentation](https://vector.dev/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Lynis](https://cisofy.com/lynis/) — full system security audit tool
