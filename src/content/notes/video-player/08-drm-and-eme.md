---
title: 'DRM ও EME: প্লেয়ারের দিক থেকে'
subtitle: 'requestMediaKeySystemAccess থেকে লাইসেন্স পর্যন্ত প্রতিটা ধাপ, Widevine, PlayReady আর FairPlay-এর পার্থক্য, robustness, HDCP-র কালো স্ক্রিন, আর DRM এরর পড়ে কারণ বের করা।'
chapter: 8
level: 'advanced'
readingTime: '২২ মিনিট'
topics: ['drm', 'eme', 'widevine', 'playready', 'fairplay', 'cdm', 'hdcp', 'shaka-player']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মতিঝিলের এক ব্যাংকের ভল্টে ফাতিমার একটা লকার আছে। লকারে তালা দুটো। একটার চাবি ফাতিমার কাছে, আরেকটার চাবি থাকে ব্যাংকের লকার অফিসার কিন্দির কাছে। ফাতিমা একা গেলে লকার খুলবে না, কিন্দি একা চাইলেও খুলবে না। দুজনকে একসাথে ভল্টে ঢুকতে হয়। আর ঢোকার আগে কাউন্টারে রেজিস্টারে সই করতে হয়, ছবিসহ পরিচয়পত্র দেখাতে হয়। কিন্দি রেজিস্টার মিলিয়ে দেখেন ফাতিমার লকারের ভাড়া বকেয়া কিনা, অ্যাকাউন্ট সচল কিনা। সব ঠিক থাকলে তবেই তিনি চাবি নিয়ে ভল্টের দিকে হাঁটেন।

ভল্টের ভেতরেও নিয়ম আছে। ফাতিমা গয়না বের করে দেখতে পারবেন, কিন্তু ভল্টের ঘরের বাইরে ফটোকপি মেশিনে কাগজপত্র নেওয়া যাবে না। ভল্টের দরজায় ক্যামেরা, ঘরের ভেতরে মোবাইল নিষেধ। কোনো কোনো দামি লকারে নিয়ম আরও কড়া: ভল্টের ঘরটাকে আলাদা করে সিল করা থাকতে হবে, নইলে লকারই খোলা হবে না। একদিন ফাতিমা গিয়ে দেখেন কিন্দি বলছেন, "আপা, আপনার লকারের মেয়াদ গত মাসে শেষ, নবায়ন না করলে খুলতে পারব না।" আরেকদিন নতুন শাখায় গিয়ে দেখেন সেই শাখায় এই ধরনের লকারের ব্যবস্থাই নেই।

মিলিয়ে নিই: লকারে রাখা জিনিস হলো **এনক্রিপ্টেড ভিডিও সেগমেন্ট**, ফাতিমা হলো **প্লেয়ার অ্যাপ**, কিন্দি আর তার রেজিস্টার হলো **লাইসেন্স সার্ভার** আর তার এনটাইটেলমেন্ট চেক, কাউন্টারের পরিচয়পত্র দেখানো হলো **লাইসেন্স রিকোয়েস্টের সাথে অথ টোকেন**। দুই তালার ব্যবস্থাটা হলো **EME আর CDM**: অ্যাপ নিজে কখনো চাবি হাতে পায় না, চাবি যায় ব্রাউজারের ভেতরের **CDM**-এর কাছে। ভল্টের বাইরে ফটোকপি নিষেধ হলো **secure decode path**, সিল করা ঘরের শর্ত হলো **robustness level** (Widevine L1 বনাম L3), দরজার ক্যামেরা হলো **HDCP output protection**, মেয়াদ শেষ হলো **expired লাইসেন্স**, আর যে শাখায় এই লকার নেই সেটা হলো **key system support না থাকা ব্রাউজার**। বাস্তবে Netflix থেকে স্থানীয় OTT অ্যাপ পর্যন্ত সবাই ঠিক এই নকশায় চলে।

## এই চ্যাপ্টার কোথা থেকে শুরু

