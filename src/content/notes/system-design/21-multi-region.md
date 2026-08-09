---
title: 'মাল্টি-রিজিয়ন আর্কিটেকচার'
subtitle: 'একাধিক region-এ সিস্টেম ছড়ানো — active-passive থেকে active-active, replication lag, conflict resolution, failover আর split-brain ঠেকানোর পুরো গল্প।'
chapter: 21
level: 'mastery'
readingTime: '২৫ মিনিট'
topics:
  ['multi-region', 'active-active', 'failover', 'replication', 'split-brain', 'data residency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনার একটা তিজারত ঘর — কাপড়, কাগজ আর মশলার কারবার। শুরুতে পুরো ব্যবসাটা ছিল বাগদাদের একটামাত্র আড়তে। খাতা এক, গুদাম এক, সিদ্ধান্ত নেওয়ার লোকও এক। কর্ডোবার খদ্দের ফাতিমা আল-ফিহরি যখন একটা অর্ডার পাঠাত, উটের কাফেলা চিঠি নিয়ে বাগদাদে পৌঁছাতে পাঁচ সপ্তাহ, ইবনে সিনার সিলমোহর-করা জবাব ফিরে আসতে আরও পাঁচ সপ্তাহ। কর্ডোবার লোকজন বিরক্ত — একটা কাপড়ের দাম জানতেও দশ সপ্তাহ। এদিকে বাগদাদে একবার বন্যায় আড়তের নিচতলা ডুবে গেল, আর গোটা কারবার আটচল্লিশ দিন বন্ধ থাকল, কারণ খাতাও সেখানে, গুদামও সেখানে। তার উপর কর্ডোবার শাসক নতুন ফরমান জারি করলেন — আন্দালুসের নাগরিকদের কারবারের হিসাব আন্দালুসের ভেতরেই রাখতে হবে, বাগদাদে পাঠানো চলবে না।

তাই ইবনে সিনা তিনটে শাখা খুলল: বাগদাদ, কর্ডোবা আর সমরকন্দ। প্রতিটা শাখায় নিজস্ব গুদাম, নিজস্ব খাতা, নিজস্ব একজন দায়িত্বশীল মুনশি। নিয়ম হলো — প্রতিটা খদ্দেরের একটা "নিজের শাখা" থাকবে। ফাতিমা আল-ফিহরির যাবতীয় হিসাব কর্ডোবার খাতায়, আল-বিরুনির হিসাব সমরকন্দের খাতায়। খদ্দের যদি নিজের শহরেই থাকে, সে সরাসরি কাছের শাখায় গিয়ে জিনিস কিনে ফেলে — কোনো কাফেলার অপেক্ষা নেই, জবাব সাথে সাথে। কিন্তু আল-বিরুনি যদি ব্যবসার কাজে কর্ডোবা যায় আর সেখান থেকে নতুন অর্ডার দিতে চায়, তখন কর্ডোবার মুনশি তার নিজের খাতায় লেখে না — সে অর্ডারটা সমরকন্দে পাঠায়, কারণ আল-বিরুনির খাতার মালিক সমরকন্দ। শুধু "আল-বিরুনির পুরনো বকেয়া কত" এই তথ্যটুকু কর্ডোবার মুনশির কাছে একটা পুরনো নকলে থাকে — সেটা দেখাতে পারে, কিন্তু তাতে নতুন কিছু লিখতে পারে না।

প্রতি সপ্তাহে তিন শাখার মধ্যে কাফেলা যাতায়াত করে — প্রতিটা শাখা নিজের খাতার নতুন এন্ট্রিগুলোর নকল অন্য দুই শাখায় পাঠায়। ফলে সমরকন্দের মুনশি জানে কর্ডোবায় গত সপ্তাহে কী কী হয়েছে, তবে এই সপ্তাহে কী হচ্ছে তা জানে না। এই "জানার পিছিয়ে থাকা"টাই সবচেয়ে বিপজ্জনক জায়গা। একবার হলোও তাই: একই দিনে ফাতিমা আল-ফিহরি কর্ডোবায় তার ঠিকানা বদলাল, আর তার ভাই একই খদ্দের-নম্বর দেখিয়ে বাগদাদে গিয়ে অন্য একটা ঠিকানা বসিয়ে দিল। কাফেলা এসে দেখা গেল দুই খাতায় দুই ঠিকানা, আর কোনটা পরে হয়েছে তা কেউ নিশ্চিত করে বলতে পারছে না — কারণ দুই শহরের ঘড়িও এক নয়। ইবনে সিনা তখন নিয়ম করল: প্রতিটা এন্ট্রির গায়ে শুধু তারিখ নয়, প্রতিটা শাখার নিজস্ব ক্রমিক গোনাও লিখতে হবে, যাতে পরে বসে বলা যায় কোন এন্ট্রি কোনটার পরে হয়েছে আর কোন দুটো সত্যিই একসাথে হয়েছে। যেগুলো সত্যিই একসাথে হয়েছে, সেগুলো নিয়ে মুনশি নিজে সিদ্ধান্ত নেবে না — মালিকের কাছে যাবে।

আসল পরীক্ষাটা এলো যেদিন সমরকন্দে আগুন লাগল। কাফেলা খবর আনল দশ দিন পর, কিন্তু ততদিনে বুখারা-সমরকন্দ অঞ্চলের খদ্দেররা কারবার করতে পারছে না। ইবনে সিনা আগে থেকেই একটা মহড়া ঠিক করে রেখেছিল — বছরে দুবার সে ইচ্ছে করে একটা শাখাকে "বন্ধ" ঘোষণা করে দেখত সেই অঞ্চলের খদ্দেররা অন্য শাখা থেকে সেবা পাচ্ছে কিনা। সেই মহড়ার কারণেই সবাই জানত, সমরকন্দ বন্ধ হলে ওই অঞ্চলের খাতার দায়িত্ব বাগদাদ নেবে। কিন্তু এখানেও একটা ফাঁদ ছিল — কাফেলা যদি শুধু নষ্ট হয়ে থাকে আর সমরকন্দের মুনশি দিব্যি বহাল থাকে, তাহলে বাগদাদ আর সমরকন্দ দুই জায়গাতেই একই খদ্দেরের খাতায় লেখা হবে, আর হিসাব চিরতরে গুলিয়ে যাবে। তাই ইবনে সিনা নিয়ম করল: কোনো শাখা নিজে নিজে দায়িত্ব নিতে পারবে না; তিন শাখার অন্তত দুজন মুনশি একমত হয়ে সিলমোহর-করা ফরমান দিলে তবেই নতুন শাখা খাতার মালিক হবে, আর সেই ফরমানের গায়ে একটা বাড়তে থাকা নম্বর থাকবে — পুরনো নম্বরের সিলমোহর নিয়ে কেউ এলে সবাই তাকে ফিরিয়ে দেবে।

মিলিয়ে নিই: তিনটে শহরে তিন শাখা হলো **multi-region deployment**; প্রতিটা খদ্দেরের নির্দিষ্ট শাখা হলো **home region** আর সেটা দিয়ে খাতা ভাগ করাই **data partitioning by region**; আন্দালুসের ফরমান হলো **data residency / compliance**; কাছের শাখা থেকে সাথে সাথে সেবা পাওয়া হলো কম **latency**; কর্ডোবা থেকে আল-বিরুনির পুরনো বকেয়া দেখানো কিন্তু লিখতে না পারা হলো **read-local, write-global**; সাপ্তাহিক কাফেলা হলো **async cross-region replication** আর তার পিছিয়ে থাকা হলো **replication lag**; আগুনে যতটুকু এন্ট্রি হারাল তা হলো **RPO** আর কারবার ফিরে আসতে যত সময় লাগল তা **RTO**; দুই শহরে দুই ঠিকানা হলো **write conflict** আর ক্রমিক গোনা হলো **version vector**; সমরকন্দ বন্ধ হলে বাগদাদের দায়িত্ব নেওয়া হলো **failover**; দুই শাখা একসাথে মালিক হয়ে যাওয়ার আশঙ্কা হলো **split-brain**, দুজন মুনশির একমত হওয়া হলো **quorum**, বাড়তে থাকা সিলমোহর নম্বর হলো **fencing token**, আর বছরে দুবারের মহড়া হলো **regional evacuation drill**।

## কেন multi-region

একটা region-এ সব রাখলে সিস্টেম সরল থাকে, ডিবাগ করা সহজ, আর consistency নিয়ে ভাবতে হয় না। তাই multi-region-এ যাওয়ার সিদ্ধান্তটা সবসময় একটা নির্দিষ্ট চাপের জবাব হওয়া উচিত — তিনটার যেকোনো একটা।

**Latency।** আলো ফাইবারে যায় প্রায় ২০০,০০০ কিমি/সেকেন্ড। সিঙ্গাপুর থেকে ভার্জিনিয়া round-trip মানেই বাস্তবে ১৮০-২৩০ ms, আর সেটা কোনো ইঞ্জিনিয়ারিং দিয়ে কমানো যায় না — এটা পদার্থবিজ্ঞান। আপনার p99 SLO যদি ৩০০ ms হয় আর একটা পেজ লোডে ছয়টা dependent call থাকে, তবে দূরত্বই আপনার error budget খেয়ে ফেলবে। CDN দিয়ে static আর cacheable জিনিস edge-এ আনা যায় (চ্যাপ্টার ১৫), কিন্তু personalised, write-heavy path CDN-এ বসে না — সেটার জন্য compute আর data-ই কাছে আনতে হয়।

**Data residency ও compliance।** GDPR, ভারতের DPDP, চীনের PIPL, সৌদি আরবের NDMO — অনেক জায়গাতেই নাগরিকের personal data দেশের বাইরে যাওয়ার উপর শর্ত আছে। এখানে multi-region কোনো performance সিদ্ধান্ত নয়, এটা একটা আইনি বাধ্যবাধকতা: EU tenant-এর row EU region ছাড়া অন্য কোথাও লেখাই যাবে না, backup-ও না, analytics replica-ও না।

**Availability।** একটা AWS region পুরোপুরি বসে যাওয়া বিরল, কিন্তু হয় — এবং হলে আপনার multi-AZ setup কোনো কাজে আসে না, কারণ AZ-গুলো একই region-এর ভেতরে। ৯৯.৯৯% availability (বছরে ~৫২ মিনিট downtime) একক region-এ কাগজে-কলমে সম্ভব; কিন্তু একটাও region-wide event ঘটলেই বাজেট শেষ। ৯৯.৯৯%-এর উপরে যেতে চাইলে region-ই আপনার failure domain।

<Callout type="warning">

**কখন multi-region দরকার নেই।** যদি আপনার ইউজার একটা ভৌগোলিক অঞ্চলেই থাকে, কোনো residency বাধ্যবাধকতা না থাকে, আর SLO ৯৯.৯% হয় — multi-region আপনার availability বাড়াবে না, কমাবে। কারণ আপনি একটা নতুন failure mode যোগ করছেন: cross-region replication। বেশিরভাগ প্রোডাকশন incident-এর কারণ হয় deploy, config change বা dependency — region outage নয়। আগে multi-AZ, ভালো deploy pipeline, আর failure design (চ্যাপ্টার ১৯) ঠিক করুন। multi-region-এর খরচ শুধু ডলার নয়, প্রতিটা future feature-এর ডিজাইন খরচও বেড়ে যায়।

</Callout>

## Active-passive, active-active, আর মাঝের ধাপ

তিনটে প্রধান topology আছে, আর এদের মধ্যে পার্থক্যটা মূলত একটাই প্রশ্নের জবাব: **write কোথায় হয়?**

<Mermaid
title="Multi-Region Topologies"
code={`graph TD
  subgraph AP["Active-Passive"]
    AP1["Baghdad<br/>reads + writes"] -->|"async replication"| AP2["Cordoba<br/>standby, no traffic"]
  end
  subgraph RL["Read-Local / Write-Global"]
    RL1["Cordoba<br/>reads served locally"] -->|"writes forwarded"| RL2["Baghdad<br/>single write leader"]
    RL2 -->|"replicate back"| RL1
  end
  subgraph AA["Active-Active"]
    AA1["Baghdad<br/>owns tenant set A"] <-->|"bidirectional<br/>conflict resolution"| AA2["Cordoba<br/>owns tenant set B"]
  end`}
/>

**Active-passive** সবচেয়ে সরল। একটা region সব traffic নেয়, আরেকটা শুধু replica ধরে বসে থাকে। কোনো write conflict নেই, কারণ writer একজনই। দাম দিতে হয় দুই জায়গায়: passive region-এর hardware বসে বসে টাকা খায়, আর failover-এর সময় RTO বড় হয় (DNS propagate, replica promote, connection pool গরম হওয়া)। আরও বড় ঝুঁকি — passive path কখনো ব্যবহার না হলে সেটা নীরবে নষ্ট হয়ে থাকে, আর ঠিক দুর্যোগের দিনে আবিষ্কার হয় যে schema migration ওখানে চলেনি।

**Read-local, write-global** হলো বাস্তবে সবচেয়ে বেশি ব্যবহৃত মাঝের ধাপ। প্রতিটা region local replica থেকে read সার্ভ করে, কিন্তু সব write একটা global leader-এ যায়। read latency নেমে আসে, write latency দূরত্ব অনুযায়ীই থাকে। এখানে সবচেয়ে বড় ফাঁদ হলো **read-your-writes** ভাঙা: ইবনে সিনা কর্ডোবা থেকে profile আপডেট করল (write গেল বাগদাদে), তারপর সাথে সাথে page reload করল (read এলো কর্ডোবার replica থেকে, যেখানে এখনো পুরনো ডেটা)। ব্যবহারকারীর কাছে মনে হয় সেভ হয়নি। সমাধান হলো write-এর পর সেই session-কে কিছুক্ষণের জন্য leader-এ pin করা, অথবা write থেকে ফেরত পাওয়া replication position ধরে replica-তে wait করা — consistency চ্যাপ্টারে যেটাকে আমরা session guarantee বলেছিলাম।

**Active-active** মানে প্রতিটা region-ই write নেয়। এখানে আসল প্রশ্নটা topology নয়, ownership: দুটো region কি **একই row**-তে write নিতে পারে? যদি না পারে — অর্থাৎ প্রতিটা row-এর একটা নির্দিষ্ট home region থাকে — তাহলে এটা আসলে "partitioned active-active", conflict প্রায় থাকেই না, আর এটাই বেশিরভাগ SaaS-এর সঠিক উত্তর। যদি পারে, তাহলে আপনাকে সত্যিকারের conflict resolution লিখতে হবে, এবং সেটা কঠিন।

| দিক           | Active-passive       | Read-local / write-global  | Partitioned active-active    | Full active-active |
| ------------- | -------------------- | -------------------------- | ---------------------------- | ------------------ |
| Write latency | কাছের region-এ কম    | দূরের leader অনুযায়ী বেশি | home region-এ কম             | সব জায়গায় কম     |
| Read latency  | একই region-এ কম      | সব region-এ কম             | home-এ কম, cross-region বেশি | সব জায়গায় কম     |
| Conflict      | নেই                  | নেই                        | কার্যত নেই                   | resolve করতেই হবে  |
| RTO           | মিনিট (promote লাগে) | মিনিট                      | সেকেন্ড (per-partition)      | প্রায় শূন্য       |
| খরচ           | passive idle         | মাঝারি                     | বেশি                         | সবচেয়ে বেশি       |
| ডিজাইন জটিলতা | কম                   | মাঝারি                     | বেশি                         | সবচেয়ে বেশি       |

<Callout type="tip">

বেশিরভাগ টিম "active-active চাই" বলে আসলে "প্রতিটা region থেকে দ্রুত read আর কোনো region মরে গেলে যেন সেবা চলে" বোঝায়। সেটা partitioned active-active দিয়েই পাওয়া যায়, full multi-master conflict resolution ছাড়াই। আগে ঠিক করুন কোন ডেটা সত্যিই যেকোনো region থেকে লেখা দরকার — সাধারণত সেটা মোট schema-র ৫% এর কম।

</Callout>

## Data locality — home region আর partitioning

Multi-region-এর সবচেয়ে গুরুত্বপূর্ণ ডিজাইন সিদ্ধান্তটা কোড নয়, স্কিমা: **partition key-তে region ঢুকবে কিনা**। যদি প্রতিটা tenant, user বা account-এর একটা `home_region` থাকে, তবে বাকি প্রায় সব সমস্যা সরল হয়ে যায় — কারণ প্রতিটা row-এর ঠিক একজন মালিক থাকে, আর দুই region একই row-তে একসাথে লিখবে না।

Home region ঠিক হয় সাধারণত তিনটার একটা দিয়ে: signup-এর সময়ের ভৌগোলিক অবস্থান, tenant-এর ঘোষিত residency policy (compliance-এর ক্ষেত্রে এটাই একমাত্র বৈধ ভিত্তি), অথবা admin-এর হাতে বসানো মান। গুরুত্বপূর্ণ হলো — এটা একটা **স্থিতিশীল, লেখা থাকা** মান হতে হবে, request-এর সময় IP দেখে অনুমান করা মান নয়। অনুমান করলে একই ইউজার ভ্রমণে গেলে অন্য region-এ write করে বসবে, আর সেটাই আপনার conflict-এর জন্ম।

Region routing-এ consistent hashing (চ্যাপ্টার ৮) সরাসরি লাগানোর লোভ হয়, কিন্তু সাবধান: hash দিয়ে region বাছলে আপনি residency নিয়ন্ত্রণ হারাবেন, কারণ hash জানে না কোন tenant EU-তে থাকতে বাধ্য। সঠিক পদ্ধতি হলো দুই স্তর — প্রথমে policy দিয়ে region বাছুন, তারপর সেই region-এর ভেতরে shard বাছতে consistent hashing ব্যবহার করুন।

<Mermaid
title="Home Region Routing"
code={`graph TD
  U["Request<br/>tenant: fatima-al-fihri"] --> R["Edge Router<br/>resolve home region"]
  R --> D{"Is this the<br/>home region?"}
  D -->|"yes"| L["Local write path<br/>strong consistency"]
  D -->|"no, read"| C["Local replica<br/>stale-tolerant read"]
  D -->|"no, write"| F["Forward to home region<br/>cross-region hop"]
  F --> L
  L --> RP["Replicate outward<br/>async, lag tracked"]
  RP --> C`}
/>

Cross-region read-এর জন্য তিনটে কৌশল আছে, আর কোনটা বাছবেন তা নির্ভর করে ডেটার staleness সহ্যক্ষমতার উপর। প্রথমত, **local replica থেকে stale read** — সবচেয়ে দ্রুত, কিন্তু ডেটা কয়েকশো ms থেকে কয়েক সেকেন্ড পুরনো হতে পারে; ক্যাটালগ, প্রোফাইল বা settings-এর জন্য চমৎকার। দ্বিতীয়ত, **home region-এ synchronous hop** — সঠিক কিন্তু ধীর; ব্যালেন্স, quota বা permission check-এর জন্য দরকারি। তৃতীয়ত, **local read + version check** — local replica থেকে পড়ুন, কিন্তু response-এ replication position জুড়ে দিন, আর ক্লায়েন্ট যদি এর চেয়ে নতুন কিছু আগে দেখে থাকে তবেই home region-এ যান। এই তৃতীয়টাই বেশিরভাগ ক্ষেত্রে সেরা ভারসাম্য।

<Callout type="info">

Residency-bound ডেটাকে schema-তেই আলাদা করে ফেলা সবচেয়ে নিরাপদ। যেমন `users` টেবিলে শুধু `id`, `home_region` আর একটা opaque handle রাখুন — নাম, ইমেইল, ঠিকানা থাকুক region-local `user_profiles` টেবিলে। তখন global index, global cache বা analytics warehouse ভুল করেও PII অন্য region-এ নিয়ে যেতে পারবে না, কারণ সেখানে PII কখনো ছিলই না।

</Callout>

## Cross-region replication

Region-এর মধ্যে synchronous replication বাস্তবে প্রায় কখনোই চলে না — প্রতিটা write-এ ১৫০ ms যোগ হলে আপনার p99 শেষ, আর দূরের region ধীর হলে কাছের region-ও থেমে যায় (failure domain জোড়া লেগে যায়, যেটা multi-region-এর মূল উদ্দেশ্যের বিরুদ্ধে)। তাই cross-region replication কার্যত সবসময় **async**, আর তার মানে সবসময় **lag** আছে।

Lag-কে সময় দিয়ে মাপা হয় না, মাপা হয় **position** দিয়ে — leader-এর সর্বশেষ লেখা log position বনাম follower-এর apply করা position। এই দুইয়ের পার্থক্যকে সময়ে রূপান্তর করলেই আপনার বর্তমান RPO ঝুঁকি বেরিয়ে আসে।

- **RPO (Recovery Point Objective)** — region হারালে কতটুকু ডেটা হারানো মেনে নেবেন। async replication-এ RPO প্রায় সমান বর্তমান replication lag। lag ৫ সেকেন্ড মানে আপনার RPO ৫ সেকেন্ড, চুক্তিতে যা-ই লেখা থাক।
- **RTO (Recovery Time Objective)** — কত সময়ে সেবা ফিরবে। এটা detection + decision + promotion + traffic steering-এর যোগফল, আর প্রায় সবসময় detection আর decision-ই সবচেয়ে বেশি সময় খায়, promotion নয়।

তাই replication lag শুধু একটা metric নয়, এটা একটা **SLI** — এর উপর SLO বসান (যেমন "p99 lag &lt; ১০ সেকেন্ড"), আর error budget পুড়তে থাকলে সেটাকে release-থামানোর মতোই গুরুত্ব দিন। কারণ lag বেড়ে যাওয়া মানে আপনার RPO প্রতিশ্রুতি নীরবে ভেঙে যাচ্ছে।

Replication feed তৈরির স্বাভাবিক উপায় হলো CDC (চ্যাপ্টার ১৪) — ডেটাবেসের WAL/binlog থেকে change stream বের করে অন্য region-এ apply করা। এতে application কোডকে dual-write করতে হয় না, আর dual-write-এর সেই চিরকালীন সমস্যা (একটা সফল, অন্যটা ব্যর্থ) এড়ানো যায়।

### Conflict resolution

একই key-তে দুই region একসাথে লিখলে কী হবে — এই প্রশ্নের তিনটে বাস্তব উত্তর আছে।

**Last-Writer-Wins (LWW)।** সবচেয়ে সহজ: বেশি timestamp-ওয়ালা জেতে। সমস্যা হলো clock skew — region-গুলোর ঘড়ি NTP দিয়েও কয়েক মিলিসেকেন্ড থেকে কয়েকশো মিলিসেকেন্ড আলাদা থাকতে পারে, ফলে আসলে পরে হওয়া write নীরবে হারিয়ে যেতে পারে। LWW ঠিক আছে সেসব ফিল্ডে যেখানে হারানো write-এর দাম কম — "last seen at", theme preference, device token। ব্যালেন্স, inventory বা permission-এ কখনো নয়।

**Version vector।** প্রতিটা region তার নিজের counter বাড়ায়, আর প্রতিটা value বহন করে সব region-এর counter-এর মানচিত্র। দুটো version তুলনা করলে তিনটে জবাবের একটা পাওয়া যায় — একটা আরেকটার পরে (দ্বন্দ্ব নেই, নতুনটা নাও), সমান (কিছুই করার নেই), অথবা **concurrent** (সত্যিকারের conflict, কেউ কারও পরে নয়)। version vector conflict _ঠিক করে_ না, কিন্তু এটাই একমাত্র উপায় যা নির্ভুলভাবে **শনাক্ত** করে কোনটা আসলেই conflict — আর সেটাই সবচেয়ে দামি অংশ, কারণ LWW-র সবচেয়ে বড় পাপ হলো conflict-কে conflict বলে চিনতেই না পারা।

**Application-level merge।** concurrent হলে ব্যবসার নিয়ম দিয়ে মেলানো: shopping cart হলে দুই কার্টের union নাও; counter হলে দুই region-এর বৃদ্ধি যোগ করো; document হলে দুটোকেই রেখে ইউজারকে দেখাও। এখানেই CRDT-এর ধারণা কাজে লাগে — এমন ডেটা টাইপ যাদের merge অপারেশন commutative আর associative, ফলে কোন ক্রমে merge হলো তাতে ফলাফল বদলায় না।

| কৌশল                          | conflict শনাক্ত করে | ডেটা হারায়  | কখন ব্যবহার                        |
| ----------------------------- | ------------------- | ------------ | ---------------------------------- |
| Last-Writer-Wins              | না                  | হ্যাঁ, নীরবে | কম-দামি, শেষ-মানই যথেষ্ট এমন ফিল্ড |
| Version vector + LWW fallback | হ্যাঁ               | কখনো কখনো    | সাধারণ entity update               |
| Version vector + app merge    | হ্যাঁ               | না           | cart, counter, collaborative doc   |
| Single-writer (home region)   | প্রশ্নই ওঠে না      | না           | ব্যালেন্স, inventory, permission   |

<Callout type="warning">

Conflict resolution লেখার আগে নিজেকে জিজ্ঞেস করুন — এই row-টা কি সত্যিই দুই region থেকে লেখা দরকার? বেশিরভাগ ক্ষেত্রে উত্তর "না", আর তখন home-region ownership দিয়ে পুরো সমস্যাটাই মুছে ফেলা যায়। conflict resolution হলো শেষ অস্ত্র, প্রথম নয়।

</Callout>

## Region-aware router

নিচের implementation-টা একটা edge router-এর মূল অংশ: এটা tenant-এর home region resolve করে, region-গুলোর health track করে, read-কে local বা home-এ পাঠায়, write-কে home region-এ forward করে, আর home region অসুস্থ হলে fencing token সহ failover করে। মনে রাখবেন — failover-এর সিদ্ধান্ত router নিজে নেয় না, সে শুধু control plane-এর দেওয়া epoch মেনে চলে।

<CodeTabs tsFile="region-router.ts" goFile="region-router.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// Region-aware request router with health tracking and fenced failover.

export type RegionId = 'baghdad' | 'cordoba' | 'samarkand';
export type Residency = 'eu-only' | 'me-only' | 'any';

export interface RegionHealth {
	id: RegionId;
	healthy: boolean;
	consecutiveFailures: number;
	lastProbeAt: number;
	rttMs: number;
	replicationLagMs: number;
}

export interface TenantPlacement {
	tenantId: string;
	homeRegion: RegionId;
	residency: Residency;
	/** Bumped by the control plane on every ownership change. */
	epoch: number;
}

export interface RouteDecision {
	target: RegionId;
	mode: 'local-read' | 'home-read' | 'home-write' | 'failover-write';
	epoch: number;
	staleReadAllowed: boolean;
	reason: string;
}

const RESIDENCY_ALLOWED: Record<Residency, RegionId[]> = {
	'eu-only': ['cordoba'],
	'me-only': ['baghdad'],
	any: ['baghdad', 'cordoba', 'samarkand']
};

const FAILURE_THRESHOLD = 3;
const MAX_STALE_READ_LAG_MS = 10_000;

export class RegionRegistry {
	private health = new Map<RegionId, RegionHealth>();

	constructor(regions: RegionId[]) {
		for (const id of regions) {
			this.health.set(id, {
				id,
				healthy: true,
				consecutiveFailures: 0,
				lastProbeAt: Date.now(),
				rttMs: 0,
				replicationLagMs: 0
			});
		}
	}

	recordProbe(id: RegionId, ok: boolean, rttMs: number, lagMs: number): void {
		const h = this.health.get(id);
		if (!h) return;

		h.lastProbeAt = Date.now();
		h.rttMs = rttMs;
		h.replicationLagMs = lagMs;

		if (ok) {
			h.consecutiveFailures = 0;
			h.healthy = true;
			return;
		}

		h.consecutiveFailures += 1;
		// A single failed probe is noise; sustained failure is a signal.
		if (h.consecutiveFailures >= FAILURE_THRESHOLD) {
			h.healthy = false;
		}
	}

	get(id: RegionId): RegionHealth | undefined {
		return this.health.get(id);
	}

	isHealthy(id: RegionId): boolean {
		return this.health.get(id)?.healthy ?? false;
	}
}

export class PlacementStore {
	private placements = new Map<string, TenantPlacement>();

	put(p: TenantPlacement): void {
		const existing = this.placements.get(p.tenantId);
		// Reject stale ownership claims — this is the fencing check.
		if (existing && p.epoch <= existing.epoch) {
			throw new Error(
				`stale placement for ${p.tenantId}: epoch ${p.epoch} <= current ${existing.epoch}`
			);
		}
		if (!RESIDENCY_ALLOWED[p.residency].includes(p.homeRegion)) {
			throw new Error(`residency violation: ${p.homeRegion} not allowed for ${p.residency}`);
		}
		this.placements.set(p.tenantId, p);
	}

	get(tenantId: string): TenantPlacement | undefined {
		return this.placements.get(tenantId);
	}
}

export class RegionRouter {
	constructor(
		private readonly localRegion: RegionId,
		private readonly registry: RegionRegistry,
		private readonly placements: PlacementStore
	) {}

	route(tenantId: string, op: 'read' | 'write', requireFresh: boolean): RouteDecision {
		const placement = this.placements.get(tenantId);
		if (!placement) {
			throw new Error(`no placement registered for tenant ${tenantId}`);
		}

		const home = placement.homeRegion;

		if (op === 'read') {
			return this.routeRead(placement, requireFresh);
		}

		// Writes must land in the home region — unless it is down and a
		// fenced failover target exists.
		if (this.registry.isHealthy(home)) {
			return {
				target: home,
				mode: 'home-write',
				epoch: placement.epoch,
				staleReadAllowed: false,
				reason: 'home region healthy'
			};
		}

		const fallback = this.pickFailoverTarget(placement);
		if (!fallback) {
			throw new Error(
				`no failover target for ${tenantId}: residency ${placement.residency} pins it to ${home}`
			);
		}

		return {
			target: fallback,
			mode: 'failover-write',
			epoch: placement.epoch,
			staleReadAllowed: false,
			reason: `home region ${home} unhealthy, failing over`
		};
	}

	private routeRead(placement: TenantPlacement, requireFresh: boolean): RouteDecision {
		const local = this.registry.get(this.localRegion);
		const localUsable =
			local?.healthy === true &&
			local.replicationLagMs <= MAX_STALE_READ_LAG_MS &&
			RESIDENCY_ALLOWED[placement.residency].includes(this.localRegion);

		if (!requireFresh && localUsable) {
			return {
				target: this.localRegion,
				mode: 'local-read',
				epoch: placement.epoch,
				staleReadAllowed: true,
				reason: `local replica within lag budget (${local?.replicationLagMs}ms)`
			};
		}

		const home = placement.homeRegion;
		if (this.registry.isHealthy(home)) {
			return {
				target: home,
				mode: 'home-read',
				epoch: placement.epoch,
				staleReadAllowed: false,
				reason: requireFresh ? 'read-your-writes required' : 'local replica too stale'
			};
		}

		// Home is down and the caller wants fresh data: degrade explicitly
		// rather than silently serving unknown-age data.
		if (localUsable) {
			return {
				target: this.localRegion,
				mode: 'local-read',
				epoch: placement.epoch,
				staleReadAllowed: true,
				reason: 'home region down, serving degraded stale read'
			};
		}

		throw new Error(`no readable region for tenant ${placement.tenantId}`);
	}

	private pickFailoverTarget(placement: TenantPlacement): RegionId | null {
		const allowed = RESIDENCY_ALLOWED[placement.residency].filter(
			(r) => r !== placement.homeRegion
		);

		const candidates = allowed
			.map((id) => this.registry.get(id))
			.filter((h): h is RegionHealth => Boolean(h) && h!.healthy)
			// Prefer the freshest replica: least data loss on promotion.
			.sort((a, b) => a.replicationLagMs - b.replicationLagMs);

		return candidates.length > 0 ? candidates[0].id : null;
	}
}

// --- Control plane side: quorum-gated promotion ---------------------------

export interface PromotionVote {
	voter: RegionId;
	agreesHomeIsDown: boolean;
	observedLagMs: number;
}

export interface PromotionResult {
	promoted: boolean;
	newHome?: RegionId;
	newEpoch?: number;
	estimatedDataLossMs?: number;
	reason: string;
}

export class FailoverCoordinator {
	constructor(
		private readonly registry: RegionRegistry,
		private readonly placements: PlacementStore,
		private readonly totalVoters: number
	) {}

	/**
	 * Promotion requires a strict majority of control-plane voters to agree
	 * that the home region is unreachable. Without this, a network partition
	 * lets both sides promote themselves — split-brain.
	 */
	promote(tenantId: string, votes: PromotionVote[]): PromotionResult {
		const placement = this.placements.get(tenantId);
		if (!placement) return { promoted: false, reason: 'unknown tenant' };

		const quorum = Math.floor(this.totalVoters / 2) + 1;
		const agreeing = votes.filter((v) => v.agreesHomeIsDown);

		if (agreeing.length < quorum) {
			return {
				promoted: false,
				reason: `no quorum: ${agreeing.length}/${this.totalVoters}, need ${quorum}`
			};
		}

		const target = agreeing
			.filter((v) => v.voter !== placement.homeRegion && this.registry.isHealthy(v.voter))
			.filter((v) => RESIDENCY_ALLOWED[placement.residency].includes(v.voter))
			.sort((a, b) => a.observedLagMs - b.observedLagMs)[0];

		if (!target) {
			return { promoted: false, reason: 'quorum reached but no eligible target region' };
		}

		const newEpoch = placement.epoch + 1;
		this.placements.put({
			tenantId,
			homeRegion: target.voter,
			residency: placement.residency,
			epoch: newEpoch
		});

		console.log(
			`[FAILOVER] tenant=${tenantId} ${placement.homeRegion} -> ${target.voter} epoch=${newEpoch} rpo=${target.observedLagMs}ms`
		);

		return {
			promoted: true,
			newHome: target.voter,
			newEpoch,
			estimatedDataLossMs: target.observedLagMs,
			reason: 'quorum agreed, freshest eligible replica promoted'
		};
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package region

// Region-aware request router with health tracking and fenced failover.

import (
	"fmt"
	"log"
	"sort"
	"sync"
	"time"
)

type RegionID string
type Residency string

const (
	Baghdad   RegionID = "baghdad"
	Cordoba   RegionID = "cordoba"
	Samarkand RegionID = "samarkand"

	EUOnly Residency = "eu-only"
	MEOnly Residency = "me-only"
	AnyRes Residency = "any"

	failureThreshold  = 3
	maxStaleReadLagMs = 10_000
)

var residencyAllowed = map[Residency][]RegionID{
	EUOnly: {Cordoba},
	MEOnly: {Baghdad},
	AnyRes: {Baghdad, Cordoba, Samarkand},
}

func allowedIn(res Residency, id RegionID) bool {
	for _, r := range residencyAllowed[res] {
		if r == id { return true }
	}
	return false
}

type RegionHealth struct {
	ID                  RegionID
	Healthy             bool
	ConsecutiveFailures int
	LastProbeAt         time.Time
	RTTMs               int64
	ReplicationLagMs    int64
}

type TenantPlacement struct {
	TenantID   string
	HomeRegion RegionID
	Residency  Residency
	Epoch      int64 // bumped by the control plane on every ownership change
}

type RouteMode string

const (
	LocalRead     RouteMode = "local-read"
	HomeRead      RouteMode = "home-read"
	HomeWrite     RouteMode = "home-write"
	FailoverWrite RouteMode = "failover-write"
)

type RouteDecision struct {
	Target           RegionID
	Mode             RouteMode
	Epoch            int64
	StaleReadAllowed bool
	Reason           string
}

// --- Registry -------------------------------------------------------------

type RegionRegistry struct {
	mu     sync.RWMutex
	health map[RegionID]*RegionHealth
}

func NewRegionRegistry(ids ...RegionID) *RegionRegistry {
	r := &RegionRegistry{health: make(map[RegionID]*RegionHealth, len(ids))}
	for _, id := range ids {
		r.health[id] = &RegionHealth{ID: id, Healthy: true, LastProbeAt: time.Now()}
	}
	return r
}

func (r *RegionRegistry) RecordProbe(id RegionID, ok bool, rttMs, lagMs int64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	h, exists := r.health[id]
	if !exists { return }
	h.LastProbeAt, h.RTTMs, h.ReplicationLagMs = time.Now(), rttMs, lagMs

	if ok {
		h.ConsecutiveFailures, h.Healthy = 0, true
		return
	}
	// A single failed probe is noise; sustained failure is a signal.
	h.ConsecutiveFailures++
	if h.ConsecutiveFailures >= failureThreshold { h.Healthy = false }
}

func (r *RegionRegistry) Get(id RegionID) (RegionHealth, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	h, ok := r.health[id]
	if !ok { return RegionHealth{}, false }
	return *h, true
}

func (r *RegionRegistry) IsHealthy(id RegionID) bool {
	h, ok := r.Get(id)
	return ok && h.Healthy
}

// --- Placement store ------------------------------------------------------

type PlacementStore struct {
	mu         sync.RWMutex
	placements map[string]TenantPlacement
}

func NewPlacementStore() *PlacementStore {
	return &PlacementStore{placements: make(map[string]TenantPlacement)}
}

func (s *PlacementStore) Put(p TenantPlacement) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Reject stale ownership claims — this is the fencing check.
	if existing, ok := s.placements[p.TenantID]; ok && p.Epoch <= existing.Epoch {
		return fmt.Errorf("stale placement for %s: epoch %d <= current %d", p.TenantID, p.Epoch, existing.Epoch)
	}
	if !allowedIn(p.Residency, p.HomeRegion) {
		return fmt.Errorf("residency violation: %s not allowed for %s", p.HomeRegion, p.Residency)
	}
	s.placements[p.TenantID] = p
	return nil
}

func (s *PlacementStore) Get(tenantID string) (TenantPlacement, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.placements[tenantID]
	return p, ok
}

// --- Router ---------------------------------------------------------------

type RegionRouter struct {
	local      RegionID
	registry   *RegionRegistry
	placements *PlacementStore
}

func NewRegionRouter(local RegionID, reg *RegionRegistry, pl *PlacementStore) *RegionRouter {
	return &RegionRouter{local: local, registry: reg, placements: pl}
}

func (rr *RegionRouter) Route(tenantID string, write, requireFresh bool) (RouteDecision, error) {
	p, ok := rr.placements.Get(tenantID)
	if !ok { return RouteDecision{}, fmt.Errorf("no placement registered for tenant %s", tenantID) }
	if !write { return rr.routeRead(p, requireFresh) }

	if rr.registry.IsHealthy(p.HomeRegion) {
		return RouteDecision{Target: p.HomeRegion, Mode: HomeWrite, Epoch: p.Epoch, Reason: "home region healthy"}, nil
	}

	target, ok := rr.pickFailoverTarget(p)
	if !ok {
		return RouteDecision{}, fmt.Errorf("no failover target for %s: residency %s pins it to %s", tenantID, p.Residency, p.HomeRegion)
	}
	return RouteDecision{
		Target: target, Mode: FailoverWrite, Epoch: p.Epoch,
		Reason: fmt.Sprintf("home region %s unhealthy, failing over", p.HomeRegion),
	}, nil
}

func (rr *RegionRouter) routeRead(p TenantPlacement, requireFresh bool) (RouteDecision, error) {
	local, found := rr.registry.Get(rr.local)
	localUsable := found && local.Healthy &&
		local.ReplicationLagMs <= maxStaleReadLagMs &&
		allowedIn(p.Residency, rr.local)

	if !requireFresh && localUsable {
		return RouteDecision{
			Target: rr.local, Mode: LocalRead, Epoch: p.Epoch, StaleReadAllowed: true,
			Reason: fmt.Sprintf("local replica within lag budget (%dms)", local.ReplicationLagMs),
		}, nil
	}

	if rr.registry.IsHealthy(p.HomeRegion) {
		reason := "local replica too stale"
		if requireFresh { reason = "read-your-writes required" }
		return RouteDecision{Target: p.HomeRegion, Mode: HomeRead, Epoch: p.Epoch, Reason: reason}, nil
	}

	// Home is down and the caller wants fresh data: degrade explicitly
	// rather than silently serving unknown-age data.
	if localUsable {
		return RouteDecision{
			Target: rr.local, Mode: LocalRead, Epoch: p.Epoch, StaleReadAllowed: true,
			Reason: "home region down, serving degraded stale read",
		}, nil
	}
	return RouteDecision{}, fmt.Errorf("no readable region for tenant %s", p.TenantID)
}

func (rr *RegionRouter) pickFailoverTarget(p TenantPlacement) (RegionID, bool) {
	var candidates []RegionHealth
	for _, id := range residencyAllowed[p.Residency] {
		if id == p.HomeRegion { continue }
		if h, ok := rr.registry.Get(id); ok && h.Healthy { candidates = append(candidates, h) }
	}
	if len(candidates) == 0 { return "", false }
	// Prefer the freshest replica: least data loss on promotion.
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].ReplicationLagMs < candidates[j].ReplicationLagMs
	})
	return candidates[0].ID, true
}

