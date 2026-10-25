---
title: 'মোবাইল, TV ও কাস্টিং'
subtitle: 'iOS-এর AVPlayer, Android-এর Media3, স্মার্ট TV আর Roku, Chromecast আর AirPlay, Picture-in-Picture আর লক-স্ক্রিন কন্ট্রোল, আর কোন ডিভাইস কোন কোডেক হার্ডওয়্যারে চালায় সেটা জেনে নেওয়া।'
chapter: 10
level: 'advanced'
readingTime: '২০ মিনিট'
topics: ['avplayer', 'media3', 'exoplayer', 'smart tv', 'roku', 'chromecast', 'airplay', 'picture-in-picture', 'media session', 'hardware decode']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

কুষ্টিয়ার এক গ্রামে সন্ধ্যায় উঠানে আসর বসেছে। মরিয়ম দোতারা হাতে লালনের একটা গান ধরেছেন। চারপাশে খোলা আকাশ, মানুষ গোল হয়ে বসা, দোতারার তার যেভাবে টানা দরকার সেভাবেই টানা যায়, কেউ বাধা দেয় না। পরদিন একই গান গাইতে হলো শহরের এক বাসার ঘরোয়া অনুষ্ঠানে। সেখানে দোতারা নেই, আছে হারমোনিয়াম। হারমোনিয়ামের রিডগুলো আগে থেকে বাঁধা, যে সুর রিডে নেই সেটা বাজানো যায় না, আর ঘর ছোট বলে আওয়াজ কমিয়ে রাখতে হয়। গান একই, কিন্তু যন্ত্র নিজের নিয়মে চলে, আর মরিয়মকে সেই নিয়ম মেনেই গাইতে হয়।

তার পরের দিন বাসে বসে হাইসাম ফোনের সস্তা স্পিকারে সেই গানের রেকর্ডিং চালালেন। স্পিকারে নিচের সুর প্রায় আসেই না, ফোন একটু গরম হলে আওয়াজ ভেঙে যায়, আর ব্যাটারি কমে গেলে ফোন নিজে থেকেই আওয়াজ কমিয়ে দেয়। বাস থামলে হাইসাম ফোনটা পাশের যাত্রীর ব্লুটুথ স্পিকারে জুড়ে দিলেন। এখন গান বাজছে সেই স্পিকারে, কিন্তু থামানো আর চালানোর বোতাম রয়ে গেছে হাইসামের ফোনেই। লক-স্ক্রিনে গানের নাম ভেসে আছে, ফোন না খুলেই তিনি পরের গানে যেতে পারেন।

মিলিয়ে নিই: একই গান হলো **একই HLS বা DASH স্ট্রিম**, আর দোতারা, হারমোনিয়াম আর ফোনের স্পিকার হলো **আলাদা প্ল্যাটফর্মের প্লেয়ার**: ওয়েবের MSE প্লেয়ার, iOS-এর **AVPlayer**, Android-এর **Media3**, স্মার্ট TV-র ব্রাউজার বা **Roku**। হারমোনিয়ামের বাঁধা রিড হলো **নেটিভ প্লেয়ারের সীমা** (iOS-এ কার্যত শুধু HLS), ছোট ঘরের কম আওয়াজ হলো **TV-র সীমিত মেমরি**, ফোন গরম হয়ে আওয়াজ ভাঙা হলো **thermal throttling আর সফটওয়্যার ডিকোড**, ব্লুটুথ স্পিকারে পাঠিয়ে বোতাম নিজের হাতে রাখা হলো **Chromecast আর AirPlay**-এর sender-receiver মডেল, আর লক-স্ক্রিনে গানের নাম হলো **Media Session API**। বাস্তবে যেকোনো OTT অ্যাপকে এই সবগুলো যন্ত্রে একই গান গাইতে হয়।

## একটা স্ট্রিম, অনেক প্লেয়ার

