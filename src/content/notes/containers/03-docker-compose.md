---
title: 'Docker Compose'
subtitle: 'Multi-service local environments, dependency ordering, networking, and the patterns that make compose actually useful.'
chapter: 3
level: 'beginner'
readingTime: '10 min'
topics: ['docker compose', 'networking', 'volumes', 'depends_on', 'environment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A stage manager's call sheet: one document that says who needs to be where and when before the show can start — orchestra in pit, actors backstage, lights ready. Docker Compose is your call sheet for services: one file, one command, all the pieces start in the right order.

</Callout>

## The Problem Compose Solves

Running a modern application locally typically means starting: your API server, a database, a cache, a queue, maybe a worker process. Doing this manually means multiple terminal windows, fragile shell scripts, and "works on my machine" debugging.

Compose defines all of this in one declarative file — `docker-compose.yml` — and starts everything with `docker compose up`.

## A Complete Example

```yaml
# docker-compose.yml
services:
  api:
    build: . # build from local Dockerfile
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/mydb
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    volumes:
      - ./src:/app/src # mount source for hot reload
    depends_on:
      db:
        condition: service_healthy # wait for DB to be healthy, not just started
      redis:
        condition: service_started

  worker:
    build: .
    command: node dist/worker.js # override CMD from Dockerfile
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/mydb
      REDIS_URL: redis://redis:6379
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: mydb
    volumes:
      - pgdata:/var/lib/postgresql/data # persist across restarts
      - ./migrations:/docker-entrypoint-initdb.d # run on first start
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d mydb']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

```bash
# Start everything
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f api

# Run a one-off command (migrations)
docker compose run --rm api node dist/migrate.js

# Stop everything (keep volumes)
docker compose down

# Stop and remove volumes (reset state)
docker compose down -v
```

## Networking

All services in a Compose file share a default network. Services reach each other by service name:

```yaml
services:
  api:
    environment:
      # Use service name 'db', not 'localhost' — they're on the same Docker network
      DATABASE_URL: postgres://app:secret@db:5432/mydb
      #                                    ^^
      #                                    service name
```

```bash
# Inspect the network
docker network ls
# NETWORK ID   NAME               DRIVER
# abc123       myproject_default  bridge

# From inside the api container, 'db' resolves to the postgres container's IP
docker compose exec api ping db
# PING db (172.20.0.3): 56 data bytes
```

**Custom networks for isolation:**

```yaml
services:
  api:
    networks:
      - frontend
      - backend

  db:
    networks:
      - backend # not exposed to frontend services

  nginx:
    networks:
      - frontend # not connected to backend

networks:
  frontend:
  backend:
```

## depends_on and Startup Order

`depends_on` controls startup order but not readiness — a container can be "started" and not yet accepting connections. Use health checks for proper ordering:

```yaml
services:
  api:
    depends_on:
      db:
        condition: service_healthy # wait until healthcheck passes
      redis:
        condition: service_started # just wait for container to start

  db:
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s # grace period before failures count
```

**Without health checks:** your app starts, tries to connect to postgres, fails because postgres is still initializing, and crashes. With health checks: api waits until postgres reports healthy.

## Environment Variables

Three ways to pass environment variables:

```yaml
services:
  api:
    # Inline (fine for non-secrets)
    environment:
      NODE_ENV: development
      PORT: "3000"

    # From .env file (don't commit this file)
    env_file:
      - .env

    # Reference host environment
    environment:
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}    # from shell
      API_KEY: ${API_KEY:-default-value}          # with fallback
```

```bash
# .env file (gitignored)
DATABASE_URL=postgres://app:secret@db:5432/mydb
REDIS_URL=redis://redis:6379
JWT_SECRET=dev-secret-not-for-production
```

**Compose automatically loads `.env`** in the project directory. Variables in `.env` are available as `${VAR}` in the compose file — but they're for compose configuration, not automatically passed to containers unless you explicitly reference them.

## Override Files

Compose merges multiple files — use this for environment-specific config:

```yaml
# docker-compose.yml (base — committed)
services:
  api:
    image: myapp:latest
    ports:
      - "3000:3000"

# docker-compose.dev.yml (development — committed)
services:
  api:
    build: .             # override: build locally instead of pull
    volumes:
      - ./src:/app/src   # hot reload
    environment:
      NODE_ENV: development

# docker-compose.override.yml (auto-loaded in dev — often gitignored)
# Docker Compose automatically merges this with docker-compose.yml
```

```bash
# Development (auto-merges docker-compose.override.yml)
docker compose up

# Production (explicit files)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# CI (explicit)
docker compose -f docker-compose.yml -f docker-compose.ci.yml up --abort-on-container-exit
```

## Useful Patterns

**Run database migrations before starting the app:**

```yaml
services:
  migrate:
    build: .
    command: node dist/migrate.js
    depends_on:
      db:
        condition: service_healthy
    restart: 'no' # run once, don't restart

  api:
    build: .
    depends_on:
      migrate:
        condition: service_completed_successfully
      db:
        condition: service_healthy
```

**Scale a service:**

```bash
docker compose up --scale worker=3
# Starts 3 worker containers, all pulling from the same queue
```

**Watch for file changes and rebuild:**

```bash
# Docker Compose Watch (v2.22+)
docker compose watch
```

```yaml
services:
  api:
    build: .
    develop:
      watch:
        - action: sync # sync files without rebuild
          path: ./src
          target: /app/src
        - action: rebuild # rebuild on dependency changes
          path: package.json
```

## Profiles for Optional Services

```yaml
services:
  api:
    build: .

  db:
    image: postgres:16

  mailhog:
    image: mailhog/mailhog
    profiles: [dev] # only started when --profile dev is passed
    ports:
      - '8025:8025'

  adminer:
    image: adminer
    profiles: [dev, tools]
    ports:
      - '8080:8080'
```

```bash
# Start without optional dev tools
docker compose up

# Start with dev profile
docker compose --profile dev up
```

This keeps the default compose startup minimal while making optional services easy to activate.
