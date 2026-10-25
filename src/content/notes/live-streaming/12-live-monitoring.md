---
title: 'লাইভ মনিটরিং'
subtitle: 'ক্যামেরা থেকে দর্শক পর্যন্ত প্রতিটা লেয়ারে কী মাপবেন, কোনটায় রাত তিনটায় ফোন বাজবে আর কোনটা সকালে দেখলেও চলবে, আর একটা আসল স্ট্রিমে ইচ্ছা করে সমস্যা বাধিয়ে অ্যালার্টগুলো জ্বলতে দেখা।'
chapter: 12
level: 'mastery'
readingTime: '২৬ মিনিট'
topics: ['live streaming', 'monitoring', 'prometheus', 'alertmanager', 'mediamtx', 'srt', 'hls', 'go', 'runbook']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বর্ষার মাঝামাঝি। ঢাকার বন্যা পূর্বাভাস কেন্দ্রের কন্ট্রোল রুমে কিন্দি রাতের ডিউটিতে। দেয়ালের বোর্ডে ব্রহ্মপুত্রের পাড়ের গেজ স্টেশনগুলোর নাম: চিলমারী, বাহাদুরাবাদ, সেরাজগঞ্জ। প্রতিটা স্টেশন থেকে প্রতি তিন ঘণ্টায় পানির উচ্চতা আসে, আর প্রতিটার পাশে দুটো দাগ: "সতর্ক সীমা" আর "বিপদসীমা"। পানি সতর্ক সীমা ছুঁলে কিন্দি খাতায় লেখে আর সকালের রিপোর্টে তোলে। বিপদসীমা ছুঁলে সে তখনই ফোন তোলে, জেলা প্রশাসনকে জানায়, কারণ তখন দেরি মানে মানুষের ঘরে পানি।

সে রাতে একটা অদ্ভুত জিনিস ঘটে। চিলমারীর সংখ্যা ছয় ঘণ্টা ধরে একই: পানি একদম স্থির। নতুন কেউ হলে খুশি হতো, পানি তো বাড়ছে না। কিন্তু কিন্দি জানে, বর্ষায় ব্রহ্মপুত্রের পানি ছয় ঘণ্টা স্থির থাকে না। সংখ্যা বদলাচ্ছে না মানে পানি শান্ত নয়, মানে রিপোর্টই আসছে না: হয়তো গেজ রিডারের মোবাইলের চার্জ নেই, হয়তো রাস্তা ডুবে গেছে। "কোনো খবর নেই" তার কাছে সবচেয়ে বড় খারাপ খবর। সে উজানের বাহাদুরাবাদের সংখ্যা দেখে: সেখানে পানি দ্রুত বাড়ছে। অর্থাৎ চিলমারীর গেজ চুপ, অথচ নদী ফুলছে।

কিন্দি আরও একটা জিনিস জানে। এক রাতে পাঁচটা স্টেশন একসাথে লাল হলে পাঁচবার পাঁচজনকে ফোন করা অর্থহীন; সবগুলোর মূল কারণ একটাই, উজানের ভারী বৃষ্টি। তাই তার চেকলিস্টে লেখা: একটা কারণের জন্য একটা ফোন। আর বড় বন্যার মৌসুমের আগে সে প্রতিটা স্টেশনে ফোন করে দেখে নেয় রিডার আছে কিনা, ব্যাটারি আছে কিনা।

মিলিয়ে নিই: প্রতিটা গেজ স্টেশন হলো পাইপলাইনের একেকটা **লেয়ার** (ইনজেস্ট, ট্রান্সকোডার, প্যাকেজার, CDN, প্লেয়ার)। "সতর্ক সীমা"-য় খাতায় লেখা হলো **ticket অ্যালার্ট**, "বিপদসীমা"-য় সাথে সাথে ফোন হলো **page অ্যালার্ট**। ছয় ঘণ্টা একই সংখ্যা হলো **স্টেল প্লেলিস্ট**: সার্ভার ২০০ দিচ্ছে, প্লেলিস্ট দেখতে ঠিক, কিন্তু নতুন সেগমেন্ট আসছে না, আর এটাই লাইভের সবচেয়ে বিপজ্জনক নীরব ব্যর্থতা। উজানের স্টেশন দেখে নিচের স্টেশনের সমস্যা বোঝা হলো **লেয়ার মিলিয়ে দেখা** (origin ঠিক, edge স্টেল মানে সমস্যা CDN-এ)। এক কারণের জন্য এক ফোন হলো **inhibit rule**, আর মৌসুমের আগে প্রতিটা স্টেশনে ফোন করা হলো **ইভেন্টের আগের runbook**। বাস্তবে যেকোনো বড় খেলা বা নির্বাচনের রাতের লাইভ সম্প্রচার এই মডেলেই পাহারা দেওয়া হয়।

## লাইভ মনিটরিং কেন আলাদা

VOD-এ একটা এনকোডিং জব ব্যর্থ হলে আবার চালানো যায়; দর্শক হয়তো টেরই পায় না। লাইভে "আবার চালানো" নেই। খেলার শেষ ওভার একবারই হয়, আর সেই দুই মিনিট স্ট্রিম আটকে থাকলে সেটা আর ফেরত আসে না। তিনটা জিনিস তাই বদলায়:

- **সময়ের মাপ সেকেন্ডে।** VOD-এ পাঁচ মিনিটের অ্যালার্ট ঠিক আছে; লাইভে পাঁচ মিনিটে ইভেন্টের একটা অংশ চলে গেছে।
- **ব্যর্থতা প্রায়ই নীরব।** লাইভের বেশিরভাগ বড় সমস্যায় কোনো সার্ভার ৫০০ দেয় না। প্লেলিস্ট ২০০ দেয়, শুধু আর বদলায় না। HTTP এরর রেট দেখে আপনি সবুজ দেখবেন, আর দর্শক দেখবে ঘুরতে থাকা চাকা।
- **মনিটরিং ইভেন্টভিত্তিক।** একটা চ্যানেল ইভেন্টের সময় চুপ থাকলে বিপদ, ইভেন্টের বাইরে চুপ থাকাটাই স্বাভাবিক। অ্যালার্টকে জানতে হয় এখন ইভেন্ট চলছে কিনা।

