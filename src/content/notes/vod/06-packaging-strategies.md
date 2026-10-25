---
title: 'প্যাকেজিং কৌশল'
subtitle: 'আগে থেকে সব ফরম্যাটে প্যাকেজ করে রাখবেন, নাকি রিকোয়েস্ট এলে তখন বানাবেন? স্টোরেজ, কম্পিউট, লেটেন্সি আর নমনীয়তার মধ্যে বাছাই, আর প্রতি রিকোয়েস্টে manifest বদলানো।'
chapter: 6
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['packaging', 'just-in-time packaging', 'cmaf', 'cbcs', 'cenc', 'manifest manipulation', 'shaka packager', 'nginx-vod-module']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

গাউছিয়া মার্কেটের দোতলায় পাশাপাশি দুইটা কাপড়ের দোকান। সিনার দোকানে সব আগে থেকে কেটে প্যাকেট করা: থ্রি-পিসের জন্য আড়াই গজ, পাঞ্জাবির জন্য তিন গজ, বাচ্চার জামার জন্য দেড় গজ, প্রতিটা রঙে, প্রতিটা নকশায়। ঈদের ভিড়ে খদ্দের এসে আঙুল দিয়ে দেখায়, সিনা তাক থেকে প্যাকেট নামিয়ে দেন, দশ সেকেন্ডে বিক্রি শেষ। কিন্তু তাঁর গুদাম ভর্তি। একটা নকশা যদি দশটা রঙে আর চারটা মাপে থাকে, তাহলে চল্লিশ রকম প্যাকেট, আর তার অর্ধেক হয়তো কখনো বিক্রিই হয় না। নতুন একটা মাপের চাহিদা এলে, ধরুন সোয়া দুই গজ, পুরো স্টক নতুন করে কাটতে হয়।

পাশের দোকানে বিরুনি রাখেন শুধু থান, মানে পুরো রোল। খদ্দের যা মাপ চান, সামনে বসে কাঁচি দিয়ে কেটে দেন। গুদামে জায়গা লাগে অনেক কম, আর যেকোনো অদ্ভুত মাপ দেওয়া যায়। কিন্তু প্রতিটা বিক্রিতে মাপা আর কাটায় সময় লাগে, আর চাঁদরাতের ভিড়ে কাঁচি একটাই, তাই লাইন লম্বা হয়ে যায়। বিরুনি একটা কৌশল বের করেছেন: সবচেয়ে বেশি বিক্রি হওয়া মাপের কয়েকটা টুকরো কেটে সামনের তাকে রেখে দেন। পরের খদ্দের ওই মাপ চাইলে আর কাটতে হয় না।

আরেকটা ব্যাপার আছে। কিছু খদ্দের পাড় আলাদা চান, কিছু খদ্দের ভেতরের দিকে লাইনিং চান। সিনাকে প্রতিটা ভ্যারিয়েশনের আলাদা প্যাকেট রাখতে হয়, স্টক দ্বিগুণ হয়ে যায়। বিরুনি একই থান থেকে কাটার সময় যেভাবে চাওয়া হয় সেভাবে দিয়ে দেন। আর দুইজনেই একটা জিনিস শিখেছেন: থানটা ভালো মানের একটাই কাপড়ের হলে, সেটা থেকে থ্রি-পিস আর পাঞ্জাবি দুটোই হয়; আলাদা আলাদা থান কিনতে হয় না।

