---
title: 'লোড ব্যালান্সিং আর স্টেটলেসনেস'
subtitle: 'L4 বনাম L7, ব্যালান্সিং অ্যালগরিদম, health check-এর ফাঁদ, sticky session কেন খারাপ, আর SIGTERM থেকে exit পর্যন্ত একটা graceful deploy কীভাবে হয়।'
chapter: 9
level: 'intermediate'
readingTime: '১৭ মিনিট'
topics: ['load balancing', 'L4', 'L7', 'health checks', 'statelessness', 'graceful deploy']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের চ্যাপ্টারে আমরা ক্যাশ দিয়ে কাজের পরিমাণ কমিয়েছি — একই উত্তর বারবার হিসাব না করে একবার করে রেখে দেওয়া। কিন্তু ক্যাশ যত ভালোই হোক, একটা সময় আসে যখন একটা মেশিন আর যথেষ্ট নয়। তখন আপনি দ্বিতীয় একটা instance চালু করেন, আর সঙ্গে সঙ্গে একটা নতুন প্রশ্ন জন্ম নেয়: কোন রিকোয়েস্ট কোন instance-এ যাবে, আর কে সেটা ঠিক করবে?

এই প্রশ্নের উত্তরটাই লোড ব্যালান্সার। বাইরে থেকে এটাকে খুব সরল মনে হয় — "রিকোয়েস্টগুলো ঘুরিয়ে ফিরিয়ে দাও"। কিন্তু বাস্তবে লোড ব্যালান্সারই সেই জায়গা যেখানে আপনার সিস্টেমের availability, deploy-এর নিরাপত্তা, আর outage-এর আকার — তিনটেই ঠিক হয়। একটা ভুল কনফিগার করা health check যত সহজে পুরো সাইট নামিয়ে দিতে পারে, একটা ডেটাবেস ক্র্যাশও অত সহজে পারে না।

আর এই চ্যাপ্টারের আসল বিষয় আসলে লোড ব্যালান্সার নয় — **statelessness**। লোড ব্যালান্সিং তখনই কাজ করে যখন যেকোনো instance যেকোনো রিকোয়েস্ট সামলাতে পারে। সেই শর্তটা ভাঙলে বাকি সব কৌশল একে একে ভেঙে পড়ে।

## গল্পে বুঝি

দামেস্কের কেন্দ্রীয় ডাকঘরের কথা ভাবুন। বিশাল হলঘর, সামনে বারোটা কাউন্টার, আর দরজার ঠিক ভেতরে একটা উঁচু টুলে বসে থাকেন আল-কিন্দি। তাঁর কাজ একটাই — যে লোকটা দরজা দিয়ে ঢুকল, তাকে বলে দেওয়া কোন কাউন্টারে যেতে হবে।

আল-কিন্দি না থাকলে কী হতো, সেটা একবার দেখা গিয়েছিল। সেদিন তিনি অসুস্থ ছিলেন, আর সবাই সহজাতভাবে এক নম্বর কাউন্টারের সামনে একটাই লম্বা লাইন বানিয়ে ফেলেছিল। এক নম্বর কাউন্টারে চল্লিশজন, আর সাত থেকে বারো নম্বর কাউন্টার পুরো খালি বসে মাছি তাড়াচ্ছিল। ডাকঘরের ক্ষমতা ছিল বারো কাউন্টারের, কিন্তু বাস্তব থ্রুপুট ছিল এক কাউন্টারের। কাজ ভাগ করার জন্য একজন দরকার — এটাই প্রথম শিক্ষা।

আল-কিন্দির সবচেয়ে সরল নিয়মটা হলো গোনা: প্রথমজন এক নম্বরে, দ্বিতীয়জন দুই নম্বরে, এভাবে বারো পর্যন্ত গিয়ে আবার এক নম্বর। এটা দারুণ কাজ করত যদি সব কাউন্টার এক রকম হতো। কিন্তু হয় না। তিন নম্বরে বসেন ইবনে আল-হাইসাম, বিশ বছরের অভিজ্ঞ, তিনি একাই দুজনের কাজ করেন; নয় নম্বরে বসেন একজন নতুন কর্মী, তাঁর সব কাজে দ্বিগুণ সময় লাগে। তাই আল-কিন্দি নিয়মটা বদলালেন — অভিজ্ঞ কাউন্টারে প্রতি চক্রে দুজন, নতুন কাউন্টারে একজন।

তবুও ভিড়ের দিনে হিসাব মিলছিল না। কারণ ডাকঘরের কাজগুলো এক মাপের নয়। কেউ আসে শুধু একটা স্ট্যাম্প কিনতে — দশ সেকেন্ড। আর ফাতিমা আল-ফিহরি এসেছেন সমরকন্দে একটা বড় পার্সেল পাঠাতে, কাস্টমস ফর্ম, ওজন, বিমা — বিশ মিনিট। আল-কিন্দি যদি শুধু "কতজনকে কোথায় পাঠিয়েছি" গোনেন, তাহলে একটা কাউন্টারে একজন লোক থাকলেও সেটা আসলে বিশ মিনিটের জন্য বন্ধ। তাই তিনি গোনা ছেড়ে **তাকানো** শুরু করলেন — এই মুহূর্তে কোন কাউন্টারের সামনে সবচেয়ে কম লোক দাঁড়িয়ে আছে, সেখানেই পাঠাবেন। আরও ভালো হলো যখন তিনি স্মৃতি থেকে যোগ করলেন: "চার নম্বর কাউন্টারে আজ প্রতিটা কাজে গড়ে অনেক সময় লাগছে, ওখানে দুজন দাঁড়িয়ে থাকা মানে আসলে অনেক বেশি অপেক্ষা।"

কিন্তু বারোটা কাউন্টার প্রতিবার স্ক্যান করাও ক্লান্তিকর, আর ব্যস্ত সময়ে সেটাও দেরি করিয়ে দেয়। এক বিকেলে আল-কিন্দি একটা মজার আবিষ্কার করলেন: বারোটা না দেখে চোখ বন্ধ করে যেকোনো দুটো কাউন্টার বেছে নিয়ে তার মধ্যে যেটায় কম ভিড় সেটায় পাঠালে ফলাফল প্রায় একই রকম ভালো হয় — অথচ পরিশ্রম বারো ভাগের এক ভাগ। শুধু একটা কাউন্টার এলোমেলোভাবে বেছে নিলে মাঝে মাঝে সবচেয়ে ভিড়ওয়ালা কাউন্টারে লোক পাঠানো হয়ে যায়; দুটো দেখে ভালোটা বাছলে সেই দুর্ঘটনা প্রায় শূন্যে নেমে আসে।

তারপর একদিন আসল বিপর্যয়টা ঘটল। আল-কিন্দির একটা অভ্যাস ছিল — প্রতি দশ মিনিটে তিনি প্রতিটা কাউন্টারে গিয়ে জিজ্ঞেস করতেন "সব ঠিক আছে তো?" এবং সাথে সাথে উত্তর না পেলে ধরে নিতেন কর্মীটি অসুস্থ, আর সেই কাউন্টারে লোক পাঠানো বন্ধ করে দিতেন। ঈদের আগের দিন হলঘর ভর্তি, সব কর্মী কাজে ডুবে আছেন, কেউই মুখ তুলে সাথে সাথে উত্তর দিতে পারলেন না। আল-কিন্দি একে একে বারোটা কাউন্টারকেই "অসুস্থ" চিহ্নিত করলেন, আর তারপর কাউকে কোথাও পাঠানো বন্ধ করে দিলেন। বারোজন সুস্থ কর্মী বসে রইলেন, তিনশো লোক দরজায় দাঁড়িয়ে রইল, আর ডাকঘর কার্যত মরে গেল — অথচ একটা কাউন্টারও আসলে বন্ধ ছিল না। এরপর থেকে নিয়ম হলো: একবার উত্তর না পেলে কিছু হয় না, পরপর তিনবার না পেলে তবেই বাদ; আর যদি অর্ধেকের বেশি কাউন্টার একসাথে "অসুস্থ" দেখায়, তাহলে ধরে নিতে হবে আল-কিন্দির নিজের বিচারই ভুল — তখন স্বাস্থ্যের হিসাব বাদ দিয়ে সবার কাছেই লোক পাঠাতে হবে।

