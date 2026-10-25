---
title: 'আপলোড: বড় ভিডিও নির্ভরযোগ্যভাবে তোলা'
subtitle: 'কেন এক টানে গিগাবাইট ফাইল আপলোড ভেঙে যায়, আর কীভাবে presigned URL, S3 মাল্টিপার্ট আর tus দিয়ে মোবাইল নেটওয়ার্কেও আপলোড শেষ পর্যন্ত পৌঁছায়।'
chapter: 2
level: 'beginner'
readingTime: '১৮ মিনিট'
topics: ['upload', 'resumable upload', 'tus', 's3 multipart', 'presigned url', 's3-compatible storage']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

রাজি মিরপুর থেকে উত্তরায় বাসা বদলাচ্ছে। একটা বড় ট্রাকে এক বারে সব জিনিস তোলার চেষ্টা করেছিল আগের বাসা বদলে, আর মাঝপথে বিমানবন্দর সড়কে ট্রাক নষ্ট হয়ে যায়। পুরো দিন নষ্ট, জিনিস আবার নামিয়ে আবার তুলতে হয়। এবার সে বুদ্ধি করে একটা ছোট পিকআপ ভাড়া নেয়। সব জিনিস চল্লিশটা বাক্সে ভাগ করে, প্রতিটা বাক্সের গায়ে নম্বর লেখে, আর একটা খাতায় তালিকা করে: বাক্স ১ থেকে ৪০।

পিকআপ বারবার যায়-আসে, প্রতি ট্রিপে পাঁচ-ছয়টা বাক্স। উত্তরার নতুন বাসায় তার বোন মরিয়ম দাঁড়িয়ে থাকে, প্রতিটা বাক্স নামলে খাতায় টিক দেয়। দুপুরে হঠাৎ বৃষ্টি, রাস্তা বন্ধ, পিকআপ তিন ঘণ্টা আটকে থাকে। বিকেলে আবার শুরু করার সময় রাজি সব বাক্স আবার পাঠায় না; সে মরিয়মকে ফোন করে জিজ্ঞেস করে, "কতগুলো পৌঁছেছে?" মরিয়ম খাতা দেখে বলে, "১ থেকে ২৩ এসেছে।" রাজি ২৪ থেকে আবার শুরু করে।

একটা বাক্স পৌঁছানোর পর মরিয়ম খুলে দেখে কাচের গ্লাসগুলো ভাঙা। সে খাতায় লেখে, "বাক্স ৩১ নষ্ট, আবার পাঠাও।" রাজি শুধু ওই একটা বাক্স আবার গুছিয়ে পাঠায়। আর বাড়িওয়ালা শুরুতেই রাজিকে একটা চাবি দিয়েছিল, যেটা শুধু ওই দিনের জন্য, আর শুধু চারতলার ওই ফ্ল্যাটের দরজা খোলে; পিকআপ চালক নিজে বাড়িওয়ালার অফিসে না গিয়েও সরাসরি জিনিস ঢোকাতে পারে।

মিলিয়ে নিই: এক বারে বড় ট্রাক হলো **একটা লম্বা HTTP রিকোয়েস্টে পুরো ফাইল আপলোড**, যা মাঝপথে কাটলে সব শুরু থেকে। চল্লিশটা নম্বর দেওয়া বাক্স হলো **চাংক বা পার্ট**, আর খাতার তালিকা হলো **আপলোড অফসেট বা পার্ট লিস্ট**। "কতগুলো পৌঁছেছে?" প্রশ্নটা হলো tus-এর **HEAD রিকোয়েস্ট** বা S3-এর **ListParts**, আর ২৪ থেকে আবার শুরু করা হলো **রিজিউমেবল আপলোড**। ভাঙা গ্লাসের বাক্স ধরা পড়া হলো **চেকসাম**, আর শুধু ওই একটা আবার পাঠানো হলো **পার্ট-লেভেলের রিট্রাই**। এক দিনের, এক দরজার চাবি হলো **presigned URL**, যা দিয়ে ক্লায়েন্ট API সার্ভারকে পাশ কাটিয়ে সরাসরি স্টোরেজে লেখে। বাংলাদেশের মোবাইল নেটওয়ার্কে এক ঘণ্টার লেকচার ভিডিও আপলোড করতে গেলে এর প্রতিটা অংশই দরকার পড়ে।

