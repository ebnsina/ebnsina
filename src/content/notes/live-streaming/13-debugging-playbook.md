---
title: 'লাইভ স্ট্রিমিং ডিবাগিং প্লেবুক'
subtitle: 'ক্যামেরা থেকে দর্শক পর্যন্ত একটা ফ্রেমের পথ ধরে আট ধাপের পদ্ধতি, প্রতিটা চেনা লক্ষণের সম্ভাব্য কারণ, নিশ্চিত করার কমান্ড আর সমাধান, সাথে একটা কপি-পেস্ট চেক স্ক্রিপ্ট যা আসল স্ট্রিমে চালিয়ে দেখা।'
chapter: 13
level: 'mastery'
readingTime: '৩২ মিনিট'
topics: ['live streaming', 'debugging', 'troubleshooting', 'hls', 'srt', 'rtmp', 'mediamtx', 'ffmpeg', 'ffprobe', 'obs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

সন্ধ্যা সাতটা, মিরপুরের একটা মহল্লায় হঠাৎ অন্ধকার। ডেসকোর সাবস্টেশনে খবর আসে, আর রাতের ডিউটির লাইনম্যান রুশদ বেরিয়ে পড়ে। তার সাথের নতুন সহকারী ফারাবি উত্তেজিত: "চলেন সোজা মহল্লায় যাই, কারো বাড়ির তার পুড়ে গেছে হয়তো!" রুশদ মাথা নাড়ে। সে প্রথমে সাবস্টেশনের প্যানেলে তাকায়: এই সাবস্টেশন থেকে বের হওয়া ফিডারগুলোর মধ্যে কোনটা বন্ধ? সাত নম্বর ফিডারের ব্রেকার ট্রিপ করেছে। তাহলে সমস্যা সাবস্টেশনের ভেতরে নয়, সাত নম্বর ফিডারের পথে কোথাও।

এরপর সে ফিডার ধরে এগোয়। প্রথম ট্রান্সফরমারের নিচে দাঁড়িয়ে সে দেখে, এর আওতার বাড়িগুলোতে আলো আছে। দ্বিতীয়টার আওতায়ও আছে। তৃতীয়টার নিচে অন্ধকার, আর ট্রান্সফরমারের ফিউজ কাটা। সে প্রতিটা ধাপে একটাই প্রশ্ন করে: "এখান পর্যন্ত কারেন্ট আসছে?" যেখানে উত্তর "হ্যাঁ" থেকে "না" হয়ে যায়, সমস্যা ঠিক সেই দুই বিন্দুর মাঝে। ফারাবির মতো সরাসরি মহল্লায় গিয়ে একটা একটা বাড়ির মিটার খুললে সারা রাত যেত, আর ভুল জায়গায় হাত দেওয়ার ঝুঁকি থাকত।

ফিউজ বদলানোর আগে রুশদ আরেকটা কাজ করে: ফিউজ কেন কাটল, সেটা দেখে। একটা গাছের ডাল তারে লেগে ছিল। ডাল না কাটলে নতুন ফিউজও এক ঘণ্টায় কাটবে। আর ফিরে এসে সে খাতায় লেখে কোন ফিডার, কোন ট্রান্সফরমার, কী কারণ, কখন ঠিক হলো।

মিলিয়ে নিই: সাবস্টেশন হলো **উৎস ও এনকোডার**, ফিডার হলো **কন্ট্রিবিউশন নেটওয়ার্ক আর ইনজেস্ট**, ট্রান্সফরমারগুলো হলো **ট্রান্সকোডার, প্যাকেজার আর CDN**, আর বাড়ির লাইন হলো **প্লেয়ার**। "এখান পর্যন্ত কারেন্ট আসছে?" হলো **প্রতিটা হপে প্লেলিস্ট আর সেগমেন্ট টাটকা কিনা দেখা**, আর "হ্যাঁ" থেকে "না" হওয়ার জায়গা হলো **সমস্যার লেয়ার**। সরাসরি বাড়ির মিটার খোলা হলো **দর্শকের ব্রাউজার থেকে ডিবাগিং শুরু করা**, গাছের ডাল কাটা হলো **মূল কারণ সারানো, শুধু রিস্টার্ট নয়**, আর খাতায় লেখা হলো **ইনসিডেন্টের টাইমলাইন**। বাস্তবে একটা বড় খেলার মাঝখানে স্ট্রিম আটকালে ভালো অন-কল ইঞ্জিনিয়ার ঠিক এভাবেই সামনে এগোয়।

## প্রথম নিয়ম: ফ্রেমের পথ ধরে চলুন

লাইভ ভাঙলে প্রথম প্রবৃত্তি হয় যেখানে অভিযোগ এসেছে সেখান থেকে শুরু করা: দর্শকের প্লেয়ার। কিন্তু লাইভে প্লেয়ারের সমস্যা প্রায় সবসময় উজানের কোনো সমস্যার ছায়া। পদ্ধতিটা তাই রুশদের মতো: **উৎস থেকে শুরু করে প্রতিটা হপে জিজ্ঞেস করুন "এখান পর্যন্ত টাটকা ফ্রেম আসছে?", যতক্ষণ না পাশাপাশি দুটো হপের উত্তর না মেলে।**

কোনো কমান্ড চালানোর আগে চারটা প্রশ্নের উত্তর লিখুন:

1. **কে দেখছে?** সবাই, নাকি একটা অঞ্চল, একটা ISP, একটা ডিভাইস? সবাই মানে প্রায়ই origin বা তার আগে; একটা অংশ মানে প্রায়ই CDN বা প্লেয়ার।
2. **ঠিক কী দেখছে?** কালো পর্দা, ঘুরতে থাকা চাকা, জমে যাওয়া ছবি অথচ শব্দ চলছে, বারবার থামা, নাকি অনেক দেরি?
3. **কখন থেকে?** ইভেন্টের শুরু থেকে, নাকি চলার মাঝে হঠাৎ? মাঝে হঠাৎ হলে ঠিক সেই মুহূর্তে কী বদলেছিল?
4. **সব রেন্ডিশনে, নাকি একটায়?** একটায় মানে প্রায়ই ট্রান্সকোডার বা প্যাকেজারের একটা আউটপুট।

## আট ধাপের পদ্ধতি

<Mermaid
title="ফ্রেমের পথ ধরে ডিবাগিং"
code={`graph TD
  S["1. Source and venue: camera, audio, power"] --> E["2. Encoder: OBS stats, CPU, bitrate"]
  E --> N["3. Contribution network: uplink, SRT RTT and loss"]
  N --> I["4. Ingest: auth log, path ready, publisher"]
  I --> T["5. Transcoder: running, speed near 1.0x"]
  T --> P["6. Packager: playlist advancing at origin"]
  P --> C["7. Edge or CDN: same freshness as origin"]
  C --> PL["8. Player: buffer, latency, errors"]
  I -->|"not ready"| FIXI["Fix steps 1 to 4"]
  P -->|"stale at origin"| FIXT["Fix steps 5 and 6"]
  C -->|"stale only at edge"| FIXC["Fix caching"]
  PL -->|"fresh everywhere, still broken"| FIXP["Fix the player"]`}
/>

এই চ্যাপ্টারের সব উদাহরণ [এগারো নম্বর চ্যাপ্টারের](/notes/live-streaming/11-build-a-live-pipeline) স্ট্যাকের (MediaMTX v1.21.2, ffmpeg, nginx) উপর **২০২৬ সালের অক্টোবরে** ইচ্ছা করে সমস্যা বাধিয়ে নেওয়া।

### ১. উৎস আর ভেন্যু

ক্যামেরার ক্যাপচার কার্ড ছবি দিচ্ছে? মিক্সারের অডিও এনকোডারে আসছে? ভেন্যুর বিদ্যুৎ আর ইন্টারনেট ঠিক আছে? এই ধাপ সবচেয়ে অবহেলিত ([নয় নম্বর চ্যাপ্টার](/notes/live-streaming/09-reliability)), অথচ "ছবি নেই কিন্তু স্ট্রিম চলছে" অভিযোগের বড় অংশ এখানেই। ভেন্যুর কাউকে জিজ্ঞেস করুন এনকোডারের প্রিভিউতে ছবি দেখা যাচ্ছে কিনা।

### ২. এনকোডার

OBS-এর Stats প্যানেল তিন রকম ড্রপ আলাদা করে দেখায় (রেন্ডারিং, এনকোডিং, নেটওয়ার্ক); কোনটা কী মানে, [তিন নম্বর চ্যাপ্টারের](/notes/live-streaming/03-live-encoder-settings) টেবিলে। আউটপুট বিটরেট লক্ষ্যের কাছে কিনা, CPU বা GPU ভরা কিনা।

### ৩. কন্ট্রিবিউশন নেটওয়ার্ক

SRT হলে সার্ভারের দিক থেকে RTT, loss আর drop দেখুন ([বারো নম্বর চ্যাপ্টার](/notes/live-streaming/12-live-monitoring)):

```bash
curl -s localhost:9997/v3/srt/conns/list    # on the ingest server
```

RTMP-এ এমন পরিসংখ্যান নেই; ভেন্যু থেকে `ping` আর একটা আপলোড স্পিড টেস্ট, আর সার্ভারে ইনজেস্ট বিটরেট।

### ৪. ইনজেস্ট

তিনটা জিনিস: auth অনুমতি দিয়েছে কিনা, পাথ `ready` কিনা, কে পাবলিশ করছে।

```bash
docker compose logs --since 5m auth | grep publish
curl -s localhost:9997/v3/paths/list
curl -s localhost:9997/v3/rtmp/conns/list
```

পাথ `ready` না হলে সমস্যা ১ থেকে ৪-এর মধ্যে; পরের ধাপে যাওয়ার মানে নেই।

### ৫. ট্রান্সকোডার

চলছে কিনা, আর রিয়েল-টাইমের সমান গতিতে কিনা।

```bash
docker compose logs --since 2m mediamtx | grep -E "runOnAvailable|too slow|exited"
docker stats --no-stream
```

### ৬. প্যাকেজার: origin-এ প্লেলিস্ট এগোচ্ছে?

এখানে নিচের `live-check.sh` সরাসরি origin-এর URL দিয়ে চালান (CDN এড়িয়ে)।

### ৭. Edge বা CDN

একই স্ক্রিপ্ট CDN-এর URL দিয়ে, সম্ভব হলে সমস্যাগ্রস্ত অঞ্চলের কাছের কোনো মেশিন থেকে। origin টাটকা কিন্তু edge স্টেল মানে সমস্যা ক্যাশিংয়ে। প্লেলিস্টের `curl -sI`-এ `age` আর ক্যাশ স্ট্যাটাস হেডার দেখুন ([CDN ট্র্যাকের পাঁচ নম্বর চ্যাপ্টার](/notes/cdn/05-reading-cdn-responses))।

### ৮. প্লেয়ার

সব হপ টাটকা অথচ দর্শক আটকে আছে, তবেই প্লেয়ারে আসুন: ব্রাউজারের DevTools-এর Network ট্যাবে প্লেলিস্ট কত ঘনঘন আসছে, কোনো রিকোয়েস্ট ব্যর্থ কিনা, Console-এ hls.js-এর এরর। প্লেয়ার-নির্দিষ্ট সমস্যার পূর্ণ তালিকা [ভিডিও প্লেয়ার ট্র্যাকের ডিবাগিং প্লেবুকে](/notes/video-player/13-debugging-playbook)।

## কপি-পেস্ট `live-check.sh`

ধাপ ৬ আর ৭-এর জন্য একটা স্ক্রিপ্ট, শুধু `curl` আর `ffprobe` দিয়ে। এটা একটা master বা media প্লেলিস্ট কয়েকবার পোল করে আর বলে: নতুন সেগমেন্ট আসছে কিনা, কোনো সেগমেন্ট `TARGETDURATION`-এর চেয়ে লম্বা কিনা, জানালায় বিজ্ঞাপনের মার্কার আছে কিনা, আর সবচেয়ে নতুন সেগমেন্ট কীফ্রেম দিয়ে শুরু হয় কিনা ও তাতে কোন কোডেক আছে।

```bash
#!/usr/bin/env bash
# live-check.sh PLAYLIST_URL [polls]: is this live HLS stream actually moving?
set -euo pipefail
url=${1:?usage: live-check.sh PLAYLIST_URL [polls=5]}
polls=${2:-5}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

fetch() { curl -fsS --max-time 10 "$1"; }

resolve() { # resolve $2 relative to playlist URL $1
  case $2 in
    http://*|https://*) echo "$2" ;;
    /*) echo "$(echo "$1" | grep -oE '^https?://[^/]+')$2" ;;
    *) local base=${1%%\?*}; echo "${base%/*}/$2" ;;
  esac
}

to_epoch() { # ISO 8601 PROGRAM-DATE-TIME -> unix seconds (GNU or BSD date)
  local t=${1%%.*} tz=${1#*.}
  [[ $1 == *.* ]] || { t=${1:0:19}; tz=${1:19}; }
  tz=$(echo "$tz" | grep -oE '(Z|[+-][0-9]{2}:?[0-9]{2})$' || echo Z)
  [[ $tz == Z ]] && tz=+0000; tz=${tz/:/}
  date -d "$t$tz" +%s 2>/dev/null || date -j -u -f '%Y-%m-%dT%H:%M:%S%z' "$t$tz" +%s
}

pl=$(fetch "$url") || { echo "FAIL: cannot fetch $url"; exit 1; }
if grep -q '#EXT-X-STREAM-INF' <<<"$pl"; then
  echo "master playlist, $(grep -c '#EXT-X-STREAM-INF' <<<"$pl") variants:"
  awk '/#EXT-X-STREAM-INF/ { bw = $0; sub(/.*[:,]BANDWIDTH=/, "", bw); sub(/[^0-9].*/, "", bw)
         res = "?"; if (match($0, /RESOLUTION=[0-9x]+/)) res = substr($0, RSTART + 11, RLENGTH - 11)
         getline uri; printf "  %9s bps  %-9s  %s\n", bw, res, uri }' <<<"$pl"
  url=$(resolve "$url" "$(grep -A1 '#EXT-X-STREAM-INF' <<<"$pl" | grep -v '^#' | grep -v '^--' | head -1)")
  echo "checking first variant: $url"
fi

prev=""; run=0; stuck=0 # stuck = longest streak of polls with no new segment
for i in $(seq 1 "$polls"); do
  pl=$(fetch "$url") || { echo "poll $i: FETCH FAILED"; sleep 2; continue; }
  seq=$(grep -oE '#EXT-X-MEDIA-SEQUENCE:[0-9]+' <<<"$pl" | cut -d: -f2 || true)
  target=$(grep -oE '#EXT-X-TARGETDURATION:[0-9]+' <<<"$pl" | cut -d: -f2 || true)
  count=$(grep -c '^#EXTINF' <<<"$pl" || true)
  maxdur=$(grep -oE '^#EXTINF:[0-9.]+' <<<"$pl" | cut -d: -f2 | sort -n | tail -1)
  # last PROGRAM-DATE-TIME, plus the seconds of media between it and the newest segment's start
  read -r pdt offset < <(awk -F: '/^#EXT-X-PROGRAM-DATE-TIME:/ { sub(/^[^:]*:/, ""); p = $0; sum = 0; last = 0 }
    /^#EXTINF:/ { split($2, a, ","); sum += a[1]; last = a[1] }
    END { if (p != "") printf "%s %d\n", p, sum - last }' <<<"$pl") || true
  age="n/a"; [[ -n ${pdt:-} ]] && age=$(( $(date +%s) - $(to_epoch "$pdt") - offset ))s
  last=$((seq + count - 1)) # number of the newest segment; the window may still be filling
  adv="-"; [[ -n $prev ]] && adv=$((last - prev))
  if [[ $adv == 0 ]]; then run=$((run + 1)); else run=0; fi
  (( run > stuck )) && stuck=$run
  echo "poll $i: newest=#$last (+$adv) window=$count target=${target}s max_extinf=${maxdur}s newest_started=$age ago"
  prev=$last
  [[ $i -lt $polls ]] && sleep "${target:-2}"
done

grep -q '#EXT-X-ENDLIST' <<<"$pl" && echo "note: playlist has ENDLIST: the stream ended (or this is VOD)"
[[ -n ${target:-} ]] || { echo "FAIL: media playlist never fetched"; exit 1; }
over=$(awk -v t="$target" -F: '/^#EXTINF/ { split($2,a,","); if (a[1]+0 > t+0.5) n++ } END { print n+0 }' <<<"$pl")
[[ $over -gt 0 ]] && echo "WARN: $over segments longer than TARGETDURATION (keyframes not aligned to segments?)"
echo "ad markers in window: $(grep -cE '#EXT-X-(CUE-OUT|DATERANGE|SCTE35)' <<<"$pl" || true)"
[[ $stuck -ge 2 ]] && echo "WARN: no new segment in $stuck polls in a row: playlist is STALE"

seg=$(grep -v '^#' <<<"$pl" | grep -v '^$' | tail -1)
init=$(grep -oE '#EXT-X-MAP:URI="[^"]+"' <<<"$pl" | tail -1 | cut -d'"' -f2 || true)
: > "$tmp/probe"
[[ -n $init ]] && fetch "$(resolve "$url" "$init")" >> "$tmp/probe"
fetch "$(resolve "$url" "$seg")" >> "$tmp/probe"
echo "newest segment: $seg"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,sample_rate -of compact=p=0 "$tmp/probe" | sort -u | grep -v '^$'
first=$(ffprobe -v error -select_streams v:0 -read_intervals '%+#1' \
  -show_entries frame=key_frame,pict_type -of compact=p=0 "$tmp/probe" | head -1)
echo "first video frame: $first"
[[ $first == *key_frame=1* ]] || echo "WARN: newest segment does not start with a keyframe"
```

`newest_started` প্যাকেজারের `PROGRAM-DATE-TIME` থেকে হিসাব করা, তাই এটা প্যাকেজারের ঘড়ির উপর নির্ভর করে; একটা স্ট্রিমের ভেতরে এটা বাড়ছে কিনা দেখুন, দুই ভিন্ন সার্ভিসের মান তুলনা করবেন না ([বারো নম্বর চ্যাপ্টারে](/notes/live-streaming/12-live-monitoring) কারণ আছে)। স্টেল ঘোষণা হয় পরপর দুই পোলে নতুন সেগমেন্ট না এলে; একবার না এলে সেটা সময়ের সামান্য গরমিলও হতে পারে।

তিনটা আসল রান। প্রথমে সুস্থ অবস্থা, আমাদের স্ট্যাকে:

```text
$ ./live-check.sh http://localhost/hls/baytalhikma/master.m3u8 3
master playlist, 3 variants:
    3440800 bps  1280x720   720p/index.m3u8
    1680800 bps  854x480    480p/index.m3u8
    1020800 bps  640x360    360p/index.m3u8
checking first variant: http://localhost/hls/baytalhikma/720p/index.m3u8
poll 1: newest=#1792906940 (+-) window=9 target=2s max_extinf=2.000000s newest_started=0s ago
poll 2: newest=#1792906941 (+1) window=10 target=2s max_extinf=2.000000s newest_started=0s ago
poll 3: newest=#1792906942 (+1) window=10 target=2s max_extinf=2.000000s newest_started=0s ago
ad markers in window: 0
newest segment: seg_1792906942.m4s
codec_name=aac|codec_type=audio|sample_rate=48000
codec_name=h264|codec_type=video|width=1280|height=720
first video frame: key_frame=1|pict_type=I
```

ট্রান্সকোডারের কন্টেইনারকে CPU-র এক-তৃতীয়াংশে নামিয়ে দেওয়ার পর (রিয়েল-টাইমের চেয়ে ধীর):

```text
poll 1: newest=#1792906891 (+-) window=5 target=2s max_extinf=2.000000s newest_started=17s ago
poll 2: newest=#1792906891 (+0) window=5 target=2s max_extinf=2.000000s newest_started=19s ago
poll 3: newest=#1792906893 (+2) window=7 target=2s max_extinf=2.000000s newest_started=17s ago
poll 4: newest=#1792906893 (+0) window=7 target=2s max_extinf=2.000000s newest_started=19s ago
```

সেগমেন্ট আসছে, কিন্তু থেমে থেমে, আর `newest_started` সুস্থ অবস্থার শূন্যের জায়গায় ১৭–১৯ সেকেন্ড। দর্শকের কাছে এটা বারবার বাফারিং আর ক্রমশ বাড়তে থাকা দেরি।

আর একটা পাবলিক টেস্ট স্ট্রিমে (Unified Streaming-এর SCTE-35 ডেমো, যা MPEG-TS আর আলাদা অডিও গ্রুপ ব্যবহার করে), যাতে দেখা যায় স্ক্রিপ্ট অন্যের স্ট্রিমেও চলে:

```text
$ ./live-check.sh "https://demo.unified-streaming.com/k8s/live/scte35.isml/.m3u8" 3
master playlist, 2 variants:
    1316000 bps  1280x720   scte35-audio_eng=128000-video=1000000.m3u8
     150000 bps  ?          scte35-audio_eng=128000.m3u8
checking first variant: https://demo.unified-streaming.com/k8s/live/scte35.isml/scte35-audio_eng=128000-video=1000000.m3u8
poll 1: newest=#933805781 (+-) window=312 target=3s max_extinf=1.92s newest_started=10s ago
poll 2: newest=#933805784 (+3) window=312 target=3s max_extinf=1.92s newest_started=8s ago
poll 3: newest=#933805786 (+2) window=312 target=3s max_extinf=1.92s newest_started=9s ago
ad markers in window: 11
newest segment: scte35-audio_eng=128000-video=1000000-933805786.ts
codec_name=aac|codec_type=audio|sample_rate=48000
codec_name=h264|codec_type=video|width=1280|height=720
codec_name=timed_id3|codec_type=data
first video frame: key_frame=1|pict_type=I
```

এই স্ট্রিমের URL ২০২৬ সালের অক্টোবরে কাজ করছিল; পাবলিক ডেমো স্ট্রিম আসে আর যায়। আমার প্রথম চেষ্টার দুটো পরিচিত টেস্ট স্ট্রিমের master প্লেলিস্ট খুলেছিল কিন্তু ভেতরের variant ৪০৪ দিয়েছিল, সম্ভবত কোথাও পুরনো master রয়ে গেছে অথচ স্ট্রিম বন্ধ। নিজেই একটা চমৎকার লাইভ-ডিবাগিং উদাহরণ: master দেখে "চলছে" ভাববেন না।

## লক্ষণ থেকে সমাধান: পূর্ণ ক্যাটালগ

প্রতিটা এন্ট্রি: সম্ভাব্য কারণ, নিশ্চিত হওয়ার উপায়, সমাধান। ক্রমটা ফ্রেমের পথের মতো, উৎস থেকে প্লেয়ার।

### এনকোডার কানেক্টই হয় না

**কারণ:** ভুল URL বা স্ট্রিম কী, ইনজেস্ট পোর্ট বন্ধ (অফিস বা হোটেলের নেটওয়ার্কে 1935 প্রায়ই বন্ধ), RTMPS-এ সার্টিফিকেটের সমস্যা।

**নিশ্চিত হোন:** প্রথমে সার্ভারের auth লগ। ভুল কী এনকোডারের দিক থেকে নেটওয়ার্ক এররের মতো দেখায়, আসল কারণ শুধু সার্ভারে লেখা থাকে। আমার রানে:

```text
# encoder (ffmpeg)
Error submitting a packet to the muxer: Broken pipe

# docker compose logs auth
auth action=publish path=ingest/baytalhikma proto=rtmp ip=127.0.0.1 ok=false

# docker compose logs mediamtx
INF [RTMP] [conn 127.0.0.1:64723] closed: authentication failed: server replied with code 401: denied
```

auth লগে কোনো লাইনই না থাকলে রিকোয়েস্ট সার্ভারে পৌঁছায়নি: ভেন্যু থেকে `nc -vz live.baytalhikma.org 1935` চালান। RTMPS হলে `openssl s_client -connect live.baytalhikma.org:443` দিয়ে সার্টিফিকেট চেইন দেখুন।

**সমাধান:** কী আর পাথ মেলান (OBS-এ কী-এর ভেতরে `?user=...&pass=...` সহ); পোর্ট বন্ধ থাকলে 443-এ RTMPS, বা SRT। SRT UDP, তাই `nc` দিয়ে পরীক্ষা নির্ভরযোগ্য নয়; একটা ছোট টেস্ট পাবলিশ চালানোই সবচেয়ে সহজ পরীক্ষা।

### কানেক্ট হয়, কয়েক সেকেন্ড বা মিনিট পরপর কেটে যায়

**কারণ ১, দুই এনকোডার একই পাথে।** খুব সাধারণ: ব্যাকআপ এনকোডার বা ভুলে চালু থাকা আরেকটা OBS একই কী দিয়ে পাবলিশ করছে। MediaMTX-এ `overridePublisher` ডিফল্টে `true`, তাই নতুনজন পুরনোজনকে কেটে দেয়। আমি দুটো ffmpeg ১৫ সেকেন্ডের ব্যবধানে চালিয়ে দেখেছি:

```text
INF [RTMP] [conn 192.168.65.1:19450] opened
INF [path ingest/baytalhikma] closing existing publisher
INF [RTSP] [conn 127.0.0.1:41114] closed: terminated
INF [RTMP] [conn 192.168.65.1:19450] is publishing to path 'ingest/baytalhikma'
INF [RTMP] [conn 192.168.65.1:55520] closed: terminated

# first encoder
Error writing trailer: End of file
```

দুটো OBS-এরই অটো-রিকানেক্ট চালু থাকলে এরা একে অপরকে পালাক্রমে কাটতে থাকে, আর প্রতিবার ট্রান্সকোডারও রিস্টার্ট হয় (উপরের `RTSP ... closed: terminated` লাইন)। দর্শকের কাছে এটা নিয়মিত বিরতিতে থেমে যাওয়া। **নিশ্চিত হোন:** MediaMTX লগে `closing existing publisher`, আর `/v3/rtmp/conns/list`-এ বিভিন্ন `remoteAddr`। **সমাধান:** প্রতিটা এনকোডারকে আলাদা পাথ আর আলাদা কী দিন; রিডানডেন্সি এক পাথে দুই এনকোডার দিয়ে নয় ([নয় নম্বর চ্যাপ্টার](/notes/live-streaming/09-reliability))। জরুরি অবস্থায় একটা কানেকশন হাতে কাটতে Control API: `curl -X POST localhost:9997/v3/rtmp/conns/kick/CONN_ID` (আমার রানে `200` দিয়ে সাথে সাথে কেটেছে; SRT-এর জন্য `/v3/srt/conns/kick/CONN_ID`)।

**কারণ ২, আপলিংক ভরে যাওয়া।** এনকোডারের বিটরেট আপলিংকের প্রায় সমান হলে TCP-র বাফার জমে, আর RTMP একসময় টাইমআউটে কাটে। **নিশ্চিত হোন:** OBS-এ নেটওয়ার্ক ড্রপ বাড়ছে, কাটার আগে ইনজেস্ট বিটরেট ধীরে কমছে। **সমাধান:** বিটরেট আপলিংকের মোটামুটি অর্ধেক থেকে দুই-তৃতীয়াংশে নামান ([তিন নম্বর চ্যাপ্টার](/notes/live-streaming/03-live-encoder-settings)), তার লাগান, বা SRT।

**কারণ ৩, SRT-এর latency window RTT-এর তুলনায় ছোট।** **নিশ্চিত হোন:** `srt_conns_packets_received_drop` বাড়ছে, `ms_rtt` window-এর কাছাকাছি। **সমাধান:** window বাড়ান ([দুই নম্বর চ্যাপ্টার](/notes/live-streaming/02-contribution-protocols))।

**কারণ ৪, NAT বা ফায়ারওয়ালের idle টাইমআউট**, বিশেষত মোবাইল রাউটারে। নির্দিষ্ট ব্যবধানে (যেমন ঠিক পাঁচ মিনিট পরপর) কাটলে এটা সন্দেহ করুন। **নিশ্চিত হোন:** MediaMTX লগে প্রতিটা `closed` লাইনের সময়, ব্যবধান মাপুন। **সমাধান:** একই এনকোডার অন্য নেটওয়ার্কে (যেমন অন্য অপারেটরের মোবাইল ডেটায়) চালিয়ে দেখুন; ব্যবধান মিলিয়ে গেলে রাউটার বা অপারেটরের টাইমআউট, আর তখন সেই নেটওয়ার্ক বাদ দেওয়াই নিরাপদ।

### OBS "dropped frames" দেখাচ্ছে

তিন রকম ড্রপের মানে আলাদা: রেন্ডারিং ল্যাগ মানে GPU, এনকোডিং ল্যাগ মানে এনকোডারের CPU বা preset, আর নেটওয়ার্ক মানে আপলিংক। সমাধান পুরোপুরি ভিন্ন, তাই আগে দেখুন কোনটা বাড়ছে ([তিন নম্বর চ্যাপ্টারের টেবিল](/notes/live-streaming/03-live-encoder-settings))। সার্ভারের দিকে কিছু বদলালে এটা সারবে না।

### স্ট্রিম "লাইভ", কিন্তু দর্শক শুধু ঘুরতে থাকা চাকা দেখে

**কারণ:** ইনজেস্ট ঠিক, কিন্তু প্লেলিস্টে নতুন সেগমেন্ট আসছে না: ট্রান্সকোডার চলছে না, ক্র্যাশ লুপে আছে, বা রিয়েল-টাইমের চেয়ে ধীর।

**নিশ্চিত হোন:** origin-এ `live-check.sh`। তারপর MediaMTX লগ:

```text
# transcoder crash loop (here: a bad output option), restarted about every 5 s
Could not write header (incorrect codec parameters ?): Invalid argument
INF [path ingest/baytalhikma] runOnAvailable command exited: command exited with code 234
INF [RTSP] [conn 127.0.0.1:50670] opened

# transcoder slower than real time
WAR [RTSP] [session 4506f9d3] reader is too slow, discarding 445 frames
```

প্রথমটা ক্র্যাশ লুপ: `runOnAvailableRestart` ট্রান্সকোডারকে বারবার চালু করছে আর প্রতিবার সে একই এররে মরছে। এররের লাইনটা উপরে থাকে, `exited`-এর ঠিক আগে। দ্বিতীয়টা ধীর ট্রান্সকোডার।

**সমাধান:** ক্র্যাশ লুপে ffmpeg-এর এরর সারান; কমান্ডটা কন্টেইনারের ভেতরে হাতে চালিয়ে দেখা দ্রুততম। ধীর হলে রেন্ডিশন বা চ্যানেল কমান, দ্রুত preset, বা বড় সার্ভার। বারো নম্বর চ্যাপ্টারের `LiveTranscoderBehind` অ্যালার্ট এটা দর্শকের আগে ধরার জন্য।

### প্লেলিস্ট দেখতে ঠিক, কিন্তু চিরকাল একই

দুই রকম হয়। এনকোডার স্বাভাবিকভাবে থামলে ffmpeg প্লেলিস্টে `#EXT-X-ENDLIST` লেখে; স্ক্রিপ্ট তখন `note: playlist has ENDLIST` বলে, আর প্লেয়ার "শেষ" দেখায়। কিন্তু ট্রান্সকোডার হঠাৎ মরলে (`kill -9`, মেমরি শেষ, সার্ভার রিবুট) `ENDLIST` লেখা হয় না: প্লেলিস্ট শেষ অবস্থায় ঝুলে থাকে, ২০০ দেয়, আর প্লেয়ার চিরকাল পরের সেগমেন্টের অপেক্ষা করে। এটাই সবচেয়ে নীরব ব্যর্থতা ([পাঁচ নম্বর চ্যাপ্টারে](/notes/live-streaming/05-live-transcode-package) ENDLIST-এর ফাঁদ)। **নিশ্চিত হোন:** `live-check.sh`-এ পরপর পোলে `+0`, আর `ENDLIST` নেই। **সমাধান:** ট্রান্সকোডার ফেরান; আর স্টেল প্লেলিস্টের অ্যালার্ট রাখুন, কারণ HTTP এরর রেট এখানে কিছুই দেখাবে না।

### ট্রান্সকোডার রিস্টার্টের পর প্লেয়ার আটকে যায় বা পুরনো অংশ দেখায়

**কারণ:** নতুন রান আগের রানের ফাইলের নাম (`seg_000000.m4s`, `init_0.mp4`) আবার ব্যবহার করছে, অথচ CDN সেগুলো `immutable` হিসেবে ক্যাশ করে রেখেছে; আর `MEDIA-SEQUENCE` পেছনে চলে গেছে। আমি `kill -9` দিয়ে ঠিক এটাই ঘটতে দেখেছি। **নিশ্চিত হোন:** রিস্টার্টের আগে-পরে প্লেলিস্টের প্রথম সেগমেন্টের নাম আর `MEDIA-SEQUENCE`। **সমাধান:** এগারো নম্বর চ্যাপ্টারের মতো `-hls_start_number_source epoch` আর রানভিত্তিক init নাম, যাতে নাম কখনো ফেরত না আসে। রিস্টার্টে টাইমস্ট্যাম্পও নতুন করে শুরু হয়; প্লেয়ার এটা কীভাবে সামলায় আগে থেকে পরীক্ষা করুন, আর রিস্টার্ট ছাড়া টিকে থাকার নকশা নয় নম্বর চ্যাপ্টারে।

### লেটেন্সি ইভেন্ট জুড়ে ধীরে ধীরে বাড়ছে

**কারণ ১, প্লেয়ারের নিজের নিয়ম।** hls.js-এর ডকস অনুযায়ী প্রতিবার আটকালে (stall) সে তার লক্ষ্য লেটেন্সি `liveSyncOnStallIncrease` পরিমাণ বাড়ায়, ডিফল্টে ১ সেকেন্ড। দশবার আটকানো দর্শক তাই দশ সেকেন্ড বেশি পেছনে থাকে, আর ফিরে আসে না যদি না `maxLiveSyncPlaybackRate` ১-এর বেশি থাকে (ডিফল্ট ১, মানে ধরার জন্য দ্রুত চালানো বন্ধ)। **নিশ্চিত হোন:** প্লেয়ারে `hls.latency` আর `hls.targetLatency` (এগারো নম্বর চ্যাপ্টারের পেজ এটা দেখায়)। **সমাধান:** `maxLiveSyncPlaybackRate` ১.১-এর মতো দিন, আর `liveMaxLatencyDuration` দিয়ে একটা ঊর্ধ্বসীমা। আসল সমাধান অবশ্য আটকানো কমানো।

**কারণ ২, পাইপলাইন রিয়েল-টাইমের চেয়ে ধীর।** তখন সবার লেটেন্সি একসাথে বাড়ে, শুধু কিছু দর্শকের নয়। উপরের ধীর ট্রান্সকোডার দেখুন।

### লেটেন্সি শুরু থেকেই ৩০ সেকেন্ডের বেশি

হিসাব করুন। ৬ সেকেন্ডের সেগমেন্ট, প্লেয়ার তিন সেগমেন্ট পেছনে (hls.js-এর ডিফল্ট `liveSyncDurationCount` ৩), সাথে এনকোডার, ট্রান্সকোডার আর CDN মিলিয়ে কয়েক সেকেন্ড: সহজেই ২৫–৩০ সেকেন্ড। **নিশ্চিত হোন:** `live-check.sh`-এ `target`, প্লেয়ারে `hls.latency`, আর ছবিতে বসানো ঘড়ি দিয়ে glass-to-glass। **সমাধান:** ছোট সেগমেন্ট (২ সেকেন্ড), প্লেয়ারের `liveSyncDuration` কমানো (ডকস সতর্ক করে যে তিন সেগমেন্টের কম হলে আটকানোর সম্ভাবনা বাড়ে), বা LL-HLS ([ছয় নম্বর চ্যাপ্টার](/notes/live-streaming/06-low-latency))।

### নিয়মিত বিরতিতে আটকায়, প্রতি কয়েক সেকেন্ডে

**কারণ:** কীফ্রেম সেগমেন্টের সাথে মেলে না। সেগমেন্ট শুধু কীফ্রেমে কাটা যায়, তাই কীফ্রেম ৪ সেকেন্ডে একবার আর টার্গেট ২ হলে কিছু সেগমেন্ট টার্গেটের চেয়ে লম্বা হয়, আর প্লেয়ারের হিসাব গোলমাল হয়। ট্রান্সকোড না করে রিমাক্স করলে (যেমন MediaMTX-এর নিজের HLS) সেগমেন্টের সীমা পুরোপুরি এনকোডারের কীফ্রেমের উপর নির্ভর করে। **নিশ্চিত হোন:** `live-check.sh` বলবে `WARN: N segments longer than TARGETDURATION`। **সমাধান:** ট্রান্সকোডারে সময়ভিত্তিক `-force_key_frames` (আমি ২৫ fps উৎসে পরীক্ষা করেছি, সব সেগমেন্ট ঠিক ২ সেকেন্ড); রিমাক্সে এনকোডারের কীফ্রেম ইন্টারভাল সেগমেন্টের সমান বা তার ভাগফল।

### ছবি ঝাঁকুনি দেয়, অথচ প্লেলিস্ট সুস্থ দেখায়

**কারণ:** এনকোডার বা ভেন্যুর নেটওয়ার্ক রিয়েল-টাইমের চেয়ে ধীরে পাঠাচ্ছে; ট্রান্সকোডার ফাঁক ভরাতে ফ্রেম ডুপ্লিকেট করছে, তাই সেগমেন্ট সময়মতোই আসে। আমি এনকোডারকে `-readrate 0.85` দিয়ে ধীর করে দেখেছি: ইনজেস্ট বিটরেট ৩.৬৭ থেকে ৩.১৩ Mbit/s, সেগমেন্টের হার তবু 1.0, আর লগে:

```text
[vo0->#0:0] More than 1000 frames duplicated
ERR [path ingest/baytalhikma] [recorder] detected drift between recording duration and absolute time, resetting
```

**নিশ্চিত হোন:** ইনজেস্ট বিটরেট এনকোডারের সেটিংয়ের চেয়ে কম, ট্রান্সকোডারের লগে `duplicated`। **সমাধান:** উজানে খুঁজুন, এনকোডারের CPU আর OBS-এর ড্রপ। রেকর্ডিংও এতে বিভ্রান্ত হয় (উপরের `recorder` লাইন), তাই আর্কাইভ পরে মিলিয়ে দেখুন।

### অডিও আর ভিডিও সিঙ্কে নেই, বা সময়ের সাথে সরে যায়

**কারণ:** উৎসের অডিও টাইমস্ট্যাম্প অনিয়মিত, বা স্যাম্পল রেট মেলে না (ক্যামেরা ৪৮ kHz, মিক্সার ৪৪.১ kHz)। প্রথম রানে আমাদের ট্রান্সকোডারের লগ ভরে ছিল `Queue input is backward in time` আর `Non-monotonic DTS` বার্তায়। **নিশ্চিত হোন:** ট্রান্সকোডারের লগে এই দুই বার্তা; ছবিতে বসানো ঘড়ির সাথে একটা হাততালি বা বিপ মিলিয়ে দেখা। **সমাধান:** ট্রান্সকোডারে `-af aresample=async=1` আর নির্দিষ্ট `-ar 48000` (যোগ করার পর একই ২৫ সেকেন্ডে বার্তা শূন্য); উৎসে সব যন্ত্র একই স্যাম্পল রেটে।

### ছবি জমে আছে, শব্দ চলছে

**কারণ:** ভিডিও ট্র্যাক থেমে গেছে কিন্তু অডিও আসছে: ক্যাপচার কার্ডের সিগন্যাল হারানো, OBS-এ সিন বা সোর্সের সমস্যা, বা এনকোডারের GPU আটকে যাওয়া। **নিশ্চিত হোন:** `live-check.sh`-এর ffprobe অংশ সবচেয়ে নতুন সেগমেন্টে কোন ট্র্যাক আছে দেখায়; ভিডিও লাইন থাকলে সেগমেন্টে ফ্রেম গুনুন:

```bash
ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=nb_read_frames -of csv=p=0 probe.mp4
```

২ সেকেন্ডের সেগমেন্টে ৩০ fps-এ প্রায় ৬০ ফ্রেম স্বাভাবিক। ফ্রেম আছে অথচ ছবি জমা মানে উৎসই একই ছবি পাঠাচ্ছে: ধাপ ১ আর ২। **সমাধান:** ভেন্যুতে এনকোডারের প্রিভিউ দেখুন, ক্যাপচার সোর্স রিস্টার্ট করুন।

### এনকোডার রিস্টার্টের পর গ্লিচ, সবুজ ফ্রেম, বা প্লেয়ার আটকে যায়

**কারণ:** এনকোডার নতুন করে শুরু করলে টাইমস্ট্যাম্প শূন্য থেকে শুরু হয়, আর প্লেয়ারকে সেটা `EXT-X-DISCONTINUITY` দিয়ে না জানালে তার টাইমলাইন ভেঙে যায়। আমাদের স্ট্যাকে এনকোডার পাল্টালে ট্রান্সকোডারও রিস্টার্ট হয় আর নতুন সেগমেন্ট নম্বর থেকে শুরু করে। **নিশ্চিত হোন:** রিস্টার্টের সময়ের আশেপাশে প্লেলিস্টে `DISCONTINUITY` আছে কিনা, আর প্লেয়ারের Console-এ এরর। **সমাধান:** অদৃশ্য সুইচ, ঘোষিত সুইচ বা প্লেয়ারের ব্যাকআপ variant, তিনটা পথ [নয় নম্বর চ্যাপ্টারে](/notes/live-streaming/09-reliability)।

### কিছু রেন্ডিশন নেই বা একটাতেই সমস্যা

**কারণ:** ট্রান্সকোডারের একটা আউটপুট ব্যর্থ, বা master-এ থাকা একটা variant আর তৈরি হচ্ছে না। **নিশ্চিত হোন:** প্রতিটা variant আলাদা করে পরীক্ষা করুন:

```bash
for v in 720p 480p 360p; do
  echo "== $v"; ./live-check.sh "https://live.baytalhikma.org/hls/baytalhikma/$v/index.m3u8" 2 | grep -E "poll|WARN|FAIL"
done
```

**সমাধান:** ট্রান্সকোডারের লগ; প্রায়ই একটা রেন্ডিশনের এনকোডার সেটিং উৎসের সাথে খাপ খায় না (যেমন উৎস নিজেই ৪৮০p অথচ ল্যাডারে ১০৮০p)।

### CDN-এ প্লেলিস্ট বা সেগমেন্ট ৪০৪, অথচ origin-এ আছে

**কারণ:** negative caching: সেগমেন্ট তৈরি হওয়ার মুহূর্তের আগে কেউ চেয়েছিল, origin ৪০৪ দিয়েছিল, আর CDN সেই ৪০৪ এক মিনিট ধরে রেখেছে। পুরো একটা অঞ্চল একই সেগমেন্টে আটকে যায়, তারপর হঠাৎ ঠিক হয়। **নিশ্চিত হোন:** সেই অঞ্চল থেকে সেগমেন্টের URL `curl -sI`: `404` সাথে ক্যাশ HIT আর বড় `age`। **সমাধান:** origin-এ ৪০৪-এ `no-store` বা খুব ছোট `max-age`, edge-এ ৪০৪-এর TTL ১ সেকেন্ড ([আট নম্বর চ্যাপ্টারে](/notes/live-streaming/08-live-delivery-at-scale) পূর্ণ ব্যাখ্যা আর nginx কনফিগ)।

### দর্শক হঠাৎ বেড়ে গেলে origin পড়ে যায়

**কারণ:** CDN-এর একই সেগমেন্টের হাজার miss একসাথে origin-এ যাচ্ছে (request collapsing নেই), বা প্লেলিস্টের TTL শূন্য বলে প্রতিটা দর্শকের প্রতিটা প্লেলিস্ট রিকোয়েস্ট origin-এ। **নিশ্চিত হোন:** origin-এর access log-এ একই URL-এর রিকোয়েস্টের সংখ্যা প্রতি সেকেন্ডে; CPU আর আপলিংক। **সমাধান:** origin shield, request collapsing, প্লেলিস্টে ছোট কিন্তু শূন্য নয় এমন TTL ([আট নম্বর চ্যাপ্টার](/notes/live-streaming/08-live-delivery-at-scale))।

### বিজ্ঞাপনের মার্কার আসছে না

**কারণ:** উৎস SCTE-35 পাঠাচ্ছে না, ট্রান্সকোডার সেটা ফেলে দিচ্ছে, বা প্যাকেজার প্লেলিস্টে লিখছে না। **নিশ্চিত হোন:** `live-check.sh`-এর `ad markers in window` লাইন; Unified Streaming-এর ডেমোতে এটা ১১ ছিল, আমাদের ffmpeg পাইপলাইনে ০, কারণ আমাদের ffmpeg কমান্ড কোনো মার্কার লেখে না। একটা মার্কার দেখতে কেমন:

```text
#EXT-X-DATERANGE:ID="14822287-1792903835",START-DATE="2026-10-25T04:50:35.520000Z",PLANNED-DURATION=38.4,SCTE35-OUT=0xFC30...
#EXT-X-CUE-OUT:38.4
```

**সমাধান:** কোন হপে মার্কার হারাচ্ছে সেটা ধাপে ধাপে দেখুন; SCTE-35-এর পুরো পথ [নয় নম্বর চ্যাপ্টারে](/notes/live-streaming/09-reliability)।

### রেকর্ডিংয়ে ফাঁক বা টুকরো অংশ নেই

**কারণ:** ডিস্ক ভরে গেছে, পাবলিশার মাঝে কেটে গিয়েছিল (প্রতিবার নতুন ফাইল শুরু হয়), বা ইনপুট রিয়েল-টাইমের চেয়ে ধীর ছিল আর রেকর্ডার নিজেকে রিসেট করেছে (উপরের `detected drift` লাইন)। **নিশ্চিত হোন:** `df -h`, রেকর্ডিং ফোল্ডারে ফাইলের তালিকা আর সময়, MediaMTX লগে `recorder` লাইন। **সমাধান:** ডিস্কে অ্যালার্ট আর রিটেনশন, পাবলিশারের স্থিতি, আর আপলোডার কাজ করছে কিনা ([এগারো নম্বর চ্যাপ্টার](/notes/live-streaming/11-build-a-live-pipeline))।

### SRT দিয়ে পাঠাতে গেলে ffmpeg বলে `Protocol not found`

**কারণ:** ffmpeg-এর বিল্ডে `libsrt` নেই; Homebrew-এর বিল্ডে আমার মেশিনে ছিল না। **নিশ্চিত হোন:** `ffmpeg -protocols` আউটপুটে `srt` নেই। **সমাধান:** SRT-সহ বিল্ড, যেমন MediaMTX-এর `-ffmpeg` ট্যাগের ইমেজ।

## ইনসিডেন্টের সময় অভ্যাস

- **একবারে একটাই পরিবর্তন।** রুশদ ফিউজ আর ডাল একসাথে বদলায় না দেখার আগে। একসাথে তিনটা জিনিস রিস্টার্ট করলে কোনটায় কাজ হলো কখনো জানবেন না।
- **রিস্টার্ট উপশম, সমাধান নয়।** ট্রান্সকোডার রিস্টার্ট দর্শককে ফেরায়, কিন্তু কেন মরেছিল সেটা না জানলে আবার মরবে, সম্ভবত খেলার সবচেয়ে গুরুত্বপূর্ণ মুহূর্তে।
- **প্রতিটা পদক্ষেপ সময়সহ লিখুন**, চ্যাটে এক লাইনে। পরে টাইমলাইন বানানো আর অ্যালার্ট সারানো এর উপর নির্ভর করে।
- **দর্শককে জানান।** একটা স্লেট বা সোশ্যাল পোস্টে "আমরা জানি, ঠিক করছি" নীরবতার চেয়ে অনেক ভালো।
- **শেষে জিজ্ঞেস করুন: কোন অ্যালার্ট এটা আগে ধরতে পারত?** উত্তর যদি "কোনোটাই না" হয়, [বারো নম্বর চ্যাপ্টারে](/notes/live-streaming/12-live-monitoring) একটা নতুন নিয়ম যোগ করুন।

## মূল শিক্ষা

1. উৎস থেকে দর্শক পর্যন্ত ফ্রেমের পথ ধরে এগোন; যেখানে "টাটকা" থেকে "স্টেল" হয়, সমস্যা ঠিক সেখানে।
2. দর্শকের প্লেয়ার থেকে শুরু করবেন না; লাইভে প্লেয়ারের সমস্যা প্রায় সবসময় উজানের ছায়া।
3. ভুল স্ট্রিম কী এনকোডারে "Broken pipe" দেখায়; সত্যিটা শুধু সার্ভারের auth লগে।
4. একই পাথে দুই এনকোডার একে অপরকে পালাক্রমে কাটে; প্রতিটা এনকোডারের নিজস্ব পাথ আর কী।
5. সবচেয়ে বিপজ্জনক ব্যর্থতা নীরব: প্লেলিস্ট ২০০ দেয় কিন্তু বদলায় না, বিশেষত ট্রান্সকোডার হঠাৎ মরলে যখন `ENDLIST` লেখা হয় না।
6. সেগমেন্টের হার স্বাভাবিক হলেও ছবি ঝাঁকুনি দিতে পারে, যদি ইনপুট ধীর আর ট্রান্সকোডার ফ্রেম ডুপ্লিকেট করছে; ইনজেস্ট বিটরেটও দেখুন।
7. লেটেন্সি ধীরে বাড়লে আগে প্লেয়ারের নিয়ম দেখুন: hls.js প্রতিবার আটকালে লক্ষ্য লেটেন্সি বাড়ায়।
8. রিস্টার্ট দর্শককে ফেরায়, মূল কারণ নয়; একবারে একটা পরিবর্তন করুন আর সব সময়সহ লিখে রাখুন।