মিলিয়ে নিই: সিনার আগে কেটে রাখা প্যাকেট হলো **static pre-packaging**, যেখানে প্রতিটা ফরম্যাট, রেন্ডিশন আর এনক্রিপশনের সেগমেন্ট আগেই স্টোরেজে লেখা থাকে। বিরুনির থান থেকে কাটা হলো **just-in-time (JIT) packaging**: স্টোরেজে শুধু MP4, আর রিকোয়েস্ট এলে তখন সেগমেন্ট বানানো। গুদাম ভর্তি হওয়া হলো **স্টোরেজ গুণিতক হারে বাড়া**, আর কাঁচির লাইন হলো **রিকোয়েস্টের সময় কম্পিউট আর প্রথম রিকোয়েস্টের লেটেন্সি**। সামনের তাকে কাটা টুকরো রাখা হলো **JIT আউটপুট CDN-এ ক্যাশ করা**, যেটা আসলে **hybrid**। পাড় আর লাইনিং-এর ভ্যারিয়েশন হলো **cbcs আর cenc এনক্রিপশন**, আর এক থান থেকে দুই জামা হলো **CMAF**, যেখানে এক সেট সেগমেন্ট থেকে HLS আর DASH দুটোই চলে। বাস্তবে ছোট প্ল্যাটফর্ম সাধারণত সিনার পথে শুরু করে, আর ফরম্যাট, DRM সিস্টেম আর ডিভাইসের সংখ্যা বাড়লে বিরুনির পথে যায়।

## প্রশ্নটা কী

[ভিডিও ট্র্যাকের প্যাকেজিং চ্যাপ্টার](/notes/video/06-packaging-for-streaming) দেখিয়েছে HLS, DASH আর CMAF কী, playlist আর MPD দেখতে কেমন, আর এনক্রিপশন কীভাবে কাজ করে। এই চ্যাপ্টার সেগুলো আবার বলে না। এখানে প্রশ্নটা প্ল্যাটফর্মের: **প্যাকেজিং কখন হবে, আর কোথায়?**

<Mermaid
title="তিনটা কৌশল, একই প্লেয়ার রিকোয়েস্ট"
code={`flowchart LR
  subgraph S["Static"]
    E1["encode"] --> P1["package every format"] --> ST1[("segments + manifests")]
    ST1 --> C1["CDN"]
  end
  subgraph J["Just-in-time"]
    E2["encode"] --> ST2[("plain MP4 renditions")]
    ST2 --> O2["packager at origin"] --> C2["CDN"]
  end
  subgraph H["Hybrid"]
    E3["encode"] --> P3["package CMAF once"] --> ST3[("CMAF segments")]
    ST3 --> O3["origin writes manifests + encrypts per request"] --> C3["CDN"]
  end`}
/>

## Static pre-packaging

এনকোড শেষে এক ধাপে সব ফরম্যাটের সেগমেন্ট আর manifest লিখে ফেলা। origin তখন একটা সাধারণ ফাইল সার্ভার, nginx বা object storage-এর সামনে CDN যথেষ্ট।

ffmpeg দিয়েই একটা রেন্ডিশনকে fMP4 সেগমেন্টে HLS-এর জন্য প্যাকেজ করা যায় (নিচের আউটপুট একটা ৬০ সেকেন্ডের টেস্ট ফাইলে আসলে চালানো):

```bash
ffmpeg -i src.mp4 -map 0:v -map 0:a -c copy \
  -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename 'cmaf/seg_%03d.m4s' cmaf/index.m3u8
```

```text
$ ls cmaf | wc -l
      17
$ head -8 cmaf/index.m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:5
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init.mp4"
#EXTINF:5.000000,
seg_000.m4s
```

১৭টা ফাইল: একটা playlist, একটা init, ১৫টা সেগমেন্ট। লক্ষ্য করুন প্রথম সেগমেন্ট ৪ নয়, ৫ সেকেন্ড। প্যাকেজার শুধু কীফ্রেমে কাটতে পারে, তাই সেগমেন্টের দৈর্ঘ্য এনকোডারের GOP ঠিক করে দেয়, `hls_time` শুধু একটা লক্ষ্য। প্যাকেজিংয়ের আগে এনকোডে নির্দিষ্ট ইন্টারভালে কীফ্রেম বসানো এই কারণেই জরুরি ([bitrate ladder চ্যাপ্টারে aligned keyframe](/notes/video/05-bitrate-ladder))।

