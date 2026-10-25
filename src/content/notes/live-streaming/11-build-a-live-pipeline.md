---
title: 'পুরো একটা লাইভ পাইপলাইন বানানো'
subtitle: 'একটা VPS-এ শূন্য থেকে চালু লাইভ চ্যানেল: স্ট্রিম কী যাচাই করা ইনজেস্ট, তিন রেন্ডিশনের ABR ট্রান্সকোড, nginx origin, hls.js প্লেয়ার, রেকর্ডিং, আর লেটেন্সি মাপার ঘড়ি। প্রতিটা ফাইল আসলেই চালিয়ে দেখা।'
chapter: 11
level: 'advanced'
readingTime: '৩০ মিনিট'
topics: ['live streaming', 'mediamtx', 'ffmpeg', 'docker compose', 'nginx', 'hls.js', 'srt', 'rtmp', 'go']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বরগুনার এক উপকূলীয় উপজেলায় হাইসাম একটা কমিউনিটি রেডিও চালু করবে। জেলেরা সাগরে থাকে, ঘূর্ণিঝড়ের সংকেত আর বাজারদর তাদের কাছে দ্রুত পৌঁছানো দরকার। হাইসামের হাতে একটা ছোট ঘর, কিছু টাকা আর তিন মাস সময়। প্রথম দিন সে কাগজে একটা লাইন টানে: মাইক থেকে আকাশ পর্যন্ত শব্দ কোন কোন যন্ত্রের ভেতর দিয়ে যাবে। মাইক, তারপর মিক্সার, তারপর ট্রান্সমিটার, তারপর টাওয়ারের অ্যান্টেনা। প্রতিটা ধাপ আলাদা দোকান থেকে কেনা, আলাদা তার দিয়ে জোড়া, আর যেকোনো একটা খুললেই রেডিও চুপ।

স্টুডিওর দরজায় সে একটা খাতা রাখে। যে উপস্থাপক আজ অনুষ্ঠান করবে, তার নাম আর গোপন নম্বর খাতায় মেলে তবেই সে মাইকের সামনে বসতে পারে; বাইরের কেউ এসে হঠাৎ মাইক দখল করতে পারবে না। মিক্সারে ফারাবি বসে, মাইকের একটা শব্দকে তিন রকম করে পাঠায়: একটা পূর্ণ মানের এফএম-এ, একটা হালকা মানের মোবাইল স্ট্রিমে, একটা খুব হালকা ফিচার ফোনের জন্য। ট্রান্সমিটারের পাশে একটা রেকর্ডার সারাক্ষণ চলে, যাতে সন্ধ্যায় যারা শুনতে পারেনি তারা পরে শুনতে পারে। আর টাওয়ার থেকে দূরের চরে গিয়ে বিরুনি একটা রেডিও কানে ধরে, স্টুডিওর দেয়ালঘড়ির সাথে মিলিয়ে দেখে শব্দ কত দেরিতে পৌঁছায়।

প্রথম সম্প্রচারের আগের রাতে হাইসাম পুরো লাইনটা একবার নিজে চালিয়ে দেখে: ভুল নম্বর দিয়ে কেউ মাইকে বসতে পারে কিনা, মিক্সার তিনটা মানই পাঠাচ্ছে কিনা, রেকর্ডার ফাইল লিখছে কিনা, চরে শব্দ পৌঁছাচ্ছে কিনা। একটা ধাপও না দেখে সে "চালু" বলে না।

মিলিয়ে নিই: মাইক হলো **এনকোডার** (OBS বা ffmpeg), দরজার খাতা হলো **স্ট্রিম কী যাচাই করা auth সার্ভিস**, মিক্সারের টেবিল হলো **ইনজেস্ট সার্ভার** (MediaMTX), ফারাবির তিন মানের আউটপুট হলো **ABR ট্রান্সকোডার** (ffmpeg, তিন রেন্ডিশন), ট্রান্সমিটার আর টাওয়ার হলো **origin ও CDN edge** (nginx), পাশের রেকর্ডার হলো **রেকর্ডিং ও live-to-VOD**, আর বিরুনির দেয়ালঘড়ি মেলানো হলো **ছবিতে বসানো ঘড়ি দিয়ে glass-to-glass লেটেন্সি মাপা**। আগের রাতের পরীক্ষা হলো এই চ্যাপ্টারের শেষের "যা আসলেই চালিয়েছি" অংশ। বাস্তবে ছোট ইউনিভার্সিটি, মসজিদ বা স্থানীয় টিভি চ্যানেল ঠিক এই আকারের একটা সিস্টেম দিয়েই লাইভ শুরু করে।

## যা বানাচ্ছি

আগের দশটা চ্যাপ্টারের টুকরোগুলো এখানে একটা চলমান সিস্টেমে জোড়া লাগবে, এক VPS-এ, Docker Compose দিয়ে:

<Mermaid
title="এক VPS-এ পুরো লাইভ পাইপলাইন"
code={`graph LR
  OBS["OBS / ffmpeg encoder"] -->|"RTMP 1935 or SRT 8890"| MTX["MediaMTX ingest"]
  MTX -->|"POST /auth"| AUTH["Go auth service"]
  MTX -->|"runOnAvailable"| FF["ffmpeg ABR transcoder"]
  FF -->|"reads RTSP from MediaMTX"| MTX
  FF -->|"fMP4 HLS on shared volume"| NG["nginx origin :80"]
  MTX -->|"fMP4 recording"| REC["recordings volume"]
  REC --> UP["rclone uploader"]
  UP --> S3["S3 storage (Garage)"]
  NG --> EDGE["edge cache / CDN"]
  EDGE --> P["hls.js player"]`}
/>

কে কী করে, এক লাইনে:

| অংশ | কাজ | কোথায় শিখেছি |
| --- | --- | --- |
| Go auth | স্ট্রিম কী মিলিয়ে পাবলিশের অনুমতি দেয়, ট্রান্সকোডারকে পড়তে দেয় | [ইনজেস্ট সার্ভার](/notes/live-streaming/04-ingest-servers) |
| MediaMTX | RTMP/SRT গ্রহণ, রেকর্ডিং, স্ট্রিম এলে ট্রান্সকোডার চালু | [ইনজেস্ট সার্ভার](/notes/live-streaming/04-ingest-servers) |
| ffmpeg | তিন রেন্ডিশন, ২ সেকেন্ডের fMP4 সেগমেন্ট, master প্লেলিস্ট | [ট্রান্সকোডিং ও প্যাকেজিং](/notes/live-streaming/05-live-transcode-package) |
| nginx | প্লেলিস্ট আর সেগমেন্ট সার্ভ, সঠিক `Cache-Control` | [স্কেলে ডেলিভারি](/notes/live-streaming/08-live-delivery-at-scale) |
| rclone | শেষ হওয়া রেকর্ডিং S3-তে তোলে | [DVR ও live-to-VOD](/notes/live-streaming/07-dvr-live-to-vod) |
| hls.js | প্লে করে, লাইভ এজের কাছে থাকে | [ভিডিও প্লেয়ার ট্র্যাক](/notes/video-player/00-roadmap) |

