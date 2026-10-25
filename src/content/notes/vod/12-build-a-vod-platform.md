---
title: 'একটা ছোট VOD প্ল্যাটফর্ম বানানো'
subtitle: 'Go, PostgreSQL, River, Garage, ffmpeg আর nginx দিয়ে শুরু থেকে শেষ: ব্রাউজার থেকে সরাসরি আপলোড, কিউতে এনকোড জব, তিন ধাপের fMP4 HLS, ক্যাশ করা এজ, আর hls.js-এ প্লেব্যাক। প্রতিটা ফাইল এখানে আছে, আর পুরোটা আসলে চালিয়ে টেস্ট করা।'
chapter: 12
level: 'mastery'
readingTime: '৩৫ মিনিট'
topics: ['vod platform', 'go', 'chi', 'river', 'postgresql', 'garage', 's3', 'ffmpeg', 'hls', 'nginx', 'hls.js']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ফারাবি নীলক্ষেতে একটা খালি ঘর ভাড়া নিয়েছেন, ছাপা আর বাঁধাইয়ের দোকান দেবেন। ঘরে আছে শুধু চার দেয়াল আর একটা দরজা। প্রথম বই বের করতে হলে কী কী লাগবে, সেটা তিনি একটা কাগজে লিখলেন, আর একটা একটা করে জোগাড় করলেন।

প্রথমে পেছনের দেয়ালে একটা তাক, যেখানে কাস্টমারের দিয়ে যাওয়া পাণ্ডুলিপি রাখা হবে। তাকটা তালা দেওয়া, শুধু দোকানের লোক খুলতে পারে। কাস্টমার যেন কাউন্টারে লাইনে না দাঁড়িয়ে পাণ্ডুলিপি সরাসরি তাকে রেখে যেতে পারে, তাই ফারাবি একটা নিয়ম করলেন: কাউন্টার থেকে একটা সিল দেওয়া চিরকুট নিলে, সেই চিরকুট দেখিয়ে কাস্টমার এক ঘণ্টার মধ্যে নিজেই তাকের নির্দিষ্ট খোপে কাগজ রেখে আসতে পারবে। চিরকুটে লেখা থাকে কোন খোপ, আর সিলটা শুধু সামনের দরজার জন্য বৈধ; পেছনের দরজা দিয়ে ঢুকে একই চিরকুট দেখালে পাহারাদার মানে না।

তারপর একটা মোটা রেজিস্টার খাতা: প্রতিটা অর্ডারের একটা নম্বর আর অবস্থা, "পাণ্ডুলিপির অপেক্ষায়", "ছাপা হচ্ছে", "তৈরি", "বাতিল"। খাতার শেষের পাতাগুলো ফারাবি কাজের তালিকা হিসেবে রাখলেন। এখানে একটা নিয়ম তিনি খুব কড়া করলেন: অর্ডারের অবস্থা "ছাপা হচ্ছে" লেখা আর কাজের তালিকায় সেই অর্ডার তোলা, দুটো একই কলমে, একই বসায় হবে। নইলে কোনোদিন দেখা যাবে খাতায় লেখা "ছাপা হচ্ছে" কিন্তু তালিকায় কাজটাই নেই, আর সেই বই কেউ কোনোদিন ছাপবে না।

এরপর ছাপার মেশিন আর তার পাশে কারিগর রাজি। রাজি তালিকা থেকে একটা কাজ নেন, তাক থেকে পাণ্ডুলিপি নামান, আগে দেখে নেন সত্যিই পড়ার মতো কিছু আছে কিনা, তারপর তিন সাইজে ছাপেন: বড় হার্ডকভার, মাঝারি, আর ছোট পকেট সংস্করণ। পাণ্ডুলিপি যদি ছোট কাগজে লেখা হয়, তিনি সেটা টেনে বড় হার্ডকভার বানান না, কারণ তাতে অক্ষর ফেটে যায়। আর পাণ্ডুলিপির জায়গায় যদি কেউ খালি কাগজের বান্ডিল দিয়ে যায়, রাজি পাঁচবার চেষ্টা না করে প্রথমবারেই খাতায় লিখে দেন "বাতিল: ছাপার মতো কিছু নেই"।

শেষে সামনের কাচের জানালার পাশে একটা শোকেস, যেখানে তৈরি বই সাজানো থাকে। রাস্তার যে কেউ দেখতে পারে, কিন্তু শোকেস খুলে কিছু রাখা বা সরানো যায় না। কাউন্টারে বসেন ফাতিমা: চিরকুট দেন, কাস্টমারকে বলেন অর্ডার কোন অবস্থায়, আর বই তৈরি হলে বলেন শোকেসের কোন তাকে। ঘনঘন চাওয়া বইয়ের কয়েক কপি ফাতিমা কাউন্টারের পাশেই রাখেন, যাতে প্রতিবার শোকেস পর্যন্ত যেতে না হয়। প্রথম কাস্টমার ফেরত এসে নিজের বই হাতে নিলেন, আর ফারাবি বুঝলেন দোকানটা চলছে।

মিলিয়ে নিই: তালা দেওয়া পাণ্ডুলিপির তাক হলো **`uploads` বাকেট**, আর এক ঘণ্টার সিল দেওয়া চিরকুট হলো **presigned PUT URL**। "শুধু সামনের দরজায় বৈধ" মানে **signature-এ হোস্ট থাকে**, অন্য হোস্ট দিয়ে গেলে signature মেলে না। রেজিস্টার খাতা হলো **PostgreSQL-এর `assets` টেবিল**, আর শেষের পাতার কাজের তালিকা হলো **River কিউ, যেটা একই ডেটাবেসে থাকে**। "একই কলমে, একই বসায়" হলো **একই ট্রানজ্যাকশনে স্ট্যাটাস বদল আর জব ইনসার্ট**। রাজি হলেন **এনকোড ওয়ার্কার**: আগে দেখে নেওয়া হলো **ffprobe**, তিন সাইজে ছাপা হলো **তিন ধাপের HLS ল্যাডার**, ছোট পাণ্ডুলিপি টেনে বড় না করা হলো **সোর্সের চেয়ে বড় রেন্ডিশন বাদ দেওয়া**, আর খালি বান্ডিলে প্রথমবারেই বাতিল হলো **`JobCancel`**। কাচের শোকেস হলো **`media` বাকেট, শুধু-পড়া ওয়েব এন্ডপয়েন্ট দিয়ে**, ফাতিমার কাউন্টার হলো **nginx এজ আর প্লেব্যাক API**, আর কাউন্টারের পাশের কপিগুলো হলো **এজ ক্যাশ**। বাস্তবের VOD প্ল্যাটফর্মগুলো এর চেয়ে অনেক বড়, কিন্তু প্রতিটার ভেতরে এই ছয়টা টুকরো আছেই।

## কী বানাচ্ছি

এই ট্র্যাকের আগের এগারোটা চ্যাপ্টারের সবচেয়ে ছোট একটা চলমান রূপ:

<Mermaid
title="ছোট VOD প্ল্যাটফর্ম: একটা ভিডিওর পথ"
code={`sequenceDiagram
  participant B as "Browser"
  participant E as "nginx edge :8081"
  participant A as "Go API + worker :8080"
  participant S as "Garage S3 :3900 / web :3902"
  participant D as "PostgreSQL + River"
  B->>E: "POST /api/assets"
  E->>A: "create asset"
  A->>D: "insert asset (waiting_upload)"
  A-->>B: "id + presigned PUT URL"
  B->>E: "PUT /uploads/ID/source"
  E->>S: "pass through, same Host"
  B->>A: "POST /api/assets/ID/complete"
  A->>D: "one tx: status processing + insert encode job"
  D-->>A: "worker picks the job"
  A->>S: "download source, ffprobe, ffmpeg, upload HLS"
  A->>D: "status ready"
  B->>A: "GET /api/assets/ID/playback"
  A-->>B: "hls_url"
  B->>E: "GET /media/hls/ID/master.m3u8 (cached at edge)"`}
/>

**যা ইচ্ছা করে বাদ রাখা হয়েছে**, আর কোথায় সেটা আছে:

- লগইন, টেন্যান্ট আর PostgreSQL RLS নেই; এখানে কোনো ইউজারই নেই। প্রোডাকশনে প্রতিটা টেবিলে RLS লাগবে, প্লেব্যাক API-র পলিসিসহ [ক্যাটালগ ও প্লেব্যাক API](/notes/vod/09-catalog-playback-api) চ্যাপ্টারে।
- একটা PUT-এ পুরো ফাইল আপলোড হয়, রিজিউমেবল নয়। বড় ফাইলের জন্য [আপলোড](/notes/vod/02-upload) চ্যাপ্টারের মাল্টিপার্ট বা tus।
- Signed URL বা DRM নেই, `media` সবার জন্য খোলা। [সিকিউরিটি](/notes/vod/08-security) চ্যাপ্টার।
- API আর ওয়ার্কার একই প্রসেসে। আলাদা করা সহজ (একই বাইনারি, দুইটা কমান্ড), কিন্তু শুরুতে দরকার নেই।
- একটাই রিজিয়ন, একটাই এজ। [স্কেল ও মাল্টি-রিজিয়ন](/notes/vod/11-scale-multi-region)।

### কেন Garage, MinIO নয়

অনেক বছর ধরে সেলফ-হোস্টেড S3-এর ডিফল্ট উত্তর ছিল MinIO। ২০২৫ সালের শেষে MinIO-র কমিউনিটি এডিশনের প্রি-বিল্ট ইমেজ বন্ধ হয়, তারপর রিপোজিটরি মেইনটেন্যান্স মোডে যায়, আর ২০২৬ সালের অক্টোবরে GitHub-এ `minio/minio` রিপোজিটরি archived দেখায়। তাই এখানে **Garage**: ছোট, সেলফ-হোস্টেড, S3-কম্প্যাটিবল, presigned URL আর মাল্টিপার্ট আপলোড সাপোর্ট করে, আর একটা বাকেটকে শুধু-পড়া "ওয়েবসাইট" হিসেবে খুলে দিতে পারে, যেটা আমাদের `media`-র জন্য ঠিক যা দরকার। Go ক্লায়েন্ট হিসেবে `minio-go` ব্যবহার করা হয়েছে; এটা আলাদা রিপোজিটরি, এখনো সক্রিয়ভাবে মেইনটেইন হয়, আর যেকোনো S3-কম্প্যাটিবল স্টোরের সাথে কাজ করে। এখানকার পুরো ফ্লো Garage-এর সাথে চালিয়ে টেস্ট করা।

<Callout type="info">

**যে ভার্সনগুলোতে টেস্ট করা হয়েছে (২০২৬ সালের অক্টোবর):** Go 1.27.2, ffmpeg 9.0.2, Docker 29.8.2, `postgres:18.6-alpine`, `dxflrs/garage:v2.4.1`, `nginx:1.30.6-alpine`; Go মডিউল chi v5.5.0, pgx v5.11.0, minio-go v7.4.1, River v0.49.0; ব্রাউজারে hls.js 1.7.3। নতুন ভার্সনে কোনো ফ্ল্যাগ বা API বদলে থাকলে সংশ্লিষ্ট ডকস দেখে মিলিয়ে নিন।

</Callout>

ফোল্ডারের চেহারা:

```text
vodmini/
├── compose.yaml        # Postgres, Garage, nginx
├── garage.toml
├── rpc_secret          # generated, never committed
├── .env.example
├── setup.sh            # one-time init
├── schema.sql
├── nginx.conf
├── go.mod
├── main.go             # API + River client
├── worker.go           # encode job
├── worker_test.go
└── web/index.html      # upload + play page
```

## ধাপ ১: কন্টেইনারগুলো

```yaml
# compose.yaml
services:
  db:
    image: postgres:18.6-alpine
    environment:
      POSTGRES_USER: vod
      POSTGRES_PASSWORD: vod
      POSTGRES_DB: vod
    ports: ["55432:5432"]
    volumes: [dbdata:/var/lib/postgresql]

  storage:
    image: dxflrs/garage:v2.4.1
    ports: ["127.0.0.1:3900:3900"]
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
      - ./rpc_secret:/run/secrets/garage_rpc:ro
      - garage:/var/lib/garage

  edge:
    image: nginx:1.30.6-alpine
    ports: ["8081:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./web:/usr/share/nginx/html:ro
    extra_hosts: ["host.docker.internal:host-gateway"]
    depends_on: [storage]

volumes:
  dbdata:
  garage:
```

তিনটা জিনিস খেয়াল করুন। Postgres-কে `55432` পোর্টে রাখা হয়েছে, কারণ ডেভেলপারের মেশিনে প্রায়ই আগে থেকে একটা Postgres `5432`-এ চলে, আর তখন কানেকশন ভুল সার্ভারে গিয়ে "role does not exist" দেখায় (এটা টেস্ট করার সময় সত্যিই হয়েছিল)। Garage-এর S3 পোর্ট শুধু `127.0.0.1`-এ খোলা, কারণ সেটা শুধু Go প্রসেসের জন্য; ব্রাউজার সবকিছু nginx দিয়ে পায়। আর Postgres 18-এর ইমেজে ভলিউম `/var/lib/postgresql`-এ মাউন্ট করতে হয়, আগের ভার্সনের মতো `/var/lib/postgresql/data`-তে নয়।

```toml
# garage.toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret_file = "/run/secrets/garage_rpc"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"
```

`replication_factor = 1` মানে এক নোড, ডেটার একটাই কপি; শেখার জন্য ঠিক আছে, প্রোডাকশনের জন্য নয়। `[s3_web]` হলো সেই শুধু-পড়া ওয়েব এন্ডপয়েন্ট: `media.web.garage.localhost` হোস্ট দিয়ে এলে Garage `media` বাকেট থেকে ফাইল দেয়। RPC সিক্রেট ফাইলে রাখা, কনফিগে নয়:

```bash
openssl rand -hex 32 > rpc_secret && chmod 600 rpc_secret
docker compose up -d
```

## ধাপ ২: env, স্কিমা আর এককালীন সেটআপ

```bash
# .env.example — copy to .env and change the keys
DATABASE_URL=postgres://vod:vod@localhost:55432/vod?sslmode=disable
S3_ENDPOINT=localhost:3900
S3_PUBLIC_ENDPOINT=localhost:8081
S3_ACCESS_KEY=GK0123456789abcdef01234567
S3_SECRET_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
PUBLIC_BASE_URL=http://localhost:8081
```