আরেকটা সমস্যা ছিল আরও সূক্ষ্ম। ফাতিমা আল-ফিহরি তাঁর পার্সেলের ফর্ম অর্ধেক পূরণ করে সাত নম্বর কাউন্টারে রেখে গিয়েছিলেন, কর্মী সেটা নিজের ড্রয়ারে তুলে রেখেছিলেন। পরদিন ফাতিমা ফিরে এলে আল-কিন্দিকে বাধ্য হয়ে তাঁকে আবার সাত নম্বরেই পাঠাতে হলো — কারণ কাগজটা শুধু ওই ড্রয়ারেই আছে। সাত নম্বর কাউন্টারে সেদিন ভিড় বেশি? কিছু করার নেই। সাত নম্বরের কর্মী ছুটিতে? ফাতিমার কাগজ হারিয়ে গেল। সমাধান খুব সাধারণ ছিল, আর সেটাই এই গল্পের সবচেয়ে দামি অংশ: অসম্পূর্ণ ফর্মগুলো আর কোনো কর্মীর ড্রয়ারে থাকবে না, হলঘরের মাঝখানের কেন্দ্রীয় ফাইল আলমারিতে থাকবে। এরপর থেকে যেকোনো কাউন্টার যেকোনো গ্রাহককে সামলাতে পারত, আর আল-কিন্দি পুরোপুরি স্বাধীনভাবে ভিড় দেখে সিদ্ধান্ত নিতে পারতেন।

শেষ দৃশ্যটা শিফট বদলের। পাঁচ নম্বর কাউন্টারের কর্মীর ছুটির সময় হয়েছে। আল-কিন্দি হঠাৎ তাঁকে উঠিয়ে দেন না — তিনি শুধু পাঁচ নম্বরে **নতুন** লোক পাঠানো বন্ধ করেন, আর কাউন্টারে যে গ্রাহকটি এখনো আছেন তাঁর কাজ শেষ হওয়া পর্যন্ত অপেক্ষা করেন। কাজ শেষ, কর্মী উঠে যান, নতুন কর্মী বসেন, তিনি নিজে "আমি প্রস্তুত" বললে তবেই আল-কিন্দি আবার সেখানে লোক পাঠাতে শুরু করেন।

মিলিয়ে নিই: আল-কিন্দি হলেন **load balancer**, কাউন্টারগুলো **backend instance**, গুনে গুনে পাঠানো **round robin**, অভিজ্ঞ কাউন্টারে বেশি পাঠানো **weighted round robin**, সামনে দাঁড়ানো লোক গুনে পাঠানো **least connections**, গড় সময় মনে রেখে পাঠানো **least response time**, চোখ বন্ধ করে দুটো বেছে ভালোটা নেওয়া **power-of-two-choices**, ফাতিমার নাম দেখে সবসময় একই কাউন্টারে পাঠানো **consistent hashing**, দশ মিনিট পরপর খোঁজ নেওয়া **active health check**, গ্রাহকের অভিযোগ থেকে বোঝা **passive health check**, ঈদের দিনের বিপর্যয় **cascading failure**, "অর্ধেকের বেশি অসুস্থ হলে হিসাব বাদ" **panic mode**, ড্রয়ারে রাখা অর্ধেক ফর্ম **sticky session**, কেন্দ্রীয় ফাইল আলমারি **externalised session state** (অর্থাৎ **statelessness**), আর শিফট বদলের ভদ্র প্রক্রিয়াটাই **connection draining** ও **graceful deploy**। বাকি চ্যাপ্টারটা এই গল্পেরই টেকনিক্যাল অনুবাদ।

## লোড ব্যালান্সার আসলে কোথায় বসে

বাস্তব সিস্টেমে "লোড ব্যালান্সার" একটা বাক্স নয়, একটা শৃঙ্খল। ট্রাফিক DNS থেকে শুরু করে আপনার প্রসেস পর্যন্ত পৌঁছাতে সাধারণত তিন-চারটে বণ্টনের ধাপ পেরোয়।

<Mermaid
title="Layers of balancing on the path to a process"
code={`graph LR
  C["Clients"] --> D["DNS / anycast<br/>coarse geo split"]
  D --> E1["Edge L4 LB<br/>damascus"]
  D --> E2["Edge L4 LB<br/>cordoba"]
  E1 --> P["L7 proxy pool<br/>routing, retries, TLS"]
  E2 --> P
  P --> A1["api-baghdad-01"]
  P --> A2["api-cordoba-01"]
  P --> A3["api-samarkand-01"]`}
/>

সবচেয়ে বাইরের ধাপটা DNS। একই hostname-এর জন্য একাধিক IP ফেরত দিয়ে ক্লায়েন্টদের ভাগ করে দেওয়া যায়। এটা সস্তা, কিন্তু ভয়ানক ভোঁতা: আপনি জানেন না কোন resolver কতক্ষণ উত্তরটা ক্যাশ করে রাখবে, তাই একটা মৃত IP সরিয়ে দিলেও ঘণ্টাখানেক ধরে ট্রাফিক সেখানে যেতে পারে। DNS দিয়ে failover করা যায় না, শুধু coarse বণ্টন করা যায়।

তার চেয়ে ভালো হলো **anycast** — একই IP ঠিকানা পৃথিবীর অনেক জায়গা থেকে BGP-তে ঘোষণা করা হয়, আর ইন্টারনেটের রাউটিংই ব্যবহারকারীকে সবচেয়ে কাছের POP-এ নিয়ে যায়। একটা POP পড়ে গেলে রুটটাই উঠে যায়, ট্রাফিক নিজে থেকেই পরের POP-এ চলে যায় — সেকেন্ডে, DNS TTL-এর অপেক্ষা ছাড়াই। Cloudflare, Google, AWS Global Accelerator — সবাই এভাবেই কাজ করে।

তারপর ডেটাসেন্টারের ভেতরে আসে আসল লোড ব্যালান্সার, আর এখানেই মূল সিদ্ধান্ত: L4 না L7।

## L4 বনাম L7

পার্থক্যটা এক বাক্যে: **L4 ব্যালান্সার প্যাকেট দেখে, L7 ব্যালান্সার রিকোয়েস্ট দেখে।**

L4 কাজ করে TCP/UDP লেভেলে। সে একটা connection পায়, একটা backend বেছে নেয়, আর তারপর সেই connection-এর সব বাইট নির্বিচারে ওই backend-এ ঠেলে দেয়। ভেতরে HTTP আছে না gRPC আছে না MySQL প্রোটোকল আছে, সে জানে না এবং জানতে চায় না। এজন্য সে অসম্ভব দ্রুত, খুব কম CPU খরচ করে, আর অনেক ক্ষেত্রে উত্তরটা ব্যালান্সারকে না ছুঁয়েই সরাসরি ক্লায়েন্টের কাছে যেতে পারে (direct server return)।