প্যাকেজিংয়ের দিক, অর্থাৎ CENC, `cenc` বনাম `cbcs`, PSSH বক্স আর key ID, সেটা আছে [ভিডিও ট্র্যাকের প্যাকেজিং চ্যাপ্টারে](/notes/video/06-packaging-for-streaming)। আর EME যে আছে, সেই এক অনুচ্ছেদের পরিচয় আছে [প্লেব্যাক ও ABR চ্যাপ্টারে](/notes/video/07-playback-and-abr)। এখানে আমরা প্লেয়ারের ভেতরে ঢুকব: কোন API কখন ডাকা হয়, কোন ডেটা কোথা থেকে কোথায় যায়, আর কোথায় কী ভাঙে।

<Callout type="info">

**এই চ্যাপ্টার DRM বাস্তবায়ন আর ডিবাগিং নিয়ে।** DRM ভাঙা বা কনটেন্ট কপি করার কোনো পদ্ধতি এখানে নেই, আর থাকবেও না। লক্ষ্য হলো বৈধ লাইসেন্স থাকা ইউজারের প্লেব্যাক যেন না আটকায়।

</Callout>

## পুরো ফ্লো এক নজরে

<Mermaid
title="EME license flow"
code={`sequenceDiagram
  participant A as "Player app (JS)"
  participant B as "Browser + CDM"
  participant L as "Your license proxy"
  participant K as "DRM license server"
  A->>B: "requestMediaKeySystemAccess(keySystem, configs)"
  B-->>A: "MediaKeySystemAccess"
  A->>B: "createMediaKeys() then video.setMediaKeys()"
  A->>B: "append encrypted init segment"
  B-->>A: "encrypted event (initDataType, initData = PSSH)"
  A->>B: "createSession() then generateRequest(initData)"
  B-->>A: "message event (license challenge bytes)"
  A->>L: "POST challenge + user auth token"
  L->>L: "check entitlement"
  L->>K: "forward challenge"
  K-->>L: "license bytes"
  L-->>A: "license bytes"
  A->>B: "session.update(license)"
  B-->>A: "keystatuseschange: usable"
  B->>B: "decrypt and decode inside the CDM"`}
/>

পাঁচটা জিনিস মনে রাখার মতো:

1. **অ্যাপ কখনো কনটেন্ট key দেখে না।** অ্যাপ শুধু দুটো অস্বচ্ছ বাইটের গোছা আনা-নেওয়া করে: CDM-এর বানানো challenge আর লাইসেন্স সার্ভারের দেওয়া license। ভেতরে কী আছে, সেটা পড়া অ্যাপের কাজ না।
2. **লাইসেন্স প্রক্সি আপনার নিজের সার্ভার।** DRM ভেন্ডরের লাইসেন্স সার্ভার জানে না কে টাকা দিয়েছে। আপনার প্রক্সি ইউজারের সেশন চেক করে, তারপর ফরোয়ার্ড করে। এটাই আসল ব্যবসায়িক নিয়ম যেখানে থাকে।
3. **`encrypted` ইভেন্ট আসে মিডিয়া থেকে।** init segment-এর PSSH বক্স (বা HLS-এ `skd://` URI) দেখে ব্রাউজার জানায় এই কনটেন্টের key লাগবে।
4. **ডিক্রিপশন আর ডিকোড CDM-এর ভেতরে হয়।** হার্ডওয়্যার-সমর্থিত ডিভাইসে ডিকোড করা ফ্রেম পর্যন্ত মেমরিতে অ্যাপের নাগালে আসে না।
5. **প্রায় সব প্রোডাকশন প্লেয়ার (Shaka, dash.js, hls.js, Video.js-এর প্লাগইন) এই ফ্লো নিজেই চালায়।** আপনি দেন key system আর লাইসেন্স URL। তবু ফ্লোটা জানতে হয়, কারণ ভাঙলে কোন ধাপে ভাঙল সেটা বুঝতে না পারলে এরর মেসেজের মানে বোঝা যায় না।

## ধাপ ১: key system চাওয়া

```javascript
const config = [
  {
    initDataTypes: ['cenc'],
    videoCapabilities: [
      {
        contentType: 'video/mp4; codecs="avc1.640028"',
        robustness: 'HW_SECURE_ALL',
        encryptionScheme: 'cbcs'
      },
      {
        contentType: 'video/mp4; codecs="avc1.640028"',
        robustness: 'SW_SECURE_CRYPTO',
        encryptionScheme: 'cbcs'
      }
    ],
    audioCapabilities: [
      { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' }
    ],
    persistentState: 'optional',
    distinctiveIdentifier: 'optional',
    sessionTypes: ['temporary']
  }
];

const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
console.log(access.getConfiguration().videoCapabilities);
```

