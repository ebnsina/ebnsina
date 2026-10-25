---
title: 'ইনজেস্ট ও প্রোবিং: ফাইলটা আসলে কী'
subtitle: 'আপলোড হওয়া ফাইল এনকোডারে পাঠানোর আগে খুলে দেখা: ffprobe-এর JSON-এর প্রতিটা দরকারি ফিল্ড, বাস্তবের অদ্ভুত ফাইল, কোনটা বাতিল আর কোনটা ঠিক করে নেবেন, আর Go দিয়ে একটা নিরাপদ প্রোব।'
chapter: 3
level: 'intermediate'
readingTime: '১৯ মিনিট'
topics: ['ingest', 'ffprobe', 'validation', 'vfr', 'rotation', 'hdr', 'corrupt files']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ভোর চারটায় কারওয়ান বাজারের মাছের আড়তে ট্রাক ঢোকে চাঁদপুর, খুলনা আর কক্সবাজার থেকে। আড়তের গেটে বসে কিন্দি, বাজার কমিটির মাছ পরীক্ষক। প্রতিটা ঝুড়ি বিক্রির তাকে ওঠার আগে তার হাত দিয়ে যায়। ঝুড়ির গায়ে লেখা "ইলিশ, ২০ কেজি", কিন্তু কিন্দি লেখা বিশ্বাস করে না। সে ঝুড়ি ওজন করে, কয়েকটা মাছ তুলে কানকো খুলে দেখে লাল কিনা, চোখ পরিষ্কার কিনা, পেট চেপে দেখে নরম কিনা, আর ফরমালিনের গন্ধ আছে কিনা শোঁকে।

ঝুড়িগুলো তিন ভাগে যায়। কিছু ঝুড়ি একদম ঠিক, সরাসরি তাকে। কিছু ঝুড়িতে মাছ ভালো কিন্তু সাজানো উল্টাপাল্টা, বা বরফ গলে গেছে; কিন্দি সেগুলো পাশের ঘরে পাঠায়, যেখানে ফারাবি নতুন বরফ দিয়ে সাজিয়ে দেয়, তারপর তাকে ওঠে। আর কিছু ঝুড়ি পচা, বা ঝুড়ির অর্ধেক খালি, ওপরে কয়েকটা ভালো মাছ দিয়ে ঢাকা। সেগুলো কিন্দি সোজা ফেরত পাঠায়, আর ব্যাপারীকে একটা স্লিপে লিখে দেয় ঠিক কী সমস্যা: "নিচের স্তর পচা।"

কিন্দি জানে, ওপরের দুটো মাছ দেখেই পুরো ঝুড়ি ভালো ধরে নেওয়া সবচেয়ে বড় ভুল। একবার সে তাড়াহুড়োয় শুধু ওপরটা দেখে একটা ঝুড়ি পাস করেছিল, আর দুপুরে এক ক্রেতা ফেরত এসে চিৎকার করেছিল। তারপর থেকে সে সন্দেহজনক ঝুড়ি পুরো উল্টে দেখে, সময় বেশি লাগলেও। আর কোনো ঝুড়ি দেখতে যদি খুব বেশি সময় লাগে, সে সেটা আটকে রাখে না, একটা নির্দিষ্ট সময় পর পাশে সরিয়ে রেখে পরেরটা ধরে, যাতে গেটে লাইন না জমে।

মিলিয়ে নিই: আড়তের গেট হলো **ইনজেস্ট**, আর কিন্দির পরীক্ষা হলো **প্রোবিং**। ঝুড়ির গায়ের লেখা হলো ফাইলের **এক্সটেনশন আর Content-Type**, যা কিছু প্রমাণ করে না। কানকো, চোখ, পেট দেখা হলো **ffprobe-এর স্ট্রিম আর ফরম্যাট ফিল্ড**: কোডেক, রেজোলিউশন, ফ্রেম রেট, অডিও। তিন ভাগ হলো **পাস, নরমালাইজ, রিজেক্ট**, আর ফারাবির নতুন করে সাজানো হলো **নরমালাইজেশন** (রোটেশন ঠিক করা, ফ্রেম রেট স্থির করা)। ব্যাপারীর স্লিপ হলো **স্থির error code**। ওপরে ভালো মাছ, নিচে পচা হলো এমন ফাইল যার **হেডার ঠিক কিন্তু ভেতরে ভাঙা**, যা শুধু **পুরো ডিকোড চেক** দিয়ে ধরা পড়ে। আর সময় পার হলে পাশে সরিয়ে রাখা হলো **প্রোবের টাইমআউট**। প্রতিটা VOD প্ল্যাটফর্ম ঠিক এই গেটটা চালায়, কারণ এনকোডারে ঢোকার পর একটা ভাঙা ফাইল পুরো ওয়ার্কার ফ্লিট আটকে দিতে পারে।

