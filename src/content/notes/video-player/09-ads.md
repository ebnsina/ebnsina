---
title: 'প্লেয়ারে অ্যাড'
subtitle: 'CSAI বনাম SSAI, VAST, VMAP, SIMID আর Open Measurement, HLS interstitials, অ্যাড ব্রেকের সীমানায় কেন প্লেয়ার আটকে যায়, আর দর্শককে বিরক্ত না করে অ্যাড দেখানো।'
chapter: 9
level: 'advanced'
readingTime: '২০ মিনিট'
topics: ['ads', 'csai', 'ssai', 'vast', 'vmap', 'simid', 'omid', 'hls interstitials', 'ima sdk']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মিরপুর স্টেডিয়ামে BPL-এর ম্যাচ চলছে, আর টিভিতে সরাসরি সম্প্রচার। প্রতি ওভার শেষে খেলা থামে, আর ঠিক তখন পর্দায় চলে আসে চায়ের বিজ্ঞাপন, মোবাইল অপারেটরের বিজ্ঞাপন। সম্প্রচার কন্ট্রোল রুমে বসে আছেন রাজি। তার হাতে একটা তালিকা: কোন ব্রেকে কোন বিজ্ঞাপন, কত সেকেন্ড। ওভার শেষ হওয়ার সংকেত এলেই তিনি সুইচ টিপে খেলার ফিড থেকে বিজ্ঞাপনের টেপে যান, আর তিরিশ সেকেন্ড পর আবার মাঠে ফেরেন। দর্শক কোনো ঝাঁকুনি টের পান না, কারণ সবকিছু একটা স্রোতেই আসে।

পাশের বাড়ির ফারাবি আবার খেলা দেখছেন একটা পুরনো স্মার্ট TV-র অ্যাপে। সেখানে ব্যাপারটা আলাদা। ওভার শেষে অ্যাপ নিজে আলাদা করে একটা বিজ্ঞাপন সার্ভারে ফোন করে জিজ্ঞেস করে "এখন কী দেখাব?", তারপর বিজ্ঞাপনের ভিডিও নামায়, খেলার প্লেয়ার থামিয়ে বিজ্ঞাপনের প্লেয়ার চালায়। কখনো বিজ্ঞাপন নামাতে দেরি হয়, পর্দা দুই সেকেন্ড কালো থাকে। কখনো বিজ্ঞাপন শেষে খেলায় ফিরতে গিয়ে প্লেয়ার আটকে যায়। আর ফারাবির ছেলে কিন্দি ল্যাপটপে অ্যাড ব্লকার চালু রাখে, তার স্ক্রিনে বিজ্ঞাপনই আসে না। কোম্পানি জানতে চায় কে কতক্ষণ বিজ্ঞাপন দেখল, তাই প্রতিটা বিজ্ঞাপনের শুরু, মাঝখান আর শেষে একটা করে খবর পাঠাতে হয়।

মিলিয়ে নিই: রাজির কন্ট্রোল রুমে সুইচ টিপে একই স্রোতে বিজ্ঞাপন বসানো হলো **SSAI (server-side ad insertion)**, আর ফারাবির অ্যাপের নিজে আলাদা করে বিজ্ঞাপন আনা হলো **CSAI (client-side ad insertion)**। "কোন ব্রেকে কোন বিজ্ঞাপন"-এর তালিকা হলো **VMAP**, বিজ্ঞাপন সার্ভারের উত্তর হলো **VAST**, ওভার শেষের সংকেত হলো **ad marker (SCTE-35 বা EXT-X-DATERANGE)**, খেলায় ফেরার সময় আটকে যাওয়া হলো **discontinuity আর codec mismatch**, কিন্দির অ্যাড ব্লকার হলো **ad blocker যা CSAI ব্লক করে**, আর শুরু-মাঝ-শেষের খবর পাঠানো হলো **tracking beacon**। বাস্তবে YouTube, Hotstar থেকে স্থানীয় OTT, সবাই এই দুই পদ্ধতির কোনো একটা বা মিশ্রণ ব্যবহার করে।

## অ্যাডের শব্দভান্ডার