ব্রাউজার `videoCapabilities` তালিকা থেকে প্রথম যেটা পারে সেটা বেছে নেয়। তাই সবচেয়ে কড়া robustness আগে রাখুন, শিথিলটা পরে। `getConfiguration()` বলে দেয় শেষ পর্যন্ত কোনটা মঞ্জুর হলো। এটা লগ করলেই বোঝা যায় ডিভাইসটা হার্ডওয়্যার সিকিউরিটি দিচ্ছে নাকি শুধু সফটওয়্যার।

২০২৬ সালের অক্টোবরে MDN-এর ডকস অনুযায়ী তিনটা এরর আসতে পারে:

| এরর | মানে |
| --- | --- |
| `NotSupportedError` | key system নেই, অথবা কোনো config-ই মেলেনি (যেমন কোডেক বা robustness সমর্থিত না) |
| `SecurityError` | `Permissions-Policy: encrypted-media` দিয়ে ব্লক করা, সাধারণত iframe-এ `allow="encrypted-media"` না দেওয়ায় |
| `TypeError` | key system খালি স্ট্রিং, বা config অ্যারে খালি |

EME শুধু **secure context**-এ (HTTPS) কাজ করে। লোকাল ডেভেলপমেন্টে `localhost` সাধারণত ছাড় পায়, কিন্তু LAN IP দিয়ে ফোন থেকে খুললে পায় না, আর তখন `navigator.requestMediaKeySystemAccess` জিনিসটাই থাকে না।

### key system-এর নাম

| DRM | key system স্ট্রিং | কোথায় পাওয়া যায় (মোটামুটি, নিচের নোট দেখুন) |
| --- | --- | --- |
| Widevine | `com.widevine.alpha` | Chrome, Firefox, Edge, Android, Android TV, Chromecast, অনেক স্মার্ট TV |
| PlayReady | `com.microsoft.playready` (আর `com.microsoft.playready.recommendation`) | Edge on Windows, Xbox, অনেক স্মার্ট TV ও সেট-টপ বক্স |
| FairPlay | `com.apple.fps` (পুরনো `com.apple.fps.1_0`) | Safari (macOS, iOS, iPadOS), Apple TV |
| Clear Key | `org.w3.clearkey` | প্রায় সব EME ব্রাউজার; কোনো সুরক্ষা নেই, শুধু টেস্টের জন্য |

<Callout type="warning">

কোন ব্রাউজার-OS জোড়ায় কোন DRM আর কোন লেভেল পাওয়া যায়, সেটা বদলায়। উপরের টেবিল ২০২৬ সালের অক্টোবরের সাধারণ চিত্র, নিশ্চিত তালিকা না। লঞ্চের আগে নিজের টার্গেট ডিভাইসে নিচের প্রোব স্ক্রিপ্ট চালিয়ে দেখুন, আর DRM ভেন্ডরের সাপোর্ট পেজ মিলিয়ে নিন।

</Callout>

### একটা প্রোব স্ক্রিপ্ট

```javascript
const systems = ['com.widevine.alpha', 'com.microsoft.playready.recommendation', 'com.apple.fps', 'org.w3.clearkey'];
const levels = ['HW_SECURE_ALL', 'HW_SECURE_DECODE', 'SW_SECURE_DECODE', 'SW_SECURE_CRYPTO', ''];
const video = 'video/mp4; codecs="avc1.640028"';

for (const ks of systems) {
  for (const robustness of levels) {
    try {
      await navigator.requestMediaKeySystemAccess(ks, [
        { initDataTypes: ['cenc', 'sinf', 'skd'], videoCapabilities: [{ contentType: video, robustness }] }
      ]);
      console.log(`${ks} OK at "${robustness || 'any'}"`);
      break;
    } catch (e) {
      // try the next, looser level
    }
  }
}
```

ডেস্কটপ Chrome-এ এটা চালালে সাধারণত এরকম কিছু আসে (উদাহরণ):

```text
com.widevine.alpha OK at "SW_SECURE_DECODE"
org.w3.clearkey OK at "any"
```