### গুণিতক সমস্যা

static-এর আসল খরচ এই গুণফলে:

```text
stored copies = renditions x containers x encryption schemes x (DRM key sets)

6 renditions x 1 (CMAF) x 1 (clear)               =  6 sets
6 renditions x 2 (TS for old HLS + fMP4) x 1      = 12 sets
6 renditions x 1 (CMAF) x 2 (cbcs + cenc)         = 12 sets
6 renditions x 2 x 2                              = 24 sets
```

প্রতিটা "set" মানে একটা পুরো ভিডিওর সমান স্টোরেজ আর হাজার হাজার অবজেক্ট ([আগের চ্যাপ্টারের হিসাব](/notes/vod/05-storage-layout))। এক ফরম্যাট আর ক্লিয়ার (এনক্রিপশন ছাড়া) কনটেন্টে static প্রায় সবসময় সঠিক উত্তর। গুণফল বড় হতে থাকলে তখন অন্য পথ ভাবুন।

## CMAF: গুণফলের একটা গুণক মুছে ফেলা

CMAF মানে HLS আর DASH একই fMP4 সেগমেন্ট শেয়ার করে, শুধু manifest আলাদা। ffmpeg-এর DASH muxer এক রানে দুটোই লিখতে পারে:

```bash
ffmpeg -i src.mp4 -map 0:v -map 0:a -c copy \
  -f dash -seg_duration 4 -use_template 1 -use_timeline 0 \
  -hls_playlist 1 \
  -init_seg_name 'init-$RepresentationID$.m4s' \
  -media_seg_name 'seg-$RepresentationID$-$Number%05d$.m4s' \
  dash/manifest.mpd
```

```text
$ ls dash | head -6
init-0.m4s
init-1.m4s
manifest.mpd
master.m3u8
media_0.m3u8
media_1.m3u8
$ cat dash/master.m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_A1",NAME="audio_1",DEFAULT=YES,CHANNELS="1",URI="media_1.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2758618,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="group_A1"
media_0.m3u8
```

একই সেগমেন্ট ফাইলগুলো এখন `manifest.mpd` (DASH) আর `master.m3u8` (HLS) দুটো থেকেই রেফার হচ্ছে। ভিডিও আর অডিও আলাদা ট্র্যাকে আছে, যেটা CMAF-এর নিয়ম এবং একাধিক অডিও ভাষার জন্যও দরকারি।

<Callout type="info">

**কখন CMAF যথেষ্ট নয়:** খুব পুরনো ডিভাইস বা কিছু সেট-টপ বক্স শুধু MPEG-TS সেগমেন্টের HLS বোঝে। আপনার দর্শকের মধ্যে এমন ডিভাইস কত শতাংশ, সেটা অ্যানালিটিক্স থেকে দেখে সিদ্ধান্ত নিন (চ্যাপ্টার ১০)। শুধু "যদি কেউ থাকে" ভেবে পুরো ক্যাটালগের দ্বিতীয় কপি রাখা খুব দামি।

</Callout>

## এনক্রিপশন: যে গুণকটা থেকে যায়

DRM-এর দুইটা Common Encryption স্কিম আছে: **cenc** (AES-CTR) আর **cbcs** (AES-CBC, প্যাটার্ন এনক্রিপশন)। কোনটা কী, তা [ভিডিও ট্র্যাকে](/notes/video/06-packaging-for-streaming) আছে। প্ল্যাটফর্মের প্রশ্নটা হলো: একটা স্কিম দিয়ে কি সব ডিভাইসে চলে?