| শব্দ | মানে |
| --- | --- |
| pre-roll / mid-roll / post-roll | কনটেন্টের আগে / মাঝে / পরে বিজ্ঞাপন |
| ad break | এক জায়গায় বসা বিজ্ঞাপনের সময়খণ্ড |
| ad pod | এক ব্রেকে একাধিক বিজ্ঞাপন, ক্রম ধরে |
| creative | আসল বিজ্ঞাপনের ভিডিও বা ইমেজ |
| ad server / ad decision server | কোন বিজ্ঞাপন দেখানো হবে সেটা ঠিক করে |
| impression | বিজ্ঞাপন দেখানো শুরু হয়েছে, এই গণনা |
| quartile | ২৫%, ৫০%, ৭৫%, ১০০% দেখা হয়েছে, এই চারটা চেকপয়েন্ট |
| fill rate | কতগুলো ব্রেকে আসলেই বিজ্ঞাপন পাওয়া গেল |

## CSAI: প্লেয়ার নিজে অ্যাড আনে

<Mermaid
title="Client-side ad insertion"
code={`sequenceDiagram
  participant P as "Content player"
  participant S as "Ad SDK (e.g. IMA)"
  participant D as "Ad server"
  participant C as "Ad CDN"
  P->>S: "cue point reached, request ad"
  S->>D: "GET VAST tag URL"
  D-->>S: "VAST XML (maybe wrapper)"
  S->>D: "follow wrapper redirects"
  S->>C: "fetch creative MP4 or HLS"
  S->>P: "pause content"
  S->>S: "play ad, fire impression and quartiles"
  S->>P: "resume content"`}
/>

**সুবিধা:**

- ইন্টিগ্রেশন সহজ। একটা SDK, একটা VAST ট্যাগ URL।
- প্রতিটা দর্শকের জন্য আলাদা বিজ্ঞাপন, আর ট্র্যাকিং সরাসরি ক্লায়েন্ট থেকে, তাই বিজ্ঞাপনদাতারা বেশি বিশ্বাস করে।
- ইন্টারঅ্যাক্টিভ বিজ্ঞাপন (ক্লিক, স্কিপ বাটন) সহজে চলে।

**অসুবিধা:**

- **অ্যাড ব্লকার সহজেই আটকায়,** কারণ অ্যাড সার্ভারের ডোমেইন আলাদা।
- **দুই প্লেয়ারের মাঝে সুইচ।** কনটেন্ট থামে, অ্যাড শুরু হয়, আবার কনটেন্ট। প্রতিটা সুইচে কালো ফ্রেম বা বাফারিংয়ের ঝুঁকি।
- **TV আর পুরনো ডিভাইসে ভারী।** দুটো ডিকোডার, বাড়তি মেমরি।
- **VAST wrapper চেইন ধীর।** এক সার্ভার আরেকটাতে পাঠায়, সেটা আরেকটাতে; প্রতিটা হপে লেটেন্সি।

## SSAI: সার্ভার স্রোতের মধ্যে অ্যাড বসায়

SSAI-তে প্লেয়ার একটাই manifest পায়, যেখানে কনটেন্ট আর বিজ্ঞাপনের সেগমেন্ট একসাথে সাজানো। স্টিচিং সার্ভার প্রতিটা দর্শকের জন্য (বা দর্শকের দলের জন্য) আলাদা manifest বানায়।

```text
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:120
#EXTINF:6.0,
https://cdn.baytalhikma.org/match/seg_00120.m4s
#EXTINF:6.0,
https://cdn.baytalhikma.org/match/seg_00121.m4s
#EXT-X-DISCONTINUITY
#EXT-X-MAP:URI="https://ads.cordoba.example/tea30/init.mp4"
#EXTINF:6.0,
https://ads.cordoba.example/tea30/seg_1.m4s
#EXTINF:6.0,
https://ads.cordoba.example/tea30/seg_2.m4s
#EXTINF:6.0,
https://ads.cordoba.example/tea30/seg_3.m4s
#EXTINF:6.0,
https://ads.cordoba.example/tea30/seg_4.m4s
#EXTINF:6.0,
https://ads.cordoba.example/tea30/seg_5.m4s
#EXT-X-DISCONTINUITY
#EXT-X-MAP:URI="https://cdn.baytalhikma.org/match/init.mp4"
#EXTINF:6.0,
https://cdn.baytalhikma.org/match/seg_00122.m4s
```