ওয়েবে আমরা MSE-ভিত্তিক JavaScript প্লেয়ার নিয়ে কথা বলেছি ([MSE চ্যাপ্টার](/notes/video-player/03-media-source-extensions))। বাকি পৃথিবীতে প্লেয়ার হলো প্ল্যাটফর্মের নিজের:

| প্ল্যাটফর্ম | সাধারণ প্লেয়ার | স্ট্রিমিং ফরম্যাট | DRM |
| --- | --- | --- | --- |
| iOS, iPadOS, tvOS, Safari | AVPlayer (AVFoundation) | HLS | FairPlay |
| Android ফোন, Android TV, Google TV, Fire TV | Media3 ExoPlayer | HLS, DASH, SmoothStreaming | Widevine (PlayReady কিছু ডিভাইসে) |
| Samsung Tizen TV | ব্রাউজার MSE বা Samsung-এর নিজের AVPlay API | HLS, DASH | PlayReady, Widevine |
| LG webOS TV | ব্রাউজার MSE বা প্ল্যাটফর্ম প্লেয়ার | HLS, DASH | PlayReady, Widevine |
| Roku | Roku-র নিজের প্লেয়ার (SceneGraph Video নোড) | HLS, DASH | PlayReady, Widevine |
| Chromecast | Web Receiver (CAF) | HLS, DASH | Widevine, PlayReady |

<Callout type="warning">

উপরের টেবিল ২০২৬ সালের অক্টোবরের সাধারণ চিত্র। TV-র মডেল-বছরভেদে DRM আর কোডেক সাপোর্ট আলাদা হয়, আর প্রতিটা প্ল্যাটফর্মের ডেভেলপার ডকস প্রতি বছর বদলায়। টার্গেট ডিভাইসের তালিকা ঠিক করার পর প্রতিটার নিজস্ব ডকস মিলিয়ে নিন, আর অন্তত একটা আসল ডিভাইসে টেস্ট করুন।

</Callout>

এই টেবিলের সবচেয়ে বড় ব্যবহারিক ফল: **আপনার প্যাকেজিং এমন হতে হবে যা সবাই পড়তে পারে।** এজন্যই CMAF সেগমেন্ট, `cbcs` এনক্রিপশন, আর দুটো manifest (HLS ও DASH) আজকের ডিফল্ট ([প্যাকেজিং চ্যাপ্টার](/notes/video/06-packaging-for-streaming))।

## iOS: AVPlayer

Apple ডিভাইসে প্রায় সবসময় প্লেয়ার হলো AVPlayer। এর মানে:

- **কার্যত শুধু HLS।** DASH চালানোর জন্য নেটিভ পথ নেই। iPhone-এর Safari-তে বহুদিন MSE ছিলই না; নতুন iOS-এ Apple **ManagedMediaSource** নামে একটা MSE-ধরনের API দিয়েছে, যাতে JavaScript প্লেয়ারও চলতে পারে। কোন iOS ভার্সন থেকে আর কোন শর্তে, সেটা ব্যবহারের আগে WebKit-এর ডকসে মিলিয়ে নিন।
- **ABR প্লেয়ার নিজে করে।** আপনি কোন রেন্ডিশন চলবে সেটা সরাসরি বাছতে পারেন না; শুধু সীমা দিতে পারেন, যেমন সর্বোচ্চ bitrate বা রেজোলিউশন।
- **FairPlay নেটিভ।** `AVContentKeySession` দিয়ে লাইসেন্স ফ্লো হয় ([DRM চ্যাপ্টার](/notes/video-player/08-drm-and-eme))।

একটা ন্যূনতম উদাহরণ:

```swift
import AVKit

let url = URL(string: "https://cdn.baytalhikma.org/v/abc123/master.m3u8")!
let item = AVPlayerItem(url: url)
item.preferredPeakBitRate = 3_000_000          // cap for cellular, in bits per second
item.preferredForwardBufferDuration = 0          // 0 lets AVPlayer decide

let player = AVPlayer(playerItem: item)
let controller = AVPlayerViewController()
controller.player = player
controller.allowsPictureInPicturePlayback = true
present(controller, animated: true) { player.play() }
```