মানে ডেস্কটপ Chrome সাধারণত সফটওয়্যার-লেভেলের Widevine দেয়। একই কোড একটা Android ফোনের Chrome-এ `HW_SECURE_ALL` পর্যন্ত যেতে পারে। এই পার্থক্যটাই পরের সেকশনের বিষয়।

## Robustness: L1, L3, SL2000, SL3000

DRM চুক্তিতে স্টুডিও লিখে দেয় কোন কোয়ালিটি কোন নিরাপত্তা লেভেলে দেওয়া যাবে। প্লেয়ারকে সেই নিয়ম মানতে হয়, আর সেটা হয় robustness দিয়ে।

| সিস্টেম | লেভেল | মানে |
| --- | --- | --- |
| Widevine | L1 (`HW_SECURE_ALL`, `HW_SECURE_DECODE`) | ডিক্রিপ্ট আর ডিকোড দুটোই হার্ডওয়্যারের trusted execution environment-এ |
| Widevine | L2 (`HW_SECURE_CRYPTO`) | শুধু ডিক্রিপ্ট হার্ডওয়্যারে, ডিকোড সফটওয়্যারে; বিরল |
| Widevine | L3 (`SW_SECURE_DECODE`, `SW_SECURE_CRYPTO`) | সব সফটওয়্যারে |
| PlayReady | SL3000 | হার্ডওয়্যার-সমর্থিত |
| PlayReady | SL2000 | সফটওয়্যার-ভিত্তিক |
| FairPlay | আলাদা নাম নেই | Apple-এর হার্ডওয়্যারে স্বাভাবিকভাবেই সুরক্ষিত পথ |

বাস্তবে এর ফল হলো **কোয়ালিটির সিলিং**। একটা সাধারণ নিয়ম হতে পারে: L3-তে সর্বোচ্চ 540p বা 720p, L1-এ 1080p আর 4K। এই নিয়ম দুই জায়গায় প্রয়োগ হয়:

- **লাইসেন্স সার্ভারে:** লাইসেন্সে key-গুলোর সাথে শর্ত জুড়ে দেওয়া হয়। HD রেন্ডিশনের key শুধু L1 ক্লায়েন্টকে দেওয়া হয়।
- **প্লেয়ারে:** প্লেয়ার যে রেন্ডিশনের key পায়নি সেটা ABR থেকে বাদ দেয়। Shaka আর dash.js এটা নিজেরাই করে, যদি HD আর SD রেন্ডিশন আলাদা key ID-তে এনক্রিপ্ট করা থাকে।

<Callout type="tip">

**HD আর SD-কে আলাদা key দিয়ে এনক্রিপ্ট করুন।** সব রেন্ডিশন এক key-তে থাকলে L3 ডিভাইসকে হয় সবকিছু দিতে হয়, নয় কিছুই না। আলাদা key থাকলে L3 ডিভাইস SD পায় আর ভিডিও চলে; L1 ডিভাইস সব পায়।

</Callout>

## ধাপ ২: সেশন আর লাইসেন্স, হাতে লেখা

প্রোডাকশনে এটা লাইব্রেরি করে। কিন্তু একবার হাতে লিখে দেখলে প্রতিটা এররের মানে পরিষ্কার হয়ে যায়।

