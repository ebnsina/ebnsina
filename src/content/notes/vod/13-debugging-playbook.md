---
title: 'VOD ডিবাগিং প্লেবুক'
subtitle: 'একটা ভিডিওর পথ ধরে আট লেয়ারের পদ্ধতি: আপলোড থেকে প্লেয়ার পর্যন্ত কোথায় ভাঙল সেটা আন্দাজে নয়, প্রমাণ দিয়ে বের করা। সাথে লক্ষণ থেকে কারণের পূর্ণ ক্যাটালগ আর একটা কপি-পেস্ট চেক স্ক্রিপ্ট।'
chapter: 13
level: 'mastery'
readingTime: '৩২ মিনিট'
topics: ['vod debugging', 'troubleshooting', 'ffprobe', 'hls', 'upload', 'river', 'cors', 'cdn cache', 'playback']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

পুরান ঢাকার শাঁখারী বাজারে একটা পাঁচতলা পুরনো বাড়ি। তিনতলার রান্নাঘরের কল দিয়ে পানি আসছে না, আর দোতলার সিঁড়িঘরের দেয়াল ভিজে কালো হয়ে গেছে। বাড়িওয়ালা রুশদ দুইজন মিস্ত্রি ডাকলেন।

প্রথম মিস্ত্রি এসেই রান্নাঘরের কলটা খুললেন, নতুন একটা কল লাগালেন। পানি আসে না। তারপর কলের নিচের পাইপটা বদলালেন। তাও না। তারপর বললেন দেয়াল ভাঙতে হবে, পুরো লাইন নতুন করে টানতে হবে। দুই দিনে তিনটা জিনিস বদলানো হলো, টাকা গেল, আর কেন পানি আসছিল না সেটা কেউ জানল না।

দ্বিতীয় মিস্ত্রি বিরুনি কিছু খোলার আগে ছাদে উঠলেন। ট্যাংকে পানি আছে কিনা দেখলেন: আছে, অর্ধেক ভরা। ট্যাংকের নিচের মেইন ভাল্ভ খোলা কিনা দেখলেন: খোলা। তারপর পানির পথ ধরে নিচে নামতে লাগলেন, প্রতিটা জয়েন্টে একটা প্রশ্ন: "এখান পর্যন্ত পানি পৌঁছাচ্ছে?" চারতলার জয়েন্টে টোকা দিলেন, পাইপ ভরা, ভারী শব্দ। তিনতলার মিটারের আগের জয়েন্টে টোকা দিলেন, ফাঁপা শব্দ। মানে পানি চারতলা পর্যন্ত আসছে, তিনতলায় আসছে না, আর দোষটা এই দুইয়ের মাঝখানে, ঠিক যেখানে দোতলার দেয়াল ভিজছে। মাঝের পাইপ খুলে দেখা গেল একটা পুরনো জয়েন্ট ফেটে পানি দেয়ালের ভেতরে চলে যাচ্ছে। একটা জয়েন্ট বদলালেন, কাজ শেষ।

বিরুনির আরেকটা অভ্যাস ছিল: কাজ শেষে রান্নাঘরের কল খুলে দেখতেন, তারপর ছাদের ট্যাংকে উঠে আবার দেখতেন যে ট্যাংক থেকে পানি সত্যিই কমছে। কারণ একবার এমন হয়েছিল যে কল দিয়ে পানি এসেছিল ঠিকই, কিন্তু সেটা পাশের বাড়ির লাইন থেকে, আর আসল ফাটল তখনো ছিল।

মিলিয়ে নিই: ছাদের ট্যাংক থেকে রান্নাঘরের কল পর্যন্ত পাইপ হলো একটা ভিডিওর পথ, **আপলোড থেকে প্লেয়ার পর্যন্ত আট লেয়ার**। প্রথম মিস্ত্রির একের পর এক জিনিস বদলানো হলো **আন্দাজে ডিবাগিং**: আবার এনকোড, ক্যাশ পার্জ, প্লেয়ার লাইব্রেরি বদল। বিরুনির ট্যাংক থেকে নামা হলো **উৎস থেকে লেয়ার ধরে ধরে পরীক্ষা**, আর প্রতিটা জয়েন্টে টোকা দেওয়া হলো **প্রতিটা হপে একটা কমান্ড** (`ffprobe`, `curl`, SQL)। ভরা আর ফাঁপা শব্দের মাঝখানে দোষ খোঁজা হলো **যেখানে দুই পাশের উত্তর মেলে না, সমস্যা সেখানে**। আর কাজ শেষে কল আর ট্যাংক দুই জায়গায় দেখা হলো **সমাধানের পর প্লেয়ার আর origin দুই দিক থেকে যাচাই**, কারণ ক্যাশ থেকে আসা সফল রেসপন্স আসল সমস্যা লুকিয়ে রাখতে পারে।

## প্রথম নিয়ম: অ্যাসেট ID দিয়ে শুরু, অনুমান দিয়ে নয়

VOD-এর প্রায় প্রতিটা অভিযোগ একটা নির্দিষ্ট ভিডিও নিয়ে: "এই ভিডিওটা চলছে না।" তাই প্রথম কাজ একটা অ্যাসেট ID হাতে পাওয়া, আর তার সাথে চারটা তথ্য:

1. **কে দেখছে সমস্যা?** সবাই, নাকি শুধু iPhone, শুধু একটা দেশ, শুধু একটা ISP?
2. **ঠিক কী ঘটছে?** একেবারেই শুরু হয় না, শুরু হয়ে থেমে যায়, ছবি আছে শব্দ নেই, ছবি কাত, কোয়ালিটি ঝাপসা?
3. **কখন থেকে?** আপলোডের পর থেকেই, নাকি আগে চলত আর এখন চলে না? মাঝে কী বদলেছে (ডিপ্লয়, CDN কনফিগ, এনকোড সেটিং)?
4. **একটা ভিডিও, নাকি অনেকগুলো?** একটা হলে সমস্যা প্রায় সবসময় সেই ফাইলে বা তার এনকোডে। হঠাৎ অনেকগুলো হলে সমস্যা শেয়ার করা কোনো লেয়ারে: স্টোরেজ, CDN, প্লেয়ার রিলিজ।

চার নম্বর প্রশ্নটাই সবচেয়ে বেশি সময় বাঁচায়। একটা ভিডিওর সমস্যায় CDN কনফিগ ঘাঁটা, বা একশো ভিডিওর সমস্যায় একটা ফাইলের ffprobe পড়া, দুটোই ভুল জায়গায় খোঁড়া।

## আট লেয়ার, পানির পথ ধরে

<Mermaid
title="একটা ভিডিওর পথ: কোথায় পানি আসা বন্ধ হলো"
code={`graph TD
  A["1. Upload<br/>did the source reach storage?"] --> B["2. Ingest and probe<br/>is the source sane?"]
  B --> C["3. Job queue<br/>did a job run, and how did it end?"]
  C --> D["4. Encode<br/>are the renditions correct?"]
  D --> E["5. Package and manifest<br/>do playlists describe them truthfully?"]
  E --> F["6. Storage and permissions<br/>can anyone fetch them?"]
  F --> G["7. CDN and origin<br/>is the edge serving what storage has?"]
  G --> H["8. Player<br/>can this device play it?"]`}
/>

পদ্ধতিটা বিরুনির মতো: প্রতিটা লেয়ারে একটা প্রশ্ন, একটা কমান্ড, আর উত্তর "হ্যাঁ" হলে পরের লেয়ারে নামা। যে লেয়ারে প্রথম "না", সমস্যা সেখানে বা ঠিক তার আগের ধাপে। নিচের কমান্ডগুলো চ্যাপ্টার ১২-এর প্ল্যাটফর্মের নাম ধরে লেখা (`uploads`, `media`, `assets`, `river_job`); নিজের সিস্টেমের নাম বসিয়ে নিন।