### ব্যাকগ্রাউন্ড অডিও আর PiP

ফোন লক করলেও অডিও চলতে থাকবে, বা ভিডিও ছোট জানালায় ভাসবে, এর জন্য দুটো জিনিস লাগে:

1. অ্যাপের ক্যাপাবিলিটিতে **Background Modes → Audio, AirPlay, and Picture in Picture** চালু।
2. অডিও সেশনের ক্যাটাগরি `.playback`:

```swift
try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
try AVAudioSession.sharedInstance().setActive(true)
```

ক্যাটাগরি `.playback` না হলে ফোনের সাইলেন্ট সুইচে ভিডিওর শব্দ বন্ধ হয়ে যায়, আর ইউজার মনে করে অ্যাপ ভাঙা।

### AVPlayer-এর এরর পড়া

AVPlayer-এর এরর সাধারণত `AVPlayerItem.error` আর `errorLog()`/`accessLog()`-এ থাকে। `accessLog()`-এর ইভেন্টগুলোতে প্রতিটা রেন্ডিশন সুইচ, পাওয়া bitrate আর stall-এর সংখ্যা থাকে, যা QoE মাপার জন্য সোনার খনি ([QoE চ্যাপ্টার](/notes/video-player/11-qoe-analytics))।

```swift
NotificationCenter.default.addObserver(forName: .AVPlayerItemNewErrorLogEntry, object: item, queue: .main) { _ in
    if let e = item.errorLog()?.events.last {
        print("hls error", e.errorStatusCode, e.errorDomain, e.errorComment ?? "", e.uri ?? "")
    }
}
```

## Android: Media3 ExoPlayer

Android-এ ডিফল্ট পছন্দ হলো Jetpack Media3-এর ExoPlayer। পুরনো `com.google.android.exoplayer2` প্যাকেজ এখন Media3-তে চলে এসেছে; নতুন কাজ Media3-তেই করুন।

২০২৬ সালের অক্টোবরে Media3 ডকস অনুযায়ী HLS চালানো এরকম:

```kotlin
val player = ExoPlayer.Builder(context).build()
playerView.player = player
player.setMediaItem(MediaItem.fromUri("https://cdn.baytalhikma.org/v/abc123/master.m3u8"))
player.prepare()
player.play()
```

Widevine DRM সহ, আর লাইভে key rotation থাকলে মাল্টি-সেশন সহ:

```kotlin
val item = MediaItem.Builder()
    .setUri("https://cdn.baytalhikma.org/v/abc123/manifest.mpd")
    .setDrmConfiguration(
        MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
            .setLicenseUri("https://license.baytalhikma.org/widevine")
            .setLicenseRequestHeaders(mapOf("Authorization" to "Bearer $token"))
            .setMultiSession(true)
            .build()
    )
    .build()
player.setMediaItem(item)
```

কয়েকটা জিনিস যা Android-এ বারবার সমস্যা করে:

- **লাইফসাইকেল।** অ্যাক্টিভিটি ব্যাকগ্রাউন্ডে গেলে প্লেয়ার `release()` না করলে ডিকোডার আটকে থাকে, আর অন্য অ্যাপ ভিডিও চালাতে পারে না। ব্যাকগ্রাউন্ডে চালাতে হলে `MediaSessionService` ব্যবহার করুন, অ্যাক্টিভিটিতে প্লেয়ার রাখবেন না।
- **হার্ডওয়্যার ডিকোডারের সংখ্যা সীমিত।** একসাথে দুটো ভিডিও (ফিডে অটোপ্লে প্রিভিউ আর মূল প্লেয়ার) চালালে সস্তা ফোনে দ্বিতীয়টা হয় সফটওয়্যারে পড়ে, নয়তো ব্যর্থ হয়।
- **ডিভাইস-নির্দিষ্ট বাগ।** কিছু চিপসেটের ডিকোডার নির্দিষ্ট প্রোফাইলে ভুল আচরণ করে। Media3-এর ইস্যু ট্র্যাকারে ডিভাইসের নাম দিয়ে খুঁজলে প্রায়ই সমাধান পাওয়া যায়।