// --- Control plane: quorum-gated promotion --------------------------------

type PromotionVote struct {
	Voter            RegionID
	AgreesHomeIsDown bool
	ObservedLagMs    int64
}

type PromotionResult struct {
	Promoted            bool
	NewHome             RegionID
	NewEpoch            int64
	EstimatedDataLossMs int64
	Reason              string
}

type FailoverCoordinator struct {
	registry    *RegionRegistry
	placements  *PlacementStore
	totalVoters int
}

func NewFailoverCoordinator(reg *RegionRegistry, pl *PlacementStore, voters int) *FailoverCoordinator {
	return &FailoverCoordinator{registry: reg, placements: pl, totalVoters: voters}
}

// Promote requires a strict majority of control-plane voters to agree that the
// home region is unreachable. Without this, a network partition lets both sides
// promote themselves — split-brain.
func (fc *FailoverCoordinator) Promote(tenantID string, votes []PromotionVote) PromotionResult {
	p, ok := fc.placements.Get(tenantID)
	if !ok { return PromotionResult{Reason: "unknown tenant"} }

	quorum := fc.totalVoters/2 + 1
	var agreeing, eligible []PromotionVote
	for _, v := range votes {
		if v.AgreesHomeIsDown { agreeing = append(agreeing, v) }
	}
	if len(agreeing) < quorum {
		return PromotionResult{Reason: fmt.Sprintf("no quorum: %d/%d, need %d", len(agreeing), fc.totalVoters, quorum)}
	}

	for _, v := range agreeing {
		if v.Voter == p.HomeRegion || !fc.registry.IsHealthy(v.Voter) { continue }
		if !allowedIn(p.Residency, v.Voter) { continue }
		eligible = append(eligible, v)
	}
	if len(eligible) == 0 { return PromotionResult{Reason: "quorum reached but no eligible target region"} }
	sort.Slice(eligible, func(i, j int) bool { return eligible[i].ObservedLagMs < eligible[j].ObservedLagMs })

	target, newEpoch := eligible[0], p.Epoch+1
	if err := fc.placements.Put(TenantPlacement{
		TenantID: tenantID, HomeRegion: target.Voter, Residency: p.Residency, Epoch: newEpoch,
	}); err != nil {
		return PromotionResult{Reason: err.Error()}
	}

	log.Printf("[FAILOVER] tenant=%s %s -> %s epoch=%d rpo=%dms",
		tenantID, p.HomeRegion, target.Voter, newEpoch, target.ObservedLagMs)

	return PromotionResult{
		Promoted: true, NewHome: target.Voter, NewEpoch: newEpoch,
		EstimatedDataLossMs: target.ObservedLagMs,
		Reason:              "quorum agreed, freshest eligible replica promoted",
	}
}
```

</div>
</CodeTabs>

## Failover

Failover-এর সবচেয়ে ভুল-বোঝা অংশটা হলো — কঠিন কাজটা promotion নয়, **সিদ্ধান্ত নেওয়া**। "region টা কি সত্যিই মরেছে, নাকি আমি ওকে দেখতে পাচ্ছি না?" — এই দুটোর পার্থক্য নেটওয়ার্কের ভেতর থেকে কখনোই নিশ্চিতভাবে বলা যায় না। এটাই CAP-এর সেই মুহূর্ত যেখানে আপনাকে বেছে নিতেই হবে।

**Detection।** এক জায়গা থেকে probe করবেন না — একটা region থেকে অন্যটাকে unreachable মনে হওয়া প্রায়ই ওই একটা path-এরই সমস্যা। তিন বা তার বেশি স্বাধীন vantage point থেকে probe করুন, এবং শুধু TCP connect নয়, একটা আসল end-to-end health endpoint মারুন যা ডেটাবেসে ছোট একটা query চালায় — নইলে আপনি এমন region-কে সুস্থ ভাববেন যেখানে load balancer বেঁচে আছে কিন্তু ডেটাবেস মরা। আর সবসময় consecutive failure threshold রাখুন; একটা ব্যর্থ probe হলো noise।

**Traffic steering।** দুটো পথ আছে। DNS failover সহজ ও সব জায়গায় চলে, কিন্তু TTL মিথ্যা বলে — resolver আর OS-level cache TTL উপেক্ষা করে, ফলে বাস্তব propagation ৩০ সেকেন্ড নয়, কয়েক মিনিট। Anycast-এ একই IP সব region-এ announce করা হয় এবং BGP withdraw করলে traffic সেকেন্ডেই সরে যায় — অনেক দ্রুত, কিন্তু এতে long-lived TCP connection ভাঙে আর "কোন ইউজার কোথায় যাবে" তার নিয়ন্ত্রণ কম। বাস্তবে বেশিরভাগ বড় সিস্টেম anycast দিয়ে edge-এ ঢোকায়, তারপর edge-এর ভেতরে application-level routing দিয়ে সঠিক home region বাছে — ঠিক উপরের router-টার মতো।

**Promotion আর split-brain।** ধরুন বাগদাদ আর কর্ডোবার মধ্যে নেটওয়ার্ক কাটল, কিন্তু দুটোই বেঁচে আছে আর দুটোই ইউজার traffic পাচ্ছে। কর্ডোবা ভাবল "বাগদাদ মরেছে, আমি leader হই", আর বাগদাদ ভাবল "কর্ডোবা মরেছে, আমিই leader"। এখন একই tenant-এর ডেটা দুই জায়গায় স্বাধীনভাবে বদলাচ্ছে — split-brain। নেটওয়ার্ক ফিরলে আপনার কাছে দুটো divergent history থাকবে, আর কোনো conflict resolution সেই ক্ষতি পুরোপুরি ফেরাতে পারবে না, কারণ এর মধ্যে ইউজারকে ভুল উত্তর দেখানো হয়ে গেছে।

দুটো প্রতিরোধ একসাথে লাগাতে হয়:

- **Quorum।** promotion-এর সিদ্ধান্ত নেবে একটা majority-based control plane (Raft-backed metadata store — চ্যাপ্টার ১৩)। minority partition-এ থাকা region কখনো quorum পাবে না, তাই সে নিজেকে promote করতে পারবে না। এজন্য বিজোড় সংখ্যক region বা অন্তত তৃতীয় একটা witness/arbiter region রাখা জরুরি — দুই region-এর setup-এ majority বলে কিছু নেই।
- **Fencing।** প্রতিটা ownership পরিবর্তনে একটা monotonically increasing epoch বাড়ে, আর প্রতিটা write সেই epoch বহন করে। storage layer পুরনো epoch-এর write সরাসরি reject করে। ফলে পুরনো leader যদি বেঁচেও থাকে এবং না-জেনে লিখতে আসে, তার write মেঝেতেই আটকে যায়। quorum ছাড়া fencing অসম্পূর্ণ, আর fencing ছাড়া quorum-ও অসম্পূর্ণ — কারণ পুরনো leader quorum হারানোর কথা তখনো জানে না।

<Callout type="warning">

Automatic failover-এর সবচেয়ে বড় ঝুঁকি হলো ভুল-ইতিবাচক। একটা ক্ষণস্থায়ী নেটওয়ার্ক গ্লিচে যদি সিস্টেম নিজে থেকে region promote করে ফেলে, আপনি সুস্থ একটা region-এর কয়েক সেকেন্ডের write হারালেন — অর্থাৎ failover নিজেই outage তৈরি করল। তাই অনেক পরিণত সিস্টেম detection স্বয়ংক্রিয় রাখে কিন্তু promotion-এ একটা মানুষের অনুমোদন বা কমপক্ষে একটা "hold-down" সময় (যেমন ৬০ সেকেন্ড টানা unhealthy) বসায়। খরচটা RTO-তে যোগ হয়, কিন্তু সেটা জেনেবুঝে দেওয়া দাম।

</Callout>

## Version vector দিয়ে replication ও conflict resolution

নিচের implementation-টা cross-region replication-এর হৃদয়: প্রতিটা write একটা version vector বহন করে, receiving region তুলনা করে বলে দেয় নতুনটা পুরনোটার পরে এসেছে নাকি সত্যিই concurrent, আর concurrent হলে registered merge function ডাকে — না থাকলে conflict-টা মানুষের জন্য quarantine করে রাখে, নীরবে একটা দিক মুছে দেয় না।

<CodeTabs tsFile="replicator.ts" goFile="replicator.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// Cross-region replicator with version vectors and pluggable conflict merge.

export type RegionId = string;
export type VersionVector = Record<RegionId, number>;

export type Ordering = 'before' | 'after' | 'equal' | 'concurrent';

export interface Versioned<T> {
	key: string;
	value: T;
	vector: VersionVector;
	/** Wall-clock, used only as an LWW tiebreak — never as the ordering source. */
	writtenAtMs: number;
	originRegion: RegionId;
}

export interface ReplicationRecord<T> {
	entry: Versioned<T>;
	logPosition: number;
	emittedAtMs: number;
}

export type MergeFn<T> = (local: Versioned<T>, remote: Versioned<T>) => T;

export interface ConflictReport<T> {
	key: string;
	local: Versioned<T>;
	remote: Versioned<T>;
	resolution: 'merged' | 'lww' | 'quarantined';
	resolvedAtMs: number;
}

// --- Version vector algebra ----------------------------------------------

export function compareVectors(a: VersionVector, b: VersionVector): Ordering {
	const regions = new Set([...Object.keys(a), ...Object.keys(b)]);

	let aAhead = false;
	let bAhead = false;

	for (const r of regions) {
		const av = a[r] ?? 0;
		const bv = b[r] ?? 0;
		if (av > bv) aAhead = true;
		if (bv > av) bAhead = true;
	}

	if (aAhead && bAhead) return 'concurrent';
	if (aAhead) return 'after';
	if (bAhead) return 'before';
	return 'equal';
}

export function mergeVectors(a: VersionVector, b: VersionVector): VersionVector {
	const out: VersionVector = { ...a };
	for (const [r, v] of Object.entries(b)) {
		out[r] = Math.max(out[r] ?? 0, v);
	}
	return out;
}

export function bumpVector(v: VersionVector, region: RegionId): VersionVector {
	return { ...v, [region]: (v[region] ?? 0) + 1 };
}

// --- Region store ---------------------------------------------------------

export class RegionStore<T> {
	private data = new Map<string, Versioned<T>>();
	private log: ReplicationRecord<T>[] = [];
	private nextPosition = 1;
	private mergers = new Map<string, MergeFn<T>>();
	private quarantine: ConflictReport<T>[] = [];
	/** Highest log position we have applied from each peer region. */
	private appliedFrom = new Map<RegionId, number>();

	constructor(public readonly region: RegionId) {}

	registerMerger(keyPrefix: string, fn: MergeFn<T>): void {
		this.mergers.set(keyPrefix, fn);
	}

	/** Local write: bump our own counter, append to the replication log. */
	put(key: string, value: T): Versioned<T> {
		const existing = this.data.get(key);
		const vector = bumpVector(existing?.vector ?? {}, this.region);

		const entry: Versioned<T> = {
			key,
			value,
			vector,
			writtenAtMs: Date.now(),
			originRegion: this.region
		};

		this.data.set(key, entry);
		this.log.push({
			entry,
			logPosition: this.nextPosition++,
			emittedAtMs: entry.writtenAtMs
		});
		return entry;
	}

	get(key: string): Versioned<T> | undefined {
		return this.data.get(key);
	}

	/** Records a peer has not yet seen, for the outbound replication feed. */
	changesSince(position: number, limit = 500): ReplicationRecord<T>[] {
		return this.log.filter((r) => r.logPosition > position).slice(0, limit);
	}

	get logHead(): number {
		return this.nextPosition - 1;
	}

	/** Inbound replication: apply a record from a peer region. */
	apply(record: ReplicationRecord<T>, fromRegion: RegionId): ConflictReport<T> | null {
		const remote = record.entry;
		const local = this.data.get(remote.key);

		this.appliedFrom.set(fromRegion, record.logPosition);

		if (!local) {
			this.data.set(remote.key, remote);
			return null;
		}

		const order = compareVectors(local.vector, remote.vector);

		// Remote strictly newer, or identical: take it / no-op.
		if (order === 'before') {
			this.data.set(remote.key, remote);
			return null;
		}
		if (order === 'after' || order === 'equal') {
			return null;
		}

		// Genuinely concurrent — neither happened before the other.
		return this.resolveConflict(local, remote);
	}

	private resolveConflict(local: Versioned<T>, remote: Versioned<T>): ConflictReport<T> {
		const merged = mergeVectors(local.vector, remote.vector);
		const merger = this.findMerger(local.key);

		if (merger) {
			const value = merger(local, remote);
			this.data.set(local.key, {
				key: local.key,
				value,
				vector: merged,
				writtenAtMs: Date.now(),
				originRegion: this.region
			});
			return this.report(local, remote, 'merged');
		}

		// No merger registered. Fall back to LWW with a deterministic tiebreak
		// so that every region converges on the SAME winner.
		const remoteWins =
			remote.writtenAtMs > local.writtenAtMs ||
			(remote.writtenAtMs === local.writtenAtMs && remote.originRegion > local.originRegion);

		const winner = remoteWins ? remote : local;
		this.data.set(local.key, { ...winner, vector: merged });

		const report = this.report(local, remote, 'lww');
		// LWW discarded a real write: keep it for audit, never lose it silently.
		this.quarantine.push({ ...report, resolution: 'quarantined' });
		return report;
	}

	private findMerger(key: string): MergeFn<T> | undefined {
		for (const [prefix, fn] of this.mergers) {
			if (key.startsWith(prefix)) return fn;
		}
		return undefined;
	}

	private report(
		local: Versioned<T>,
		remote: Versioned<T>,
		resolution: ConflictReport<T>['resolution']
	): ConflictReport<T> {
		return { key: local.key, local, remote, resolution, resolvedAtMs: Date.now() };
	}

	pendingConflicts(): ConflictReport<T>[] {
		return [...this.quarantine];
	}
}

// --- Replication pump with lag / RPO measurement --------------------------

export interface LagSample {
	fromRegion: RegionId;
	toRegion: RegionId;
	pendingRecords: number;
	oldestPendingAgeMs: number;
	estimatedRpoMs: number;
}

export class Replicator<T> {
	private cursors = new Map<string, number>();

	constructor(private readonly stores: Map<RegionId, RegionStore<T>>) {}

	private cursorKey(from: RegionId, to: RegionId): string {
		return `${from}->${to}`;
	}

	/** Ship one batch from `from` to `to`. Returns conflicts observed. */
	pump(from: RegionId, to: RegionId, batchSize = 100): ConflictReport<T>[] {
		const source = this.stores.get(from);
		const target = this.stores.get(to);
		if (!source || !target) throw new Error(`unknown region pair ${from}->${to}`);

		const key = this.cursorKey(from, to);
		const cursor = this.cursors.get(key) ?? 0;
		const batch = source.changesSince(cursor, batchSize);

		const conflicts: ConflictReport<T>[] = [];
		for (const record of batch) {
			const conflict = target.apply(record, from);
			if (conflict) conflicts.push(conflict);
			this.cursors.set(key, record.logPosition);
		}
		return conflicts;
	}

	/** Replication lag is a position gap first, a time gap second. */
	measureLag(from: RegionId, to: RegionId): LagSample {
		const source = this.stores.get(from);
		if (!source) throw new Error(`unknown region ${from}`);

		const cursor = this.cursors.get(this.cursorKey(from, to)) ?? 0;
		const pending = source.changesSince(cursor, Number.MAX_SAFE_INTEGER);
		const oldest = pending.length > 0 ? pending[0].emittedAtMs : Date.now();
		const ageMs = Date.now() - oldest;

		return {
			fromRegion: from,
			toRegion: to,
			pendingRecords: pending.length,
			oldestPendingAgeMs: pending.length > 0 ? ageMs : 0,
			// If `from` were lost right now, this is what `to` would not have.
			estimatedRpoMs: pending.length > 0 ? ageMs : 0
		};
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package replication

// Cross-region replicator with version vectors and pluggable conflict merge.

import (
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
)

type RegionID string
type VersionVector map[RegionID]uint64

type Ordering int

const (
	Before Ordering = iota
	After
	Equal
	Concurrent
)

type Versioned struct {
	Key    string
	Value  any
	Vector VersionVector
	// WrittenAt is a wall clock, used only as an LWW tiebreak — never as
	// the ordering source.
	WrittenAt    time.Time
	OriginRegion RegionID
}

type ReplicationRecord struct {
	Entry       Versioned
	LogPosition uint64
	EmittedAt   time.Time
}

type MergeFn func(local, remote Versioned) any

type Resolution string

const (
	Merged      Resolution = "merged"
	LWW         Resolution = "lww"
	Quarantined Resolution = "quarantined"
)

type ConflictReport struct {
	Key        string
	Local      Versioned
	Remote     Versioned
	Resolution Resolution
	ResolvedAt time.Time
}

// --- Version vector algebra ----------------------------------------------

func CompareVectors(a, b VersionVector) Ordering {
	regions := make(map[RegionID]struct{}, len(a)+len(b))
	for r := range a { regions[r] = struct{}{} }
	for r := range b { regions[r] = struct{}{} }

	var aAhead, bAhead bool
	for r := range regions {
		if a[r] > b[r] { aAhead = true }
		if b[r] > a[r] { bAhead = true }
	}

	switch {
	case aAhead && bAhead:
		return Concurrent
	case aAhead:
		return After
	case bAhead:
		return Before
	default:
		return Equal
	}
}

func MergeVectors(a, b VersionVector) VersionVector {
	out := make(VersionVector, len(a)+len(b))
	for r, v := range a { out[r] = v }
	for r, v := range b {
		if v > out[r] { out[r] = v }
	}
	return out
}

func BumpVector(v VersionVector, region RegionID) VersionVector {
	out := make(VersionVector, len(v)+1)
	for r, n := range v { out[r] = n }
	out[region]++
	return out
}

// --- Region store ---------------------------------------------------------

type RegionStore struct {
	Region RegionID

	mu           sync.RWMutex
	data         map[string]Versioned
	log          []ReplicationRecord
	nextPosition uint64
	mergers      map[string]MergeFn
	quarantine   []ConflictReport
	appliedFrom  map[RegionID]uint64 // highest position applied from each peer
}

func NewRegionStore(region RegionID) *RegionStore {
	return &RegionStore{
		Region: region, data: make(map[string]Versioned), nextPosition: 1,
		mergers: make(map[string]MergeFn), appliedFrom: make(map[RegionID]uint64),
	}
}

func (s *RegionStore) RegisterMerger(keyPrefix string, fn MergeFn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mergers[keyPrefix] = fn
}

// Put is a local write: bump our own counter, append to the replication log.
func (s *RegionStore) Put(key string, value any) Versioned {
	s.mu.Lock()
	defer s.mu.Unlock()

	var base VersionVector
	if existing, ok := s.data[key]; ok { base = existing.Vector }

	entry := Versioned{
		Key: key, Value: value, Vector: BumpVector(base, s.Region),
		WrittenAt: time.Now().UTC(), OriginRegion: s.Region,
	}
	s.data[key] = entry
	s.log = append(s.log, ReplicationRecord{Entry: entry, LogPosition: s.nextPosition, EmittedAt: entry.WrittenAt})
	s.nextPosition++
	return entry
}

func (s *RegionStore) Get(key string) (Versioned, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	return v, ok
}

// ChangesSince returns records a peer has not yet seen.
func (s *RegionStore) ChangesSince(position uint64, limit int) []ReplicationRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []ReplicationRecord
	for _, r := range s.log {
		if r.LogPosition <= position { continue }
		out = append(out, r)
		if limit > 0 && len(out) >= limit { break }
	}
	return out
}

// Apply handles inbound replication from a peer region.
func (s *RegionStore) Apply(record ReplicationRecord, from RegionID) *ConflictReport {
	s.mu.Lock()
	defer s.mu.Unlock()

	remote := record.Entry
	s.appliedFrom[from] = record.LogPosition

	local, exists := s.data[remote.Key]
	if !exists {
		s.data[remote.Key] = remote
		return nil
	}

	switch CompareVectors(local.Vector, remote.Vector) {
	case Before:
		s.data[remote.Key] = remote // remote strictly newer: take it
		return nil
	case After, Equal:
		return nil
	}

	// Genuinely concurrent — neither happened before the other.
	return s.resolveConflict(local, remote)
}

// resolveConflict must be called with the lock held.
func (s *RegionStore) resolveConflict(local, remote Versioned) *ConflictReport {
	merged := MergeVectors(local.Vector, remote.Vector)

	if fn := s.findMerger(local.Key); fn != nil {
		s.data[local.Key] = Versioned{
			Key: local.Key, Value: fn(local, remote), Vector: merged,
			WrittenAt: time.Now().UTC(), OriginRegion: s.Region,
		}
		report := newReport(local, remote, Merged)
		return &report
	}

	// No merger registered. Fall back to LWW with a deterministic tiebreak
	// so that every region converges on the SAME winner.
	remoteWins := remote.WrittenAt.After(local.WrittenAt) ||
		(remote.WrittenAt.Equal(local.WrittenAt) && remote.OriginRegion > local.OriginRegion)

	winner := local
	if remoteWins { winner = remote }
	winner.Vector = merged
	s.data[local.Key] = winner

	report := newReport(local, remote, LWW)
	// LWW discarded a real write: keep it for audit, never lose it silently.
	q := report
	q.Resolution = Quarantined
	s.quarantine = append(s.quarantine, q)
	return &report
}

func (s *RegionStore) findMerger(key string) MergeFn {
	for prefix, fn := range s.mergers {
		if strings.HasPrefix(key, prefix) { return fn }
	}
	return nil
}

func newReport(local, remote Versioned, res Resolution) ConflictReport {
	return ConflictReport{
		Key: local.Key, Local: local, Remote: remote,
		Resolution: res, ResolvedAt: time.Now().UTC(),
	}
}

func (s *RegionStore) PendingConflicts() []ConflictReport {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ConflictReport, len(s.quarantine))
	copy(out, s.quarantine)
	return out
}

// --- Replication pump with lag / RPO measurement --------------------------

type LagSample struct {
	FromRegion         RegionID
	ToRegion           RegionID
	PendingRecords     int
	OldestPendingAgeMs int64
	EstimatedRPOMs     int64
}

type Replicator struct {
	mu      sync.Mutex
	stores  map[RegionID]*RegionStore
	cursors map[string]uint64
}

func NewReplicator(stores map[RegionID]*RegionStore) *Replicator {
	return &Replicator{stores: stores, cursors: make(map[string]uint64)}
}

func cursorKey(from, to RegionID) string { return fmt.Sprintf("%s->%s", from, to) }

// Pump ships one batch from `from` to `to` and returns observed conflicts.
func (r *Replicator) Pump(from, to RegionID, batchSize int) ([]ConflictReport, error) {
	r.mu.Lock()
	source, okS := r.stores[from]
	target, okT := r.stores[to]
	key := cursorKey(from, to)
	cursor := r.cursors[key]
	r.mu.Unlock()

	if !okS || !okT { return nil, fmt.Errorf("unknown region pair %s->%s", from, to) }

	var conflicts []ConflictReport
	for _, record := range source.ChangesSince(cursor, batchSize) {
		if c := target.Apply(record, from); c != nil { conflicts = append(conflicts, *c) }
		r.mu.Lock()
		r.cursors[key] = record.LogPosition
		r.mu.Unlock()
	}
	return conflicts, nil
}

// MeasureLag treats replication lag as a position gap first, a time gap second.
func (r *Replicator) MeasureLag(from, to RegionID) (LagSample, error) {
	r.mu.Lock()
	source, ok := r.stores[from]
	cursor := r.cursors[cursorKey(from, to)]
	r.mu.Unlock()

	if !ok { return LagSample{}, fmt.Errorf("unknown region %s", from) }

	pending := source.ChangesSince(cursor, math.MaxInt32)
	sample := LagSample{FromRegion: from, ToRegion: to, PendingRecords: len(pending)}
	if len(pending) > 0 {
		// If `from` were lost right now, this is what `to` would not have.
		age := time.Since(pending[0].EmittedAt).Milliseconds()
		sample.OldestPendingAgeMs, sample.EstimatedRPOMs = age, age
	}
	return sample, nil
}
```