### লেয়ার ১: আপলোড

প্রশ্ন: সোর্স ফাইলটা সত্যিই স্টোরেজে পৌঁছেছে, পুরো সাইজে?

```bash
# Any S3 client works against Garage; credentials come from the same env vars the app uses.
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY AWS_DEFAULT_REGION=garage \
  aws s3api head-object --endpoint-url http://localhost:3900 --bucket uploads --key "$ID/source" \
  --query '{size:ContentLength,modified:LastModified}'
```

```text
{
    "size": 4808307,
    "modified": "2026-10-25T05:23:42+00:00"
}
```

সাইজটা ব্যবহারকারীর আসল ফাইলের সাইজের সাথে মেলান (এখানে টেস্ট ফাইলটা ঠিক ৪৮,০৮,৩০৭ বাইট)। ফাইল না থাকলে বা সাইজ ছোট হলে সমস্যা আপলোডে, এনকোডে নয়। এখানে আবার এনকোড করে কোনো লাভ নেই।

### লেয়ার ২: ইনজেস্ট ও প্রোব

প্রশ্ন: সোর্সটা কি আসলে এমন একটা ভিডিও যেটা আমাদের পাইপলাইন বোঝে? এই একটা কমান্ড প্রায় সব প্রশ্নের উত্তর এক লাইনে দেয়:

```bash
ffprobe -v error -show_entries \
  stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,color_transfer,channels:stream_side_data=rotation:format=duration \
  -of compact=p=0 source.mp4
```

```text
index=0|codec_name=h264|profile=High|codec_type=video|width=1280|height=720|pix_fmt=yuv420p|color_transfer=unknown|r_frame_rate=30/1|avg_frame_rate=30/1|side_datum/display_matrix:rotation=90
index=1|codec_name=aac|profile=LC|codec_type=audio|channels=1|r_frame_rate=0/0|avg_frame_rate=0/0
duration=12.000000
```

এটা একটা আসল আউটপুট, এমন একটা টেস্ট ফাইলের যেটাকে ইচ্ছা করে ৯০ ডিগ্রি ঘোরানোর মেটাডেটা দেওয়া হয়েছে। এক লাইনেই দেখা যাচ্ছে: ভিডিও আছে, অডিও মোনো, ৩০ fps স্থির (`r_frame_rate` আর `avg_frame_rate` সমান), SDR (`color_transfer` HDR নয়), আর ঘোরানো (`rotation=90`)। কোন ফিল্ড কী মানে আর ইনজেস্টে কী দেখে কী আটকাতে হয়, সেটা [ইনজেস্ট ও প্রোবিং](/notes/vod/03-ingest-and-probing) চ্যাপ্টারে।

### লেয়ার ৩: জব কিউ

প্রশ্ন: এই অ্যাসেটের জন্য জব তৈরি হয়েছিল? চলেছিল? কীভাবে শেষ হলো?

```sql
select a.status, a.error, j.id as job_id, j.state, j.attempt, j.max_attempts,
       j.attempted_at, left(j.errors[array_length(j.errors, 1)]->>'error', 120) as last_error
from assets a
left join river_job j on j.kind = 'encode' and j.args->>'asset_id' = a.id::text
where a.id = $1
order by j.id desc;
```

উত্তরের অর্থ:

| `state` | মানে | পরের ধাপ |
| --- | --- | --- |
| কোনো সারিই নেই | জবই তৈরি হয়নি | `complete` এন্ডপয়েন্ট ডাকা হয়েছিল কিনা দেখুন; স্ট্যাটাস বদল আর জব ইনসার্ট একই ট্রানজ্যাকশনে কিনা |
| `available` | জব আছে, কেউ নিচ্ছে না | ওয়ার্কার প্রসেস চলছে? কিউর নাম মিলছে? |
| `running` অনেকক্ষণ | ওয়ার্কার কাজ করছে, বা মরে গেছে | ওয়ার্কারের লগ আর মেশিনের মেমরি দেখুন (নিচে OOM) |
| `retryable` | ব্যর্থ হয়েছে, আবার চেষ্টা হবে | `last_error` পড়ুন |
| `discarded` | সব চেষ্টা শেষ | `last_error` পড়ুন; অ্যাসেট `failed` হয়েছে কিনা |
| `cancelled` | ইচ্ছা করে থামানো (স্থায়ী এরর) | `last_error`; সাধারণত সোর্স ফাইলের সমস্যা |
| `completed` | এনকোড শেষ | লেয়ার ৪-এ যান |

### লেয়ার ৪ থেকে ৮: প্লেয়ার যেভাবে দেখে

এনকোড শেষ হলে বাকি সব লেয়ার একটা প্রশ্নে নামে: প্লেয়ার যা যা চাইবে, সেগুলো কি সঠিক অবস্থায়, সঠিক হেডারসহ পাওয়া যাচ্ছে? এর জন্য নিচের স্ক্রিপ্টটা, যেটা প্লেয়ারের মতো করে মাস্টার থেকে প্রতিটা রেন্ডিশনের প্রথম সেগমেন্ট পর্যন্ত হাঁটে।

## কপি-পেস্ট চেক স্ক্রিপ্ট: `vod-check.sh`

শুধু `curl` আর `ffprobe` লাগে। এটা মাস্টার প্লেলিস্ট আনে, প্রতিটা রেন্ডিশনের `BANDWIDTH`, `RESOLUTION`, `CODECS` দেখায় (না থাকলে চিৎকার করে), প্রতিটা মিডিয়া প্লেলিস্ট আনে, init আর প্রথম সেগমেন্ট জোড়া লাগিয়ে probe করে, সেগমেন্ট কীফ্রেম দিয়ে শুরু হয় কিনা দেখে, আর প্রতিটা ধাপে একটা `Origin` হেডার পাঠিয়ে CORS আর ক্যাশ হেডার দেখায়। Byte-range প্লেলিস্ট (`#EXT-X-BYTERANGE`) আর fMP4-এর `#EXT-X-MAP`-ও বোঝে।