## কেন ইনজেস্ট আলাদা ধাপ

এনকোডার নিজেই তো ফাইল খুলবে, তাহলে আগে আলাদা করে দেখার দরকার কী? চারটা কারণ:

1. **দ্রুত ব্যর্থতা:** অডিও নেই বা ফাইল ভাঙা, এটা পাঁচ সেকেন্ডে জানা যায়। এনকোডিং শুরু করে বিশ মিনিট পরে জানলে বিশ মিনিটের CPU নষ্ট, আর ইউজার বিশ মিনিট অপেক্ষা করল।
2. **পরিকল্পনা:** কোন রেন্ডিশন বানাবেন সেটা সোর্সের উপর নির্ভর করে। ৭২০p সোর্স থেকে ১০৮০p বানানো মানে বড় ফাইল, একই কোয়ালিটি। bitrate ladder-এর এই সিদ্ধান্ত [bitrate ladder](/notes/video/05-bitrate-ladder) চ্যাপ্টারে; সেটার ইনপুট আসে এখান থেকে।
3. **নরমালাইজেশনের সিদ্ধান্ত:** রোটেশন, VFR, HDR, ইন্টারলেস, এগুলো এনকোড কমান্ড বদলে দেয়।
4. **ইউজারকে সৎ উত্তর:** "ফাইলটায় কোনো ভিডিও স্ট্রিম নেই" বলা যায়, "এনকোডিং ব্যর্থ" এর চেয়ে অনেক ভালো।

<Mermaid
title="ইনজেস্টের সিদ্ধান্ত"
code={`graph TD
  U["upload finished"] --> P["ffprobe JSON<br/>with timeout"]
  P -->|"probe fails"| R1["reject: source_unreadable"]
  P --> V{"has a video stream?"}
  V -->|"no"| R2["reject: source_no_video_stream"]
  V --> L{"within product limits?<br/>duration, resolution"}
  L -->|"no"| R3["reject: source_too_long / too_large"]
  L --> D["full decode check<br/>ffmpeg -xerror"]
  D -->|"errors"| R4["reject: source_corrupt"]
  D --> N["build normalization plan<br/>rotate, cfr, tonemap, deinterlace"]
  N --> E["enqueue encode jobs"]`}
/>

## ffprobe: আসল আউটপুট পড়া

ffprobe হলো ffmpeg-এর সাথে আসা ফাইল-পরীক্ষক। মেশিনে পড়ার জন্য সবসময় JSON চান:

```bash
ffprobe -v error -print_format json -show_format -show_streams lecture-07.mp4
```

নিচের আউটপুটটা ffmpeg 9 দিয়ে বানানো একটা টেস্ট ফাইলের আসল আউটপুট, ছোট করে দেখানো:

```json
{
  "streams": [
    {
      "index": 0,
      "codec_name": "h264",
      "profile": "High",
      "codec_type": "video",
      "mime_codec_string": "avc1.640028",
      "width": 1920,
      "height": 1080,
      "pix_fmt": "yuv420p",
      "level": 40,
      "field_order": "progressive",
      "r_frame_rate": "30/1",
      "avg_frame_rate": "30/1",
      "duration": "6.000000",
      "bit_rate": "6367648",
      "nb_frames": "180",
      "side_data_list": [
        {
          "side_data_type": "Display Matrix",
          "rotation": 90
        }
      ]
    },
    {
      "index": 1,
      "codec_name": "aac",
      "profile": "LC",
      "codec_type": "audio",
      "sample_rate": "48000",
      "channels": 2,
      "channel_layout": "stereo",
      "duration": "6.000000"
    }
  ],
  "format": {
    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration": "6.000000",
    "size": "4879794",
    "bit_rate": "6506392"
  }
}
```