### React Native আর Flutter

ক্রস-প্ল্যাটফর্ম ফ্রেমওয়ার্কের ভিডিও প্লাগইনগুলো (যেমন React Native-এর `react-native-video`, Flutter-এর `video_player`) ভেতরে iOS-এ AVPlayer আর Android-এ ExoPlayer/Media3-ই চালায়। তাই তাদের সীমা আর বাগ ওই দুই প্লেয়ারেরই সীমা আর বাগ। DRM বা অ্যাডের মতো জটিল কাজে প্লাগইন যা দেয় না, সেটার জন্য নেটিভ কোডে নামতে হয়।

## স্মার্ট TV: সবচেয়ে কঠিন প্ল্যাটফর্ম

TV-তে সমস্যা আসে তিন দিক থেকে।

**১. পুরনো ব্রাউজার ইঞ্জিন।** Tizen আর webOS অ্যাপ আসলে ওয়েব অ্যাপ, কিন্তু TV-র ব্রাউজার ইঞ্জিন সাধারণত সেই বছরের ডেস্কটপ ব্রাউজারের চেয়ে কয়েক বছর পুরনো, আর TV কেনার পর খুব কমই আপডেট হয়। নতুন JavaScript সিনট্যাক্স, নতুন CSS, এমনকি নতুন MSE ফিচারও না থাকতে পারে। তাই TV বিল্ডকে পুরনো টার্গেটে ট্রান্সপাইল করুন আর পলিফিল যোগ করুন।

**২. কম মেমরি।** TV-র অ্যাপ প্রসেস ফোনের চেয়েও কম মেমরি পায়। MSE-র SourceBuffer-এর কোটাও ছোট। ডেস্কটপের মতো এক মিনিটের বাফার রাখতে চাইলে `QuotaExceededError` আসে, বা অ্যাপ হঠাৎ বন্ধ হয়ে যায়। সমাধান হলো বাফারের লক্ষ্য ছোট রাখা আর পেছনের বাফার দ্রুত মুছে ফেলা:

```javascript
// hls.js on a TV build
const hls = new Hls({
  maxBufferLength: 20,        // seconds ahead
  backBufferLength: 10,       // seconds kept behind the playhead
  maxBufferSize: 30 * 1000 * 1000
});

// Shaka Player on a TV build
player.configure({
  streaming: { bufferingGoal: 20, bufferBehind: 10 }
});
```

সংখ্যাগুলো উদাহরণ; নিজের টার্গেট ডিভাইসে মেমরি দেখে ঠিক করুন।

**৩. প্ল্যাটফর্মের নিজের প্লেয়ার।** Samsung-এর AVPlay বা Roku-র Video নোড MSE-র চেয়ে নির্ভরযোগ্য হতে পারে, কারণ সেগুলো TV-র হার্ডওয়্যারের জন্য বানানো। কিন্তু তখন আপনার ওয়েব প্লেয়ারের ABR, অ্যানালিটিক্স আর অ্যাড লজিক আবার লিখতে হয়।

### Roku আলাদা কেন

Roku-তে ওয়েব প্রযুক্তি নেই। অ্যাপ লেখা হয় BrightScript ভাষায়, UI SceneGraph দিয়ে, আর ভিডিও চলে Roku-র নিজের Video নোডে। আপনি স্ট্রিমের URL, ফরম্যাট, DRM তথ্য দেন, বাকিটা Roku করে:

```text
' BrightScript, inside a SceneGraph component
content = CreateObject("roSGNode", "ContentNode")
content.url = "https://cdn.baytalhikma.org/v/abc123/master.m3u8"
content.streamFormat = "hls"
m.video.content = content
m.video.control = "play"
```

Roku-র ডেভেলপার ডকসে সমর্থিত কোডেক, DRM আর manifest-এর বৈশিষ্ট্যের আলাদা তালিকা আছে; একটা HLS যা ওয়েবে চলে, সেটা Roku-তে চলবে এমন ধরে নেবেন না, বিশেষ করে অডিও কোডেক আর সাবটাইটেল ফরম্যাটের বেলায়।

### TV-র রিমোট

TV-তে মাউস নেই, টাচ নেই, আছে রিমোটের চারটা তীর আর OK বোতাম। প্লেয়ারের প্রতিটা কন্ট্রোল **ফোকাসযোগ্য** হতে হবে, ফোকাস কোথায় আছে সেটা স্পষ্ট দেখাতে হবে, আর ফোকাসের ক্রম যুক্তিসঙ্গত হতে হবে। এটা অ্যাক্সেসিবিলিটির কাজের সাথেই মেলে ([ক্যাপশন ও অ্যাক্সেসিবিলিটি](/notes/video-player/07-captions-audio-a11y))।

## Chromecast আর AirPlay: sender ও receiver

<Mermaid
title="Casting model"
code={`sequenceDiagram
  participant S as "Sender (phone app or browser)"
  participant R as "Receiver (Chromecast or Apple TV)"
  participant C as "CDN"
  S->>R: "load(contentUrl, metadata, startTime, auth)"
  R->>C: "fetch manifest and segments directly"
  C-->>R: "media"
  R-->>S: "status updates (playing, position, error)"
  S->>R: "pause, seek, volume"`}
/>

মূল ধারণাটা এক জায়গায়: **receiver নিজে CDN থেকে ভিডিও আনে।** ফোন শুধু রিমোট। এর তিনটা ফল:

1. **receiver-কে manifest আর সেগমেন্টে সরাসরি পৌঁছাতে হবে।** কনটেন্ট যদি কুকি বা ফোনের ভেতরের টোকেনে সুরক্ষিত থাকে, receiver সেটা পায় না। কাস্ট করার সময় একটা short-lived signed URL বা টোকেন পাঠান ([VOD সিকিউরিটি](/notes/vod/08-security))।
2. **CORS লাগে।** Chromecast-এর Web Receiver একটা ওয়েব পেজ; আপনার CDN-কে receiver-এর অরিজিনের জন্য সঠিক CORS হেডার দিতে হবে।
3. **DRM-এর জন্য নিজের receiver লাগে।** ২০২৬ সালের অক্টোবরে Google Cast-এর ডকস অনুযায়ী, Google-এর Default Media Receiver কোনো রেজিস্ট্রেশন ছাড়াই সাধারণ অডিও-ভিডিও চালায়, কিন্তু DRM বা কাস্টম লজিকের জন্য **Custom Web Receiver** বানিয়ে নিজে হোস্ট করতে হয়।

Chrome-এ ওয়েব sender শুরু করা এরকম (নাম আর অপশন Cast-এর ওয়েব sender ডকসে মিলিয়ে নিন):

```javascript
window.__onGCastApiAvailable = (ok) => {
  if (!ok) return;
  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
  });
};

async function castCurrent(url, title, position) {
  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (!session) return;
  const info = new chrome.cast.media.MediaInfo(url, 'application/x-mpegURL');
  info.metadata = new chrome.cast.media.GenericMediaMetadata();
  info.metadata.title = title;
  const req = new chrome.cast.media.LoadRequest(info);
  req.currentTime = position;
  await session.loadMedia(req);
}
```