```bash
#!/usr/bin/env bash
# Usage: vod-check.sh MASTER_URL [PAGE_ORIGIN]
# Walks an HLS master playlist the way a player does and reports where it breaks.
set -uo pipefail
MASTER=${1:?usage: vod-check.sh MASTER_URL [PAGE_ORIGIN]}
ORIGIN=${2:-https://example.com}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

resolve() { # resolve a playlist URI against the URL it came from
  case "$2" in
    http://*|https://*) echo "$2" ;;
    /*) echo "$(echo "$1" | grep -oE '^https?://[^/]+')$2" ;;
    *) echo "${1%/*}/$2" ;;
  esac
}

byterange() { # "len@off" -> curl range "off-end"; empty input stays empty
  [ -n "$1" ] || return 0
  local len=${1%@*} off=${1#*@}
  [ "$off" = "$1" ] && off=0
  echo "$off-$((off + len - 1))"
}

headers() { # status, type, caching and CORS for one URL, as the browser would ask; $2 = optional byte range
  curl -s -o /dev/null -D - -H "Origin: $ORIGIN" ${2:+-r "$2"} "$1" |
    tr -d '\r' | grep -iE '^(HTTP/[0-9.]+ |(content-type|cache-control|access-control-allow-origin|age):)' |
    sed 's/^/    /'
}

echo "== master: $MASTER"
headers "$MASTER"
curl -sf "$MASTER" -o "$TMP/master.m3u8" || { echo "  FAIL: master playlist not fetchable"; exit 1; }
grep -q '^#EXTM3U' "$TMP/master.m3u8" || { echo "  FAIL: not an HLS playlist"; exit 1; }
grep -q '^#EXT-X-STREAM-INF' "$TMP/master.m3u8" || { echo "  note: this is a media playlist, not a master"; }

grep -A1 '^#EXT-X-STREAM-INF' "$TMP/master.m3u8" | grep -v '^--$' | paste - - | while IFS=$'\t' read -r inf uri; do
  bw=$(echo "$inf" | grep -oE 'BANDWIDTH=[0-9]+' | head -1)
  res=$(echo "$inf" | grep -oE 'RESOLUTION=[0-9x]+')
  codecs=$(echo "$inf" | grep -oE 'CODECS="[^"]+"')
  media=$(resolve "$MASTER" "$uri")
  echo
  echo "== rendition: $uri  ${bw:-NO BANDWIDTH}  ${res:-no resolution}  ${codecs:-MISSING CODECS (Safari/iOS may refuse it)}"
  if ! curl -sf "$media" -o "$TMP/media.m3u8"; then
    echo "  FAIL: media playlist $(curl -s -o /dev/null -w '%{http_code}' "$media")"; continue
  fi
  segs=$(grep -c '^#EXTINF' "$TMP/media.m3u8")
  target=$(grep -oE '^#EXT-X-TARGETDURATION:[0-9]+' "$TMP/media.m3u8" | cut -d: -f2)
  ended=$(grep -q '^#EXT-X-ENDLIST' "$TMP/media.m3u8" && echo yes || echo "NO (a VOD playlist should end with ENDLIST)")
  echo "  segments: $segs   target duration: ${target:-?}s   endlist: $ended"

  n=$(grep -nvE '^(#|$)' "$TMP/media.m3u8" | head -1 | cut -d: -f1)
  first=$(sed -n "${n}p" "$TMP/media.m3u8" | tr -d '\r')
  seg_range=$(byterange "$(sed -n "$((n - 1))p" "$TMP/media.m3u8" | grep -oE '^#EXT-X-BYTERANGE:[0-9@]+' | cut -d: -f2)")
  seg_url=$(resolve "$media" "$first")
  map=$(grep -m1 '^#EXT-X-MAP' "$TMP/media.m3u8")
  : > "$TMP/probe.bin"
  if [ -n "$map" ]; then
    init=$(echo "$map" | sed -E 's/.*URI="([^"]+)".*/\1/')
    init_range=$(byterange "$(echo "$map" | grep -oE 'BYTERANGE="[0-9@]+"' | tr -d '"' | cut -d= -f2)")
    curl -sf ${init_range:+-r "$init_range"} "$(resolve "$media" "$init")" >> "$TMP/probe.bin" ||
      echo "  FAIL: init segment $init"
  fi
  echo "  first segment: $first${seg_range:+ (bytes $seg_range)}"
  headers "$seg_url" "${seg_range:-0-1023}"  # a range, so a huge segment is not downloaded twice
  curl -sf ${seg_range:+-r "$seg_range"} "$seg_url" >> "$TMP/probe.bin" ||
    { echo "  FAIL: first segment not fetchable"; continue; }

  ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate -of compact=p=0:nk=0 \
    "$TMP/probe.bin" | grep -m1 codec_name | sed 's/^/  video: /'
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels \
    -of compact=p=0:nk=0 "$TMP/probe.bin" | grep -m1 codec_name | sed 's/^/  audio: /' ||
    echo "  audio: none muxed in (fine only if the master lists an EXT-X-MEDIA audio group)"
  flags=$(ffprobe -v error -select_streams v:0 -read_intervals '%+#1' \
    -show_entries packet=flags -of csv=p=0 "$TMP/probe.bin" | head -1)
  case "$flags" in
    K*) echo "  starts on a keyframe: yes" ;;
    *) echo "  starts on a keyframe: NO (players cannot start or switch here)" ;;
  esac
done
```

স্ক্রিপ্টটা তিনটা স্ট্রিমে চালিয়ে টেস্ট করা (২০২৬ সালের অক্টোবরে)। চ্যাপ্টার ১২-এর লোকাল প্ল্যাটফর্মে:

```text
$ ./vod-check.sh http://localhost:8081/media/hls/4258cf13-.../master.m3u8 https://baytalhikma.org
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

Mux-এর পাবলিক টেস্ট স্ট্রিম `test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`-এ (MPEG-TS সেগমেন্ট, কয়েকটা লাইন বাদ):

```text
== rendition: url_0/193039199_mp4_h264_aac_hd_7.m3u8  BANDWIDTH=2149280  RESOLUTION=1280x720  CODECS="mp4a.40.2,avc1.64001f"
  segments: 64   target duration: 11s   endlist: yes
  first segment: url_462/193039199_mp4_h264_aac_hd_7.ts
    cache-control: public, max-age=3600
    content-type: application/octet-stream
    age: 563
    access-control-allow-origin: *
  video: codec_name=h264|profile=High|width=1280|height=720|pix_fmt=yuv420p|r_frame_rate=60/1
  audio: codec_name=aac|sample_rate=44100|channels=2
  starts on a keyframe: yes
```

আর Apple-এর পাবলিক fMP4 উদাহরণে (`img_bipbop_adv_example_fmp4`), যেখানে প্রতিটা রেন্ডিশন একটাই বড় `main.mp4` ফাইল আর সেগমেন্টগুলো তার byte-range:

```text
== rendition: v5/prog_index.m3u8  BANDWIDTH=2168183  RESOLUTION=960x540  CODECS="avc1.640020,mp4a.40.2"
  segments: 100   target duration: 6s   endlist: yes
  first segment: main.mp4 (bytes 719-1508718)
    Access-Control-Allow-Origin: *
    Content-Type: video/mp4
    Cache-Control: max-age=600, public
  video: codec_name=h264|profile=High|width=960|height=540|pix_fmt=yuv420p|r_frame_rate=60/1
  audio: none muxed in (fine only if the master lists an EXT-X-MEDIA audio group)
  starts on a keyframe: yes