L7 TLS খুলে HTTP রিকোয়েস্টটা পড়ে। ফলে সে path দেখে রুট করতে পারে, header দেখে ট্র্যাফিক ভাগ করতে পারে, একটা ব্যর্থ রিকোয়েস্ট অন্য backend-এ retry করতে পারে, response ক্যাশ করতে পারে, rate limit বসাতে পারে। দাম হলো CPU আর latency — প্রতিটা বাইট তার ভেতর দিয়ে যায়।

| দিক                     | L4 (transport)            | L7 (application)               |
| ----------------------- | ------------------------- | ------------------------------ |
| কী দেখে                 | IP, পোর্ট, TCP state      | পুরো HTTP রিকোয়েস্ট           |
| বণ্টনের একক             | connection                | রিকোয়েস্ট                     |
| path/header ধরে রুটিং   | সম্ভব নয়                 | সম্ভব                          |
| ব্যর্থ রিকোয়েস্ট retry | সম্ভব নয়                 | সম্ভব                          |
| TLS termination         | সাধারণত নয় (passthrough) | হ্যাঁ                          |
| খরচ                     | খুব কম                    | বেশি                           |
| উদাহরণ                  | AWS NLB, IPVS, Maglev     | nginx, Envoy, HAProxy, AWS ALB |

একটা গুরুত্বপূর্ণ ব্যবহারিক ফাঁদ: **HTTP/2 বা gRPC-র সামনে L4 ব্যালান্সার বসালে বণ্টন কার্যত বন্ধ হয়ে যায়।** কারণ HTTP/2 একটাই দীর্ঘস্থায়ী connection-এ হাজারটা রিকোয়েস্ট মাল্টিপ্লেক্স করে। L4 সেই connection-টাকে একবার একটা backend-এ বেঁধে দেয়, আর তারপর সেই ক্লায়েন্টের সব ট্রাফিক ঘণ্টার পর ঘণ্টা ওই একটা instance-এই যেতে থাকে। এজন্যই gRPC সার্ভিসের সামনে হয় L7 প্রক্সি (Envoy) দরকার, নয়তো ক্লায়েন্ট-সাইড লোড ব্যালান্সিং।

<Callout type="info">

বাস্তবে বেশিরভাগ প্রোডাকশন আর্কিটেকচার দুটোই ব্যবহার করে: বাইরে একটা L4 ব্যালান্সার যেটা শুধু TCP connection ছড়িয়ে দেয় একগুচ্ছ L7 প্রক্সির উপর, আর সেই L7 প্রক্সিগুলো আসল বুদ্ধির কাজ করে। L4 স্তরটা সস্তায় বিপুল ট্রাফিক নেয়, L7 স্তরটা আলাদাভাবে স্কেল করা যায়।

</Callout>

## ব্যালান্সিং অ্যালগরিদম

### Round robin

পালা করে এক এক করে। বোঝা সহজ, রাষ্ট্রহীন, আর যখন সব backend একই মাপের এবং সব রিকোয়েস্ট একই খরচের — তখন যথেষ্ট ভালো। সমস্যা হলো এই দুটো শর্তের কোনোটাই বাস্তবে সচরাচর সত্যি নয়।

### Weighted round robin

প্রতিটা backend-এর একটা ওজন থাকে, আর পালাটা সেই ওজন অনুপাতে ভাগ হয়। কাজে লাগে যখন আপনার ফ্লিটে ভিন্ন মাপের মেশিন আছে, অথবা যখন আপনি ইচ্ছে করে নতুন ভার্সনে অল্প ট্রাফিক পাঠাতে চান — canary deploy আসলে ওজন বদলানোরই আরেক নাম।

### Least connections

এই মুহূর্তে যে backend-এ সবচেয়ে কম active connection, সেখানে পাঠাও। এটা round robin-এর চেয়ে প্রায় সবসময়ই ভালো, কারণ এটা রিকোয়েস্টের **সময়কাল** হিসাবে ধরে। একটা backend-এ যদি কয়েকটা ভারী রিকোয়েস্ট আটকে থাকে, তার কাউন্ট বেশি থাকবে আর সে স্বয়ংক্রিয়ভাবে কম কাজ পাবে।

তবে এখানে একটা বিখ্যাত ফাঁদ আছে। একটা instance যদি অসুস্থ হয়ে সব রিকোয়েস্ট **দ্রুত** ফেল করতে শুরু করে, তাহলে তার active connection সবসময়ই শূন্যের কাছে থাকবে — আর least connections তাকেই সবচেয়ে বেশি ট্রাফিক পাঠাবে। একে বলে **black hole**: সবচেয়ে ভাঙা নোডটাই সবচেয়ে বেশি ট্রাফিক টেনে নেয়। এজন্য least connections-এর পাশে সবসময় error-rate ভিত্তিক passive health check দরকার।

### Least response time

কাউন্টের সাথে latency যোগ করা: প্রতিটা backend-এর সাম্প্রতিক গড় (সাধারণত EWMA) রেসপন্স টাইম মনে রাখুন, আর "active connection × গড় latency" — এই আনুমানিক queue-সময়টা যেখানে সবচেয়ে কম, সেখানে পাঠান। ধীর হয়ে যাওয়া নোড, গরম হয়ে যাওয়া ডিস্ক, noisy neighbour — এসব এতে নিজে থেকেই ধরা পড়ে।

### Power-of-two-choices

বড় ফ্লিটে (ধরুন ৫০০টা instance) প্রতিবার সবার অবস্থা দেখা ব্যয়বহুল, আর ডিস্ট্রিবিউটেড ব্যালান্সারদের ক্ষেত্রে বিপজ্জনকও — সব ব্যালান্সার একই সময়ে "সবচেয়ে খালি" নোডটা দেখে সবাই সেখানেই ঝাঁপিয়ে পড়ে, আর সেটা তৎক্ষণাৎ সবচেয়ে ব্যস্ত নোড হয়ে যায়। একে বলে herd behaviour।

সমাধানটা প্রায় অবিশ্বাস্য রকম সরল: এলোমেলোভাবে **দুটো** backend বাছুন, তাদের মধ্যে কমভারীটা নিন। বিশুদ্ধ random-এর তুলনায় সর্বোচ্চ লোডের ব্যবধান নাটকীয়ভাবে কমে যায় (গাণিতিকভাবে লগারিদমিক থেকে লগ-লগ-এ নামে), অথচ খরচ প্রায় শূন্য এবং herd তৈরি হয় না। বড় সিস্টেমে এটাই আজকের ডিফল্ট পছন্দ।

### Consistent hashing

কখনো কখনো আপনি চান একই key সবসময় একই backend-এ যাক — কারণ সেই backend-এ ওই key-এর in-process ক্যাশ গরম হয়ে আছে (আগের চ্যাপ্টারের multi-tier cache মনে করুন)। সরল সমাধান হলো `hash(key) % N`। কিন্তু এখানে `N` বদলালেই — একটা নোড যোগ বা বাদ দিলেই — প্রায় **সব** key নতুন জায়গায় সরে যায়, আর আপনার সব ক্যাশ একসাথে ঠান্ডা হয়ে যায়।

Consistent hashing এই সমস্যাটা মেটায়। backend আর key দুটোকেই একই বৃত্তে বসানো হয়, আর প্রতিটা key তার ঘড়ির কাঁটার দিকের প্রথম backend-এর কাছে যায়। একটা নোড বাদ পড়লে শুধু তার নিজের অংশটুকু প্রতিবেশীর কাছে যায়, বাকি সব key যেখানে ছিল সেখানেই থাকে। বণ্টন সমান রাখতে প্রতিটা নোডকে বৃত্তে অনেকগুলো virtual node হিসেবে বসানো হয়।