```javascript
const video = document.querySelector('video');
const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
const mediaKeys = await access.createMediaKeys();
await video.setMediaKeys(mediaKeys);

video.addEventListener('encrypted', async (event) => {
  const session = mediaKeys.createSession('temporary');

  session.addEventListener('message', async (msg) => {
    const res = await fetch('https://license.baytalhikma.org/widevine', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: msg.message
    });
    if (!res.ok) {
      console.error('license denied', res.status, await res.text());
      return;
    }
    await session.update(await res.arrayBuffer());
  });

  session.addEventListener('keystatuseschange', () => {
    for (const [keyId, status] of session.keyStatuses) {
      console.log(toHex(keyId), status);
    }
  });

  await session.generateRequest(event.initDataType, event.initData);
});

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

সব ঠিক থাকলে কনসোলে এরকম আসে (উদাহরণ):

```text
3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b usable
7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f output-restricted
```

এই একটা আউটপুট অনেক কিছু বলে। প্রথম key (ধরুন SD) চালানো যাবে। দ্বিতীয়টা (HD) বৈধ, কিন্তু আউটপুট সুরক্ষার শর্ত মেলেনি, সম্ভবত HDCP।

### key status-এর পুরো তালিকা

EME স্পেক অনুযায়ী (২০২৬ সালের অক্টোবরে MDN আর W3C স্পেক মিলিয়ে):

| status | মানে | কী করবেন |
| --- | --- | --- |
| `usable` | চালানো যাবে | কিছু না |
| `expired` | লাইসেন্সের মেয়াদ শেষ | নতুন লাইসেন্স নিন, বা ইউজারকে বলুন সাবস্ক্রিপশন দেখতে |
| `released` | সেশন key ছেড়ে দিয়েছে | সাধারণত `remove()`-এর পরে, স্বাভাবিক |
| `output-restricted` | key ঠিক আছে, কিন্তু আউটপুট শর্ত মেলেনি | ওই রেন্ডিশন বাদ দিন, বা ইউজারকে HDCP-সমর্থিত ডিসপ্লে ব্যবহার করতে বলুন |
| `output-downscaled` | চলবে, কিন্তু কম রেজোলিউশনে | কিছু না, তবে QoE-তে লগ করুন |
| `status-pending` | এখনো জানা নেই | অপেক্ষা |
| `internal-error` | CDM-এর ভেতরে অপ্রত্যাশিত সমস্যা | রিলোড, CDM আপডেট, ডিভাইস লগ |
| `usable-in-future` | এখনো সময় হয়নি (লাইসেন্সের শুরুর সময় সামনে) | প্রিমিয়ারের আগে আগাম লাইসেন্সে দেখা যায় |

## HDCP আর কালো স্ক্রিন

সবচেয়ে বিভ্রান্তিকর DRM বাগ হলো **অডিও চলছে, স্ক্রিন কালো, কোনো এরর নেই**। প্রায় সবসময় এর কারণ HDCP।

HDCP হলো ডিভাইস থেকে ডিসপ্লে পর্যন্ত কেবলের এনক্রিপশন। লাইসেন্সে লেখা থাকতে পারে "এই key শুধু HDCP 2.2 থাকলে"। তখন যা ঘটে:

- **পুরনো মনিটর বা HDMI স্প্লিটার/ক্যাপচার কার্ড:** HDCP নেই, তাই key `output-restricted`, আর ফ্রেম কালো।
- **ল্যাপটপে বাইরের মনিটর লাগানো মাত্র:** ভিডিও কালো হয়ে যায়, কারণ নতুন আউটপুট শর্ত মেলায় না।
- **স্ক্রিন শেয়ার বা স্ক্রিনশট:** হার্ডওয়্যার পথে কালো আসে। এটা বাগ না, এটাই উদ্দেশ্য।

প্লেয়ারের কাজ হলো এটা লুকিয়ে না রাখা। `keystatuseschange`-এ `output-restricted` এলে ওই রেন্ডিশন ABR থেকে বাদ দিয়ে কম কোয়ালিটিতে নামুন (যদি SD-র key আলাদা আর শর্ত শিথিল হয়), আর না পারলে স্পষ্ট বার্তা দেখান: "এই ডিসপ্লেতে HD চালানো যাচ্ছে না, ল্যাপটপের নিজের স্ক্রিনে চেষ্টা করুন।"

HDCP লেভেল আগে থেকে জানার একটা প্রস্তাবিত API আছে (`MediaKeys.getStatusForPolicy`), কিন্তু সব ব্রাউজারে নেই। ২০২৬ সালের অক্টোবরে এটার সাপোর্ট নিশ্চিত করতে পারিনি; ব্যবহারের আগে MDN-এ দেখে নিন, আর না থাকলে key status-এর উপরেই ভরসা করুন।

## FairPlay আলাদা কেন

Widevine আর PlayReady CENC-এর PSSH বক্স থেকে initData পায়। FairPlay-এর ধরন একটু আলাদা:

1. **সার্ভার সার্টিফিকেট আগে লাগে।** Apple থেকে পাওয়া FairPlay সার্টিফিকেট (DER ফাইল) প্লেয়ারকে আগে আনতে হয়, আর CDM সেটা দিয়ে challenge বানায়।
2. **initData আসে HLS-এর `EXT-X-KEY` থেকে।** playlist-এ `URI="skd://..."` থাকে; ওই `skd://` অংশ থেকেই content ID বের হয়।
3. **challenge-কে বলে SPC, license-কে বলে CKC।** অনেক FairPlay সার্ভার SPC চায় base64 করে ফর্ম প্যারামিটারে, আর CKC ফেরত দেয় base64 করে, কখনো XML ট্যাগে মোড়া।
4. **শুধু `cbcs`।** তাই এক সেট সেগমেন্টে তিন DRM চালাতে হলে `cbcs`-ই বাছতে হয় ([প্যাকেজিং চ্যাপ্টার](/notes/video/06-packaging-for-streaming) দেখুন)।
5. **Safari-তে সাধারণত নেটিভ HLS।** MSE-ভিত্তিক প্লেয়ারও FairPlay চালাতে পারে, তবে নেটিভ পথটাই বেশি পরীক্ষিত।