</div>
</CodeTabs>

## Regional evacuation testing

একটা failover path যা কখনো চালানো হয়নি, সেটা failover path নয় — সেটা একটা অনুমান। প্রতিটা বড় multi-region outage-এর postmortem-এ একই বাক্য ফিরে আসে: "failover mechanism কাজ করেছিল, কিন্তু আমরা জানতাম না যে X সার্ভিসটা শুধু ওই region-এ চলত।"

**Dependency inventory।** যেকোনো evacuation drill-এর আগের কাজ হলো তালিকা বানানো: আপনার সার্ভিস কোন কোন জিনিসের উপর নির্ভর করে, আর তার প্রতিটা কি সত্যিই multi-region? সবচেয়ে বেশি যেগুলো ধরা পড়ে — একটা region-এ pin করা S3 bucket, একটামাত্র জায়গায় বসা secrets manager বা KMS key, একটা region-লোকাল Redis যেখানে session আছে, শুধু primary region-এ চলা cron/scheduler, এক জায়গায় বসা identity provider, আর CI/CD pipeline নিজেই। আর একটা নিষ্ঠুর সত্য: control plane-ও একটা dependency। যে region মরেছে, সেখানেই যদি আপনার deployment tooling বা metrics backend থাকে, তবে failover-এর সময় আপনি অন্ধ হয়ে যাবেন।