## কেন সাধারণ আপলোড ভেঙে যায়

ছবি আপলোডের কোড ভিডিওতে চালালে যা হয়:

```text
POST /upload  (multipart/form-data, 1.8 GB)
  │
  ├─ browser holds the whole request open
  ├─ nginx client_max_body_size 1m        → 413 Request Entity Too Large
  ├─ raise it; nginx buffers to disk      → temp disk fills on the API box
  ├─ proxy_read_timeout 60s               → 504 halfway through
  ├─ phone switches from Wi-Fi to 4G      → connection reset, start from 0
  └─ user locks the screen                → OS suspends the tab, start from 0
```

ছবি এক-দুই MB, কয়েক সেকেন্ডে শেষ। ভিডিও কয়েকশো MB থেকে কয়েক GB, আর ঢাকার একটা মোবাইল কানেকশনে আপলোড স্পিড ২-১০ Mbps হলে ১ GB তুলতে ১৫ থেকে ৭০ মিনিট লাগে (আনুমানিক)। এক ঘণ্টায় একবারও নেটওয়ার্ক না কাটার সম্ভাবনা খুব কম। তাই ভিডিও আপলোডের তিনটা নিয়ম:

1. **ফাইল API সার্ভারের ভেতর দিয়ে যাবে না**: ক্লায়েন্ট সরাসরি object storage-এ লেখে।
2. **ফাইল টুকরো করে যাবে**: প্রতিটা টুকরো আলাদা রিকোয়েস্ট, আলাদা রিট্রাই।
3. **কাটলে যেখানে থেমেছিল সেখান থেকে**: সার্ভার মনে রাখে কতটা পৌঁছেছে।

ফাইল আপলোডের সাধারণ প্যাটার্ন (proxied বনাম direct, ভ্যালিডেশন, ভাইরাস স্ক্যান) আছে [ফাইল আপলোড](/notes/storage/03-file-uploads) চ্যাপ্টারে। এখানে ভিডিওর বিশেষ সমস্যাগুলো।

## উপায় ১: presigned PUT, ছোট ফাইলের জন্য

**presigned URL** হলো স্টোরেজের একটা URL, যার সাথে একটা সাইন আর মেয়াদ জুড়ে দেওয়া। যার কাছে URL আছে, সে মেয়াদের মধ্যে শুধু ওই একটা অবজেক্ট কী-তে লিখতে পারে। API সার্ভার শুধু সাইন করে দেয়, ফাইল ছোঁয় না।

<Mermaid
title="Presigned PUT দিয়ে সরাসরি আপলোড"
code={`sequenceDiagram
  participant C as "Browser"
  participant A as "Platform API"
  participant S as "S3-compatible storage"
  C->>A: "POST /assets (title, size)"
  A->>A: "insert asset row, status created"
  A-->>C: "asset_id + presigned PUT URL (15 min)"
  C->>S: "PUT file bytes to presigned URL"
  S-->>C: "200 OK + ETag"
  C->>A: "POST /assets/:id/complete"
  A->>S: "HEAD object: exists? size?"
  A->>A: "status uploading to processing, enqueue ingest job"`}
/>

নিচের উদাহরণে `minio-go` ক্লায়েন্ট লাইব্রেরি ব্যবহার করা হয়েছে, যেটা যেকোনো S3 API-তে কথা বলে: Garage, Ceph RGW, AWS S3, বা অন্য যেকোনো S3-compatible স্টোরেজ। সাইন করা এক লাইনের কাজ, আর হ্যান্ডলারটা chi রাউটারে বসে।

<Callout type="info">

**স্টোরেজ সার্ভার বাছাই নিয়ে এক লাইন:** ২০২৬ সালের অক্টোবর অনুযায়ী MinIO-র কমিউনিটি এডিশনের GitHub রিপোজিটরি আর্কাইভ করা আর এটা রক্ষণাবেক্ষণ মোডে; নতুন সেলফ-হোস্টেড সেটআপে Garage-এর মতো সক্রিয়ভাবে রক্ষণাবেক্ষণ হওয়া S3-compatible স্টোরেজ বিবেচনা করুন, আর বাছাইয়ের আগে প্রজেক্টের বর্তমান অবস্থা নিজে দেখে নিন। Garage-এর [S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/) পেজ অনুযায়ী presigned URL, পুরো মাল্টিপার্ট API, CORS, আর `AbortIncompleteMultipartUpload` লাইফসাইকেল রুল সমর্থিত। এই চ্যাপ্টারের সব কোড S3 API-র উপর, তাই যেকোনোটায় চলে।