```

শেষেরটায় "audio: none muxed in" কোনো ভুল নয়: ওই স্ট্রিমে অডিও আলাদা `EXT-X-MEDIA` গ্রুপে থাকে, ভিডিওর সাথে মিশিয়ে নয়। স্ক্রিপ্ট আলাদা অডিও গ্রুপ, সাবটাইটেল আর DASH হাঁটে না; সেগুলোর জন্য প্লেলিস্ট হাতে খুলে পড়তে হবে। আর স্ক্রিপ্টের প্রথম সংস্করণে দুইটা বাগ ছিল যেগুলো আসল স্ট্রিমে চালিয়েই ধরা পড়েছে: byte-range না বোঝায় Apple-এর পুরো `main.mp4` নামাতে যাচ্ছিল, আর হেডার দেখার জন্য পুরো সেগমেন্ট আরেকবার নামাচ্ছিল। এখন দুটোই রেঞ্জ দিয়ে চায়।

<Callout type="tip">

স্ক্রিপ্টটা দুইবার চালান: একবার CDN-এর URL দিয়ে, একবার origin-এর URL দিয়ে (বা `curl --connect-to` দিয়ে CDN এড়িয়ে)। দুটোর ফল মিললে সমস্যা প্লেয়ারে; না মিললে সমস্যা CDN-এ। এটাই বিরুনির "কল আর ট্যাংক দুই জায়গায় দেখা"। CDN এড়িয়ে origin-এ যাওয়ার কৌশল **CDN** ট্র্যাকের [CDN রেসপন্স পড়া](/notes/cdn/05-reading-cdn-responses) চ্যাপ্টারে।

</Callout>

## লক্ষণ থেকে সমাধান: পূর্ণ ক্যাটালগ

প্রতিটা এন্ট্রি একই ছাঁচে: লক্ষণ, সম্ভাব্য কারণ, কীভাবে নিশ্চিত হবেন, সমাধান। লেয়ারের ক্রমে সাজানো।

### আপলোড ৯৯%-এ গিয়ে আটকে যায়

**সম্ভাব্য কারণ:** প্রোগ্রেস বার দেখায় ব্রাউজার কত বাইট পাঠিয়েছে, কিন্তু শেষ বাইটের পর সার্ভারের উত্তর আসতে হবে। মাঝের প্রক্সি যদি পুরো বডি নিজের ডিস্কে জমা করে তারপর স্টোরেজে পাঠায় (nginx-এর ডিফল্ট `proxy_request_buffering on`), তাহলে ৯৯%-এর পর সেই পুরো ফাইল আরেকবার কপি হয়, আর এই সময়ে প্রক্সির `proxy_read_timeout` বা ক্লায়েন্টের টাইমআউট পার হয়ে যায়। প্রক্সির temp ডিস্ক ভরা থাকলে কপিটা মাঝপথে ফেল করে। মোবাইলে ব্রাউজার ব্যাকগ্রাউন্ডে গেলেও আপলোড থেমে যায়।

**নিশ্চিত হবেন:** nginx-এর এরর লগে `a client request body is buffered to a temporary file` বা `upstream timed out` খুঁজুন, আর প্রক্সি মেশিনে `df -h` দেখুন। ব্রাউজারের নেটওয়ার্ক ট্যাবে PUT রিকোয়েস্টটা শেষ পর্যন্ত কী স্ট্যাটাস পেল (বা পায়ইনি)।

**সমাধান:** আপলোড লোকেশনে `proxy_request_buffering off` আর `client_max_body_size 0` (চ্যাপ্টার ১২-এর nginx)। বড় ফাইলের জন্য একটা PUT নয়, মাল্টিপার্ট বা tus, যাতে একটা অংশ ব্যর্থ হলে শুধু সেটাই আবার যায়: [আপলোড](/notes/vod/02-upload)।

### মাল্টিপার্ট আপলোডের শেষ ধাপ (`CompleteMultipartUpload`) ফেল করে

**সম্ভাব্য কারণ:** তিনটা সাধারণ কারণ। এক, ব্রাউজার প্রতিটা পার্টের রেসপন্স থেকে `ETag` হেডার পড়তে পারেনি, কারণ `ETag` CORS-এর "safelisted" হেডার নয়; স্টোরেজের CORS কনফিগে `ETag` expose না করলে JavaScript সেটা দেখতেই পায় না, আর complete রিকোয়েস্টে খালি বা ভুল ETag যায় (`InvalidPart`)। দুই, শেষটা ছাড়া কোনো পার্ট নিয়মের চেয়ে ছোট (AWS S3-এ সর্বনিম্ন ৫ MiB; অন্য স্টোরেজে আলাদা হতে পারে, নিজেরটার ডকস দেখুন)। তিন, পার্টের নম্বর ক্রমে নেই বা কোনোটা বাদ পড়েছে।

**নিশ্চিত হবেন:** ব্রাউজারের কনসোলে পার্ট আপলোডের রেসপন্সে `ETag` আছে কিনা দেখুন; নেটওয়ার্ক ট্যাবে থাকলেও JavaScript-এ `null` এলে সেটা CORS। স্টোরেজের এরর বডিতে কোড (`InvalidPart`, `EntityTooSmall`, `InvalidPartOrder`) পড়ুন।

**সমাধান:** CORS-এ `Access-Control-Expose-Headers: ETag`। পার্ট সাইজ স্থির রাখুন (যেমন ৮ বা ১৬ MiB)। আর অসমাপ্ত মাল্টিপার্ট আপলোড স্টোরেজে জায়গা খায়, তাই সেগুলো নির্দিষ্ট সময় পরে বাতিল করার লাইফসাইকেল নিয়ম রাখুন (নিচে "স্টোরেজের বিল হঠাৎ বেড়ে গেছে")।

### ব্রাউজারের আপলোডে 403 `Invalid signature` বা `SignatureDoesNotMatch`

**সম্ভাব্য কারণ:** Presigned URL যে হোস্টের জন্য সই করা, রিকোয়েস্ট সেই হোস্ট দিয়ে পৌঁছায়নি (মাঝের প্রক্সি `Host` বদলেছে), অথবা ব্রাউজার এমন একটা হেডার পাঠিয়েছে যেটা সই করার সময় ধরা হয়েছিল কিন্তু মান আলাদা (যেমন `Content-Type`)। চ্যাপ্টার ১২-এ `localhost:8081`-এর জন্য সই করা URL সরাসরি `localhost:3900`-এ পাঠালে Garage ঠিক এটাই বলেছিল: `Forbidden: Invalid signature`।

**নিশ্চিত হবেন:** URL-এর `X-Amz-SignedHeaders` প্যারামিটার পড়ুন; কোন কোন হেডার সই করা। তারপর ব্রাউজার আসলে কোন হোস্ট আর হেডার পাঠাল, নেটওয়ার্ক ট্যাবে মিলিয়ে দেখুন।

**সমাধান:** সই করার এন্ডপয়েন্ট হুবহু ব্রাউজারের দেখা হোস্ট-পোর্ট হবে; প্রক্সি `Host` অক্ষত পাঠাবে। `Content-Type` সই করলে ক্লায়েন্টকে ঠিক সেটাই পাঠাতে হবে।

### সার্ভারের ঘড়ি ভুল: 403 `RequestTimeTooSkewed` বা সদ্য বানানো লিংকও "মেয়াদ শেষ"

**সম্ভাব্য কারণ:** Signed URL আর টোকেনে সময় থাকে। যে সার্ভার সই করে তার ঘড়ি কয়েক মিনিট পিছিয়ে বা এগিয়ে থাকলে স্টোরেজ বা CDN সেটাকে মেয়াদোত্তীর্ণ বা ভবিষ্যতের মনে করে। VPS-এ NTP বন্ধ থাকলে ঘড়ি ধীরে ধীরে সরে যায়।

**নিশ্চিত হবেন:**

```bash
date -u                                                   # this server
curl -sI https://example.com | grep -i '^date:'           # a server you trust
timedatectl status | grep -iE 'synchronized|ntp'          # systemd machines
```

**সমাধান:** প্রতিটা সার্ভারে `chrony` বা `systemd-timesyncd` চালু রাখুন, আর টোকেনের মেয়াদে কয়েক মিনিটের সহনশীলতা রাখুন।

### অ্যাসেট চিরকাল "processing"

**সম্ভাব্য কারণ:** লেয়ার ৩-এর টেবিলের যেকোনো একটা। সবচেয়ে সাধারণ চারটা: ওয়ার্কার প্রসেস চলছেই না; জব অন্য নামের কিউতে গেছে যেটা কেউ শোনে না; ওয়ার্কার কাজের মাঝখানে মরে গেছে আর জব `running` অবস্থায় পড়ে আছে; আর জব কখনো তৈরিই হয়নি, কারণ স্ট্যাটাস বদল আর জব ইনসার্ট আলাদা ট্রানজ্যাকশনে ছিল আর মাঝখানে কিছু ব্যর্থ হয়েছিল।

**নিশ্চিত হবেন:** লেয়ার ৩-এর SQL। তারপর সব আটকে থাকা অ্যাসেট একসাথে:

```sql
select a.id, a.updated_at, j.state, j.queue
from assets a
left join river_job j on j.kind = 'encode' and j.args->>'asset_id' = a.id::text
where a.status = 'processing' and a.updated_at < now() - interval '1 hour';
```

`j.state` খালি (কোনো জব নেই) এমন সারি থাকলে বাগটা কোডে, এনকিউয়ের জায়গায়।

**সমাধান:** কিউ ডেটাবেসের ভেতরে থাকলে স্ট্যাটাস আর জব একই ট্রানজ্যাকশনে লিখুন (চ্যাপ্টার ১২-এর `InsertTx`)। River মরে যাওয়া ওয়ার্কারের `running` জব `RescueStuckJobsAfter` সময় পরে নিজেই উদ্ধার করে আবার চালায়; সেটা এনকোডের সর্বোচ্চ সময়ের চেয়ে বড় রাখুন, নইলে চলমান এনকোডও দ্বিতীয়বার শুরু হয়।

### লম্বা ভিডিও প্রতিবার একই সময়ে ফেল করে, এরর `context canceled` বা `signal: killed`

**সম্ভাব্য কারণ:** দুইটা আলাদা জিনিস একই রকম দেখায়। **টাইমআউট:** জব লাইব্রেরির ডিফল্ট টাইমআউট (River-এ এক মিনিট, ২০২৬ সালের অক্টোবরে v0.49 অনুযায়ী) পার হলে `context` বাতিল হয় আর `exec.CommandContext` ffmpeg-কে মেরে ফেলে; ফেল হয় প্রায় হুবহু একই সময়ে। **মেমরি ফুরানো (OOM):** 4K সোর্স, এক প্রসেসে অনেক রেন্ডিশন, আর একই মেশিনে একসাথে কয়েকটা এনকোড; কার্নেল সবচেয়ে বড় প্রসেস, মানে ffmpeg, মেরে দেয়। এটা সাধারণত বড় ফাইলেই হয়, আর সময় নির্দিষ্ট নয়।

**নিশ্চিত হবেন:**

```bash
# OOM leaves a trace in the kernel log
journalctl -k --since "1 hour ago" | grep -iE 'out of memory|oom-kill|killed process'
```

জবের এরর `context deadline exceeded` বা `context canceled` হলে টাইমআউট; কার্নেল লগে `Killed process ... (ffmpeg)` থাকলে OOM।

**সমাধান:** টাইমআউটের জন্য ওয়ার্কারের নিজস্ব `Timeout` (চ্যাপ্টার ১২)। OOM-এর জন্য মেশিনের RAM অনুযায়ী একসাথে কয়টা এনকোড চলবে সেটা কমান (`MaxWorkers`), বড় সোর্সের জন্য আলাদা কিউ আর বড় মেশিন, বা রেন্ডিশনগুলো আলাদা প্রসেসে ভাগ করুন: [এনকোডিং জব অর্কেস্ট্রেশন](/notes/vod/04-encoding-jobs)।

### একই ফাইল বারবার ফেল করে, প্রতিবার একই এরর (poison file)

**সম্ভাব্য কারণ:** ফাইলটাই ভাঙা বা অদ্ভুত, আর পাইপলাইন সেটাকে ক্ষণস্থায়ী এরর ভেবে রিট্রাই করছে। প্রতিটা চেষ্টায় পুরো সোর্স নামানো আর প্রসেস করা হয়, ক্যাপাসিটি নষ্ট হয়।

**নিশ্চিত হবেন:** `river_job`-এর `errors` অ্যারেতে সব চেষ্টার এরর একই কিনা।

**সমাধান:** স্থায়ী এরর আলাদা করে চিনে প্রথমবারেই থামান (`river.JobCancel`), আর অ্যাসেটে ব্যবহারকারী বোঝে এমন কারণ লিখুন। কোন এরর স্থায়ী, তার তালিকা বানাতে বানাতেই পাইপলাইন পরিপক্ব হয়।

### এনকোড সফল, কিন্তু ভিডিওতে শব্দ নেই

**সম্ভাব্য কারণ:** সোর্সে একাধিক অডিও ট্র্যাক আছে আর প্রথমটা নীরব (ক্যামেরার দ্বিতীয় মাইক, বা ভিডিও এডিটরের খালি ট্র্যাক), অথচ পাইপলাইন সবসময় প্রথম অডিও (`0:a:0`) নেয়। অথবা সোর্সে অডিও নেই বলে probe ভুল করে ধরেছে আর অডিও ম্যাপই হয়নি। অথবা অডিও আছে কিন্তু প্লেলিস্ট আলাদা অডিও গ্রুপ দেখায় আর প্লেয়ার সেটা বাছেনি।

**নিশ্চিত হবেন:**

```bash
ffprobe -v error -select_streams a -show_entries stream=index,codec_name,channels:stream_tags=language,title -of compact=p=0 source.mp4
# How loud is each audio track? A silent track shows max_volume near -91 dB.
ffmpeg -hide_banner -i source.mp4 -map 0:a:0 -af volumedetect -f null - 2>&1 | grep -E 'mean_volume|max_volume'
```

আউটপুটে রেন্ডিশনে অডিও আছে কিনা `vod-check.sh`-এর `audio:` লাইন দেখায়।

**সমাধান:** একাধিক অডিও ট্র্যাকে সবচেয়ে জোরালো বা নির্দিষ্ট ভাষার ট্র্যাক বাছার নিয়ম রাখুন, আর সত্যিই অডিও নেই এমন ভিডিওতে প্লেলিস্টে অডিও দাবি করবেন না।

### ভিডিও কাত হয়ে আছে (৯০ ডিগ্রি ঘোরানো)

**সম্ভাব্য কারণ:** ফোন ভিডিওর পিক্সেল সবসময় একভাবে রাখে, আর খাড়া ধরলে শুধু একটা "display matrix" মেটাডেটা লিখে দেয়: "দেখানোর সময় ৯০ ডিগ্রি ঘোরাও"। ffmpeg রি-এনকোড করার সময় ডিফল্টভাবে নিজেই ঘুরিয়ে দেয় (autorotate)। সমস্যা হয় যখন কোথাও `-noautorotate` থাকে, বা স্ট্রিম রি-এনকোড না করে কপি (`-c copy`) করা হয় আর মেটাডেটা হারিয়ে যায়, বা থাম্বনেইল বানানোর টুল আলাদাভাবে চলে আর ঘোরায় না।

**নিশ্চিত হবেন:** উপরের লেয়ার ২-এর কমান্ডে `rotation=90` দেখুন, তারপর আউটপুটে:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation -of compact=p=0 rendition.mp4
```