Garage-এ ইমপোর্ট করা অ্যাক্সেস কী `GK` দিয়ে শুরু হয়ে ২৪টা hex অক্ষর, আর সিক্রেট ৬৪টা hex অক্ষর। নিজের জন্য বানান `echo GK$(openssl rand -hex 12)` আর `openssl rand -hex 32` দিয়ে। এখানে কোনো ভ্যারিয়েবলের ডিফল্ট নেই: একটাও না থাকলে প্রোগ্রাম চালু হওয়ার সময়েই নাম ধরে থেমে যায়।

```sql
-- schema.sql
create table assets (
    id          uuid primary key default gen_random_uuid(),
    status      text not null default 'waiting_upload'
                check (status in ('waiting_upload', 'processing', 'ready', 'failed')),
    duration_s  numeric,
    error       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table renditions (
    asset_id   uuid not null references assets (id) on delete cascade,
    name       text not null,
    height     int not null,
    bandwidth  int not null,
    primary key (asset_id, name)
);
```

স্ট্যাটাসের চারটা মান একটা `check` দিয়ে বাঁধা, যাতে কোডের কোনো টাইপো ডেটাবেসে একটা পঞ্চম অবস্থা বানাতে না পারে। অবস্থাগুলোর অর্থ আর তাদের মধ্যে যাওয়ার নিয়ম [VOD প্ল্যাটফর্ম কী](/notes/vod/01-what-is-vod) আর [এনকোডিং জব অর্কেস্ট্রেশন](/notes/vod/04-encoding-jobs) চ্যাপ্টারে।

```bash
#!/usr/bin/env bash
# setup.sh — one-time init: storage layout, buckets, app key, DB schema. Run after `docker compose up -d`.
set -euo pipefail
: "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}" "${DATABASE_URL:?}"
garage() { docker compose exec -T storage /garage "$@"; }

node=$(garage node id -q | cut -d@ -f1)
garage layout assign -z dc1 -c 10G "$node"
garage layout apply --version 1

garage bucket create uploads
garage bucket create media
garage key import --yes -n vod-app "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
garage bucket allow --read --write --owner uploads --key vod-app
garage bucket allow --read --write --owner media --key vod-app
garage bucket website --allow media   # anonymous reads, served on the web port only

go run github.com/riverqueue/river/cmd/river@v0.49.0 migrate-up --database-url "$DATABASE_URL"
docker compose exec -T db psql -U vod -d vod -v ON_ERROR_STOP=1 < schema.sql
```

```bash
cp .env.example .env    # then edit the keys
set -a; . ./.env; set +a
./setup.sh
```

```text
...
applied migration 001 [up] create river migration                           [9.43ms]
applied migration 002 [up] initial schema                                   [7.45ms]
...
applied migration 008 [up] job id autoincrement                             [765.12µs]
CREATE TABLE
CREATE TABLE
```

River তার নিজের টেবিল (`river_job` আর কয়েকটা সহকারী) আমাদের ডেটাবেসেই বানায়। এটাই পুরো ডিজাইনের মেরুদণ্ড: জব আর অ্যাসেট একই ডেটাবেসে, তাই একই ট্রানজ্যাকশনে।

## ধাপ ৩: nginx, একমাত্র দরজা

```nginx
# nginx.conf
proxy_cache_path /var/cache/nginx/media levels=1:2 keys_zone=media:10m
                 max_size=2g inactive=7d use_temp_path=off;

map $uri $media_cache {
    ~\.m3u8$  "public, max-age=60";
    default   "public, max-age=31536000, immutable";
}

server {
    listen 80;

    location / {
        root /usr/share/nginx/html;
    }

    location /api/ {
        proxy_pass http://host.docker.internal:8080/;
    }

    # Presigned PUTs are signed for this host, so pass it through unchanged.
    location /uploads/ {
        proxy_pass http://storage:3900;
        proxy_set_header Host $http_host;
        client_max_body_size 0;
        proxy_request_buffering off;
    }

    # Garage's web endpoint serves the bucket named in the Host header, read-only.
    location /media/ {
        proxy_pass http://storage:3902/;
        proxy_set_header Host media.web.garage.localhost;
        proxy_cache media;
        proxy_cache_valid 200 1h;
        proxy_cache_lock on;   # one origin fetch per object, however many viewers ask at once
        add_header X-Cache-Status $upstream_cache_status always;
        proxy_hide_header Cache-Control;
        proxy_hide_header Access-Control-Allow-Origin;
        # No "always" here: a 404 must never be cached as an immutable segment.
        add_header Cache-Control $media_cache;
        add_header Access-Control-Allow-Origin * always;
    }
}
```

চারটা `location`, চারটা কাজ:

- **`/`** স্ট্যাটিক পেজ দেয়।
- **`/api/`** Go প্রসেসে পাঠায়। একই অরিজিন থেকে আসায় ব্রাউজারের CORS লাগে না।
- **`/uploads/`** হলো আপলোডের দরজা, আর এখানেই সবচেয়ে সূক্ষ্ম জিনিসটা। Presigned URL-এর signature-এ হোস্ট (`localhost:8081`) সই করা থাকে। nginx যদি Garage-কে নিজের হোস্ট (`storage:3900`) পাঠায়, Garage signature মেলাতে পারে না। তাই `proxy_set_header Host $http_host` দিয়ে ব্রাউজারের হোস্টটাই পাঠানো হয়। `client_max_body_size 0` বড় ফাইলে 413 ঠেকায়, আর `proxy_request_buffering off` পুরো ফাইল nginx-এর ডিস্কে জমা না করে সরাসরি স্টোরেজে স্ট্রিম করে।
- **`/media/`** শুধু-পড়া ওয়েব এন্ডপয়েন্টে যায় (শেষের `/` পাথ থেকে `/media` অংশটা কেটে দেয়)। প্লেলিস্টের ব্রাউজার ক্যাশ ৬০ সেকেন্ড, সেগমেন্ট এক বছর `immutable`। কেন এই ভাগ, সেটা **CDN** ট্র্যাকের [ক্যাশিং হেডার](/notes/cdn/03-cache-control) চ্যাপ্টারে। এজ নিজেও এক ঘণ্টা ক্যাশ রাখে, আর `proxy_cache_lock` নিশ্চিত করে যে একই কোল্ড সেগমেন্ট একসাথে ৩০০ জন চাইলেও স্টোরেজে একটাই রিকোয়েস্ট যায়।

<Callout type="warning">

**`Cache-Control`-এ `always` নেই, আর সেটা ইচ্ছা করে।** nginx-এ `add_header ... always` এরর রেসপন্সেও হেডার বসায়। প্রথম ভার্সনে এটা ছিল, আর টেস্টে দেখা গেল একটা না-থাকা সেগমেন্টের 404 রেসপন্সে `public, max-age=31536000, immutable` বসছে। সামনে একটা CDN থাকলে সেই 404 এক বছরের জন্য ক্যাশ হতো। `always` ছাড়া হেডার শুধু সফল রেসপন্সে বসে। CORS হেডারে `always` রাখা হয়েছে, যাতে এরর হলেও প্লেয়ার আসল স্ট্যাটাস কোড দেখতে পায়, শুধু একটা ধোঁয়াশা CORS এরর নয়। আর `proxy_hide_header Access-Control-Allow-Origin` আছে কারণ Garage এরর রেসপন্সে নিজের একটা CORS হেডার পাঠায়; দুইটা `Access-Control-Allow-Origin` থাকলে ব্রাউজার রেসপন্সটা পুরোপুরি বাতিল করে।

</Callout>

## ধাপ ৪: API