**Game day আর evacuation drill।** পার্থক্যটা মাত্রার। Game day হলো নিয়ন্ত্রিত পরিস্থিতিতে একটা নির্দিষ্ট failure ঢোকানো — যেমন কর্ডোবা থেকে বাগদাদে replication বন্ধ করে দেখা alert ঠিকমতো fire করে কিনা আর lag SLO কত দ্রুত পোড়ে। Evacuation drill হলো পুরো region থেকে traffic সরিয়ে নেওয়া — সাধারণত ধাপে ধাপে: ১% traffic, তারপর ১০%, ৫০%, ১০০%। কম-ঝুঁকির ঘণ্টায় শুরু করুন, প্রতিটা ধাপে error budget-এর পোড়া হার দেখুন, আর আগে থেকেই লিখে রাখা abort criteria মানুন — "p99 latency দ্বিগুণ হলে বা error rate ০.৫% ছাড়ালে থামো"।

**Drill থেকে যা আসলে শেখা যায়।** সময় মাপুন, শুধু সফলতা নয়: detection-এ কত সেকেন্ড, সিদ্ধান্তে কত, promotion-এ কত, traffic পুরোপুরি সরতে কত। এই চারটে যোগ করলেই আপনার আসল RTO — চুক্তিতে লেখা RTO নয়। আর evacuation-এর মুহূর্তে replication lag কত ছিল তা রেকর্ড করুন; সেটাই আপনার আসল RPO। বেশিরভাগ টিম আবিষ্কার করে তাদের বাস্তব RTO কাগজের RTO-র তিন-চার গুণ, আর প্রায় পুরোটাই detection আর মানুষের সিদ্ধান্তে ব্যয় হয়।