টেস্টে `rotation=90` সহ একটা `1280x720` সোর্স ffmpeg দিয়ে রি-এনকোড করলে আউটপুট এসেছে `width=270|height=480`, কোনো রোটেশন মেটাডেটা ছাড়া: মানে ffmpeg সত্যিই পিক্সেল ঘুরিয়ে খাড়া ভিডিও বানিয়েছে। আউটপুট যদি এখনো আড়াআড়ি হয়, ঘোরানোটা কোথাও বন্ধ।

**সমাধান:** রি-এনকোডে autorotate চালু রাখুন (ডিফল্ট)। একটা জিনিস মনে রাখবেন: খাড়া ভিডিওতে "উচ্চতা" আর "প্রস্থ" অদলবদল হয়, তাই ল্যাডারের "1080p" খাড়া ভিডিওতে আসলে ১০৮০ প্রস্থ বা উচ্চতা, কোনটা, সেটা নিয়ম করে ঠিক করুন।

### সবুজ বা ভাঙা ফ্রেম, বা কিছু ডিভাইসে একেবারেই চলে না

**সম্ভাব্য কারণ:** সোর্স 10-বিট (`yuv420p10le`) বা 4:2:2 (`yuv422p`), আর এনকোড সেই পিক্সেল ফরম্যাট রেখে দিয়েছে। H.264 তখন High 10 বা High 4:2:2 প্রোফাইলে যায়, যেটা অনেক ফোন, TV আর ব্রাউজারের হার্ডওয়্যার ডিকোডার চালাতে পারে না। ফল কোথাও কালো স্ক্রিন, কোথাও সবুজ ফ্রেম, কোথাও শুধু শব্দ।