Apple-এর FairPlay cbcs চায়। আধুনিক Widevine আর PlayReady ক্লায়েন্টের বেশিরভাগ cbcs-ও বোঝে, তাই নতুন প্ল্যাটফর্ম সাধারণত **শুধু cbcs**-এ এক সেট সেগমেন্ট রাখে। কিন্তু কিছু পুরনো Android, স্মার্ট TV বা ব্রাউজার ভার্সন শুধু cenc বোঝে। তাদের সাপোর্ট দিতে হলে দুটো কপি লাগে, static-এ যার মানে স্টোরেজ দ্বিগুণ। কোন ডিভাইস কোন স্কিম বোঝে, সেটা প্রতিটা DRM ভেন্ডর আর ডিভাইস নির্মাতার ডকসে দেখে নিতে হবে, কারণ এই তালিকা নিয়মিত বদলায়। ঠিক এই জায়গাতেই JIT সবচেয়ে বেশি লাভ দেয়: স্টোরেজে ক্লিয়ার CMAF থাকে, আর রিকোয়েস্টের সময় ডিভাইস অনুযায়ী এনক্রিপ্ট হয়।

<Callout type="warning">

**স্টোরেজে ক্লিয়ার কনটেন্ট রাখা মানে স্টোরেজটাই এখন সবচেয়ে মূল্যবান জিনিস।** JIT এনক্রিপশনে বাকেট ফাঁস হলে DRM কোনো কাজে আসে না। তাই origin বাকেট কখনো পাবলিক নয়, শুধু প্যাকেজারের credential পড়তে পারে, আর CDN সরাসরি বাকেটে যায় না, যায় প্যাকেজারের কাছে। কী ম্যানেজমেন্ট চ্যাপ্টার ৮-এ।

</Callout>

## Just-in-time packaging

JIT origin স্টোরেজ থেকে সাধারণ MP4 পড়ে, আর রিকোয়েস্টের URL দেখে সেই মুহূর্তে বানায়: manifest, init সেগমেন্ট, বা একটা মিডিয়া সেগমেন্ট (দরকার হলে এনক্রিপ্ট করে)। কাজটা ট্রান্সকোডিং নয়, শুধু রিমাক্সিং: কোনো ডিকোড বা এনকোড হয় না, শুধু বাইট নতুন বাক্সে সাজানো হয়। তাই CPU খরচ কম, কিন্তু শূন্য নয়।

### nginx-vod-module দিয়ে একটা উদাহরণ

Kaltura-র `nginx-vod-module` একটা nginx মডিউল যা MP4 থেকে উড়ন্ত অবস্থায় HLS, DASH আর MSS বানায়, আর CENC, FairPlay আর AES-128 এনক্রিপশন করতে পারে। এর README-র লোকাল মোডের উদাহরণ এমন:

```nginx
# Illustrative: check the README of the version you build for exact directives
vod_mode local;

server {
    listen 8080;

    location /content/ {
        root /srv/media/;
        vod hls;
    }
}
```

এরপর `/content/movie.mp4/master.m3u8` রিকোয়েস্ট করলে মডিউল `/srv/media/content/movie.mp4` পড়ে playlist বানায়। একাধিক রেন্ডিশন একটা URL-এ জোড়া দেওয়ার জন্য এর "urlset" সিনট্যাক্স আছে, যেখানে কমা দিয়ে আলাদা করা অংশগুলো prefix আর suffix-এর সাথে জুড়ে আলাদা ফাইল হয়:

```text
/content/movie_,360p,720p,1080p,.mp4.urlset/master.m3u8
  -> movie_360p.mp4, movie_720p.mp4, movie_1080p.mp4 in one master playlist
```

<Callout type="warning">

**রক্ষণাবেক্ষণের অবস্থা দেখে নিন।** ২০২৬ সালের অক্টোবরে GitHub-এ `kaltura/nginx-vod-module`-এর মূল ব্রাঞ্চে শেষ কমিট ২০২৪ সালের মার্চে, যদিও রিপোজিটরি archived নয়। প্রোডাকশনে বসানোর আগে দেখুন আপনার nginx ভার্সনের সাথে বিল্ড হয় কিনা, আর খোলা ইস্যুগুলো পড়ুন। এর README-তে একটা অসঙ্গতিও আছে: `vod_segment_duration`-এর ডিফল্ট `10s` লেখা, অথচ বর্ণনায় বলা মান মিলিসেকেন্ডে। এটা স্পষ্ট করে সেট করুন, ডিফল্টের উপর ভরসা করবেন না।