### যে ফিল্ডগুলো আপনার দরকার

| ফিল্ড | কী বলে | কী সিদ্ধান্ত নেয় |
| --- | --- | --- |
| `codec_type` | `video`, `audio`, `subtitle`, `data` | ভিডিও স্ট্রিম আছে কিনা; অডিও আছে কিনা |
| `codec_name`, `profile` | `h264` High, `hevc` Main 10, `prores`, `vp9` | ডিকোড করা যাবে কিনা; সোর্স 10-bit কিনা |
| `width`, `height` | কোডেড আকার | ladder-এর সর্বোচ্চ ধাপ |
| `side_data_list[].rotation` | ফোন কোন দিকে ধরা ছিল | আসল প্রদর্শিত আকার (৯০ বা -৯০ হলে width/height অদলবদল) |
| `pix_fmt` | `yuv420p`, `yuv420p10le`, `yuv422p` | 8-bit না 10-bit; ক্রোমা সাবস্যাম্পলিং |
| `color_transfer`, `color_primaries` | `bt709`, `smpte2084` (PQ), `arib-std-b67` (HLG) | HDR কিনা |
| `field_order` | `progressive`, `tt`, `bb` | ইন্টারলেসড কিনা |
| `r_frame_rate` বনাম `avg_frame_rate` | নিচে দেখুন | VFR কিনা |
| `format.duration` | সেকেন্ডে দৈর্ঘ্য | প্রোডাক্টের সীমা, খরচের হিসাব |
| `sample_rate`, `channels`, `channel_layout` | `48000`, `2`, `stereo` বা `5.1` | অডিও নরমালাইজেশন |
| `mime_codec_string` | `avc1.640028` | (নতুন ffprobe-এ) ম্যানিফেস্টের `CODECS` স্ট্রিং বানাতে কাজে লাগে |

ফিল্ডের নাম আর মান ffprobe-এর ভার্সনভেদে একটু বদলায়: উপরের `mime_codec_string` নতুন ভার্সনে আছে, পুরনোতে নেই, আর রোটেশন পুরনো ভার্সনে `tags.rotate` হিসেবে আসত, নতুনে `side_data_list`-এ। তাই প্রোডাকশনে যে ffprobe চালাবেন, সেটার ভার্সন পিন করুন আর তার আউটপুট দেখে পার্সার লিখুন (২০২৬ সালের অক্টোবরে ffmpeg 9.0.2 দিয়ে যাচাই করা)।

<Callout type="tip">

`duration` বা `bit_rate` প্রায়ই স্ট্রিম-লেভেলে থাকে না (MKV, WebM-এ বিশেষ করে)। সবসময় আগে স্ট্রিমের মান, না পেলে `format`-এর মান নিন। আর সব সংখ্যাই JSON-এ স্ট্রিং হিসেবে আসে (`"6.000000"`), তাই পার্স করার সময় সাবধান।

</Callout>

## বাস্তবের ফাইল দেখতে কেমন

টেস্ট ফাইল সবসময় সুন্দর। ইউজারের ফাইল না। যেগুলো নিয়মিত আসে:

### ১. ফোনে তোলা, কাত হয়ে থাকা

ফোন ভিডিওর পিক্সেল সবসময় সেন্সরের দিকে লেখে (১৯২০×১০৮০), আর একটা ডিসপ্লে ম্যাট্রিক্সে বলে দেয় "দেখানোর সময় ৯০ ডিগ্রি ঘোরাও"। ffprobe-এ এটা `side_data_list`-এ `"rotation": 90` বা `-90`। প্লেয়ার আর ffmpeg সাধারণত এটা মেনে চলে, কিন্তু আপনার ladder-এর হিসাব যদি `width`/`height` সরাসরি নেয়, একটা খাড়া ভিডিওকে আপনি ১৯২০ চওড়া ধরে ভুল রেন্ডিশন বানাবেন।