**AirPlay** Apple-এর জগতে একই কাজ করে। AVPlayer-এ এটা প্রায় বিনা খরচে আসে (`allowsExternalPlayback` ডিফল্টে চালু)। Safari-তে `video` এলিমেন্টে AirPlay বোতাম দেখায়, যদি না আপনি নিজে নিষেধ করেন। MSE দিয়ে চালানো ভিডিও সরাসরি AirPlay হয় না, কারণ Apple TV-কে একটা URL দিতে হয়, মেমরির বাফার না। তাই Safari-তে AirPlay ভালো চালাতে চাইলে নেটিভ HLS পথ রাখুন।

ওয়েবে একটা মানক API-ও আছে, **Remote Playback API** (`video.remote.prompt()`), যা কিছু ব্রাউজারে কাস্টিং ডিভাইস বাছার ডায়ালগ খোলে। এটার সাপোর্ট সীমিত, তাই ব্যবহারের আগে MDN দেখুন।

## Picture-in-Picture আর লক-স্ক্রিন কন্ট্রোল

### ওয়েবে PiP

```javascript
if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
  pipButton.hidden = false;
  pipButton.onclick = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch (e) {
      console.warn('pip failed', e.name);
    }
  };
}
```

`requestPictureInPicture()` ইউজারের ক্লিকের ভেতরেই ডাকতে হয়। ভিডিওর উপর নিজের কন্ট্রোল বা ক্যাপশন ভাসিয়ে রাখতে চাইলে নতুন **Document Picture-in-Picture** API আছে, যা পুরো একটা ছোট জানালা দেয়; এটা সব ব্রাউজারে নেই।

### Media Session API

লক-স্ক্রিনে, নোটিফিকেশনে আর হেডফোনের বোতামে প্লেয়ারকে নিয়ন্ত্রণযোগ্য করে Media Session। ২০২৬ সালের অক্টোবরে MDN-এর ডকস মিলিয়ে:

```javascript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'খাঁচার ভিতর অচিন পাখি',
    artist: 'বায়তুল হিকমা সেশন',
    artwork: [{ src: 'https://cdn.baytalhikma.org/art/512.png', sizes: '512x512', type: 'image/png' }]
  });

  const set = (action, fn) => {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      // action not supported on this browser
    }
  };
  set('play', () => video.play());
  set('pause', () => video.pause());
  set('seekbackward', (d) => (video.currentTime -= d.seekOffset || 10));
  set('seekforward', (d) => (video.currentTime += d.seekOffset || 10));
  set('seekto', (d) => (video.currentTime = d.seekTime));

  video.addEventListener('timeupdate', () => {
    if (!isFinite(video.duration)) return; // live streams have no fixed duration
    navigator.mediaSession.setPositionState({
      duration: video.duration,
      playbackRate: video.playbackRate,
      position: video.currentTime
    });
  });
}
```

লাইভ স্ট্রিমে `duration` হলো `Infinity`, আর তখন `setPositionState` এরর দেয়। উপরের গার্ডটা সেজন্য।

Android-এ একই কাজ করে Media3-এর `MediaSession`, আর iOS-এ `MPNowPlayingInfoCenter` ও `MPRemoteCommandCenter`; AVPlayerViewController ব্যবহার করলে এর বড় অংশ নিজেই হয়ে যায়।

## হার্ডওয়্যার ডিকোড, ব্যাটারি আর গরম ফোন

মোবাইলে সবচেয়ে বড় পারফরম্যান্স প্রশ্ন একটাই: **এই কোডেক এই ডিভাইসে হার্ডওয়্যারে ডিকোড হয় কিনা।** হার্ডওয়্যারে হলে ব্যাটারি কম খরচ হয়, ফোন ঠান্ডা থাকে। সফটওয়্যারে হলে উচ্চ রেজোলিউশনে ফ্রেম ড্রপ হয়, ফোন গরম হয়, আর কিছুক্ষণ পর OS নিজেই CPU-র গতি কমিয়ে দেয় (thermal throttling), তখন আরও বেশি ফ্রেম ড্রপ।