</Callout>

### অন্য টুলগুলো

| টুল | কী করে | কখন |
| --- | --- | --- |
| ffmpeg (hls/dash muxer) | এনকোডের সাথে সাথে বা আলাদা ধাপে static প্যাকেজিং | সবচেয়ে সরল পথ, ক্লিয়ার কনটেন্ট |
| Shaka Packager | static প্যাকেজিং, HLS আর DASH একসাথে, cenc/cbcs এনক্রিপশন, raw key বা DRM সার্ভার | DRM সহ static, সবচেয়ে প্রচলিত ওপেন সোর্স পথ |
| GPAC (MP4Box) | DASH/HLS প্যাকেজিং, MP4 পরীক্ষা ও মেরামত, অনেক বেশি নিয়ন্ত্রণ | জটিল কেস, ডিবাগিং |
| nginx-vod-module | JIT, nginx-এর ভেতরে | self-hosted JIT, রক্ষণাবেক্ষণ নিজে দেখে |
| বাণিজ্যিক JIT origin | JIT, DRM, SSAI, লাইভ ও VOD একসাথে | বড় স্কেল, যেখানে লাইসেন্স খরচ চলে |

২০২৬ সালের অক্টোবরে GitHub-এ Shaka Packager-এর সর্বশেষ রিলিজ v3.9.x লাইনে, আর GPAC-এর v26.07; কমান্ড লেখার আগে যে ভার্সন চালাবেন তার ডকস দেখে নিন। Shaka Packager দিয়ে CMAF আর cbcs এনক্রিপশন সহ একটা static প্যাকেজ এমন দেখতে হয় (key আর key id এখানে বানানো, আসল কী কখনো কোডে বা কমান্ড হিস্ট্রিতে রাখবেন না):

```bash
packager \
  in=v_720p.mp4,stream=video,init_segment=out/v720/init.mp4,segment_template='out/v720/$Number$.m4s' \
  in=v_360p.mp4,stream=video,init_segment=out/v360/init.mp4,segment_template='out/v360/$Number$.m4s' \
  in=v_720p.mp4,stream=audio,language=bn,init_segment=out/a_bn/init.mp4,segment_template='out/a_bn/$Number$.m4s' \
  --segment_duration 4 \
  --protection_scheme cbcs \
  --enable_raw_key_encryption \
  --keys label=:key_id=00112233445566778899aabbccddeeff:key="$CONTENT_KEY_HEX" \
  --mpd_output out/manifest.mpd \
  --hls_master_playlist_output out/master.m3u8
```

## প্রতি রিকোয়েস্টে manifest বদলানো

JIT-এর সবচেয়ে বড় সুবিধা আসলে সেগমেন্টে নয়, manifest-এ। সেগমেন্টগুলো static রেখেও শুধু manifest রিকোয়েস্টের সময় বানানো যায়, আর তখন অনেক কিছু সম্ভব হয়:

- **ডিভাইস বা প্ল্যান অনুযায়ী রেন্ডিশন ফিল্টার।** ফ্রি প্ল্যানে সর্বোচ্চ 720p, পুরনো ফোনে HEVC বাদ।
- **অ্যাড মার্কার বসানো।** server-side ad insertion এখানেই হয় ([প্লেয়ার ট্র্যাকের অ্যাড চ্যাপ্টার](/notes/video-player/09-ads))।
- **সাবটাইটেল বা অডিও ভাষা যোগ করা** নতুন করে সব প্যাকেজ না করেই।
- **টোকেন বসানো** প্রতিটা সেগমেন্ট URL-এ, যাতে signed URL কাজ করে (চ্যাপ্টার ৮)।