```go
// Display size, after applying the rotation the player will apply.
func displaySize(w, h, rotation int) (int, int) {
	if rotation%180 != 0 {
		return h, w
	}
	return w, h
}
```

ffmpeg এনকোড করার সময় ডিফল্টে রোটেশন প্রয়োগ করে দেয় (autorotate), তাই আউটপুট সোজা হয়ে বেরোয়। আউটপুটে ম্যাট্রিক্স আবার বসে না, এটাই চান।

### ২. VFR: স্থির নয় এমন ফ্রেম রেট

ফোন অন্ধকারে ফ্রেম রেট কমিয়ে দেয়, স্ক্রিন রেকর্ডার কিছু না বদলালে ফ্রেমই লেখে না। ফলে ফ্রেমগুলোর মধ্যে সমান ব্যবধান থাকে না। এটাকে বলে **VFR (variable frame rate)**। ধরার উপায় দুটো রেটের তুলনা:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,avg_frame_rate,nb_frames,duration \
  -of default=nw=1 phone-clip.mp4
```

```text
r_frame_rate=30/1
avg_frame_rate=2700/101
duration=6.733333
nb_frames=180
```

এটা একটা আসল আউটপুট, এমন একটা ফাইলের যার প্রথম তিন সেকেন্ড ৩০ fps আর বাকিটা ২৪ fps। `r_frame_rate` হলো ffprobe-এর অনুমান করা "মূল" রেট (৩০), `avg_frame_rate` হলো আসল গড় (২৭০০/১০১ ≈ ২৬.৭৩)। দুটো উল্লেখযোগ্যভাবে আলাদা হলে ফাইলটা প্রায় নিশ্চিতভাবে VFR। HLS/DASH সেগমেন্টে সমান সময়ের টুকরো আর নিয়মিত কীফ্রেম লাগে, তাই এনকোডের সময় একটা স্থির রেটে (`-fps_mode cfr -r 30`) নিয়ে আসাই নিরাপদ।

### ৩. অডিও নেই

স্ক্রিন রেকর্ডিং, ড্রোন ফুটেজ, GIF থেকে বানানো ভিডিও। `codec_type: audio` একটাও নেই। এটা ভুল না, কিন্তু প্যাকেজার আর কিছু প্লেয়ার অডিও ট্র্যাক আশা করে। দুটো নীতি আছে: অডিও ছাড়াই প্যাকেজ করা, বা একটা নিঃশব্দ ট্র্যাক যোগ করা যাতে সব অ্যাসেট একই আকারের হয়। যেটাই নিন, এটা ইনজেস্টে সিদ্ধান্ত নিতে হবে, এনকোডারে গিয়ে না।

### ৪. 10-bit HDR

নতুন ফোন ডিফল্টে HDR-এ তোলে। আসল আউটপুট:

```text
codec_name=hevc
profile=Main 10
pix_fmt=yuv420p10le
color_space=bt2020nc
color_transfer=smpte2084
color_primaries=bt2020
```

`smpte2084` মানে PQ, `arib-std-b67` মানে HLG। এই ভিডিও একটা সাধারণ H.264 8-bit রেন্ডিশনে সরাসরি এনকোড করলে ফ্যাকাশে, ধূসর রং আসে, কারণ রঙের তথ্য ভুলভাবে ব্যাখ্যা হয়। হয় একটা HDR রেন্ডিশন বানান (HEVC বা AV1, 10-bit, সঠিক রঙের ট্যাগ সহ), নয়তো SDR-এ **tone mapping** করুন। দুটোই ইনজেস্টে ঠিক হয়।

### ৫. ইন্টারলেসড

পুরনো ক্যামকর্ডার আর TV রেকর্ডিং। `field_order=tt` বা `bb`। ব্রাউজারে সরাসরি চালালে চলমান জিনিসের কিনারায় চিরুনির মতো দাগ। এনকোডের আগে deinterlace (`yadif` বা `bwdif` ফিল্টার) দরকার।

### ৬. অনেক দূরে দূরে কীফ্রেম

কিছু ক্যামেরা আর স্ক্রিন রেকর্ডার ১০ সেকেন্ড বা তারও বেশি পরপর কীফ্রেম দেয়। এটা সোর্সের সমস্যা না, কারণ আপনি তো আবার এনকোড করবেন, কিন্তু আপনি যদি কখনো সোর্স থেকে সরাসরি (re-encode ছাড়া) প্যাকেজ বা ক্লিপ করার কথা ভাবেন, তখন কাজে লাগে। কীফ্রেমগুলোর সময় দেখতে:

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -show_entries frame=pts_time -of csv=p=0 lecture-07.mp4
```