**নিশ্চিত হবেন:** `vod-check.sh`-এর `video:` লাইনে `pix_fmt` আর `profile` দেখুন। টেস্টে একটা 10-বিট ফাইল এভাবে দেখায়:

```text
profile=High 10|pix_fmt=yuv420p10le
```

**সমাধান:** H.264 আউটপুটে সবসময় `-pix_fmt yuv420p` (চ্যাপ্টার ১২-এ আছে)। 10-বিট বা HDR রাখতে চাইলে সেটা আলাদা রেন্ডিশন হিসেবে HEVC বা AV1-এ, সঠিক `CODECS` দিয়ে, যাতে না পারা ডিভাইস সেটা বাদ দেয়।

### অডিও আর ভিডিও ধীরে ধীরে সরে যায় (lip sync)

**সম্ভাব্য কারণ:** ফোনের ভিডিও প্রায়ই variable frame rate (VFR): আলো কম হলে ক্যামেরা ফ্রেম কমায়। সোর্স ঠিকই চলে, কারণ প্রতিটা ফ্রেমের নিজের টাইমস্ট্যাম্প আছে। কিন্তু কোনো ধাপ যদি ধরে নেয় ফ্রেম রেট স্থির, ভিডিও আর অডিওর সময় ধীরে ধীরে আলাদা হয়, আর এক ঘণ্টার ভিডিওর শেষে ঠোঁট আর শব্দ কয়েক সেকেন্ড সরে যায়।

**নিশ্চিত হবেন:** লেয়ার ২-এর কমান্ডে `r_frame_rate` আর `avg_frame_rate` আলাদা কিনা। উদাহরণ (আনুমানিক):

```text
r_frame_rate=60/1|avg_frame_rate=2997/100
```

সর্বোচ্চ ৬০, গড় প্রায় ৩০: VFR-এর স্পষ্ট লক্ষণ।

**সমাধান:** এনকোডে একটা স্থির ফ্রেম রেট বাধ্য করুন (ffmpeg-এ `-fps_mode cfr` সহ `-r 30`, বা `fps` ফিল্টার; ffmpeg 9.0-এ `-fps_mode` আছে, পুরনো ভার্সনে এর নাম ছিল `-vsync`), আর অডিওতে `aresample=async=1` দিয়ে টাইমস্ট্যাম্পের ফাঁক পূরণ করুন। ঠিক ফ্ল্যাগ আপনার ffmpeg ভার্সনে `ffmpeg -h full` দিয়ে দেখে নিন।

### ভিডিওর সময়কাল ভুল দেখায়

**সম্ভাব্য কারণ:** কন্টেইনারের সময়কাল (`format=duration`) আর স্ট্রিমের সময়কাল আলাদা হতে পারে: এডিট লিস্ট, শুরুতে নেগেটিভ টাইমস্ট্যাম্প, বা ভিডিওর চেয়ে লম্বা অডিও। ক্যাটালগে একটা নম্বর, প্লেয়ারে আরেকটা।

**নিশ্চিত হবেন:** সোর্সে `format=duration` আর প্রতিটা `stream=duration` তুলনা করুন; আউটপুটে প্লেলিস্টের সব `#EXTINF` যোগ করুন:

```bash
grep -oE '^#EXTINF:[0-9.]+' 720p/index.m3u8 | cut -d: -f2 | paste -sd+ - | bc
```

**সমাধান:** ক্যাটালগে সময়কাল সোর্সের ঘোষণা থেকে নয়, আউটপুট প্লেলিস্টের যোগফল থেকে নিন; ওটাই প্লেয়ার দেখবে।

### HDR ভিডিও ফ্যাকাশে, ধূসর দেখায়

**সম্ভাব্য কারণ:** সোর্স HDR (BT.2020 রং, PQ বা HLG ট্রান্সফার), আর এনকোড সেটাকে কোনো রূপান্তর ছাড়াই সাধারণ SDR H.264 হিসেবে লিখেছে। পিক্সেলের মান একই, কিন্তু সেগুলোর অর্থ এখন ভুল, তাই সব ধূসর আর ফ্যাকাশে।

**নিশ্চিত হবেন:** লেয়ার ২-এর কমান্ডে `color_transfer=smpte2084` (PQ) বা `arib-std-b67` (HLG)।

**সমাধান:** দুইটা পথ: SDR রেন্ডিশনের জন্য টোন-ম্যাপিং (ffmpeg-এ `zscale` আর `tonemap` ফিল্টার দিয়ে), বা HDR রেখে সঠিক কোডেক ও মেটাডেটাসহ আলাদা রেন্ডিশন। খেয়াল করুন, `zscale` ফিল্টার শুধু `libzimg` সহ বানানো ffmpeg-এ থাকে; এই চ্যাপ্টার লেখার সময় যে ffmpeg 9.0.2 বিল্ডে টেস্ট করা হয়েছে, তাতে `tonemap` ছিল কিন্তু `zscale` ছিল না। নিজের বিল্ডে `ffmpeg -filters | grep -E 'zscale|tonemap'` দিয়ে দেখে নিন।

### Chrome-এ চলে, iPhone বা Safari-তে চলে না

**সম্ভাব্য কারণ:** Safari আর iOS-এর নেটিভ HLS প্লেয়ার অনেক বেশি কড়া। সাধারণ কারণগুলো: মাস্টার প্লেলিস্টে `CODECS` নেই; প্লেলিস্টের `Content-Type` ভুল (যেমন `text/plain` বা `application/octet-stream`); H.264-এর লেভেল ডিভাইসের সীমার বেশি; HEVC-তে `hev1` ট্যাগ, যেখানে Apple-এর প্লেয়ার `hvc1` চায়; বা fMP4 সেগমেন্টের জন্য প্লেলিস্টের `#EXT-X-VERSION` খুব পুরনো।