কোয়ালিটি মেট্রিক (VMAF), QoE-র সংজ্ঞা আর ভিডিও সার্ভিসের SLO [ভিডিও ট্র্যাকের দশ নম্বর চ্যাপ্টারে](/notes/video/10-quality-and-monitoring) আছে; এখানে আমরা লাইভ পাইপলাইনের চলমান স্বাস্থ্য দেখব।

## পাঁচ লেয়ার, পাঁচটা প্রশ্ন

<Mermaid
title="প্রতিটা লেয়ারে কোন সংকেত কোথা থেকে আসে"
code={`graph LR
  ENC["Encoder"] --> ING["Ingest (MediaMTX)"]
  ING --> TR["Transcoder (ffmpeg)"]
  TR --> PK["Packager / origin"]
  PK --> CDN["Edge / CDN"]
  CDN --> PL["Player"]
  ING -.->|"/metrics: bitrate, SRT loss, RTT"| PROM["Prometheus"]
  TR -.->|"segment rate from playlist"| PROM
  PK -.->|"hlsprobe: newest segment age"| PROM
  CDN -.->|"hlsprobe per region, access logs"| PROM
  PL -.->|"QoE beacons, CMCD"| QOE["QoE store"]
  PROM --> AM["Alertmanager"]`}
/>

| লেয়ার | প্রশ্ন | কোথা থেকে মাপবেন | স্বাস্থ্যকর মান |
| --- | --- | --- | --- |
| ইনজেস্ট | এনকোডার কানেক্টেড? যথেষ্ট বিটরেট আসছে? নেটওয়ার্ক কতটা হারাচ্ছে? | MediaMTX `/metrics` আর Control API | কানেক্টেড, বিটরেট এনকোডার সেটিংয়ের কাছাকাছি, SRT drop শূন্য |
| ট্রান্সকোডার | রিয়েল-টাইমের সমান গতিতে চলছে? | প্লেলিস্টে নতুন সেগমেন্ট আসার হার, ffmpeg-এর `speed=` | প্রায় 1.0x, টানা |
| প্যাকেজার/origin | প্লেলিস্টে সময়মতো নতুন সেগমেন্ট আসছে? | origin থেকে প্লেলিস্ট পোল করা | শেষ সেগমেন্ট এক থেকে দুই টার্গেট ডিউরেশনের মধ্যে |
| CDN | edge কি origin-এর মতোই টাটকা? এরর? | প্রতিটা অঞ্চল থেকে edge-এর প্লেলিস্ট পোল, access log | origin-এর সাথে এক সেগমেন্টের বেশি ফারাক নয়; 4xx/5xx প্রায় শূন্য |
| প্লেয়ার | দর্শক কত দ্রুত শুরু করছে, কতক্ষণ আটকাচ্ছে, লাইভ এজ থেকে কত পেছনে? | প্লেয়ারের বিকন, CMCD | যোগ দেওয়ার সময় আর রিবাফার কম, লেটেন্সি লক্ষ্যের কাছাকাছি |

নিচে প্রতিটা লেয়ার আলাদা করে, [এগারো নম্বর চ্যাপ্টারের](/notes/live-streaming/11-build-a-live-pipeline) স্ট্যাকের উপর, আসল সংখ্যা দিয়ে। এই চ্যাপ্টারের সব আউটপুট **২০২৬ সালের অক্টোবরে** সেই স্ট্যাক (MediaMTX v1.21.2) আর Prometheus v3.15.1 চালিয়ে নেওয়া।

## ইনজেস্ট: MediaMTX যা বলে

এগারো নম্বর চ্যাপ্টারের কনফিগে `metrics: true` আছে। SRT দিয়ে একটা স্ট্রিম পাঠানোর সময় `/metrics`-এর প্রাসঙ্গিক লাইনগুলো (আসল আউটপুট, `id` লেবেল বাদ দিয়ে ছোট করা):

```text
paths{name="ingest/baytalhikma",state="ready"} 1
paths_readers{name="ingest/baytalhikma",readerType="rtspSession",state="ready"} 1
paths_inbound_bytes{name="ingest/baytalhikma",state="ready"} 9376969
paths_inbound_frames_in_error{name="ingest/baytalhikma",state="ready"} 0
srt_conns_ms_rtt{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 0.98
srt_conns_mbps_receive_rate{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 3.63
srt_conns_ms_receive_tsb_pd_delay{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 200
srt_conns_packets_received_loss_rate{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 0
srt_conns_packets_received_retrans{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 0
srt_conns_packets_received_drop{path="ingest/baytalhikma",remoteAddr="192.168.65.1:19050",state="publish"} 0
```

<Callout type="warning">

**মেট্রিকের নাম ভার্সনের সাথে বদলায়।** একই স্ট্রিম MediaMTX v1.15.6-এ চালালে বাইটের মেট্রিকের নাম ছিল `paths_bytes_received`; v1.21.2-এর ডকসে নাম `paths_inbound_bytes` (v1.21.2 এখনো পুরনো নামটাও পাঠায়, আমার রানে দুটোই ছিল)। অ্যালার্ট লেখার আগে নিজের ভার্সনের `/metrics` একবার `curl` করে আসল নামগুলো দেখে নিন; ভুল নামের অ্যালার্ট কখনো জ্বলে না, আর সেটা কেউ টের পায় না।

</Callout>

কোনটা কী বলে:

- **`paths` সিরিজ, `state="ready"` লেবেল সহ**: এনকোডার পাবলিশ করছে কিনা। এনকোডার চলে গেলে এই সিরিজটাই উধাও হয়ে যায়, শূন্য হয় না। তাই "চ্যানেল অফলাইন" ধরতে `absent()` লাগে (নিচে)।
- **`rate(paths_inbound_bytes[1m]) * 8`**: আসল ইনজেস্ট বিটরেট। এনকোডার ৩.৫ Mbps-এ সেট থাকলে আমার রানে এটা ছিল প্রায় ৩.৬৭ Mbit/s (অডিও আর কন্টেইনারের ওভারহেড সহ)। হঠাৎ অর্ধেক হয়ে যাওয়া মানে প্রায়ই ভেন্যুর আপলিংক দুর্বল হয়ে এনকোডার নিজে বিটরেট কমিয়েছে, বা OBS ফ্রেম ফেলছে।
- **`paths_inbound_frames_in_error`**: যে ফ্রেম MediaMTX পার্স করতে পারেনি। শূন্যের বেশি মানে এনকোডার বা নেটওয়ার্ক ভাঙা ডেটা পাঠাচ্ছে।
- **SRT-এর চারটা**: `ms_rtt` এনকোডার থেকে সার্ভার পর্যন্ত রাউন্ড ট্রিপ। `packets_received_loss` নেটওয়ার্কে হারানো প্যাকেট, যা SRT আবার চেয়ে নিতে পারে; `retrans` সেই আবার পাঠানো প্যাকেট। `packets_received_drop` হলো যা latency window-এর মধ্যে উদ্ধার করা যায়নি, অর্থাৎ ছবিতে সত্যিকারের গ্লিচ। loss বাড়া সতর্কতা, drop বাড়া বিপদ। SRT-এর latency window কত হওয়া উচিত (সাধারণ নিয়ম RTT-এর কয়েক গুণ), সেটা [দুই নম্বর চ্যাপ্টারে](/notes/live-streaming/02-contribution-protocols)।

একটা কানেকশনের পুরো ছবি Control API থেকে (`/v3/srt/conns/list`, `/v3/rtmp/conns/list`, `/v3/paths/list`) পাওয়া যায়; ইভেন্টের সময় কোন এনকোডার কোন IP থেকে কানেক্টেড, সেটা এখানে দেখবেন।

## ট্রান্সকোডার: রিয়েল-টাইমের সাথে তাল

লাইভ ট্রান্সকোডারের একটাই শর্ত: এক সেকেন্ডের ভিডিও এক সেকেন্ডের কম সময়ে বানাতে হবে ([পাঁচ নম্বর চ্যাপ্টারে](/notes/live-streaming/05-live-transcode-package) `speed=` পড়া শিখেছি)। ভেতর থেকে মাপতে ffmpeg-কে `-progress` দিয়ে একটা ফাইলে নিয়মিত অবস্থা লিখতে বলা যায়; আমার মেশিনে `-stats_period 2` দিয়ে পাওয়া অংশ:

```text
frame=167
fps=27.78
drop_frames=0
dup_frames=0
speed=0.915x
progress=continue
```

শুরুর কয়েক সেকেন্ড `speed` ১-এর নিচে থাকে, তারপর ১-এর কাছে স্থির হয়; একক মান দেখে অ্যালার্ট দেবেন না।

কিন্তু আমি ট্রান্সকোডারকে বাইরে থেকে মাপা পছন্দ করি, দর্শক যেখান থেকে দেখে সেখান থেকে: **প্লেলিস্টে প্রতি সেকেন্ডে কতগুলো নতুন সেগমেন্ট আসছে, গুণ সেগমেন্টের দৈর্ঘ্য।** ২ সেকেন্ডের সেগমেন্ট প্রতি ২ সেকেন্ডে একটা এলে মান 1.0। এটা ট্রান্সকোডার, প্যাকেজার আর ডিস্ক, তিনটারই সম্মিলিত গতি মাপে, আর ffmpeg-এর ভেতরে কিছু বসাতে হয় না।

আসল পরীক্ষা: স্বাভাবিক অবস্থায় এই মান ছিল `1.0087`। তারপর আমি MediaMTX-এর কন্টেইনারকে `docker update --cpus 0.35` দিয়ে CPU-র এক-তৃতীয়াংশে নামিয়ে দিলাম, যেন ছোট একটা VPS-এ বেশি চ্যানেল চাপানো হয়েছে। চার মিনিট পর:

```text
rate(hls_playlist_newest_segment[2m]) * hls_playlist_target_duration_seconds
  baytalhikma  0.487

ALERT LiveTranscoderBehind  firing  baytalhikma: pipeline running at 0.50x real time

# docker compose logs mediamtx
WAR [RTSP] [session 4506f9d3] reader is too slow, discarding 445 frames
WAR [RTSP] [session 4506f9d3] reader is too slow, discarding 447 frames
```

MediaMTX-এর লগের লাইনটা মনে রাখুন: `reader is too slow, discarding N frames` মানে ট্রান্সকোডার (MediaMTX-এর চোখে একজন পাঠক) যত দ্রুত পড়া দরকার তত দ্রুত পড়তে পারছে না, তাই MediaMTX ফ্রেম ফেলে দিচ্ছে। দর্শকের কাছে এটা লাফানো ছবি আর ক্রমশ বাড়তে থাকা দেরি।

<Callout type="tip">

**উল্টো পরীক্ষায় একটা ফাঁদ ধরা পড়েছিল।** প্রথমে আমি ট্রান্সকোডার ধীর করার বদলে এনকোডারকে ধীর করেছিলাম (`ffmpeg -readrate 0.85`, অর্থাৎ ইনপুট রিয়েল-টাইমের ৮৫% গতিতে)। ইনজেস্ট বিটরেট ঠিকই ৩.৬৭ থেকে ৩.১৩ Mbit/s-এ নামল, কিন্তু সেগমেন্টের হার রইল 1.0! ট্রান্সকোডারের লগে ছিল `More than 1000 frames duplicated`, আর MediaMTX-এর রেকর্ডারে `detected drift between recording duration and absolute time, resetting`। মানে ট্রান্সকোডার ফাঁক ভরাতে আগের ফ্রেম বারবার বসিয়ে সময়মতো সেগমেন্ট দিয়ে যাচ্ছিল: প্লেলিস্ট সুস্থ দেখায়, ভিডিও ঝাঁকুনি দেয়। শিক্ষা: সেগমেন্টের হার একা যথেষ্ট নয়, ইনজেস্ট বিটরেট আর ট্রান্সকোডারের `dup_frames`-ও দেখতে হয়।

</Callout>

## প্যাকেজার: স্টেল প্লেলিস্ট ধরা

লাইভের সবচেয়ে গুরুত্বপূর্ণ একটা সংখ্যা: **শেষবার নতুন সেগমেন্ট আসার পর কত সেকেন্ড গেছে।** কিন্দির চিলমারী গেজের মতো, প্লেলিস্ট ২০০ দিচ্ছে আর দেখতে ঠিক, কিন্তু না বদলালে দর্শক আটকে আছে।