<Mermaid
title="Hash ring with virtual nodes"
code={`graph LR
  K1["key: tenant-bukhara"] --> V1["vnode 41"]
  K2["key: tenant-fez"] --> V2["vnode 88"]
  K3["key: tenant-cairo"] --> V3["vnode 203"]
  V1 --> B1["api-baghdad-01"]
  V2 --> B2["api-cordoba-01"]
  V3 --> B1
  B2 -.->|"node leaves: only its arc moves"| B3["api-samarkand-01"]`}
/>

<Callout type="warning">

Consistent hashing মানেই সমান লোড নয়। যদি একটা tenant বা একটা hot key বাকিদের চেয়ে দশ গুণ বেশি ট্রাফিক আনে, তাহলে যে নোড সেটার মালিক সে পুড়ে যাবে আর বাকিরা বসে থাকবে। এজন্য প্রোডাকশন সিস্টেমে **bounded-load** সংস্করণ ব্যবহার হয়: hash যেখানে পাঠাচ্ছে সেখানে পাঠাও, কিন্তু সেই নোডের লোড গড়ের একটা নির্দিষ্ট গুণিতক ছাড়িয়ে গেলে পরের নোডে উপচে দাও।

</Callout>

## Health check — যেখানে বেশিরভাগ outage জন্মায়

লোড ব্যালান্সারের সবচেয়ে গুরুত্বপূর্ণ কাজ ট্রাফিক ভাগ করা নয়, বরং **মৃত নোড থেকে ট্রাফিক সরানো**। আর এখানেই সবচেয়ে বেশি ভুল হয়।

### Active বনাম passive

**Active health check** — ব্যালান্সার নিজে থেকে নিয়মিত একটা probe পাঠায় (`GET /healthz`)। সুবিধা: ব্যবহারকারীর কোনো রিকোয়েস্ট নষ্ট হওয়ার আগেই সমস্যা ধরা পড়ে। অসুবিধা: probe হালকা, তাই সে অনেক সমস্যা ধরতেই পারে না — যেমন একটা নির্দিষ্ট endpoint ভেঙে আছে কিন্তু `/healthz` দিব্যি ২০০ দিচ্ছে।

**Passive health check** (outlier detection) — আসল ট্রাফিকের ফলাফল দেখে সিদ্ধান্ত। পরপর কয়েকটা connection error বা 5xx এলে নোডটাকে কিছুক্ষণের জন্য পুল থেকে সরিয়ে রাখা হয় (ejection), তারপর ধীরে ধীরে ফিরিয়ে আনা হয়। এটা সত্যের অনেক কাছে, কারণ এটা আসল কাজ থেকে শেখে।

উত্তর হলো — দুটোই। Active দিয়ে ধরুন "প্রসেসটা আদৌ বেঁচে আছে কি না", passive দিয়ে ধরুন "প্রসেসটা আসলে কাজ করতে পারছে কি না"।

### Liveness বনাম readiness

দুটো আলাদা প্রশ্ন, আর এগুলো গুলিয়ে ফেলা একটা ক্লাসিক ভুল।

- **Liveness**: প্রসেসটা কি বেঁচে আছে? উত্তর "না" হলে সঠিক ব্যবস্থা হলো প্রসেসটাকে **মেরে ফেলে নতুন করে চালু করা**।
- **Readiness**: প্রসেসটা কি এখন ট্রাফিক নিতে প্রস্তুত? উত্তর "না" হলে সঠিক ব্যবস্থা হলো শুধু **ট্রাফিক পাঠানো বন্ধ করা** — প্রসেসটা বহাল থাকবে।

গরম হওয়ার সময় (warm-up), ক্যাশ ভরার সময়, drain করার সময় — এই তিন অবস্থাতেই readiness "না" বলবে কিন্তু liveness "হ্যাঁ" বলবে। liveness probe-এ ডেটাবেস কানেকশন যাচাই করা সবচেয়ে বিপজ্জনক ভুলগুলোর একটা: ডেটাবেস কয়েক সেকেন্ডের জন্য ধীর হলে আপনার সব অ্যাপ instance একসাথে "মৃত" ঘোষিত হয়ে restart হবে, আর তারপর সবাই একসাথে ঠান্ডা ক্যাশ নিয়ে ফিরে এসে ডেটাবেসকে সম্পূর্ণ ধসিয়ে দেবে।

### Cascading failure এবং panic mode

গল্পের ঈদের দিনটা মনে আছে? একটা naive health check ঠিক ওই কাজটাই করে। ট্রাফিক বাড়ল → সব নোড একটু ধীর হলো → probe টাইমআউট করল → সব নোড পুল থেকে বাদ পড়ল → যে কয়টা নোড এখনো পুলে আছে তারা পুরো ট্রাফিক পেল → তারাও ধীর হয়ে বাদ পড়ল → পুল খালি। সিস্টেমটা নিজেকে নিজেই মেরে ফেলল, অথচ একটা নোডও আসলে ক্র্যাশ করেনি।

তিনটে প্রতিরোধ, তিনটেই দরকার:

**Threshold.** একবার ব্যর্থ হলে কিছু হবে না। পরপর তিনবার ব্যর্থ হলে বাদ, আর ফিরে আসতে পরপর দুইবার সফল হতে হবে। এই হিস্টেরেসিসটাই নোডকে পুলে ঢোকা-বেরোনোর দোলাচল (flapping) থেকে বাঁচায়।

**Panic mode.** যদি অর্ধেকের বেশি নোড একসাথে অসুস্থ দেখায়, তাহলে সম্ভাবনা অনেক বেশি যে আপনার health check-ই ভুল, নোডগুলো নয়। তখন স্বাস্থ্যের হিসাব সম্পূর্ণ উপেক্ষা করে সবার কাছে ট্রাফিক পাঠান। সম্ভবত-অসুস্থ নোডে পাঠানো, কোথাও না পাঠানোর চেয়ে সবসময়ই ভালো। Envoy-তে এটা সরাসরি একটা কনফিগ (`healthy_panic_threshold`), ডিফল্ট ৫০%।

**হালকা probe.** `/healthz` যেন ডেটাবেস, ক্যাশ বা অন্য কোনো সার্ভিসে না যায়। এটা শুধু বলবে "আমার প্রসেস চলছে এবং আমি drain করছি না" — এর বেশি কিছু নয়। নির্ভরতা যাচাই করার জায়গা আলাদা একটা `/readyz`, আর সেটাও নির্ভরতাটা সত্যিই অপরিহার্য হলে তবেই।

```nginx
upstream damascus_api {
    least_conn;
    server api-baghdad-01.cordoba.internal:8080 max_fails=3 fail_timeout=10s;
    server api-cordoba-01.cordoba.internal:8080 max_fails=3 fail_timeout=10s;
    server api-samarkand-01.cordoba.internal:8080 max_fails=3 fail_timeout=10s weight=2;
    keepalive 64;
}

server {
    location / {
        proxy_pass http://damascus_api;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
        proxy_connect_timeout 2s;
        proxy_read_timeout 10s;
        proxy_set_header X-Request-Id $request_id;
    }
}
```

<Callout type="tip">

`proxy_next_upstream`-এ কখনো `non_idempotent` যোগ করবেন না যদি না আপনার সব POST endpoint idempotency key দিয়ে সুরক্ষিত থাকে। নইলে টাইমআউট হওয়া একটা পেমেন্ট রিকোয়েস্ট দ্বিতীয় নোডে আবার চলে যাবে — এবং প্রথমটাও হয়তো সফল হয়েছিল, শুধু উত্তরটা দেরিতে এসেছিল।