রেন্ডিশন ফিল্টারের মূল লজিক এক পাতার Go কোড। HLS master playlist-এ প্রতিটা `#EXT-X-STREAM-INF` লাইনের ঠিক পরের লাইনটা সেই রেন্ডিশনের URI, তাই একটা বাদ দিলে পরেরটাও বাদ দিতে হয়:

```go
package main

import (
	"bufio"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var resRe = regexp.MustCompile(`RESOLUTION=\d+x(\d+)`)

// filterMaster drops every variant taller than maxHeight. Audio, captions and
// header tags pass through untouched.
func filterMaster(master string, maxHeight int) string {
	var out strings.Builder
	sc := bufio.NewScanner(strings.NewReader(master))
	skipNext := false
	for sc.Scan() {
		line := sc.Text()
		if skipNext {
			skipNext = false
			continue
		}
		if strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
			if m := resRe.FindStringSubmatch(line); m != nil {
				if h, _ := strconv.Atoi(m[1]); h > maxHeight {
					skipNext = true // the URI line that follows belongs to this variant
					continue
				}
			}
		}
		out.WriteString(line + "\n")
	}
	return out.String()
}

func main() {
	master := `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/index.m3u8
`
	got := filterMaster(master, 720)
	if strings.Contains(got, "1080p") || !strings.Contains(got, "720p/index.m3u8") {
		panic("filter broken")
	}
	fmt.Print(got)
}
```

```text
$ go run main.go
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
```

<Callout type="danger">

**যে manifest প্রতি ইউজারে আলাদা, সেটা CDN-এ শেয়ার্ড ক্যাশ করা যাবে না।** একজনের টোকেনওয়ালা বা প্রিমিয়াম রেন্ডিশনওয়ালা master playlist ক্যাশ হয়ে গেলে সবাই সেটা পায়, যা [CDN ট্র্যাকের ডায়নামিক কনটেন্ট চ্যাপ্টারের](/notes/cdn/09-dynamic-content) সবচেয়ে ভয়ংকর বাগ। দুইটা পথ: হয় manifest ইউজার-নির্দিষ্ট আর `private`, আর সেগমেন্টগুলো শেয়ার্ড ও ক্যাশেবল; নয়তো ভ্যারিয়েন্ট সীমিত রাখুন (ধরুন শুধু "free" আর "premium") আর সেটা cache key-তে রাখুন।

</Callout>

## JIT আউটপুট CDN-এ ক্যাশ করা

JIT-এর প্রতিটা রিকোয়েস্টে প্যাকেজার কাজ করলে origin-এর CPU আর স্টোরেজ পড়ার খরচ দর্শকের সংখ্যার সাথে বাড়ে। সমাধান হলো JIT-কে **origin-এর পেছনে রাখা আর আউটপুট CDN-এ ক্যাশ করা**। একটা সেগমেন্ট প্রথমবার চাওয়া হলে প্যাকেজার বানায়, তারপর হাজারবার CDN থেকে যায়। ফলে কার্যত এটা hybrid: জনপ্রিয় কনটেন্ট "আগে থেকে কাটা" হয়ে এজে বসে থাকে, অজনপ্রিয় কনটেন্টের জন্য কোনো স্টোরেজ খরচ নেই।

তিনটা জিনিস ঠিক রাখতে হয়:

1. **সেগমেন্টের URL ডিটারমিনিস্টিক।** একই ইনপুট মানে একই URL, যাতে cache key মেলে ([ক্যাশ কী চ্যাপ্টার](/notes/cdn/04-cache-keys))। টোকেন query string-এ থাকলে CDN-কে বলে দিতে হবে cache key থেকে সেটা বাদ দিতে, আর এজে টোকেন যাচাই করতে।
2. **Origin shield।** অনেক PoP একসাথে একই নতুন সেগমেন্ট চাইলে প্যাকেজারের উপর একসাথে অনেক রিকোয়েস্ট পড়ে। shield আর request collapsing সেটা একটায় নামিয়ে আনে ([origin আর্কিটেকচার](/notes/cdn/07-origin-architecture))।
3. **আউটপুট বদলায় না।** JIT সেগমেন্ট একই MP4 থেকে সবসময় একই বাইট দেবে, তাই লম্বা TTL আর `immutable` দেওয়া যায়। MP4 বদলালে নতুন revision মানে নতুন URL।