`EXT-X-PROGRAM-DATE-TIME` থেকে "শেষ সেগমেন্ট কত পুরনো" হিসাব করা লোভনীয়, কিন্তু এটা প্যাকেজারের ঘড়ির উপর নির্ভর করে। আমার রানে ffmpeg-এর লেখা PDT আর আসল সময়ের ফারাক শুরুর দিকে প্রায় শূন্য, এমনকি সামান্য ঋণাত্মক এসেছিল, কারণ ffmpeg শুরুর সময় থেকে মিডিয়ার দৈর্ঘ্য যোগ করে PDT বানায়, আর শুরুতে জমে থাকা ফ্রেম দ্রুত পড়ে। আরেকটা পাবলিক টেস্ট স্ট্রিমে একই হিসাব দিয়েছিল ৮–১০ সেকেন্ড। দুটোর তুলনা অর্থহীন। তাই আমি নিজের ঘড়িতে মাপি: শেষ সেগমেন্টের নম্বর (`MEDIA-SEQUENCE` + সেগমেন্টের সংখ্যা − ১) কখন বদলেছিল। শুধু `MEDIA-SEQUENCE` দেখলে হবে না: স্ট্রিম শুরুর দিকে প্লেলিস্টের জানালা ভরতে থাকে, তখন `MEDIA-SEQUENCE` শূন্যে আটকে থাকে আর সেগমেন্ট শুধু যোগ হয়। আমার প্রথম স্ক্রিপ্ট ঠিক এই ভুল করে একটা সুস্থ স্ট্রিমকে স্টেল বলেছিল।

## একটা ছোট Go এক্সপোর্টার

এটা প্লেলিস্ট পোল করে আর Prometheus-এর টেক্সট ফরম্যাটে চারটা মেট্রিক দেয়, শুধু স্ট্যান্ডার্ড লাইব্রেরি দিয়ে:

```go
// hlsprobe polls live HLS media playlists and exposes Prometheus metrics.
package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type state struct {
	up        bool      // last fetch succeeded
	newest    int64     // number of the newest segment
	changedAt time.Time // when newest last increased
	target    float64
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing required env var %s", k)
	}
	return v
}

// newestSegment returns media-sequence + segment count - 1, and TARGETDURATION.
func newestSegment(body string) (int64, float64, error) {
	var seq, count int64
	var target float64
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		l := sc.Text()
		switch {
		case strings.HasPrefix(l, "#EXT-X-MEDIA-SEQUENCE:"):
			seq, _ = strconv.ParseInt(strings.TrimPrefix(l, "#EXT-X-MEDIA-SEQUENCE:"), 10, 64)
		case strings.HasPrefix(l, "#EXT-X-TARGETDURATION:"):
			target, _ = strconv.ParseFloat(strings.TrimPrefix(l, "#EXT-X-TARGETDURATION:"), 64)
		case strings.HasPrefix(l, "#EXTINF:"):
			count++
		}
	}
	if count == 0 || target == 0 {
		return 0, 0, fmt.Errorf("not a media playlist")
	}
	return seq + count - 1, target, nil
}

func main() {
	// TARGETS="baytalhikma=https://live.baytalhikma.org/hls/baytalhikma/720p/index.m3u8,..."
	targets := map[string]string{}
	for _, t := range strings.Split(mustEnv("TARGETS"), ",") {
		name, u, ok := strings.Cut(strings.TrimSpace(t), "=")
		if !ok {
			log.Fatalf("bad TARGETS entry %q, want name=url", t)
		}
		targets[name] = u
	}
	every, err := time.ParseDuration(mustEnv("INTERVAL"))
	if err != nil {
		log.Fatalf("bad INTERVAL: %v", err)
	}
	addr := mustEnv("LISTEN_ADDR")

	var mu sync.Mutex
	states := map[string]*state{}
	client := &http.Client{Timeout: 5 * time.Second}

	poll := func(name, u string) {
		st := &state{}
		mu.Lock()
		if old, ok := states[name]; ok {
			*st = *old
		}
		mu.Unlock()

		st.up = false
		resp, err := client.Get(u)
		if err == nil {
			b, rerr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK && rerr == nil {
				if n, target, perr := newestSegment(string(b)); perr == nil {
					st.up, st.target = true, target
					if n != st.newest {
						st.newest, st.changedAt = n, time.Now()
					}
				}
			}
		}
		mu.Lock()
		states[name] = st
		mu.Unlock()
	}

	go func() {
		for {
			for name, u := range targets {
				poll(name, u)
			}
			time.Sleep(every)
		}
	}()

	http.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		fmt.Fprintln(w, "# TYPE hls_playlist_up gauge")
		fmt.Fprintln(w, "# TYPE hls_playlist_seconds_since_new_segment gauge")
		fmt.Fprintln(w, "# TYPE hls_playlist_target_duration_seconds gauge")
		fmt.Fprintln(w, "# TYPE hls_playlist_newest_segment gauge")
		for name, st := range states {
			up := 0
			if st.up {
				up = 1
			}
			since := -1.0
			if !st.changedAt.IsZero() {
				since = time.Since(st.changedAt).Seconds()
			}
			fmt.Fprintf(w, "hls_playlist_up{channel=%q} %d\n", name, up)
			fmt.Fprintf(w, "hls_playlist_seconds_since_new_segment{channel=%q} %.1f\n", name, since)
			fmt.Fprintf(w, "hls_playlist_target_duration_seconds{channel=%q} %g\n", name, st.target)
			fmt.Fprintf(w, "hls_playlist_newest_segment{channel=%q} %d\n", name, st.newest)
		}
	})
	log.Printf("hlsprobe: %d targets every %s on %s", len(targets), every, addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
```

পার্সারটার জন্য একটা ছোট টেস্ট, যা শেষ সেগমেন্টের নম্বর আর master প্লেলিস্ট প্রত্যাখ্যান, দুটোই আটকে রাখে:

```go
package main

import "testing"

func TestNewestSegment(t *testing.T) {
	pl := "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:40\n#EXTINF:2.0,\na.m4s\n#EXTINF:2.0,\nb.m4s\n"
	n, target, err := newestSegment(pl)
	if err != nil || n != 41 || target != 2 {
		t.Fatalf("got %d %g %v, want 41 2 nil", n, target, err)
	}
	if _, _, err := newestSegment("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n"); err == nil {
		t.Fatal("master playlist must be rejected")
	}
}
```

চলমান স্ট্রিম আর থেমে যাওয়া স্ট্রিমে এর আউটপুট (আসল রান, দ্বিতীয়টা এনকোডার বন্ধ করার ২৫ সেকেন্ড পর):

```text
# live
hls_playlist_up{channel="baytalhikma"} 1
hls_playlist_seconds_since_new_segment{channel="baytalhikma"} 3.8
hls_playlist_target_duration_seconds{channel="baytalhikma"} 2

# encoder stopped
hls_playlist_up{channel="baytalhikma"} 1
hls_playlist_seconds_since_new_segment{channel="baytalhikma"} 18.3
hls_playlist_target_duration_seconds{channel="baytalhikma"} 2
```

দ্বিতীয় ব্লকে `up` এখনো 1। প্লেলিস্ট পাওয়া যাচ্ছে, ২০০ আসছে। শুধু HTTP দেখলে সব সবুজ।

**কোন প্লেলিস্ট পোল করবেন।** master নয়, একটা media প্লেলিস্ট; সবচেয়ে ছোট রেন্ডিশনেরটা ভালো, কারণ দুর্বল নেটওয়ার্কের দর্শক ওটাতেই থাকে। দুই জায়গা থেকে পোল করুন: সরাসরি origin, আর CDN-এর মাধ্যমে। origin টাটকা কিন্তু CDN স্টেল মানে সমস্যা ক্যাশিংয়ে, প্রায়ই প্লেলিস্টের ভুল TTL বা negative caching ([আট নম্বর চ্যাপ্টার](/notes/live-streaming/08-live-delivery-at-scale)); দুটোই স্টেল মানে সমস্যা origin বা তার আগে।

## একাধিক অঞ্চল থেকে

একটা CDN-এর একটা PoP অসুস্থ হলে শুধু সেই অঞ্চলের দর্শক আটকায়, আর আপনার অফিস থেকে চালানো প্রোব কিছুই দেখে না। তাই একই `hlsprobe` দুই-তিনটা ছোট VPS-এ চালান, ভিন্ন ভিন্ন অঞ্চলে (ধরুন ঢাকার কাছের একটা, সিঙ্গাপুর, ইউরোপ), প্রতিটা CDN URL পোল করবে। কেন্দ্রীয় Prometheus প্রতিটাকে স্ক্র্যাপ করবে আর একটা `region` লেবেল বসাবে। প্রোবের ঠিকানা পাবলিক ইন্টারনেটে খোলা না রেখে WireGuard-এর মতো একটা প্রাইভেট টানেলের ভেতর দিয়ে স্ক্র্যাপ করুন। অ্যালার্টে তখন `region` আসে, আর এক অঞ্চলের সমস্যা সব অঞ্চলের সমস্যা থেকে আলাদা করে চেনা যায়।

## CDN আর origin

প্রোবের বাইরে, origin আর নিজের edge-এর nginx access log সবচেয়ে সৎ সূত্র। লগ ফরম্যাটে ক্যাশ স্ট্যাটাস আর সময় যোগ করুন:

```nginx
log_format live '$time_iso8601 $status $upstream_cache_status '
                '$request_time $body_bytes_sent "$request_uri"';
access_log /var/log/nginx/live.log live;
```

তারপর দেখার জিনিস তিনটা: প্লেলিস্ট আর সেগমেন্টের 4xx/5xx আলাদা করে (প্লেলিস্টের 404 মানে প্রায়ই একটা চ্যানেল পুরোপুরি বন্ধ), সেগমেন্টের hit ratio (লাইভে ভিড়ের সময় এটা খুব বেশি হওয়া উচিত, কারণ সবাই একই সেগমেন্ট চায়), আর প্লেলিস্টের সময় (`$request_time`) অঞ্চলভিত্তিক। লগ থেকে মেট্রিক বানানোর পদ্ধতি আর CDN রেসপন্স পড়া [CDN ট্র্যাকের পাঁচ নম্বর চ্যাপ্টারে](/notes/cdn/05-reading-cdn-responses)।

## প্লেয়ার: শেষ মাইল

সার্ভারের সব মেট্রিক সবুজ থাকার পরেও দর্শক কষ্ট পেতে পারে: একটা নির্দিষ্ট মোবাইল অপারেটরের নেটওয়ার্কে, বা একটা পুরনো স্মার্ট TV-তে। এটা শুধু প্লেয়ার থেকেই দেখা যায়। প্লেয়ারের বিকন কীভাবে বানাবেন, মেট্রিকগুলোর সঠিক সংজ্ঞা আর CMCD দিয়ে প্লেয়ারের রিকোয়েস্টকে CDN-এর লগের সাথে মেলানো [ভিডিও প্লেয়ার ট্র্যাকের এগারো নম্বর চ্যাপ্টারে](/notes/video-player/11-qoe-analytics)। লাইভে তিনটা জিনিস বাড়তি দেখবেন:

- **লাইভ এজ থেকে দূরত্ব।** hls.js-এ `hls.latency`; এর বিতরণ (median আর p95) ইভেন্ট জুড়ে বাড়তে থাকলে প্লেয়াররা পিছিয়ে পড়ছে। কারণগুলো [ডিবাগিং প্লেবুকে](/notes/live-streaming/13-debugging-playbook)।
- **একসাথে কতজন দেখছে।** বিকনের সেশন গুনে। এটা ফ্ল্যাশ ক্রাউডের আগাম সংকেত, আর ইভেন্ট শেষে খরচের হিসাবের ভিত্তি।
- **যোগ দেওয়ার ব্যর্থতা।** যারা প্লে চাপল কিন্তু প্রথম ফ্রেম কখনো দেখল না। লাইভে এটা বাড়ে ঠিক যখন অনেকে একসাথে যোগ দেয়, যেমন খেলা শুরুর মুহূর্তে।

## Prometheus আর অ্যালার্টের নিয়ম