</Callout>

## Sticky session, আর কেন statelessness জেতে

sticky session মানে হলো: একজন নির্দিষ্ট ব্যবহারকারীর সব রিকোয়েস্ট সবসময় একই instance-এ পাঠাও। সাধারণত একটা কুকি (`AWSALB`, `JSESSIONID`) বা ক্লায়েন্ট IP-র hash দিয়ে এটা করা হয়। কেন করা হয়? কারণ সেই instance-এর মেমরিতে ওই ব্যবহারকারীর কিছু state আছে — লগইন সেশন, শপিং কার্ট, অর্ধেক পূরণ করা ফর্ম। ঠিক সাত নম্বর কাউন্টারের ড্রয়ারের মতো।

এটা কাজ করে, ঠিক ততক্ষণ যতক্ষণ কিছু ভাঙে না। তারপর একে একে সব ভাঙে:

- **লোড অসম হয়ে যায়।** একটা instance-এ ভারী ব্যবহারকারীরা জমে গেলে ব্যালান্সার কিছুই করতে পারে না — সে বাধ্য।
- **deploy বেদনাদায়ক হয়।** একটা instance রিস্টার্ট মানে তার সব ব্যবহারকারীর সেশন হারানো, অর্থাৎ হঠাৎ লগআউট বা কার্ট মুছে যাওয়া।
- **scale-in ক্ষতিকর হয়।** অটো-স্কেলার একটা instance কমালে সেটার সাথে বাঁধা সব ব্যবহারকারী ক্ষতিগ্রস্ত হয়।
- **failover অর্থহীন হয়ে যায়।** নোড মরলে সেই ব্যবহারকারীদের জন্য "অন্য নোডে পাঠাও" কোনো সমাধান নয়, কারণ অন্য নোড তাদের চেনেই না।

আসল সমাধান sticky session টিউন করা নয় — **state-টাকে প্রসেসের বাইরে বের করে আনা**। এই একটা সিদ্ধান্তেই লোড ব্যালান্সিং, অটো-স্কেলিং, আর deploy — তিনটেই তুচ্ছ হয়ে যায়।

| State                     | কোথায় রাখবেন                                          |
| ------------------------- | ------------------------------------------------------ |
| লগইন সেশন                 | signed/encrypted টোকেন (JWT) অথবা Redis session store  |
| শপিং কার্ট                | ডেটাবেস বা Redis, ব্যবহারকারীর id-তে বাঁধা             |
| আপলোড করা ফাইল            | অবজেক্ট স্টোরেজ (S3), লোকাল ডিস্ক নয়                  |
| ব্যাকগ্রাউন্ড জব          | কিউ, in-process টাইমার নয়                             |
| WebSocket connection      | connection নিজে stateful, কিন্তু state Redis pub/sub-এ |
| ছোট রেফারেন্স ডেটার ক্যাশ | in-process থাকতেই পারে — এটা হারালে কিছু ভাঙে না       |

শেষ সারিটা গুরুত্বপূর্ণ। Stateless মানে "instance-এর মেমরিতে কিছু নেই" নয়; মানে হলো **instance-এর মেমরিতে এমন কিছু নেই যা হারালে correctness নষ্ট হয়**। ক্যাশ থাকা ঠিক আছে, কারণ ক্যাশ হারালে সিস্টেম শুধু ধীর হয়, ভুল হয় না।

<Callout type="warning">

sticky session-এর একমাত্র বৈধ ব্যবহার হলো **পারফরম্যান্স-অপ্টিমাইজেশন হিসেবে, নির্ভরতা হিসেবে নয়** — যেমন consistent hashing দিয়ে একই tenant-কে একই নোডে পাঠানো যাতে তার in-process ক্যাশ গরম থাকে। মূল পরীক্ষা সহজ: নোডটা এই মুহূর্তে মেরে ফেললে ব্যবহারকারী কি শুধু একটু ধীরগতি টের পাবে, নাকি কিছু হারাবে? উত্তর "হারাবে" হলে সেটা sticky session নয়, সেটা একটা লুকানো single point of failure।

</Callout>

## Connection draining আর graceful deploy

এখন সবচেয়ে ব্যবহারিক অংশ — একটা instance বন্ধ করার সঠিক প্রক্রিয়া। ভুলভাবে করলে প্রতিটা deploy-এ কিছু ব্যবহারকারী 502 দেখে, আর সেটা এত অল্প যে মেট্রিকে চোখেও পড়ে না, কিন্তু যথেষ্ট যে সাপোর্ট টিকেট আসতে থাকে।

মূল সমস্যাটা হলো একটা **রেস**: অর্কেস্ট্রেটর (Kubernetes, ECS) প্রসেসকে SIGTERM পাঠায়, কিন্তু লোড ব্যালান্সার সেটা তখনও জানে না। প্রসেস যদি SIGTERM পেয়েই সাথে সাথে মরে যায়, তাহলে পরের কয়েক সেকেন্ডে ব্যালান্সার তার দিকে যত রিকোয়েস্ট পাঠাবে সবগুলোই ব্যর্থ হবে। সমাধান হলো **আগে অযোগ্য ঘোষণা করো, পরে মরো**।

<Mermaid
title="Graceful shutdown sequence"
code={`sequenceDiagram
  participant O as Orchestrator
  participant A as api-baghdad-01
  participant L as Load balancer
  participant C as Client
  O->>A: SIGTERM
  A->>A: draining = true
  L->>A: GET /healthz
  A-->>L: 503 draining
  L->>L: remove from pool
  C->>A: in-flight request continues
  A-->>C: 200 OK
  A->>A: stop accepting new connections
  A->>A: wait until in-flight is zero
  A->>O: exit 0`}
/>

ধাপগুলো ক্রম অনুযায়ী:

১. **SIGTERM আসে।** এখানে কিছু বন্ধ করবেন না। শুধু একটা ফ্ল্যাগ তুলুন।

২. **readiness ব্যর্থ করুন।** `/healthz` এখন 503 ফেরত দেবে। এর ফলে ব্যালান্সার পরের এক-দুটো probe-এর মধ্যেই আপনাকে পুল থেকে সরিয়ে দেবে।

৩. **drain window-এর জন্য অপেক্ষা করুন।** এই সময়টা অন্তত `health check interval × fail threshold` হতে হবে, সাধারণত ১৫–৩০ সেকেন্ড। এই পুরো সময়টা আপনি এখনো নতুন রিকোয়েস্ট নিচ্ছেন এবং ঠিকভাবে সার্ভ করছেন — কারণ ব্যালান্সার এখনো আপনার কথা শোনেনি।

৪. **listener বন্ধ করুন।** নতুন connection আর নেওয়া হবে না, কিন্তু চলমান রিকোয়েস্টগুলো শেষ হবে। keep-alive connection-এ `Connection: close` পাঠিয়ে ক্লায়েন্টদের ভদ্রভাবে বিদায় জানান।

৫. **in-flight শূন্য হওয়া পর্যন্ত অপেক্ষা করুন**, একটা deadline সহ। deadline পেরোলে জোর করে বন্ধ করুন — নইলে একটা আটকে থাকা রিকোয়েস্ট আপনার deploy অনন্তকাল ঝুলিয়ে রাখবে।

৬. **exit 0.**

