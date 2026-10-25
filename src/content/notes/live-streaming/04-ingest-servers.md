---
title: 'ইনজেস্ট সার্ভার'
subtitle: 'এনকোডারের স্ট্রিম যে দরজা দিয়ে আপনার প্ল্যাটফর্মে ঢোকে — কী কাজ করে, কোন সফটওয়্যার বেছে নেবেন, আর একটা VPS-এ MediaMTX চালিয়ে Go দিয়ে স্ট্রিম কী যাচাই, হুক, ফায়ারওয়াল, RTMPS ও রেকর্ডিং পর্যন্ত নিজে সেট করা।'
chapter: 4
level: 'intermediate'
readingTime: '২২ মিনিট'
topics: ['ingest', 'mediamtx', 'srs', 'nginx-rtmp', 'stream key', 'authentication', 'hooks', 'rtmps', 'firewall']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

চট্টগ্রামের একটা বড় মাঠে তিন দিনের ওয়াজ মাহফিল। মঞ্চের পাশে একটা ছোট টেবিলে সাউন্ড সিস্টেমের মিক্সার নিয়ে বসেছেন রাজি। মঞ্চে কয়েকটা মাইক্রোফোন, আর মাঠজুড়ে, পাশের রাস্তায়, মহিলাদের প্যান্ডেলে, কয়েক ডজন লাউডস্পিকার। রাজির কাজটা দেখতে সহজ, কিন্তু পুরো অনুষ্ঠান তার টেবিলের উপর দাঁড়িয়ে।

প্রথম কাজ, কে মাইকে কথা বলবে সেটা ঠিক করা। আয়োজক কমিটির ফারাবি রাজির হাতে একটা তালিকা দিয়ে গেছেন: কোন সময়ে কোন বক্তা, আর প্রত্যেকের একটা কার্ড। মঞ্চে কেউ মাইক ধরলে রাজি আগে দেখেন তার কার্ড তালিকার সাথে মেলে কিনা। মিললে চ্যানেলটা খুলে দেন, না মিললে মাইক বন্ধ থাকে, যতই জোরে কথা বলুক। একবার এক অচেনা লোক মঞ্চে উঠে মাইক ধরেছিল; রাজি চ্যানেল খোলেননি, আর তিনি নিজে কাউকে না জানিয়ে তালিকা বদলানও না, প্রতিবার ফারাবিকে ফোন করে জিজ্ঞেস করেন। মাহফিলের মাঝে একজন বক্তার কার্ড হারিয়ে গেলে ফারাবি পুরনো কার্ড বাতিল করে নতুন একটা দেন, যাতে হারানো কার্ড দিয়ে কেউ আর মঞ্চে না উঠতে পারে।

চ্যানেল খুললে রাজি সেটা মাঠের সব লাউডস্পিকারে পাঠান, পাশাপাশি একটা রেকর্ডারে, যাতে পরে ক্যাসেট আর অনলাইনে দেওয়া যায়। কোনো বক্তা কথা শুরু করলে রাজি একটা বাতি জ্বালান, যা দেখে পেছনের ভিডিও টিম ক্যামেরা চালু করে, আর কথা শেষ হলে বাতি নেভান। আর রাজির টেবিলটা মঞ্চের একপাশে, যেখানে শুধু তার নির্দিষ্ট তারগুলো ঢোকে; অন্য কোনো তার ঢোকার জায়গা নেই।

মিলিয়ে নিই: রাজির টেবিল হলো **ইনজেস্ট সার্ভার**। মঞ্চের মাইক হলো **এনকোডার**, বক্তার কার্ড **স্ট্রিম কী**, আর রাজির প্রতিবার ফারাবিকে ফোন করে জিজ্ঞেস করা হলো **HTTP auth hook**, যেখানে ইনজেস্ট সার্ভার নিজে সিদ্ধান্ত নেয় না, আপনার API-কে জিজ্ঞেস করে। হারানো কার্ড বাতিল করে নতুন দেওয়া হলো **স্ট্রিম কী রোটেশন**। চ্যানেলটা লাউডস্পিকার আর রেকর্ডারে পাঠানো হলো **forward** আর **recording**, বক্তা শুরু করলে বাতি জ্বালানো হলো **hook** (`runOnAvailable` বা `on_publish`), আর টেবিলে শুধু নির্দিষ্ট তার ঢোকা হলো **ফায়ারওয়াল**। বাস্তবে প্রতিটা লাইভ প্ল্যাটফর্মের সামনের দরজা ঠিক এই কাজগুলোই করে, আর এই চ্যাপ্টারে আমরা নিজে সেটা বানাব।

## ইনজেস্ট সার্ভারের কাজ

ইনজেস্ট সার্ভার হলো contribution আর বাকি পাইপলাইনের মাঝের দরজা। এর পাঁচটা কাজ:

1. **গ্রহণ**: RTMP, SRT, WHIP বা RTSP-তে স্ট্রিম নেওয়া ([আগের চ্যাপ্টার](/notes/live-streaming/02-contribution-protocols))।
2. **অথেন্টিকেশন**: স্ট্রিম কী যাচাই করা, ভুল হলে সাথে সাথে ফিরিয়ে দেওয়া।
3. **ডিমাক্স ও স্বাভাবিক করা**: যে প্রোটোকলেই আসুক, ভেতরে একই রূপে আনা (অডিও আর ভিডিও ট্র্যাক, টাইমস্ট্যাম্প)।
4. **পরের ধাপে পাঠানো**: ট্রান্সকোডারে, প্যাকেজারে, বা সরাসরি দর্শকের কাছে।
5. **ঘটনা জানানো**: স্ট্রিম শুরু, শেষ, সংযোগ কাটা, এগুলো আপনার অ্যাপকে জানানো, যাতে ড্যাশবোর্ডে "LIVE" দেখায়, নোটিফিকেশন যায়, রেকর্ডিং শুরু হয়।

<Mermaid
title="ইনজেস্ট সার্ভার পাইপলাইনের কোথায় বসে"
code={`graph LR
  OBS["OBS / encoder"] -->|"RTMP, SRT, WHIP"| ING["Ingest server<br/>MediaMTX / SRS"]
  ING -->|"POST auth"| API["Your Go API<br/>stream keys in Postgres"]
  ING -->|"hook: stream available"| API
  ING --> TX["Transcoder<br/>ffmpeg"]
  ING --> REC["Recording<br/>fMP4 on disk"]
  TX --> PKG["Packager, origin, CDN"]`}
/>

একটা মৌলিক নকশা-সিদ্ধান্ত: **ইনজেস্ট সার্ভার স্ট্রিম কী কোথাও জমিয়ে রাখবে না, আপনার API-কে জিজ্ঞেস করবে।** তাহলে কী বাতিল করা, নতুন চ্যানেল যোগ করা, একজন ইউজারকে ব্লক করা, সব আপনার ডেটাবেসে হয়, আর ইনজেস্ট সার্ভার রিস্টার্ট বা কনফিগ বদলাতে হয় না।

## কোন সফটওয়্যার

| সফটওয়্যার          | কী                                                         | কখন বেছে নেবেন                                               |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| **MediaMTX**        | Go-তে লেখা একটা বাইনারি, অনেক প্রোটোকলে গ্রহণ ও পরিবেশন      | একটা VPS-এ সব এক জায়গায়, সহজ কনফিগ, HTTP auth, হুক          |
| **SRS**             | C++-এ লেখা, পূর্ণাঙ্গ মিডিয়া সার্ভার, ক্লাস্টারিং             | বড় স্কেল, RTMP edge/origin ক্লাস্টার, চীনা ইকোসিস্টেমে প্রচলিত |
| **nginx-rtmp-module** | nginx-এর একটা পুরনো RTMP মডিউল                           | শুধু বিদ্যমান সিস্টেম চালিয়ে রাখতে; নতুন কাজে নয়             |
| Wowza, Ant Media, ইত্যাদি | বাণিজ্যিক বা ওপেন-কোর মিডিয়া সার্ভার                  | এন্টারপ্রাইজ সাপোর্ট দরকার হলে; লাইসেন্সের খরচ হিসাব করুন      |

**২০২৬ সালের অক্টোবর অনুযায়ী** GitHub-এ যা দেখা যায় (রিপো দেখে নিজে মিলিয়ে নিন):

- **MediaMTX**: সর্বশেষ রিলিজ v1.21.2 (অক্টোবর ২০২৬)। README অনুযায়ী পাবলিশ করা যায় SRT, WebRTC, RTSP, RTMP, HLS, MPEG-TS, RTP আর Media-over-QUIC-এ, আর পড়া যায় SRT, WebRTC, RTSP, RTMP, HLS আর MoQ-এ। অথেন্টিকেশন internal, HTTP বা JWT। রেকর্ডিং fMP4 বা MPEG-TS-এ।
- **SRS**: স্থিতিশীল রিলিজ v6.0-r2 (সেপ্টেম্বর ২০২৬), সাথে v7 আর v8-এর প্রি-রিলিজ চলছে। HTTP callback (`on_publish` ইত্যাদি) RTMP, SRT আর WHIP সব পাবলিশের জন্য আসে।
- **nginx-rtmp-module** (`arut/nginx-rtmp-module`): সর্বশেষ ট্যাগ v1.2.2 (মে ২০২১), সর্বশেষ কমিট ডিসেম্বর ২০২৪, হাজারের উপর খোলা ইস্যু। চলে, অনেক জায়গায় এখনো চলছে, কিন্তু SRT, WHIP বা Enhanced RTMP-এর আশা করবেন না।

এই চ্যাপ্টার MediaMTX দিয়ে দেখায়, কারণ একটা বাইনারি একটা VPS-এ সব প্রোটোকল সামলায়, আর এর HTTP auth আপনার নিজের Go API-র সাথে সরাসরি জোড়া যায়। SRS-এর সমতুল্য অংশগুলো শেষে দেখাব।