<Callout type="info">

এই চ্যাপ্টারের প্রতিটা ফাইল আমি **২০২৬ সালের অক্টোবরে** নিজের মেশিনে Docker দিয়ে চালিয়েছি, MediaMTX **v1.21.2** (তখনকার সর্বশেষ রিলিজ), nginx 1.29.3, ffmpeg-এর টেস্ট সোর্সকে এনকোডার বানিয়ে। নিচের আউটপুটগুলো সেই রান থেকে নেওয়া। কী চালানো যায়নি, সেটা শেষে আলাদা করে লেখা আছে। ইমেজের ভার্সন বদলালে কনফিগের নাম বদলাতে পারে (MediaMTX-এ সেটা ঘটেছে, নিচে দেখবেন), তাই আপনার ভার্সনের রেফারেন্স কনফিগ মিলিয়ে নিন।

</Callout>

## ফোল্ডার আর গোপন মান

```text
live/
├── .env                      # secrets, never committed
├── compose.yml
├── auth/
│   ├── Dockerfile
│   ├── go.mod
│   └── main.go
├── mediamtx/
│   ├── mediamtx.yml
│   └── transcode.sh
├── nginx/
│   └── default.conf
└── web/
    └── index.html
```

গোপন মানগুলো `.env`-এ, আর কোনো মান না থাকলে Compose চালু হওয়ার আগেই থেমে যাবে (নিচে `:?` দেখুন)। চুপচাপ একটা ডিফল্ট কী নিয়ে চালু হয়ে যাওয়া লাইভ সিস্টেম মানে যে কেউ আপনার চ্যানেলে সম্প্রচার করতে পারে।

```bash
# .env
STREAM_KEYS=baytalhikma:sk_9f2c71d04e8a,cordoba:sk_51b0aa3d97c2
TRANSCODER_PASS=tp_3c8e1f60b2d9
S3_ENDPOINT=http://10.0.0.5:3900
S3_ACCESS_KEY_ID=GK3f...
S3_SECRET_ACCESS_KEY=...
```

কী বানাতে `openssl rand -hex 12` যথেষ্ট। প্রোডাকশনে কীগুলো ডেটাবেসে থাকবে আর auth সার্ভিস সেখান থেকে পড়বে; এখানে env-এ রাখা হয়েছে যাতে পুরো সিস্টেম একটা ফাইলে দেখা যায়।

## Auth সার্ভিস: দরজার খাতা

MediaMTX-কে `authMethod: http` দিলে প্রতিটা পাবলিশ বা রিড চেষ্টায় সে আমাদের সার্ভিসে একটা JSON POST করে, আর `20x` পেলে অনুমতি দেয় ([চার নম্বর চ্যাপ্টারে](/notes/live-streaming/04-ingest-servers) পেলোডের সব ঘর আছে)। আমাদের নিয়ম দুটো:

- **পাবলিশ:** পাথ হতে হবে `ingest/` দিয়ে শুরু, পরের অংশটা চ্যানেলের নাম, আর পাসওয়ার্ডের জায়গায় সেই চ্যানেলের স্ট্রিম কী।
- **রিড:** কাঁচা ইনজেস্ট পড়তে পারে শুধু আমাদের নিজের ট্রান্সকোডার। দর্শক কখনো MediaMTX থেকে পড়ে না, তারা nginx থেকে HLS পায়।

স্ট্রিম কী-কে পাসওয়ার্ড হিসেবে নেওয়ার কারণ: MediaMTX-এর ডকস অনুযায়ী RTMP-তে ক্রেডেনশিয়াল যায় `?user=...&pass=...` query দিয়ে, আর SRT-তে `streamid=publish:PATH:USER:PASS` দিয়ে। দুটোই শেষে `password` ঘরে এসে পৌঁছায়, তাই এক নিয়মে দুই প্রোটোকল চলে।

```go
package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
)

// MediaMTX POSTs this body for every publish/read attempt (authMethod: http).
type authReq struct {
	User     string `json:"user"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing required env var %s", k)
	}
	return v
}

func eq(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }

func main() {
	// STREAM_KEYS="baytalhikma:k3y1,cordoba:k3y2" (channel:key pairs)
	keys := map[string]string{}
	for _, pair := range strings.Split(mustEnv("STREAM_KEYS"), ",") {
		ch, key, ok := strings.Cut(strings.TrimSpace(pair), ":")
		if !ok || ch == "" || key == "" {
			log.Fatalf("bad STREAM_KEYS entry %q, want channel:key", pair)
		}
		keys[ch] = key
	}
	transcoderPass := mustEnv("TRANSCODER_PASS")
	addr := mustEnv("LISTEN_ADDR")

	http.HandleFunc("POST /auth", func(w http.ResponseWriter, r *http.Request) {
		var req authReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		ch, isIngest := strings.CutPrefix(req.Path, "ingest/")
		ok := false
		switch req.Action {
		case "publish":
			// The stream key travels as the password: RTMP ?user=x&pass=KEY, SRT publish:path:x:KEY.
			want, known := keys[ch]
			ok = isIngest && known && eq(req.Password, want)
		case "read":
			// Only the internal transcoder reads raw ingest; viewers get HLS from nginx.
			ok = isIngest && req.User == "transcoder" && eq(req.Password, transcoderPass)
		}
		log.Printf("auth action=%s path=%s proto=%s ip=%s ok=%v", req.Action, req.Path, req.Protocol, req.IP, ok)
		if !ok {
			http.Error(w, "denied", http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	log.Printf("auth listening on %s, %d channels", addr, len(keys))
	log.Fatal(http.ListenAndServe(addr, nil))
}
```

দুটো খুঁটিনাটি জরুরি। কী তুলনায় `subtle.ConstantTimeCompare`, যাতে উত্তরের সময় মেপে কী আন্দাজ করা না যায়। আর প্রতিটা সিদ্ধান্ত লগে যায়, পাসওয়ার্ড ছাড়া; লাইভের দিন "এনকোডার কানেক্ট হচ্ছে না" ডিবাগ করার প্রথম জায়গা এই লগ।

```dockerfile
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -o /liveauth .

FROM alpine:3.22
COPY --from=build /liveauth /liveauth
USER nobody
ENTRYPOINT ["/liveauth"]
```

## MediaMTX কনফিগ

```yaml
# mediamtx/mediamtx.yml
logLevel: info

authMethod: http
authHTTPAddress: http://auth:9000/auth
authHTTPExclude:
  - action: api
  - action: metrics

api: true
apiAddress: :9997        # not published in compose: reach it via docker network only
metrics: true
metricsAddress: :9998

rtsp: true
rtspTransports: [tcp]
rtspAddress: :8554       # internal, the transcoder reads from here
rtmp: true
rtmpAddress: :1935
srt: true
srtAddress: :8890
hls: false               # nginx serves the ABR ladder instead
webrtc: false
moq: false

paths:
  "~^ingest/([a-z0-9-]+)$":
    record: true
    recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S-%f
    recordFormat: fmp4
    recordSegmentDuration: 10m
    recordDeleteAfter: 0s
    runOnAvailable: /transcode.sh
    runOnAvailableRestart: true
```

লাইন ধরে ধরে যা গুরুত্বপূর্ণ:

- **পাথটা একটা regex**: `~` দিয়ে শুরু হলে MediaMTX সেটাকে রেগুলার এক্সপ্রেশন ধরে, আর বন্ধনীর ভেতরের অংশ (চ্যানেলের নাম) হুকে `G1` এনভায়রনমেন্ট ভ্যারিয়েবল হয়ে আসে। ফলে নতুন চ্যানেলের জন্য কনফিগ বদলাতে হয় না, শুধু `.env`-এ কী যোগ করলেই হয়। বাকি সব পাথ কোনো এন্ট্রিতে মেলে না, তাই সেখানে পাবলিশ করা যায় না।
- **`runOnAvailable`** স্ট্রিম পড়ার যোগ্য হলেই `transcode.sh` চালায়, আর স্ট্রিম চলে গেলে SIGINT দিয়ে থামায়। `runOnAvailableRestart: true` থাকলে ট্রান্সকোডার মাঝপথে মরলে আবার চালু হয়।
- **`recordDeleteAfter: 0s`** মানে MediaMTX নিজে রেকর্ডিং মুছবে না (ডিফল্ট `1d`, রেফারেন্স কনফিগ অনুযায়ী `0s` স্বয়ংক্রিয় মোছা বন্ধ করে)। মোছার দায়িত্ব আপলোডারের পরের রিটেনশন নিয়মের।
- **`hls`, `webrtc`, `moq` বন্ধ**: যা ব্যবহার করছি না, তার পোর্টও খোলা রাখি না। v1.21.2 ডিফল্টে MoQ (Media over QUIC) লিসেনার চালু করে আর নিজের জন্য সার্টিফিকেট বানায়; বন্ধ না করলে লগে সেটা দেখবেন।

<Callout type="warning">

**ইন্টারনেটের পুরনো টিউটোরিয়ালে `runOnReady` লেখা থাকে।** MediaMTX v1.20.0-এ এর নাম বদলে `runOnAvailable` হয়েছে (সাথে `runOnNotReady` → `runOnUnavailable`), আর বুলিয়ানগুলো এখন `yes/no`-এর বদলে `true/false` দিয়ে লেখা হয়। আমি একই কনফিগ পুরনো v1.15.6-এও চালিয়েছিলাম, সেখানে `runOnReady` কাজ করে; নতুন ভার্সনে পুরনো নাম দিলে হুক চলবে না। আপনার ইমেজের ট্যাগ অনুযায়ী GitHub-এ সেই ট্যাগের `mediamtx.yml` খুলে মিলিয়ে নিন।

</Callout>

## ট্রান্সকোডার: তিন রেন্ডিশন

```sh
#!/bin/sh
# Run by MediaMTX (runOnAvailable) for each live ingest/<channel> path.
set -eu
: "${MTX_PATH:?}" "${G1:?}" "${TRANSCODER_PASS:?}" "${HLS_ROOT:?}" "${RTSP_PORT:?}"
out="$HLS_ROOT/$G1"
run=$(date +%s) # unique per transcoder start, so a restart never reuses a cached file name
mkdir -p "$out"
exec ffmpeg -hide_banner -loglevel warning -stats_period 10 \
  -rtsp_transport tcp -i "rtsp://transcoder:$TRANSCODER_PASS@127.0.0.1:${RTSP_PORT}/$MTX_PATH" \
  -filter_complex "[0:v]split=3[a][b][c];[a]scale=-2:720[v720];[b]scale=-2:480[v480];[c]scale=-2:360[v360]" \
  -map "[v720]" -map "[v480]" -map "[v360]" -map 0:a -map 0:a -map 0:a \
  -c:v libx264 -preset veryfast -tune zerolatency -profile:v main \
  -force_key_frames "expr:gte(t,n_forced*2)" -sc_threshold 0 \
  -b:v:0 3000k -maxrate:v:0 3300k -bufsize:v:0 3000k \
  -b:v:1 1400k -maxrate:v:1 1500k -bufsize:v:1 1400k \
  -b:v:2 800k  -maxrate:v:2 880k  -bufsize:v:2 800k \
  -af aresample=async=1 -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -f hls -hls_time 2 -hls_list_size 10 -hls_segment_type fmp4 -hls_start_number_source epoch \
  -hls_flags delete_segments+independent_segments+program_date_time+temp_file \
  -master_pl_name master.m3u8 -hls_fmp4_init_filename "init_${run}_%v.mp4" \
  -var_stream_map "v:0,a:0,name:720p v:1,a:1,name:480p v:2,a:2,name:360p" \
  -hls_segment_filename "$out/%v/seg_%06d.m4s" \
  "$out/%v/index.m3u8"
```

[পাঁচ নম্বর চ্যাপ্টারের](/notes/live-streaming/05-live-transcode-package) কমান্ডের সাথে চারটা পার্থক্য, প্রতিটা এই রানে ধরা পড়া সমস্যা থেকে:

- **`-force_key_frames "expr:gte(t,n_forced*2)"`**, `-g 60`-এর বদলে। `-g 60` মানে "৬০ ফ্রেম পরপর কীফ্রেম", যা শুধু ৩০ fps-এ ২ সেকেন্ড। কেউ OBS থেকে ২৫ fps পাঠালে সেগমেন্ট হয়ে যেত ২.৪ সেকেন্ড, `TARGETDURATION`-এর চেয়ে লম্বা। এই এক্সপ্রেশন সময় ধরে প্রতি ২ সেকেন্ডে কীফ্রেম বসায়, fps যাই হোক। আমি ২৫ fps আর ৪৪.১ kHz অডিওর একটা সোর্স পাঠিয়ে দেখেছি: প্লেলিস্টের ৯টা সেগমেন্টই ঠিক `2.000000` সেকেন্ড।
- **`-af aresample=async=1`**। প্রথম রানে ট্রান্সকোডারের লগ ভরে যাচ্ছিল `Queue input is backward in time` আর `Non-monotonic DTS in output stream` সতর্কবার্তায়: RTMP থেকে আসা অডিওর টাইমস্ট্যাম্প একটু এদিক-ওদিক। এই ফিল্টার যোগ করার পর একই ২৫ সেকেন্ডে সতর্কবার্তার সংখ্যা শূন্য। এটা না সারালে লম্বা ইভেন্টে অডিও-ভিডিও ধীরে ধীরে সরে যেতে পারে।
- **রিস্টার্টে ফাইলের নাম কখনো পুনরাবৃত্ত হয় না** (`-hls_start_number_source epoch` আর `run` দিয়ে init ফাইলের নাম)। প্রথম সংস্করণে আমি ট্রান্সকোডারকে `kill -9` দিয়ে মেরে দেখেছিলাম: MediaMTX `runOnAvailableRestart`-এর জোরে সেটা কয়েক সেকেন্ডে আবার চালু হলো, ঠিক যেমন চাই, কিন্তু নতুন রান আবার `seg_000000.m4s` আর `init_0.mp4` থেকে লেখা শুরু করল। আমাদের nginx সেগমেন্টকে এক ঘণ্টার `immutable` বলে; সামনে একটা CDN থাকলে সে আগের রানের `seg_000000.m4s` এক ঘণ্টা ধরে নতুন নামের জায়গায় দিয়ে যেত, আর প্লেয়ারের কাছে `MEDIA-SEQUENCE` পেছনে চলে যেত। এখন সেগমেন্টের নম্বর শুরু হয় ট্রান্সকোডার চালুর মুহূর্তের epoch সেকেন্ড থেকে, আর init ফাইলের নামে রানের সময় থাকে; আসল রানে রিস্টার্টের আগে প্লেলিস্টে ছিল `init_1792906793_720p.mp4` আর `seg_1792906798.m4s`, পরে `init_1792906811_720p.mp4` আর `seg_1792906812.m4s`। সেগমেন্ট দুই সেকেন্ডের বলে নম্বর ঘড়ির চেয়ে ধীরে বাড়ে, তাই পরের রানের শুরুর নম্বর আগের রানের যেকোনো নম্বরের চেয়ে বড়। এটা নামের সংঘর্ষ মেটায়, কিন্তু রিস্টার্টে টাইমস্ট্যাম্প নতুন করে শুরু হয় আর ffmpeg নতুন রানে `EXT-X-DISCONTINUITY` লেখে না; আপনার প্লেয়ার এটা কীভাবে সামলায় তা পরীক্ষা করুন, আর রিস্টার্ট ছাড়াই টিকে থাকার নকশা [নয় নম্বর চ্যাপ্টারে](/notes/live-streaming/09-reliability)। (`append_list` ফ্ল্যাগ দিয়ে DISCONTINUITY পাওয়ার চেষ্টা করেছিলাম; তিন রেন্ডিশনের fMP4-এ ভুল init আর ভাঙা নম্বর দিয়েছে, তাই বাদ।)
- **ইনপুট RTSP, লোকালহোস্ট থেকে, ক্রেডেনশিয়াল সহ।** ট্রান্সকোডার MediaMTX-এর কন্টেইনারের ভেতরেই চলে (`-ffmpeg` ট্যাগের ইমেজে ffmpeg আছে), তাই `127.0.0.1`। auth লগে দেখবেন প্রথম রিড চেষ্টা `ok=false`, তারপর `ok=true`: RTSP প্রথমে ক্রেডেনশিয়াল ছাড়া চেষ্টা করে, সার্ভার চ্যালেঞ্জ দিলে তবে পাসওয়ার্ড পাঠায়। এটা স্বাভাবিক, ভুল নয়।

শুরুর দিকে লগে কয়েকটা `Missing reference picture` দেখা যায়। ট্রান্সকোডার স্ট্রিমের মাঝখান থেকে পড়া শুরু করে, প্রথম কীফ্রেম আসার আগের ফ্রেমগুলো ডিকোড হয় না। শুধু শুরুতে থাকলে উপেক্ষা করুন; চলতেই থাকলে [ডিবাগিং প্লেবুকে](/notes/live-streaming/13-debugging-playbook) যান।

## nginx origin আর প্লেয়ার পেজ

```nginx
# nginx/default.conf
server {
    listen 80;
    server_name _;

    location / {
        root /usr/share/nginx/html;
    }

    location /hls/ {
        alias /hls/;
        add_header Access-Control-Allow-Origin * always;

        types {
            application/vnd.apple.mpegurl m3u8;
            video/mp4 mp4 m4s;
        }

        # Media playlists change every segment: cache for about half a target duration.
        location ~ \.m3u8$ {
            add_header Cache-Control "public, max-age=1" always;
            add_header Access-Control-Allow-Origin * always;
        }
        # A segment never changes once written.
        location ~ \.(m4s|mp4)$ {
            add_header Cache-Control "public, max-age=3600, immutable" always;
            add_header Access-Control-Allow-Origin * always;
        }
    }
}
```

প্লেলিস্টে `max-age=1` কারণ সেগমেন্ট ২ সেকেন্ডের; নিয়মটা [আট নম্বর চ্যাপ্টারে](/notes/live-streaming/08-live-delivery-at-scale): প্লেলিস্ট মোটামুটি অর্ধেক টার্গেট ডিউরেশন, সেগমেন্ট দীর্ঘ। ভেতরের `location`-এ CORS হেডার আবার লিখতে হয়েছে, কারণ nginx-এ ভেতরের ব্লকে একটা `add_header` থাকলে বাইরের ব্লকের `add_header` আর উত্তরাধিকার হিসেবে আসে না। এটা একটা পরিচিত ফাঁদ: প্লেলিস্ট CORS ছাড়া গেলে ব্রাউজারে প্লেয়ার চুপচাপ ব্যর্থ হয়।

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Baytalhikma Live</title>
<video id="v" controls muted playsinline style="width:100%;max-width:960px"></video>
<p id="lat">latency: -</p>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js"></script>
<script>
  const src = '/hls/baytalhikma/master.m3u8';
  const video = document.getElementById('v');
  if (Hls.isSupported()) {
    const hls = new Hls({
      lowLatencyMode: true,        // only matters if the playlist carries parts (LL-HLS)
      liveSyncDuration: 6,         // aim 6 s behind the live edge (3 x 2 s segments)
      liveMaxLatencyDuration: 15,  // jump forward if we drift past this
      maxLiveSyncPlaybackRate: 1.1 // or catch up gently by playing 10% faster
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    setInterval(() => {
      document.getElementById('lat').textContent =
        `latency: ${hls.latency?.toFixed(1)} s (target ${hls.targetLatency?.toFixed(1)} s)`;
    }, 1000);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src; // Safari plays HLS natively
  }
</script>
</html>
```

hls.js 1.7.3 (২০২৬ সালের সেপ্টেম্বরে প্রকাশিত, অক্টোবরে npm-এর `latest`) এর API ডকস অনুযায়ী: `liveSyncDuration` লাইভ এজ থেকে কত সেকেন্ড পেছনে থাকবে; `liveMaxLatencyDuration` তার চেয়ে বড় হতে হবে, আর এর বেশি পিছিয়ে পড়লে প্লেয়ার সামনে লাফ দেয়; `maxLiveSyncPlaybackRate` ১-এর বেশি দিলে লাফ না দিয়ে একটু দ্রুত চালিয়ে ধরে ফেলে। `lowLatencyMode` ডিফল্টেই `true`, কিন্তু আমাদের ffmpeg প্লেলিস্টে partial segment নেই, তাই এখানে এর প্রভাব নেই; LL-HLS-এর কাঠামো [ভিডিও ট্র্যাকের নয় নম্বর চ্যাপ্টারে](/notes/video/09-low-latency-live)। পেজে `hls.latency` দেখানো হচ্ছে, যা পরে মনিটরিং আর ডিবাগিংয়ে কাজে লাগবে।

## Compose: সবকিছু একসাথে

```yaml
# compose.yml
services:
  auth:
    build: ./auth
    environment:
      STREAM_KEYS: ${STREAM_KEYS:?set STREAM_KEYS in .env}
      TRANSCODER_PASS: ${TRANSCODER_PASS:?set TRANSCODER_PASS in .env}
      LISTEN_ADDR: :9000
    restart: unless-stopped

  mediamtx:
    image: bluenviron/mediamtx:1.21.2-ffmpeg
    depends_on: [auth]
    environment:
      TRANSCODER_PASS: ${TRANSCODER_PASS:?set TRANSCODER_PASS in .env}
      HLS_ROOT: /hls
    volumes:
      - ./mediamtx/mediamtx.yml:/mediamtx.yml:ro
      - ./mediamtx/transcode.sh:/transcode.sh:ro
      - hls:/hls
      - recordings:/recordings
    ports:
      - "1935:1935"        # RTMP ingest
      - "8890:8890/udp"    # SRT ingest
    restart: unless-stopped

  nginx:
    image: nginx:1.29.3-alpine
    depends_on: [mediamtx]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./web:/usr/share/nginx/html:ro
      - hls:/hls:ro
    ports:
      - "80:80"
    restart: unless-stopped

  uploader:
    image: rclone/rclone:1.75.2
    environment:
      RCLONE_CONFIG_STORE_TYPE: s3
      RCLONE_CONFIG_STORE_PROVIDER: Other
      RCLONE_CONFIG_STORE_ENDPOINT: ${S3_ENDPOINT:?set S3_ENDPOINT in .env}
      RCLONE_CONFIG_STORE_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:?set S3_ACCESS_KEY_ID in .env}
      RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY in .env}
      RCLONE_CONFIG_STORE_REGION: garage
    volumes:
      - recordings:/recordings:ro
    entrypoint: ["/bin/sh", "-c"]
    # A file still being written has a fresh mtime, so --min-age skips it until it is finished.
    command: ["while true; do rclone copy --min-age 2m /recordings store:recordings; sleep 60; done"]
    restart: unless-stopped

volumes:
  hls:
  recordings:
```

প্রতিটা ইমেজের ভার্সন পিন করা; `latest` দিলে কোনো এক রাতে MediaMTX আপডেট হয়ে `runOnReady`-র মতো একটা নাম বদলে যাবে, আর পরের লাইভে ট্রান্সকোডার চলবে না। API (9997) আর মেট্রিক্স (9998) বাইরে প্রকাশ করা হয়নি; Prometheus একই Docker নেটওয়ার্ক থেকে পড়বে ([বারো নম্বর চ্যাপ্টার](/notes/live-streaming/12-live-monitoring))।

রেকর্ডিং S3-তে তোলার জন্য একটা সেলফ-হোস্টেড S3-সামঞ্জস্যপূর্ণ স্টোরেজ লাগবে। Garage এর একটা ভালো বিকল্প। MinIO-র কমিউনিটি এডিশন ২০২৫ সালের শেষ দিক থেকে মেইনটেন্যান্স মোডে, আর তার GitHub রিপো আর্কাইভ করা (২০২৬ সালের অক্টোবর অনুযায়ী), তাই নতুন সেটআপে সেটা দিয়ে শুরু না করাই ভালো। rclone-কে কনফিগ ফাইল ছাড়াই `RCLONE_CONFIG_STORE_TYPE`-এর মতো এনভায়রনমেন্ট ভ্যারিয়েবল দিয়ে (মাঝের অংশটা রিমোটের নাম) রিমোট বলে দেওয়া যায়; `rclone/rclone:1.75.2` ইমেজে আমি যাচাই করেছি যে এভাবে `store:` রিমোট তৈরি হয়। Garage-এর S3 পোর্ট আর region আপনার `garage.toml` থেকে মিলিয়ে নিন।

## চালু করা আর প্রথম স্ট্রিম

```bash
docker compose up -d --build
docker compose logs mediamtx | head
```

```text
INF MediaMTX v1.21.2, linux, arm64
INF configuration loaded from /mediamtx.yml
INF [metrics] started with listener on :9998 (TCP/HTTP)
INF [RTSP] started with listeners on :8554 (TCP/RTSP)
INF [RTMP] started with listener on :1935 (TCP/RTMP)
INF [SRT] started with listener on :8890 (UDP/SRT)
INF [API] started with listener on :9997 (TCP/HTTP)
```

**OBS থেকে।** Settings → Stream-এ Service: Custom। RTMP হলে Server `rtmp://live.baytalhikma.org/ingest`, আর Stream Key `baytalhikma?user=obs&pass=sk_9f2c71d04e8a`। OBS সার্ভার আর কী জোড়া লাগিয়ে `rtmp://live.baytalhikma.org/ingest/baytalhikma?user=obs&pass=...` বানায়, ঠিক যা MediaMTX চায়। SRT হলে Server-এ পুরো URL দিন আর Stream Key ফাঁকা রাখুন (SRT URL আর streamid-এর বিস্তারিত [দুই নম্বর চ্যাপ্টারে](/notes/live-streaming/02-contribution-protocols))। এনকোডার সেটিং [তিন নম্বর চ্যাপ্টারের](/notes/live-streaming/03-live-encoder-settings) মতো: CBR, কীফ্রেম ইন্টারভাল ২ সেকেন্ড।

**স্ক্রিপ্টে পরীক্ষা করতে ffmpeg দিয়ে।** OBS খোলার আগে পুরো লাইন পরীক্ষা করার সবচেয়ে সহজ উপায়, আর এর একটা ভালো দিক আছে: ছবির কোণে একটা ঘড়ি বসানো যায়।

```bash
ffmpeg -re \
  -f lavfi -i testsrc2=size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -vf "drawtext=fontfile=/path/to/DejaVuSans.ttf:text='%{localtime\:%T}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=40:y=h-th-40" \
  -c:v libx264 -preset veryfast -tune zerolatency -g 60 -keyint_min 60 -sc_threshold 0 -b:v 3500k \
  -c:a aac -b:a 128k \
  -f flv "rtmp://live.baytalhikma.org/ingest/baytalhikma?user=obs&pass=sk_9f2c71d04e8a"
```

প্রথমে ইচ্ছা করে ভুল কী দিয়ে চেষ্টা করুন। দরজা বন্ধ থাকছে কিনা, সেটা আগে দেখা দরকার:

```text
# ffmpeg
Error submitting a packet to the muxer: Broken pipe

# docker compose logs auth
auth action=publish path=ingest/baytalhikma proto=rtmp ip=127.0.0.1 ok=false

# docker compose logs mediamtx
INF [RTMP] [conn 127.0.0.1:64723] closed: authentication failed: server replied with code 401: denied
```

এনকোডারের দিক থেকে ভুল কী দেখতে হুবহু নেটওয়ার্ক সমস্যার মতো ("Broken pipe"); আসল কারণ শুধু সার্ভারের লগে লেখা থাকে। এটা মনে রাখুন। এবার ঠিক কী দিয়ে:

```text
# docker compose logs auth
auth action=publish path=ingest/baytalhikma proto=rtmp ip=192.168.65.1 ok=true
auth action=read path=ingest/baytalhikma proto=rtsp ip=127.0.0.1 ok=false
auth action=read path=ingest/baytalhikma proto=rtsp ip=127.0.0.1 ok=true
```

কয়েক সেকেন্ডের মধ্যে nginx-এর দিক থেকে master আর media প্লেলিস্ট পাওয়া যায় (আমার রান থেকে):

```text
$ curl -s http://localhost/hls/baytalhikma/master.m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=3440800,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1680800,RESOLUTION=854x480,CODECS="avc1.4d401f,mp4a.40.2"
480p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1020800,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p/index.m3u8

$ curl -s http://localhost/hls/baytalhikma/720p/index.m3u8 | head -12
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:1792906986
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MAP:URI="init_1792906983_720p.mp4"
#EXTINF:2.000000,
#EXT-X-PROGRAM-DATE-TIME:2026-10-25T05:43:06.724+0000
seg_1792906986.m4s
#EXTINF:2.000000,
#EXT-X-PROGRAM-DATE-TIME:2026-10-25T05:43:08.724+0000
seg_1792906987.m4s

$ curl -sI http://localhost/hls/baytalhikma/720p/index.m3u8
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Cache-Control: public, max-age=1

$ curl -sI http://localhost/hls/baytalhikma/720p/init_1792906983_720p.mp4
HTTP/1.1 200 OK
Content-Type: video/mp4
Cache-Control: public, max-age=3600, immutable
```

`BANDWIDTH` মানগুলো ffmpeg নিজে বিটরেট সেটিং থেকে হিসাব করে বসায়। প্রতিটা সেগমেন্টের আগে `PROGRAM-DATE-TIME` আছে, যা ক্লিপ কাটা ([সাত নম্বর চ্যাপ্টার](/notes/live-streaming/07-dvr-live-to-vod)) আর স্টেল প্লেলিস্ট ধরার ([বারো নম্বর চ্যাপ্টার](/notes/live-streaming/12-live-monitoring)) মূল ভিত্তি। এবার ব্রাউজারে `http://live.baytalhikma.org/` খুলুন।

## SRT দিয়ে একই কাজ

SRT-তে খারাপ নেটওয়ার্কে কী হয়, সেটা [দুই নম্বর চ্যাপ্টারে](/notes/live-streaming/02-contribution-protocols)। এখানে শুধু দেখি আমাদের পাইপলাইন SRT নেয় কিনা। Homebrew-এর ffmpeg-এ `libsrt` ছিল না (`Protocol not found`), তাই আমি MediaMTX-এর ffmpeg ইমেজটাই এনকোডার হিসেবে চালিয়েছি, যেখানে SRT আছে:

```bash
docker run --rm --entrypoint ffmpeg bluenviron/mediamtx:1.21.2-ffmpeg \
  -re -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -c:v libx264 -preset veryfast -tune zerolatency -g 60 -keyint_min 60 -sc_threshold 0 -b:v 3500k \
  -c:a aac -b:a 128k -f mpegts \
  "srt://live.baytalhikma.org:8890?streamid=publish:ingest/baytalhikma:obs:sk_9f2c71d04e8a&pkt_size=1316&latency=200000"
```

Control API থেকে এই কানেকশনের অবস্থা (আসল রান, লোকাল নেটওয়ার্ক, তাই RTT প্রায় শূন্য; JSON থেকে দরকারি ঘরগুলো বেছে সাজানো):

```text
$ curl -s localhost:9997/v3/srt/conns/list   # from inside the docker network
state=publish  path=ingest/baytalhikma
msRTT=0.58  mbpsReceiveRate=3.49  mbpsLinkCapacity=815.6
packetsReceivedLoss=0  packetsReceivedRetrans=0  packetsReceivedDrop=0
msReceiveTsbPdDelay=200
```

`msReceiveTsbPdDelay=200` মানে ffmpeg-এ দেওয়া `latency=200000` (মাইক্রোসেকেন্ড) সার্ভারে ২০০ ms হিসেবে মেনে নেওয়া হয়েছে। আসল মাঠে এই সংখ্যাগুলো, বিশেষত loss আর retrans, কী বলে আর কখন অ্যালার্ট দেবেন, সেটা বারো নম্বর চ্যাপ্টারের বিষয়।

## লেটেন্সি মাপা: ছবিতে ঘড়ি

লেটেন্সি সবচেয়ে সৎভাবে মাপার উপায় চরে দাঁড়ানো বিরুনির মতো: উৎসে একটা ঘড়ি, পর্দায় সেই ঘড়ির ছবি, পাশে আসল ঘড়ি। উপরের ffmpeg কমান্ডের `drawtext` ফিল্টার ঠিক সেটা করে; `localtime` এক্সপ্যানশন প্রতিটা ফ্রেমে তখনকার সময় লিখে দেয়। তারপর ফোনের স্টপওয়াচ বা কম্পিউটারের ঘড়ি পাশে রেখে প্লেয়ারের একটা স্ক্রিনশট নিন; দুই সময়ের পার্থক্যই glass-to-glass লেটেন্সি ([এক নম্বর চ্যাপ্টারের](/notes/live-streaming/01-what-is-live) সংজ্ঞা)।

দুটো সতর্কতা, দুটোই রানে ধরা পড়েছে:

- `drawtext` চালাতে ffmpeg-এর freetype সমর্থন আর একটা ফন্ট ফাইল লাগে। Homebrew-এর ffmpeg-এ এই ফিল্টার ছিলই না; MediaMTX-এর ffmpeg ইমেজে ফিল্টার আছে, কিন্তু ফন্ট নেই, তাই `fontfile=` দিয়ে একটা ফন্ট মাউন্ট করতে হয়েছে। ফন্ট না পেলে ffmpeg শুধু `Error initializing a simple filtergraph` বলে থেমে যায়।
- কন্টেইনারের ঘড়ি ডিফল্টে UTC। দেয়ালঘড়ির সাথে মেলাতে `TZ=Asia/Dhaka` দিন, নয়তো ছয় ঘণ্টার "লেটেন্সি" দেখে চমকে যাবেন।

OBS-এ একই কাজের জন্য একটা টেক্সট বা ব্রাউজার সোর্সে ঘড়ি বসান। আর প্লেয়ার পেজের `hls.latency` লেখাটা দেখায় প্লেয়ার নিজে লাইভ এজ থেকে কত পেছনে; সেটা glass-to-glass-এর একটা অংশ মাত্র, এনকোডার আর ট্রান্সকোডারের সময় তাতে নেই।

এই সেটআপে আশা করুন মোটামুটি ১০ থেকে ১৫ সেকেন্ড: এনকোডারের বাফার, ২ সেকেন্ডের সেগমেন্ট শেষ হওয়ার অপেক্ষা, প্লেলিস্টের ক্যাশ, আর প্লেয়ারের তিন সেগমেন্ট পেছনে থাকা। সংখ্যাটা নিজে মাপুন, এখানে লেখা অনুমান বিশ্বাস করবেন না।

## MediaMTX-এর নিজের LL-HLS বনাম ffmpeg ল্যাডার

MediaMTX নিজেই HLS বানাতে পারে, ডিফল্টে LL-HLS (`hlsVariant: lowLatency`, ১ সেকেন্ডের সেগমেন্ট, ২০০ ms-এর পার্ট, রেফারেন্স কনফিগ অনুযায়ী)। তাহলে ffmpeg কেন?

| | MediaMTX বিল্ট-ইন HLS | ffmpeg ল্যাডার (এই চ্যাপ্টার) |
| --- | --- | --- |
| রেন্ডিশন | একটাই, এনকোডার যা পাঠায় | তিনটা, ABR |
| CPU | প্রায় শূন্য (রিমাক্স, ট্রান্সকোড নয়) | প্রতি চ্যানেলে বেশ খানিকটা |
| লেটেন্সি | কম (LL-HLS) | ১০–১৫ সেকেন্ড |
| সেগমেন্টের সীমা | এনকোডারের কীফ্রেমে কাটে | আমাদের ২ সেকেন্ডের কীফ্রেমে |
| দুর্বল নেটওয়ার্কের দর্শক | এনকোডারের বিটরেট নিতে না পারলে আটকাবে | ছোট রেন্ডিশনে নেমে যাবে |

আমাদের প্রধান পথ ল্যাডার, কারণ বরগুনার মতো জায়গার দর্শকের বড় অংশ মোবাইল ডেটায়; একটা ৩.৫ Mbps স্ট্রিম তারা টানতে পারবে না। তবে দুটো একসাথেও চালানো যায়: `hls: true` করে দিলে একই পাথের একটা কম-লেটেন্সি সংস্করণ `:8888/ingest/baytalhikma/index.m3u8`-এ পাওয়া যায়, যেমন স্টুডিওর প্রিভিউ মনিটরের জন্য। সেক্ষেত্রে auth সার্ভিসে `protocol` `hls` হলে রিড অনুমতি দেওয়ার নিয়ম যোগ করতে হবে; এখনকার নিয়মে আমার রানে সেই URL `401` দিয়েছে, যা ঠিক যেমন হওয়া উচিত।

## সামনে একটা edge

এক VPS থেকে সরাসরি হাজার দর্শককে সার্ভ করা মানে প্রতি দর্শকে ৩ Mbps পর্যন্ত, সার্ভারের আপলিংক দ্রুত ফুরিয়ে যাবে। সমাধান সামনে একটা ক্যাশিং লেয়ার: হয় CDN, নয় নিজের এক বা একাধিক nginx edge। লাইভের জন্য edge-এর পূর্ণ কনফিগ, request collapsing আর 404-এর negative caching-এর ফাঁদ [আট নম্বর চ্যাপ্টারে](/notes/live-streaming/08-live-delivery-at-scale), আর নিজের CDN বানানো [CDN ট্র্যাকে](/notes/cdn/13-build-your-own-cdn)। আমাদের origin ঠিক `Cache-Control` দিচ্ছে, তাই edge-কে মূলত শুধু origin হেডার মানতে আর একই সেগমেন্টের জন্য একটার বেশি রিকোয়েস্ট origin-এ না পাঠাতে বলতে হবে।

## রেকর্ডিং

MediaMTX প্রতিটা চ্যানেলের ইনজেস্ট ট্রান্সকোড ছাড়াই fMP4-এ লেখে, `recordSegmentDuration: 10m` অনুযায়ী দশ মিনিটের ফাইলে। আমার রানে আধা মিনিটের একটা পরীক্ষায় একটা ফাইল তৈরি হয়েছিল:

```text
$ ls -la recordings/ingest/baytalhikma
-rw-r--r--  16M  2026-10-25_10-50-29-271157.mp4
```

এটা উৎসের মানে, তাই live-to-VOD-এ পরে আবার VOD-এর পুরো ল্যাডারে এনকোড করা যায় ([সাত নম্বর চ্যাপ্টার](/notes/live-streaming/07-dvr-live-to-vod), আর [VOD ট্র্যাক](/notes/vod/00-roadmap))। রেফারেন্স কনফিগ অনুযায়ী fMP4 রেকর্ডিং `recordPartDuration` (ডিফল্ট ১ সেকেন্ড) পরপর ডিস্কে ফ্লাশ হয়, তাই সার্ভার হঠাৎ পড়ে গেলে সর্বোচ্চ শেষ এক সেকেন্ড হারায়। uploader সার্ভিস `--min-age 2m` দিয়ে শুধু সেই ফাইলগুলো তোলে যেগুলো অন্তত দুই মিনিট বদলায়নি, অর্থাৎ লেখা শেষ। স্থানীয় ফাইল মোছা আলাদা একটা রিটেনশন নিয়মের কাজ; সেটা না রাখলে ডিস্ক একদিন ভরে যাবে আর রেকর্ডিং থেমে যাবে।

## ফায়ারওয়াল

বাইরে খোলা থাকবে শুধু এগুলো:

| পোর্ট | কেন |
| --- | --- |
| 1935/tcp | RTMP ইনজেস্ট (চাইলে শুধু পরিচিত এনকোডারের IP-তে সীমিত করুন) |
| 8890/udp | SRT ইনজেস্ট |
| 80/tcp, 443/tcp | দর্শক (প্রোডাকশনে TLS সহ) |
| 22/tcp | SSH, শুধু আপনার IP থেকে |

8554 (RTSP), 9997 (API), 9998 (মেট্রিক্স) আর auth-এর 9000 শুধু Docker নেটওয়ার্কের ভেতরে। কাঁচা ইনজেস্ট পাবলিক ইন্টারনেটে প্লেইন RTMP-তে গেলে স্ট্রিম কী খোলা অবস্থায় যায়; প্রোডাকশনে RTMPS বা SRT-এর `passphrase` ব্যবহার করুন ([চার নম্বর চ্যাপ্টারে](/notes/live-streaming/04-ingest-servers) TLS আর ফায়ারওয়ালের বিস্তারিত আছে)।

## যা আসলেই চালিয়েছি, আর যা চালাইনি

**চালিয়েছি (২০২৬-১০-২৫, macOS-এ Docker Desktop):**

- পুরো Compose স্ট্যাক: auth, MediaMTX v1.21.2, nginx 1.29.3। ভুল কী-তে প্রত্যাখ্যান, ঠিক কী-তে RTMP পাবলিশ, তিন রেন্ডিশনের প্লেলিস্ট, nginx-এর হেডার, সব উপরের আউটপুটের মতো।
- SRT পাবলিশ ও API-র কানেকশন স্ট্যাট।
- ২৫ fps সোর্সে `force_key_frames`-এর পরীক্ষা, আর `aresample` যোগ করার আগে ও পরে সতর্কবার্তার সংখ্যা।
- ট্রান্সকোডারকে `kill -9` দিয়ে মেরে স্বয়ংক্রিয় রিস্টার্ট, আর রিস্টার্টের আগে ও পরের প্লেলিস্ট।
- `drawtext` ঘড়ি, MediaMTX-এর ffmpeg ইমেজে, মাউন্ট করা ফন্ট দিয়ে।
- একই কনফিগ পুরনো MediaMTX v1.15.6-এ `runOnReady` নামে।

**চালাইনি:**

- **আসল OBS** দিয়ে পাবলিশ; OBS-এর URL ভাগ করার নিয়ম MediaMTX-এর ডকসের RTMP ফরম্যাট থেকে লেখা।
- **ব্রাউজারে hls.js পেজ** খুলে দেখা; প্লেলিস্ট আর হেডার যাচাই করা, প্লেব্যাক চোখে দেখা হয়নি।
- **uploader আর Garage**; rclone-এর এনভায়রনমেন্ট কনফিগ যাচাই করা, আসল আপলোড চালানো হয়নি।
- **সামনের edge** আর পাবলিক ইন্টারনেটের ওপর দিয়ে লেটেন্সি মাপা।

প্রথম লাইভের আগে এই চারটা আপনার নিজের সার্ভারে চালিয়ে দেখুন, ঠিক যেমন হাইসাম প্রথম সম্প্রচারের আগের রাতে করেছিল।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন কীভাবে | সমাধান |
| --- | --- | --- |
| `docker compose up` সাথে সাথে থেমে যায়, "set STREAM_KEYS in .env" | `docker compose config` চালান | `.env` আছে কিনা, ভ্যারিয়েবলের নাম ঠিক কিনা দেখুন। এটা ইচ্ছা করেই, চুপচাপ চালু হওয়ার চেয়ে ভালো |
| এনকোডার "Broken pipe" বা "Failed to connect" | `docker compose logs auth` আর `logs mediamtx`-এ `authentication failed` | কী, পাথ (`ingest/` উপসর্গ), আর OBS-এ কী-এর ভেতর `?user=...&pass=...` ঠিক কিনা |
| পাবলিশ হয়, কিন্তু `/hls/...` ৪০৪ | `logs mediamtx`-এ `runOnAvailable` চালু হওয়ার লাইন আর ffmpeg-এর এরর | পুরনো `runOnReady` নাম? স্ক্রিপ্ট executable (`chmod +x`)? `TRANSCODER_PASS` দুই সার্ভিসে একই? |
| auth লগে রিড `ok=false`, তারপর আর কিছু না | পরের লাইনে `ok=true` আসছে কিনা | প্রথম `false` স্বাভাবিক (RTSP চ্যালেঞ্জ)। শুধু `false` থাকলে ট্রান্সকোডারের পাসওয়ার্ড মেলেনি |
| ট্রান্সকোডার লগ `backward in time` বা `Non-monotonic DTS`-এ ভরা | `docker compose logs mediamtx` খুলে এই দুই বার্তা খুঁজুন | অডিওতে `-af aresample=async=1` |
| সেগমেন্ট ২ সেকেন্ডের বেশি, প্লেয়ার মাঝে মাঝে আটকায় | media প্লেলিস্ট `curl` করে `EXTINF`-এর মানগুলো দেখুন | `-g`-এর বদলে সময়ভিত্তিক `-force_key_frames` |
| ব্রাউজারে প্লে হয় না, `curl` দিয়ে প্লেলিস্ট আসে | DevTools Console-এ CORS এরর; `curl -I`-এ `Access-Control-Allow-Origin` আছে কিনা | ভেতরের প্রতিটা nginx `location`-এ CORS হেডার আবার লিখুন |
| SRT পাবলিশে ffmpeg বলে `Protocol not found` | `ffmpeg -protocols` আউটপুটে `srt` আছে কিনা | `libsrt`-সহ ffmpeg ব্যবহার করুন, যেমন MediaMTX-এর `-ffmpeg` ইমেজ |
| ছবির ঘড়ি দেখায় না, ffmpeg `Error initializing a simple filtergraph` | `ffmpeg -filters` আউটপুটে `drawtext` আছে কিনা; ফন্টের পাথ ঠিক কিনা | freetype-সহ ffmpeg আর `fontfile=` দিয়ে একটা আসল ফন্ট |
| লগে MoQ সার্টিফিকেট বানানোর বার্তা | MediaMTX-এর লগে `MoQ` লাইন | ব্যবহার না করলে `moq: false` |
| ডিস্ক ভরে রেকর্ডিং থেমে গেছে | `df -h`, `du -sh` রেকর্ডিং ভলিউমে | আপলোডের পর স্থানীয় রিটেনশন নিয়ম; ডিস্কে অ্যালার্ট ([বারো নম্বর চ্যাপ্টার](/notes/live-streaming/12-live-monitoring)) |

## মূল শিক্ষা

1. একটা চালু লাইভ চ্যানেলের জন্য চারটা অংশই যথেষ্ট: auth, ইনজেস্ট, ট্রান্সকোডার, origin। রেকর্ডিং আর edge তার উপরে যোগ হয়।
2. স্ট্রিম কী-কে পাসওয়ার্ড হিসেবে নিন; MediaMTX-এ RTMP আর SRT দুটোই সেটা একই `password` ঘরে পৌঁছে দেয়, তাই এক নিয়মে দুই প্রোটোকল চলে।
3. ভুল কী এনকোডারের দিক থেকে নেটওয়ার্ক এররের মতো দেখায়। সত্যিটা শুধু সার্ভারের auth লগে থাকে, তাই প্রতিটা সিদ্ধান্ত লগ করুন।
4. ইমেজের ভার্সন পিন করুন। MediaMTX v1.20-এ `runOnReady` থেকে `runOnAvailable` হয়েছে; `latest` থাকলে এমন বদল লাইভের দিন ধরা পড়ে।
5. কীফ্রেম সময় ধরে বসান (`-force_key_frames`), ফ্রেম গুনে নয়, নইলে উৎসের fps বদলালে সেগমেন্টের দৈর্ঘ্যও বদলাবে।
6. প্লেলিস্টে খুব ছোট `max-age`, সেগমেন্টে দীর্ঘ `immutable`। nginx-এ ভেতরের `location`-এ হেডার আবার লিখতে হয়।
7. লেটেন্সি মাপুন ছবিতে বসানো ঘড়ি দিয়ে, অনুমান দিয়ে নয়।
8. "চালু" বলার আগে পুরো লাইন একবার নিজে চালিয়ে দেখুন, আর কোনটা দেখা হয়নি সেটা লিখে রাখুন।