Kubernetes-এ এর সাথে দুটো জিনিস মেলাতে হবে: `terminationGracePeriodSeconds` অবশ্যই আপনার drain window + deadline-এর চেয়ে বড় হতে হবে (নইলে SIGKILL এসে সব কেটে দেবে), আর `preStop` hook-এ একটা ছোট ঘুম রাখলে endpoint প্রপাগেশনের রেসটা আরও নিরাপদ হয়।

```bash
# graceful shutdown budget for api-baghdad-01
# health check: every 2s, 3 consecutive failures to eject  -> ~6s to leave the pool
# drain window: 15s   (comfortably above 6s)
# in-flight deadline: 30s
# terminationGracePeriodSeconds must exceed 15 + 30 = 45s
```

### Rolling, blue-green, canary

| কৌশল       | কীভাবে কাজ করে                                   | রোলব্যাক  | খরচ           | ঝুঁকি                         |
| ---------- | ------------------------------------------------ | --------- | ------------- | ----------------------------- |
| Rolling    | এক এক করে instance বদলানো                        | ধীর       | কম            | দুই ভার্সন একসাথে চলে         |
| Blue-green | পুরো নতুন ফ্লিট তুলে ব্যালান্সার একবারে সুইচ করা | তাৎক্ষণিক | দ্বিগুণ ফ্লিট | সুইচের মুহূর্তে সব বা কিছু না |
| Canary     | সামান্য ট্রাফিক নতুন ভার্সনে, ধীরে বাড়ানো       | দ্রুত     | কম            | ভালো মেট্রিক লাগে             |

**Rolling** হলো ডিফল্ট, আর এর সবচেয়ে গুরুত্বপূর্ণ পরিণতি হলো deploy চলাকালীন পুরনো আর নতুন ভার্সন একসাথে ট্রাফিক নেয়। এর মানে আপনার পরিবর্তনগুলো দুই দিকেই সামঞ্জস্যপূর্ণ হতে হবে — নতুন কোডকে পুরনো ডেটা বুঝতে হবে, আর পুরনো কোডকে নতুন ডেটা দেখে ভেঙে পড়া চলবে না। এজন্যই স্কিমা পরিবর্তন সবসময় দুই ধাপে করতে হয় (আগে কলাম যোগ করে লেখা শুরু, তারপর পরের deploy-এ পড়া শুরু)।

**Blue-green** deploy-এর জটিলতাটা লোড ব্যালান্সারে সরিয়ে আনে: দুটো সম্পূর্ণ ফ্লিট, আর সুইচ মানে শুধু ব্যালান্সারের target group বদলানো। রোলব্যাক তাৎক্ষণিক, কিন্তু আপনি দ্বিগুণ ইনফ্রার দাম দিচ্ছেন এবং ডেটাবেস মাইগ্রেশন এতে এক ফোঁটাও সহজ হচ্ছে না।

**Canary** হলো সবচেয়ে পরিণত পদ্ধতি: ওজন ১% রেখে শুরু করুন, নতুন ভার্সনের error rate আর p99 latency আলাদাভাবে দেখুন, তারপর ৫% → ২৫% → ১০০%। এখানে গোপন কথাটা হলো — কৌশলটা লোড ব্যালান্সারের নয়, **পর্যবেক্ষণের**। ভার্সন অনুযায়ী মেট্রিক আলাদা করে না দেখতে পারলে canary আসলে ধীরগতির rolling deploy ছাড়া কিছুই নয়।

## লোড ব্যালান্সার নিজেই একটা single point of failure

সবকিছুকে একটা বাক্সের পেছনে লুকিয়ে দিলে সেই বাক্সটাই এখন আপনার সবচেয়ে বিপজ্জনক জায়গা। তিনটে ব্যবস্থা:

**অন্তত জোড়ায় চালান।** ক্লাসিক পদ্ধতি হলো দুটো ব্যালান্সারের মধ্যে একটা ভাসমান virtual IP (VRRP/keepalived), যেটা প্রধানটা মরলে সেকেন্ডের মধ্যে দ্বিতীয়টায় চলে যায়। ক্লাউডে ম্যানেজড ব্যালান্সার (ALB/NLB) নিজেই একাধিক zone-এ ছড়ানো থাকে।

**উপরের স্তরটা anycast বা DNS হোক।** যাতে একটা পুরো POP বা region হারালেও ট্রাফিকের অন্য পথ থাকে। একটা region-এ একটাই ব্যালান্সার — সেটা region-লেভেল আউটেজের বিরুদ্ধে কোনো সুরক্ষা নয়।

**ব্যালান্সারের ক্ষমতার হিসাব রাখুন।** এটা প্রায় সবাই ভুলে যায়: L7 প্রক্সি নিজেও CPU খরচ করে, বিশেষ করে TLS handshake-এ। ট্রাফিক দশ গুণ বাড়লে আপনার backend স্কেল করলেও প্রক্সি স্তরটা স্কেল না করলে বাধা ওখানেই তৈরি হবে। TLS session resumption আর backend-এর দিকে keep-alive connection পুল — এই দুটো সবচেয়ে বড় পার্থক্য গড়ে দেয়।

আর একটা দার্শনিক বিকল্পও আছে: **client-side load balancing**। ক্লায়েন্ট নিজেই সব backend-এর তালিকা জানে (service discovery থেকে) আর নিজেই বেছে নেয় — মাঝখানে কোনো প্রক্সি নেই, তাই একটা নেটওয়ার্ক hop কম এবং কোনো কেন্দ্রীয় বটলনেক নেই। gRPC এভাবেই কাজ করে, আর service mesh-এর sidecar প্রক্সি (Envoy) এই ধারণারই একটা পরিশীলিত রূপ: ব্যালান্সারটা প্রতিটা পডের পাশেই বসে থাকে, কেন্দ্রে নয়।

## একটা কাজ করা L7 লোড ব্যালান্সার

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের প্রায় সবকিছু একসাথে আছে: ছয়টা pluggable অ্যালগরিদম (consistent hashing সহ), threshold ভিত্তিক active health check, passive ejection, panic mode, নিরাপদ retry, আর SIGTERM থেকে exit পর্যন্ত পুরো drain সিকোয়েন্স।

```typescript
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export type Algorithm =
	| 'round-robin'
	| 'weighted-round-robin'
	| 'least-connections'
	| 'least-response-time'
	| 'power-of-two'
	| 'consistent-hash';

class Backend {
	healthy = true;
	inFlight = 0;
	ewmaLatencyMs = 50;
	fails = 0;
	passes = 0;

	constructor(
		readonly id: string,
		readonly host: string,
		readonly port: number,
		readonly weight = 1
	) {}

	/** EWMA, so one slow request cannot swing routing decisions. */
	observe(latencyMs: number): void {
		this.ewmaLatencyMs = 0.2 * latencyMs + 0.8 * this.ewmaLatencyMs;
	}

	/** Estimated queueing delay if the next request lands here. */
	cost(): number {
		return ((this.inFlight + 1) * this.ewmaLatencyMs) / this.weight;
	}
}

// --- Consistent hash ring with virtual nodes ---

const hash32 = (s: string) => createHash('sha1').update(s).digest().readUInt32BE(0);

class HashRing {
	private readonly points: Array<{ hash: number; id: string }> = [];

	constructor(ids: string[], virtualNodes = 160) {
		for (const id of ids)
			for (let i = 0; i < virtualNodes; i++) this.points.push({ hash: hash32(`${id}#${i}`), id });
		this.points.sort((a, b) => a.hash - b.hash);
	}

	/** First point clockwise from hash(key). */
	lookup(key: string): string {
		const h = hash32(key);
		let lo = 0;
		let hi = this.points.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.points[mid].hash < h) lo = mid + 1;
			else hi = mid;
		}
		return this.points[lo].hash < h ? this.points[0].id : this.points[lo].id;
	}
}