## MediaMTX চালু করা

MediaMTX একটা বাইনারি আর একটা `mediamtx.yml` ফাইল। GitHub রিলিজ থেকে নিজের প্ল্যাটফর্মের বাইনারি নামিয়ে চালালে ডিফল্ট কনফিগে প্রায় সব প্রোটোকল খুলে যায়, আর কোনো অথেন্টিকেশন থাকে না (যে কেউ পাবলিশ করতে পারে)। প্রোডাকশনে প্রথম কাজ সেটা বন্ধ করা।

সর্বশেষ কনফিগ ফাইল অনুযায়ী ডিফল্ট পোর্টগুলো (**২০২৬ সালের অক্টোবর অনুযায়ী**):

| প্রোটোকল       | কনফিগ কী                | ডিফল্ট      | ট্রান্সপোর্ট |
| -------------- | ----------------------- | ----------- | ------------ |
| RTMP           | `rtmpAddress`           | `:1935`     | TCP          |
| RTMPS          | `rtmpsAddress`          | `:1936`     | TCP          |
| RTSP           | `rtspAddress`           | `:8554`     | TCP (আর UDP) |
| HLS            | `hlsAddress`            | `:8888`     | TCP (HTTP)   |
| WebRTC (HTTP)  | `webrtcAddress`         | `:8889`     | TCP (HTTP)   |
| WebRTC (মিডিয়া) | `webrtcLocalUDPAddress` | `:8189`     | UDP          |
| SRT            | `srtAddress`            | `:8890`     | UDP          |
| Control API    | `apiAddress`            | `:9997`     | TCP (HTTP)   |
| Metrics        | `metricsAddress`        | `:9998`     | TCP (HTTP)   |

## স্ট্রিম কী যাচাই: HTTP auth আর একটা Go হ্যান্ডলার

MediaMTX-এর `authMethod: http` সেট করলে প্রতিটা পাবলিশ বা রিড রিকোয়েস্টে MediaMTX আপনার একটা URL-এ JSON POST করে। ডকস অনুযায়ী পেলোডের ঘরগুলো `user`, `password`, `token`, `ip`, `action` (`publish`, `read`, `playback`, `api`, `metrics`, `pprof`), `path`, `protocol`, `id`, `query`, `userAgent`। রেসপন্সের স্ট্যাটাস কোড `20x` হলে অনুমতি, অন্য কিছু হলে প্রত্যাখ্যান। চাইলে রেসপন্স বডিতে `expireAt` দিয়ে সেশনের মেয়াদও বেঁধে দেওয়া যায়।

এনকোডার কী কীভাবে পাঠাবে, প্রোটোকল অনুযায়ী (MediaMTX-এর ডকস থেকে):

```text
RTMP:   rtmp://ingest.baytalhikma.org/baytalhikma?user=enc&pass=sk_7f3a9c2e
SRT:    srt://ingest.baytalhikma.org:8890?streamid=publish:baytalhikma:enc:sk_7f3a9c2e&pkt_size=1316
WHIP:   POST https://ingest.baytalhikma.org/baytalhikma/whip
        Authorization: Bearer enc:sk_7f3a9c2e
RTSP:   rtsp://enc:sk_7f3a9c2e@ingest.baytalhikma.org:8554/baytalhikma
```

এই কনফিগ দিয়ে প্রকাশ বা পড়ার প্রতিটা অনুরোধ আপনার API-তে যায়, আর API আর মেট্রিক্স (যা শুধু লোকালহোস্টে খোলা থাকবে) বাদ:

```yaml
# mediamtx.yml (only the parts that differ from the defaults)
authMethod: http
authHTTPAddress: http://127.0.0.1:8000/mediamtx/auth
authHTTPExclude:
  - action: api
  - action: metrics

apiAddress: 127.0.0.1:9997
metricsAddress: 127.0.0.1:9998
```