</Callout>

```go
package upload

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
)

const maxSourceBytes = 20 << 30 // 20 GiB, our product limit, not a storage limit

type createReq struct {
	Title string `json:"title"`
	Size  int64  `json:"size"`
}

type createResp struct {
	AssetID   string `json:"asset_id"`
	UploadURL string `json:"upload_url"`
	ExpiresAt string `json:"expires_at"`
}

type Handler struct {
	S3     *minio.Client
	Bucket string
	Assets AssetStore // inserts the row, returns the id
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_body")
		return
	}
	if req.Size <= 0 || req.Size > maxSourceBytes {
		writeErr(w, http.StatusUnprocessableEntity, "source_too_large")
		return
	}

	id := uuid.New()
	key := "source/" + id.String() // never the user's filename: no collisions, no path tricks

	if err := h.Assets.Create(r.Context(), id, req.Title, key, req.Size); err != nil {
		writeErr(w, http.StatusInternalServerError, "internal")
		return
	}

	ttl := 15 * time.Minute
	u, err := h.S3.PresignedPutObject(r.Context(), h.Bucket, key, ttl)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(createResp{
		AssetID:   id.String(),
		UploadURL: u.String(),
		ExpiresAt: time.Now().Add(ttl).UTC().Format(time.RFC3339),
	})
}
```

ব্রাউজার থেকে আপলোড:

```bash
curl -X PUT --upload-file lecture-07.mp4 \
  -H "Content-Type: video/mp4" \
  "https://s3.baytalhikma.org/vod-source/source/5b0e7c1a-...?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=..."
```

```text
HTTP/1.1 200 OK
ETag: "9a3f0c6d2e1b4a5c8d7e6f5a4b3c2d1e"
Content-Length: 0
```

<Callout type="warning">

presigned **PUT** ফাইলের আকার সীমিত করতে পারে না: যার কাছে URL আছে সে ১০০ GB পাঠালেও স্টোরেজ নিয়ে নেবে। আকার আটকাতে হলে presigned **POST policy** ব্যবহার করুন, যেখানে `content-length-range` শর্ত বসানো যায় (minio-go-তে `PresignedPostPolicy` আর `SetContentLengthRange`)। আর যেটাই করুন, `complete` কলে API নিজে `HEAD` করে আসল আকার যাচাই করবে; ক্লায়েন্টের বলা আকার বিশ্বাস করবেন না।

</Callout>

একটা PUT-এ পুরো ফাইল যায় বলে এটা মাঝপথে কাটলে শুরু থেকে আবার। তাই presigned PUT ঠিক আছে কয়েকশো MB পর্যন্ত, ভালো নেটওয়ার্কে। তার উপরে লাগে টুকরো করে আপলোড।

### CORS: প্রথম যে দেয়ালে ধাক্কা লাগে

ব্রাউজার অন্য ডোমেইনের স্টোরেজে সরাসরি PUT করলে আগে একটা OPTIONS preflight পাঠায়। বাকেটে CORS না থাকলে আপলোড শুরুই হয় না, আর কনসোলে শুধু "blocked by CORS policy" দেখা যায়।

```bash
curl -i -X OPTIONS "https://s3.baytalhikma.org/vod-source/source/test" \
  -H "Origin: https://baytalhikma.org" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
```

```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://baytalhikma.org
Access-Control-Allow-Methods: PUT, POST, GET, HEAD
Access-Control-Allow-Headers: content-type
Access-Control-Expose-Headers: ETag
```

`Access-Control-Expose-Headers: ETag` লাইনটা মাল্টিপার্টের জন্য জরুরি: ব্রাউজার প্রতিটা পার্টের ETag পড়তে না পারলে শেষে মাল্টিপার্ট complete করা যায় না। (CORS রেসপন্সটা উদাহরণ; আপনার স্টোরেজ সার্ভার আর কনফিগ অনুযায়ী আলাদা দেখাবে।)

## উপায় ২: S3 মাল্টিপার্ট আপলোড

S3 API-এর নিজস্ব টুকরো-আপলোড ব্যবস্থা। Garage, Ceph RGW সহ প্রায় সব S3-compatible স্টোরেজ এটা সাপোর্ট করে।