```text
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://baytalhikma.org/kid/3f2a9c1e",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"
#EXTINF:6.0,
seg_00001.m4s
```

## Shaka Player দিয়ে মাল্টি-DRM

প্রোডাকশনে এটুকুই বেশিরভাগ কাজ। নিচের কনফিগ Shaka Player-এর অফিশিয়াল ডকস মিলিয়ে লেখা (২০২৬ সালের অক্টোবর):

```javascript
const player = new shaka.Player();
await player.attach(document.querySelector('video'));

const cert = await (await fetch('https://license.baytalhikma.org/fairplay.der')).arrayBuffer();

player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://license.baytalhikma.org/widevine',
      'com.microsoft.playready': 'https://license.baytalhikma.org/playready',
      'com.apple.fps': 'https://license.baytalhikma.org/fairplay'
    },
    advanced: {
      'com.widevine.alpha': {
        videoRobustness: ['HW_SECURE_ALL', 'SW_SECURE_DECODE'],
        audioRobustness: ['SW_SECURE_CRYPTO']
      },
      'com.apple.fps': {
        serverCertificate: new Uint8Array(cert)
      }
    }
  }
});

player.getNetworkingEngine().registerRequestFilter((type, request) => {
  if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) return;
  request.headers['Authorization'] = `Bearer ${userToken}`;
});

player.addEventListener('error', (e) => {
  console.error('shaka error', e.detail.category, e.detail.code, e.detail.data);
});

await player.load('https://cdn.baytalhikma.org/v/abc123/manifest.mpd');
```

কয়েকটা জিনিস খেয়াল করুন:

- **অথ টোকেন রিকোয়েস্ট ফিল্টারে।** লাইসেন্স URL-এ টোকেন query string হিসেবে বসাবেন না; লগে আর রেফারারে ছড়িয়ে পড়ে।
- **robustness একটা তালিকা।** Shaka প্রথমটা চেষ্টা করে, না পেলে পরেরটা।
- **FairPlay সার্ভার যদি SPC/CKC base64 ফর্মে চায়,** Shaka-র FairPlay টিউটোরিয়ালে রিকোয়েস্ট আর রেসপন্স ফিল্টারের উদাহরণ আছে; নিজের সার্ভারের ফরম্যাট দেখে সেটা লাগান।
- **এরর ইভেন্টে `category` আর `code` লগ করুন।** Shaka-র এরর কোড ডকসে প্রতিটা কোডের মানে লেখা আছে; DRM-এর কোডগুলো `DRM` ক্যাটাগরিতে (৬০০০-এর ঘরে)।

## লাইসেন্স প্রক্সি: আপনার সার্ভারের দিক

প্রক্সিটা ছোট কিন্তু গুরুত্বপূর্ণ। Go-তে একটা কঙ্কাল:

```go
func licenseHandler(upstream string) http.HandlerFunc {
	client := &http.Client{Timeout: 5 * time.Second}
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := authenticate(r)
		if err != nil {
			http.Error(w, `{"code":"auth_required"}`, http.StatusUnauthorized)
			return
		}
		videoID := r.URL.Query().Get("v")
		if !entitled(r.Context(), user, videoID) {
			http.Error(w, `{"code":"not_entitled"}`, http.StatusForbidden)
			return
		}
		challenge, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil {
			http.Error(w, `{"code":"bad_request"}`, http.StatusBadRequest)
			return
		}
		resp, err := client.Post(upstream, "application/octet-stream", bytes.NewReader(challenge))
		if err != nil {
			http.Error(w, `{"code":"license_upstream_unavailable"}`, http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}
```

