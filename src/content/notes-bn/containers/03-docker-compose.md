---
title: 'Docker Compose'
subtitle: 'Multi-service লোকাল এনভায়রনমেন্ট, dependency ordering, networking, এবং যেসব প্যাটার্ন compose-কে আসলেই কাজের করে তোলে।'
chapter: 3
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['docker compose', 'networking', 'volumes', 'depends_on', 'environment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন stage manager-এর call sheet: একটা ডকুমেন্ট যা বলে দেয় শো শুরুর আগে কাকে কখন কোথায় থাকতে হবে — orchestra pit-এ, actor backstage-এ, light প্রস্তুত। Docker Compose হলো আপনার সার্ভিসগুলোর call sheet: একটা file, একটা command, সব অংশ ঠিক order-এ চালু হয়।

</Callout>

## Compose যে সমস্যা সমাধান করে

একটা আধুনিক অ্যাপ্লিকেশন লোকালি চালানো মানে সাধারণত চালু করা: আপনার API server, একটা database, একটা cache, একটা queue, হয়তো একটা worker process। এটা ম্যানুয়ালি করা মানে একাধিক টার্মিনাল উইন্ডো, ভঙ্গুর shell script, আর "works on my machine" ডিবাগিং।

Compose এই সবকিছু একটা declarative file-এ সংজ্ঞায়িত করে — `docker-compose.yml` — আর `docker compose up` দিয়ে সবকিছু চালু করে।

## একটা সম্পূর্ণ উদাহরণ

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

একটা Compose file-এর সব সার্ভিস একটা ডিফল্ট network শেয়ার করে। সার্ভিসগুলো একে অপরের কাছে সার্ভিস নাম দিয়ে পৌঁছায়:

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

**Isolation-এর জন্য custom network:**

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

## depends_on আর Startup Order

`depends_on` startup order নিয়ন্ত্রণ করে কিন্তু readiness নয় — একটা container "started" হয়েও এখনও connection নিতে না-ও পারে। সঠিক ordering-এর জন্য health check ব্যবহার করুন:

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

**Health check ছাড়া:** আপনার অ্যাপ চালু হয়, postgres-এ connect করার চেষ্টা করে, postgres এখনও initialize হচ্ছে বলে ব্যর্থ হয়, আর ক্র্যাশ করে। Health check থাকলে: postgres healthy রিপোর্ট না করা পর্যন্ত api অপেক্ষা করে।

## Environment Variable

Environment variable পাস করার তিনটা উপায়:

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

**Compose প্রজেক্ট ডিরেক্টরির `.env` স্বয়ংক্রিয়ভাবে লোড করে।** `.env`-এর variable-গুলো compose file-এ `${VAR}` হিসেবে পাওয়া যায় — কিন্তু সেগুলো compose configuration-এর জন্য, আপনি সুনির্দিষ্টভাবে রেফারেন্স না করলে সেগুলো স্বয়ংক্রিয়ভাবে container-এ পাস হয় না।

## Override File

Compose একাধিক file মার্জ করে — environment-specific config-এর জন্য এটা ব্যবহার করুন:

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

## কাজের প্যাটার্ন

**অ্যাপ চালু করার আগে database migration চালান:**

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

**একটা সার্ভিস scale করুন:**

```bash
docker compose up --scale worker=3
# Starts 3 worker containers, all pulling from the same queue
```

**File পরিবর্তন লক্ষ্য করে rebuild করুন:**

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

## Optional Service-এর জন্য Profiles

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

এটা ডিফল্ট compose startup-কে minimal রাখে আর একই সাথে optional সার্ভিস সহজে activate করতে দেয়।