সাধারণ চিত্র (মোটামুটি, ডিভাইস আর বছরভেদে আলাদা):

- **H.264:** প্রায় সব ডিভাইসে হার্ডওয়্যারে। নিরাপদ ফলব্যাক।
- **HEVC (H.265):** Apple ডিভাইসে বহু বছর ধরে হার্ডওয়্যারে; Android আর TV-তে অনেক মডেলে আছে, সস্তা ফোনে নাও থাকতে পারে; ডেস্কটপ ব্রাউজারে সাপোর্ট OS আর হার্ডওয়্যারের উপর নির্ভর করে।
- **AV1:** নতুন ডিভাইসে বাড়ছে। নতুন কিছু Apple চিপ, নতুন উচ্চমানের Android ফোন আর নতুন TV-তে হার্ডওয়্যার ডিকোড আছে; পুরনো আর কম দামি ডিভাইসে সফটওয়্যার ডিকোড বা একেবারেই নেই।

<Callout type="tip">

**কোডেক সাপোর্ট মুখস্থ রাখবেন না, ডিভাইসকে জিজ্ঞেস করুন।** ওয়েবে `navigator.mediaCapabilities.decodingInfo()` বলে দেয় একটা কোডেক-রেজোলিউশন-bitrate জোড়া `supported`, `smooth` আর `powerEfficient` কিনা। `powerEfficient: false` মানে প্রায় নিশ্চিতভাবেই সফটওয়্যার ডিকোড। Android-এ `MediaCodecList`, আর iOS-এ `VTIsHardwareDecodeSupported` একই প্রশ্নের উত্তর দেয়।

</Callout>

```javascript
async function pickCodec() {
  const candidates = [
    { name: 'av1', contentType: 'video/mp4; codecs="av01.0.08M.08"' },
    { name: 'hevc', contentType: 'video/mp4; codecs="hvc1.1.6.L120.90"' },
    { name: 'h264', contentType: 'video/mp4; codecs="avc1.640028"' }
  ];
  for (const c of candidates) {
    const r = await navigator.mediaCapabilities.decodingInfo({
      type: 'media-source',
      video: { contentType: c.contentType, width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 }
    });
    if (r.supported && r.smooth && r.powerEfficient) return c.name;
  }
  return 'h264';
}
```

এই ফলাফল দিয়ে প্লেয়ার manifest-এর কোন কোডেকের রেন্ডিশন রাখবে আর কোনটা বাদ দেবে সেটা ঠিক করে। MDN-এর নোট অনুযায়ী, ডিভাইসের পরিসংখ্যান জমা হওয়ার আগে ব্রাউজার `smooth` আর `powerEfficient` আশাবাদীভাবে `true` বলতে পারে, তাই এটা একটা ভালো অনুমান, গ্যারান্টি না।