```text
0.000000
2.000000
4.000000
```

### ৭. ভাঙা বা অসম্পূর্ণ ফাইল

এটাই সবচেয়ে আকর্ষণীয়, কারণ দুই রকম ভাঙা হয়।

**ক. `moov` শেষে, আর ফাইল কাটা।** MP4-এর সূচি (`moov` বক্স) অনেক রেকর্ডার ফাইলের একদম শেষে লেখে। আপলোড মাঝপথে কাটলে সূচিটাই নেই, ffprobe সাথে সাথে বলে দেয়:

```bash
ffprobe -v error -show_entries format=duration truncated.mp4; echo "exit=$?"
```

```text
[mov,mp4,m4a,3gp,3g2,mj2 @ 0x784f024000] moov atom not found
truncated.mp4: Invalid data found when processing input
exit=1
```

এটা সহজ। প্রোব ব্যর্থ, রিজেক্ট।

**খ. `moov` শুরুতে (faststart), আর ফাইল কাটা।** এবার সূচি আছে, আর সূচি পুরো ফাইলের কথা বলে। ffprobe সূচি পড়ে সন্তুষ্ট:

```text
duration=6.000000
```

কিন্তু ফাইলের অর্ধেক ডেটা নেই। ওপরে ভালো মাছ, নিচে কিছুই না। এটা ধরার একমাত্র উপায় পুরো ফাইল ডিকোড করে দেখা:

```bash
ffmpeg -v error -i trunc_fs.mp4 -f null - ; echo "exit=$?"
```

```text
[h264 @ 0x7c97050e00] Invalid NAL unit size (27851 > 18407).
[h264 @ 0x7c97050e00] missing picture in access unit with size 18411
[in#0/mov,mp4,m4a,3gp,3g2,mj2 @ 0x7c97024000] stream 1, offset 0x2deba4: partial file
[h264 @ 0x7c97053800] Error splitting the input into NAL units.
exit=0
```

শেষ লাইনটা খেয়াল করুন: **exit code 0**। ffmpeg এরর ছাপিয়েছে, কিন্তু যতটুকু পেরেছে ডিকোড করে "সফলভাবে" শেষ করেছে। আপনার কোড যদি শুধু exit code দেখে, এই ফাইল পাস হয়ে যাবে, আর দর্শক দেখবে ভিডিও তিন সেকেন্ডে থেমে যায়। দুটো সমাধান: stderr খালি কিনা দেখা, বা `-xerror` দেওয়া, যাতে প্রথম এররেই ffmpeg থেমে নন-জিরো exit দেয়:

```bash
ffmpeg -v error -xerror -i trunc_fs.mp4 -f null - 2>/dev/null; echo "exit=$?"
ffmpeg -v error -xerror -i base.mp4     -f null -;             echo "exit=$?"
```

```text
exit=183
exit=0
```

(দুটো আউটপুটই এই চ্যাপ্টার লেখার সময় ffmpeg 9.0.2 দিয়ে চালানো আসল আউটপুট।)

<Callout type="warning">

পুরো ডিকোড চেক সস্তা না: ফাইলের প্রতিটা ফ্রেম ডিকোড হয়। তবে এটা এনকোডিংয়ের চেয়ে অনেক দ্রুত, কারণ কিছু এনকোড বা লেখা হয় না। ৬ সেকেন্ডের ১০৮০p ক্লিপ একটা ল্যাপটপে মোটামুটি ০.১ সেকেন্ডে শেষ হয়েছে; এক ঘণ্টার লেকচারে আপনার হার্ডওয়্যারে কত লাগে সেটা একবার মেপে দেখুন। অনেক প্ল্যাটফর্ম আলাদা চেক না চালিয়ে এই কাজটা প্রথম এনকোড পাসের ভেতরেই করে: এনকোডের stderr-এ ডিকোড এরর এলে জব ব্যর্থ।