// --- Balancer ---

export class Balancer {
	private cursor = 0;
	private readonly ring: HashRing;

	constructor(
		readonly backends: Backend[],
		private readonly algorithm: Algorithm,
		private readonly panicThreshold = 0.5
	) {
		this.ring = new HashRing(backends.map((b) => b.id));
	}

	/**
	 * Panic mode: when too few backends look healthy, the health check is the
	 * likelier culprit. Traffic to maybe-sick nodes beats traffic to nowhere.
	 */
	private candidates(): Backend[] {
		const live = this.backends.filter((b) => b.healthy);
		if (live.length >= Math.ceil(this.backends.length * this.panicThreshold)) return live;
		console.warn(`[lb] panic mode: ${live.length}/${this.backends.length} healthy`);
		return this.backends;
	}

	private twoChoices(pool: Backend[]): Backend {
		const a = pool[(Math.random() * pool.length) | 0];
		const b = pool[(Math.random() * pool.length) | 0];
		return a.cost() <= b.cost() ? a : b;
	}

	pick(key: string): Backend | null {
		const pool = this.candidates();
		if (pool.length <= 1) return pool[0] ?? null;

		switch (this.algorithm) {
			case 'round-robin':
				return pool[this.cursor++ % pool.length];
			case 'weighted-round-robin': {
				const total = pool.reduce((s, b) => s + b.weight, 0);
				let n = this.cursor++ % total;
				for (const b of pool) {
					if (n < b.weight) return b;
					n -= b.weight;
				}
				return pool[0];
			}
			case 'least-connections':
				return pool.reduce((x, b) => (b.inFlight / b.weight < x.inFlight / x.weight ? b : x));
			case 'least-response-time':
				return pool.reduce((x, b) => (b.cost() < x.cost() ? b : x));
			case 'power-of-two':
				return this.twoChoices(pool);
			case 'consistent-hash': {
				// If the ring owner left the pool, fall back to two choices so one
				// dead shard does not stampede all its keys onto a single neighbour.
				const owner = this.ring.lookup(key);
				return pool.find((b) => b.id === owner) ?? this.twoChoices(pool);
			}
		}
	}
}

// --- Active health checking with hysteresis ---

export interface HealthOptions {
	path: string;
	intervalMs: number;
	timeoutMs: number;
	failThreshold: number;
	riseThreshold: number;
}

export class HealthChecker {
	private timer?: NodeJS.Timeout;

	constructor(
		private readonly backends: Backend[],
		private readonly opts: HealthOptions
	) {}

	start(): void {
		this.timer = setInterval(() => {
			for (const b of this.backends) void this.probe(b);
		}, this.opts.intervalMs);
		this.timer.unref();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
	}

	private probe(b: Backend): Promise<void> {
		const { host, port } = b;
		return new Promise((resolve) => {
			const req = http.request(
				{ host, port, path: this.opts.path, method: 'GET', timeout: this.opts.timeoutMs },
				(res) => {
					res.resume();
					// 200 means "ready for traffic". A draining instance answers 503,
					// which is how it politely asks to be taken out of the pool.
					if (res.statusCode === 200) this.pass(b);
					else this.fail(b, `status ${res.statusCode}`);
					resolve();
				}
			);
			req.on('timeout', () => req.destroy(new Error('probe timeout')));
			req.on('error', (err) => {
				this.fail(b, err.message);
				resolve();
			});
			req.end();
		});
	}

	private pass(b: Backend): void {
		b.fails = 0;
		if (++b.passes >= this.opts.riseThreshold && !b.healthy) {
			b.healthy = true;
			console.log(`[health] ${b.id} back in pool`);
		}
	}

	private fail(b: Backend, reason: string): void {
		b.passes = 0;
		if (++b.fails >= this.opts.failThreshold && b.healthy) {
			b.healthy = false;
			console.warn(`[health] ${b.id} ejected: ${reason}`);
		}
	}

	/** Passive signal from real traffic — worth more than a synthetic probe. */
	reportFailure(b: Backend, reason: string): void {
		this.fail(b, `passive: ${reason}`);
	}
}

// --- Proxy ---

const HOP_BY_HOP = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
]);

function stripHopByHop(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
	const out: http.OutgoingHttpHeaders = {};
	for (const [k, v] of Object.entries(headers))
		if (v !== undefined && !HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
	return out;
}

export class LoadBalancer {
	private readonly server: http.Server;
	private draining = false;
	private openRequests = 0;

	constructor(
		private readonly balancer: Balancer,
		private readonly health: HealthChecker,
		private readonly port: number
	) {
		this.server = http.createServer((req, res) => this.handle(req, res));
		this.server.keepAliveTimeout = 65_000;
	}

	listen(): void {
		this.server.listen(this.port, () => console.log(`[lb] listening on :${this.port}`));
		this.health.start();
	}

	private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
		this.openRequests++;
		res.on('close', () => this.openRequests--);

		// Our own readiness: flips to 503 the moment draining starts, so the
		// layer above pulls us out of its pool before we stop accepting.
		if (req.url === '/healthz') {
			res.writeHead(this.draining ? 503 : 200, { 'content-type': 'text/plain' });
			res.end(this.draining ? 'draining' : 'ok');
			return;
		}

		const key = String(req.headers['x-tenant-id'] ?? req.socket.remoteAddress ?? '');
		const backend = this.balancer.pick(key);
		if (!backend) {
			res.writeHead(502, { 'content-type': 'text/plain' }).end('no healthy upstream');
			return;
		}

		const headers = stripHopByHop(req.headers);
		const chain = req.headers['x-forwarded-for'];
		headers['x-forwarded-for'] = chain
			? `${chain}, ${req.socket.remoteAddress}`
			: req.socket.remoteAddress;
		headers['x-request-id'] = req.headers['x-request-id'] ?? randomUUID();

		backend.inFlight++;
		const startedAt = Date.now();
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			backend.inFlight--;
			backend.observe(Date.now() - startedAt);
		};

		const upstream = http.request(
			{
				host: backend.host,
				port: backend.port,
				method: req.method,
				path: req.url,
				headers,
				timeout: 10_000
			},
			(up) => {
				const status = up.statusCode ?? 502;
				// A 5xx from a "healthy" node is a passive health signal.
				if (status >= 500) this.health.reportFailure(backend, `upstream ${status}`);
				res.writeHead(status, stripHopByHop(up.headers));
				up.pipe(res);
				up.on('end', done);
			}
		);

		upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
		upstream.on('error', (err) => {
			done();
			this.health.reportFailure(backend, err.message);
			console.warn(`[lb] ${backend.id} failed: ${err.message}`);
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
			res.end('upstream error');
		});

		// Stream the body through; nothing is buffered in the proxy.
		req.pipe(upstream);
	}

	/**
	 * SIGTERM sequence: fail readiness, keep serving for the whole drain
	 * window, stop accepting, wait for in-flight to hit zero, then force past
	 * the deadline so one stuck request cannot block the deploy forever.
	 */
	async shutdown(drainMs = 15_000, deadlineMs = 30_000): Promise<void> {
		if (this.draining) return;
		this.draining = true;
		console.log('[lb] draining: /healthz now returns 503');

		await sleep(drainMs);
		this.health.stop();
		this.server.close(() => console.log('[lb] listener closed'));

		const until = Date.now() + deadlineMs;
		while (this.openRequests > 0 && Date.now() < until) await sleep(250);

		console.log(`[lb] exiting with ${this.openRequests} requests still open`);
		this.server.closeAllConnections?.();
	}
}

