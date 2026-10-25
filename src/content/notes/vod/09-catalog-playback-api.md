---
title: 'ক্যাটালগ ও প্লেব্যাক API'
subtitle: 'VOD প্ল্যাটফর্মের সামনের দরজা — PostgreSQL ডেটা মডেল আর RLS, asset-এর লাইফসাইকেল API, প্লেব্যাক রেসপন্স, ওয়েবহুক, আইডেম্পোটেন্সি, স্থির এরর কোড, পেজিনেশন আর সার্চ।'
chapter: 9
level: 'advanced'
readingTime: '২৪ মিনিট'
topics: ['catalog', 'playback api', 'postgresql', 'rls', 'webhooks', 'idempotency', 'pagination', 'full-text search']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বসুন্ধরা সিটির গ্রাউন্ড ফ্লোরে একটা ইনফরমেশন ডেস্ক, পাশে বিশাল একটা ডিরেক্টরি বোর্ড। বোর্ডে প্রতিটা দোকানের নাম, ফ্লোর, ব্লক আর দোকান নম্বর; ক্যাটাগরি অনুযায়ী সাজানো, জুতা এক জায়গায়, ইলেকট্রনিক্স আরেক জায়গায়। ডেস্কে বসে মরিয়ম। কেউ এসে জিজ্ঞেস করে "আড়ং কোথায়?", মরিয়ম খাতা দেখে বলে "লেভেল ৪, ব্লক সি, দোকান ১২, লিফট ডানদিকে।" শুধু ঠিকানা না, সাথে কোন লিফট, কোন সিঁড়ি, এখন খোলা কিনা।

নতুন দোকান এলে মালিক একটা ফর্ম পূরণ করে জমা দেয়। ফর্মের উপরে একটা রসিদ নম্বর থাকে; কেউ ভুলে একই ফর্ম দুবার জমা দিলে মরিয়ম রসিদ নম্বর দেখে বোঝে এটা আগেরটাই, নতুন এন্ট্রি বানায় না। দোকান সাজানো শেষ হলে মল অফিস দোকানদারকে ফোন করে জানায় "আপনার দোকান বোর্ডে উঠেছে", ফোন না ধরলে কিছুক্ষণ পর আবার করে। আর প্রতিটা দোকানদার শুধু নিজের দোকানের হিসাব দেখতে পারে; পাশের দোকানের বিক্রির খাতা তার হাতে যায় না, মল অফিসের ক্লার্ক ভুল করে দিতে চাইলেও খাতার আলমারিই খোলে না। ডিরেক্টরি বোর্ড এত বড় যে একবারে সব পড়া যায় না, তাই মরিয়ম বলে "এই পাতায় বিশটা, পরের পাতা ওখান থেকে।"

মিলিয়ে নিই: ডিরেক্টরি বোর্ড হলো **ক্যাটালগ** (assets টেবিল আর মেটাডেটা), দোকানের ঠিকানা আর লিফটের তথ্য দেওয়া হলো **প্লেব্যাক API** (ম্যানিফেস্ট URL, টোকেন, ক্যাপশন, থাম্বনেইল একসাথে)। নতুন দোকানের ফর্ম হলো **asset create API**, রসিদ নম্বর দেখে ডুপ্লিকেট আটকানো হলো **আইডেম্পোটেন্সি কী**, "দোকান বোর্ডে উঠেছে" ফোন আর না ধরলে আবার ফোন হলো **ওয়েবহুক আর রিট্রাই**। প্রতিটা দোকানদারের শুধু নিজের খাতা দেখা, ক্লার্ক ভুল করলেও আলমারি না খোলা, এটাই **PostgreSQL RLS**: অ্যাপ্লিকেশন কোডে বাগ থাকলেও ডেটাবেস নিজে অন্য টেন্যান্টের সারি দেয় না। আর "এই পাতায় বিশটা, পরেরটা ওখান থেকে" হলো **কার্সর পেজিনেশন**। বাস্তবে Mux বা Cloudflare Stream-এর মতো VOD API ঠিক এই আকৃতির: asset তৈরি, অবস্থা জানা, প্লেব্যাক আইডি নেওয়া, আর ওয়েবহুকে খবর পাওয়া।