</Callout>

## নীতি: কী বাতিল, কী ঠিক করবেন

প্রতিটা প্ল্যাটফর্মকে একটা টেবিল লিখে রাখতে হয়। এটা একটা ভালো শুরু:

| অবস্থা | সিদ্ধান্ত | error code বা পরিকল্পনা |
| --- | --- | --- |
| ffprobe ব্যর্থ, বা টাইমআউট | বাতিল | `source_unreadable` |
| ভিডিও স্ট্রিম নেই | বাতিল (অডিও-অনলি প্রোডাক্ট না হলে) | `source_no_video_stream` |
| দৈর্ঘ্য প্রোডাক্ট-সীমার বেশি | বাতিল | `source_too_long` |
| রেজোলিউশন অনেক বড় (যেমন ৮K যখন আপনি ৪K পর্যন্ত দেন) | নরমালাইজ | ladder-এর সর্বোচ্চ ধাপ সীমিত |
| ডিকোড এরর | বাতিল | `source_corrupt` |
| রোটেশন | নরমালাইজ | autorotate, display size দিয়ে ladder |
| VFR | নরমালাইজ | `-fps_mode cfr`, নিকটতম প্রমিত রেট |
| ইন্টারলেসড | নরমালাইজ | `bwdif` deinterlace |
| HDR | নরমালাইজ | SDR tone map, ঐচ্ছিক HDR রেন্ডিশন |
| অডিও নেই | নরমালাইজ বা পাস | নিঃশব্দ ট্র্যাক বা অডিও ছাড়া প্যাকেজ |
| অদ্ভুত স্যাম্পল রেট (২২০৫০, ৮০০০) | নরমালাইজ | ৪৮০০০-এ resample |
| অনেক অডিও ট্র্যাক | নরমালাইজ | প্রথম `default` ট্র্যাক, বা ভাষা অনুযায়ী সব |

যে নীতিই নিন, প্রতিটা সিদ্ধান্ত অ্যাসেটের সাথে সংরক্ষণ করুন (একটা `probe` JSON কলাম আর একটা `plan` JSON কলাম)। পরে কোনো ইউজার জিজ্ঞেস করলে "আপনার ভিডিও কেন ধূসর দেখাচ্ছে", উত্তরটা ডেটাবেসে থাকবে।

## Go দিয়ে একটা নিরাপদ প্রোব

ffprobe একটা বাইরের প্রসেস, আর বাইরের প্রসেস আটকে যেতে পারে (ভাঙা ফাইল, ধীর নেটওয়ার্ক স্টোরেজ)। তাই প্রতিটা কল একটা টাইমআউটের ভেতর:

```go
package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"time"
)

type Stream struct {
	Index         int    `json:"index"`
	CodecType     string `json:"codec_type"`
	CodecName     string `json:"codec_name"`
	Profile       string `json:"profile"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	PixFmt        string `json:"pix_fmt"`
	FieldOrder    string `json:"field_order"`
	ColorTransfer string `json:"color_transfer"`
	RFrameRate    string `json:"r_frame_rate"`
	AvgFrameRate  string `json:"avg_frame_rate"`
	SampleRate    string `json:"sample_rate"`
	Channels      int    `json:"channels"`
	Duration      string `json:"duration"`
	SideData      []struct {
		Rotation int `json:"rotation"`
	} `json:"side_data_list"`
}

type Probe struct {
	Streams []Stream `json:"streams"`
	Format  struct {
		Duration string `json:"duration"`
		Size     string `json:"size"`
	} `json:"format"`
}

var ErrUnreadable = errors.New("source_unreadable")