**`EXT-X-DISCONTINUITY` সবচেয়ে গুরুত্বপূর্ণ লাইন।** এটা প্লেয়ারকে বলে "এখান থেকে টাইমস্ট্যাম্প, কোডেক প্যারামিটার, init segment সব নতুন হতে পারে"। এটা বাদ পড়লে প্লেয়ার আগের টাইমলাইনেই নতুন সেগমেন্ট বসাতে চায়, আর ফল হয় আটকে যাওয়া, ফ্রেম লাফানো, বা অডিও-ভিডিও আলাদা হয়ে যাওয়া।

**সুবিধা:**

- অ্যাড ব্লকারের পক্ষে আলাদা করা কঠিন, কারণ সবকিছু এক manifest আর প্রায়ই এক ডোমেইন থেকে।
- প্লেয়ারের দিক থেকে একটাই স্রোত, তাই TV আর পুরনো ডিভাইসে মসৃণ।
- লাইভে বিশেষভাবে ভালো: সবাইকে একসাথে ব্রেকে নেওয়া যায়।

**অসুবিধা:**

- **ট্র্যাকিং কঠিন।** সার্ভার জানে কোন সেগমেন্ট দেওয়া হয়েছে, কিন্তু দর্শক সত্যিই দেখেছে কিনা জানে না। তাই হয় সার্ভার-সাইড বীকন (কম বিশ্বাসযোগ্য), নয়তো প্লেয়ার থেকে ক্লায়েন্ট-সাইড বীকন (তখন প্লেয়ারকে জানতে হয় কোথায় অ্যাড শুরু আর শেষ)।
- **প্রতি দর্শকের manifest মানে manifest ক্যাশ হয় না,** তাই স্টিচিং সার্ভারে লোড বেশি ([লাইভ ডেলিভারি](/notes/live-streaming/08-live-delivery-at-scale) দেখুন)।
- **অ্যাড ক্রিয়েটিভ আপনার ladder-এ ট্রান্সকোড করতে হয়।** বিজ্ঞাপনদাতার দেওয়া ৪K MP4 সরাসরি বসানো যায় না।
- **স্কিপ বাটন বা সিক আটকানো প্লেয়ারকেই করতে হয়,** কারণ স্রোতের মধ্যে বিজ্ঞাপন একটা সাধারণ সেগমেন্ট মাত্র।

### সার্ভার-গাইডেড: HLS interstitials

মাঝামাঝি একটা পথও আছে, যাকে অনেকে **SGAI (server-guided ad insertion)** বলে। manifest-এ সার্ভার শুধু জানিয়ে দেয় "এখানে একটা ব্রেক, অ্যাডের তালিকা এই URL-এ", আর প্লেয়ার নিজে সেটা আলাদা করে চালায়। HLS-এ এর মান হলো **interstitials**, যা Apple ২০২১ সালে চালু করে:

```text
#EXT-X-PROGRAM-DATE-TIME:2026-10-25T14:00:00.000Z
#EXTINF:6.0,
seg_00121.m4s
#EXT-X-DATERANGE:ID="break-12",CLASS="com.apple.hls.interstitial",START-DATE="2026-10-25T14:00:06.000Z",DURATION=30.0,X-ASSET-LIST="https://ads.cordoba.example/break-12.json",X-RESUME-OFFSET=0,X-RESTRICT="SKIP,JUMP"
#EXTINF:6.0,
seg_00122.m4s
```

- `CLASS="com.apple.hls.interstitial"` বলে এটা অ্যাড ব্রেক।
- `X-ASSET-URI` (একটা অ্যাড) বা `X-ASSET-LIST` (JSON তালিকা, একাধিক অ্যাড) এর ঠিক একটা থাকে।
- `X-RESTRICT="SKIP,JUMP"` দর্শককে ব্রেক টপকাতে দেয় না।
- interstitials-এর জন্য playlist-এ `EXT-X-PROGRAM-DATE-TIME` থাকা দরকার, কারণ ব্রেকের অবস্থান সময় দিয়ে বলা হয়।

২০২৬ সালের অক্টোবর অনুযায়ী Apple-এর AVPlayer এটা নেটিভভাবে চালায়, আর hls.js 1.6 থেকে interstitials সমর্থন যোগ করেছে; পুরনো hls.js এই ট্যাগ চুপচাপ উপেক্ষা করে। কোন অ্যাট্রিবিউট কোন প্লেয়ারে কাজ করে, সেটা দুই প্লেয়ারের বর্তমান ডকসে মিলিয়ে নিন।