## ট্রেড-অফ টেবিল

| | Static | JIT | Hybrid (CMAF static + JIT manifest/encryption) |
| --- | --- | --- | --- |
| স্টোরেজ | সবচেয়ে বেশি, গুণফল হারে | সবচেয়ে কম, শুধু MP4 | মাঝারি, এক সেট CMAF |
| রিকোয়েস্টের সময় কম্পিউট | শূন্য | প্রতিটা ক্যাশ মিসে | শুধু manifest আর এনক্রিপশনে |
| প্রথম রিকোয়েস্টের লেটেন্সি | কম | বেশি (বানাতে হয়) | কম থেকে মাঝারি |
| নতুন ফরম্যাট বা DRM যোগ করা | পুরো ক্যাটালগ আবার প্যাকেজ | origin কনফিগ বদল | origin কনফিগ বদল |
| প্রতি ইউজারে manifest | আলাদা সার্ভিস লাগে | সহজ | সহজ |
| origin-এর জটিলতা | শুধু ফাইল সার্ভার | প্যাকেজার চালাতে ও স্কেল করতে হয় | প্যাকেজার, তবে হালকা |
| ভাঙলে কী হয় | ফাইল না থাকলে 404, সহজে বোঝা যায় | প্যাকেজার ডাউন মানে সব ক্যাশ মিস ভাঙে | manifest সার্ভিস ডাউন মানে নতুন প্লে শুরু হয় না |

### কীভাবে বাছবেন

```text
One container format, no DRM, under a few thousand titles?
  -> Static CMAF. Done. Revisit when one of these changes.

Need HLS + DASH with DRM on Apple and non-Apple devices?
  -> Can every target device play cbcs?
       Yes -> Static CMAF + cbcs, one copy.
       No  -> JIT encryption, or accept two static copies and price it in.

Per-user manifests (plans, ads, tokens per segment)?
  -> Static segments + a small manifest service. Hybrid.

Huge long-tail catalog where most titles are rarely watched?
  -> JIT behind a CDN with origin shield.
```

<Callout type="tip">

**সবচেয়ে সাধারণ ভুল হলো প্রথম দিনেই JIT।** একটা প্যাকেজার সার্ভিস চালানো, স্কেল করা আর মনিটর করা static ফাইল রাখার চেয়ে অনেক বেশি কাজ। গুণফল যতক্ষণ ছোট, static CMAF রাখুন। manifest প্রতি ইউজারে বদলানোর দরকার হলে প্রথমে শুধু manifest-টা ডায়নামিক করুন; সেগমেন্ট static-ই থাকুক।