আর Go-তে হ্যান্ডলারটা, শুধু স্ট্যান্ডার্ড লাইব্রেরি দিয়ে। পরিষ্কার রাখতে এখানে কী একটা ম্যাপে; প্রোডাকশনে এটা ডেটাবেস লুকআপ:

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type authReq struct {
	User     string `json:"user"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
	Query    string `json:"query"`
}

// streamKeys maps a channel path to its current key; in production this is a DB lookup.
var streamKeys = map[string]string{"baytalhikma": "sk_7f3a9c2e"}

func auth(w http.ResponseWriter, r *http.Request) {
	var req authReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	switch req.Action {
	case "read", "playback":
		w.WriteHeader(http.StatusOK)
		return
	case "publish":
		if key, ok := streamKeys[req.Path]; ok && req.Password == key {
			log.Printf("publish ok path=%s ip=%s proto=%s", req.Path, req.IP, req.Protocol)
			w.WriteHeader(http.StatusOK)
			return
		}
	}
	log.Printf("denied action=%s path=%s ip=%s proto=%s", req.Action, req.Path, req.IP, req.Protocol)
	w.WriteHeader(http.StatusUnauthorized)
}

func main() {
	http.HandleFunc("POST /mediamtx/auth", auth)
	log.Fatal(http.ListenAndServe("127.0.0.1:8000", nil))
}
```

এই হ্যান্ডলার আর কনফিগ লোকালে আসলেই চালিয়েছি। প্রথমে ভুল কী দিয়ে, তারপর সঠিক কী দিয়ে ffmpeg থেকে RTMP পাবলিশ। হ্যান্ডলারের লগ:

```text
2026/10/25 10:49:45 denied action=publish path=baytalhikma ip=127.0.0.1 proto=rtmp
2026/10/25 10:49:47 publish ok path=baytalhikma ip=127.0.0.1 proto=rtmp
```

MediaMTX-এর লগ:

```text
INF [RTMP] [conn 127.0.0.1:64682] closed: authentication failed: server replied with code 401
INF [RTMP] [conn 127.0.0.1:64686] is publishing to path 'baytalhikma', 2 tracks (H264, MPEG-4 Audio)
```

একই হ্যান্ডলার WHIP পাবলিশও গ্রহণ করেছে, `proto=webrtc` লেখা লগ লাইন দিয়ে; একটা হ্যান্ডলার সব প্রোটোকলের দরজা।

<Callout type="warning">

তিনটা জিনিস প্রোডাকশনে ভুলবেন না। **এক**, কী তুলনায় সাধারণ `==` এর বদলে `crypto/subtle.ConstantTimeCompare` ব্যবহার করুন, যাতে উত্তরের সময় দেখে কী আন্দাজ করা না যায়। **দুই**, ডকস অনুযায়ী MediaMTX খালি ইউজারনেম-পাসওয়ার্ড দিয়েও রিকোয়েস্ট পাঠাতে পারে (যেমন RTSP-তে প্রথম চেষ্টায়), তাই খালি মানকে কখনো বৈধ ধরবেন না। **তিন**, `read` সবার জন্য খুলে দেওয়া ঠিক আছে শুধু যদি দর্শকরা ইনজেস্ট সার্ভার থেকে সরাসরি না পড়ে, CDN হয়ে পড়ে; নাহলে রিডেও সাইন করা টোকেন চান ([CDN ট্র্যাকের এজ সিকিউরিটি](/notes/cdn/12-edge-security))।

</Callout>

### স্ট্রিম কী-র নকশা

- **প্রতিটা চ্যানেলের আলাদা কী**, অনুমানযোগ্য নয়: ক্রিপ্টোগ্রাফিক র‍্যান্ডম অন্তত ১২৮ বিট (`crypto/rand`), একটা চেনা প্রিফিক্স সহ (`sk_`), যাতে লগে বা কোডে ফাঁস হলে খুঁজে পাওয়া সহজ।
- **ডেটাবেসে হ্যাশ করে রাখুন**, পাসওয়ার্ডের মতো। ইউজারকে শুধু একবার দেখান।
- **রোটেশন সহজ রাখুন**: "নতুন কী বানাও" বোতাম, যা পুরনোটা সাথে সাথে বাতিল করে। কেউ স্ক্রিন শেয়ারে ভুলে কী দেখিয়ে ফেললে (খুব সাধারণ) এক ক্লিকে ঠিক হয়।
- **চলমান স্ট্রিম কী বাতিল হলে কেটে দিন।** HTTP auth শুধু সংযোগের শুরুতে হয়, তাই কী বাতিল হলেও আগে থেকে চলা স্ট্রিম চলতেই থাকে। MediaMTX-এর Control API দিয়ে সেই সংযোগটা কেটে দিন (RTMP-এর জন্য `/v3/rtmp/conns/kick/` এর পরে সংযোগের আইডি দিয়ে একটা POST; SRT, WebRTC আর অন্য প্রোটোকলের আলাদা এন্ডপয়েন্ট আছে, নিজের ভার্সনের API ডকসে দেখুন), বা auth রেসপন্সে `expireAt` দিয়ে প্রতিটা সেশনের মেয়াদ সীমিত রাখুন।
- **পাবলিশের হার সীমিত করুন।** ভুল কী দিয়ে বারবার চেষ্টা এলে API-তে IP ধরে রেট লিমিট দিন; MediaMTX-এর ডকস `fail2ban` দিয়ে ব্যর্থ চেষ্টার পর IP ব্যান করার একটা রেসিপিও দেয়।

## হুক: স্ট্রিম শুরু ও শেষ হলে

অথেন্টিকেশন বলে "ঢুকতে দেব কিনা"। হুক বলে "ঢোকার পর কী ঘটল"। MediaMTX পাথের ঘটনায় একটা কমান্ড চালায়, পরিবেশ ভেরিয়েবলে বিস্তারিত দিয়ে:

| হুক                         | কখন চলে                                 |
| --------------------------- | --------------------------------------- |
| `runOnConnect` / `runOnDisconnect` | কোনো ক্লায়েন্ট সংযুক্ত বা বিচ্ছিন্ন হলে |
| `runOnAvailable` / `runOnUnavailable` | পাথে স্ট্রিম পড়ার যোগ্য হলে, বা আর না থাকলে |
| `runOnRead` / `runOnUnread` | কেউ পড়া শুরু বা শেষ করলে                 |
| `runOnRecordSegmentComplete` | একটা রেকর্ডিং সেগমেন্ট লেখা শেষ হলে     |

<Callout type="info">

পুরনো MediaMTX-এ (v1.20-এর আগে) স্ট্রিম আসার হুকের নাম ছিল `runOnReady` আর `runOnNotReady`। v1.20.0-এর কনফিগ থেকে `runOnReady` নেই, এর জায়গায় `runOnAvailable` আছে। ইন্টারনেটের অনেক টিউটোরিয়াল পুরনো নাম ব্যবহার করে; আপনার ভার্সনের `mediamtx.yml` দেখে মিলিয়ে নিন।

</Callout>

দুটো প্রচলিত ব্যবহার। প্রথমটা, আপনার API-কে জানানো যে চ্যানেল লাইভ হয়েছে বা শেষ হয়েছে:

```yaml
pathDefaults:
  runOnAvailable: >
    curl -fsS -X POST http://127.0.0.1:8000/hooks/live
    -d path=$MTX_PATH -d source=$MTX_SOURCE_TYPE -d state=live
  runOnUnavailable: >
    curl -fsS -X POST http://127.0.0.1:8000/hooks/live
    -d path=$MTX_PATH -d state=offline
```

দ্বিতীয়টা, স্ট্রিম এলেই একটা ffmpeg ট্রান্সকোডার চালু করা, যা MediaMTX থেকে পড়ে একটা ABR ল্যাডার বানায়। `runOnAvailable` স্ট্রিম চলে গেলে কমান্ডটাকে SIGINT দিয়ে থামায়, তাই আলাদা করে ট্রান্সকোডার বন্ধ করতে হয় না:

```yaml
pathDefaults:
  runOnAvailable: /opt/live/transcode.sh $MTX_PATH
  runOnAvailableRestart: true
```

`transcode.sh` এর ভেতরে কী থাকে, সেটা [পাঁচ নম্বর চ্যাপ্টারে](/notes/live-streaming/05-live-transcode-package)। `runOnAvailableRestart: true` মানে ট্রান্সকোডার কোনো কারণে মরে গেলে MediaMTX আবার চালু করবে, যা লাইভে জরুরি।

<Callout type="tip">

হুকের কমান্ড যত দ্রুত সম্ভব শেষ হওয়া বা পেছনে চলে যাওয়া উচিত, আর ব্যর্থ হলেও স্ট্রিমে প্রভাব ফেলা উচিত নয়। `curl`-এ `-m 3` (সর্বোচ্চ তিন সেকেন্ড) দিন, আর API-র দিকে হুক আইডেম্পোটেন্ট রাখুন: একই "live" ইভেন্ট দুবার এলে যেন দুটো নোটিফিকেশন না যায়। হুকের নির্ভরযোগ্যতার প্যাটার্ন [ওয়েবহুক ট্র্যাকে](/notes/webhooks/00-roadmap) আছে।

</Callout>

## Control API দিয়ে দেখা কী চলছে

MediaMTX-এর Control API দিয়ে যেকোনো সময় দেখা যায় কোন পাথে কে পাবলিশ করছে, কত বাইট এসেছে, কে পড়ছে। লোকাল পরীক্ষায় আসল রেসপন্স (ছোট করা):

```bash
curl -s http://127.0.0.1:9997/v3/paths/list
```

```text
{
  "itemCount": 1,
  "items": [
    {
      "name": "baytalhikma",
      "source": { "type": "rtmpConn", "id": "503bde8d-..." },
      "ready": true,
      "readyTime": "2026-10-25T10:49:47.845126+06:00",
      "tracks": ["H264", "MPEG-4 Audio"],
      "bytesReceived": 2236321,
      "readers": []
    }
  ]
}
```

`bytesReceived` কয়েক সেকেন্ড পরপর দেখলে ইনজেস্ট বিটরেট পাওয়া যায়। এটা বারো নম্বর চ্যাপ্টারের মনিটরিংয়ের প্রথম সংখ্যা। একই সময়ে MediaMTX থেকে সরাসরি HLS প্লেলিস্টও পাওয়া যায় (আসল রেসপন্স):

```text
HTTP/1.1 200 OK
Cache-Control: max-age=30
Content-Type: application/vnd.apple.mpegurl
Server: mediamtx

#EXTM3U
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio2",AUTOSELECT=YES,DEFAULT=YES,URI="audio2_stream.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2565204,AVERAGE-BANDWIDTH=2565204,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=30.000,AUDIO="audio"
video1_stream.m3u8
```

লক্ষ্য করুন, এটা উৎসের একটাই রেন্ডিশন (৭২০p), কোনো ল্যাডার নয়। MediaMTX শুধু রিমাক্স করে, ট্রান্সকোড করে না; ল্যাডারের জন্য ট্রান্সকোডার লাগে। আর multivariant প্লেলিস্টে `Cache-Control: max-age=30` এসেছে, কিন্তু মিডিয়া প্লেলিস্ট প্রতি সেকেন্ডে বদলায়; CDN-এর সামনে বসালে কোনটা কতক্ষণ ক্যাশ হবে, সেটা আট নম্বর চ্যাপ্টারে।

## ফায়ারওয়াল

ইনজেস্ট VPS-এ শুধু যা লাগবে তাই খুলুন। `nftables` দিয়ে একটা উদাহরণ, যেখানে RTMPS, SRT আর WHIP বাইরে খোলা, প্লেইন RTMP শুধু একটা পরিচিত অফিস IP থেকে, আর API, মেট্রিক্স ও HLS শুধু লোকালহোস্টে (HLS বাইরে যায় একটা আলাদা nginx origin বা CDN হয়ে):

```text
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif lo accept
    tcp dport 22 accept                                  # ssh
    tcp dport 1936 accept                                # RTMPS
    ip saddr 203.0.113.25 tcp dport 1935 accept          # plain RTMP, office only
    udp dport 8890 accept                                # SRT
    tcp dport 8889 accept                                # WHIP signalling (put TLS in front)
    udp dport 8189 accept                                # WebRTC media
  }
}
```

[Linux/VPS ট্র্যাকে](/notes/linux-vps/00-roadmap) nftables-এর বাকিটা আছে। দুটো সাধারণ ভুল: SRT আর WebRTC **UDP**, কিন্তু অনেকে শুধু TCP খোলে; আর ক্লাউড প্রোভাইডারের নিজস্ব ফায়ারওয়াল (security group) আলাদা, সেখানেও একই পোর্ট খুলতে হয়।

### WebRTC আর NAT

WebRTC-তে সার্ভার নিজের IP এনকোডারকে জানায় (ICE candidate)। VPS-এ সাধারণত সমস্যা নেই, কারণ ইন্টারফেসেই পাবলিক IP থাকে। কিন্তু সার্ভার যদি NAT-এর পেছনে থাকে (কিছু ক্লাউডে, বা ঘরের সার্ভারে), তাহলে MediaMTX প্রাইভেট IP জানায় আর এনকোডার সংযোগই করতে পারে না: WHIP POST সফল হয় (`201`), কিন্তু মিডিয়া কখনো আসে না। সমাধান হলো কনফিগে পাবলিক IP বা হোস্টনেম যোগ করা (`webrtcAdditionalHosts`), বা STUN/TURN সার্ভার দেওয়া (`webrtcICEServers2`)।

## RTMPS আর WHIP-এর জন্য TLS

MediaMTX নিজেই RTMPS দিতে পারে (`rtmpEncryption: "strict"` বা `"optional"`, সাথে `rtmpServerKey` আর `rtmpServerCert`)। সার্টিফিকেট হিসেবে Let's Encrypt-এর ফাইল দিন, আর রিনিউ হলে MediaMTX রিলোড করুন ([TLS ট্র্যাক](/notes/tls-certs/08-renewal-monitoring)):

```yaml
rtmpEncryption: "optional"            # accept both rtmp:// on 1935 and rtmps:// on 1936
rtmpsAddress: :1936
rtmpServerKey: /etc/letsencrypt/live/ingest.baytalhikma.org/privkey.pem
rtmpServerCert: /etc/letsencrypt/live/ingest.baytalhikma.org/fullchain.pem
```

অনেক এনকোডার আর অফিসের ফায়ারওয়াল RTMPS-এর জন্য পোর্ট 443 আশা করে। একই সার্ভারে 443-এ যদি অন্য কিছু (যেমন nginx) থাকে, তাহলে nginx-এর `stream` মডিউল দিয়ে TLS টার্মিনেট করে ভেতরে 1935-এ পাঠানো যায়, বা ইনজেস্টের জন্য আলাদা একটা IP রাখা যায়।

WHIP-এর HTTP অংশটা (`:8889`) সাধারণ HTTPS; সামনে nginx বা Caddy বসিয়ে TLS দিন, শুধু মিডিয়ার UDP পোর্ট সরাসরি খোলা থাকে।

## রেকর্ডিং

লাইভ শেষে রেকর্ডিং প্রায় সবসময় লাগে (রিপ্লে, ক্লিপ, আর্কাইভ)। MediaMTX পাথ ধরে ডিস্কে লিখতে পারে:

```yaml
pathDefaults:
  record: true
  recordPath: /var/lib/mediamtx/recordings/%path/%Y-%m-%d_%H-%M-%S-%f
  recordFormat: fmp4
  recordSegmentDuration: 1h
  recordDeleteAfter: 7d
  runOnRecordSegmentComplete: /opt/live/upload-segment.sh $MTX_PATH $MTX_SEGMENT_PATH
```

এখানে রেকর্ডিং এক ঘণ্টার টুকরোয় হয়, প্রতিটা টুকরো শেষ হলে একটা স্ক্রিপ্ট সেটা object storage-এ পাঠায়, আর সাত দিন পর লোকাল কপি মুছে যায়। উৎসের মানেই রেকর্ড হয় (ট্রান্সকোড ছাড়া), যা live-to-VOD-এর জন্য সবচেয়ে ভালো ইনপুট। সাত নম্বর চ্যাপ্টারে এটা দিয়ে DVR আর VOD বানাব, আর [VOD ট্র্যাক](/notes/vod/00-roadmap) দেখায় তারপর ফাইলটার কী হয়। হুকের পরিবেশ ভেরিয়েবলের সঠিক নাম নিজের ভার্সনের কনফিগে মিলিয়ে নিন।

<Callout type="warning">

ডিস্ক ভরে গেলে রেকর্ডিং থামে, আর কিছু সেটআপে পুরো সার্ভার অস্থির হয়ে লাইভই ভেঙে পড়ে। একটা ১০৮০p৬ Mbps স্ট্রিম ঘণ্টায় মোটামুটি ২.৭ GB নেয় (৬ × ৩৬০০ / ৮ মেগাবাইট), দশটা চ্যানেল একটা পুরো দিন চললে ছয়শো গিগাবাইটের বেশি। ডিস্কের ব্যবহারে অ্যালার্ট রাখুন, আর `recordDeleteAfter` কখনো খালি রাখবেন না।

</Callout>

## একাধিক চ্যানেল আর পাথ

MediaMTX-এ প্রতিটা স্ট্রিম একটা **পাথ** (`/baytalhikma`, `/cordoba-cricket`)। কনফিগে `paths:` এর নিচে নির্দিষ্ট পাথের জন্য আলাদা সেটিং দেওয়া যায়, আর `all_others` বা regex (`~^live/`) দিয়ে বাকি সবকে ধরা যায়। প্ল্যাটফর্মে সাধারণত পাথ হলো চ্যানেলের আইডি, আর কোন পাথে কে পাবলিশ করতে পারে সেটা পুরোপুরি auth হ্যান্ডলার ঠিক করে, তাই নতুন চ্যানেলের জন্য কনফিগ বদলাতে হয় না।

একটা পাথে একসাথে একজনই পাবলিশ করতে পারে। দ্বিতীয় এনকোডার একই পাথে এলে কী হবে, সেটা MediaMTX-এ `overridePublisher` ঠিক করে। সর্বশেষ কনফিগে এর ডিফল্ট `true`, মানে নতুন এনকোডার পুরনোটাকে কেটে দিয়ে নিজে পাবলিশ করে। একটা ফাঁস হওয়া কী দিয়ে কেউ আপনার চলমান লাইভ দখল করে নিতে পারে এভাবেই, তাই কী গোপন রাখা আর দ্রুত রোটেট করা জরুরি; দরকার হলে `false` করুন। রিডানডেন্ট ইনজেস্টের জন্য এক পাথে দুই এনকোডার নয়, দুইটা আলাদা পাথ বা আলাদা সার্ভার রাখুন (চ্যাপ্টার ৯)।

## SRS-এ একই জিনিস

SRS-এ অথেন্টিকেশন আর হুক দুটোই HTTP callback। কনফিগের `http_hooks` ব্লকে `on_publish` দিলে প্রতিটা পাবলিশে SRS একটা JSON POST করে, যাতে `action`, `client_id`, `ip`, `app`, `stream`, `param` (query string, টোকেন এখানে আসে) ইত্যাদি থাকে, আর `type` ঘরে প্রোটোকল বোঝা যায় (RTMP-এর জন্য `fmle-publish`, SRT-এর জন্য `srt-publish`, WHIP-এর জন্য `rtc-publish`)। SRS-এর নমুনা কনফিগ অনুযায়ী অনুমতি দিতে API-কে HTTP 200 আর বডিতে `0` ফেরত দিতে হয়; অন্য কিছু মানে প্রত্যাখ্যান।

```text
vhost __defaultVhost__ {
    http_hooks {
        enabled         on;
        on_publish      http://127.0.0.1:8000/srs/on_publish;
        on_unpublish    http://127.0.0.1:8000/srs/on_unpublish;
    }
}
```

একটা সূক্ষ্ম পার্থক্য: MediaMTX-এ শুধু স্ট্যাটাস কোড দেখা হয়, SRS-এ স্ট্যাটাস আর বডি দুটোই। একই Go সার্ভারে দুটোর জন্য আলাদা হ্যান্ডলার রাখুন।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন কীভাবে | সমাধান |
| ----- | ------------------- | ------ |
| যে কেউ পাবলিশ করতে পারছে | কনফিগে `authMethod` দেখুন; ডিফল্ট internal কনফিগে `user: any` পাবলিশ পায় | `authMethod: http` বা internal-এ শুধু নির্দিষ্ট ইউজার |
| সঠিক কী দিয়েও প্রত্যাখ্যাত | MediaMTX লগে `server replied with code ...`; API লগে কোন `path` আর `password` এসেছে দেখুন | কী URL-এর ভুল জায়গায় (পাথ বনাম `pass=`), SRT streamid ফরম্যাট, বা API-তে পাথের নাম মিলছে না |
| auth API-তে খালি user/pass আসে | API লগ | ডকস অনুযায়ী স্বাভাবিক (যেমন RTSP-এর প্রথম চেষ্টা); `401` দিন, ক্লায়েন্ট তখন পরিচয় পাঠাবে |
| কী বাতিল করার পরও স্ট্রিম চলছে | Control API-তে পাথের `source` এখনো আছে | auth শুধু শুরুতে হয়; API দিয়ে সংযোগ kick করুন বা `expireAt` দিন |
| হুক চলে না | MediaMTX লগে হুকের এরর; কমান্ড নিজে টার্মিনালে চালান | পুরনো নাম (`runOnReady`) ব্যবহার করছেন কিনা ভার্সন মিলিয়ে দেখুন; পূর্ণ পাথ দিন |
| ট্রান্সকোডার একবার মরে আর ফেরে না | `pgrep -a ffmpeg`; লগে exit | `runOnAvailableRestart: true` |
| SRT বা WHIP সংযোগ হয় না, RTMP ঠিক | `nft list ruleset`, ক্লাউডের security group; `tcpdump -n udp port 8890` | UDP পোর্ট খুলুন, দুই জায়গাতেই |
| WHIP `201` কিন্তু মিডিয়া আসে না | MediaMTX লগে "peer connection established" নেই; ICE candidate-এ প্রাইভেট IP | `webrtcAdditionalHosts`-এ পাবলিক IP, বা STUN/TURN |
| RTMPS-এ সার্টিফিকেট এরর | `openssl s_client -connect ingest.baytalhikma.org:1936` | fullchain দিন, রিনিউর পর রিলোড |
| রেকর্ডিং মাঝপথে থেমে গেছে | `df -h`; MediaMTX লগে write error | ডিস্ক খালি করুন, `recordDeleteAfter`, ডিস্কে অ্যালার্ট |
| প্লেয়ারে শুধু একটা কোয়ালিটি | MediaMTX-এর HLS প্লেলিস্টে একটাই `EXT-X-STREAM-INF` | MediaMTX রিমাক্স করে, ল্যাডারের জন্য ট্রান্সকোডার লাগবে (চ্যাপ্টার ৫) |

## মূল শিক্ষা

1. **ইনজেস্ট সার্ভার পাইপলাইনের দরজা**: গ্রহণ, অথেন্টিকেশন, স্বাভাবিক করা, পরের ধাপে পাঠানো, আর ঘটনা জানানো।
2. **স্ট্রিম কী যাচাই আপনার API-তে রাখুন**, ইনজেস্ট কনফিগে নয়। MediaMTX-এর HTTP auth আর SRS-এর `on_publish` দুটোই এটা সম্ভব করে, সব প্রোটোকলের জন্য এক হ্যান্ডলারে।
3. **কী একটা পাসওয়ার্ড**: র‍্যান্ডম, হ্যাশ করে রাখা, এক ক্লিকে রোটেট করা যায়, আর বাতিল হলে চলমান সংযোগও কাটা।
4. **হুক দিয়ে স্ট্রিম শুরু ও শেষের ঘটনা আপনার অ্যাপে আনুন** আর ট্রান্সকোডার চালু করুন; ভার্সন অনুযায়ী হুকের নাম বদলায় (`runOnReady` থেকে `runOnAvailable`)।
5. **ফায়ারওয়ালে শুধু যা লাগে তাই খুলুন**, আর মনে রাখুন SRT ও WebRTC UDP। ক্লাউডের ফায়ারওয়াল আলাদা।
6. **পাবলিক ইন্টারনেটে RTMPS**, আর WebRTC-তে সার্ভারের পাবলিক IP যেন ঠিকমতো জানানো হয়।
7. **রেকর্ডিং উৎসের মানে, টুকরো করে, মুছে ফেলার নিয়মসহ**; ডিস্ক ভরে যাওয়া লাইভ সার্ভারের সবচেয়ে সাধারণ নীরব মৃত্যু।
8. **nginx-rtmp-module নতুন কাজে নয়**; MediaMTX বা SRS আধুনিক প্রোটোকল সাপোর্ট করে আর সক্রিয়ভাবে রক্ষণাবেক্ষণ হয়।