মোবাইল ডেটায় আরেকটা বাস্তব বিষয় হলো **খরচ**। অনেক দর্শক মেগাবাইট গুনে ডেটা কেনেন। সেলুলারে ডিফল্ট সর্বোচ্চ কোয়ালিটি সীমিত রাখুন (AVPlayer-এ `preferredPeakBitRate`, ExoPlayer-এ track selection parameters), আর ইউজারকে স্পষ্টভাবে "ডেটা সেভার" বেছে নেওয়ার সুযোগ দিন।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন যেভাবে | সমাধান |
| --- | --- | --- |
| iPhone-এ ওয়েব প্লেয়ার চলে না, ডেস্কটপে চলে | `window.MediaSource` আর `window.ManagedMediaSource` কোনটা আছে লগ করুন | Safari-তে নেটিভ HLS-এ ফলব্যাক (`video.src = m3u8`), বা ManagedMediaSource সমর্থিত প্লেয়ার ভার্সন |
| iOS-এ ভিডিওর শব্দ নেই | ফোনের সাইলেন্ট সুইচ চালু? অডিও সেশনের ক্যাটাগরি কী? | `AVAudioSession` ক্যাটাগরি `.playback` |
| ফোন লক করলে অডিও থেমে যায় | Background Modes চালু আছে কিনা Xcode-এ দেখুন | Audio, AirPlay, and PiP ব্যাকগ্রাউন্ড মোড; Android-এ `MediaSessionService` |
| Android-এ দ্বিতীয় ভিডিও চালালে প্রথমটা কালো বা ক্র্যাশ | `adb logcat` এ `MediaCodec` এরর | এক সময়ে একটা প্লেয়ার; প্রিভিউ প্লেয়ার `release()` করুন |
| TV-তে কিছুক্ষণ পর অ্যাপ বন্ধ | কনসোলে `QuotaExceededError`, বা মেমরি গ্রাফ বাড়তে থাকে | বাফার লক্ষ্য কমান, back buffer মুছুন |
| TV-তে প্লেয়ার লোডই হয় না, সিনট্যাক্স এরর | TV-র রিমোট ডিবাগারে কনসোল (Tizen/webOS ডেভ টুলস) | পুরনো টার্গেটে ট্রান্সপাইল, পলিফিল |
| Chromecast-এ "media failed to load" | receiver ডিবাগার (Chrome-এর remote inspect) Network ট্যাবে CORS বা 403 | CDN-এ receiver অরিজিনের জন্য CORS; কাস্টে signed URL পাঠান |
| Chromecast-এ DRM কনটেন্ট চলে না | Default Media Receiver ব্যবহার হচ্ছে কিনা | Custom Web Receiver বানিয়ে লাইসেন্স URL আর হেডার সেট করুন |
| AirPlay বোতাম দেখায় না | ভিডিও MSE দিয়ে চলছে কিনা | Safari-তে নেটিভ HLS পথ; `disableRemotePlayback` সেট করা নেই নিশ্চিত করুন |
| লাইভে লক-স্ক্রিন কন্ট্রোল এরর দেয় | কনসোলে `setPositionState` এরর | `duration` অসীম হলে পজিশন স্টেট পাঠাবেন না |
| ফোন গরম, ফ্রেম ড্রপ | `video.getVideoPlaybackQuality().droppedVideoFrames` বাড়ছে; `decodingInfo` এ `powerEfficient: false` | ওই কোডেক বা রেজোলিউশন বাদ দিন, H.264 বা কম রেজোলিউশনে নামুন |

## মূল শিক্ষা

1. **একটা স্ট্রিম, অনেক প্লেয়ার।** CMAF, `cbcs` আর HLS ও DASH দুটো manifest রাখলে প্রায় সব প্ল্যাটফর্ম একই সেগমেন্ট পড়ে।
2. **Apple-এ কার্যত HLS আর FairPlay, Android-এ Media3 আর Widevine।** নিজের প্লেয়ার লজিক প্রতিটা প্ল্যাটফর্মের সীমার মধ্যে বসাতে হয়।
3. **TV হলো পুরনো ব্রাউজার আর কম মেমরি।** ট্রান্সপাইল করুন, বাফার ছোট রাখুন, আসল ডিভাইসে টেস্ট করুন।
4. **কাস্টিংয়ে receiver নিজে ভিডিও আনে।** তাকে URL, টোকেন আর CORS দিন; DRM-এর জন্য নিজের receiver।
5. **PiP আর Media Session ছোট কাজ, বড় পার্থক্য।** লাইভে অসীম `duration`-এর গার্ড রাখুন।
6. **কোডেক সাপোর্ট জিজ্ঞেস করুন, মুখস্থ রাখবেন না।** `powerEfficient: false` মানে ব্যাটারি আর গরম ফোন।
7. **মোবাইল ডেটায় দর্শকের খরচকে সম্মান করুন।** সেলুলারে কোয়ালিটির সীমা আর স্পষ্ট ডেটা সেভার।