- **লাইসেন্স রেসপন্স কখনো ক্যাশ হবে না।** `Cache-Control: no-store`, আর CDN-এ এই পাথ বাইপাস। একজনের লাইসেন্স আরেকজনের কাছে গেলে সে প্লে করতে পারবে না, কিন্তু আপনার এনটাইটেলমেন্ট চেক অর্থহীন হয়ে যাবে ([CDN ডায়নামিক কন্টেন্ট](/notes/cdn/09-dynamic-content) দেখুন)।
- **এরর কোড স্থির আর মেশিন-পাঠযোগ্য।** প্লেয়ার `not_entitled` দেখে "সাবস্ক্রিপশন দরকার" দেখাবে, `license_upstream_unavailable` দেখে "একটু পরে চেষ্টা করুন"।
- **লাইসেন্স সার্ভারের লেটেন্সি স্টার্টআপ টাইমে যোগ হয়।** প্রতিটা প্লে-তে একটা অতিরিক্ত রাউন্ড ট্রিপ। প্রক্সি আর লাইসেন্স সার্ভার ইউজারের কাছাকাছি রাখুন, আর এটা আলাদা করে মাপুন ([QoE চ্যাপ্টার](/notes/video-player/11-qoe-analytics))।

## পারসিস্টেন্ট লাইসেন্স, অফলাইন আর key rotation

- **`temporary` সেশন** পেজ বন্ধ হলেই হারায়। স্ট্রিমিংয়ের জন্য এটাই ডিফল্ট।
- **`persistent-license` সেশন** ডিভাইসে লাইসেন্স রেখে দেয়, যাতে অফলাইনে চলে। এর জন্য `persistentState: 'required'` আর `sessionTypes: ['persistent-license']` লাগে, আর সব প্ল্যাটফর্মে নেই। ডাউনলোড ফিচার বানানোর আগে টার্গেট ডিভাইসে প্রোব করুন। লাইসেন্সে সাধারণত দুটো মেয়াদ থাকে: ডাউনলোডের পর কতদিন রাখা যাবে, আর প্রথম প্লে শুরুর পর কতক্ষণ।
- **key rotation** লাইভে ব্যবহার হয়: কিছুক্ষণ পরপর key বদলায়, নতুন PSSH আসে, নতুন `encrypted` ইভেন্ট আসে। প্লেয়ারকে পুরনো সেশন রেখে নতুন সেশন খুলতে হয়। Android-এর Media3-তে এজন্য মাল্টি-সেশন চালু করতে হয়; ২০২৬ সালের অক্টোবরে Media3 ডকসে `setMultiSession(true)` এই কাজেই দেখানো আছে।

## Clear Key দিয়ে টেস্ট

DRM ভেন্ডরের অ্যাকাউন্ট ছাড়াই পুরো EME ফ্লো টেস্ট করা যায় Clear Key দিয়ে। প্যাকেজার দিয়ে CENC-এ এনক্রিপ্ট করুন, তারপর Shaka-তে key সরাসরি দিন:

```javascript
player.configure({
  drm: {
    clearKeys: {
      '3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b': '0123456789abcdef0123456789abcdef'
    }
  }
});
```