## API-ই প্রোডাক্ট

একটা VOD প্ল্যাটফর্মের ক্রেতা (একটা কোর্স সাইট, একটা নিউজ পোর্টাল) আপনার ট্রান্সকোডার দেখে না, দেখে API। তাই API আগে ডিজাইন করুন, তারপর তার পেছনে বাকি সব। চারটা রিসোর্স যথেষ্ট:

| রিসোর্স         | কী                                                                 | উদাহরণ আইডি            |
| --------------- | ------------------------------------------------------------------ | ---------------------- |
| `upload`        | একটা আপলোড সেশন, presigned বা রিজিউমেবল URL সহ (চ্যাপ্টার ২)        | `upl_3kTq9`            |
| `asset`         | একটা ভিডিও, তার অবস্থা, রেন্ডিশন, ট্র্যাক, মেটাডেটা                  | `ast_8Hn2c`            |
| `playback_id`   | একটা asset দেখার একটা "দরজা", নিজস্ব পলিসি (`public` বা `signed`)  | `pb_Zr41x`             |
| `webhook_endpoint` | ক্রেতার URL যেখানে ইভেন্ট যায়                                   | `whe_02Lm`             |

`playback_id` কেন `asset` থেকে আলাদা? কারণ একই ভিডিওর একাধিক দরজা দরকার হয়: একটা পাবলিক ট্রেলার লিঙ্ক আর একটা সাইনড পেইড লিঙ্ক, অথবা একটা লিঙ্ক বন্ধ (লিক হয়েছে) কিন্তু ভিডিও রেখে নতুন লিঙ্ক দেওয়া। asset আইডি কখনো পাবলিক URL-এ যায় না; প্লেব্যাক আইডি যায়, আর সেটা বাতিল করা যায়।

আইডিতে টাইপ প্রিফিক্স (`ast_`, `pb_`) রাখুন। লগে বা সাপোর্ট টিকিটে একটা আইডি দেখেই বোঝা যায় কোন টেবিলের, আর ভুল জায়গায় ভুল আইডি পাঠালে সাথে সাথে স্পষ্ট এরর দেওয়া যায়।

## PostgreSQL ডেটা মডেল