</Callout>

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| সেগমেন্টের দৈর্ঘ্য অসমান, কিছু প্লেয়ার রেন্ডিশন বদলাতে গিয়ে আটকায় | `grep EXTINF index.m3u8` দিয়ে দৈর্ঘ্য দেখুন; `ffprobe -select_streams v -skip_frame nokey -show_entries frame=pts_time -of csv src.mp4` দিয়ে কীফ্রেমের সময় | এনকোডে নির্দিষ্ট কীফ্রেম ইন্টারভাল (`-g`, `-keyint_min`, scene cut বন্ধ); সব রেন্ডিশনে একই |
| HLS চলে, DASH চলে না (বা উল্টো), একই সেগমেন্ট | দুই manifest-এ সেগমেন্ট URL আর init সেগমেন্টের নাম মেলান; `curl -sI` দিয়ে প্রতিটা URL 200 কিনা | CMAF প্যাকেজার থেকে দুটো manifest একসাথে লিখুন, হাতে আলাদা করে নয় |
| Apple ডিভাইসে DRM চলে, কিছু Android/TV-তে চলে না | প্লেয়ারের এরর লগ; কনটেন্ট কোন স্কিমে এনক্রিপ্টেড (`MP4Box -info` বা প্যাকেজারের লগ) | ডিভাইসের স্কিম সাপোর্ট দেখুন; cenc কপি বা JIT এনক্রিপশন |
| একজন ইউজার আরেকজনের প্রিমিয়াম রেন্ডিশন বা টোকেন পাচ্ছে | master playlist-এর রেসপন্সে `Cache-Control` আর CDN-এর `Age` দেখুন | ইউজার-নির্দিষ্ট manifest `private`; বা ভ্যারিয়েন্ট cache key-তে |
| JIT origin-এর CPU নতুন রিলিজের সময় চূড়ায় ওঠে | CDN লগে সেগমেন্টের MISS অনুপাত; origin-এ একই URL-এর একসাথে কত রিকোয়েস্ট | origin shield আর request collapsing; জনপ্রিয় টাইটেল আগে থেকে ওয়ার্ম করুন |
| JIT সেগমেন্ট টোকেন বদলালেই আবার বানানো হয় | CDN-এ cache key-তে query string আছে কিনা | টোকেন cache key থেকে বাদ, এজে যাচাই |
| nginx-vod-module বিল্ড হয় না বা অদ্ভুত সেগমেন্ট দৈর্ঘ্য | nginx ভার্সন আর মডিউলের ইস্যু ট্র্যাকার; `vod_segment_duration` কী সেট আছে | সামঞ্জস্যপূর্ণ nginx ভার্সন; ডিফল্টের উপর ভরসা না করে মান স্পষ্ট লিখুন |
| স্টোরেজ বিল প্রতি মাসে লাফিয়ে বাড়ছে | asset প্রতি কত সেট আছে (`aws s3 ls --recursive --summarize` একটা asset-এ) | গুণফলের কোন গুণক অপ্রয়োজনীয় সেটা বাদ দিন: TS কপি, দ্বিতীয় এনক্রিপশন |

## মূল শিক্ষা

1. **প্যাকেজিং কখন হবে, এটাই প্ল্যাটফর্মের প্রশ্ন:** আগে (static), রিকোয়েস্টে (JIT), নাকি মিশিয়ে (hybrid)।
2. **static-এর খরচ গুণফল:** রেন্ডিশন × কন্টেইনার × এনক্রিপশন। গুণফল ছোট থাকলে static-ই সেরা।
3. **CMAF একটা গুণক মুছে দেয়।** এক সেট fMP4 সেগমেন্ট, HLS আর DASH দুটোর manifest।
4. **এনক্রিপশনই সাধারণত শেষ গুণক।** সব টার্গেট ডিভাইস cbcs বুঝলে এক কপি; না বুঝলে দুই কপি বা JIT।
5. **সেগমেন্টের দৈর্ঘ্য এনকোডারের কীফ্রেম ঠিক করে**, প্যাকেজারের অপশন নয়।
6. **JIT-এর আসল শক্তি manifest-এ:** প্ল্যান অনুযায়ী ফিল্টার, অ্যাড, টোকেন, ভাষা।
7. **প্রতি ইউজারে আলাদা manifest কখনো শেয়ার্ড ক্যাশে নয়।**
8. **JIT সবসময় CDN আর origin shield-এর পেছনে।** তাহলে কার্যত সেটা hybrid, আর প্যাকেজার শুধু ক্যাশ মিসে কাজ করে।
9. **প্রথম দিনেই JIT নয়।** আগে শুধু manifest ডায়নামিক করুন, সেগমেন্ট static রাখুন।