<Callout type="tip">

Evacuation-এর সবচেয়ে কম-আলোচিত অংশ হলো **ফিরে আসা**। region ফিরে এলে তাকে সাথে সাথে traffic দেওয়া যাবে না — আগে তার replica-কে catch up করতে দিন, cache গরম করতে দিন, connection pool ভরতে দিন, তারপর অল্প অল্প করে traffic ফেরান। ঠান্ডা cache আর খালি pool নিয়ে ১০০% traffic নেওয়া region আবার সাথে সাথেই বসে যায় — এটাই সেই ক্লাসিক "failback করতে গিয়ে দ্বিতীয় outage"।

</Callout>

<Callout type="info">

Drill-এর ফলাফল রাখার জায়গা হলো আপনার runbook, মাথা নয়। প্রতিটা drill শেষে runbook-এ তিনটে জিনিস আপডেট করুন: কোন ধাপটা প্রত্যাশার চেয়ে বেশি সময় নিল, কোন dependency নতুন করে ধরা পড়ল, আর কোন কমান্ড বা dashboard-এর লিংক ভুল ছিল। যে runbook drill-এর পর বদলায় না, সেটা কেউ পড়েইনি।

</Callout>

<div class="takeaways">

### মূল শেখা

- Multi-region-এ যান কেবল তিনটে নির্দিষ্ট চাপের জবাবে — latency, data residency, বা ৯৯.৯৯%-এর উপরের availability; অন্যথায় এটা availability বাড়ায় না, নতুন failure mode যোগ করে
- Home region ownership হলো সবচেয়ে শক্তিশালী সরলীকরণ: প্রতিটা row-এর একজন মালিক থাকলে conflict resolution-এর দরকারই পড়ে না
- Cross-region replication কার্যত সবসময় async, তাই lag সবসময় আছে — আর বর্তমান lag-ই আপনার আসল RPO, চুক্তিতে যা-ই লেখা থাক
- Version vector conflict ঠিক করে না, কিন্তু নির্ভুলভাবে শনাক্ত করে কোনটা সত্যিই concurrent; LWW-র সবচেয়ে বড় পাপ হলো conflict-কে চিনতেই না পারা
- Failover-এর কঠিন অংশ promotion নয়, detection আর সিদ্ধান্ত — এবং quorum ছাড়া promotion মানেই split-brain-এর দরজা খোলা রাখা
- Fencing token ছাড়া quorum অসম্পূর্ণ: পুরনো leader জানে না সে পুরনো, তাই storage layer-কেই তার পুরনো epoch-এর write reject করতে হবে
- যে failover path কখনো drill করা হয়নি সেটা একটা অনুমান; আসল RTO মাপা যায় শুধু evacuation drill-এর ঘড়ি ধরে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **AWS DynamoDB Global Tables** multi-region active-active দেয় per-item LWW conflict resolution সহ — দ্রুত ও সরল, কিন্তু concurrent write-এ একদিক নীরবে হারায়, তাই ব্যালেন্স-জাতীয় ডেটার জন্য নয়
- **Google Spanner** TrueTime-এর bounded clock uncertainty আর Paxos ব্যবহার করে cross-region strong consistency দেয় — conflict-ই থাকে না, দাম দিতে হয় commit latency-তে
- **Cloudflare** anycast দিয়ে traffic নিকটতম PoP-এ নেয় আর BGP withdraw করে সেকেন্ডের মধ্যে একটা location evacuate করে
- **Netflix** নিয়মিত পুরো AWS region evacuate করার drill চালায় (তাদের ভাষায় region failover exercise), আর সেই কারণেই আসল region degradation-এ তাদের RTO মিনিটের ঘরে থাকে
- **Stripe এবং অন্যান্য পেমেন্ট প্ল্যাটফর্ম** টাকার ডেটায় active-active এড়িয়ে single-writer home region রাখে, আর multi-region ব্যবহার করে মূলত read scaling আর disaster recovery-র জন্য
- **Slack, Shopify-র মতো SaaS** tenant-কে home region-এ pin করে (EU tenant EU-তে), ফলে GDPR residency আর failover দুটোই একই partitioning সিদ্ধান্ত থেকে আসে

</div>