```text
1. CreateMultipartUpload(bucket, key)          → UploadId
2. UploadPart(UploadId, partNumber=1, bytes)   → ETag-1
   UploadPart(UploadId, partNumber=2, bytes)   → ETag-2
   ...                                          (parallel, any order, retry each)
3. CompleteMultipartUpload(UploadId, [(1,ETag-1),(2,ETag-2),...])
   → storage stitches the parts into one object
   or
   AbortMultipartUpload(UploadId)              → parts deleted
```

রিজিউম করার উপায় হলো `ListParts(UploadId)`: কোন পার্টগুলো পৌঁছেছে সেটা স্টোরেজই বলে দেয়, ঠিক মরিয়মের খাতার মতো।

### সীমাগুলো

২০২৬ সালের অক্টোবরে AWS-এর ডকুমেন্টেশন অনুযায়ী (Garage বা অন্য S3-compatible স্টোরেজে সংখ্যা আলাদা হতে পারে, নিজেরটার ডকস দেখে নিন):

| বিষয় | সীমা |
| --- | --- |
| প্রতি আপলোডে সর্বোচ্চ পার্ট | ১০,০০০ |
| পার্ট নম্বর | ১ থেকে ১০,০০০ |
| পার্টের আকার | ৫ MiB থেকে ৫ GiB (শেষ পার্টের কোনো ন্যূনতম নেই) |
| একটা ListParts রেসপন্সে সর্বোচ্চ পার্ট | ১,০০০ (বেশি হলে পেজিনেশন) |

সূত্র: AWS-এর [multipart upload limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) পেজ।

**পার্টের আকার ঠিক করার হিসাব:** ১০,০০০ পার্টের সীমা থাকায় ফাইল যত বড়, পার্ট তত বড় হতে হবে। ২০ GiB ফাইলে ৫ MiB পার্ট দিলে ৪,০৯৬টা পার্ট, ঠিক আছে। কিন্তু মোবাইলে খুব বড় পার্ট মানে একটা পার্ট কাটলে বেশি ডেটা আবার পাঠানো। ব্যবহারিক নিয়ম:

```go
// Pick the smallest part size that stays under the part-count limit,
// but never below the 5 MiB minimum. Small parts lose less on a dropped connection.
func partSize(fileSize int64) int64 {
	const minPart = 5 << 20
	const maxParts = 10_000
	size := (fileSize + maxParts - 1) / maxParts
	if size < minPart {
		return minPart
	}
	return size
}
```

### অর্ধেক আপলোড: অদৃশ্য খরচ

ইউজার ৮০% আপলোড করে ট্যাব বন্ধ করে দিল। মাল্টিপার্ট আপলোডটা complete বা abort কোনোটাই হয়নি, তাই পার্টগুলো স্টোরেজে পড়ে আছে, বাকেটের লিস্টে দেখা যায় না, কিন্তু জায়গা নিচ্ছে আর টাকা খাচ্ছে। সমাধান একটা লাইফসাইকেল রুল:

```json
{
  "Rules": [
    {
      "ID": "abort-stale-multipart",
      "Status": "Enabled",
      "Filter": { "Prefix": "source/" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 2 }
    }
  ]
}
```

Garage-এর ডকস অনুযায়ী এটা লাইফসাইকেলের যে দুটো অ্যাকশন সমর্থন করে তার একটা (অন্যটা `Expiration`); অন্য স্টোরেজে এর নিজস্ব ব্যবস্থা থাকতে পারে, তার ডকসে দেখে নিন, আর একবার নিজে পরীক্ষা করুন: একটা আপলোড শুরু করে ফেলে রাখুন, দুই দিন পর `ListMultipartUploads` চালিয়ে দেখুন সেটা গেছে কিনা।

### ব্রাউজার থেকে মাল্টিপার্ট

ব্রাউজারের কাছে S3 ক্রেডেনশিয়াল থাকে না, তাই প্রতিটা পার্টের জন্য API একটা presigned URL দেয়:

```text
POST /assets/:id/multipart          → { uploadId, partSize, partCount }
GET  /assets/:id/multipart/parts?n=1..10  → presigned URL per part (short TTL)
     browser PUTs each part, keeps ETag
GET  /assets/:id/multipart/status   → server calls ListParts, returns done part numbers
POST /assets/:id/multipart/complete → server calls CompleteMultipartUpload
```