DASH-এ একই কাজ হয় **multi-period** দিয়ে: প্রতিটা অ্যাড একটা আলাদা `Period`, আর কনটেন্ট আরেকটা। period-এর সীমানা DASH-এ discontinuity-র সমতুল্য।

### কোনটা কখন

| পরিস্থিতি | ভালো পছন্দ |
| --- | --- |
| ছোট টিম, শুধু ওয়েব, VOD | CSAI (IMA SDK) |
| স্মার্ট TV আর পুরনো ডিভাইস বড় অংশ | SSAI |
| বড় লাইভ ইভেন্ট | SSAI বা SGAI |
| ইন্টারঅ্যাক্টিভ বিজ্ঞাপন জরুরি | CSAI বা SGAI |
| অ্যাড ব্লকারে আয় হারানো বড় সমস্যা | SSAI |

## VAST, VMAP, SIMID, OMID: কোনটা কী

২০২৬ সালের অক্টোবরে IAB Tech Lab-এর পেজ অনুযায়ী:

- **VAST** (Video Ad Serving Template): অ্যাড সার্ভারের উত্তরের XML ফরম্যাট। সর্বশেষ মূল ভার্সন **VAST 4.3** (ডিসেম্বর ২০২২), সাথে ২০২৪ সালে CTV-র জন্য একটা অ্যাডেন্ডাম।
- **VMAP** (Video Multiple Ad Playlist): পুরো কনটেন্টে কোথায় কোথায় ব্রেক, তার তালিকা।
- **VPAID**: পুরনো ইন্টারঅ্যাক্টিভ অ্যাডের API, যেখানে বিজ্ঞাপনের JavaScript সরাসরি প্লেয়ারের পেজে চলত। এটা **deprecated**; IAB এর জায়গায় **SIMID** দিয়েছে।
- **SIMID** (Secure Interactive Media Interface Definition): ইন্টারঅ্যাক্টিভ অংশ চলে আলাদা ডোমেইনের iframe-এ, প্লেয়ারের সাথে কথা বলে মেসেজ দিয়ে। VAST 4.2 থেকে।
- **OMID / Open Measurement**: viewability আর ভেরিফিকেশন মাপার স্ট্যান্ডার্ড SDK। VAST 4.1 থেকে `AdVerifications` এলিমেন্টে আসে।

নতুন ভার্সন আসে, তাই প্রোডাকশনে যাওয়ার আগে IAB Tech Lab-এর VAST পেজ দেখে নিন।

একটা ছোট VAST উত্তর দেখতে এরকম (উদাহরণ):

```xml
<VAST version="4.3">
  <Ad id="tea-30">
    <InLine>
      <AdSystem>CordobaAds</AdSystem>
      <AdTitle>Cha 30s</AdTitle>
      <Impression><![CDATA[https://track.cordoba.example/imp?ad=tea-30]]></Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:30</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[https://track.cordoba.example/start?ad=tea-30]]></Tracking>
              <Tracking event="firstQuartile"><![CDATA[https://track.cordoba.example/q1?ad=tea-30]]></Tracking>
              <Tracking event="midpoint"><![CDATA[https://track.cordoba.example/q2?ad=tea-30]]></Tracking>
              <Tracking event="thirdQuartile"><![CDATA[https://track.cordoba.example/q3?ad=tea-30]]></Tracking>
              <Tracking event="complete"><![CDATA[https://track.cordoba.example/done?ad=tea-30]]></Tracking>
            </TrackingEvents>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720" bitrate="2500"><![CDATA[https://ads.cordoba.example/tea30/720p.mp4]]></MediaFile>
              <MediaFile delivery="streaming" type="application/x-mpegURL"><![CDATA[https://ads.cordoba.example/tea30/master.m3u8]]></MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>
```

পড়ার মতো তিনটা জায়গা: `Impression` (দেখানো শুরু হলে কল), `TrackingEvents` (quartile বীকন), আর `MediaFiles` (প্লেয়ার এখান থেকে নিজের সাথে মানানসই ফরম্যাট বাছে)। `Wrapper` থাকলে `InLine`-এর জায়গায় আরেকটা VAST URL থাকে, আর প্লেয়ারকে সেটাও আনতে হয়।

## Google IMA SDK দিয়ে CSAI, ছোট করে