// --- Bootstrap ---

const pool = [
	new Backend('api-baghdad-01', 'api-baghdad-01.cordoba.internal', 8080),
	new Backend('api-cordoba-01', 'api-cordoba-01.cordoba.internal', 8080),
	new Backend('api-samarkand-01', 'api-samarkand-01.cordoba.internal', 8080, 2)
];

const lb = new LoadBalancer(
	new Balancer(pool, 'power-of-two'),
	new HealthChecker(pool, {
		path: '/healthz',
		intervalMs: 2_000,
		timeoutMs: 1_000,
		failThreshold: 3,
		riseThreshold: 2
	}),
	8000
);
lb.listen();

for (const signal of ['SIGTERM', 'SIGINT'] as const)
	process.on(signal, () => void lb.shutdown().then(() => process.exit(0)));
```

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **Hysteresis** — পরপর তিনবার ব্যর্থ হলে তবেই বাদ, পরপর দুইবার সফল হলে তবেই ফেরত। এতে flapping হয় না
- **Panic mode** — অর্ধেকের বেশি নোড অসুস্থ দেখালে স্বাস্থ্যের হিসাব উপেক্ষা করা হয়, কারণ তখন probe-ই ভুল হওয়ার সম্ভাবনা বেশি
- **Active + passive** — probe প্রসেসের জীবন দেখে, আর আসল ট্রাফিকের error/5xx সরাসরি ejection-এ যোগ হয়
- **স্ট্রিমিং প্রক্সি** — বডি কোথাও বাফার হয় না, তাই বড় আপলোডেও প্রক্সির মেমরি বাড়ে না। দাম: এক বাইট বেরিয়ে গেলে আর retry করা যায় না, তাই retry করতে হলে বডি বাফার করতেই হবে
- **EWMA latency + inFlight** — least-response-time আর power-of-two দুটোই একটাই cost ফাংশনে চলে, তাই ধীর নোড নিজে থেকেই কম কাজ পায়
- **Ring fallback** — consistent hashing-এর মালিক নোড মরলে সব key একটামাত্র প্রতিবেশীতে ঝাঁপিয়ে পড়ে না
- **সঠিক SIGTERM ক্রম** — আগে readiness ফেল, তারপর drain window, তারপর listener বন্ধ, শেষে deadline সহ exit

## যেসব ভুল বারবার হয়

- **health check-এ ডেটাবেস যাচাই করা।** DB এক মিনিট ধীর হলে পুরো ফ্লিট একসাথে পুল থেকে বেরিয়ে যায় — একটা ধীরগতি সরাসরি একটা সম্পূর্ণ outage-এ পরিণত হয়।
- **drain window আর health check interval না মেলানো।** probe প্রতি ৩০ সেকেন্ডে একবার হলে ৫ সেকেন্ডের drain window পুরোপুরি অর্থহীন।
- **retry-তে backoff বা বাজেট না রাখা।** সবাই তিনবার করে retry করলে একটা ছোট গোলযোগ তৎক্ষণাৎ তিন গুণ ট্রাফিকে রূপ নেয়, আর সেটাই retry storm।
- **timeout ছাড়া প্রক্সি।** upstream টাইমআউট না থাকলে একটা আটকে থাকা backend ধীরে ধীরে আপনার প্রক্সির সব connection স্লট গিলে ফেলবে।
- **sticky session দিয়ে stateful ডিজাইন ঢাকা।** এতে সমস্যাটা মেটে না, শুধু সেটা লোড ব্যালান্সারের কনফিগে গিয়ে লুকায়।

স্টেটলেস অ্যাপ স্তর সমান্তরালে বাড়ানো তুলনামূলকভাবে সহজ — কারণ আপনি শুধু আরেকটা একরকম বাক্স যোগ করছেন। কিন্তু সেই সব বাক্স একই ডেটাবেসে গিয়ে ঠেকে, আর সেখানে "আরেকটা যোগ করে দাও" কথাটা মোটেও চলে না। ঠিক সেই সমস্যাটাই পরের চ্যাপ্টারের বিষয়।

<div class="takeaways">

### মূল শেখা

- **L4 প্যাকেট দেখে, L7 রিকোয়েস্ট দেখে।** L7 ছাড়া path-ভিত্তিক রুটিং, retry বা ক্যাশিং সম্ভব নয়; আর HTTP/2 বা gRPC-র সামনে শুধু L4 বসালে বণ্টন কার্যত ঘটে না
- অ্যালগরিদমের ক্রম মোটামুটি নির্দিষ্ট: round robin সবচেয়ে দুর্বল, least connections প্রায় সবসময়ই ভালো, আর বড় ফ্লিটে **power-of-two-choices** সবচেয়ে ভালো খরচ-লাভের অনুপাত দেয়
- **Consistent hashing** ক্যাশ-অ্যাফিনিটির জন্য, সমান বণ্টনের জন্য নয় — hot key থাকলে bounded-load সংস্করণ লাগবে
- **health check নিজেই সবচেয়ে বড় outage-এর উৎস।** probe হালকা রাখুন, threshold ব্যবহার করুন, আর panic mode অবশ্যই রাখুন — কোথাও ট্রাফিক না পাঠানোর চেয়ে সন্দেহভাজন নোডে পাঠানো ভালো
- **Liveness আর readiness এক জিনিস নয়।** liveness ফেল মানে restart, readiness ফেল মানে শুধু ট্রাফিক বন্ধ। liveness probe-এ কখনো নির্ভরতা যাচাই করবেন না
- **Sticky session একটা ব্যান্ডেজ, সমাধান নয়।** সেশন Redis বা টোকেনে, ফাইল অবজেক্ট স্টোরেজে, জব কিউতে — তারপর যেকোনো instance যেকোনো রিকোয়েস্ট সামলাতে পারে
- graceful shutdown-এর ক্রমটা মুখস্থ রাখুন: SIGTERM → readiness ফেল → drain window → listener বন্ধ → in-flight শেষ → exit। ধাপ উল্টালে প্রতিটা deploy-এ 502 ঝরবে
- লোড ব্যালান্সার নিজেই একটা single point of failure — জোড়ায় চালান, উপরে anycast রাখুন, আর তার নিজের ক্ষমতার হিসাব রাখুন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Google**-এর Maglev হলো সফটওয়্যারে লেখা L4 ব্যালান্সার যেটা consistent hashing দিয়ে connection ধরে রাখে, তাই ব্যালান্সার নোড যোগ-বিয়োগ হলেও চলমান TCP connection ভাঙে না
- **Netflix**-এর Zuul এবং তাদের গবেষণাই least-connections-এর black hole সমস্যাটা জনপ্রিয়ভাবে তুলে ধরে; তারা এখন latency-সচেতন choice-of-two ব্যবহার করে
- **Envoy** (Lyft-এ জন্ম, আজ প্রায় সব service mesh-এর ভিত্তি) panic threshold, outlier detection আর zone-সচেতন রুটিং সরাসরি কনফিগে দেয় — এই চ্যাপ্টারের ধারণাগুলো সেখানে হাতে-কলমে দেখা যায়
- **Cloudflare** anycast দিয়ে একই IP পৃথিবীর তিনশোর বেশি শহর থেকে ঘোষণা করে, ফলে একটা POP পড়ে গেলে BGP নিজেই ট্রাফিক পাশের শহরে সরিয়ে দেয় — কোনো DNS TTL-এর অপেক্ষা ছাড়াই

</div>