স্ক্র্যাপ কনফিগ সোজা। এখানে `host.docker.internal` শুধু আমার পরীক্ষার জন্য; আপনার সার্ভারে MediaMTX আর প্রোবের আসল ঠিকানা দিন:

```yaml
# prometheus.yml
global:
  scrape_interval: 5s
  evaluation_interval: 5s
rule_files: [/etc/prometheus/live-rules.yml, /etc/prometheus/event-rules.yml]
scrape_configs:
  - job_name: mediamtx
    static_configs: [{ targets: ["mediamtx:9998"] }]
  - job_name: hlsprobe
    static_configs: [{ targets: ["hlsprobe:9101"] }]
```

লাইভে স্ক্র্যাপ আর মূল্যায়ন ৫ সেকেন্ড; ডিফল্ট এক মিনিট দিয়ে স্টেল প্লেলিস্ট ধরতে ধরতে ইভেন্টের একটা অংশ চলে যাবে।

```yaml
# live-rules.yml
groups:
  - name: live
    rules:
      # Page: viewers are already affected.
      - alert: LivePlaylistStale
        expr: hls_playlist_seconds_since_new_segment > 3 * hls_playlist_target_duration_seconds
        for: 15s
        labels: { severity: page }
        annotations:
          summary: "{{ $labels.channel }}: no new segment for {{ $value | humanizeDuration }}"

      - alert: LivePlaylistUnreachable
        expr: hls_playlist_up == 0
        for: 30s
        labels: { severity: page }
        annotations:
          summary: "{{ $labels.channel }}: playlist fetch failing from the probe"

      # Segments produced per wall-clock second, times segment length: about 1.0 when healthy.
      - alert: LiveTranscoderBehind
        expr: rate(hls_playlist_newest_segment[2m]) * hls_playlist_target_duration_seconds < 0.95
        for: 2m
        labels: { severity: page }
        annotations:
          summary: "{{ $labels.channel }}: pipeline running at {{ $value | printf \"%.2f\" }}x real time"

      # Ticket: something is degrading, nobody is affected yet.
      - alert: LiveIngestBitrateLow
        expr: rate(paths_inbound_bytes{name=~"ingest/.+"}[1m]) * 8 < 1.5e6
        for: 1m
        labels: { severity: ticket }
        annotations:
          summary: "{{ $labels.name }}: ingest at {{ $value | humanize }}bit/s"

      - alert: LiveSrtLoss
        expr: rate(srt_conns_packets_received_loss[1m]) > 5
        for: 2m
        labels: { severity: ticket }
        annotations:
          summary: "{{ $labels.path }}: SRT losing {{ $value | humanize }} packets/s before retransmission"

      - alert: LiveSrtUnrecoverableDrop
        expr: increase(srt_conns_packets_received_drop[1m]) > 0
        labels: { severity: page }
        annotations:
          summary: "{{ $labels.path }}: SRT dropped packets it could not recover in time"
```

`promtool check rules` এই ফাইলে `SUCCESS: 6 rules found` বলেছে। থ্রেশহোল্ডগুলো আমাদের ২ সেকেন্ডের সেগমেন্ট আর ৩.৫ Mbps এনকোডারের জন্য; নিজের সেটআপে স্বাভাবিক অবস্থার মান কয়েকটা রিহার্সালে দেখে তারপর ঠিক করুন।

তিনটা নিয়মের পেছনের যুক্তি:

- **স্টেল = টার্গেটের তিন গুণ, ১৫ সেকেন্ড ধরে।** একটা সেগমেন্ট একটু দেরিতে আসা স্বাভাবিক; তিনটা সেগমেন্টের সময় পেরিয়ে যাওয়া মানে hls.js-এর ডিফল্ট বাফার (তিন সেগমেন্ট পেছনে থাকা) প্রায় শেষ, দর্শক আটকানো শুরু করেছে।
- **গতি 0.95-এর নিচে, দুই মিনিট ধরে।** জানালা ছোট হলে শুরুর ধীরগতি আর ছোটখাটো ঝাঁকুনিতে মিথ্যা অ্যালার্ট আসে। 0.95x-এ চললে প্রতি মিনিটে তিন সেকেন্ড পিছিয়ে পড়া, এক ঘণ্টার ম্যাচে তিন মিনিট।
- **SRT loss টিকিট, drop পেজ।** loss মানে SRT এখনো সামলাচ্ছে, latency window কাজ করছে; drop মানে সামলাতে পারেনি, ছবি ভেঙেছে।

## ইভেন্ট মোড: "চ্যানেল নেই" কখন বিপদ

এনকোডার পাবলিশ বন্ধ করলে `paths` সিরিজ উধাও হয়ে যায়, তাই সাধারণ থ্রেশহোল্ড কখনো জ্বলে না; লাগে `absent()`। কিন্তু চ্যানেল ইভেন্টের বাইরে বন্ধ থাকাই স্বাভাবিক, আর তখন প্রোবের প্লেলিস্টও স্টেল বা 404। সমাধানটা সাধারণ: প্রতিটা নির্ধারিত ইভেন্টের জন্য একটা আলাদা রুল ফাইল, যা ইভেন্টের আগে যোগ হয় আর শেষে সরে যায়, আর প্রোবের `TARGETS`-এও শুধু তখন সেই চ্যানেল থাকে।

```yaml
# event-rules.yml (added before the event, removed after)
groups:
  - name: event-baytalhikma
    rules:
      - alert: LiveChannelOffline
        expr: absent(paths{name="ingest/baytalhikma",state="ready"})
        for: 20s
        labels: { severity: page, channel: baytalhikma }
        annotations:
          summary: "baytalhikma: no encoder is publishing during a scheduled event"
```

ফাইল যোগ করা আর সরানো আপনার ইভেন্ট শিডিউলিং সিস্টেম থেকে স্বয়ংক্রিয় হওয়া উচিত; হাতে করলে একদিন কেউ ভুলবে।

## আসল পরীক্ষা: অ্যালার্টগুলো জ্বলছে কিনা

একটা অ্যালার্ট যা কখনো জ্বলতে দেখেননি, তার উপর ভরসা করবেন না। উপরের CPU-কম পরীক্ষার পর আমি এনকোডার পুরোপুরি বন্ধ করলাম আর ৪৫ সেকেন্ড পর Prometheus-এর `/api/v1/alerts` দেখলাম:

```text
LivePlaylistStale    page    firing   baytalhikma: no new segment for 31.6s
LiveTranscoderBehind page    firing   baytalhikma: pipeline running at 0.40x real time
LiveIngestBitrateLow ticket  pending  ingest/baytalhikma: ingest at 901.2kbit/s
```

event-rules যোগ করার পর একই অবস্থায়:

```text
LivePlaylistStale    firing
LiveTranscoderBehind pending
LiveChannelOffline   firing
```

সবগুলো ঠিকঠাক জ্বলছে, কিন্তু একটা সমস্যা দেখা গেল: একটাই কারণ (এনকোডার নেই), অথচ দুই-তিনটা পেজ। রাত তিনটায় তিনটা ফোন মানে অন-কল মানুষটা প্রথম দুই মিনিট বুঝতে খরচ করবে কোনটা আসল। এখানেই কিন্দির "এক কারণের জন্য এক ফোন" নিয়ম লাগে।

## Alertmanager: কাকে, কখন, কতবার

```yaml
# alertmanager.yml
route:
  receiver: ticket
  group_by: [alertname, channel]
  group_wait: 10s
  repeat_interval: 30m
  routes:
    - matchers: [severity="page"]
      receiver: oncall-phone
      group_wait: 0s
      repeat_interval: 5m
receivers:
  - name: oncall-phone
    webhook_configs:
      - url: http://ntfy:80/live-oncall   # self-hosted ntfy pushes to the on-call phone
  - name: ticket
    webhook_configs:
      - url: http://ntfy:80/live-tickets
inhibit_rules:
  # One root cause, one page: a missing encoder explains the stale playlist, which explains the slow rate.
  - source_matchers: [alertname="LiveChannelOffline"]
    target_matchers: [alertname=~"LivePlaylistStale|LiveTranscoderBehind"]
    equal: [channel]
  - source_matchers: [alertname="LivePlaylistStale"]
    target_matchers: [alertname="LiveTranscoderBehind"]
    equal: [channel]
```

`amtool check-config` (Alertmanager v0.34.1) এটাকে `SUCCESS` বলেছে, ২টা inhibit rule সহ। inhibit rule-গুলো কারণের ক্রম মেনে চলে: এনকোডার না থাকা প্লেলিস্ট স্টেল হওয়াকে ব্যাখ্যা করে, আর স্টেল প্লেলিস্ট ধীর গতিকে। তাই উপরের পরীক্ষায় অন-কল একটাই পেজ পাবে, সবচেয়ে মূল কারণটার। পেজের জন্য `group_wait: 0s` কারণ লাইভে দশ সেকেন্ডও দামি।

পেজ কোথায় যাবে, সেটা আপনার পছন্দ; উদাহরণে একটা সেলফ-হোস্টেড ntfy সার্ভার, যা ফোনে পুশ পাঠায়। Alertmanager-এর webhook একটা JSON বডি পাঠায়; আপনার পুশ সার্ভিস সেটা কীভাবে দেখায়, তা সেই সার্ভিসের ডকসে মিলিয়ে নিন। আসল কথা হলো পেজ আর টিকিট দুই আলাদা চ্যানেলে যায়, যাতে টিকিটের ভিড়ে পেজ চাপা না পড়ে।

## ড্যাশবোর্ডে কী রাখবেন

Grafana (সেলফ-হোস্টেড) ড্যাশবোর্ডে প্রতি চ্যানেলে একটা সারি, বাম থেকে ডানে পাইপলাইনের ক্রমে, যাতে চোখ ফ্রেমের পথ ধরে চলে:

1. **ইনজেস্ট**: পাবলিশ করছে কিনা (সবুজ/লাল), ইনজেস্ট বিটরেট, SRT RTT, loss আর drop।
2. **ট্রান্সকোডার**: সেগমেন্টের হার × দৈর্ঘ্য (১.০ রেখা সহ), কন্টেইনারের CPU।
3. **প্যাকেজার**: শেষ সেগমেন্টের পর সেকেন্ড, origin আর প্রতিটা অঞ্চলের CDN পাশাপাশি।
4. **CDN**: প্লেলিস্ট আর সেগমেন্টের 4xx/5xx, hit ratio।
5. **প্লেয়ার**: একসাথে দর্শক, যোগ দেওয়ার সময়ের p95, রিবাফার অনুপাত, লাইভ এজ থেকে দূরত্বের median আর p95।

সবচেয়ে উপরে একটা বড় সংখ্যা: এই মুহূর্তে কতগুলো চ্যানেলের প্লেলিস্ট টাটকা, মোটের মধ্যে কতগুলো। ইভেন্টের সময় দেয়ালের পর্দায় এটুকু থাকলেই প্রথম দশ সেকেন্ডে বোঝা যায় কোথায় তাকাতে হবে।

## ইভেন্টের দিনের runbook

কিন্দি বন্যার মৌসুমের আগে প্রতিটা স্টেশনে ফোন করে। বড় লাইভের আগে এই তালিকা:

**২৪ ঘণ্টা আগে**
- event-rules আর প্রোবের `TARGETS` যোগ হয়েছে কিনা দেখুন।
- একটা টেস্ট এনকোডার চালিয়ে প্রতিটা অ্যালার্ট একবার ইচ্ছা করে জ্বালান: এনকোডার বন্ধ (offline), CPU কমানো (behind)। পেজ আসলেই অন-কলের ফোনে বাজছে কিনা নিশ্চিত হন।
- ব্যাকআপ এনকোডার আর ব্যাকআপ ইনজেস্টের পথ ([নয় নম্বর চ্যাপ্টার](/notes/live-streaming/09-reliability)) পরীক্ষা করুন।
- রেকর্ডিং ডিস্কে কতটা জায়গা আছে।

**১ ঘণ্টা আগে**
- ভেন্যুর এনকোডার কানেক্ট করুন, ঘড়ি বসানো টেস্ট প্যাটার্ন পাঠান; প্রতিটা অঞ্চল থেকে প্লেলিস্ট টাটকা, লেটেন্সি মাপা।
- ইনজেস্ট বিটরেট, SRT RTT আর loss-এর এই মুহূর্তের মান লিখে রাখুন; পরে তুলনার ভিত্তি।
- অন-কল কে, তার ব্যাকআপ কে, যোগাযোগের একটা চ্যাট চ্যানেল।