```go
// main.go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var %s", key)
	}
	return v
}

func newS3(endpoint string) *minio.Client {
	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(mustEnv("S3_ACCESS_KEY"), mustEnv("S3_SECRET_KEY"), ""),
		Region: "garage", // matches s3_region in garage.toml; also stops presigning from calling the server
	})
	if err != nil {
		log.Fatal(err)
	}
	return c
}

type app struct {
	db         *pgxpool.Pool
	s3         *minio.Client // talks to storage directly
	s3Public   *minio.Client // only signs URLs for the browser's host
	river      *river.Client[pgx.Tx]
	publicBase string
}

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, mustEnv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}

	a := &app{
		db:         db,
		s3:         newS3(mustEnv("S3_ENDPOINT")),
		s3Public:   newS3(mustEnv("S3_PUBLIC_ENDPOINT")),
		publicBase: mustEnv("PUBLIC_BASE_URL"),
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &EncodeWorker{app: a})
	a.river, err = river.NewClient(riverpgxv5.New(db), &river.Config{
		Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 2}},
		Workers: workers,
		// Must exceed the encode timeout, or River re-runs encodes that are still working.
		RescueStuckJobsAfter: 3 * time.Hour,
	})
	if err != nil {
		log.Fatal(err)
	}
	if err := a.river.Start(ctx); err != nil {
		log.Fatal(err)
	}

	r := chi.NewRouter()
	r.Post("/assets", a.createAsset)
	r.Post("/assets/{id}/complete", a.completeUpload)
	r.Get("/assets/{id}", a.getAsset)
	r.Get("/assets/{id}/playback", a.playback)
	log.Println("api on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
```

**দুইটা S3 ক্লায়েন্ট কেন?** দুটোর কী একই, কিন্তু এন্ডপয়েন্ট আলাদা। `s3` সরাসরি `localhost:3900`-এ কথা বলে (ডাউনলোড, আপলোড, `StatObject`)। `s3Public` কখনো নেটওয়ার্কে কিছু পাঠায় না; ওর একমাত্র কাজ এমন URL সই করা যার হোস্ট ব্রাউজার আসলে দেখবে (`localhost:8081`)। প্রথমটা দিয়ে সই করলে URL-এ `localhost:3900` থাকত, যেটা ব্রাউজারের কাছে অচল। `Region` আগে থেকে বলে দেওয়ায় presign করার সময় ক্লায়েন্ট বাকেটের রিজিয়ন জানতে সার্ভারে প্রশ্ন পাঠায় না।

```go
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func (a *app) createAsset(w http.ResponseWriter, r *http.Request) {
	var id string
	if err := a.db.QueryRow(r.Context(), `insert into assets default values returning id`).Scan(&id); err != nil {
		log.Println("create asset:", err)
		writeErr(w, 500, "internal")
		return
	}
	u, err := a.s3Public.PresignedPutObject(r.Context(), "uploads", id+"/source", time.Hour)
	if err != nil {
		log.Println("presign:", err)
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 201, map[string]string{"id": id, "upload_url": u.String()})
}
```

এররগুলো স্থির কোড (`internal`, `not_found`, `not_ready`), কখনো ডেটাবেস বা স্টোরেজের কাঁচা এরর টেক্সট নয়। ফ্রন্টএন্ড এই কোড দেখে ব্যবহারকারীকে নিজের ভাষায় বার্তা দেখায়; আসল কারণ যায় সার্ভারের লগে।

```go
func (a *app) completeUpload(w http.ResponseWriter, r *http.Request) {
	ctx, id := r.Context(), chi.URLParam(r, "id")

	if _, err := a.s3.StatObject(ctx, "uploads", id+"/source", minio.StatObjectOptions{}); err != nil {
		writeErr(w, 409, "upload_missing")
		return
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`update assets set status = 'processing', updated_at = now()
		 where id = $1 and status = 'waiting_upload'`, id)
	if err != nil {
		writeErr(w, 400, "bad_id")
		return
	}
	if tag.RowsAffected() == 0 {
		// Already completed, or unknown id: a repeat call must not enqueue a second job.
		writeErr(w, 409, "not_waiting_upload")
		return
	}
	// Same transaction: the job exists if and only if the status change committed.
	if _, err := a.river.InsertTx(ctx, tx, EncodeArgs{AssetID: id}, nil); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 202, map[string]string{"id": id, "status": "processing"})
}
```

এই হ্যান্ডলারটাই পুরো প্ল্যাটফর্মের সবচেয়ে গুরুত্বপূর্ণ কয়েক লাইন, তিনটা কারণে:

1. **ফাইল আছে কিনা আগে দেখা হয়।** ক্লায়েন্ট "complete" বললেই বিশ্বাস করা হয় না; `StatObject` দিয়ে স্টোরেজে সত্যিই ফাইল আছে কিনা দেখা হয়।
2. **আইডেম্পোটেন্ট।** `where status = 'waiting_upload'` থাকায় একই রিকোয়েস্ট দুইবার এলে (নেটওয়ার্ক রিট্রাই, ডাবল ক্লিক) দ্বিতীয়বার কোনো সারি বদলায় না, আর দ্বিতীয় জবও তৈরি হয় না। টেস্টে দ্বিতীয় কল সত্যিই `409 not_waiting_upload` ফেরত দিয়েছে।
3. **ট্রানজ্যাকশনাল এনকিউ।** স্ট্যাটাস বদল আর জব ইনসার্ট একই ট্রানজ্যাকশনে (`InsertTx`)। কমিটের আগে প্রসেস মরে গেলে দুটোই বাতিল হয়; কমিট হলে দুটোই থাকে। "processing" কিন্তু কোনো জব নেই, এমন অ্যাসেট এই ডিজাইনে তৈরিই হতে পারে না। আলাদা কিউ সার্ভিস (Redis, RabbitMQ) হলে এই নিশ্চয়তা পেতে outbox প্যাটার্নের মতো বাড়তি কাজ লাগত।

স্টোরেজের বাকেট নোটিফিকেশন দিয়ে আপলোড শেষ হওয়া ধরা যেত, কিন্তু Garage-এ সেই সুবিধা আছে বলে আমরা জানি না, আর একটা স্পষ্ট এন্ডপয়েন্ট ডিবাগ করাও সহজ।

```go
func (a *app) getAsset(w http.ResponseWriter, r *http.Request) {
	var status string
	var errText *string
	err := a.db.QueryRow(r.Context(), `select status, error from assets where id = $1`,
		chi.URLParam(r, "id")).Scan(&status, &errText)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "not_found")
		return
	}
	if err != nil {
		writeErr(w, 400, "bad_id")
		return
	}
	writeJSON(w, 200, map[string]any{"status": status, "error": errText})
}

func (a *app) playback(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var status string
	err := a.db.QueryRow(r.Context(), `select status from assets where id = $1`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "not_found")
		return
	}
	if err != nil {
		writeErr(w, 400, "bad_id")
		return
	}
	if status != "ready" {
		writeErr(w, 409, "not_ready")
		return
	}
	writeJSON(w, 200, map[string]string{"hls_url": a.publicBase + "/media/hls/" + id + "/master.m3u8"})
}
```

প্লেব্যাক API ইচ্ছা করেই আলাদা এন্ডপয়েন্ট, যদিও এখন শুধু একটা URL জোড়া লাগায়। পরে signed URL, CDN বাছাই, বা "এই দেশে দেখা যাবে না" পলিসি এখানেই বসবে, আর প্লেয়ারের কোড বদলাতে হবে না।