// Run probes a local path or a presigned URL. The timeout matters more than the parsing.
func Run(ctx context.Context, src string) (*Probe, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error", "-print_format", "json", "-show_format", "-show_streams", src)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: %v: %s", ErrUnreadable, err, firstLine(stderr.String()))
	}
	var p Probe
	if err := json.Unmarshal(stdout.Bytes(), &p); err != nil {
		return nil, fmt.Errorf("%w: bad json: %v", ErrUnreadable, err)
	}
	return &p, nil
}

func (p *Probe) Video() *Stream {
	for i := range p.Streams {
		if p.Streams[i].CodecType == "video" {
			return &p.Streams[i]
		}
	}
	return nil
}

func (p *Probe) HasAudio() bool {
	for _, s := range p.Streams {
		if s.CodecType == "audio" {
			return true
		}
	}
	return false
}

// DurationSeconds prefers the stream duration, falls back to the container's.
func (p *Probe) DurationSeconds() float64 {
	if v := p.Video(); v != nil {
		if d, err := strconv.ParseFloat(v.Duration, 64); err == nil {
			return d
		}
	}
	d, _ := strconv.ParseFloat(p.Format.Duration, 64)
	return d
}

func (s *Stream) Rotation() int {
	for _, sd := range s.SideData {
		if sd.Rotation != 0 {
			return sd.Rotation
		}
	}
	return 0
}

// IsVFR compares the nominal and average rates. 1% tolerance absorbs rounding.
func (s *Stream) IsVFR() bool {
	r, a := ratio(s.RFrameRate), ratio(s.AvgFrameRate)
	if r == 0 || a == 0 {
		return false
	}
	diff := r - a
	if diff < 0 {
		diff = -diff
	}
	return diff/r > 0.01
}

func (s *Stream) IsHDR() bool {
	return s.ColorTransfer == "smpte2084" || s.ColorTransfer == "arib-std-b67"
}

func ratio(v string) float64 {
	var n, d float64
	if _, err := fmt.Sscanf(v, "%g/%g", &n, &d); err != nil || d == 0 {
		return 0
	}
	return n / d
}