**ইভেন্টের সময়**
- পেজ এলে প্রথমে ড্যাশবোর্ডের বাম থেকে ডানে: কোন লেয়ারে প্রথম লাল।
- কোনো পরিবর্তন (রিস্টার্ট, ফেইলওভার) করার আগে চ্যাটে এক লাইনে লিখুন, সময়সহ। পরে টাইমলাইন বানাতে এটাই লাগবে।
- [ডিবাগিং প্লেবুক](/notes/live-streaming/13-debugging-playbook) খোলা রাখুন।

**শেষে**
- event-rules আর প্রোবের টার্গেট সরান, নইলে রাতে মিথ্যা পেজ।
- রেকর্ডিং S3-তে উঠেছে কিনা।
- কী জ্বলেছে, কী জ্বলা উচিত ছিল কিন্তু জ্বলেনি, এক পাতায় লিখুন। যে সমস্যা দর্শক টের পেয়েছে অথচ অ্যালার্ট দেয়নি, সেটাই পরের অ্যালার্ট।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন কীভাবে | সমাধান |
| --- | --- | --- |
| দর্শক আটকে, অথচ কোনো অ্যালার্ট নেই | প্রোবের `/metrics`-এ `seconds_since_new_segment` আর Prometheus-এর targets পেজ | প্রোব কি CDN URL পোল করছে নাকি শুধু origin? স্ক্র্যাপ ব্যর্থ? মেট্রিকের নাম ভার্সন অনুযায়ী ঠিক? |
| একটা অ্যালার্ট কখনো জ্বলে না | Prometheus-এর Graph পাতায় অ্যালার্টের `expr` চালান; ফাঁকা ফল আসে? | মেট্রিকের নাম বা লেবেল ভুল; নিজের ভার্সনের `/metrics` থেকে আসল নাম বসান |
| এনকোডার বন্ধ, কিন্তু "offline" অ্যালার্ট নেই | `paths` সিরিজটা আছে কিনা | সিরিজ উধাও হয়, শূন্য হয় না; `absent()` লাগবে |
| প্রতি রাতে মিথ্যা পেজ | কোন অ্যালার্ট, কোন সময়ে | ইভেন্ট শেষে event-rules আর প্রোবের টার্গেট সরানো হয়নি |
| একটা সমস্যায় তিনটা পেজ | Alertmanager-এর UI-তে একই `channel`-এ একাধিক firing | inhibit rule যোগ করুন, কারণের ক্রমে |
| সেগমেন্টের হার 1.0, কিন্তু ছবি ঝাঁকুনি দেয় | ইনজেস্ট বিটরেট কমেছে? ট্রান্সকোডারের লগে `frames duplicated`? | এনকোডার বা ভেন্যুর নেটওয়ার্ক রিয়েল-টাইমের চেয়ে ধীরে পাঠাচ্ছে; সেখানে খুঁজুন |
| `LiveTranscoderBehind` জ্বলছে | MediaMTX লগে `reader is too slow`; কন্টেইনারের CPU | চ্যানেল কমান, রেন্ডিশন কমান, preset দ্রুত করুন, বা বড় সার্ভার |
| SRT loss বেশি, কিন্তু drop শূন্য | `srt_conns_ms_rtt` আর loss-এর হার | এখনো সামলাচ্ছে; ভেন্যুর নেটওয়ার্ক দেখুন, দরকারে latency window বাড়ান |
| SRT drop শূন্যের বেশি | একই সাথে RTT আর loss | latency window RTT-এর তুলনায় ছোট; বাড়ান, বা এনকোডারের বিটরেট কমান |
| এক অঞ্চলের প্রোব স্টেল, বাকিগুলো ঠিক | সেই অঞ্চল থেকে edge-এর প্লেলিস্ট `curl -I`, `age` আর ক্যাশ স্ট্যাটাস | CDN-এর সেই PoP; প্লেলিস্টের TTL আর 404 negative caching দেখুন |

## মূল শিক্ষা

1. লাইভের সবচেয়ে বিপজ্জনক ব্যর্থতা নীরব: প্লেলিস্ট ২০০ দেয় কিন্তু বদলায় না। "শেষ নতুন সেগমেন্টের পর কত সেকেন্ড" সবার আগে মাপুন।
2. সেই সময় নিজের ঘড়িতে মাপুন, প্যাকেজারের `PROGRAM-DATE-TIME` দিয়ে নয়; আর শুধু `MEDIA-SEQUENCE` নয়, শেষ সেগমেন্টের নম্বর দেখুন।
3. ট্রান্সকোডারের গতি বাইরে থেকে মাপা যায়: প্রতি সেকেন্ডে নতুন সেগমেন্ট × দৈর্ঘ্য, সুস্থ হলে প্রায় 1.0। তবে ইনপুট ধীর হলে ট্রান্সকোডার ফ্রেম ডুপ্লিকেট করে সেটা লুকিয়ে ফেলে, তাই ইনজেস্ট বিটরেটও দেখুন।
4. origin আর প্রতিটা অঞ্চলের CDN দুই জায়গা থেকেই পোল করুন; কোথায় টাটকা আর কোথায় স্টেল, সেটাই বলে সমস্যা কোন লেয়ারে।
5. দর্শক এখনই কষ্ট পাচ্ছে হলে page, খারাপ হচ্ছে কিন্তু কেউ টের পায়নি হলে ticket। SRT loss টিকিট, drop পেজ।
6. "চ্যানেল নেই" শুধু ইভেন্টের সময় বিপদ; event-rules ইভেন্টের সাথে যোগ হয় আর সরে যায়, আর এনকোডার গেলে মেট্রিক উধাও হয় বলে `absent()` লাগে।
7. এক কারণের জন্য এক পেজ: inhibit rule কারণের ক্রমে সাজান।
8. যে অ্যালার্ট কখনো জ্বলতে দেখেননি তার উপর ভরসা নেই; প্রতিটা বড় ইভেন্টের আগে ইচ্ছা করে সমস্যা বাধিয়ে জ্বালিয়ে দেখুন।