```sql
CREATE TABLE tenants (
  id         text PRIMARY KEY,                 -- 'tnt_baytalhikma'
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE asset_status AS ENUM ('waiting_upload', 'processing', 'ready', 'errored', 'deleted');

CREATE TABLE assets (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL REFERENCES tenants(id),
  status        asset_status NOT NULL DEFAULT 'waiting_upload',
  title         text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  duration_ms   bigint,
  aspect_ratio  text,
  error_code    text,                          -- 'input_invalid', 'no_video_stream', ...
  passthrough   text,                          -- opaque customer reference, echoed back
  search        tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('simple', title), 'A') ||
                  setweight(to_tsvector('simple', description), 'B')) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_tenant_created ON assets (tenant_id, created_at DESC, id DESC);
CREATE INDEX assets_search ON assets USING gin (search);

CREATE TABLE renditions (
  asset_id    text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  name        text NOT NULL,                   -- '1080p', '720p', 'audio-aac'
  width       int, height int, bitrate_kbps int NOT NULL, codec text NOT NULL,
  PRIMARY KEY (asset_id, name)
);

CREATE TABLE tracks (
  id          text PRIMARY KEY,
  asset_id    text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('audio', 'text')),
  language    text NOT NULL,                   -- BCP 47: 'bn', 'en', 'ar'
  label       text NOT NULL,                   -- 'বাংলা', 'English'
  is_default  boolean NOT NULL DEFAULT false,
  source      text NOT NULL CHECK (source IN ('uploaded', 'generated'))
);

CREATE TABLE playback_ids (
  id          text PRIMARY KEY,
  asset_id    text NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  policy      text NOT NULL CHECK (policy IN ('public', 'signed')),
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

কয়েকটা সিদ্ধান্ত চোখে রাখার মতো:

- **প্রতিটা টেবিলে `tenant_id`**, এমনকি child টেবিলেও (`renditions`, `tracks`)। এতে প্রতিটা টেবিলে RLS পলিসি একই রকম সরল থাকে, join ছাড়াই।
- **`status` একটা enum, আর `error_code` একটা স্থির স্ট্রিং।** ffmpeg-এর কাঁচা stderr কখনো API-তে যায় না; সেটা ইন্টারনাল লগে থাকে।
- **`passthrough`** — ক্রেতা নিজের সিস্টেমের রেফারেন্স (যেমন তাদের `lesson_id`) রাখতে পারে, আর প্রতিটা রেসপন্স ও ওয়েবহুকে সেটা ফেরত পায়। এতে তাদের নিজের ম্যাপিং টেবিল লাগে না।
- **`search` একটা generated column**, তাই ইনডেক্স সবসময় টাইটেলের সাথে মিলে থাকে। `'simple'` কনফিগারেশন কারণ PostgreSQL-এ বাংলার stemmer নেই; বিস্তারিত [Postgres ফুল-টেক্সট চ্যাপ্টারে](/notes/search/02-postgres-full-text)।

## RLS: বাগ থাকলেও অন্যের ডেটা নয়

মাল্টি-টেন্যান্ট VOD-এ সবচেয়ে ভয়ংকর বাগ হলো এক ক্রেতার ভিডিও আরেক ক্রেতার লিস্টে দেখানো। `WHERE tenant_id = $1` প্রতিটা কুয়েরিতে লেখা মনে রাখতে হয়, আর একদিন কেউ ভুলবে। RLS এই দায়িত্ব ডেটাবেসে সরিয়ে দেয়:

```sql
ALTER TABLE assets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets       FORCE  ROW LEVEL SECURITY;
ALTER TABLE renditions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON assets
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON renditions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
-- same policy on tracks and playback_ids