func firstLine(s string) string {
	if i := bytes.IndexByte([]byte(s), '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
```

ডিকোড চেকও একই ধাঁচে, শুধু কমান্ডটা আলাদা আর টাইমআউট দৈর্ঘ্যের অনুপাতে:

```go
func DecodeCheck(ctx context.Context, src string, durationSec float64) error {
	// Decode is much faster than real time; allow generous headroom, never unbounded.
	timeout := time.Duration(durationSec*0.5)*time.Second + 2*time.Minute
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-xerror", "-i", src, "-f", "null", "-")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil || stderr.Len() > 0 {
		return fmt.Errorf("source_corrupt: %s", firstLine(stderr.String()))
	}
	return nil
}
```

`IsVFR`-এর মতো লজিকের জন্য একটা ছোট টেস্ট রাখুন, উপরের আসল সংখ্যা দিয়ে:

```go
func TestIsVFR(t *testing.T) {
	cfr := Stream{RFrameRate: "30/1", AvgFrameRate: "30/1"}
	vfr := Stream{RFrameRate: "30/1", AvgFrameRate: "2700/101"}
	ntsc := Stream{RFrameRate: "30000/1001", AvgFrameRate: "30000/1001"}
	if cfr.IsVFR() || ntsc.IsVFR() || !vfr.IsVFR() {
		t.Fatal("vfr detection wrong")
	}
}
```

### URL থেকে প্রোব

ffprobe সরাসরি একটা HTTP URL পড়তে পারে, তাই presigned GET URL দিলে পুরো ফাইল ডাউনলোড না করেই প্রোব হয়: ffprobe শুধু দরকারি অংশগুলো রেঞ্জ রিকোয়েস্ট দিয়ে পড়ে। কিন্তু `moov` শেষে থাকলে ফাইলের শেষে লাফ দিতে হয়, আর ডিকোড চেক তো পুরো ফাইলই পড়ে। তাই বেশিরভাগ পাইপলাইনে ইনজেস্ট ওয়ার্কার ফাইলটা একবার লোকাল ডিস্কে নামিয়ে নেয়, প্রোব আর ডিকোড চেক লোকালি চালায়, আর একই কপি এনকোডিংয়েও ব্যবহার হয়, যদি একই মেশিন হয়।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত করুন | সমাধান |
| --- | --- | --- |
| খাড়া ফোন ভিডিও আউটপুটে কাত বা চ্যাপ্টা | `ffprobe -show_streams` আউটপুটে `side_data_list`-এর `rotation` | ladder-এর হিসাবে display size ব্যবহার করুন; ffmpeg কমান্ডে `-noautorotate` থাকলে সরান |
| আউটপুটে অডিও-ভিডিও ধীরে ধীরে সিঙ্ক হারায় | `r_frame_rate` আর `avg_frame_rate` তুলনা করুন | VFR সোর্স; `-fps_mode cfr -r 30` দিয়ে এনকোড করুন |
| আউটপুট ফ্যাকাশে, ধূসর রং | `color_transfer` `smpte2084` বা `arib-std-b67` কিনা | HDR সোর্স; SDR রেন্ডিশনে tone mapping যোগ করুন |
| চলমান জিনিসের কিনারায় চিরুনির দাগ | `field_order` `tt` বা `bb` কিনা | deinterlace ফিল্টার (`bwdif`) যোগ করুন |
| কিছু ভিডিও তিন সেকেন্ডে থেমে যায়, কিন্তু প্রসেসিং সফল দেখায় | সোর্সে `ffmpeg -v error -i SRC -f null -` চালিয়ে stderr দেখুন | ডিকোড চেকে `-xerror` দিন আর stderr খালি কিনা দেখুন; শুধু exit code বিশ্বাস করবেন না |
| ইনজেস্ট জব মাঝেমধ্যে চিরকাল চলে | ওয়ার্কারে `pgrep -af ffprobe` দিয়ে পুরনো প্রসেস | প্রতিটা ffprobe/ffmpeg কল `exec.CommandContext` আর টাইমআউটের ভেতরে |
| নতুন সার্ভারে প্রোবের পার্সার ভেঙে গেল | দুই মেশিনে `ffprobe -version` তুলনা করুন | ffmpeg-এর ভার্সন পিন করুন (কন্টেইনার ইমেজ বা নির্দিষ্ট বাইনারি); আপগ্রেডের আগে টেস্ট ফাইলের আউটপুট তুলনা করুন |
| ইউজার বলছে "ভালো ফাইল রিজেক্ট হয়েছে" | অ্যাসেটের সংরক্ষিত `probe` JSON আর `error_code` দেখুন | নীতির টেবিল আবার দেখুন; প্রায়ই অডিও-নেই বা অদ্ভুত কোডেককে ভুল করে "ভাঙা" ধরা হয় |

## মূল শিক্ষা

1. **এক্সটেনশন আর Content-Type কিছু প্রমাণ করে না**: ffprobe দিয়ে খুলে দেখাই একমাত্র উপায়।
2. **ffprobe JSON-এর দরকারি ফিল্ড** হলো `codec_type`, `codec_name`, `width`/`height`, `rotation`, `pix_fmt`, `color_transfer`, `field_order`, দুটো ফ্রেম রেট, আর `duration`।
3. **রোটেশন, VFR, HDR, ইন্টারলেস** নিয়মিত আসে; প্রতিটার জন্য ইনজেস্টেই একটা নরমালাইজেশন সিদ্ধান্ত নিন।
4. **হেডার ঠিক মানেই ফাইল ঠিক না**: faststart করা কাটা ফাইল প্রোব পাস করে; শুধু পুরো ডিকোড ধরতে পারে।
5. **ffmpeg এরর ছাপিয়েও exit 0 দিতে পারে**: `-xerror` দিন আর stderr দেখুন।
6. **প্রতিটা বাইরের প্রসেসে টাইমআউট**: `exec.CommandContext` ছাড়া কোনো ffprobe/ffmpeg কল না।
7. **ffmpeg-এর ভার্সন পিন করুন**, আর প্রোব আর পরিকল্পনা অ্যাসেটের সাথে সংরক্ষণ করুন, যাতে পরে প্রশ্নের উত্তর দেওয়া যায়।