এটা দিয়ে প্যাকেজিং, PSSH, key ID মেলানো, `encrypted` ইভেন্ট আর ABR ফিল্টারিং সব যাচাই হয়। শুধু robustness আর HDCP যাচাই হয় না, কারণ Clear Key-তে কোনো সুরক্ষাই নেই। **প্রোডাকশনে কখনো Clear Key না।**

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন যেভাবে | সমাধান |
| --- | --- | --- |
| `requestMediaKeySystemAccess` নেই (`undefined`) | `location.protocol` দেখুন; HTTP বা LAN IP দিয়ে খোলা? | HTTPS দিয়ে খুলুন; ডেভেলপমেন্টে `localhost` বা লোকাল টানেল |
| iframe-এ এমবেড করলে `SecurityError` | কনসোলে Permissions-Policy মেসেজ | iframe-এ `allow="encrypted-media"` (আর দরকার হলে `autoplay`) |
| `NotSupportedError` শুধু কিছু ডিভাইসে | প্রোব স্ক্রিপ্ট চালান; কোডেক স্ট্রিং আর robustness আলাদা করে বদলে দেখুন | config-এ শিথিল robustness-এর বিকল্প রাখুন; কোডেক স্ট্রিং মিডিয়ার সাথে মেলান |
| `encrypted` ইভেন্ট আসে না | init segment-এ PSSH আছে কিনা: `mp4dump init.mp4` চালিয়ে `pssh` বক্স খুঁজুন | প্যাকেজারে PSSH এমবেড চালু করুন, বা manifest-এ ContentProtection-এ PSSH দিন |
| লাইসেন্স রিকোয়েস্ট 401/403 | DevTools Network-এ লাইসেন্স কল, রেসপন্স বডির এরর কোড | টোকেন হেডারে যাচ্ছে কিনা, মেয়াদ, এনটাইটেলমেন্ট রুল |
| লাইসেন্স 200 কিন্তু `session.update` এরর | রেসপন্স কি সত্যিই বাইনারি লাইসেন্স, নাকি JSON/HTML এরর পেজ? প্রথম কয়েক বাইট দেখুন | প্রক্সিতে আপস্ট্রিম এরর পাস না করে সঠিক স্ট্যাটাস দিন; FairPlay হলে base64/CKC র‍্যাপিং ঠিক করুন |
| অডিও চলে, ভিডিও কালো | `keystatuseschange` লগ: `output-restricted`? বাইরের মনিটর বা ক্যাপচার কার্ড? | HD-র key আলাদা রাখুন যাতে SD-তে নামা যায়; ইউজারকে স্পষ্ট বার্তা |
| শুধু Firefox বা ডেস্কটপে HD আসে না | `getConfiguration()`-এ মঞ্জুর robustness সফটওয়্যার লেভেল | এটা প্রত্যাশিত আচরণ; ইউজারকে বলুন কোন ডিভাইসে HD পাওয়া যায় |
| Safari-তে প্লে হয় না, অন্য সবখানে হয় | সেগমেন্ট `cenc` স্কিমে? FairPlay সার্টিফিকেট লোড হয়েছে? | `cbcs`-এ প্যাকেজ করুন; সার্টিফিকেট আগে আনুন |
| লাইভে কিছুক্ষণ পর হঠাৎ থেমে যায় | নতুন key ID-র জন্য `encrypted` এসেছে কিন্তু সেশন খোলেনি; key status `expired` | মাল্টি-সেশন / key rotation সাপোর্ট চালু করুন; লাইসেন্সের মেয়াদ দেখুন |
| স্টার্টআপ হঠাৎ এক-দুই সেকেন্ড ধীর | Network ট্যাবে লাইসেন্স কলের টাইমিং | প্রক্সি কাছাকাছি রিজিয়নে; কানেকশন রিইউজ; প্রি-ফেচ লাইসেন্স যখন ইউজার প্লে বাটনের উপর |

## মূল শিক্ষা

1. **EME-তে অ্যাপ কখনো key দেখে না।** অ্যাপ শুধু CDM-এর challenge আর সার্ভারের license আনা-নেওয়া করে; ডিক্রিপ্ট আর ডিকোড CDM-এর ভেতরে।
2. **আসল ব্যবসায়িক নিয়ম থাকে আপনার লাইসেন্স প্রক্সিতে।** কে দেখতে পারবে, সেটা সেখানে চেক হয়; রেসপন্স কখনো ক্যাশ হবে না।
3. **robustness কোয়ালিটির সিলিং ঠিক করে।** HD আর SD আলাদা key-তে রাখলে কম সুরক্ষিত ডিভাইসেও ভিডিও চলে।
4. **কালো স্ক্রিন আর চলমান অডিও প্রায় সবসময় HDCP।** key status-এ `output-restricted` দেখুন, আর ইউজারকে লুকিয়ে না রেখে বলুন।
5. **FairPlay আলাদা পথে চলে।** সার্টিফিকেট আগে, initData `skd://` থেকে, শুধু `cbcs`।
6. **Clear Key দিয়ে পুরো ফ্লো টেস্ট করুন, প্রোডাকশনে কখনো না।**
7. **কোন ডিভাইস কী সমর্থন করে, সেটা মুখস্থ না রেখে প্রোব করুন।** তালিকা বদলায়; প্রোব স্ক্রিপ্ট সত্যি বলে।