-- the app connects as a role that is NOT the table owner and NOT BYPASSRLS
CREATE ROLE vod_app LOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON assets, renditions, tracks, playback_ids TO vod_app;
```

প্রতিটা রিকোয়েস্ট একটা ট্রানজ্যাকশনের ভেতরে চলে যা শুরুতেই টেন্যান্ট সেট করে। `set_config(..., true)` মানে সেটিং শুধু এই ট্রানজ্যাকশনের জন্য, তাই কানেকশন পুলে ফেরত গেলে পরের রিকোয়েস্টে লিক হয় না:

```go
// WithTenant runs fn in a transaction scoped to one tenant; RLS does the filtering.
func (s *Store) WithTenant(ctx context.Context, tenantID string, fn func(*db.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID); err != nil {
		return err
	}
	if err := fn(db.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

দুটো ফাঁদ:

- **টেবিলের মালিক রোল দিয়ে কানেক্ট করলে RLS কাজ করে না** (যদি না `FORCE ROW LEVEL SECURITY` দেওয়া থাকে), আর superuser বা `BYPASSRLS` রোলে কখনোই না। মাইগ্রেশন একটা রোলে, অ্যাপ আরেক রোলে।
- **`current_setting('app.tenant_id', true)`-এর দ্বিতীয় আর্গুমেন্ট** সেটিং না থাকলে এরর না দিয়ে NULL দেয়, আর `tenant_id = NULL` কখনো সত্য নয়, তাই টেন্যান্ট সেট করতে ভুলে গেলে ফলাফল খালি আসে, অন্যের ডেটা নয়। এটাই চাই: ভুলে নিরাপদ দিকে ভাঙা।

একটা RLS টেস্ট রাখুন যা দুই টেন্যান্টে দুটো asset বানিয়ে প্রমাণ করে একজন আরেকজনেরটা দেখে না। এটা সেই টেস্ট যা ভবিষ্যতের কেউ ভুল রোলে কানেক্ট করলে ধরবে।

## Asset লাইফসাইকেল

<Mermaid
title="Asset-এর অবস্থা"
code={`stateDiagram-v2
  [*] --> waiting_upload: "POST /v1/uploads"
  waiting_upload --> processing: "upload complete"
  processing --> ready: "renditions + manifest written"
  processing --> errored: "input_invalid / encode_failed"
  waiting_upload --> errored: "upload_expired"
  ready --> deleted: "DELETE /v1/assets/id"
  errored --> deleted: "DELETE /v1/assets/id"`}
/>

এন্ডপয়েন্টগুলো:

```text
POST   /v1/uploads                    create upload session -> returns upload URL + asset id
GET    /v1/assets/ast_8Hn2c           asset with status, duration, renditions, tracks
GET    /v1/assets?limit=20&cursor=... list, newest first
PATCH  /v1/assets/ast_8Hn2c           title, description, passthrough
DELETE /v1/assets/ast_8Hn2c           soft delete now, storage purge async
POST   /v1/assets/ast_8Hn2c/playback-ids   new playback id with a policy
DELETE /v1/assets/ast_8Hn2c/playback-ids/pb_Zr41x   revoke one door
GET    /v1/playback/pb_Zr41x          everything a player needs
```

একটা `GET /v1/assets/ast_8Hn2c` রেসপন্স (illustrative):

```json
{
  "id": "ast_8Hn2c",
  "status": "ready",
  "title": "আল-জাবর: প্রথম পাঠ",
  "duration_ms": 1834200,
  "aspect_ratio": "16:9",
  "passthrough": "lesson_118",
  "renditions": [
    { "name": "1080p", "width": 1920, "height": 1080, "bitrate_kbps": 4800, "codec": "avc1.640028" },
    { "name": "720p", "width": 1280, "height": 720, "bitrate_kbps": 2600, "codec": "avc1.64001f" }
  ],
  "tracks": [
    { "id": "trk_bn01", "kind": "text", "language": "bn", "label": "বাংলা", "source": "generated" }
  ],
  "playback_ids": [{ "id": "pb_Zr41x", "policy": "signed" }],
  "created_at": "2026-10-20T08:12:44Z"
}
```

**DELETE দুই ধাপে।** API সাথে সাথে `status = 'deleted'` করে আর প্লেব্যাক আইডি বাতিল করে, ফলে ভিডিও আর চলে না। স্টোরেজ থেকে ফাইল মোছা আর CDN পার্জ একটা ব্যাকগ্রাউন্ড জবে হয় ([স্টোরেজ লেআউট চ্যাপ্টার](/notes/vod/05-storage-layout))। ইউজারকে বলুন কতক্ষণে সব মুছে যাবে; "মুছে ফেলা হয়েছে" বলে মাসের পর মাস ফাইল রেখে দেওয়া একটা ডার্ক প্যাটার্ন।

## প্লেব্যাক API: প্লেয়ারের যা যা লাগে, এক রিকোয়েস্টে

প্লেয়ার একটা আইডি দিয়ে এক কলে সব পাবে: ম্যানিফেস্ট, টোকেন, ক্যাপশন, থাম্বনেইল, পোস্টার। একাধিক রাউন্ড-ট্রিপ মানে স্টার্টআপ টাইম বাড়া।

```json
{
  "playback_id": "pb_Zr41x",
  "manifest_url": "https://stream.baytalhikma.org/v/ast_8Hn2c/master.m3u8?token=eyJhbGciOi...",
  "expires_at": "2026-10-25T14:40:00Z",
  "poster_url": "https://img.baytalhikma.org/ast_8Hn2c/poster.webp?w=1280",
  "storyboard_url": "https://img.baytalhikma.org/ast_8Hn2c/storyboard.vtt",
  "text_tracks": [{ "language": "bn", "label": "বাংলা", "default": true }],
  "duration_ms": 1834200
}
```

`signed` পলিসিতে এই এন্ডপয়েন্টে entitlement যাচাই হয় আর টোকেন বানানো হয় ([সিকিউরিটি চ্যাপ্টার](/notes/vod/08-security))। `public` পলিসিতে টোকেন লাগে না, তাই রেসপন্স নিজেই CDN-এ ছোট TTL-এ ক্যাশ করা যায়।

```go
func (h *Handler) GetPlayback(w http.ResponseWriter, r *http.Request) {
	pbID := chi.URLParam(r, "playbackID")
	pb, err := h.q.GetPlaybackForServing(r.Context(), pbID) // joins asset, filters revoked
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		apierr.Write(w, http.StatusNotFound, "playback_not_found")
		return
	case err != nil:
		apierr.Write(w, http.StatusInternalServerError, "internal")
		return
	case pb.Status != db.AssetStatusReady:
		apierr.Write(w, http.StatusConflict, "asset_not_ready")
		return
	}
	resp := buildPlayback(h.cdnBase, h.imgBase, pb)
	if pb.Policy == "signed" {
		if !h.entitled(r.Context(), auth.UserFrom(r.Context()), pb) {
			apierr.Write(w, http.StatusForbidden, "not_entitled")
			return
		}
		resp.ManifestURL, resp.ExpiresAt = h.signManifest(pb)
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=60")
	}
	writeJSON(w, http.StatusOK, resp)
}
```

## স্থির এরর কোড

এরর রেসপন্স সবসময় একই আকারের, আর `code` ফিল্ড একটা চুক্তি যা কখনো বদলায় না:

```json
{ "error": { "code": "asset_not_ready", "message": "Asset is still processing.", "request_id": "req_7f2a91" } }
```

| HTTP | `code`               | কখন                                              |
| ---- | -------------------- | ------------------------------------------------ |
| 400  | `invalid_request`    | ফিল্ড ভুল; `details[]`-এ কোন ফিল্ড               |
| 401  | `unauthenticated`    | API কী নেই বা ভুল                                |
| 403  | `not_entitled`       | দেখার অধিকার নেই                                 |
| 404  | `asset_not_found`    | নেই, বা অন্য টেন্যান্টের (দুটো আলাদা করে বলবেন না) |
| 409  | `asset_not_ready`    | প্রসেসিং চলছে                                    |
| 409  | `idempotency_conflict` | একই কী, ভিন্ন বডি                              |
| 422  | `input_invalid`      | ফাইলে ভিডিও স্ট্রিম নেই, বা পড়া যায় না           |
| 429  | `rate_limited`       | `Retry-After` হেডার সহ                            |

ক্রেতার ফ্রন্টএন্ড `code` থেকে নিজের ইউজারকে সহজ বাংলায় বার্তা দেখায়। `message` ডেভেলপারের জন্য, আর তাতেও ইন্টারনাল কিছু (SQL, ফাইল পাথ, ffmpeg আউটপুট) থাকে না। অন্য টেন্যান্টের asset চাইলে `403` না দিয়ে `404` দিন, যেন আইডি অনুমান করে অন্যের ভিডিও আছে কিনা জানা না যায়।

## আইডেম্পোটেন্সি

ক্রেতার সার্ভার `POST /v1/uploads` পাঠাল, নেটওয়ার্ক টাইমআউট হলো, আবার পাঠাল। আইডেম্পোটেন্সি না থাকলে দুটো asset তৈরি হয়, দুটোর জন্য ট্রান্সকোডিং খরচ। সমাধান `Idempotency-Key` হেডার:

```sql
CREATE TABLE idempotency_keys (
  tenant_id    text NOT NULL,
  key          text NOT NULL,
  request_hash bytea NOT NULL,
  status_code  int,
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
```

নিয়ম: প্রথম রিকোয়েস্ট সারি ঢোকায় (`INSERT ... ON CONFLICT DO NOTHING`) আর কাজ শেষে রেসপন্স রাখে। একই কী আবার এলে আর বডির হ্যাশ মিললে সংরক্ষিত রেসপন্স হুবহু ফেরত দিন। হ্যাশ না মিললে `409 idempotency_conflict`। কী চব্বিশ ঘণ্টা বা কয়েকদিন পর মুছে ফেলুন। বিস্তারিত প্যাটার্ন আছে [ওয়েবহুক আইডেম্পোটেন্সি চ্যাপ্টারে](/notes/webhooks/07-idempotency); একই নীতি এখানে উল্টো দিকে।

## ওয়েবহুক: "আপনার ভিডিও তৈরি"

ট্রান্সকোডিং মিনিট থেকে ঘণ্টা লাগে, তাই ক্রেতা পোলিং না করে ওয়েবহুক চায়। ইভেন্টগুলো:

| ইভেন্ট                  | কখন                                         |
| ----------------------- | ------------------------------------------- |
| `video.asset.created`   | আপলোড সেশন থেকে asset তৈরি                  |
| `video.asset.ready`     | প্লে করার মতো তৈরি                          |
| `video.asset.errored`   | প্রসেসিং ব্যর্থ, `error_code` সহ            |
| `video.asset.deleted`   | মুছে ফেলা হয়েছে                             |
| `video.asset.track.ready` | অটো ক্যাপশন তৈরি (চ্যাপ্টার ৭)            |

নামকরণটা ইচ্ছা করে Mux-এর ওয়েবহুক ইভেন্টের মতো রাখা (২০২৬ সালের অক্টোবরে তাদের ডকসে `video.asset.ready`, `video.asset.errored`, `video.asset.track.ready` ইত্যাদি আছে), কারণ অনেক ডেভেলপার এই আকৃতি আগে থেকেই চেনে। নিজের প্ল্যাটফর্মে যেকোনো স্থির নাম চলে, শুধু একবার ঠিক করে আর বদলাবেন না।

পেলোড (illustrative):

```json
{
  "id": "evt_4QwP0",
  "type": "video.asset.ready",
  "created_at": "2026-10-20T08:19:02Z",
  "data": { "id": "ast_8Hn2c", "status": "ready", "duration_ms": 1834200, "passthrough": "lesson_118",
            "playback_ids": [{ "id": "pb_Zr41x", "policy": "signed" }] }
}
```

তিনটা জিনিস বাধ্যতামূলক, সবগুলোর বিস্তারিত আছে ওয়েবহুক ট্র্যাকে:

- **সাইনিং** — `Webhook-Signature` হেডারে টাইমস্ট্যাম্প আর HMAC, যেন ক্রেতা নিশ্চিত হয় এটা আপনিই পাঠিয়েছেন ([সাইনিং](/notes/webhooks/04-signing))।
- **রিট্রাই** — non-2xx বা টাইমআউটে exponential backoff, কয়েক দিন পর্যন্ত, তারপর ডেড-লেটার আর ড্যাশবোর্ডে দেখা যায় এমন ব্যর্থতা ([রিট্রাই](/notes/webhooks/06-retries))।
- **ইভেন্ট `id` স্থির** — রিট্রাইতে একই `evt_` আইডি, যেন ক্রেতা ডুপ্লিকেট বাদ দিতে পারে।

**ওয়েবহুক পাঠানো আর অবস্থা বদলানো একই ট্রানজ্যাকশনে লিখুন।** asset `ready` করলেন, আর আলাদাভাবে ওয়েবহুক কিউতে ঢোকাতে গিয়ে প্রসেস মরে গেল, তাহলে ক্রেতা কখনো খবর পায় না। একই ট্রানজ্যাকশনে একটা `outbox` সারি বা River জব ঢোকান; River জব PostgreSQL-এ থাকে বলে asset আপডেটের সাথে একই ট্রানজ্যাকশনে কমিট হয়।

```go
tx, err := pool.Begin(ctx)
if err != nil {
	return err
}
defer tx.Rollback(ctx)

if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", a.TenantID); err != nil {
	return err
}
if err := db.New(tx).MarkAssetReady(ctx, db.MarkAssetReadyParams{ID: a.ID, DurationMs: dur}); err != nil {
	return err
}
// enqueued in the same tx: committed together or not at all
args := WebhookArgs{TenantID: a.TenantID, Type: "video.asset.ready", AssetID: a.ID}
if _, err := riverClient.InsertTx(ctx, tx, args, nil); err != nil {
	return err
}
return tx.Commit(ctx)
```

## পেজিনেশন

অফসেট পেজিনেশন (`?page=40`) বড় লাইব্রেরিতে ধীর আর নতুন আপলোড এলে সারি লাফায়। কার্সর পেজিনেশন `(created_at, id)` জোড়া দিয়ে:

```sql
-- name: ListAssets :many
SELECT id, status, title, duration_ms, created_at
FROM assets
WHERE status <> 'deleted'
  AND (created_at, id) < (sqlc.arg(cursor_created_at)::timestamptz, sqlc.arg(cursor_id)::text)
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_size);
```

`tenant_id`-এর কোনো শর্ত নেই, কারণ RLS সেটা যোগ করে; ইনডেক্স `(tenant_id, created_at DESC, id DESC)` তবু কাজে লাগে কারণ পলিসির শর্ত প্ল্যানারে যায়। কার্সর ক্লায়েন্টকে অস্বচ্ছ base64 স্ট্রিং হিসেবে দিন, যেন ভেতরের গঠন পরে বদলানো যায়। রেসপন্সে `next_cursor` না থাকলে শেষ পাতা। বিস্তারিত তুলনা আছে [পেজিনেশন চ্যাপ্টারে](/notes/api-design/04-pagination-filtering)।

## সার্চ

ছোট-মাঝারি লাইব্রেরিতে (কয়েক লাখ asset পর্যন্ত) PostgreSQL ফুল-টেক্সট সার্চ আলাদা সার্চ সার্ভার ছাড়াই যথেষ্ট:

```sql
-- name: SearchAssets :many
SELECT id, title, ts_rank(search, q) AS rank
FROM assets, websearch_to_tsquery('simple', sqlc.arg(query)) AS q
WHERE search @@ q AND status = 'ready'
ORDER BY rank DESC, created_at DESC
LIMIT 20;
```

বাংলা টাইটেলে stemming নেই, তাই "পাঠ" দিয়ে খুঁজলে "পাঠের" মিলবে না। ক্যাপশন ট্রান্সক্রিপ্টে খোঁজা, টাইপো সহ্য করা, বা বাংলা-ইংরেজি মিশ্র কুয়েরি দরকার হলে Meilisearch-এর মতো আলাদা ইঞ্জিনে যান ([Meilisearch চ্যাপ্টার](/notes/search/03-meilisearch))। সেখানেও প্রতিটা ডকুমেন্টে `tenant_id` রাখুন আর প্রতিটা কুয়েরিতে ফিল্টার বাধ্যতামূলক করুন, কারণ সার্চ ইঞ্জিনে RLS নেই।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ                                                      | নিশ্চিত করুন                                                                                          | সমাধান                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| লিস্ট API হঠাৎ খালি আসছে                                    | `SELECT current_setting('app.tenant_id', true)` রিকোয়েস্টের ট্রানজ্যাকশনে                            | হ্যান্ডলার `WithTenant` ছাড়া কুয়েরি চালাচ্ছে; সব কুয়েরি ওটার ভেতরে আনুন                        |
| এক টেন্যান্ট আরেকজনের asset দেখছে                           | `SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user`                         | অ্যাপ টেবিল-মালিক বা `BYPASSRLS` রোলে কানেক্টেড; আলাদা রোল আর `FORCE ROW LEVEL SECURITY`     |
| একই আপলোডে দুটো asset                                       | দুটো asset-এর `created_at` কয়েক সেকেন্ডের ব্যবধানে কিনা; রিকোয়েস্ট লগে `Idempotency-Key`             | ক্রেতাকে হেডার পাঠাতে বলুন; সার্ভারে কী-এর ইউনিক কনস্ট্রেইন্ট আছে কিনা দেখুন                  |
| ক্রেতা বলছে `asset.ready` ওয়েবহুক আসেনি                     | ওয়েবহুক ডেলিভারি লগে `evt_` আইডি আর রেসপন্স কোড                                                     | ডেলিভারি না থাকলে outbox/River জব ট্রানজ্যাকশনে ঢুকছে না; থাকলে ক্রেতার এন্ডপয়েন্ট non-2xx দিচ্ছে |
| ক্রেতা বলছে ওয়েবহুক সাইনেচার মেলে না                        | তারা কাঁচা বডি নাকি পার্স করে আবার সিরিয়ালাইজ করা বডিতে HMAC করছে                                  | কাঁচা বাইটে যাচাই করতে বলুন; টাইমস্ট্যাম্প সহনশীলতা দেখুন                                   |
| পেজিনেশনে একই asset দুই পাতায়                               | কার্সরে শুধু `created_at`, `id` নেই কিনা                                                              | `(created_at, id)` জোড়া দিয়ে কার্সর আর অর্ডার                                              |
| প্লেব্যাক API `asset_not_ready` কিন্তু ড্যাশবোর্ডে ready     | রেপ্লিকা থেকে পড়ছে কিনা; replication lag                                                              | অবস্থা-সংবেদনশীল রিড প্রাইমারি থেকে, বা ready ওয়েবহুকের পরই প্লেব্যাক চাইতে বলুন              |
| বাংলা টাইটেলে সার্চ কিছু পায় না                             | `SELECT to_tsvector('simple', title)` দেখুন শব্দগুলো আলাদা হচ্ছে কিনা                                 | ইউনিকোড নরমালাইজেশন (NFC) ইনসার্টে আর কুয়েরিতে দুই জায়গাতেই                                  |

## মূল শিক্ষা

1. **API-ই প্রোডাক্ট।** আপলোড, asset, প্লেব্যাক আইডি, ওয়েবহুক এন্ডপয়েন্ট, এই চারটা রিসোর্সেই বেশিরভাগ VOD API।
2. **প্লেব্যাক আইডি asset থেকে আলাদা রাখুন**, যেন একটা দরজা বাতিল করা যায় ভিডিও না মুছে।
3. **প্রতিটা টেবিলে `tenant_id` আর RLS**, অ্যাপ এমন রোলে কানেক্ট করে যা মালিক নয় আর `BYPASSRLS` নয়। টেন্যান্ট সেট না হলে ফলাফল খালি আসে, অন্যের নয়।
4. **এরর কোড চুক্তি, মেসেজ নয়।** ইন্টারনাল টেক্সট কখনো বাইরে যায় না; অন্য টেন্যান্টের জিনিসে `404`।
5. **প্লেব্যাক API এক কলে প্লেয়ারের সব দেয়**: ম্যানিফেস্ট, টোকেন, পোস্টার, স্টোরিবোর্ড, ক্যাপশন।
6. **লেখার এন্ডপয়েন্টে `Idempotency-Key`**, একই কী ভিন্ন বডিতে `409`।
7. **ওয়েবহুক সাইন করুন, স্থির ইভেন্ট আইডিতে রিট্রাই করুন, আর অবস্থা বদলের সাথে একই ট্রানজ্যাকশনে কিউ করুন।**
8. **কার্সর পেজিনেশন `(created_at, id)` দিয়ে**, কার্সর অস্বচ্ছ রাখুন।
9. **Postgres FTS দিয়ে শুরু করুন**; আলাদা সার্চ ইঞ্জিনে গেলে টেন্যান্ট ফিল্টার নিজে বাধ্যতামূলক করুন।
10. **ডিলিট দুই ধাপে, আর কতক্ষণে সব মোছা হবে সেটা ইউজারকে জানান।**