## ধাপ ৫: এনকোড ওয়ার্কার

```go
// worker.go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/riverqueue/river"
)

type EncodeArgs struct {
	AssetID string `json:"asset_id"`
}

func (EncodeArgs) Kind() string { return "encode" }

// River's default of 25 attempts backs off over days; an encode should give up sooner.
func (EncodeArgs) InsertOpts() river.InsertOpts { return river.InsertOpts{MaxAttempts: 5} }

type EncodeWorker struct {
	river.WorkerDefaults[EncodeArgs]
	app *app
}

// River cancels a job's context after one minute by default, far too short for an encode.
func (w *EncodeWorker) Timeout(*river.Job[EncodeArgs]) time.Duration { return 2 * time.Hour }
```

<Callout type="danger">

**River-এর ডিফল্ট জব টাইমআউট এক মিনিট** (২০২৬ সালের অক্টোবরে River v0.49-এর সোর্সে `JobTimeoutDefault = 1 * time.Minute`)। এক মিনিটের পর জবের `context` বাতিল হয়, আর `exec.CommandContext` ffmpeg-কে মেরে ফেলে। ছোট টেস্ট ভিডিও দিয়ে এটা কখনো ধরা পড়ে না; প্রথম আসল ৪৫ মিনিটের লেকচার আপলোড হলে প্রতিবার ঠিক এক মিনিটে "context canceled" দিয়ে ফেল করে। তাই `Timeout` ওভাররাইড করা, আর সাথে `RescueStuckJobsAfter` (ডিফল্ট এক ঘণ্টা) টাইমআউটের চেয়ে বড় রাখা, নইলে River দুই ঘণ্টার এনকোডকে এক ঘণ্টা পরে "আটকে গেছে" ভেবে আরেকবার চালু করে দেয়।

</Callout>

```go
type rendition struct {
	name     string
	height   int
	bitrateK int
}

var ladder = []rendition{{"1080p", 1080, 5000}, {"720p", 720, 2800}, {"480p", 480, 1400}}

// ladderFor drops rungs taller than the source, so a 720p upload never gets a fake 1080p.
func ladderFor(srcHeight int) []rendition {
	var out []rendition
	for _, r := range ladder {
		if r.height <= srcHeight {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		out = ladder[len(ladder)-1:]
	}
	return out
}
```

প্রথম ভার্সনে এই ফাংশন ছিল না, আর ffmpeg-এর `scale` ফিল্টারে `min(1080,ih)` দিয়ে শুধু আপস্কেল আটকানো হয়েছিল। টেস্টে একটা 720p ভিডিও দিতেই মাস্টার প্লেলিস্টে দেখা গেল "1080p" নামের একটা রেন্ডিশন, যার রেজোলিউশন আসলে `1280x720` আর বিটরেট ৫ Mbps: একই ছবি, প্রায় দ্বিগুণ ডেটা। ABR প্লেয়ার ভালো নেটওয়ার্কে সেটাই বাছত, আর দর্শক কোনো লাভ ছাড়াই বেশি ডেটা খরচ করত। ল্যাডার কীভাবে ঠিক করতে হয়, সেটা **ভিডিও** ট্র্যাকের [Bitrate ladder](/notes/video/05-bitrate-ladder) চ্যাপ্টারে; এখানে নির্দিষ্ট তিন ধাপের ল্যাডার শুধু সরলতার জন্য।

```go
var errBadSource = errors.New("source has no video stream")

func (w *EncodeWorker) Work(ctx context.Context, job *river.Job[EncodeArgs]) error {
	err := w.encode(ctx, job.Args.AssetID)
	if err == nil {
		return nil
	}
	// A broken file fails the same way every time, so stop retrying it.
	if errors.Is(err, errBadSource) || job.Attempt >= job.MaxAttempts {
		// ctx may already be cancelled by the timeout; the failure must still be recorded.
		w.app.db.Exec(context.WithoutCancel(ctx), `update assets set status = 'failed', error = $2, updated_at = now() where id = $1`,
			job.Args.AssetID, err.Error())
		if errors.Is(err, errBadSource) {
			return river.JobCancel(err)
		}
	}
	return err
}
```

এররের দুই রকম পরিণতি। **ক্ষণস্থায়ী এরর** (স্টোরেজ ক্ষণিকের জন্য অচল, ডিস্ক ভরা) হলে এরর ফেরত দিলেই River ব্যাকঅফ সহ আবার চেষ্টা করে, আর শেষ চেষ্টাতেও না হলে অ্যাসেট `failed`। **স্থায়ী এরর** (ফাইলটাই ভিডিও নয়) হলে আবার চেষ্টা অর্থহীন, তাই `river.JobCancel` সাথে সাথে জব থামায়। এই পার্থক্য না করলে একটা ভাঙা ফাইল পাঁচবার পুরো ডাউনলোড আর probe হয়, আর ব্যবহারকারী অপেক্ষা করেন অকারণে। `context.WithoutCancel` জরুরি: টাইমআউটে `ctx` বাতিল হয়ে গেলে সেই `ctx` দিয়ে ডেটাবেসে লেখা যায় না, আর অ্যাসেট চিরকাল "processing" থেকে যেত।

```go
func (w *EncodeWorker) encode(ctx context.Context, id string) error {
	dir, err := os.MkdirTemp("", "encode-"+id)
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)

	src := filepath.Join(dir, "source")
	if err := w.app.s3.FGetObject(ctx, "uploads", id+"/source", src, minio.GetObjectOptions{}); err != nil {
		return fmt.Errorf("download: %w", err)
	}

	p, err := probe(ctx, src)
	if err != nil {
		return err
	}
	rungs := ladderFor(p.height)

	out := filepath.Join(dir, "out")
	if msg, err := exec.CommandContext(ctx, "ffmpeg", ffmpegArgs(src, out, rungs, p.hasAudio)...).CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg: %w: %s", err, tail(msg))
	}

	err = filepath.WalkDir(out, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(out, path)
		_, err = w.app.s3.FPutObject(ctx, "media", "hls/"+id+"/"+filepath.ToSlash(rel), path,
			minio.PutObjectOptions{ContentType: contentType(path)})
		return err
	})
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}

	tx, err := w.app.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, r := range rungs {
		if _, err := tx.Exec(ctx, `insert into renditions (asset_id, name, height, bandwidth)
			values ($1, $2, $3, $4) on conflict do nothing`, id, r.name, r.height, r.bitrateK*1000); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `update assets set status = 'ready', duration_s = $2, updated_at = now()
		where id = $1`, id, p.duration); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

ক্রমটা খেয়াল করুন: **আগে সব ফাইল আপলোড, তারপর `ready`।** উল্টো করলে প্লেব্যাক API এমন একটা URL দিত যার সেগমেন্ট তখনো স্টোরেজে পৌঁছায়নি। আর রিট্রাই নিরাপদ: একই কী-তে আবার আপলোড করলে ফাইল ওভাররাইট হয়, `on conflict do nothing` দ্বিতীয়বার রেন্ডিশন সারি বাড়ায় না। প্রতিটা চেষ্টা আলাদা temp ডিরেক্টরিতে, আর `defer os.RemoveAll` সফল বা ব্যর্থ, দুই ক্ষেত্রেই ডিস্ক পরিষ্কার করে।

```go
type probeResult struct {
	duration float64
	height   int
	hasAudio bool
}