**নিশ্চিত হবেন:** `vod-check.sh`-এর রেন্ডিশন লাইনে `CODECS` আর মাস্টারের `Content-Type`। HEVC হলে:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_tag_string,profile,level -of compact=p=0 seg.mp4
```

**সমাধান:** প্লেলিস্টে `application/vnd.apple.mpegurl` আর প্রতিটা `STREAM-INF`-এ `CODECS`; HEVC এনকোডে `-tag:v hvc1`। Apple-এর HLS authoring নির্দেশিকা নিয়মিত হালনাগাদ হয়, তাই কোন ডিভাইস কোন প্রোফাইল ও লেভেল চালায়, সেটা সেখানে দেখে নিন। প্লেয়ারের দিকের কারণ **ভিডিও প্লেয়ার** ট্র্যাকের ডিবাগিং প্লেবুকে।

### প্লে চাপার পর শুরু হতে অনেক দেরি

**সম্ভাব্য কারণ:** প্রথম সেগমেন্ট কীফ্রেম দিয়ে শুরু হয় না, তাই প্লেয়ার পরের কীফ্রেম পর্যন্ত ডিকোড করতে পারে না। অথবা কীফ্রেম অনেক দূরে দূরে (যেমন প্রতি ১০ সেকেন্ডে), আর সেগমেন্ট শুধু কীফ্রেমেই কাটা যায় বলে `hls_time 4` দিলেও সেগমেন্ট ১০ সেকেন্ডের; প্রথম সেগমেন্ট বড়, নামাতে সময় বেশি। অথবা প্লেয়ার শুরু করছে সবচেয়ে উঁচু রেন্ডিশন দিয়ে।

**নিশ্চিত হবেন:** `vod-check.sh`-এর "starts on a keyframe" লাইন আর `target duration`। সেগমেন্টের আসল দৈর্ঘ্য:

```bash
grep -oE '^#EXTINF:[0-9.]+' 720p/index.m3u8 | head -5
```

**সমাধান:** নির্দিষ্ট ব্যবধানে কীফ্রেম বাধ্য করুন (`-force_key_frames "expr:gte(t,n_forced*4)"` আর `-sc_threshold 0`, চ্যাপ্টার ১২)। প্রথম রেন্ডিশন বাছাই আর স্টার্টআপ টিউনিং **ভিডিও প্লেয়ার** ট্র্যাকে।

### প্লেলিস্ট বা সেগমেন্টে 404

**সম্ভাব্য কারণ:** পাথ মেলেনি (বড়-ছোট হাতের অক্ষর, মাস্টার যে ফোল্ডারের নাম লেখে আর আপলোডের ফোল্ডারের নাম আলাদা); অ্যাসেট `ready` হওয়ার আগেই URL দেওয়া হয়েছে আর সেগমেন্ট তখনো আপলোড হয়নি; রেপ্লিকেশন শেষ হওয়ার আগে অন্য রিজিয়নের origin-এ রিকোয়েস্ট গেছে ([স্কেল ও মাল্টি-রিজিয়ন](/notes/vod/11-scale-multi-region)); বা ফাইল মুছে ফেলা হয়েছে।

**নিশ্চিত হবেন:** একই পাথ সরাসরি স্টোরেজে আর CDN দিয়ে `curl -sI` করুন। স্টোরেজে আছে কিন্তু CDN-এ 404 মানে 404-টা ক্যাশ হয়ে আছে।

**সমাধান:** সব ফাইল আপলোডের পরেই `ready`। আর এরর রেসপন্সে লম্বা ক্যাশ হেডার কখনো নয়: চ্যাপ্টার ১২-এ nginx-এ `always` দিয়ে `Cache-Control` বসানোয় একটা 404-এ `immutable, max-age=31536000` বসছিল, সামনে CDN থাকলে যেটা এক বছর ক্যাশ হতো। ক্যাশ হওয়া 404 থাকলে সেই পাথ পার্জ করুন।

### প্লেলিস্ট বা সেগমেন্টে 403

**সম্ভাব্য কারণ:** বাকেট পাবলিক নয় বা ওয়েব অ্যাক্সেস চালু হয়নি; signed URL বা টোকেনের মেয়াদ শেষ (এক ঘণ্টার লেকচার দেখতে দেখতে মাঝপথে মেয়াদ শেষ হওয়া একটা ক্লাসিক); উপরের ঘড়ির সমস্যা; বা WAF বা জিও-ব্লক।

**নিশ্চিত হবেন:** এরর বডি পড়ুন (`curl -s URL`), শুধু স্ট্যাটাস নয়; স্টোরেজ, CDN আর WAF প্রত্যেকে আলাদা বার্তা দেয়। টোকেনের মেয়াদ URL-এর প্যারামিটারে দেখুন।

**সমাধান:** টোকেনের মেয়াদ ভিডিওর দৈর্ঘ্যের চেয়ে বেশি, বা প্লেয়ার মাঝপথে নতুন টোকেন নেবে এমন ব্যবস্থা: [সিকিউরিটি](/notes/vod/08-security)।

### প্লেয়ারে CORS এরর, যদিও `curl` দিয়ে সব ঠিক

**সম্ভাব্য কারণ:** `curl` CORS মানে না, ব্রাউজার মানে। সাধারণ কারণ: `Access-Control-Allow-Origin` নেই; **দুইটা** আছে (স্টোরেজ একটা পাঠায়, প্রক্সি আরেকটা যোগ করে), যেটা ব্রাউজার পুরোপুরি বাতিল করে; শুধু সফল রেসপন্সে আছে, এররে নেই, ফলে আসল 404 বা 403 একটা ধোঁয়াশা CORS এরর হয়ে দেখা দেয়; বা Origin প্রতিফলিত করা হয় কিন্তু `Vary: Origin` নেই, ফলে CDN এক সাইটের উত্তর আরেক সাইটকে দেয়।

**নিশ্চিত হবেন:** ব্রাউজারের মতো করে `Origin` পাঠিয়ে হেডার গুনুন:

```bash
curl -s -o /dev/null -D - -H 'Origin: https://baytalhikma.org' "$URL" | grep -ci '^access-control-allow-origin'
```

উত্তর ঠিক `1` হতে হবে। চ্যাপ্টার ১২-এ Garage-এর এরর রেসপন্সে নিজের একটা CORS হেডার ছিল আর nginx আরেকটা যোগ করছিল; `proxy_hide_header` দিয়ে একটা বাদ দিতে হয়েছিল।

**সমাধান:** CORS হেডার এক জায়গাতেই বসান (এজে), এরর রেসপন্সেও; উপরের সব লেয়ারের হেডার লুকান। CORS আর ক্যাশের সম্পর্ক **CDN** ট্র্যাকের [এজে সিকিউরিটি](/notes/cdn/12-edge-security) চ্যাপ্টারে।

### স্টোরেজের বিল হঠাৎ বেড়ে গেছে

**সম্ভাব্য কারণ:** কেউ দেখে না এমন ফাইল জমছে। চারটা সাধারণ উৎস: শুরু হয়ে আর শেষ না হওয়া আপলোড (`waiting_upload` অ্যাসেট); এনকোডের পরেও রেখে দেওয়া সোর্স ফাইল, যদিও নীতি ছিল মুছে ফেলা; অসমাপ্ত মাল্টিপার্ট আপলোডের পার্ট, যেগুলো সাধারণ অবজেক্ট লিস্টে দেখাই যায় না; আর রি-এনকোডের পর পুরনো রেন্ডিশন।

**নিশ্চিত হবেন:**

```sql
-- Uploads that never completed
select count(*), min(created_at) from assets
where status = 'waiting_upload' and created_at < now() - interval '1 day';

-- Assets that failed but still own storage
select count(*) from assets where status = 'failed';
```

স্টোরেজের দিকে বাকেটভিত্তিক মোট সাইজ (`garage bucket info uploads`), আর অসমাপ্ত মাল্টিপার্ট আপলোডের তালিকা, যেগুলো সাধারণ লিস্টে আসে না:

```bash
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY AWS_DEFAULT_REGION=garage \
  aws s3api list-multipart-uploads --endpoint-url http://localhost:3900 --bucket uploads