ওয়েবে সবচেয়ে প্রচলিত CSAI SDK হলো Google-এর IMA। ফ্লোটা মোটামুটি এরকম (নাম আর সিগনেচার IMA-র HTML5 ডকসে মিলিয়ে নিন, ভার্সনভেদে বদলায়):

```javascript
const adContainer = document.getElementById('ad-container');
const video = document.getElementById('content');

const displayContainer = new google.ima.AdDisplayContainer(adContainer, video);
const loader = new google.ima.AdsLoader(displayContainer);

loader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
  const manager = e.getAdsManager(video);
  manager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => video.pause());
  manager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => video.play());
  manager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (err) => {
    console.warn('ad error, resuming content', err.getError().getErrorCode());
    manager.destroy();
    video.play();
  });
  manager.init(video.clientWidth, video.clientHeight, google.ima.ViewMode.NORMAL);
  manager.start();
});

loader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, () => video.play());

playButton.addEventListener('click', () => {
  displayContainer.initialize(); // must run inside the user gesture
  const req = new google.ima.AdsRequest();
  req.adTagUrl = 'https://ads.cordoba.example/vmap?content=match-12';
  loader.requestAds(req);
});
```

দুটো নিয়ম যা না মানলে প্রোডাকশনে সমস্যা:

- **অ্যাড এররে কনটেন্ট চালু করুন।** অ্যাড না এলে দর্শকের কনটেন্ট আটকে থাকা চলবে না। এটা সবচেয়ে কমন আর সবচেয়ে ক্ষতিকর বাগ।
- **`initialize()` ইউজারের ক্লিকের ভেতরে ডাকুন।** মোবাইলে অটোপ্লে পলিসি ইউজার জেসচার ছাড়া শব্দসহ ভিডিও চালাতে দেয় না ([video এলিমেন্ট চ্যাপ্টার](/notes/video-player/02-the-video-element) দেখুন)।

## SSAI-তে প্লেয়ারের কাজ

SSAI মানে প্লেয়ারের কোনো কাজ নেই, এটা ভুল ধারণা। প্লেয়ারকে এখনো:

1. **অ্যাডের সীমানা জানতে হয়।** manifest-এর `EXT-X-DATERANGE`, `EXT-X-CUE-OUT`/`EXT-X-CUE-IN` (প্রচলিত কিন্তু মানক নয়), বা DASH-এর period/`EventStream` থেকে।
2. **UI বদলাতে হয়।** "বিজ্ঞাপন · ২০ সেকেন্ড বাকি" দেখানো, সিক বার লক করা বা অ্যাডের অংশ আলাদা রঙে দেখানো।
3. **ক্লায়েন্ট-সাইড বীকন পাঠাতে হয়,** যদি স্টিচিং সার্ভার সেটা চায়। প্লেহেড অ্যাডের ২৫% পার হলে `firstQuartile` URL কল।
4. **সিকের নিয়ম মানতে হয়।** দর্শক যদি ব্রেকের পরে সিক করে, অনেক প্ল্যাটফর্ম আগে বাকি ব্রেকটা দেখায় ("snap back")। এটা ব্যবসায়িক সিদ্ধান্ত, তবে প্লেয়ারকেই প্রয়োগ করতে হয়।

বীকন পাঠানোর জন্য `navigator.sendBeacon` বা `fetch` এর `keepalive: true` ব্যবহার করুন, যাতে পেজ বন্ধ হলেও যায়, আর ব্যর্থ বীকন যেন প্লেব্যাক না থামায়:

```javascript
function fireBeacon(url) {
  try {
    if (!navigator.sendBeacon(url)) fetch(url, { keepalive: true, mode: 'no-cors' });
  } catch {
    // tracking must never break playback
  }
}
```

## অ্যাড ব্রেকের সীমানায় কী ভাঙে

ব্রেকের শুরু আর শেষ হলো প্লেয়ারের সবচেয়ে ভঙ্গুর জায়গা। কারণগুলো প্রায় সবসময় এই তালিকায়:

| সমস্যা | কেন হয় |
| --- | --- |
| ব্রেকে ঢোকার সময় আটকে যায় | `EXT-X-DISCONTINUITY` নেই, তাই টাইমস্ট্যাম্প পিছিয়ে যায় |
| অ্যাডের পর অডিও নেই | কনটেন্ট AAC স্টেরিও, অ্যাড ৫.১ বা ভিন্ন স্যাম্পল রেট; অনেক ডিভাইস মাঝপথে অডিও কোডেক বদলাতে পারে না |
| স্মার্ট TV-তে ব্রেক শেষে কালো স্ক্রিন | অ্যাডের প্রোফাইল বা রেজোলিউশন কনটেন্টের থেকে আলাদা, ডিকোডার রিসেট সামলাতে পারে না |
| অ্যাড শুধু এক রেজোলিউশনে | অ্যাড ক্রিয়েটিভ আপনার ladder-এ ট্রান্সকোড করা হয়নি |
| ব্রেক কয়েক সেকেন্ড আগে বা পরে শুরু | ব্রেকের সময় সেগমেন্ট সীমানায় পড়েনি; SCTE-35 সংকেত কীফ্রেমে বাঁধা হয়নি ([লাইভ রিলায়েবিলিটি](/notes/live-streaming/09-reliability)) |
| DRM কনটেন্টে অ্যাড চলে না | অ্যাড এনক্রিপ্টেড নয় কিন্তু প্লেয়ার এনক্রিপ্টেড পিরিয়ডের key আশা করছে, বা উল্টোটা |

নিয়মটা সরল: **অ্যাড ক্রিয়েটিভ কনটেন্টের মতো একই ladder, একই কোডেক, একই অডিও লেআউট, একই সেগমেন্ট দৈর্ঘ্যে ট্রান্সকোড করুন।** SSAI প্ল্যাটফর্মগুলো এটা নিজেরাই করে, আর নতুন ক্রিয়েটিভ প্রথমবার ট্রান্সকোড হওয়া পর্যন্ত সেটা বাদ দিয়ে দেয়।

## অ্যাড QoE মাপা

কনটেন্টের QoE মাপা হয় ([QoE চ্যাপ্টার](/notes/video-player/11-qoe-analytics)), অ্যাডেরও মাপতে হয়:

- **ad start time:** ব্রেকের শুরু থেকে প্রথম অ্যাড ফ্রেম পর্যন্ত। CSAI-তে VAST wrapper চেইন এটা বাড়ায়।
- **ad error rate:** কতগুলো অ্যাড অনুরোধ এরর বা টাইমআউটে শেষ।
- **fill rate:** কতগুলো ব্রেকে আসলেই অ্যাড পাওয়া গেল।
- **ব্রেকের পর exit rate:** অ্যাড চলার সময় কতজন চলে গেল। এটাই সবচেয়ে সৎ সংখ্যা।
- **content resume failure:** ব্রেক শেষে কনটেন্ট আবার শুরু হতে ব্যর্থ। এটা শূন্যের কাছে থাকতে হবে।

## দর্শককে সম্মান করে অ্যাড

অ্যাড আয়ের উৎস, কিন্তু খারাপ অ্যাড অভিজ্ঞতা দর্শক হারায়। কয়েকটা সরল নিয়ম যা আয় আর আস্থা দুটোই রাখে:

- **একই বিজ্ঞাপন বারবার না।** ফ্রিকোয়েন্সি ক্যাপ রাখুন, এক সেশনে একই ক্রিয়েটিভ দুই-তিনবারের বেশি না।
- **ব্রেকের দৈর্ঘ্য আগে থেকে জানান।** "বিজ্ঞাপন · ৩০ সেকেন্ড" দেখান; লুকানো দৈর্ঘ্য বিরক্তি বাড়ায়।
- **ভলিউম মিলিয়ে রাখুন।** অ্যাড কনটেন্টের চেয়ে জোরে বাজলে দর্শক সত্যিই রেগে যায়। ট্রান্সকোডের সময় loudness নরমালাইজ করুন।
- **ভুয়া "বন্ধ" বাটন, লুকানো ক্লিক এলাকা, বা ইচ্ছে করে ভুল জায়গায় স্কিপ বাটন না।** এগুলো ডার্ক প্যাটার্ন, আর এগুলো দিয়ে পাওয়া ক্লিক বিজ্ঞাপনদাতার কাছেও মূল্যহীন।
- **সাবস্ক্রিপশন থাকলে সেটা সৎভাবে বলুন।** "বিজ্ঞাপন ছাড়া দেখতে প্রিমিয়াম নিন" স্পষ্ট দাম সহ, চাপ দেওয়া কাউন্টডাউন ছাড়া।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন যেভাবে | সমাধান |
| --- | --- | --- |
| অ্যাড এরর হলে কনটেন্টও চলে না | অ্যাড URL ব্লক করে (DevTools-এ request blocking) প্লে করুন | `AD_ERROR` আর টাইমআউটে সবসময় কনটেন্ট resume; অ্যাড অনুরোধের নিজস্ব টাইমআউট |
| প্রি-রোল শুরু হতে অনেক দেরি | Network ট্যাবে VAST কলের চেইন গুনুন | wrapper-এর গভীরতা সীমিত করুন; অ্যাড অনুরোধ আগাম পাঠান (কনটেন্ট লোডের সাথে সমান্তরালে) |
| SSAI ব্রেকে ঢুকে আটকে যায় | `curl -s` দিয়ে manifest দেখুন: ব্রেকের আগে-পরে `EXT-X-DISCONTINUITY` আছে কিনা | স্টিচারে discontinuity আর নতুন `EXT-X-MAP` ঠিক করুন |
| ব্রেকের পর অডিও নেই বা কালো স্ক্রিন | `ffprobe` দিয়ে অ্যাড আর কনটেন্টের অডিও চ্যানেল, স্যাম্পল রেট, ভিডিও প্রোফাইল তুলনা | অ্যাড ক্রিয়েটিভ কনটেন্টের প্রোফাইলে ট্রান্সকোড করুন |
| interstitial ট্যাগ উপেক্ষিত | প্লেয়ারের ভার্সন দেখুন; playlist-এ `EXT-X-PROGRAM-DATE-TIME` আছে কিনা | interstitials-সমর্থিত ভার্সনে যান (hls.js 1.6+); PDT যোগ করুন |
| impression গণনা বিজ্ঞাপনদাতার সংখ্যার চেয়ে কম | বীকন অনুরোধ Network ট্যাবে দেখুন, পেজ বন্ধের সময় যায় কিনা | `sendBeacon` বা `keepalive`; বীকন সময়মতো ফায়ার হচ্ছে কিনা প্লেহেড দিয়ে যাচাই |
| মোবাইলে প্রি-রোল চুপ বা চলে না | কনসোলে autoplay পলিসি এরর | `AdDisplayContainer.initialize()` ইউজার ক্লিকের ভেতরে; মিউটেড অটোপ্লে বিকল্প |
| দর্শক সিক করে ব্রেক টপকে যায় | ব্রেকের উপর সিক করে দেখুন | ব্যবসায়িক নিয়ম অনুযায়ী সিক বার লক বা snap back; interstitials-এ `X-RESTRICT` |

## মূল শিক্ষা

1. **CSAI সহজ আর লক্ষ্যভেদী, SSAI মসৃণ আর ব্লক-প্রতিরোধী।** সার্ভার-গাইডেড (HLS interstitials, DASH multi-period) দুইয়ের মাঝামাঝি।
2. **`EXT-X-DISCONTINUITY` ছাড়া SSAI ভাঙে।** ব্রেকের প্রতিটা সীমানায় এটা আর সঠিক `EXT-X-MAP` থাকতে হবে।
3. **অ্যাড ক্রিয়েটিভ কনটেন্টের একই প্রোফাইলে ট্রান্সকোড করুন।** অডিও লেআউট আর কোডেকের অমিলই বেশিরভাগ "ব্রেকের পর আটকে গেল"-র কারণ।
4. **অ্যাড ব্যর্থ হলে কনটেন্ট চলবেই।** এটাই সবচেয়ে গুরুত্বপূর্ণ নিয়ম।
5. **VPAID deprecated, SIMID আর Open Measurement তার জায়গায়।** ভার্সনের তথ্য IAB Tech Lab-এ মিলিয়ে নিন।
6. **SSAI-তেও প্লেয়ারের কাজ আছে:** ব্রেকের সীমানা চেনা, UI, বীকন, সিকের নিয়ম।
7. **ফ্রিকোয়েন্সি ক্যাপ, স্পষ্ট দৈর্ঘ্য, সমান ভলিউম, ডার্ক প্যাটার্ন নয়।** দর্শকের আস্থা অ্যাড আয়ের চেয়ে দীর্ঘস্থায়ী।