func probe(ctx context.Context, src string) (probeResult, error) {
	var res probeResult
	raw, err := exec.CommandContext(ctx, "ffprobe", "-v", "error",
		"-show_entries", "stream=codec_type,height:format=duration", "-of", "json", src).Output()
	if err != nil {
		return res, fmt.Errorf("%w: ffprobe could not read it", errBadSource)
	}
	var p struct {
		Streams []struct {
			CodecType string `json:"codec_type"`
			Height    int    `json:"height"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return res, err
	}
	for _, s := range p.Streams {
		if s.CodecType == "video" && res.height == 0 {
			res.height = s.Height
		}
		res.hasAudio = res.hasAudio || s.CodecType == "audio"
	}
	if res.height == 0 {
		return res, errBadSource
	}
	res.duration, _ = strconv.ParseFloat(p.Format.Duration, 64)
	return res, nil
}
```

এটা ইচ্ছা করে ছোট একটা probe। আসল ইনজেস্টে যা যা দেখতে হয় (রোটেশন মেটাডেটা, VFR, HDR, অদ্ভুত পিক্সেল ফরম্যাট, একাধিক অডিও ট্র্যাক), সেগুলো [ইনজেস্ট ও প্রোবিং](/notes/vod/03-ingest-and-probing) চ্যাপ্টারে। একটা সীমাবদ্ধতা মনে রাখুন: ফোনে তোলা খাড়া ভিডিওর কোডেড উচ্চতা আর দেখানো উচ্চতা আলাদা হতে পারে, আর এই কোড কোডেড উচ্চতা দেখে।

```go
func ffmpegArgs(src, out string, rungs []rendition, hasAudio bool) []string {
	var split, scales, streamMap []string
	args := []string{"-y", "-i", src}
	for i, r := range rungs {
		split = append(split, fmt.Sprintf("[s%d]", i))
		// min() keeps a 720p source from being upscaled to 1080.
		scales = append(scales, fmt.Sprintf("[s%d]scale=-2:'min(%d,ih)'[v%d]", i, r.height, i))
	}
	args = append(args, "-filter_complex",
		fmt.Sprintf("[0:v]split=%d%s;%s", len(rungs), strings.Join(split, ""), strings.Join(scales, ";")))
	for i, r := range rungs {
		args = append(args, "-map", fmt.Sprintf("[v%d]", i),
			fmt.Sprintf("-b:v:%d", i), fmt.Sprintf("%dk", r.bitrateK),
			fmt.Sprintf("-maxrate:v:%d", i), fmt.Sprintf("%dk", r.bitrateK*107/100),
			fmt.Sprintf("-bufsize:v:%d", i), fmt.Sprintf("%dk", r.bitrateK*3/2))
		entry := fmt.Sprintf("v:%d,name:%s", i, r.name)
		if hasAudio {
			args = append(args, "-map", "0:a:0")
			entry = fmt.Sprintf("v:%d,a:%d,name:%s", i, i, r.name)
		}
		streamMap = append(streamMap, entry)
	}
	args = append(args,
		"-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
		"-force_key_frames", "expr:gte(t,n_forced*4)", "-sc_threshold", "0",
		"-c:a", "aac", "-b:a", "128k", "-ac", "2",
		"-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
		"-hls_segment_type", "fmp4", "-hls_flags", "independent_segments",
		"-hls_fmp4_init_filename", "init.mp4",
		"-hls_segment_filename", out+"/%v/seg_%03d.m4s",
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", strings.Join(streamMap, " "),
		out+"/%v/index.m3u8")
	return args
}

func contentType(path string) string {
	switch filepath.Ext(path) {
	case ".m3u8":
		return "application/vnd.apple.mpegurl"
	case ".m4s":
		return "video/iso.segment"
	default:
		return "video/mp4"
	}
}

func tail(b []byte) string {
	if len(b) > 800 {
		b = b[len(b)-800:]
	}
	return string(b)
}
```

একটা ffmpeg প্রসেসে পুরো ল্যাডার: সোর্স একবার ডিকোড হয়, `split` দিয়ে কয়েক কপি, প্রতিটা আলাদা সাইজে স্কেল আর আলাদা বিটরেটে এনকোড, আর HLS মাক্সার `var_stream_map` দেখে প্রতিটাকে নিজের ফোল্ডারে লেখে। তিনটা ফ্ল্যাগ ABR-এর জন্য অপরিহার্য: `-force_key_frames "expr:gte(t,n_forced*4)"` প্রতি চার সেকেন্ডে কীফ্রেম বসায়, `-sc_threshold 0` দৃশ্য বদলে বাড়তি কীফ্রেম বন্ধ করে, ফলে সব রেন্ডিশনের সেগমেন্ট একই মুহূর্তে শুরু হয় আর প্লেয়ার মাঝপথে রেন্ডিশন বদলাতে পারে। `-pix_fmt yuv420p` 10-বিট বা 4:2:2 সোর্সকে এমন ফরম্যাটে আনে যেটা প্রায় সব ডিভাইস চালাতে পারে। কেন এগুলো, তার বিস্তারিত **ভিডিও** ট্র্যাকের [Transcoding pipeline](/notes/video/04-transcoding-pipeline) আর [স্ট্রিমিংয়ের জন্য packaging](/notes/video/06-packaging-for-streaming) চ্যাপ্টারে। অডিও না থাকলে স্ট্রিম ম্যাপ থেকে অডিও বাদ যায়; নইলে অডিওহীন স্ক্রিন রেকর্ডিংয়ে ffmpeg ফেল করত।

`contentType` জরুরি: ভুল `Content-Type` দিয়ে প্লেলিস্ট রাখলে কিছু প্লেয়ার, বিশেষ করে Safari-র নেটিভ HLS, ফাইলটা চিনতে পারে না।

ল্যাডার ফাংশনের জন্য একটা ছোট টেস্ট, যেটা উপরের 720p বাগ আবার ফিরলে ফেল করবে:

```go
// worker_test.go
package main

import "testing"

func TestLadderFor(t *testing.T) {
	cases := map[int][]string{
		2160: {"1080p", "720p", "480p"},
		720:  {"720p", "480p"},
		360:  {"480p"}, // smallest rung, scaled no higher than the source
	}
	for h, want := range cases {
		got := ladderFor(h)
		if len(got) != len(want) {
			t.Fatalf("height %d: got %d rungs, want %d", h, len(got), len(want))
		}
		for i := range want {
			if got[i].name != want[i] {
				t.Errorf("height %d rung %d: got %s, want %s", h, i, got[i].name, want[i])
			}
		}
	}
}
```

## ধাপ ৬: আপলোড আর প্লে করার পেজ

```html
<!-- web/index.html -->
<!doctype html>
<meta charset="utf-8" />
<title>vodmini</title>
<input type="file" id="file" accept="video/*" />
<p id="status"></p>
<video id="player" controls width="640"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js"></script>
<script>
	const status = (t) => (document.getElementById('status').textContent = t);
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	async function api(path, opts) {
		const res = await fetch('/api' + path, opts);
		const body = await res.json();
		if (!res.ok) throw new Error(body.error);
		return body;
	}

	document.getElementById('file').onchange = async (e) => {
		try {
			const { id, upload_url } = await api('/assets', { method: 'POST' });
			status('uploading…');
			const put = await fetch(upload_url, { method: 'PUT', body: e.target.files[0] });
			if (!put.ok) throw new Error('upload failed: ' + put.status);
			await api(`/assets/${id}/complete`, { method: 'POST' });

			let asset;
			do {
				status('processing…');
				await sleep(2000);
				asset = await api(`/assets/${id}`);
			} while (asset.status === 'processing');
			if (asset.status !== 'ready') throw new Error(asset.error || asset.status);

			const { hls_url } = await api(`/assets/${id}/playback`);
			const video = document.getElementById('player');
			if (video.canPlayType('application/vnd.apple.mpegurl')) {
				video.src = hls_url; // Safari plays HLS natively
			} else {
				const hls = new Hls();
				hls.loadSource(hls_url);
				hls.attachMedia(video);
			}
			status('ready: ' + hls_url);
		} catch (err) {
			status('error: ' + err.message);
		}
	};
</script>
```

দুই সেকেন্ড পরপর স্ট্যাটাস জিজ্ঞেস করা (polling) সবচেয়ে সরল উপায়; প্রোডাকশনে ওয়েবহুক বা সার্ভার-সেন্ট ইভেন্ট ভালো, [ক্যাটালগ ও প্লেব্যাক API](/notes/vod/09-catalog-playback-api) দেখুন। এই পেজের এরর মেসেজ ডেভেলপারের জন্য; আসল প্রোডাক্টে API-র এরর কোড ধরে ব্যবহারকারীর ভাষায় বার্তা দেখাতে হবে। প্লেয়ারের ভেতরের কাজ **ভিডিও প্লেয়ার** ট্র্যাকে।

## ধাপ ৭: চালানো

```bash
go mod init vodmini
go get github.com/go-chi/chi/v5@v5.5.0 github.com/jackc/pgx/v5@v5.11.0 \
  github.com/minio/minio-go/v7@v7.4.1 github.com/riverqueue/river@v0.49.0 \
  github.com/riverqueue/river/riverdriver/riverpgxv5@v0.49.0
go test ./... && go build -o vodmini .

set -a; . ./.env; set +a
./vodmini
```

ব্রাউজারে `http://localhost:8081` খুলে একটা ভিডিও বাছলেই পুরো পথ চলে। একই কাজ `curl` দিয়ে (আসল রান, ১২ সেকেন্ডের একটা 720p টেস্ট ভিডিও দিয়ে, ID ছোট করা):

```text
$ curl -s -X POST localhost:8081/api/assets
{"id":"4258cf13-...","upload_url":"http://localhost:8081/uploads/4258cf13-.../source?X-Amz-Algorithm=AWS4-HMAC-SHA256&...&X-Amz-SignedHeaders=host&X-Amz-Signature=..."}

$ curl -s -o /dev/null -w '%{http_code}\n' -X PUT --upload-file sample.mp4 "$UPLOAD_URL"
200

$ curl -s -X POST localhost:8081/api/assets/4258cf13-.../complete
{"id":"4258cf13-...","status":"processing"}

$ curl -s -X POST localhost:8081/api/assets/4258cf13-.../complete     # repeated on purpose
{"error":"not_waiting_upload"}

$ curl -s localhost:8081/api/assets/4258cf13-...                       # a few seconds later
{"error":null,"status":"ready"}

$ curl -s localhost:8081/api/assets/4258cf13-.../playback
{"hls_url":"http://localhost:8081/media/hls/4258cf13-.../master.m3u8"}

$ curl -s localhost:8081/media/hls/4258cf13-.../master.m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2939754,AVERAGE-BANDWIDTH=2890834,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1479436,AVERAGE-BANDWIDTH=1470137,RESOLUTION=854x480,CODECS="avc1.64001f,mp4a.40.2"
480p/index.m3u8
```

720p সোর্স থেকে ঠিক দুইটা রেন্ডিশন, আর প্রতিটায় `CODECS` আছে, যেটা ffmpeg নিজেই লিখেছে। আরও দুইটা টেস্ট:

```text
silent.mp4 (640x360, no audio)  -> {"error":null,"status":"ready"}   renditions: 480p
broken.mp4 (random bytes)       -> {"error":"source has no video stream: ffprobe could not read it","status":"failed"}
```

আর River-এর টেবিলে জবগুলোর অবস্থা:

```text
$ psql "$DATABASE_URL" -c "select id, state, attempt, max_attempts,
    left(errors[array_length(errors,1)]->>'error', 50) as last_error from river_job order by id desc limit 3"
 id |   state   | attempt | max_attempts |                     last_error
----+-----------+---------+--------------+----------------------------------------------------
  3 | cancelled |       1 |            5 | JobCancelError: source has no video stream: ffprob
  2 | completed |       1 |            5 |
  1 | completed |       1 |            5 |
```

ভাঙা ফাইল একবারেই `cancelled`, পাঁচবার চেষ্টা নয়। `errors` কলামটা `jsonb` অ্যারে, তাই শেষ এরর পেতে `errors[array_length(errors,1)]`; সাধারণ `jsonb` অপারেটর এখানে কাজ করে না।

শেষে চ্যাপ্টার ১৩-এর `vod-check.sh` দিয়ে প্লেয়ারের চোখে স্ট্রিমটা যাচাই:

```text
== master: http://localhost:8081/media/hls/4258cf13-.../master.m3u8
    HTTP/1.1 200 OK
    Content-Type: application/vnd.apple.mpegurl
    Cache-Control: public, max-age=60
    Access-Control-Allow-Origin: *

== rendition: 720p/index.m3u8  BANDWIDTH=2939754  RESOLUTION=1280x720  CODECS="avc1.64001f,mp4a.40.2"
  segments: 3   target duration: 4s   endlist: yes
  first segment: seg_000.m4s
    HTTP/1.1 206 Partial Content
    Content-Type: video/iso.segment
    Cache-Control: public, max-age=31536000, immutable
    Access-Control-Allow-Origin: *
  video: codec_name=h264|profile=High|width=1280|height=720|pix_fmt=yuv420p|r_frame_rate=30/1
  audio: codec_name=aac|sample_rate=44100|channels=2
  starts on a keyframe: yes
```

## টেস্ট করতে গিয়ে যা যা ভাঙল

প্রতিটা আসলে ঘটেছে, আর প্রতিটা প্রোডাকশনেও ঘটে:

- **Postgres-এ "role vod does not exist"।** মেশিনে আগে থেকে একটা Postgres `5432` পোর্টে ছিল, কানেকশন সেখানে যাচ্ছিল। পোর্ট বদলে `55432`।
- **স্টোরেজ কন্টেইনার নতুন করে চালুর পর আপলোডে 502।** nginx চালু হওয়ার সময় একবার `storage` নামটা IP-তে রূপান্তর করে, তারপর সেটাই মনে রাখে। কন্টেইনার নতুন IP পেলে nginx পুরনো IP-তে ঠোকে। সমাধান `docker compose restart edge`; প্রোডাকশনে `resolver` ডিরেক্টিভ আর ভ্যারিয়েবলে আপস্ট্রিম রাখা।
- **720p থেকে নকল 1080p।** উপরে `ladderFor`।
- **404-এ এক বছরের `immutable`।** উপরে nginx-এর `always`।
- **ভুল হোস্টে presigned URL: `Forbidden: Invalid signature`।** `localhost:8081`-এর জন্য সই করা URL সরাসরি `localhost:3900`-এ পাঠালে Garage এটাই বলে। Signature-এ হোস্ট থাকে।
- **River-এর এক মিনিটের টাইমআউট।** ছোট টেস্ট ফাইলে ধরা পড়ে না, ডকস আর সোর্স পড়ে পাওয়া। উপরে `Timeout`।

## এরপর কোথায় যাবেন

| এখন যা আছে | প্রোডাকশনে যা লাগবে | কোথায় |
| --- | --- | --- |
| একটা PUT-এ আপলোড | মাল্টিপার্ট বা tus, বিরতির পর আবার শুরু | [আপলোড](/notes/vod/02-upload) |
| ছোট probe | রোটেশন, VFR, HDR, অডিও ট্র্যাক যাচাই | [ইনজেস্ট ও প্রোবিং](/notes/vod/03-ingest-and-probing) |
| এক কিউ, এক প্রসেস | আলাদা ওয়ার্কার, প্রায়োরিটি, ক্যাপাসিটি | [এনকোডিং জব](/notes/vod/04-encoding-jobs) |
| `hls/ID/` পাথ, মুছে ফেলা নেই | ভার্সনড পাথ, লাইফসাইকেল, অনাথ আপলোড পরিষ্কার | [স্টোরেজ লেআউট](/notes/vod/05-storage-layout) |
| স্ট্যাটিক HLS | CMAF, DASH, just-in-time প্যাকেজিং | [প্যাকেজিং কৌশল](/notes/vod/06-packaging-strategies) |
| থাম্বনেইল নেই | থাম্বনেইল, স্টোরিবোর্ড, ক্যাপশন | [থাম্বনেইল ও ক্যাপশন](/notes/vod/07-thumbnails-captions) |
| সবার জন্য খোলা `media` | signed URL, টোকেন, DRM | [সিকিউরিটি](/notes/vod/08-security) |
| কোনো ইউজার নেই | টেন্যান্ট, RLS, প্লেব্যাক পলিসি, ওয়েবহুক | [ক্যাটালগ ও প্লেব্যাক API](/notes/vod/09-catalog-playback-api) |
| এক এজ | CDN, shield, মাল্টি-রিজিয়ন | [স্কেল ও মাল্টি-রিজিয়ন](/notes/vod/11-scale-multi-region) |

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| প্রোগ্রাম চালু হয়েই থেমে যায় | লগে `missing required env var ...` | `.env` লোড হয়েছে কিনা দেখুন (`set -a; . ./.env; set +a`), নামের বানান মিলিয়ে নিন |
| `setup.sh`-এ `layout assign` ফেল | `docker compose exec storage /garage status` | কন্টেইনার চালু আছে কিনা দেখুন; দ্বিতীয়বার চালালে বাকেট আগে থেকে থাকায় এরর আসতে পারে, সেটা স্বাভাবিক |
| ব্রাউজারের PUT-এ 403, বার্তা `Invalid signature` | URL-এর হোস্ট আর যে হোস্টে পাঠানো হচ্ছে মিলিয়ে দেখুন; nginx-এ `proxy_set_header Host $http_host` আছে কিনা | `S3_PUBLIC_ENDPOINT` ঠিক ব্রাউজারের দেখা হোস্ট-পোর্ট হতে হবে; মাঝের প্রক্সিকে হোস্ট বদলাতে দেবেন না |
| ব্রাউজারের PUT-এ 413 | nginx-এর এরর লগে `client intended to send too large body` | `/uploads/`-এ `client_max_body_size 0` |
| আপলোড বা মিডিয়ায় 502, যদিও স্টোরেজ চলছে | `docker compose logs edge`-এ `connect() failed` আর পুরনো IP | `docker compose restart edge`, অথবা nginx-এ `resolver` দিয়ে প্রতিবার নাম রূপান্তর |
| `complete` সবসময় `upload_missing` | `docker compose exec storage /garage bucket info uploads`-এ অবজেক্ট সংখ্যা | PUT আসলে সফল হয়েছিল কিনা দেখুন (স্ট্যাটাস 200); অ্যাসেট ID আর কী (`ID/source`) মিলছে কিনা |
| অ্যাসেট চিরকাল `processing` | উপরের `river_job` কুয়েরি; `state` আর শেষ এরর | `retryable` হলে এরর পড়ুন; `running` অনেকক্ষণ হলে ওয়ার্কার প্রসেস চলছে কিনা দেখুন; জব একদম না থাকলে ট্রানজ্যাকশনাল এনকিউ ভাঙা |
| লম্বা ভিডিও ঠিক এক মিনিটে `context canceled` | `river_job`-এর শেষ এরর | ওয়ার্কারে `Timeout`, আর `RescueStuckJobsAfter` তার চেয়ে বড় |
| `ready`, কিন্তু প্লেয়ারে CORS এরর | `curl -sD - -o /dev/null -H 'Origin: https://example.com' URL`-এ `Access-Control-Allow-Origin` কয়টা | ঠিক একটা থাকতে হবে; স্টোরেজেরটা `proxy_hide_header` দিয়ে লুকান |
| Safari-তে চলে না, Chrome-এ চলে | মাস্টার প্লেলিস্টের `Content-Type` আর `CODECS` | `application/vnd.apple.mpegurl`, আর প্রতিটা `STREAM-INF`-এ `CODECS`; আরও কারণ চ্যাপ্টার ১৩-এ |

## মূল শিক্ষা

1. **একটা VOD প্ল্যাটফর্মের ছয়টা টুকরো:** প্রাইভেট আপলোড স্টোরেজ, ক্যাটালগ ডেটাবেস, জব কিউ, এনকোড ওয়ার্কার, শুধু-পড়া মিডিয়া স্টোরেজ, আর সামনে একটা এজ ও প্লেব্যাক API। বড় প্ল্যাটফর্মে প্রতিটা বড় হয়, কিন্তু টুকরোগুলো একই।
2. **ব্রাউজার সরাসরি স্টোরেজে আপলোড করে, presigned URL দিয়ে।** API ফাইলের বাইট ছোঁয় না। Signature-এ হোস্ট থাকে, তাই মাঝের প্রক্সিকে হোস্ট অক্ষত রাখতে হয়।
3. **স্ট্যাটাস বদল আর জব একই ট্রানজ্যাকশনে।** কিউ ডেটাবেসের ভেতরে থাকলে "processing কিন্তু জব নেই" অবস্থা তৈরিই হয় না।
4. **"Complete" এন্ডপয়েন্ট আইডেম্পোটেন্ট হতে হবে।** ক্লায়েন্ট রিট্রাই করবেই।
5. **স্থায়ী আর ক্ষণস্থায়ী এরর আলাদা করুন।** ভাঙা ফাইল একবারেই বাতিল, নেটওয়ার্কের এরর ব্যাকঅফ সহ রিট্রাই।
6. **জব লাইব্রেরির ডিফল্টগুলো পড়ুন।** River-এর এক মিনিটের টাইমআউট ছোট টেস্ট ফাইলে কখনো ধরা পড়ে না।
7. **সব ফাইল আপলোডের পরেই `ready`,** আর রি-এনকোড যেন বারবার চালালেও একই ফল দেয়।
8. **সোর্সের চেয়ে বড় রেন্ডিশন বানাবেন না।** নকল 1080p শুধু ব্যান্ডউইথ খায়।
9. **এরর রেসপন্সের হেডারও ডিজাইনের অংশ।** একটা 404-এ `immutable` বসলে সেটা এক বছরের সমস্যা।
10. **কোড আসলে চালিয়ে দেখুন।** এই চ্যাপ্টারের ছয়টা বাগের পাঁচটা কোড পড়ে ধরা পড়েনি, চালিয়ে পড়েছে।