```

**সমাধান:** একটা নিয়মিত পরিষ্কারের জব (এক দিনের বেশি পুরনো `waiting_upload` আর `failed` অ্যাসেটের ফাইল মুছে দেয়), আর স্টোরেজে অসমাপ্ত মাল্টিপার্ট আপলোড বাতিলের লাইফসাইকেল নিয়ম। Garage-এর লগে লাইফসাইকেল ওয়ার্কার অসমাপ্ত মাল্টিপার্ট বাতিল করার কথা লেখে; কোন নিয়ম সাপোর্ট করে তা Garage-এর ডকসে দেখে নিন। খরচের পুরো মডেল [অ্যানালিটিক্স ও খরচ](/notes/vod/10-analytics-and-cost) চ্যাপ্টারে।

### "Ready" ওয়েবহুক দুইবার যায়, বা একবারও যায় না

**সম্ভাব্য কারণ:** **দুইবার:** ওয়েবহুক এনকোড জবের ভেতর থেকে পাঠানো হয়েছে, তারপর ডেটাবেস কমিট ফেল করেছে, জব রিট্রাই হয়েছে, আর রিট্রাইতে আবার পাঠানো হয়েছে। অথবা গ্রাহকের সার্ভার উত্তর দিতে দেরি করেছে, আমরা টাইমআউট ধরে আবার পাঠিয়েছি, অথচ প্রথমটা ঠিকই পৌঁছেছিল। **একবারও না:** ওয়েবহুক কমিটের আগে পাঠানোর চেষ্টা হয়েছে আর ট্রানজ্যাকশন রোলব্যাক হয়েছে; অথবা একবার চেষ্টা করে ফেল হলে আর রিট্রাই নেই।

**নিশ্চিত হবেন:** ওয়েবহুক পাঠানোর লগে একই অ্যাসেট ও ইভেন্টের কয়টা চেষ্টা, আর প্রতিটার স্ট্যাটাস। ওয়েবহুক যদি নিজের জব হয়, `river_job`-এ সেটার অবস্থা।

**সমাধান:** ওয়েবহুককে আলাদা জব বানান, আর সেটা ইনসার্ট করুন সেই একই ট্রানজ্যাকশনে যেখানে স্ট্যাটাস `ready` হয়। তাহলে `ready` কমিট হলে ওয়েবহুক নিশ্চিত, না হলে নিশ্চিতভাবে নেই। ডেলিভারি "অন্তত একবার" ধরে নিয়ে প্রতিটা ইভেন্টে একটা স্থির ইভেন্ট ID দিন, যাতে গ্রাহক নকল চিনে ফেলে দিতে পারে। বিস্তারিত **Webhooks** ট্র্যাকে।

### মুছে ফেলা ভিডিও এখনো চলে

**সম্ভাব্য কারণ:** স্টোরেজ থেকে মুছলেই সব জায়গা থেকে মোছে না। এজের ক্যাশে (চ্যাপ্টার ১২-এর nginx-এ এক ঘণ্টা), CDN-এর ক্যাশে, আর দর্শকের ব্রাউজারে (সেগমেন্টে এক বছরের `immutable`!) কপি থেকে যায়। প্লেলিস্ট ক্যাশে থাকলে প্লেয়ার সেগমেন্টও খুঁজে পায়।

**নিশ্চিত হবেন:** CDN দিয়ে মাস্টার প্লেলিস্ট চান আর ক্যাশ হেডার দেখুন:

```bash
curl -sI "https://cdn.baytalhikma.org/media/hls/$ID/master.m3u8" | grep -iE '^(HTTP/|age|x-cache|cf-cache-status|cache-status)'
```

`HIT` আর একটা বড় `Age` মানে উত্তরটা ক্যাশ থেকে আসছে।

**সমাধান:** মুছে ফেলা মানে তিনটা কাজ: স্টোরেজ থেকে মোছা, CDN-এ সেই অ্যাসেটের পাথ বা ট্যাগ পার্জ করা, আর প্লেব্যাক API-তে সাথে সাথে `not_found` ফেরত দেওয়া। দর্শকের ব্রাউজারের ক্যাশ মোছা যায় না; তাই যেখানে মুছে ফেলা সত্যিই জরুরি (আইনি অনুরোধ, প্রাইভেট ভিডিও), সেখানে স্বল্পমেয়াদি signed URL, যাতে পুরনো লিংক কিছুক্ষণের মধ্যেই অচল হয়। পার্জের মেকানিজম **CDN** ট্র্যাকের [পার্জ ও ইনভ্যালিডেশন](/notes/cdn/06-purge-and-invalidation) চ্যাপ্টারে।

### ভালো নেটওয়ার্কেও কোয়ালিটি নিচে আটকে থাকে, বা সিক করলে আটকে যায়

**সম্ভাব্য কারণ:** মাস্টারে `BANDWIDTH` বাস্তবের চেয়ে অনেক বেশি লেখা, তাই প্লেয়ার মনে করে উঁচু রেন্ডিশন চালানোর মতো নেটওয়ার্ক নেই। অথবা প্লেয়ার ছোট প্লেয়ার-বক্সের জন্য রেজোলিউশন সীমিত রাখছে (অনেক প্লেয়ারে এটা ইচ্ছাকৃত সেটিং)। সিকে আটকানো সাধারণত রেন্ডিশনগুলোর কীফ্রেম একই জায়গায় না থাকার লক্ষণ।

**নিশ্চিত হবেন:** `BANDWIDTH` আর একটা সেগমেন্টের আসল বিটরেট (সাইজ গুণ ৮ ভাগ সময়কাল) তুলনা করুন; সব রেন্ডিশনের প্রথম কয়েকটা `#EXTINF` একই কিনা দেখুন।

**সমাধান:** `BANDWIDTH` প্যাকেজার থেকে আসুক, হাতে লেখা নয়; সব রেন্ডিশনে একই কীফ্রেম ব্যবধান। ABR-এর সিদ্ধান্ত **ভিডিও** ট্র্যাকের [Playback আর ABR](/notes/video/07-playback-and-abr) চ্যাপ্টারে।

## ইনসিডেন্টের সময়ের অভ্যাস

- **একবারে একটা পরিবর্তন।** আবার এনকোড, ক্যাশ পার্জ আর প্লেয়ার আপডেট একসাথে করলে কোনটায় কাজ হলো কেউ জানবে না, আর সমস্যা ফিরে এলে আবার শূন্য থেকে শুরু।
- **আগে প্রমাণ সংরক্ষণ, তারপর ঠিক করা।** ভাঙা প্লেলিস্ট, সোর্সের ffprobe আউটপুট আর জবের এরর কপি করে রাখুন, তারপর আবার এনকোড করুন। আবার এনকোড প্রমাণ মুছে দেয়।
- **একটা ভিডিও নাকি অনেক, আগে এটা।** একটা হলে ফাইল আর তার এনকোড, অনেক হলে শেয়ার করা লেয়ার।
- **ঠিক করার পর দুই দিক থেকে যাচাই।** CDN দিয়ে আর origin দিয়ে `vod-check.sh`, আর একটা আসল ডিভাইসে প্লে। ক্যাশ থেকে আসা সফল রেসপন্স মানেই সমস্যা শেষ নয়।
- **প্রতিটা নতুন লক্ষণ এই ক্যাটালগে যোগ করুন।** নিজের প্ল্যাটফর্মের ক্যাটালগই সবচেয়ে দামি রানবুক।

## মূল শিক্ষা

1. **অ্যাসেট ID আর চারটা প্রশ্ন দিয়ে শুরু:** কে দেখছে, ঠিক কী ঘটছে, কখন থেকে, একটা না অনেক।
2. **ভিডিওর পথ ধরে আট লেয়ার:** আপলোড, ইনজেস্ট, কিউ, এনকোড, প্যাকেজ, স্টোরেজ, CDN, প্লেয়ার। যেখানে প্রথম "না", সমস্যা সেখানে।
3. **লেয়ার ২-এর একটা `ffprobe` লাইন** রোটেশন, VFR, HDR, পিক্সেল ফরম্যাট আর অডিও একসাথে দেখায়।
4. **`river_job`-এর `state` আর শেষ এরর** "processing চিরকাল"-এর প্রায় প্রতিটা কারণ এক কুয়েরিতে বলে দেয়।
5. **`vod-check.sh` প্লেয়ারের মতো করে হাঁটে,** CDN আর origin দুই দিক থেকে চালালে দোষ কোন পাশে বোঝা যায়।
6. **iOS কড়া:** `CODECS`, `Content-Type`, `hvc1`, প্রোফাইল আর লেভেল।
7. **এরর রেসপন্সের হেডারও বাগের উৎস:** ক্যাশ হওয়া 404, দুইটা CORS হেডার, এররে CORS না থাকা।
8. **মোছা মানে তিন জায়গায় মোছা:** স্টোরেজ, CDN, প্লেব্যাক API; ব্রাউজারের ক্যাশের জন্য স্বল্পমেয়াদি URL।
9. **একবারে একটা পরিবর্তন, আর আগে প্রমাণ রেখে তারপর ঠিক করা।**