এতে API-কে চারটা এন্ডপয়েন্ট আর পার্ট-URL সাইন করার লজিক লিখতে হয়। ঠিক এই কাজটা একটা প্রমিত প্রোটোকলে বাঁধা আছে: tus।

## উপায় ৩: tus, রিজিউমেবল আপলোডের খোলা প্রোটোকল

**tus** একটা খোলা HTTP প্রোটোকল শুধু এই একটা কাজের জন্য: থেমে যাওয়া আপলোড আবার চালু করা। ২০২৬ সালের অক্টোবরে [tus.io-র স্পেসিফিকেশন](https://tus.io/protocols/resumable-upload) অনুযায়ী বর্তমান ভার্সন `1.0.0`; প্রতিটা রিকোয়েস্ট আর রেসপন্সে (OPTIONS ছাড়া) `Tus-Resumable: 1.0.0` হেডার থাকে।

পুরো প্রোটোকলের মূল অংশ তিনটা রিকোয়েস্ট:

```text
POST    /files/                  Upload-Length: 1932735283      (creation extension)
        → 201 Created, Location: /files/a1b2c3

HEAD    /files/a1b2c3
        → 200 OK, Upload-Offset: 0

PATCH   /files/a1b2c3            Upload-Offset: 0
        Content-Type: application/offset+octet-stream
        (bytes...)
        → 204 No Content, Upload-Offset: 52428800

--- connection drops ---

HEAD    /files/a1b2c3
        → 200 OK, Upload-Offset: 52428800     ← "1 to 23 arrived"

PATCH   /files/a1b2c3            Upload-Offset: 52428800
        → continues from there
```

গুরুত্বপূর্ণ নিয়মগুলো স্পেক থেকে:

- **HEAD** বর্তমান অফসেট ফেরত দেয়, আর রেসপন্স ক্যাশ হতে পারে না।
- **PATCH**-এর `Upload-Offset` সার্ভারের অফসেটের সাথে না মিললে সার্ভার `409 Conflict` দেয় আর কিছুই লেখে না। এটা দুটো ট্যাব থেকে একই ফাইল আপলোডের দুর্ঘটনা ঠেকায়।
- **Creation** এক্সটেনশনে `Upload-Metadata` হেডারে কী-ভ্যালু জোড়া থাকে, ভ্যালু Base64-এ: `filename bGVjdHVyZS0wNy5tcDQ=,asset_id NWIwZTdjMWE=`।
- **Checksum** এক্সটেনশনে প্রতিটা PATCH-এর সাথে `Upload-Checksum: sha1 BASE64_DIGEST` পাঠানো যায়; না মিললে সার্ভার `460 Checksum Mismatch` দেয়। এটাই মরিয়মের ভাঙা গ্লাস ধরা।
- **Expiration** এক্সটেনশনে সার্ভার `Upload-Expires` দিয়ে জানায় কতক্ষণ পর্যন্ত রিজিউম করা যাবে।

### tusd: নিজের সার্ভারে

**tusd** হলো tus প্রজেক্টের নিজস্ব Go সার্ভার, S3-compatible স্টোরেজের সাথে সরাসরি কাজ করে। একটা সেলফ-হোস্টেড S3 এন্ডপয়েন্টের সাথে (ঠিকানা আর রিজিয়নের নাম আপনার স্টোরেজের কনফিগ থেকে):

```bash
AWS_ACCESS_KEY_ID=vod-uploader \
AWS_SECRET_ACCESS_KEY=... \
AWS_REGION=garage \
tusd -s3-bucket vod-source \
     -s3-endpoint http://127.0.0.1:3900 \
     -s3-object-prefix source/ \
     -hooks-http http://127.0.0.1:8080/internal/tusd-hooks \
     -hooks-enabled-events pre-create,post-finish
```

ভেতরে tusd প্রতিটা tus আপলোডকে একটা S3 মাল্টিপার্ট আপলোডে রূপ দেয়: মেটাডেটা থাকে একটা `.info` অবজেক্টে, আর আসল ফাইল অবজেক্টটা তৈরি হয় আপলোড শেষ হওয়ার পর। tusd-এর ডকস অনুযায়ী PATCH-এর ডেটা S3-তে যাওয়ার আগে কিছুক্ষণ লোকাল ডিস্কে থাকে, তাই tusd চালানো মেশিনে খালি জায়গা রাখুন। একাধিক tusd ইনস্ট্যান্স একই বাকেটে চালালে একটা ডিস্ট্রিবিউটেড লক কনফিগার করতে হয়। (ফ্ল্যাগের নাম আর আচরণ ২০২৬ সালের অক্টোবরে [tusd-এর S3 ডকস](https://tus.github.io/tusd/storage-backends/aws-s3/) অনুযায়ী; আপগ্রেডের আগে আবার দেখে নিন।)

### হুক দিয়ে প্ল্যাটফর্মের সাথে জোড়া

tusd নিজে জানে না কে আপলোড করছে বা অ্যাসেট কোনটা। এই সংযোগটা হয় হুক দিয়ে: tusd প্রতিটা ঘটনায় আপনার API-তে একটা HTTP কল করে।

| হুক | কখন | আপনার API যা করে |
| --- | --- | --- |
| `pre-create` | আপলোড শুরুর আগে | টোকেন যাচাই, আকার যাচাই, অ্যাসেট `uploading` করা; দরকার হলে `RejectUpload: true` দিয়ে বাতিল |
| `post-receive` | ডেটা আসতে থাকলে (ডিফল্টে বন্ধ) | প্রোগ্রেস দেখানো (থ্রটল করে) |
| `post-finish` | আপলোড শেষ | অ্যাসেট `processing`, ইনজেস্ট জব কিউতে |
| `post-terminate` | ক্লায়েন্ট বাতিল করলে | অ্যাসেট `created`-এ ফেরত বা মুছে ফেলা |

```go
type hookReq struct {
	Type  string `json:"Type"`
	Event struct {
		Upload struct {
			ID       string            `json:"ID"`
			Size     int64             `json:"Size"`
			MetaData map[string]string `json:"MetaData"`
			Storage  map[string]string `json:"Storage"`
		} `json:"Upload"`
		HTTPRequest struct {
			Header map[string][]string `json:"Header"`
		} `json:"HTTPRequest"`
	} `json:"Event"`
}

func (h *Handler) TusdHook(w http.ResponseWriter, r *http.Request) {
	var req hookReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad hook", http.StatusBadRequest)
		return
	}
	switch req.Type {
	case "pre-create":
		assetID := req.Event.Upload.MetaData["asset_id"]
		token := first(req.Event.HTTPRequest.Header["Authorization"])
		if !h.Auth.CanUpload(r.Context(), token, assetID, req.Event.Upload.Size) {
			json.NewEncoder(w).Encode(map[string]any{
				"RejectUpload": true,
				"HTTPResponse": map[string]any{"StatusCode": 403, "Body": `{"error":"upload_not_allowed"}`},
			})
			return
		}
	case "post-finish":
		key := req.Event.Upload.Storage["Key"]
		if err := h.Assets.MarkUploaded(r.Context(), req.Event.Upload.MetaData["asset_id"], key); err != nil {
			http.Error(w, "retry", http.StatusInternalServerError) // tusd retries failed hooks
			return
		}
	}
	w.WriteHeader(http.StatusOK)
}
```

হুকের JSON ফিল্ডের নাম (`Upload.Storage["Key"]` ইত্যাদি) tusd-এর ভার্সন অনুযায়ী বদলাতে পারে; নিজের ভার্সনের [হুক ডকস](https://tus.github.io/tusd/advanced-topics/hooks/) দেখে মিলিয়ে নিন। হুক এন্ডপয়েন্ট শুধু লোকাল নেটওয়ার্কে খোলা রাখুন, ইন্টারনেটে না।

### ক্লায়েন্ট: tus-js-client বা Uppy

ব্রাউজারে নিজে tus লেখার দরকার নেই। `tus-js-client` রিজিউম, রিট্রাই আর প্রোগ্রেস সামলায়, আর আগের অসম্পূর্ণ আপলোডের URL `localStorage`-এ মনে রাখে, যাতে পেজ রিফ্রেশ করলেও আগের জায়গা থেকে চলে:

```ts
import * as tus from 'tus-js-client';

export function uploadLecture(file: File, assetId: string, token: string, onProgress: (pct: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const upload = new tus.Upload(file, {
			endpoint: 'https://upload.baytalhikma.org/files/',
			chunkSize: 8 * 1024 * 1024, // smaller chunks lose less on flaky mobile links
			retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
			metadata: { asset_id: assetId, filename: file.name, filetype: file.type },
			headers: { Authorization: `Bearer ${token}` },
			onProgress: (sent, total) => onProgress(Math.floor((sent / total) * 100)),
			onError: reject,
			onSuccess: () => resolve()
		});
		upload.findPreviousUploads().then((previous) => {
			if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
			upload.start();
		});
	});
}
```

`tus-js-client`-এর অপশনের নাম আর আচরণ তার নিজস্ব README-তে দেখে নিন; ভার্সনভেদে বদলায়।

## কোনটা কখন

| পরিস্থিতি | উপায় |
| --- | --- |
| ছোট ক্লিপ (কয়েকশো MB পর্যন্ত), ভালো নেটওয়ার্ক | presigned PUT বা POST policy |
| বড় ফাইল, নিজের ক্লায়েন্ট, S3-এর বাইরে কিছু চাই না | presigned মাল্টিপার্ট |
| বড় ফাইল, মোবাইল, রিফ্রেশে রিজিউম, অনেক রকম ক্লায়েন্ট | tus + tusd |
| ইউজার একটা URL দেয় (Google Drive, Dropbox লিংক) | সার্ভার-সাইড "ফেচ" জব: ওয়ার্কার নিজে ডাউনলোড করে স্টোরেজে তোলে |

## আপলোডের আগে আর পরে যাচাই

**আগে (pre-create বা অ্যাসেট তৈরির সময়):** আকার আপনার প্রোডাক্টের সীমার মধ্যে কিনা, ইউজারের কোটা আছে কিনা, এক্সটেনশন মোটামুটি ভিডিওর মতো কিনা। শেষেরটা শুধু UX-এর জন্য: ভুল ফাইল বাছাই করলে তাড়াতাড়ি জানানো।

**পরে (complete বা post-finish-এ):** স্টোরেজে অবজেক্ট আছে কিনা আর তার আকার মিলছে কিনা।

<Callout type="danger">

`Content-Type: video/mp4` বা `.mp4` এক্সটেনশন কিছুই প্রমাণ করে না। ক্লায়েন্ট যা খুশি পাঠাতে পারে, আর ফাইলের প্রথম কয়েকটা বাইট দেখে MIME sniffing-ও ভাঙা বা অদ্ভুত ভিডিও ধরতে পারে না। ফাইলটা আসলে কী, সেটা জানার একমাত্র নির্ভরযোগ্য উপায় ffprobe দিয়ে খুলে দেখা, আর পুরোটা ডিকোড করে দেখা। সেটা পরের চ্যাপ্টারের কাজ।

</Callout>

## প্রোগ্রেস UI: সৎ থাকুন

- আপলোড প্রোগ্রেস আর প্রসেসিং প্রোগ্রেস আলাদা দেখান। "১০০%" দেখানোর পর আরো দশ মিনিট কিছু না ঘটলে ইউজার ভাবে আটকে গেছে।
- নেটওয়ার্ক কাটলে "আবার চেষ্টা করছি..." দেখান, এরর না। tus ক্লায়েন্ট নিজেই রিট্রাই করছে।
- ট্যাব বন্ধ করার আগে `beforeunload`-এ সতর্ক করুন, যতক্ষণ আপলোড চলছে।
- মোবাইল ব্রাউজার স্ক্রিন লক হলে ব্যাকগ্রাউন্ড ট্যাব থামিয়ে দিতে পারে। রিজিউম না থাকলে এটাই মোবাইলে সবচেয়ে বেশি আপলোড নষ্টের কারণ।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত করুন | সমাধান |
| --- | --- | --- |
| ব্রাউজারে আপলোড শুরুই হয় না, কনসোলে CORS এরর | উপরের `curl -X OPTIONS` দিয়ে preflight চালান, `Access-Control-Allow-Origin` আসে কিনা | বাকেটে বা tusd-এর সামনের nginx-এ CORS ঠিক করুন; মাল্টিপার্টে `ETag` expose করুন |
| `403 SignatureDoesNotMatch` | presigned URL-এ যে `Content-Type` দিয়ে সাইন হয়েছিল, ক্লায়েন্ট আলাদা পাঠাচ্ছে কিনা; সার্ভারের ঘড়ি ঠিক আছে কিনা (`timedatectl`) | ক্লায়েন্ট আর সাইনার একই হেডার ব্যবহার করুক; সার্ভারে NTP চালু রাখুন |
| `403 Request has expired` | URL-এর `X-Amz-Date` আর `X-Amz-Expires` দেখুন | ধীর আপলোডের জন্য মেয়াদ বাড়ান, বা প্রতিটা পার্টের জন্য আলাদা স্বল্পমেয়াদি URL দিন |
| `413 Request Entity Too Large` | রেসপন্সের `Server` হেডার দেখুন, nginx নাকি স্টোরেজ | ফাইল API-র ভেতর দিয়ে যাচ্ছে, সরাসরি স্টোরেজে পাঠান; tusd-এর সামনে nginx থাকলে `client_max_body_size` চাংক সাইজের চেয়ে বড় রাখুন |
| মাল্টিপার্ট complete করলে `InvalidPart` বা `EntityTooSmall` | `ListParts` চালিয়ে পার্টের আকার আর ETag দেখুন | শেষ পার্ট ছাড়া প্রতিটা পার্ট কমপক্ষে ৫ MiB; ETag-গুলো কোট সহ ঠিক ক্রমে পাঠান |
| tus PATCH বারবার `409 Conflict` | `curl -I -H "Tus-Resumable: 1.0.0" https://upload.baytalhikma.org/files/a1b2c3` দিয়ে সার্ভারের অফসেট দেখুন | ক্লায়েন্ট পুরনো অফসেট পাঠাচ্ছে বা দুটো ট্যাব একই আপলোড চালাচ্ছে; PATCH-এর আগে সবসময় HEAD করুক |
| আপলোড শেষ, কিন্তু অ্যাসেট `uploading`-এই রয়ে গেল | tusd লগে `post-finish` হুক সফল হয়েছিল কিনা; API লগে হুক এসেছিল কিনা | হুক এন্ডপয়েন্ট ব্যর্থ হলে 5xx দিন যাতে রিট্রাই হয়; একটা পিরিয়ডিক জব স্টোরেজে ফাইল আছে এমন `uploading` অ্যাসেট খুঁজে ঠিক করে |
| স্টোরেজের বিল বাড়ছে, কিন্তু অবজেক্ট সংখ্যা স্থির | `aws s3api list-multipart-uploads --endpoint-url $S3_ENDPOINT --bucket vod-source` | অসম্পূর্ণ মাল্টিপার্টের লাইফসাইকেল রুল যোগ করুন |
| tusd মেশিনের ডিস্ক ভরে যাচ্ছে | `df -h` আর tusd-এর টেম্প ডিরেক্টরি | ডিস্ক বাড়ান বা চাংক সাইজ কমান; মৃত আপলোডের মেয়াদ (expiration) চালু রাখুন |

## মূল শিক্ষা

1. **ভিডিও ফাইল API সার্ভারের ভেতর দিয়ে যাবে না**: presigned URL বা tusd দিয়ে সরাসরি object storage-এ।
2. **বড় ফাইল টুকরো করে, আর কাটলে যেখানে থেমেছিল সেখান থেকে**: S3 মাল্টিপার্টে `ListParts`, tus-এ `HEAD`।
3. **S3 মাল্টিপার্টের সীমা মাথায় রাখুন**: সর্বোচ্চ ১০,০০০ পার্ট, পার্ট ৫ MiB থেকে ৫ GiB (২০২৬ সালের অক্টোবরে AWS অনুযায়ী, নিজের স্টোরেজে যাচাই করুন)।
4. **অসম্পূর্ণ আপলোড পরিষ্কার করুন**: লাইফসাইকেল রুল না থাকলে অদৃশ্য পার্ট জমতেই থাকে।
5. **tus একটা খোলা প্রোটোকল** (বর্তমানে 1.0.0), আর tusd এটা যেকোনো S3-compatible স্টোরেজের উপর নিজের সার্ভারে চালায়; হুক দিয়ে আপনার অ্যাসেটের সাথে জোড়া লাগে।
6. **ক্লায়েন্টের বলা আকার বা টাইপ বিশ্বাস করবেন না**: আপলোডের পর সার্ভার নিজে যাচাই করে, আর ফাইলটা আসলে কী তা ঠিক করে ইনজেস্ট।
7. **মোবাইল নেটওয়ার্কের জন্য ডিজাইন করুন**: ছোট চাংক, অটো রিট্রাই, রিফ্রেশে রিজিউম, আর সৎ প্রোগ্রেস UI।
