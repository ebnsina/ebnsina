---
title: 'প্রজেক্ট: রাইড-হেইলিং ডিসপ্যাচ'
subtitle: 'চলমান গাড়ির অবস্থান, geospatial index, matching-এর race condition, trip state machine, surge pricing-এর feedback loop আর region degrade হলে কী ভাঙে — advanced ব্যান্ডের capstone।'
chapter: 20
level: 'advanced'
readingTime: '৩৪ মিনিট'
topics:
  [
    'ride hailing',
    'dispatch',
    'geospatial index',
    'h3',
    'matching',
    'state machine',
    'surge pricing',
    'system design project'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

চৌদ্দ নম্বর চ্যাপ্টারে আপনি একটা সোশ্যাল ফিড ডিজাইন করেছিলেন — সেখানে মূল শত্রু ছিল write amplification, আর সমাধান ছিল কাজটা async করে দেওয়া। এরপর পাঁচটা চ্যাপ্টার ধরে আপনি advanced ব্যান্ডের অস্ত্রগুলো জোগাড় করেছেন: coordination আর fencing token (১৫), event-driven আর্কিটেকচার ও saga (১৬), search আর ranking (১৭), observability ও SLO (১৮), আর ব্যর্থতার জন্য ডিজাইন (১৯)।

এই চ্যাপ্টার সেই পাঁচটাকে একসাথে ব্যবহার করার জায়গা। আমরা একটা **রাইড-হেইলিং ডিসপ্যাচ সিস্টেম** ডিজাইন করব — যাত্রী একটা গাড়ি চায়, সিস্টেম আশেপাশের চালকদের মধ্যে থেকে একজনকে বেছে দেয়, তারপর ট্রিপটা শুরু থেকে শেষ পর্যন্ত চালায়।

ফিড সিস্টেমের সাথে এর মৌলিক পার্থক্যটা এক লাইনে বলা যায়: **ফিডের ডেটা স্থির, এখানকার ডেটা নড়ছে।** একটা পোস্ট লেখা হয়ে গেলে সেটা আর বদলায় না, তাই আপনি সেটা কপি করতে পারেন, ক্যাশ করতে পারেন, দিনের পর দিন রেখে দিতে পারেন। কিন্তু একটা চালকের অবস্থান চার সেকেন্ড পরেই ভুল। এই একটামাত্র সত্য থেকে বাকি প্রায় সব সিদ্ধান্ত বেরিয়ে আসে — কোন স্টোরে লিখব, কেন primary ডেটাবেস ছোঁব না, index কীভাবে বানাব, আর কেন এখানে সবচেয়ে বড় সংখ্যাটা ট্রিপের সংখ্যা নয়।

আর দ্বিতীয় পার্থক্য: এখানে একটা **সীমিত, ভৌত সম্পদ** ভাগ করতে হচ্ছে। একটা পোস্ট এক কোটি মানুষ একসাথে পড়তে পারে, কিন্তু একটা গাড়িতে একসাথে দুজন যাত্রী উঠতে পারে না। যেখানেই সীমিত সম্পদ, সেখানেই দখলের প্রতিযোগিতা — আর সেটাই এই চ্যাপ্টারের সবচেয়ে গুরুত্বপূর্ণ অংশ।

## গল্পে বুঝি

বাগদাদের কারখ ঘাট। দজলার পশ্চিম তীরে কাঠের একটা লম্বা জেটি, আর সেখান থেকে সারাদিন ছোট ছোট নৌকা যাত্রী নিয়ে ওপারে রুসাফায় যায়, আবার ফেরে। ঘাটের মালিক আল-বিরুনি, আর তাঁর ঘাটে প্রতিদিন প্রায় দুইশো মাঝি নৌকা ভাসায়। সমস্যাটা সহজ শোনায় — যাত্রী এলে তাকে একটা খালি নৌকা দিতে হবে। কিন্তু এই সহজ কাজটা করতে গিয়ে আল-বিরুনি যে সাতটা ভুল করেছিলেন, সেগুলোই এই চ্যাপ্টারের পুরো বিষয়।

প্রথম ভুলটা ছিল খাতা নিয়ে। শুরুতে আল-বিরুনি ঠিক করলেন, ঘাটের বড় হিসাবের খাতায় প্রতিটা নৌকার অবস্থান লেখা থাকবে — কোন নৌকা এখন কোথায়। মাঝিরা প্রতি কয়েক নিঃশ্বাস পরপর হাঁক দেয়, আর একজন কেরানি সেটা খাতায় তোলে। এক সপ্তাহের মধ্যে খাতা শেষ, কালি শেষ, কেরানির হাত অবশ, আর সবচেয়ে বড় কথা — ওই একই খাতায় ভাড়ার হিসাব, মাঝিদের পাওনা, নৌকার মালিকানার দলিল সবই লেখা থাকত, আর অবস্থানের হাঁকডাকের চাপে সেই আসল হিসাবগুলো লেখাই যাচ্ছিল না। আল-বিরুনি তখন যে সিদ্ধান্তটা নিলেন সেটাই এই সিস্টেমের ভিত্তি: **নৌকার অবস্থান খাতায় লেখা হবে না।** ঘাটঘরের দেয়ালে একটা বড় চুনের বোর্ড টাঙানো হলো, অবস্থান লেখা হবে খড়িমাটিতে, আর মুছে মুছে বারবার নতুন করে লেখা হবে। বোর্ডটা পুড়ে গেলে কিছুই হারায় না — পরের হাঁকেই সব আবার লেখা হয়ে যাবে। খাতায় শুধু যাবে ট্রিপের শুরু আর শেষ, যেটা সত্যিই স্থায়ী। এটাই **hot data-কে primary store থেকে সরিয়ে একটা in-memory index-এ রাখা**।

দ্বিতীয় ভুলটা ছিল বোর্ডের গঠন নিয়ে। শুরুতে বোর্ডে প্রতিটা নৌকার নাম আর তার ঠিক কতটা দূরত্বে সে আছে, সেটা লেখা হতো। কিন্তু যাত্রী এলে "কোন নৌকাটা সবচেয়ে কাছে" জানতে গিয়ে কেরানিকে দুইশোটা লাইনই পড়তে হতো। তখন আল-বিরুনি নদীর তীরটাকে দড়ি দিয়ে ঘর কেটে ফেললেন — ষাটটা ছোট ছোট ঘর, প্রতিটার নিজস্ব নম্বর, আর বোর্ডেও ঠিক সেই ষাটটা ঘর আঁকা। প্রতিটা নৌকার নামের কাঠের টুকরো ঠিক যে ঘরে সে আছে সেই ঘরে ঝোলানো থাকে। এখন যাত্রী এলে কেরানি শুধু যাত্রীর ঘরটা আর তার চারপাশের ঘরগুলো দেখে — ষাটটা নয়, সাতটা ঘর। এটাই **geospatial index**, আর "চারপাশের ঘরগুলো" দেখাই হলো **ring query**।

তৃতীয় ভুলটা ছিল সবচেয়ে সূক্ষ্ম, আর এটাই সবচেয়ে বেশি খরচ বাঁচিয়েছিল। শুরুতে নিয়ম ছিল, মাঝি প্রতিবার হাঁক দিলেই কেরানি তার কাঠের টুকরো নামিয়ে আবার ঝোলাবে। কিন্তু একটা নৌকা এক ঘরে দশ-বারো বার হাঁক দেওয়ার পরও একই ঘরেই থাকে — নৌকা তো ধীরে চলে। অর্থাৎ কেরানি বারো বার কাঠ নামিয়ে বারো বারই একই জায়গায় ঝোলাচ্ছে। নিয়ম বদলে গেল: **কাঠের টুকরো তখনই নড়বে যখন নৌকা সত্যিই ঘর বদলাবে**, বাকি সময় শুধু বোর্ডের পাশে ওই নৌকার নামের ঘরে সময়ের দাগটা বদলে দেওয়া হবে। এক নিয়মেই কেরানির কাজ বিশ ভাগের এক ভাগে নেমে এলো। এটাই **cell-crossing দেখে index mutation কমানো** — এই চ্যাপ্টারের সবচেয়ে দামি এক লাইনের অপটিমাইজেশন।

চতুর্থ ভুলটাই আসল বিপর্যয়। ঘাটে ভিড় বাড়ায় আল-বিরুনি দুই প্রান্তে দুজন কেরানি বসালেন — উত্তরের প্রান্তে আল-কিন্দি, দক্ষিণে আল-ফারাবি। একদিন প্রায় একই মুহূর্তে দুজন যাত্রী এলো, একজন উত্তরে ফাতিমা আল-ফিহরি, একজন দক্ষিণে ইবনে আল-হাইসাম। দুই কেরানিই বোর্ডের সাত নম্বর ঘরের দিকে তাকাল, দুজনেই দেখল ইবনে রুশদের নৌকাটা খালি, আর দুজনেই একজন করে দৌড়ানো ছেলে পাঠিয়ে দিল "ইবনে রুশদকে ডেকে আনো" বলে। ইবনে রুশদ দুটো ডাকই পেলেন। তিনি একটাই নিতে পারেন। ফলে একজন যাত্রী মিনিট দুয়েক দাঁড়িয়ে থেকে জানল যে তার নৌকা আসছে না — আর এই দুই মিনিটে বাকি নৌকাগুলোও চলে গেছে। এটাই সেই **race condition**: দুজন একই সময়ে পড়ল, দুজনেই "খালি" দেখল, দুজনেই দাবি করল।

আল-বিরুনির সমাধানটা চমৎকার ছিল, কারণ তিনি ব্যাপারটা আলোচনার বিষয়ই রাখলেন না। বোর্ডে প্রতিটা নৌকার ঘরে একটা করে পিতলের **পেরেক** গেঁথে দেওয়া হলো, আর নিয়ম হলো — ছেলে পাঠানোর আগে কেরানিকে ওই পেরেকটা হাত দিয়ে তুলে নিজের হাতে নিতে হবে। পেরেক একটাই। দুজন কেরানি একসাথে হাত বাড়ালে একজনই পাবে, অন্যজন খালি ফুটো দেখবে আর সাথে সাথে বুঝে যাবে "এটা আমার নয়, পরেরটা দেখি"। কোনো আলোচনা নেই, কোনো দেরি নেই, শুধু একটা ভৌত জিনিস যা একজনের বেশি নিতে পারে না। এটাই **atomic claim** — পড়ার পরে লেখা নয়, বরং **দাবি আগে, প্রস্তাব পরে**।

কিন্তু পেরেক দিয়েও একটা ফুটো রয়ে গিয়েছিল। কেরানি পেরেক তুলে ছেলে পাঠাল, ছেলে পথে হারিয়ে গেল, পেরেক কেরানির পকেটে রয়ে গেল — নৌকাটা সারাদিন কারও কাজে এলো না। তাই নিয়ম হলো, পেরেক নেওয়ার সময় বালিঘড়ি উল্টে দিতে হবে, আর ঘড়ির বালি ফুরিয়ে গেলে ঘাটের সর্দার নিজেই পেরেকটা ফুটোয় ফিরিয়ে দেবে — কেরানি চাইলেও আটকাতে পারবে না। এটাই **lease**, দখলের একটা মেয়াদ। আর সাথে আরও একটা নিয়ম: প্রতিটা পেরেকের গায়ে একটা করে সংখ্যা খোদাই করা, আর নৌকা প্রতিবার দখল হলে সংখ্যাটা এক বাড়ে। কোনো ছেলে যদি অনেক দেরিতে পৌঁছে বলে "সাত নম্বর পেরেক নিয়ে এসেছি", আর ততক্ষণে বোর্ডে নয় নম্বর উঠে গেছে, তাহলে তাকে ফিরিয়ে দেওয়া হয়। এটাই **fencing token** — পনেরো নম্বর চ্যাপ্টারের সেই ধারণাটাই, শুধু কাঠ আর পিতলে।

পঞ্চম ব্যবস্থাটা ছিল ট্রিপের হিসাব রাখা নিয়ে। প্রতিটা যাত্রার জন্য একটা করে বাঁশের কাঠি, আর তাতে ধাপে ধাপে খাঁজ কাটা হয়: যাত্রী চেয়েছে, নৌকা ঠিক হয়েছে, নৌকা ঘাটে এসেছে, যাত্রী উঠেছে, ওপারে নেমেছে, ভাড়া মিটেছে। নিয়ম কড়া — **আগের খাঁজ না কেটে পরেরটা কাটা যাবে না**, আর কাটা খাঁজ কখনো মোছা যাবে না। কেউ যদি বলে "নৌকা তো আসেইনি, তবু নামার খাঁজ কাটা কেন", কাঠিটা দেখলেই ধরা পড়ে। এটাই **state machine**, আর কাঠির খাঁজগুলোর ক্রমটাই **event log**।

ষষ্ঠ ভুলটা ছিল ভাড়া নিয়ে, আর এটা সবচেয়ে মজার। বর্ষার এক সকালে ঘাটে দুইশো যাত্রী, নৌকা মাত্র বিশটা। আল-বিরুনি ঘাটের বড় কাঠের ফলকে ভাড়া লিখে দিলেন তিনগুণ — যুক্তিটা সোজা, যাদের সত্যিই দরকার তারাই যাবে, আর তিনগুণ ভাড়ার খবর শুনে আশপাশের ঘাট থেকে মাঝিরাও চলে আসবে। দুটোই হলো। কিন্তু হলো একটু বেশিই। ঘণ্টাখানেকের মধ্যে অন্য ঘাটের সব মাঝি কারখ ঘাটে হাজির, ওদিকে চড়া ভাড়ায় অর্ধেক যাত্রী হেঁটে সেতু দিয়ে চলে গেছে — এখন একশো নৌকা আর পঞ্চাশ যাত্রী। আল-বিরুনি সাথে সাথে ফলকে ভাড়া অর্ধেক লিখলেন। শুনে মাঝিরা দল বেঁধে নিজেদের ঘাটে ফিরে গেল, আর সস্তা শুনে যাত্রীরা আবার ভিড় করল — আধা ঘণ্টার মধ্যে আবার দুইশো যাত্রী, বিশটা নৌকা। সারা সকাল ধরে ঘাটটা এই দোলনায় দুলল, আর কেউই খুশি হলো না। সমস্যা দাম বাড়ানো ছিল না; সমস্যা ছিল **তিনি প্রতিক্রিয়ার দেরিটা হিসাবে ধরেননি** — ফলক বদলানোর ফল ঘাটে পৌঁছাতে আধা ঘণ্টা লাগে, আর ততক্ষণে তিনি আরেকবার ফলক বদলে ফেলেছেন। শেষে নিয়ম হলো: ফলক প্রতি এক প্রহরে একবারের বেশি বদলাবে না, একবারে এক ধাপের বেশি নড়বে না, আর যাত্রীকে যে ভাড়া বলা হয়েছে সেটা তার জন্য বলবৎ থাকবে যতক্ষণ না সে নৌকায় ওঠে। এটাই **surge pricing একটা feedback loop, আর damping ছাড়া feedback loop দোলে**।

সপ্তম শিক্ষাটা এলো সেই দিন, যেদিন কারখ ঘাটের বোর্ডঘরের ছাদ ভেঙে পড়ল। বোর্ড নষ্ট, কেরানি নেই, পেরেকগুলো ছড়িয়ে ছিটিয়ে। আল-বিরুনি সবচেয়ে জরুরি প্রশ্নটা করলেন: **এখন কী থামবে, আর কী থামবে না?** উত্তরটা তিনি আগেই ঠিক করে রেখেছিলেন। যেসব নৌকা ইতিমধ্যে যাত্রী নিয়ে নদীর মাঝখানে, তারা কিছুই টের পাবে না — তারা ওপারে যাবে, যাত্রী নামাবে, আর কাঠিতে খাঁজ কেটে রাখবে; বোর্ড ঠিক হলে খাঁজগুলো খাতায় তোলা হবে। যারা ঘাটে নতুন যাত্রী নিতে চাইছে, তাদের সাথে সাথেই বলে দেওয়া হবে "আজ এখানে নয়, রুসাফা ঘাটে যান" — মিথ্যা আশায় দাঁড় করিয়ে রাখা হবে না। আর সবচেয়ে গুরুত্বপূর্ণ: রুসাফা ঘাটের বোর্ড, কেরানি, পেরেক সব আলাদা, তাই কারখের ছাদ ভাঙায় রুসাফার একটা যাত্রাও থামল না। এটাই **regional partitioning আর degradation ladder** — উনিশ নম্বর চ্যাপ্টারের blast radius ভাবনাটার সরাসরি প্রয়োগ।

মিলিয়ে নিই: খড়িমাটির বোর্ড হলো **in-memory location index**, আর বড় খাতা হলো **primary store** যেটা location write কখনো ছোঁবে না; দড়ি দিয়ে কাটা ঘরগুলো হলো **geospatial cell** (H3/S2/geohash), চারপাশের ঘর দেখা হলো **k-ring query**; ঘর না বদলালে কাঠ না নড়ানো হলো **cell-crossing based index update**; পিতলের একটামাত্র পেরেক হলো **atomic claim** যা dispatch race মেটায়; বালিঘড়ি হলো **lease TTL**, আর পেরেকের খোদাই করা সংখ্যা হলো **fencing token**; বাঁশের কাঠির খাঁজ হলো **trip state machine ও event log**; ভাড়ার ফলক আর তার দোলা হলো **surge pricing feedback loop ও damping**; যাত্রীকে বলা ভাড়া বলবৎ থাকা হলো **quote lock**; আর প্রতি ঘাটের আলাদা বোর্ড হলো **regional partitioning**, ছাদ ভাঙার দিনের নিয়মগুলো হলো **graceful degradation**।

## এই সিস্টেমটা আগের প্রজেক্টগুলোর চেয়ে আলাদা কেন

তিনটে কারণে, আর তিনটেই ডিজাইনে সরাসরি ছাপ ফেলে।

**এক: প্রধান write-টা ব্যবহারকারীর কাজ নয়।** ফিড সিস্টেমে ইউজার পোস্ট করলে তবেই write হয়। এখানে চালক কিছু না করলেও, শুধু অ্যাপ খোলা রাখলেই, প্রতি চার সেকেন্ডে একটা করে write আসে। অর্থাৎ **write volume ব্যবসার আয়তনের সাথে নয়, অনলাইন থাকা সময়ের সাথে বাড়ে**। এই একটা কথা এস্টিমেশনের পুরো চেহারা বদলে দেয়।

**দুই: ডেটার মূল্য কয়েক সেকেন্ডে শূন্য হয়ে যায়।** পাঁচ সেকেন্ড পুরনো অবস্থান দিয়ে dispatch করলে ভুল চালক বাছা হয়। কিন্তু এর উল্টো দিকটাও সত্য, আর সেটাই সুবিধা: পাঁচ সেকেন্ড পুরনো ডেটা হারিয়ে গেলে কিছুই ক্ষতি হয় না, কারণ পরের ping-ই সেটা ঠিক করে দেয়। **যে ডেটা নিজে নিজেই সেরে ওঠে, তার জন্য durability কেনা টাকার অপচয়।**

**তিন: এখানে দখলের প্রতিযোগিতা আছে।** ফিডে দুজন ইউজার একই পোস্ট পড়লে কেউ কিছু হারায় না। এখানে দুজন যাত্রী একই চালক পেলে একজন নিশ্চিতভাবে ঠকে। যেকোনো সিস্টেমে যেখানে সীমিত সম্পদ বণ্টন হয়, সেখানে **mutual exclusion** একটা functional requirement, performance optimization নয়।

<Callout type="info">

এই তিনটে বৈশিষ্ট্য শুধু রাইড-হেইলিং-এর নয়। খাবার ডেলিভারির রাইডার বণ্টন, গুদামের রোবট বণ্টন, কল সেন্টারের এজেন্ট রাউটিং, হাসপাতালের অ্যাম্বুলেন্স ডিসপ্যাচ, এমনকি ক্লাউডের VM scheduler — সবগুলোই এই একই আকৃতির সমস্যা। গাড়ির জায়গায় অন্য জিনিস বসিয়ে দিলে এই চ্যাপ্টারের প্রায় পুরোটাই কাজে লাগে।

</Callout>

## ধাপ ১: রিকোয়ারমেন্ট, আর দুই পক্ষের অসম প্রত্যাশা

দ্বিতীয় চ্যাপ্টারের নিয়ম — আগে স্কোপ কাটুন।

**Functional (যা অবশ্যই লাগবে):**

- যাত্রী pickup আর drop-off দিয়ে একটা রাইড চাইতে পারবে, আর আগেই ভাড়ার একটা quote দেখবে
- সিস্টেম আশেপাশের উপযুক্ত চালকদের মধ্যে থেকে একজনকে বেছে তাকে অফার পাঠাবে
- চালক অফার নিতে বা ছেড়ে দিতে পারবে, একটা নির্দিষ্ট সময়ের মধ্যে
- ট্রিপ চলাকালীন দুই পক্ষই একে অন্যের অবস্থান আর ETA দেখবে
- ট্রিপ শেষে ভাড়া হিসাব হয়ে পেমেন্টে চলে যাবে
- চাহিদা-জোগানের ভারসাম্য অনুযায়ী দাম বাড়বে-কমবে

**যা এই ডিজাইনে ধরছি না:** ভাগাভাগি রাইড (pooling), শিডিউল করা রাইড, একাধিক স্টপ, খাবার ডেলিভারি, চালকের কাগজপত্র যাচাই, রেটিং সিস্টেমের বিস্তারিত। এর প্রতিটাই আলাদা সাবসিস্টেম।

এবার আসল অংশ। এই সিস্টেমের দুটো ব্যবহারকারী শ্রেণি আছে, আর তাদের চাহিদা শুধু আলাদা নয় — **পরস্পরবিরোধী**। এই অসমতাটা না ধরলে ডিজাইনটা ভুল জায়গায় অপটিমাইজ হবে।

| প্রশ্ন                        | যাত্রী                                              | চালক                                                |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| প্রধান চাওয়া                 | দ্রুত একটা গাড়ি, সস্তায়                           | পরের ভাড়াটা দ্রুত, দূরে নয়                        |
| Latency-র সবচেয়ে কড়া জায়গা | "গাড়ি খুঁজছি" স্ক্রিন — p95 &lt; ১০ সেকেন্ড        | অফার পৌঁছানো — p99 &lt; ১ সেকেন্ড                   |
| Freshness সহ্যক্ষমতা          | মানচিত্রে গাড়ির মার্কার ৩–৫ সেকেন্ড পুরনো হলেও চলে | অফার ১ সেকেন্ড পুরনো হলে সিদ্ধান্তের সময় কেটে যায় |
| Availability                  | কোনো গাড়ি না পাওয়া অসুবিধা                        | অফার না পাওয়া মানে আয় বন্ধ                        |
| ভুলের খরচ                     | ভুল গাড়ি এলে বাতিল করা যায়                        | ভুল অফার নিলে খালি গাড়ি চালিয়ে যেতে হয়           |
| সেশনের দৈর্ঘ্য                | দিনে কয়েক মিনিট                                    | দিনে ৬–১০ ঘণ্টা, টানা connection                    |
| দাম নিয়ে অবস্থান             | দাম কম চায়                                         | দাম বেশি চায়                                       |

দুটো সারি আলাদা করে লক্ষ করুন।

**অফার পৌঁছানোর latency যাত্রীর latency-র চেয়ে কড়া।** এটা উল্টো শোনায়, কারণ যাত্রীই তো টাকা দেয়। কিন্তু হিসাবটা এরকম: চালকের কাছে অফারের সময়সীমা ১২ সেকেন্ড। অফারটা পৌঁছাতে যদি ২ সেকেন্ড লাগে, চালকের হাতে থাকল ১০ সেকেন্ড, আর সে গাড়ি চালাতে চালাতে ফোন দেখছে — তার decline-এর হার বেড়ে যাবে। প্রতিটা decline মানে dispatch-কে আবার শুরু করতে হবে, মানে যাত্রীর অপেক্ষা ১২ সেকেন্ড করে বাড়বে। **অর্থাৎ চালকের latency যাত্রীর latency-কে গুণিতক হারে নষ্ট করে**, আর এজন্যই push channel-টা এই সিস্টেমের সবচেয়ে যত্ন নেওয়ার মতো অংশ।

**চালকের connection দৈর্ঘ্য অবকাঠামোর আকৃতি ঠিক করে।** যাত্রীর সেশন কয়েক মিনিটের, তাই সেখানে সাধারণ request-response চললেও চলে। কিন্তু চালকের অ্যাপ আট ঘণ্টা ধরে একটা persistent connection ধরে রাখে, ping পাঠায়, অফারের অপেক্ষায় থাকে। ফলে gateway-গুলোকে stateless নয়, **connection-aware** হতে হবে — কে কোন gateway-তে বসে আছে সেটা জানার একটা registry লাগবে।

**Non-functional লক্ষ্য:**

| গুণ                          | লক্ষ্য                                     | কেন                                          |
| ---------------------------- | ------------------------------------------ | -------------------------------------------- |
| Location ingest              | p99 &lt; ৫০ ms, at-most-once গ্রহণযোগ্য    | হারালে পরের ping ঠিক করে দেয়                |
| Nearby query                 | p99 &lt; ৩০ ms                             | dispatch-এর বাজেটের ভেতরের একটা ধাপ মাত্র    |
| Request থেকে match           | p50 &lt; ৫ সেকেন্ড, p95 &lt; ২০ সেকেন্ড    | এর বেশি হলে যাত্রী অ্যাপ বন্ধ করে            |
| অফার পৌঁছানো                 | p99 &lt; ১ সেকেন্ড                         | চালকের ১২ সেকেন্ডের বাজেট থেকে কাটা যায়     |
| এক চালক এক ট্রিপ             | ব্যতিক্রমহীন                               | double-booking মানে দুই পক্ষেরই বিশ্বাস নষ্ট |
| চলমান ট্রিপের durability     | কখনো হারাবে না                             | টাকা আর নিরাপত্তা দুটোই এতে জড়িত            |
| Location ইতিহাসের durability | নমুনা যথেষ্ট                               | ভাড়ার হিসাব আর বিরোধ নিষ্পত্তির জন্য        |
| Consistency                  | চালকের status **strong**, বাকি সব eventual | সীমিত সম্পদ, তাই এখানে আপস নেই               |

<Callout type="tip">

উপরের টেবিলের শেষ সারিটাই এই ডিজাইনের সবচেয়ে গুরুত্বপূর্ণ বাক্য। তেরো নম্বর চ্যাপ্টারের ভাষায় — আমরা প্রায় পুরো সিস্টেমেই **eventual consistency** নিচ্ছি (মানচিত্রের গাড়ি, ETA, surge, এমনকি চালকের অবস্থানও), কিন্তু ঠিক একটা জিনিসের উপর **linearizable** গ্যারান্টি চাইছি: একটা চালকের `status` ফিল্ড। consistency পুরো সিস্টেমের সেটিং নয়, এটা প্রতিটা ডেটার নিজস্ব সিদ্ধান্ত — আর এখানে সেটা একটামাত্র ফিল্ডে সীমাবদ্ধ রাখতে পারাটাই ডিজাইনের সাফল্য।

</Callout>

## ধাপ ২: এস্টিমেশন — location write-ই সব ঠিক করে দেয়

তৃতীয় চ্যাপ্টারের নিয়ম: আর্কিটেকচার নিয়ে তর্কের আগে সংখ্যা। ধরে নিই আমরা একটা বড় মাল্টি-সিটি প্ল্যাটফর্ম চালাচ্ছি:

```
মোট নিবন্ধিত যাত্রী            = 100,000,000
দৈনিক ট্রিপ                      = 5,000,000
মোট নিবন্ধিত চালক               = 500,000
পিক আওয়ারে একসাথে অনলাইন চালক    = 200,000
গড় ট্রিপের দৈর্ঘ্য               = 15 মিনিট
চালকের অ্যাপের location ping      = প্রতি 4 সেকেন্ডে
```

**যাত্রীর দিকের throughput:**

```
trip requests/day     = 5,000,000
requests/sec (avg)    = 5M / 86,400        ≈ 58/sec
peak (3x)                                  ≈ 175/sec
```

সেকেন্ডে ১৭৫টা রাইড রিকোয়েস্ট। এটা একদম তুচ্ছ সংখ্যা — একটা মাঝারি সার্ভিস এটা সামলাবে। অর্থাৎ **রাইড চাওয়া এই সিস্টেমের সমস্যা নয়**।

**চালকের দিকের throughput:**

```
location writes/sec (peak) = 200,000 চালক / 4 সেকেন্ড   = 50,000/sec
গড় অনলাইন চালক             ≈ 120,000                   → 30,000/sec
location writes/day        = 500,000 চালক x 6 ঘণ্টা x 900 ping/ঘণ্টা
                           = 2,700,000,000/day          ≈ 31,000/sec গড়ে
```

দুটো সংখ্যা পাশাপাশি রাখুন:

```
peak trip requests    ≈       175 /sec
peak location writes  ≈    50,000 /sec
অনুপাত                ≈       285 : 1
```

**এই একটামাত্র অনুপাত পুরো আর্কিটেকচারটা ঠিক করে দেয়।** ব্যবসার আসল ঘটনা — একটা রাইড — সেকেন্ডে ১৭৫টা, কিন্তু সেটা ঘটানোর জন্য সিস্টেমকে সেকেন্ডে ৫০,০০০ write হজম করতে হচ্ছে। ফিড সিস্টেমে amplification ছিল ২০০ গুণ আর সেটা ছিল আমাদের নিজেদের ডিজাইনের ফল (fan-out), তাই আমরা সেটা কমাতে পেরেছিলাম। এখানকার ২৮৫ গুণ **ভৌত বাস্তবতা** — গাড়ি নড়ছে, আর আমাদের জানতে হবে কোথায়। এটা কমানোর একমাত্র উপায় ping-এর হার কমানো, আর সেটা সরাসরি matching-এর মান নষ্ট করে।

**Storage যদি এটা primary store-এ লিখতাম:**

```
এক পয়েন্ট: driver_id 8B + lat 8B + lng 8B + ts 8B + heading/speed 8B ≈ 40 B
কাঁচা ডেটা          = 2.7B x 40 B                = 108 GB/day
Postgres row + index overhead ≈ 3x               ≈ 320 GB/day
এক বছরে                                          ≈ 117 TB
```

আর শুধু আয়তন নয় — ৫০,০০০ row/sec মানে ৫০,০০০ WAL append, ৫০,০০০ B-tree index update, আর প্রতিটার সাথে replication traffic। একটা OLTP ডেটাবেসকে এই কাজে লাগানো মানে সেটাকে হত্যা করা, আর মরার সময় সে **ট্রিপ, পেমেন্ট আর ইউজার অ্যাকাউন্টের** write-গুলোকেও সাথে নিয়ে মরবে। এটাই ধাপ ৫-এর পুরো যুক্তি।

**Nearby query-র read চাপ:**

```
dispatch-এর nearby query   = 175/sec (peak)
যাত্রীর "আশেপাশে গাড়ি" মানচিত্র = 20M app open/day → 230/sec, peak 700/sec
মোট nearby query           ≈ 900/sec
প্রতি query-তে cell পড়া     = k-ring(3) = 3k² + 3k + 1 = 37 cell
মোট cell read              ≈ 33,000/sec
```

লক্ষ করুন: read ৩৩,০০০/sec, write ৫০,০০০/sec। **এই সিস্টেমটা write-dominated, আর geospatial সিস্টেমে সেটা অস্বাভাবিক।** বেশিরভাগ ম্যাপ সিস্টেম (দোকান খোঁজা, ঠিকানা খোঁজা) read-heavy, তাই সেগুলোর জন্য বানানো index (যেমন PostGIS-এর GiST index) এখানে ভুল হাতিয়ার — সেগুলো read-এর জন্য অপটিমাইজড, ঘন ঘন update-এর জন্য নয়।

**একসাথে চলমান ট্রিপ:**

```
concurrent trips = 5M/day x 15 মিনিট / (24 x 60)   ≈ 52,000
peak (3x)                                          ≈ 150,000
```

**Connection:**

```
চালকের persistent connection (peak)  = 200,000
যাত্রীর সক্রিয় সেশন (peak)             ≈ 300,000
মোট                                  ≈ 500,000
প্রতি gateway node 50,000 connection  → 10–12 node (+ headroom)
```

**Bandwidth:**

```
এক ping-এ wire-এ (framing + TLS সহ) ≈ 200 B
50,000/sec x 200 B                  = 10 MB/sec ≈ 80 Mbps ingest
```

Bandwidth নিয়ে দুশ্চিন্তা নেই। দুশ্চিন্তা connection সংখ্যা আর write rate নিয়ে।

<Callout type="warning">

একটা এস্টিমেশনের ফাঁদ যেটা ইন্টারভিউতে প্রায়ই দেখা যায়: মানুষ দৈনিক ট্রিপ সংখ্যা দিয়ে হিসাব শুরু করে, ৫৮ requests/sec পেয়ে বলে "সহজ", আর তারপর সারাক্ষণ matching অ্যালগরিদম নিয়ে কথা বলে। কিন্তু এই সিস্টেমে **ব্যবসার event আর সিস্টেমের load-এর মধ্যে কোনো সম্পর্ক নেই** — একজন চালক সারাদিন একটাও ট্রিপ না নিয়েও ৫,৪০০টা write তৈরি করে। সবসময় জিজ্ঞেস করুন: "ব্যবহারকারী কিছু না করলেও কি এই সিস্টেম লিখছে?" উত্তর হ্যাঁ হলে সেটাই আপনার প্রধান সংখ্যা।

</Callout>

## ধাপ ৩: হাই-লেভেল আর্কিটেকচার

<Mermaid
title="Ride-hailing dispatch architecture"
code={`graph TD
  DA["Driver app<br/>persistent connection"] --> GW["Realtime gateway<br/>connection registry"]
  RA["Rider app"] --> LB["API gateway"]
  GW --> LI["Location ingest<br/>sharded by driver id"]
  LI --> GEO["Geo index<br/>in-memory, per region"]
  LI --> TR["Trip trail buffer"]
  TR --> TS["Trail store<br/>columnar, batched"]
  LB --> TRIP["Trip service<br/>state machine"]
  TRIP --> DB["Trip store<br/>primary, per region"]
  TRIP --> DISP["Dispatch service<br/>per region"]
  DISP --> GEO
  DISP --> ETA["ETA service<br/>road network"]
  DISP --> GW
  LB --> PRICE["Pricing service"]
  PRICE --> SURGE["Surge engine<br/>cell x time buckets"]
  SURGE --> GEO
  TRIP --> BUS["Event bus"]
  BUS --> PAY["Payments"]
  BUS --> ANL["Analytics"]`}
/>

সার্ভিসগুলোর ভাগটা ইচ্ছাকৃত, আর ভাগ করার মাপকাঠি একটাই — **কার scaling profile আর failure profile আলাদা**:

- **Realtime gateway** — বিপুল সংখ্যক persistent connection ধরে রাখে, কিন্তু কোনো ব্যবসায়িক লজিক জানে না। এর একমাত্র কাজ: বার্তা এদিক-ওদিক করা, আর কে কোথায় বসে আছে সেটা মনে রাখা।
- **Location ingest** — সবচেয়ে বেশি throughput, সবচেয়ে কম মূল্যবান ডেটা। এটা ব্যর্থ হলে matching-এর মান কমে, কিন্তু কোনো ট্রিপ ভাঙে না।
- **Geo index** — in-memory, region-প্রতি আলাদা, ইচ্ছাকৃতভাবে অস্থায়ী। এটা হারালে কয়েক সেকেন্ডেই নিজে থেকে ভরে যায়।
- **Dispatch** — কম throughput, কিন্তু **সবচেয়ে কড়া correctness দাবি**। এটাই একমাত্র জায়গা যেখানে আমরা coordination কিনছি।
- **Trip service** — মাঝারি throughput, সর্বোচ্চ durability। এটাই সত্যের উৎস।
- **Pricing/Surge** — সম্পূর্ণ async, কয়েক সেকেন্ড পুরনো হলেও চলে, কিন্তু ভুল হলে সরাসরি টাকার ক্ষতি।

<Callout type="info">

লক্ষ করুন geo index আর trip store একে অন্যকে ছোঁয় না। এটা কাকতালীয় নয় — এটাই ধাপ ৫-এর সিদ্ধান্ত, আর পুরো ডিজাইনটা এই সীমানার উপর দাঁড়িয়ে। geo index হলো "এখন কোথায়", trip store হলো "কী ঘটেছে"। প্রথমটা মুছে গেলে কিছু হয় না, দ্বিতীয়টা মুছে গেলে কোম্পানি বন্ধ।

</Callout>

## ধাপ ৪: Geospatial index — "কাছের চালক" প্রশ্নটার উত্তর

মূল প্রশ্নটা হলো: একটা pickup বিন্দু দেওয়া আছে, দুই কিলোমিটারের মধ্যে খালি চালকদের বের করো। দুই লাখ চালকের প্রত্যেকের দূরত্ব হিসাব করে দেখা যায় না — সেটা প্রতি query-তে দুই লাখ গণনা, আর সেকেন্ডে ৯০০ query মানে সেকেন্ডে ১৮ কোটি গণনা। তাই স্থানটাকে আগে থেকেই ভাগ করে রাখতে হবে, যাতে query-র সময় শুধু কাছের ভাগগুলো দেখলেই চলে।

মূল ধারণাটা সব পদ্ধতিতেই এক: **দ্বিমাত্রিক স্থানকে একমাত্রিক key-তে নামিয়ে আনা**, যাতে সাধারণ যেকোনো index (hash map, sorted set, B-tree) কাজে লাগানো যায়। পার্থক্য শুধু কীভাবে নামানো হচ্ছে তাতে।

### Geohash

পৃথিবীকে বারবার অর্ধেক করে ভাগ করা হয় — একবার দ্রাঘিমা বরাবর, একবার অক্ষাংশ বরাবর — আর প্রতিটা ভাগের সিদ্ধান্ত একটা করে বিট। বিটগুলো base32-এ লিখলে একটা স্ট্রিং পাওয়া যায়, যেমন `sv8wr`। এর সবচেয়ে সুন্দর সম্পত্তি: **prefix মানেই containment** — `sv8wr` সবসময় `sv8w`-এর ভেতরে। ফলে যেকোনো prefix-index (Redis-এর sorted set, যেকোনো B-tree) সরাসরি কাজ করে, কোনো লাইব্রেরি ছাড়াই।

সমস্যা তিনটা। এক, ঘরগুলো আয়তাকার আর অক্ষাংশের সাথে তাদের আকার বদলায় — বাগদাদের একটা geohash ঘর আর সমরকন্দের ঘর একই মাপের নয়। দুই, **প্রতিবেশী বের করা আলাদা কাজ** — prefix থেকে আট প্রতিবেশী পাওয়া যায় না, আলাদা করে হিসাব করতে হয়, আর সীমান্তে ঠিক পাশাপাশি দুটো বিন্দুর prefix সম্পূর্ণ ভিন্ন হতে পারে। তিন, precision-এর ধাপগুলো মোটা: এক অক্ষর বাড়ালে এলাকা ৩২ ভাগের এক ভাগ হয়ে যায়, তাই "আমার ১.৫ কিমি ঘর দরকার" বলার সুযোগ নেই।

### Quadtree

স্থানকে চার ভাগ করা হয়, আর **কেবল সেই ভাগটাই আবার চার ভাগ হয় যেখানে বিন্দুর সংখ্যা একটা সীমা পেরিয়েছে**। ফলে গঠনটা ঘনত্বের সাথে খাপ খায় — বাগদাদের কেন্দ্রে গাছটা গভীর, শহরের বাইরের মরুভূমিতে অগভীর।

এটা কাগজে-কলমে সবচেয়ে আকর্ষণীয় আর বাস্তবে সবচেয়ে ঝামেলার। কারণ গাছটা **পরিবর্তনশীল** — চালক এলে-গেলে নোড ভাঙতে-জোড়া লাগাতে হয়, আর সেটা করতে গেলে লক লাগে। একাধিক মেশিনে ছড়ানো একটা mutable গাছ মানে প্রতিটা update-এ coordination, যেটা ঠিক সেই জিনিস যা পনেরো নম্বর চ্যাপ্টার আমাদের এড়াতে বলেছে। এক মেশিনের ভেতরে, বা যেখানে ডেটা ধীরে বদলায় (দোকান, বাসস্ট্যান্ড), সেখানে quadtree চমৎকার। সেকেন্ডে ৫০,০০০ update-এর জন্য নয়।

### S2

গোলককে একটা ঘনকের উপর প্রক্ষেপ করে, প্রতিটা তলকে বারবার চার ভাগ করে, আর ঘরগুলোকে **Hilbert curve** ধরে সাজিয়ে একটা ৬৪-বিট সংখ্যা দেওয়া হয়। Hilbert curve-এর গুণ হলো এটা locality রক্ষা করে geohash-এর Z-order-এর চেয়ে অনেক ভালোভাবে — কাছাকাছি দুটো ঘরের সংখ্যা সাধারণত কাছাকাছি হয়। ঘরের আয়তন পৃথিবীজুড়ে প্রায় সমান, ৩১টা level আছে (তাই আকার বাছার স্বাধীনতা অনেক বেশি), আর একটা বৃত্ত ঢাকতে S2 আপনাকে অল্প কয়েকটা ঘরের একটা compact সেট দেয়।

দাম: গণিতটা জটিল, ডিবাগ করা কঠিন, আর ঘরগুলো এখনও চতুর্ভুজ — মানে কোনাকুনি প্রতিবেশী পাশাপাশি প্রতিবেশীর চেয়ে দূরে।

### H3

পৃথিবীকে **ষড়ভুজ** দিয়ে ঢাকা হয়। এর মূল সুবিধা একটাই কিন্তু বড়: **ষড়ভুজের ছয়টা প্রতিবেশীই সমদূরবর্তী**। চতুর্ভুজে আটটা প্রতিবেশীর চারটা পাশে (দূরত্ব ১) আর চারটা কোনায় (দূরত্ব ১.৪১) — অর্থাৎ "এক ঘর দূরে" কথাটার মানে দিক অনুযায়ী বদলায়। dispatch-এ আপনি ঠিক এই জিনিসটাই চান না, কারণ "k ঘর দূরের সবাই" মানে যদি দিকভেদে ভিন্ন দূরত্ব হয়, তাহলে আপনার candidate সেট পক্ষপাতদুষ্ট।

দাম: ষড়ভুজ নিখুঁতভাবে উপবিভক্ত হয় না, তাই parent-child সম্পর্ক আসন্ন (একটা child সামান্য দুটো parent-এ পড়তে পারে), আর গোলক ঢাকতে গিয়ে ১২টা জায়গায় পঞ্চভুজ রাখতে হয়। বাস্তবে এই দুটোর কোনোটাই dispatch-এ সমস্যা করে না, কিন্তু জানা থাকা দরকার।

### সৎ তুলনা

| দিক                    | Geohash                       | Quadtree       | S2                           | H3                    |
| ---------------------- | ----------------------------- | -------------- | ---------------------------- | --------------------- |
| ঘরের আকৃতি             | আয়তক্ষেত্র                   | বর্গ           | চতুর্ভুজ (প্রায় সমান আয়তন) | ষড়ভুজ                |
| ঘনত্বের সাথে খাপ খায়  | না                            | **হ্যাঁ**      | না                           | না                    |
| Update খরচ             | O(1)                          | O(log n) + লক  | O(1)                         | O(1)                  |
| প্রতিবেশী বের করা      | আলাদা হিসাব, সীমান্তে অসুবিধা | গাছ হাঁটা      | ভালো                         | **তুচ্ছ, সমদূরবর্তী** |
| আকার বাছার সূক্ষ্মতা   | মোটা (৩২x ধাপ)                | যেকোনো         | সূক্ষ্ম (৩১ level)           | সূক্ষ্ম (১৬ level)    |
| লাইব্রেরি ছাড়া চলে    | **হ্যাঁ**                     | নিজে লিখতে হয় | না                           | না                    |
| ছড়ানো সিস্টেমে        | সহজ                           | কঠিন           | সহজ                          | সহজ                   |
| প্রথম দিনে বানানোর খরচ | **সবচেয়ে কম**                | বেশি           | মাঝারি                       | কম (লাইব্রেরি আছে)    |

**আমাদের পছন্দ: H3, resolution 8 চালকের index-এর জন্য, আর resolution 7 surge-এর জন্য।** কারণ তিনটে:

১. **k-ring query-টা এখানে প্রাকৃতিক আর নিরপেক্ষ।** dispatch-এর গোটা প্রশ্নটাই "kেন্দ্র থেকে বাইরের দিকে ছড়িয়ে খোঁজো", আর ষড়ভুজে সেটা একটা সরল বলয়।

২. **surge-এর জন্যও একই টাইলিং লাগবে।** চাহিদা-জোগানের অনুপাত এলাকাভিত্তিক হিসাব হয়, আর সমান আয়তনের ঘর ছাড়া সেই অনুপাত অর্থহীন — একটা ঘর অন্যটার দ্বিগুণ বড় হলে "প্রতি ঘরে ১০ জন যাত্রী" দুই জায়গায় দুই জিনিস বোঝায়। একই index দুটো কাজেই লাগানো মানে একটা কম সিস্টেম।

৩. **update খরচ O(1) আর কোনো coordination নেই।** সেকেন্ডে ৫০,০০০ update-এ এটাই একমাত্র বিবেচ্য।

<Callout type="tip">

তবে সৎ কথাটা বলে রাখা ভালো: **প্রথম দিনে geohash দিয়ে শুরু করাটা ভুল নয়**। Redis-এর `GEOADD`/`GEOSEARCH` ভেতরে geohash ব্যবহার করে আর একটাও লাইব্রেরি ছাড়াই দুই ঘণ্টায় একটা কাজ করা dispatch দাঁড় করিয়ে দেয়। বাস্তবে অনেক প্ল্যাটফর্ম বছরের পর বছর geohash-এ চলেছে। H3-তে যাওয়ার সিদ্ধান্তটা আসে যখন surge zoning আর ETA-র নিরপেক্ষতা গুরুত্বপূর্ণ হয়ে ওঠে — অর্থাৎ এটা একটা **দ্বিতীয় বছরের সিদ্ধান্ত**, প্রথম দিনের নয়। ইন্টারভিউতে এই সততাটাই বেশি নম্বর পায়।

</Callout>

H3 resolution-এর কয়েকটা কাজের সংখ্যা মনে রাখলে হিসাব করা সহজ হয়:

| Resolution | গড় প্রান্তের দৈর্ঘ্য | গড় আয়তন     | পুরো পৃথিবীতে ঘর |
| ---------- | --------------------- | ------------- | ---------------- |
| 6          | ৩.২৩ কিমি             | ৩৬.১ বর্গকিমি | ১.৪ কোটি         |
| 7          | ১.২২ কিমি             | ৫.১৬ বর্গকিমি | ৯.৯ কোটি         |
| 8          | ০.৪৬ কিমি             | ০.৭৪ বর্গকিমি | ৬৯ কোটি          |
| 9          | ০.১৭ কিমি             | ০.১১ বর্গকিমি | ৪৮৩ কোটি         |

resolution 8-এ একটা ঘরের এক প্রান্ত থেকে বিপরীত প্রান্তের দূরত্ব প্রায় ০.৮ কিমি, তাই `k-ring(3)` মোটামুটি ২.৪ কিমি ব্যাসার্ধ ঢাকে, আর ঘরের সংখ্যা `3k² + 3k + 1 = 37`। এই দুটো সংখ্যা — ০.৮ কিমি আর ৩৭ — এই ডিজাইনের বাকি হিসাবে বারবার ফিরে আসবে।

## ধাপ ৫: চালকের location write path

এবার সেই সিদ্ধান্তটা, যেটা এস্টিমেশন থেকে অনিবার্যভাবে বেরিয়ে এসেছে।

**Location কখনো primary store স্পর্শ করবে না।** কারণটা শুধু "ডেটাবেস ধীর" নয় — কারণটা হলো এই ডেটার তিনটে বৈশিষ্ট্যই primary store-এর গ্যারান্টিগুলোকে অপ্রয়োজনীয় করে দেয়:

- **এটা মুছে যাওয়া নিরাপদ।** একটা ping হারালে পরের ping চার সেকেন্ড পরে সেটা ঠিক করে দেবে। durability-র জন্য আমরা যে WAL, fsync আর replication-এর দাম দিই, সেটার বিনিময়ে এখানে কিছুই পাওয়া যায় না।
- **এটা কেবল overwrite হয়, কখনো append নয়।** চালকের বর্তমান অবস্থান একটাই, তাই ইতিহাস রাখার কোনো দরকার নেই — অথচ ডেটাবেসের পুরো যন্ত্রটাই ইতিহাস রাখার জন্য বানানো।
- **এটা transaction-এ অংশ নেয় না।** কোনো ব্যবসায়িক নিয়ম "চালকের অবস্থান আর অ্যাকাউন্ট ব্যালেন্স একসাথে বদলাতে হবে" বলে না।

তাই write path-টা দাঁড়ায়:

```
Driver app
  → persistent connection (WebSocket / gRPC stream)
  → Realtime gateway            (কোনো লজিক নেই, শুধু routing)
  → Location ingest worker      (driver_id-র consistent hash অনুযায়ী sticky)
  → In-memory geo index         (Redis, region-প্রতি, AOF/RDB বন্ধ)
  → [শুধু চলমান ট্রিপের জন্য] trail buffer → ব্যাচে columnar store
```

চারটে সিদ্ধান্ত এখানে গুরুত্বপূর্ণ।

**এক: ingest worker চালক-অনুযায়ী sticky।** একই চালকের সব ping একই worker-এ যায় (driver_id-র consistent hash)। এতে worker-এর মেমরিতে ওই চালকের শেষ ঘরটা জানা থাকে, তাই "ঘর বদলেছে কি না" প্রশ্নের উত্তর নেটওয়ার্কে না গিয়েই দেওয়া যায়। এটা একটা coordination-বিহীন partition — পনেরো নম্বর চ্যাপ্টারের "coordination এড়ানোর সবচেয়ে ভালো উপায় হলো ডেটাকে এমনভাবে ভাগ করা যাতে coordination-এর দরকারই না পড়ে" নিয়মটার সরাসরি প্রয়োগ।

**দুই: index তখনই বদলাবে যখন ঘর বদলাবে।** এটাই সেই কাঠের টুকরো না নড়ানোর নিয়ম। হিসাবটা করে দেখুন:

```
res 8 ঘরের বিপরীত প্রান্তের দূরত্ব  ≈ 800 m
শহরে গাড়ির গড় গতি                  ≈ 30 km/h = 8.3 m/s
একটা ঘর পার হতে সময়                ≈ 96 সেকেন্ড
ping-এর ব্যবধান                     = 4 সেকেন্ড
→ প্রতি 24টা ping-এ 1টা ঘর পরিবর্তন
```

অর্থাৎ ৫০,০০০ ping/sec থেকে index mutation নামে **প্রায় ২,১০০/sec**-এ। আর যে চালক সিগন্যালে দাঁড়িয়ে বা যাত্রীর অপেক্ষায় পার্ক করা, তার জন্য শূন্য। বাস্তব ট্রাফিক মিশিয়ে সংখ্যাটা দাঁড়ায় ২,০০০–৫,০০০/sec — যেটা একটা Redis cluster-এর কাছে হাসির ব্যাপার। **এক লাইনের একটা শর্তে write চাপ বিশ ভাগের এক ভাগ হয়ে গেল।**

**তিন: চালকের নিজের রেকর্ডে TTL।** প্রতিটা ping ওই চালকের hash-এ `PEXPIRE 60s` বসায়। ফলে কেউ হঠাৎ অফলাইন হয়ে গেলে (ফোনের ব্যাটারি শেষ, টানেলে ঢুকে গেছে) তার রেকর্ড নিজে থেকেই মিলিয়ে যায় — কোনো cleanup job লাগে না। ঘরের সেটে তার id হয়তো থেকে যাবে, কিন্তু query-র সময় hash না পেয়ে আমরা সেটাকে বাদ দেব আর অলসভাবে মুছে দেব। **এটা একটা self-healing index**, আর সেটাই এই ডেটার প্রকৃতির সাথে মানানসই।

**চার: ট্রিপের trail সম্পূর্ণ আলাদা পথে।** ভাড়ার হিসাব, বিরোধ নিষ্পত্তি আর নিরাপত্তার জন্য চলমান ট্রিপের পথটা রাখতেই হবে। কিন্তু সেটা geo index-এর কাজ নয়। চালকের অ্যাপ পয়েন্টগুলো নিজের কাছে জমিয়ে রাখে আর ৩০ সেকেন্ড পরপর একটা ব্যাচে পাঠায়:

```
চলমান ট্রিপ (peak)     = 150,000
প্রতি 30 সেকেন্ডে 1 ব্যাচ = 5,000 ব্যাচ/sec
প্রতি ব্যাচে ~8 পয়েন্ট     → columnar store-এ append-only
```

এতে ট্রিপের পথ durable থাকে, নেটওয়ার্ক গেলেও ডিভাইসে জমা থাকে, আর geo index-এর গরম পথে একটাও অতিরিক্ত write পড়ে না।

<Callout type="warning">

একটা সাধারণ ভুল: geo index-এর Redis-এ persistence চালু রেখে দেওয়া। AOF `everysec` চালু থাকলে সেকেন্ডে হাজার হাজার ঘর-পরিবর্তন ডিস্কে লেখা হবে, fork-এর সময় latency লাফাবে, আর বিনিময়ে আপনি এমন ডেটা "রক্ষা" করবেন যেটা restart-এর চার সেকেন্ডের মধ্যে আপনি এমনিতেই আবার পেয়ে যেতেন। **যে ডেটা নিজে নিজেই ফিরে আসে, তার জন্য durability কেনা মানে টাকা দিয়ে latency কেনা।**

</Callout>

## ধাপ ৬: Nearby-driver query-র ইমপ্লিমেন্টেশন

নিচে geo index-এর পূর্ণ রূপ: location update (ঘর-পরিবর্তন সহ), k-ring nearby query, অলস cleanup, আর cluster-এ চালানোর জন্য key layout।

key-গুলোর গঠনটা আলাদা করে লক্ষ করুন — প্রতিটা key-তে `{region}` একটা hash tag হিসেবে আছে। Redis Cluster hash tag-এর ভেতরের অংশ দিয়ে slot হিসাব করে, তাই **একটা region-এর সব key একই slot-এ পড়ে**। এর ফলে একটা Lua script-এর ভেতর থেকে চালকের hash আর ঘরের set — দুটোই ছোঁয়া বৈধ, আর পুরো update-টা atomic হয়। region-ভিত্তিক ভাগটা যে এখানে বিনামূল্যে এসে গেল, সেটা কাকতালীয় নয়; ধাপ ১২-তে দেখব এই একই সীমানাটাই failure domain।

<CodeTabs tsFile="geo-index.ts" goFile="geo_index.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';
import type { Cluster, Redis } from 'ioredis';

// --- Configuration ---
export const DRIVER_RES = 8; // ~0.46 km edge, ~0.8 km across
export const SURGE_RES = 7; // ~1.22 km edge, used by the surge engine
const CELL_ACROSS_KM = 0.8;
const DRIVER_TTL_MS = 60_000; // a driver that stops pinging disappears
const MAX_POINT_AGE_MS = 15_000; // older than this is not dispatchable
const EARTH_RADIUS_KM = 6371.0088;

export type DriverStatus = 'offline' | 'available' | 'offered' | 'on_trip';

export interface DriverPing {
	driverId: string;
	region: string;
	lat: number;
	lng: number;
	headingDeg: number;
	speedKph: number;
	atMs: number;
}

export interface DriverSnapshot {
	driverId: string;
	lat: number;
	lng: number;
	cell: string;
	status: DriverStatus;
	vehicleClass: string;
	headingDeg: number;
	speedKph: number;
	atMs: number;
}

export interface NearbyDriver extends DriverSnapshot {
	distanceKm: number;
	ageMs: number;
}

export interface NearbyOptions {
	radiusKm: number;
	limit: number;
	vehicleClasses?: string[];
	status?: DriverStatus;
}

// --- Key layout -----------------------------------------------------------
// Every key of a region carries the same hash tag, so the whole region lives
// in a single Redis Cluster slot. That is what makes the Lua script below
// legal: it touches two keys derived from the same region.
export function driverKey(region: string, driverId: string): string {
	return `drv:{${region}}:${driverId}`;
}

export function cellKeyPrefix(region: string): string {
	return `cell:{${region}}:`;
}

export function cellKey(region: string, cell: string): string {
	return cellKeyPrefix(region) + cell;
}

// --- Distance -------------------------------------------------------------
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// --- Lua: move a driver, but only touch the index when the cell changes ----
const UPDATE_LOCATION = `
local key        = KEYS[1]
local newCell    = ARGV[1]
local cellPrefix = ARGV[2]
local now        = tonumber(ARGV[3])
local ttl        = tonumber(ARGV[4])
local driverId   = ARGV[5]

local prevCell = redis.call('HGET', key, 'cell')
local moved = 0

if prevCell ~= newCell then
  if prevCell then
    redis.call('ZREM', cellPrefix .. prevCell, driverId)
  end
  redis.call('ZADD', cellPrefix .. newCell, now, driverId)
  moved = 1
end

redis.call('HSET', key,
  'lat', ARGV[6],
  'lng', ARGV[7],
  'cell', newCell,
  'heading', ARGV[8],
  'speed', ARGV[9],
  'at', now)

-- The TTL is the whole cleanup story: a driver who stops pinging evaporates.
redis.call('PEXPIRE', key, ttl)
return moved
`;

// --- Lua: lazily drop an id whose driver hash has already expired ----------
const REAP_MISSING = `
local exists = redis.call('EXISTS', KEYS[1])
if exists == 1 then return 0 end
redis.call('ZREM', ARGV[1] .. ARGV[2], ARGV[3])
return 1
`;

export class GeoIndex {
	private updateSha: string | null = null;
	private reapSha: string | null = null;

	constructor(private redis: Cluster | Redis) {}

	async init(): Promise<void> {
		this.updateSha = (await this.redis.script('LOAD', UPDATE_LOCATION)) as string;
		this.reapSha = (await this.redis.script('LOAD', REAP_MISSING)) as string;
	}

	/**
	 * The hot path: ~50k calls/sec at peak.
	 * One key touched, one round trip, and the sorted set is only rewritten
	 * when the driver actually crossed a cell boundary (~1 ping in 24).
	 */
	async updateLocation(ping: DriverPing): Promise<boolean> {
		const cell = latLngToCell(ping.lat, ping.lng, DRIVER_RES);

		const moved = (await this.redis.evalsha(
			this.updateSha!,
			1,
			driverKey(ping.region, ping.driverId),
			cell,
			cellKeyPrefix(ping.region),
			String(ping.atMs),
			String(DRIVER_TTL_MS),
			ping.driverId,
			String(ping.lat),
			String(ping.lng),
			String(ping.headingDeg),
			String(ping.speedKph)
		)) as number;

		return moved === 1;
	}

	/**
	 * Search outward from the pickup point over a ring of hexagons.
	 * k is derived from the requested radius, not hardcoded, so a sparse
	 * region can widen the search without a second code path.
	 */
	async nearby(
		region: string,
		lat: number,
		lng: number,
		opts: NearbyOptions
	): Promise<NearbyDriver[]> {
		const now = Date.now();
		const center = latLngToCell(lat, lng, DRIVER_RES);
		const k = Math.max(1, Math.ceil(opts.radiusKm / CELL_ACROSS_KM));
		const cells = gridDisk(center, k); // 3k^2 + 3k + 1 cells

		// 1. Collect candidate ids from every cell in the ring.
		const idPipe = this.redis.pipeline();
		for (const cell of cells) {
			idPipe.zrange(cellKey(region, cell), 0, -1);
		}
		const idResults = await idPipe.exec();

		const idToCell = new Map<string, string>();
		idResults?.forEach(([err, value], i) => {
			if (err || !Array.isArray(value)) return;
			for (const id of value as string[]) idToCell.set(id, cells[i]);
		});

		if (idToCell.size === 0) return [];

		// 2. Hydrate. A missing hash means the driver's TTL expired.
		const ids = [...idToCell.keys()];
		const hydratePipe = this.redis.pipeline();
		for (const id of ids) hydratePipe.hgetall(driverKey(region, id));
		const hydrated = await hydratePipe.exec();

		const out: NearbyDriver[] = [];
		const stale: Array<{ id: string; cell: string }> = [];

		hydrated?.forEach(([err, value], i) => {
			const id = ids[i];
			const row = value as Record<string, string> | null;

			if (err || !row || Object.keys(row).length === 0) {
				stale.push({ id, cell: idToCell.get(id)! });
				return;
			}

			const atMs = Number(row.at);
			const ageMs = now - atMs;
			if (ageMs > MAX_POINT_AGE_MS) return; // present but not trustworthy

			const status = (row.status ?? 'offline') as DriverStatus;
			if (opts.status && status !== opts.status) return;

			const vehicleClass = row.vehicle ?? 'standard';
			if (opts.vehicleClasses && !opts.vehicleClasses.includes(vehicleClass)) return;

			const dLat = Number(row.lat);
			const dLng = Number(row.lng);
			const distanceKm = haversineKm(lat, lng, dLat, dLng);
			if (distanceKm > opts.radiusKm) return; // the ring over-covers the circle

			out.push({
				driverId: id,
				lat: dLat,
				lng: dLng,
				cell: row.cell,
				status,
				vehicleClass,
				headingDeg: Number(row.heading ?? 0),
				speedKph: Number(row.speed ?? 0),
				atMs,
				distanceKm,
				ageMs
			});
		});

		// 3. Repair the index in the background; never block the query on it.
		if (stale.length > 0) void this.reap(region, stale);

		out.sort((a, b) => a.distanceKm - b.distanceKm);
		return out.slice(0, opts.limit);
	}

	private async reap(region: string, stale: Array<{ id: string; cell: string }>) {
		try {
			const pipe = this.redis.pipeline();
			for (const { id, cell } of stale) {
				pipe.evalsha(this.reapSha!, 1, driverKey(region, id), cellKeyPrefix(region), cell, id);
			}
			await pipe.exec();
			console.log(`[geo] reaped ${stale.length} stale ids in region=${region}`);
		} catch (err) {
			console.warn(`[geo] reap failed in region=${region}`, err);
		}
	}

	async getDriver(region: string, driverId: string): Promise<DriverSnapshot | null> {
		const row = await this.redis.hgetall(driverKey(region, driverId));
		if (!row || Object.keys(row).length === 0) return null;
		return {
			driverId,
			lat: Number(row.lat),
			lng: Number(row.lng),
			cell: row.cell,
			status: (row.status ?? 'offline') as DriverStatus,
			vehicleClass: row.vehicle ?? 'standard',
			headingDeg: Number(row.heading ?? 0),
			speedKph: Number(row.speed ?? 0),
			atMs: Number(row.at)
		};
	}

	/** Supply signal for the surge engine, bucketed at the coarser resolution. */
	async supplyByCell(region: string, cells: string[]): Promise<Map<string, number>> {
		const pipe = this.redis.pipeline();
		for (const cell of cells) pipe.zcard(cellKey(region, cell));
		const res = await pipe.exec();

		const counts = new Map<string, number>();
		res?.forEach(([err, value], i) => {
			counts.set(cells[i], err ? 0 : Number(value ?? 0));
		});
		return counts;
	}

	/** Centre of a cell, used when rendering coarse heat maps to riders. */
	static cellCentre(cell: string): { lat: number; lng: number } {
		const [lat, lng] = cellToLatLng(cell);
		return { lat, lng };
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package geo

import (
	"context"
	"log"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	h3 "github.com/uber/h3-go/v4"
)

// --- Configuration ---
const (
	DriverRes      = 8 // ~0.46 km edge, ~0.8 km across
	SurgeRes       = 7 // used by the surge engine
	cellAcrossKm   = 0.8
	driverTTL      = 60 * time.Second
	maxPointAge    = 15 * time.Second
	earthRadiusKm  = 6371.0088
)

type DriverStatus string

const (
	StatusOffline   DriverStatus = "offline"
	StatusAvailable DriverStatus = "available"
	StatusOffered   DriverStatus = "offered"
	StatusOnTrip    DriverStatus = "on_trip"
)

type DriverPing struct {
	DriverID   string
	Region     string
	Lat        float64
	Lng        float64
	HeadingDeg float64
	SpeedKph   float64
	AtMS       int64
}

type DriverSnapshot struct {
	DriverID     string
	Lat          float64
	Lng          float64
	Cell         string
	Status       DriverStatus
	VehicleClass string
	HeadingDeg   float64
	SpeedKph     float64
	AtMS         int64
}

type NearbyDriver struct {
	DriverSnapshot
	DistanceKm float64
	AgeMS      int64
}

type NearbyOptions struct {
	RadiusKm       float64
	Limit          int
	VehicleClasses []string
	Status         DriverStatus
}

// --- Key layout -----------------------------------------------------------
// Every key of a region carries the same hash tag, so a region lives in one
// Redis Cluster slot. That is what makes the Lua script below legal.
func DriverKey(region, driverID string) string {
	return "drv:{" + region + "}:" + driverID
}

func CellKeyPrefix(region string) string {
	return "cell:{" + region + "}:"
}

func CellKey(region, cell string) string {
	return CellKeyPrefix(region) + cell
}

// --- Distance -------------------------------------------------------------
func HaversineKm(aLat, aLng, bLat, bLng float64) float64 {
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat := rad(bLat - aLat)
	dLng := rad(bLng - aLng)
	s := math.Pow(math.Sin(dLat/2), 2) +
		math.Cos(rad(aLat))*math.Cos(rad(bLat))*math.Pow(math.Sin(dLng/2), 2)
	return 2 * earthRadiusKm * math.Asin(math.Min(1, math.Sqrt(s)))
}

// --- Lua: move a driver, but only touch the index when the cell changes ----
var updateLocation = redis.NewScript(`
local key        = KEYS[1]
local newCell    = ARGV[1]
local cellPrefix = ARGV[2]
local now        = tonumber(ARGV[3])
local ttl        = tonumber(ARGV[4])
local driverId   = ARGV[5]

local prevCell = redis.call('HGET', key, 'cell')
local moved = 0

if prevCell ~= newCell then
  if prevCell then
    redis.call('ZREM', cellPrefix .. prevCell, driverId)
  end
  redis.call('ZADD', cellPrefix .. newCell, now, driverId)
  moved = 1
end

redis.call('HSET', key,
  'lat', ARGV[6],
  'lng', ARGV[7],
  'cell', newCell,
  'heading', ARGV[8],
  'speed', ARGV[9],
  'at', now)

redis.call('PEXPIRE', key, ttl)
return moved
`)

// --- Lua: lazily drop an id whose driver hash has already expired ----------
var reapMissing = redis.NewScript(`
local exists = redis.call('EXISTS', KEYS[1])
if exists == 1 then return 0 end
redis.call('ZREM', ARGV[1] .. ARGV[2], ARGV[3])
return 1
`)

type Index struct {
	rdb redis.UniversalClient
}

func NewIndex(rdb redis.UniversalClient) *Index {
	return &Index{rdb: rdb}
}

// UpdateLocation is the hot path: ~50k calls/sec at peak. One key touched,
// one round trip, and the sorted set is only rewritten when the driver
// actually crossed a cell boundary (~1 ping in 24).
func (ix *Index) UpdateLocation(ctx context.Context, p DriverPing) (bool, error) {
	cell := h3.LatLngToCell(h3.NewLatLng(p.Lat, p.Lng), DriverRes)

	moved, err := updateLocation.Run(ctx, ix.rdb,
		[]string{DriverKey(p.Region, p.DriverID)},
		cell.String(),
		CellKeyPrefix(p.Region),
		p.AtMS,
		driverTTL.Milliseconds(),
		p.DriverID,
		strconv.FormatFloat(p.Lat, 'f', 6, 64),
		strconv.FormatFloat(p.Lng, 'f', 6, 64),
		strconv.FormatFloat(p.HeadingDeg, 'f', 1, 64),
		strconv.FormatFloat(p.SpeedKph, 'f', 1, 64),
	).Int()
	if err != nil {
		return false, err
	}
	return moved == 1, nil
}

type staleEntry struct {
	id   string
	cell string
}

// Nearby searches outward from the pickup point over a ring of hexagons.
// k is derived from the requested radius, so a sparse region widens the
// search without a second code path.
func (ix *Index) Nearby(ctx context.Context, region string, lat, lng float64, opts NearbyOptions) ([]NearbyDriver, error) {
	now := time.Now().UnixMilli()
	center := h3.LatLngToCell(h3.NewLatLng(lat, lng), DriverRes)

	k := int(math.Ceil(opts.RadiusKm / cellAcrossKm))
	if k < 1 {
		k = 1
	}
	cells := h3.GridDisk(center, k) // 3k^2 + 3k + 1 cells

	// 1. Collect candidate ids from every cell in the ring.
	idPipe := ix.rdb.Pipeline()
	idCmds := make([]*redis.StringSliceCmd, len(cells))
	for i, c := range cells {
		idCmds[i] = idPipe.ZRange(ctx, CellKey(region, c.String()), 0, -1)
	}
	if _, err := idPipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	idToCell := make(map[string]string)
	for i, cmd := range idCmds {
		ids, err := cmd.Result()
		if err != nil {
			continue
		}
		for _, id := range ids {
			idToCell[id] = cells[i].String()
		}
	}
	if len(idToCell) == 0 {
		return nil, nil
	}

	// 2. Hydrate. A missing hash means the driver's TTL expired.
	ids := make([]string, 0, len(idToCell))
	for id := range idToCell {
		ids = append(ids, id)
	}

	hydratePipe := ix.rdb.Pipeline()
	rowCmds := make([]*redis.MapStringStringCmd, len(ids))
	for i, id := range ids {
		rowCmds[i] = hydratePipe.HGetAll(ctx, DriverKey(region, id))
	}
	if _, err := hydratePipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	out := make([]NearbyDriver, 0, len(ids))
	var stale []staleEntry

	for i, cmd := range rowCmds {
		id := ids[i]
		row, err := cmd.Result()
		if err != nil || len(row) == 0 {
			stale = append(stale, staleEntry{id: id, cell: idToCell[id]})
			continue
		}

		atMS, _ := strconv.ParseInt(row["at"], 10, 64)
		ageMS := now - atMS
		if ageMS > maxPointAge.Milliseconds() {
			continue // present but not trustworthy
		}

		status := DriverStatus(row["status"])
		if status == "" {
			status = StatusOffline
		}
		if opts.Status != "" && status != opts.Status {
			continue
		}

		vehicle := row["vehicle"]
		if vehicle == "" {
			vehicle = "standard"
		}
		if len(opts.VehicleClasses) > 0 && !contains(opts.VehicleClasses, vehicle) {
			continue
		}

		dLat, _ := strconv.ParseFloat(row["lat"], 64)
		dLng, _ := strconv.ParseFloat(row["lng"], 64)
		dist := HaversineKm(lat, lng, dLat, dLng)
		if dist > opts.RadiusKm {
			continue // the ring over-covers the circle
		}

		heading, _ := strconv.ParseFloat(row["heading"], 64)
		speed, _ := strconv.ParseFloat(row["speed"], 64)

		out = append(out, NearbyDriver{
			DriverSnapshot: DriverSnapshot{
				DriverID:     id,
				Lat:          dLat,
				Lng:          dLng,
				Cell:         row["cell"],
				Status:       status,
				VehicleClass: vehicle,
				HeadingDeg:   heading,
				SpeedKph:     speed,
				AtMS:         atMS,
			},
			DistanceKm: dist,
			AgeMS:      ageMS,
		})
	}

	// 3. Repair the index in the background; never block the query on it.
	if len(stale) > 0 {
		go ix.reap(context.WithoutCancel(ctx), region, stale)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].DistanceKm < out[j].DistanceKm })
	if opts.Limit > 0 && len(out) > opts.Limit {
		out = out[:opts.Limit]
	}
	return out, nil
}

func (ix *Index) reap(ctx context.Context, region string, stale []staleEntry) {
	pipe := ix.rdb.Pipeline()
	for _, s := range stale {
		reapMissing.Run(ctx, pipe,
			[]string{DriverKey(region, s.id)},
			CellKeyPrefix(region), s.cell, s.id)
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		log.Printf("[geo] reap failed region=%s: %v", region, err)
		return
	}
	log.Printf("[geo] reaped %d stale ids in region=%s", len(stale), region)
}

func (ix *Index) GetDriver(ctx context.Context, region, driverID string) (*DriverSnapshot, error) {
	row, err := ix.rdb.HGetAll(ctx, DriverKey(region, driverID)).Result()
	if err != nil || len(row) == 0 {
		return nil, err
	}

	lat, _ := strconv.ParseFloat(row["lat"], 64)
	lng, _ := strconv.ParseFloat(row["lng"], 64)
	heading, _ := strconv.ParseFloat(row["heading"], 64)
	speed, _ := strconv.ParseFloat(row["speed"], 64)
	atMS, _ := strconv.ParseInt(row["at"], 10, 64)

	return &DriverSnapshot{
		DriverID:     driverID,
		Lat:          lat,
		Lng:          lng,
		Cell:         row["cell"],
		Status:       DriverStatus(row["status"]),
		VehicleClass: row["vehicle"],
		HeadingDeg:   heading,
		SpeedKph:     speed,
		AtMS:         atMS,
	}, nil
}

// SupplyByCell is the supply signal for the surge engine.
func (ix *Index) SupplyByCell(ctx context.Context, region string, cells []string) (map[string]int64, error) {
	pipe := ix.rdb.Pipeline()
	cmds := make([]*redis.IntCmd, len(cells))
	for i, c := range cells {
		cmds[i] = pipe.ZCard(ctx, CellKey(region, c))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	counts := make(map[string]int64, len(cells))
	for i, cmd := range cmds {
		n, err := cmd.Result()
		if err != nil {
			n = 0
		}
		counts[cells[i]] = n
	}
	return counts, nil
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
```

</div>
</CodeTabs>

### এই কোডে যে সিদ্ধান্তগুলো গুরুত্বপূর্ণ

**`moved` ফেরত দেওয়া।** script-টা জানায় ঘর বদলেছে কি না। এটা শুধু তথ্য নয় — এটাই আপনার সবচেয়ে দামি মেট্রিক। `moved` হার হঠাৎ বেড়ে গেলে বুঝবেন হয় resolution খুব সূক্ষ্ম, নয়তো GPS jitter ঘরের সীমান্তে চালকদের এদিক-ওদিক ছোঁড়াছুঁড়ি করছে (আঠারো নম্বর চ্যাপ্টারের ভাষায়, এটা একটা চমৎকার leading indicator)।

**Ring বৃত্তকে ঢেকে ফেলে, তাই দূরত্ব দিয়ে আবার ছাঁকা হয়।** `gridDisk(k)` একটা ষড়ভুজাকার এলাকা দেয়, যেটা কাঙ্ক্ষিত বৃত্তের চেয়ে বড়। তাই কোনায় থাকা চালকরা `radiusKm`-এর বাইরে পড়ে যায় এবং বাদ যায়। এটা ইচ্ছাকৃত — index-এর কাজ **recall**, নিখুঁততা নয়; নিখুঁততা পরের ধাপের।

**Hydration-এর অনুপস্থিতিই cleanup সংকেত।** আলাদা কোনো "expired driver" job নেই। TTL-ই সত্য, আর query নিজেই ধীরে ধীরে index পরিষ্কার করে। এটা অনেক কম কোড এবং অনেক কম ভুল করার জায়গা।

**Reap কখনো query আটকায় না।** পরিষ্কার করাটা পটভূমিতে, আর ব্যর্থ হলে শুধু একটা log — কারণ index-এ একটা মৃত id থাকা নিরীহ, কিন্তু একটা dispatch query ৩০ ms-এর বদলে ৩০০ ms নেওয়া নয়।

<Callout type="tip">

`MAX_POINT_AGE_MS` নবটা এই সিস্টেমের সবচেয়ে কাজের জরুরি নব। ingest pipeline পিছিয়ে পড়লে index-এ পুরনো পয়েন্ট জমতে থাকে, আর তখন dispatch এমন চালককে অফার পাঠায় যে আসলে দুই কিলোমিটার দূরে চলে গেছে। এই সীমাটা কমিয়ে দিলে সিস্টেম কম চালক দেখবে কিন্তু **যাদের দেখবে তাদের উপর ভরসা করা যাবে** — উনিশ নম্বর চ্যাপ্টারের ভাষায়, ভুল উত্তরের চেয়ে কম উত্তর ভালো।

</Callout>

## ধাপ ৭: Matching — candidate থেকে অফার

nearby query একটা তালিকা দিল। সেটা এখনও উত্তর নয়, শুধু **candidate সেট**। সতেরো নম্বর চ্যাপ্টারের search pipeline-এর মতোই এখানেও দুই ধাপ: সস্তা recall, তারপর দামি precision।

**candidate generation (সস্তা):** k-ring থেকে ২০–৫০ জন খালি চালক, সরলরেখার দূরত্ব দিয়ে ছাঁকা।

**scoring (দামি):** সরলরেখার দূরত্ব একটা মিথ্যা — নদীর ওপারের চালক ৪০০ মিটার দূরে হলেও তার আসতে ১২ মিনিট লাগে। তাই আসল স্কোরিং হয় **road-network ETA** দিয়ে, আর সেটা একটা আলাদা সার্ভিসে একবারে ব্যাচ করে জিজ্ঞেস করা হয় (৩০টা আলাদা কল নয়, একটা কলে ৩০টা গন্তব্য)।

একটা ব্যবহারিক স্কোর:

```
score = w1 * eta_penalty(pickup_eta_sec)
      + w2 * acceptance_rate(driver)
      + w3 * idle_minutes(driver)          -- fairness
      + w4 * vehicle_match(driver, request)
      - w5 * recent_decline_penalty(driver, rider)
      - w6 * detour_from_driver_preference(driver, dropoff)

eta_penalty      = exp(-eta_sec / 240)      -- 4 মিনিটের half-life
acceptance_rate  = গত 100 অফারে নেওয়ার হার
idle_minutes     = শেষ ট্রিপ শেষ হওয়ার পর থেকে সময়, ক্যাপসহ
```

`idle_minutes`-এর ওজনটা কেবল ভদ্রতা নয়, এটা একটা ব্যবসায়িক প্রয়োজন। শুধু ETA দিয়ে বাছলে ব্যস্ত এলাকার চালকরা ভাড়ার পর ভাড়া পায় আর প্রান্তের চালকরা ঘণ্টার পর ঘণ্টা বসে থাকে — কয়েক সপ্তাহে তারা প্ল্যাটফর্ম ছেড়ে দেয়, আর তখন প্রান্তে জোগানই থাকে না। **matching অ্যালগরিদম আসলে একটা সম্পদ বণ্টনের নীতি, আর সেটার ফলাফল কয়েক মাস পরে জোগানের মানচিত্রে দেখা যায়।**

### একটা করে অফার, নাকি ব্যাচে সমাধান

দুটো ঘরানা আছে, আর দুটোই বাস্তবে ব্যবহৃত হয়।

**Greedy per-request** — রিকোয়েস্ট এলেই সবচেয়ে ভালো চালককে অফার, না নিলে পরেরজন। সবচেয়ে কম latency, বোঝা সহজ, আর ঠিক এখানেই race condition-টা জন্ম নেয়।

**Batched assignment** — ২–৫ সেকেন্ডের একটা জানালায় রিকোয়েস্টগুলো জমিয়ে রেখে পুরো region-এর জন্য একবারে একটা assignment problem সমাধান করা (দ্বিপক্ষীয় গ্রাফে ন্যূনতম মোট ETA, Hungarian বা একটা লোভী আসন্ন সমাধান)। ফলাফল বিশ্বব্যাপীভাবে ভালো — greedy-তে যেটা হয়, প্রথম যাত্রী কাছের চালকটা নিয়ে নেয় আর দ্বিতীয় যাত্রীর জন্য কেউ থাকে না, অথচ অদলবদল করলে দুজনেরই কম অপেক্ষা হতো।

| দিক                       | Greedy                     | Batched                               |
| ------------------------- | -------------------------- | ------------------------------------- |
| Match latency             | সবচেয়ে কম                 | +২–৫ সেকেন্ড                          |
| মোট অপেক্ষা (system-wide) | খারাপ                      | **৫–১৫% ভালো**                        |
| Race condition            | আছে, আলাদা করে সামলাতে হয় | **স্বাভাবিকভাবেই নেই** — একটাই solver |
| জটিলতা                    | কম                         | বেশি                                  |
| ফাঁকা এলাকায়             | ভালো                       | জানালার দেরিটা অপচয়                  |

ব্যাচিং race-টা মিটিয়ে দেয় কারণ ওই জানালায় region-এর চালকদের **একটাই লেখক** থাকে। কিন্তু সেই একক লেখকটাই একটা coordination bottleneck আর একটা availability নির্ভরতা — পনেরো নম্বর চ্যাপ্টারের leader election ছাড়া সেটা নিরাপদে চালানো যায় না। বাস্তব সিস্টেম দুটোই রাখে: স্বাভাবিক সময়ে ব্যাচ, আর জানালা ফসকে যাওয়া বা solver অসুস্থ হলে greedy fallback।

এই চ্যাপ্টারে আমরা **greedy পথটা কোড করব**, কারণ race-টা সেখানেই খালি চোখে দেখা যায় — আর race মেটানোর কৌশলটা ব্যাচিং করলেও লাগে, শুধু কম জায়গায়।

### সেই race, ধাপে ধাপে

<Mermaid
title="The double-offer race"
code={`sequenceDiagram
  participant WA as Dispatch worker A
  participant WB as Dispatch worker B
  participant IX as Geo index
  participant DR as Driver Ibn Rushd
  WA->>IX: nearby for trip of Fatima al-Fihri
  IX-->>WA: Ibn Rushd is available
  WB->>IX: nearby for trip of Ibn al-Haytham
  IX-->>WB: Ibn Rushd is available
  WA->>DR: offer trip T1
  WB->>DR: offer trip T2
  DR-->>WA: accept T1
  DR-->>WB: accept T2
  Note over WA,WB: two trips now believe they own one driver`}
/>

ভুলটা কোথায় সেটা এক লাইনে বলা যায়: **read-then-write, কোনো atomicity ছাড়া।** দুই worker পড়ল "available", দুজনেই সেই তথ্যের উপর ভিত্তি করে কাজ করল, অথচ পড়া আর কাজের মাঝখানে তথ্যটা বদলে যেতে পারে। এটাই ক্লাসিক lost update, শুধু হারানো জিনিসটা একটা row নয় — একজন মানুষের পরের এক ঘণ্টা।

সাধারণ কিন্তু ভুল সমাধানগুলো আগে বাদ দিয়ে নিই:

- **"চালক নিজেই তো একটাই নিতে পারবে"** — না। দুটো অফার পৌঁছালে চালকের ফোনে দুটো স্ক্রিন আসে, সে বিভ্রান্ত হয়, আর যেই একটা নিক, অন্য যাত্রী ততক্ষণে ২০ সেকেন্ড হারিয়েছে। উপরন্তু দুটো accept প্রায় একই সময়ে এলে সার্ভারকে তখনও সিদ্ধান্ত নিতে হবে।
- **"ডেটাবেসে transaction দিয়ে করি"** — কাজ করবে, কিন্তু তাহলে dispatch-এর প্রতিটা পদক্ষেপ primary store-এ যাচ্ছে, আর আমরা ধাপ ৫-এ ঠিক সেটাই এড়াতে চেয়েছি। তার চেয়ে বড় কথা, অফারের জানালা ১২ সেকেন্ড — একটা ডেটাবেস transaction ১২ সেকেন্ড খোলা রাখা যায় না।
- **"একটা distributed lock নিই"** — কাছাকাছি, কিন্তু পনেরো নম্বর চ্যাপ্টারের সাবধানবাণীটা মনে রাখুন: মেয়াদহীন লক মানে একটা crash হওয়া worker একটা চালককে চিরকালের জন্য আটকে রাখল, আর fencing token ছাড়া লক মানে একটা ঘুমিয়ে-জেগে ওঠা worker মেয়াদ শেষ হওয়া লক নিয়ে কাজ চালিয়ে যাবে।

**সঠিক সমাধান তিনটে অংশের:**

১. **Atomic claim, তারপর অফার।** চালকের status একটামাত্র জায়গায় থাকে, আর সেখানে একটা compare-and-set: "যদি status এখনও `available` হয়, তবে সেটাকে `offered` করো এবং আমাকে জানাও"। জিতলে তবেই অফার পাঠাও। এটাই সেই একটামাত্র পিতলের পেরেক।

২. **Claim-এর একটা মেয়াদ (lease)।** claim-এর সাথে `claimUntil` বসে। worker মরে গেলে মেয়াদ ফুরোয় আর একটা reaper চালককে ছেড়ে দেয়। কেউ চিরকাল আটকে থাকে না।

৩. **Fencing token।** প্রতিটা claim চালকের রেকর্ডে একটা counter বাড়ায়, আর সেই সংখ্যাটাই claim-এর token। পরবর্তী প্রতিটা পদক্ষেপ — accept, release, ট্রিপ শুরু — token মিলিয়ে দেখে। মেয়াদ শেষ হওয়া token নিয়ে দেরিতে আসা accept প্রত্যাখ্যাত হয়, কারণ ততক্ষণে counter এগিয়ে গেছে।

<Mermaid
title="Claim before offer, with lease and fence"
code={`sequenceDiagram
  participant WA as Dispatch worker A
  participant WB as Dispatch worker B
  participant IX as Driver record
  participant DR as Driver Ibn Rushd
  WA->>IX: CAS claim if available, lease 15s
  IX-->>WA: won, fence 42
  WB->>IX: CAS claim if available, lease 15s
  IX-->>WB: lost, driver already offered
  WB->>WB: move to next candidate Al-Biruni
  WA->>DR: offer trip T1, fence 42
  DR-->>WA: accept, fence 42
  WA->>IX: confirm if fence still 42
  IX-->>WA: ok, status on_trip`}
/>

লক্ষ করুন worker B কোনো ব্যর্থতা দেখেনি, কোনো retry করেনি, কোনো error ছোড়েনি। সে শুধু **সাথে সাথেই পরের candidate-এ গেছে**। একটা ভালো mutual exclusion ডিজাইনের এটাই লক্ষণ: হেরে যাওয়াটা একটা exception নয়, একটা স্বাভাবিক ফলাফল।

## ধাপ ৮: Dispatch-এর ইমপ্লিমেন্টেশন

নিচে পূর্ণ dispatch loop: candidate scoring, atomic claim, অফার পাঠানো ও অপেক্ষা, accept-এ fencing যাচাই, decline/timeout-এ ছেড়ে দিয়ে পরেরজন, আর মেয়াদ ফুরোনো claim-এর reaper।

<CodeTabs tsFile="dispatch.ts" goFile="dispatch.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import type { Cluster, Redis } from 'ioredis';
import { GeoIndex, driverKey, type NearbyDriver } from './geo-index';

// --- Configuration ---
const CLAIM_LEASE_MS = 15_000; // must outlive the offer window
const OFFER_WINDOW_MS = 12_000; // what the driver sees on screen
const MAX_ATTEMPTS = 8; // candidates tried before giving up
const SEARCH_RADII_KM = [2, 4, 7]; // widened only when nothing is found
const CANDIDATE_LIMIT = 30;

export interface RideRequest {
	tripId: string;
	riderId: string;
	region: string;
	pickup: { lat: number; lng: number };
	dropoff: { lat: number; lng: number };
	vehicleClass: string;
	quoteId: string;
	requestedAtMs: number;
}

export interface Candidate extends NearbyDriver {
	etaSec: number;
	score: number;
}

export type OfferOutcome =
	| { kind: 'accepted' }
	| { kind: 'declined' }
	| { kind: 'timeout' }
	| { kind: 'undeliverable' };

export interface Assignment {
	tripId: string;
	driverId: string;
	fence: number;
	etaSec: number;
}

export interface EtaService {
	/** One batched call, never one call per candidate. */
	batchEta(
		from: { lat: number; lng: number },
		drivers: Array<{ driverId: string; lat: number; lng: number }>
	): Promise<Map<string, number>>;
}

export interface DriverStats {
	acceptanceRate(driverId: string): Promise<number>;
	idleMinutes(driverId: string): Promise<number>;
	recentlyDeclined(driverId: string, riderId: string): Promise<boolean>;
}

export interface OfferChannel {
	/** Resolves when the driver answers, or on timeout. */
	send(
		driverId: string,
		offer: { tripId: string; fence: number; etaSec: number; expiresAtMs: number },
		timeoutMs: number
	): Promise<OfferOutcome>;
}

export interface TripStore {
	/** Guarded transition; false means the trip was no longer in `from`. */
	transition(
		tripId: string,
		from: string[],
		to: string,
		patch: Record<string, unknown>
	): Promise<boolean>;
}

export interface EventBus {
	publish(topic: string, event: Record<string, unknown>): Promise<void>;
}

// --- Lua: claim a driver, atomically, with a lease and a fence -------------
const CLAIM_DRIVER = `
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local now   = tonumber(ARGV[2])
local lease = tonumber(ARGV[3])
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'status') ~= 'available' then return 0 end

local until_ms = tonumber(redis.call('HGET', key, 'claimUntil') or '0')
if until_ms > now then return 0 end

-- The fence only ever moves forward, so a stale holder can never win again.
local fence = redis.call('HINCRBY', key, 'fence', 1)
redis.call('HSET', key,
  'status', 'offered',
  'claimTrip', trip,
  'claimUntil', now + lease)
redis.call('ZADD', zkey, now + lease, id)
return fence
`;

// --- Lua: release a claim, but only if it is still ours --------------------
const RELEASE_DRIVER = `
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local fence = tonumber(ARGV[2])
local to    = ARGV[3]
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'claimTrip') ~= trip then return 0 end
if tonumber(redis.call('HGET', key, 'fence') or '0') ~= fence then return 0 end

redis.call('HSET', key, 'status', to)
redis.call('HDEL', key, 'claimTrip', 'claimUntil')
redis.call('ZREM', zkey, id)
return 1
`;

// --- Lua: confirm an accepted offer, fence-checked -------------------------
const CONFIRM_DRIVER = `
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local fence = tonumber(ARGV[2])
local now   = tonumber(ARGV[3])
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'claimTrip') ~= trip then return 0 end
if tonumber(redis.call('HGET', key, 'fence') or '0') ~= fence then return 0 end
if tonumber(redis.call('HGET', key, 'claimUntil') or '0') <= now then return 0 end

redis.call('HSET', key, 'status', 'on_trip', 'tripId', trip)
redis.call('HDEL', key, 'claimTrip', 'claimUntil')
redis.call('ZREM', zkey, id)
return 1
`;

function claimsKey(region: string): string {
	return `claims:{${region}}`;
}

export class DispatchService {
	private claimSha!: string;
	private releaseSha!: string;
	private confirmSha!: string;

	constructor(
		private redis: Cluster | Redis,
		private geo: GeoIndex,
		private eta: EtaService,
		private stats: DriverStats,
		private offers: OfferChannel,
		private trips: TripStore,
		private bus: EventBus
	) {}

	async init(): Promise<void> {
		this.claimSha = (await this.redis.script('LOAD', CLAIM_DRIVER)) as string;
		this.releaseSha = (await this.redis.script('LOAD', RELEASE_DRIVER)) as string;
		this.confirmSha = (await this.redis.script('LOAD', CONFIRM_DRIVER)) as string;
	}

	/**
	 * The whole dispatch loop for one ride request.
	 * Returns null when nobody took the trip; the caller decides whether to
	 * re-queue, widen, or tell the rider there are no cars.
	 */
	async dispatch(req: RideRequest): Promise<Assignment | null> {
		const candidates = await this.buildCandidates(req);

		if (candidates.length === 0) {
			await this.trips.transition(req.tripId, ['matching'], 'no_drivers', {
				reason: 'empty_candidate_set'
			});
			return null;
		}

		let attempts = 0;

		for (const candidate of candidates) {
			if (attempts >= MAX_ATTEMPTS) break;

			// 1. Claim first, offer second. This is the whole race fix.
			const fence = await this.claim(req.region, candidate.driverId, req.tripId);
			if (fence === 0) {
				// Somebody else got there first. Not an error, just the next name.
				console.log(`[dispatch] claim lost trip=${req.tripId} driver=${candidate.driverId}`);
				continue;
			}

			attempts++;

			// 2. Record the offer on the trip. If the rider cancelled while we
			//    were choosing, this fails and we must hand the driver back.
			const moved = await this.trips.transition(req.tripId, ['matching', 'offered'], 'offered', {
				driverId: candidate.driverId,
				fence,
				etaSec: candidate.etaSec,
				offeredAtMs: Date.now()
			});

			if (!moved) {
				await this.release(req.region, candidate.driverId, req.tripId, fence, 'available');
				console.log(`[dispatch] trip=${req.tripId} left matching state, aborting`);
				return null;
			}

			// 3. Ask the driver. This is the only slow step, and it is bounded.
			const outcome = await this.offers.send(
				candidate.driverId,
				{
					tripId: req.tripId,
					fence,
					etaSec: candidate.etaSec,
					expiresAtMs: Date.now() + OFFER_WINDOW_MS
				},
				OFFER_WINDOW_MS
			);

			if (outcome.kind !== 'accepted') {
				await this.release(req.region, candidate.driverId, req.tripId, fence, 'available');
				await this.bus.publish('dispatch.offer_rejected', {
					tripId: req.tripId,
					driverId: candidate.driverId,
					reason: outcome.kind
				});
				continue;
			}

			// 4. Confirm under the same fence. A late accept from an expired
			//    claim dies here instead of double-booking the driver.
			const confirmed = await this.confirm(req.region, candidate.driverId, req.tripId, fence);
			if (!confirmed) {
				console.warn(
					`[dispatch] stale accept trip=${req.tripId} driver=${candidate.driverId} fence=${fence}`
				);
				continue;
			}

			const accepted = await this.trips.transition(req.tripId, ['offered'], 'accepted', {
				driverId: candidate.driverId,
				fence,
				acceptedAtMs: Date.now()
			});

			if (!accepted) {
				// Trip was cancelled between offer and accept: undo cleanly.
				await this.release(req.region, candidate.driverId, req.tripId, fence, 'available');
				return null;
			}

			await this.bus.publish('trip.accepted', {
				tripId: req.tripId,
				riderId: req.riderId,
				driverId: candidate.driverId,
				region: req.region,
				etaSec: candidate.etaSec
			});

			console.log(
				`[dispatch] matched trip=${req.tripId} driver=${candidate.driverId} attempts=${attempts}`
			);

			return { tripId: req.tripId, driverId: candidate.driverId, fence, etaSec: candidate.etaSec };
		}

		await this.trips.transition(req.tripId, ['matching', 'offered'], 'no_drivers', {
			reason: 'all_candidates_exhausted',
			attempts
		});
		return null;
	}

	/** Candidate generation plus scoring: cheap recall, then expensive precision. */
	private async buildCandidates(req: RideRequest): Promise<Candidate[]> {
		let nearby: NearbyDriver[] = [];

		// Widen only when the narrow ring came up empty; a wide default would
		// burn ETA budget on drivers nobody wants.
		for (const radiusKm of SEARCH_RADII_KM) {
			nearby = await this.geo.nearby(req.region, req.pickup.lat, req.pickup.lng, {
				radiusKm,
				limit: CANDIDATE_LIMIT,
				status: 'available',
				vehicleClasses: [req.vehicleClass]
			});
			if (nearby.length >= 5) break;
		}

		if (nearby.length === 0) return [];

		// One batched routing call for all candidates.
		const etas = await this.eta.batchEta(
			req.pickup,
			nearby.map((d) => ({ driverId: d.driverId, lat: d.lat, lng: d.lng }))
		);

		const scored: Candidate[] = [];

		for (const driver of nearby) {
			const etaSec = etas.get(driver.driverId);
			if (etaSec === undefined) continue; // unroutable, e.g. wrong side of a river

			const [acceptance, idle, declined] = await Promise.all([
				this.stats.acceptanceRate(driver.driverId),
				this.stats.idleMinutes(driver.driverId),
				this.stats.recentlyDeclined(driver.driverId, req.riderId)
			]);

			const etaTerm = Math.exp(-etaSec / 240);
			const idleTerm = Math.min(idle, 30) / 30;

			const score = 0.55 * etaTerm + 0.2 * acceptance + 0.2 * idleTerm - (declined ? 0.5 : 0);

			scored.push({ ...driver, etaSec, score });
		}

		scored.sort((a, b) => b.score - a.score);
		return scored;
	}

	private async claim(region: string, driverId: string, tripId: string): Promise<number> {
		const result = (await this.redis.evalsha(
			this.claimSha,
			2,
			driverKey(region, driverId),
			claimsKey(region),
			tripId,
			String(Date.now()),
			String(CLAIM_LEASE_MS),
			driverId
		)) as number;
		return Number(result);
	}

	private async release(
		region: string,
		driverId: string,
		tripId: string,
		fence: number,
		to: 'available' | 'offline'
	): Promise<boolean> {
		const result = (await this.redis.evalsha(
			this.releaseSha,
			2,
			driverKey(region, driverId),
			claimsKey(region),
			tripId,
			String(fence),
			to,
			driverId
		)) as number;
		return Number(result) === 1;
	}

	private async confirm(
		region: string,
		driverId: string,
		tripId: string,
		fence: number
	): Promise<boolean> {
		const result = (await this.redis.evalsha(
			this.confirmSha,
			2,
			driverKey(region, driverId),
			claimsKey(region),
			tripId,
			String(fence),
			String(Date.now()),
			driverId
		)) as number;
		return Number(result) === 1;
	}

	/**
	 * A dispatch worker can die holding claims. The lease is what makes that
	 * survivable; this loop is what makes the lease mean something.
	 */
	async reclaimExpiredClaims(region: string): Promise<number> {
		const now = Date.now();
		const expired = await this.redis.zrangebyscore(claimsKey(region), '-inf', now);
		if (expired.length === 0) return 0;

		const pipe = this.redis.pipeline();
		for (const driverId of expired) {
			const key = driverKey(region, driverId);
			// Bump the fence so any in-flight accept for the old claim is dead.
			pipe.hincrby(key, 'fence', 1);
			pipe.hset(key, 'status', 'available');
			pipe.hdel(key, 'claimTrip', 'claimUntil');
			pipe.zrem(claimsKey(region), driverId);
		}
		await pipe.exec();

		console.warn(`[dispatch] reclaimed ${expired.length} expired claims region=${region}`);
		return expired.length;
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package dispatch

import (
	"context"
	"log"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"baghdad.internal/ride/geo"
)

// --- Configuration ---
const (
	claimLease      = 15 * time.Second // must outlive the offer window
	offerWindow     = 12 * time.Second // what the driver sees on screen
	maxAttempts     = 8
	candidateLimit  = 30
)

var searchRadiiKm = []float64{2, 4, 7} // widened only when nothing is found

type RideRequest struct {
	TripID        string
	RiderID       string
	Region        string
	PickupLat     float64
	PickupLng     float64
	DropoffLat    float64
	DropoffLng    float64
	VehicleClass  string
	QuoteID       string
	RequestedAtMS int64
}

type Candidate struct {
	geo.NearbyDriver
	ETASec float64
	Score  float64
}

type OfferKind string

const (
	OfferAccepted      OfferKind = "accepted"
	OfferDeclined      OfferKind = "declined"
	OfferTimeout       OfferKind = "timeout"
	OfferUndeliverable OfferKind = "undeliverable"
)

type Assignment struct {
	TripID   string
	DriverID string
	Fence    int64
	ETASec   float64
}

type Offer struct {
	TripID      string
	Fence       int64
	ETASec      float64
	ExpiresAtMS int64
}

type ETAService interface {
	// BatchETA is one call for all candidates, never one call per candidate.
	BatchETA(ctx context.Context, fromLat, fromLng float64, drivers []geo.NearbyDriver) (map[string]float64, error)
}

type DriverStats interface {
	AcceptanceRate(ctx context.Context, driverID string) (float64, error)
	IdleMinutes(ctx context.Context, driverID string) (float64, error)
	RecentlyDeclined(ctx context.Context, driverID, riderID string) (bool, error)
}

type OfferChannel interface {
	Send(ctx context.Context, driverID string, offer Offer, timeout time.Duration) (OfferKind, error)
}

type TripStore interface {
	// Transition is guarded; false means the trip was no longer in `from`.
	Transition(ctx context.Context, tripID string, from []string, to string, patch map[string]any) (bool, error)
}

type EventBus interface {
	Publish(ctx context.Context, topic string, event map[string]any) error
}

// --- Lua: claim a driver, atomically, with a lease and a fence -------------
var claimDriver = redis.NewScript(`
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local now   = tonumber(ARGV[2])
local lease = tonumber(ARGV[3])
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'status') ~= 'available' then return 0 end

local until_ms = tonumber(redis.call('HGET', key, 'claimUntil') or '0')
if until_ms > now then return 0 end

-- The fence only ever moves forward, so a stale holder can never win again.
local fence = redis.call('HINCRBY', key, 'fence', 1)
redis.call('HSET', key,
  'status', 'offered',
  'claimTrip', trip,
  'claimUntil', now + lease)
redis.call('ZADD', zkey, now + lease, id)
return fence
`)

// --- Lua: release a claim, but only if it is still ours --------------------
var releaseDriver = redis.NewScript(`
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local fence = tonumber(ARGV[2])
local to    = ARGV[3]
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'claimTrip') ~= trip then return 0 end
if tonumber(redis.call('HGET', key, 'fence') or '0') ~= fence then return 0 end

redis.call('HSET', key, 'status', to)
redis.call('HDEL', key, 'claimTrip', 'claimUntil')
redis.call('ZREM', zkey, id)
return 1
`)

// --- Lua: confirm an accepted offer, fence-checked -------------------------
var confirmDriver = redis.NewScript(`
local key   = KEYS[1]
local zkey  = KEYS[2]
local trip  = ARGV[1]
local fence = tonumber(ARGV[2])
local now   = tonumber(ARGV[3])
local id    = ARGV[4]

if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'claimTrip') ~= trip then return 0 end
if tonumber(redis.call('HGET', key, 'fence') or '0') ~= fence then return 0 end
if tonumber(redis.call('HGET', key, 'claimUntil') or '0') <= now then return 0 end

redis.call('HSET', key, 'status', 'on_trip', 'tripId', trip)
redis.call('HDEL', key, 'claimTrip', 'claimUntil')
redis.call('ZREM', zkey, id)
return 1
`)

func claimsKey(region string) string {
	return "claims:{" + region + "}"
}

type Service struct {
	rdb    redis.UniversalClient
	geo    *geo.Index
	eta    ETAService
	stats  DriverStats
	offers OfferChannel
	trips  TripStore
	bus    EventBus
}

func NewService(rdb redis.UniversalClient, ix *geo.Index, eta ETAService,
	stats DriverStats, offers OfferChannel, trips TripStore, bus EventBus) *Service {
	return &Service{rdb: rdb, geo: ix, eta: eta, stats: stats, offers: offers, trips: trips, bus: bus}
}

// Dispatch runs the whole loop for one ride request. A nil assignment means
// nobody took the trip; the caller decides whether to re-queue or give up.
func (s *Service) Dispatch(ctx context.Context, req RideRequest) (*Assignment, error) {
	candidates, err := s.buildCandidates(ctx, req)
	if err != nil {
		return nil, err
	}

	if len(candidates) == 0 {
		_, _ = s.trips.Transition(ctx, req.TripID, []string{"matching"}, "no_drivers",
			map[string]any{"reason": "empty_candidate_set"})
		return nil, nil
	}

	attempts := 0

	for _, c := range candidates {
		if attempts >= maxAttempts {
			break
		}

		// 1. Claim first, offer second. This is the whole race fix.
		fence, err := s.claim(ctx, req.Region, c.DriverID, req.TripID)
		if err != nil {
			return nil, err
		}
		if fence == 0 {
			// Somebody else got there first. Not an error, just the next name.
			log.Printf("[dispatch] claim lost trip=%s driver=%s", req.TripID, c.DriverID)
			continue
		}

		attempts++

		// 2. Record the offer on the trip. If the rider cancelled while we
		//    were choosing, this fails and we must hand the driver back.
		moved, err := s.trips.Transition(ctx, req.TripID,
			[]string{"matching", "offered"}, "offered", map[string]any{
				"driverId":    c.DriverID,
				"fence":       fence,
				"etaSec":      c.ETASec,
				"offeredAtMs": time.Now().UnixMilli(),
			})
		if err != nil {
			return nil, err
		}
		if !moved {
			_, _ = s.release(ctx, req.Region, c.DriverID, req.TripID, fence, "available")
			log.Printf("[dispatch] trip=%s left matching state, aborting", req.TripID)
			return nil, nil
		}

		// 3. Ask the driver. The only slow step, and it is bounded.
		outcome, err := s.offers.Send(ctx, c.DriverID, Offer{
			TripID:      req.TripID,
			Fence:       fence,
			ETASec:      c.ETASec,
			ExpiresAtMS: time.Now().Add(offerWindow).UnixMilli(),
		}, offerWindow)

		if err != nil || outcome != OfferAccepted {
			_, _ = s.release(ctx, req.Region, c.DriverID, req.TripID, fence, "available")
			reason := string(outcome)
			if err != nil {
				reason = "transport_error"
			}
			_ = s.bus.Publish(ctx, "dispatch.offer_rejected", map[string]any{
				"tripId": req.TripID, "driverId": c.DriverID, "reason": reason,
			})
			continue
		}

		// 4. Confirm under the same fence. A late accept from an expired claim
		//    dies here instead of double-booking the driver.
		confirmed, err := s.confirm(ctx, req.Region, c.DriverID, req.TripID, fence)
		if err != nil {
			return nil, err
		}
		if !confirmed {
			log.Printf("[dispatch] stale accept trip=%s driver=%s fence=%d",
				req.TripID, c.DriverID, fence)
			continue
		}

		accepted, err := s.trips.Transition(ctx, req.TripID, []string{"offered"}, "accepted",
			map[string]any{
				"driverId":     c.DriverID,
				"fence":        fence,
				"acceptedAtMs": time.Now().UnixMilli(),
			})
		if err != nil {
			return nil, err
		}
		if !accepted {
			// Trip was cancelled between offer and accept: undo cleanly.
			_, _ = s.release(ctx, req.Region, c.DriverID, req.TripID, fence, "available")
			return nil, nil
		}

		_ = s.bus.Publish(ctx, "trip.accepted", map[string]any{
			"tripId": req.TripID, "riderId": req.RiderID,
			"driverId": c.DriverID, "region": req.Region, "etaSec": c.ETASec,
		})

		log.Printf("[dispatch] matched trip=%s driver=%s attempts=%d",
			req.TripID, c.DriverID, attempts)

		return &Assignment{TripID: req.TripID, DriverID: c.DriverID, Fence: fence, ETASec: c.ETASec}, nil
	}

	_, _ = s.trips.Transition(ctx, req.TripID, []string{"matching", "offered"}, "no_drivers",
		map[string]any{"reason": "all_candidates_exhausted", "attempts": attempts})
	return nil, nil
}

// buildCandidates is cheap recall followed by expensive precision.
func (s *Service) buildCandidates(ctx context.Context, req RideRequest) ([]Candidate, error) {
	var nearby []geo.NearbyDriver

	// Widen only when the narrow ring came up empty; a wide default would
	// burn ETA budget on drivers nobody wants.
	for _, radius := range searchRadiiKm {
		found, err := s.geo.Nearby(ctx, req.Region, req.PickupLat, req.PickupLng, geo.NearbyOptions{
			RadiusKm:       radius,
			Limit:          candidateLimit,
			Status:         geo.StatusAvailable,
			VehicleClasses: []string{req.VehicleClass},
		})
		if err != nil {
			return nil, err
		}
		nearby = found
		if len(nearby) >= 5 {
			break
		}
	}

	if len(nearby) == 0 {
		return nil, nil
	}

	etas, err := s.eta.BatchETA(ctx, req.PickupLat, req.PickupLng, nearby)
	if err != nil {
		return nil, err
	}

	scored := make([]Candidate, 0, len(nearby))

	for _, d := range nearby {
		etaSec, ok := etas[d.DriverID]
		if !ok {
			continue // unroutable, e.g. wrong side of a river
		}

		acceptance, err := s.stats.AcceptanceRate(ctx, d.DriverID)
		if err != nil {
			return nil, err
		}
		idle, err := s.stats.IdleMinutes(ctx, d.DriverID)
		if err != nil {
			return nil, err
		}
		declined, err := s.stats.RecentlyDeclined(ctx, d.DriverID, req.RiderID)
		if err != nil {
			return nil, err
		}

		etaTerm := math.Exp(-etaSec / 240)
		idleTerm := math.Min(idle, 30) / 30

		score := 0.55*etaTerm + 0.20*acceptance + 0.20*idleTerm
		if declined {
			score -= 0.5
		}

		scored = append(scored, Candidate{NearbyDriver: d, ETASec: etaSec, Score: score})
	}

	sort.Slice(scored, func(i, j int) bool { return scored[i].Score > scored[j].Score })
	return scored, nil
}

func (s *Service) claim(ctx context.Context, region, driverID, tripID string) (int64, error) {
	return claimDriver.Run(ctx, s.rdb,
		[]string{geo.DriverKey(region, driverID), claimsKey(region)},
		tripID, time.Now().UnixMilli(), claimLease.Milliseconds(), driverID,
	).Int64()
}

func (s *Service) release(ctx context.Context, region, driverID, tripID string, fence int64, to string) (bool, error) {
	n, err := releaseDriver.Run(ctx, s.rdb,
		[]string{geo.DriverKey(region, driverID), claimsKey(region)},
		tripID, fence, to, driverID,
	).Int64()
	return n == 1, err
}

func (s *Service) confirm(ctx context.Context, region, driverID, tripID string, fence int64) (bool, error) {
	n, err := confirmDriver.Run(ctx, s.rdb,
		[]string{geo.DriverKey(region, driverID), claimsKey(region)},
		tripID, fence, time.Now().UnixMilli(), driverID,
	).Int64()
	return n == 1, err
}

// ReclaimExpiredClaims makes the lease mean something. A dispatch worker can
// die holding claims; without this loop those drivers are lost for the day.
func (s *Service) ReclaimExpiredClaims(ctx context.Context, region string) (int, error) {
	now := time.Now().UnixMilli()

	expired, err := s.rdb.ZRangeByScore(ctx, claimsKey(region), &redis.ZRangeBy{
		Min: "-inf",
		Max: strconv.FormatInt(now, 10),
	}).Result()
	if err != nil || len(expired) == 0 {
		return 0, err
	}

	pipe := s.rdb.Pipeline()
	for _, driverID := range expired {
		key := geo.DriverKey(region, driverID)
		// Bump the fence so any in-flight accept for the old claim is dead.
		pipe.HIncrBy(ctx, key, "fence", 1)
		pipe.HSet(ctx, key, "status", "available")
		pipe.HDel(ctx, key, "claimTrip", "claimUntil")
		pipe.ZRem(ctx, claimsKey(region), driverID)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}

	log.Printf("[dispatch] reclaimed %d expired claims region=%s", len(expired), region)
	return len(expired), nil
}
```

</div>
</CodeTabs>

### এই কোডে যে সিদ্ধান্তগুলো গুরুত্বপূর্ণ

**Claim আগে, অফার পরে।** পুরো race fix-টা এই ক্রমটাতেই। উল্টো করলে — আগে অফার, accept এলে claim — দুজন চালকের ফোনে দুটো স্ক্রিন আসবে আর একজন হারবে _সিদ্ধান্ত নেওয়ার পরে_, যেটা অনেক বেশি বিরক্তিকর।

**হেরে যাওয়া একটা স্বাভাবিক ফলাফল, error নয়।** `fence === 0` হলে কোনো exception নেই, কোনো retry নেই, কোনো backoff নেই — শুধু `continue`। উনিশ নম্বর চ্যাপ্টারের retry storm-এর যুক্তিটা এখানে ভেতর থেকেই প্রয়োগ হচ্ছে: **যে ব্যর্থতা retry করলে ঠিক হবে না, সেটা retry করবেন না**।

**Claim-এর মেয়াদ অফারের জানালার চেয়ে বড়।** `CLAIM_LEASE_MS` ১৫ সেকেন্ড, `OFFER_WINDOW_MS` ১২ সেকেন্ড। উল্টো হলে চালক accept করার আগেই claim ফুরিয়ে যাবে আর তার accept প্রত্যাখ্যাত হবে — একদম নিখুঁতভাবে কাজ করা একটা সিস্টেম যেটা কাউকে কখনো ভাড়া দেয় না।

**Reaper fence বাড়ায়, শুধু status বদলায় না।** এটাই সূক্ষ্ম অংশ। মেয়াদ ফুরোনো claim ছেড়ে দেওয়ার সময় counter এগিয়ে না দিলে, পুরনো worker-এর দেরিতে পৌঁছানো `confirm` কলটা এখনও মিলে যাবে আর একজন চালককে দুই ট্রিপে বসিয়ে দেবে। **fencing token-এর পুরো মূল্যটাই এই এক লাইনে** — পনেরো নম্বর চ্যাপ্টারের ঠিক সেই শিক্ষা।

**ব্যাসার্ধ ধাপে ধাপে বাড়ে।** শুরুতেই ৭ কিমি খুঁজলে ব্যস্ত এলাকায় ৩০ জনের বদলে ৩০০ জন candidate আসবে, ETA সার্ভিসে অকারণ চাপ পড়বে, আর ফলাফল একই হবে। **সংকীর্ণভাবে শুরু করে দরকার হলে প্রসারিত করা** — এটা geospatial সিস্টেমের সবচেয়ে সাধারণ latency অপটিমাইজেশন।

<Callout type="warning">

একটা ফাঁদ যেটা প্রোডাকশনে দেরিতে ধরা পড়ে: `MAX_ATTEMPTS` বেশি রাখলে dispatch একটা রিকোয়েস্টে ৮ x ১২ = ৯৬ সেকেন্ড আটকে থাকতে পারে, আর ততক্ষণে যাত্রী অ্যাপ বন্ধ করে ফেলেছে। তাই পুরো dispatch-এর একটা **সামগ্রিক deadline** থাকতে হবে (যেমন ৪৫ সেকেন্ড), candidate-প্রতি timeout ছাড়াও। উনিশ নম্বর চ্যাপ্টারের deadline propagation-এর ধারণাটা এখানে হুবহু প্রযোজ্য: ব্যবহারকারীর ধৈর্যই আসল বাজেট, আর ভেতরের প্রতিটা ধাপ সেই বাজেট থেকে খরচ করছে।

</Callout>

## ধাপ ৯: ট্রিপের জীবনচক্র একটা state machine হিসেবে

উপরের কোডে `trips.transition(...)` বারবার এসেছে, আর প্রতিবার সে বলেছে "এই অবস্থাগুলোর কোনো একটা থেকে ওই অবস্থায় যাও"। এখন সেই যন্ত্রটা খুলে দেখি — কারণ এটাই এই সিস্টেমের একমাত্র জায়গা যেখানে সত্য জমা থাকে।

একটা ট্রিপ ডেটাবেসের সারি নয়, একটা **প্রক্রিয়া**। তার সাথে টাকা জড়িত, একজন মানুষের নিরাপত্তা জড়িত, আর সে পাঁচটা আলাদা সার্ভিসের ঘটনায় প্রতিক্রিয়া দেখায়। এরকম জিনিস `status` নামের একটা string কলাম দিয়ে চালানোর চেষ্টাই প্রোডাকশনে সবচেয়ে বেশি রহস্যময় বাগের উৎস — কারণ কোথাও লেখা থাকে না **কোন অবস্থা থেকে কোন অবস্থায় যাওয়া বৈধ**, আর ফলে প্রতিটা সার্ভিস নিজের মতো করে status বসিয়ে দেয়।

<Mermaid
title="Trip lifecycle state machine"
code={`stateDiagram-v2
  [*] --> quoted
  quoted --> matching: rider confirms
  quoted --> expired: quote TTL passed
  matching --> offered: driver claimed
  offered --> matching: declined or timed out
  offered --> accepted: driver accepted
  matching --> no_drivers: candidates exhausted
  accepted --> arriving: driver moving to pickup
  arriving --> arrived: driver at pickup
  arrived --> in_progress: rider on board
  in_progress --> completed: dropoff reached
  completed --> settled: fare charged
  completed --> unsettled: charge failed
  matching --> cancelled_rider: rider cancels
  offered --> cancelled_rider: rider cancels
  accepted --> cancelled_rider: rider cancels
  arriving --> cancelled_rider: rider cancels
  arrived --> cancelled_rider: rider cancels
  accepted --> cancelled_driver: driver cancels
  arriving --> cancelled_driver: driver cancels
  no_drivers --> [*]
  expired --> [*]
  settled --> [*]
  unsettled --> [*]
  cancelled_rider --> [*]
  cancelled_driver --> [*]`}
/>

ছবিটার কয়েকটা জায়গা ইচ্ছাকৃত, আর সেগুলোই আসল শিক্ষা।

**`offered` থেকে `matching`-এ ফেরার তীরটা।** চালক না নিলে ট্রিপ ব্যর্থ হয় না, সে আগের অবস্থায় ফিরে যায় আর dispatch পরের candidate ধরে। এই একটা তীর না থাকলে প্রতিটা decline একটা ব্যর্থ ট্রিপ হতো।

**`in_progress` থেকে বাতিলের কোনো তীর নেই।** যাত্রী গাড়িতে উঠে গেলে "বাতিল" ধারণাটাই অর্থহীন — যা হতে পারে তা হলো ট্রিপ শেষ হওয়া, হয়তো অন্য জায়গায়। এটা প্রোডাক্টের সিদ্ধান্ত, কিন্তু state machine-এ লেখা থাকলে কেউ ভুল করে বাতিল করতে পারে না।

**`completed` আর `settled` আলাদা।** এটাই এই ডায়াগ্রামের সবচেয়ে গুরুত্বপূর্ণ অংশ, আর ধাপ ১১-তে আমরা এটাতে ফিরব: **ট্রিপ শেষ হওয়া টাকা আদায় হওয়ার উপর নির্ভরশীল নয়**।

প্রতিটা transition তিনটে কাজ করে, আর তিনটেই একই লেনদেনে:

```typescript
// Trip state machine: the transition table is the specification.
const ALLOWED: Record<string, string[]> = {
	quoted: ['matching', 'expired'],
	matching: ['offered', 'no_drivers', 'cancelled_rider'],
	offered: ['accepted', 'matching', 'cancelled_rider'],
	accepted: ['arriving', 'cancelled_rider', 'cancelled_driver'],
	arriving: ['arrived', 'cancelled_rider', 'cancelled_driver'],
	arrived: ['in_progress', 'cancelled_rider'],
	in_progress: ['completed'],
	completed: ['settled', 'unsettled'],
	// terminal states have no outgoing edges at all
	settled: [],
	unsettled: [],
	no_drivers: [],
	expired: [],
	cancelled_rider: [],
	cancelled_driver: []
};

async function transition(
	tripId: string,
	from: string[],
	to: string,
	patch: Record<string, unknown>,
	idempotencyKey: string
): Promise<boolean> {
	return db.tx(async (tx) => {
		const trip = await tx.one('SELECT state, version FROM trips WHERE trip_id = $1 FOR UPDATE', [
			tripId
		]);

		// 1. Idempotency: the same transition replayed is a no-op, not an error.
		const seen = await tx.maybeOne(
			'SELECT 1 FROM trip_events WHERE trip_id = $1 AND idempotency_key = $2',
			[tripId, idempotencyKey]
		);
		if (seen) return true;

		// 2. Guard: is this edge in the graph, and are we where we think we are?
		if (!from.includes(trip.state)) return false;
		if (!ALLOWED[trip.state].includes(to)) {
			throw new Error(`illegal transition ${trip.state} -> ${to} for trip ${tripId}`);
		}

		// 3. Append the event, then move the projection. Never the other way.
		await tx.none(
			`INSERT INTO trip_events (trip_id, seq, from_state, to_state, payload, idempotency_key, at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
			[tripId, trip.version + 1, trip.state, to, patch, idempotencyKey]
		);

		await tx.none('UPDATE trips SET state = $1, version = version + 1 WHERE trip_id = $2', [
			to,
			tripId
		]);

		return true;
	});
}
```

তিনটে জিনিস আলাদা করে বলার মতো।

**Transition টেবিলটাই স্পেসিফিকেশন।** কোন পথ বৈধ সেটা একটা জায়গায় লেখা, ডকুমেন্টে নয়, কোডে। নতুন একটা অবস্থা যোগ করতে হলে টেবিলটা বদলাতে হয়, আর তখন সব পথ একসাথে চোখের সামনে থাকে।

**Idempotency key প্রতিটা transition-এ।** ষোলো ও উনিশ নম্বর চ্যাপ্টারের শিক্ষা: distributed সিস্টেমে প্রতিটা বার্তা অন্তত একবার আসবে, মানে কখনো কখনো দুবার আসবে। চালক অ্যাপে "যাত্রী উঠেছে" বাটনে দুবার চাপ দিলে বা নেটওয়ার্ক retry করলে দ্বিতীয়বার যেন কিছু না ঘটে। লক্ষ করুন পুনরাবৃত্তি `true` ফেরত দেয়, `false` নয় — কারণ কাজটা তো হয়েই আছে।

**Event আগে, projection পরে।** `trip_events` টেবিলটা append-only আর সেটাই সত্য; `trips` টেবিলের `state` কলামটা শুধু দ্রুত পড়ার জন্য একটা projection। ষোলো নম্বর চ্যাপ্টারের CQRS-এর ধারণাটা এখানে ক্ষুদ্র আকারে — আর এর ব্যবহারিক ফল হলো, কোনো ট্রিপ নিয়ে বিরোধ হলে আপনি ঠিক বলতে পারবেন কখন কী ঘটেছিল, কোন ক্রমে।

<Callout type="tip">

ট্রিপের event log-টা শুধু ডিবাগিংয়ের জিনিস নয়, এটা ব্যবসারও জিনিস। "চালক ৭ মিনিট অপেক্ষা করেছে" থেকে অপেক্ষার চার্জ, "যাত্রী accept-এর ৯০ সেকেন্ড পরে বাতিল করেছে" থেকে বাতিলের ফি, আর "arrived থেকে in_progress-এ ১২ মিনিট" থেকে একটা নিরাপত্তা সংকেত — সবই ওই একই লগ থেকে বেরোয়। **যে সিস্টেমে ঘটনার ক্রমটাই পণ্য, সেখানে event log রাখা বিলাসিতা নয়।**

</Callout>

## ধাপ ১০: দুই পক্ষের কাছে রিয়েল-টাইম আপডেট

ট্রিপ চলাকালীন দুই পক্ষকেই খবর পাঠাতে হয়, কিন্তু তাদের চাহিদা এক নয় — আর ঠিক এই অসমতাটাই transport-এর ডিজাইন ঠিক করে দেয়।

| বার্তা                 | কার কাছে | কত দ্রুত           | হারালে কী হয়                         |
| ---------------------- | -------- | ------------------ | ------------------------------------- |
| রাইডের অফার            | চালক     | p99 &lt; ১ সেকেন্ড | ভাড়া হাতছাড়া, dispatch পিছিয়ে যায় |
| ট্রিপের state পরিবর্তন | দুজনেই   | &lt; ১ সেকেন্ড     | ভুল স্ক্রিন, ফোন করাফুরি              |
| চালকের চলমান অবস্থান   | যাত্রী   | ৩–৫ সেকেন্ড চলে    | মার্কার একটু লাফায়, কেউ মরে না       |
| ETA হালনাগাদ           | যাত্রী   | ১০–২০ সেকেন্ড চলে  | কিছুই না                              |
| Surge-এর মানচিত্র      | চালক     | ১–২ মিনিট চলে      | কিছুই না                              |

**প্রথম দুটো সারি আর শেষ তিনটে সারি সম্পূর্ণ ভিন্ন জাতের জিনিস।** উপরের দুটো হলো **command** — এগুলো পৌঁছাতেই হবে, ক্রম বজায় রাখতে হবে, আর না পৌঁছালে ব্যবসায়িক ক্ষতি। নিচের তিনটে হলো **state broadcast** — শেষ মানটাই একমাত্র মান, মাঝেরগুলো হারালে কেউ টের পায় না।

তাই দুটো আলাদা চ্যানেল:

**Command channel (অফার, state পরিবর্তন):** নিশ্চিত ডেলিভারি, ক্রমসহ, আর acknowledgement। ডিভাইস সংযুক্ত না থাকলে fallback হিসেবে push notification, আর সেটাও ব্যর্থ হলে অফারের জানালা তাৎক্ষণিকভাবে বাতিল করে পরের candidate-এ যাওয়া (`undeliverable` — কোডে এই ফলাফলটা আলাদা রাখার কারণ এটাই)।

**Broadcast channel (অবস্থান, ETA):** সর্বশেষ-মানই-যথেষ্ট, কোনো buffer নেই, কোনো replay নেই। সংযোগ ফিরলে বর্তমান অবস্থাটা একবারে পাঠিয়ে দেওয়া হয় — হারানো বার্তাগুলো ফেরত পাঠানোর কোনো মানে নেই।

<Mermaid
title="Realtime delivery paths"
code={`graph LR
  TRIP["Trip service"] -->|state change| PUB["Pub/sub per trip"]
  DISP["Dispatch"] -->|offer, must arrive| PUB
  LI["Location ingest"] -->|position, latest wins| PUB
  PUB --> GW1["Gateway node 1"]
  PUB --> GW2["Gateway node 2"]
  GW1 --> RIDER["Rider Fatima al-Fihri"]
  GW2 --> DRIVER["Driver Ibn Rushd"]
  REG["Connection registry<br/>who is on which gateway"] --> PUB
  PUSH["Push notification"] --> DRIVER`}
/>

কয়েকটা ব্যবহারিক সিদ্ধান্ত:

**Connection registry-টা একটা ক্যাশ, সত্যের উৎস নয়।** `conn:{driverId} -> gateway-baghdad-07`, TTL ৬০ সেকেন্ড, প্রতিটা ping-এ নবায়ন। ভুল হলে বার্তা ভুল gateway-তে যাবে আর সেখানে বাদ পড়বে — তখন push notification fallback কাজ করবে। এটাকে strongly consistent বানানোর চেষ্টা করলে আপনি প্রতি সংযোগে একটা consensus কিনছেন, যেটা এই সমস্যার জন্য হাস্যকর দাম।

**Pub/sub-এর চ্যানেল ট্রিপ-প্রতি, ইউজার-প্রতি নয়।** একটা ট্রিপে দুই পক্ষ আর কয়েকটা সার্ভিস আগ্রহী, আর ট্রিপ শেষ হলে চ্যানেলটাও শেষ। ইউজার-প্রতি চ্যানেল করলে সেগুলো চিরকাল থাকে আর subscription পরিষ্কার করা একটা আলাদা সমস্যা হয়ে দাঁড়ায়।

**অবস্থানের মসৃণতা ক্লায়েন্টের কাজ, সার্ভারের নয়।** যাত্রীর মানচিত্রে গাড়ি মসৃণভাবে চলা উচিত, কিন্তু সেটার জন্য ping-এর হার বাড়ানো সবচেয়ে খারাপ সিদ্ধান্ত — ping ২ সেকেন্ডে নামালে ধাপ ২-এর সবচেয়ে বড় সংখ্যাটা দ্বিগুণ হয়ে যায়। বরং ৪ সেকেন্ডের পয়েন্টগুলোর মাঝখানটা ক্লায়েন্ট **interpolate** করে, আর heading ও speed পাঠানো হয় বলেই সেই অনুমান বিশ্বাসযোগ্য দেখায়। **UI-র মসৃণতার জন্য কখনো backend-এর প্রধান write rate বাড়াবেন না।**

**যাত্রীকে গাড়ির প্রকৃত অবস্থান দেখানো হয় শুধু accept-এর পরে।** তার আগে আশেপাশের গাড়ির যে মার্কারগুলো দেখা যায়, সেগুলো ইচ্ছাকৃতভাবে আসল নয় — ঘরের কেন্দ্র থেকে ছড়ানো, সংখ্যায় সীমিত। কারণ দুটো: একজন চালকের সরাসরি নজরদারি করা যায় এমন API রাখা নিরাপত্তার দিক থেকে বিপজ্জনক, আর প্রতিটা মানচিত্র খোলায় সঠিক অবস্থান পাঠানো মানে বিনা কারণে ট্রাফিক বহুগুণ বাড়ানো।

<Callout type="warning">

দুই লাখ persistent connection নিয়ে একটা কম আলোচিত বিপদ আছে: **reconnect storm**। একটা gateway node পড়ে গেলে তার ২০,০০০ সংযোগ একই মুহূর্তে পুনরায় সংযোগের চেষ্টা করবে, আর তারা সবাই একই সাথে auth, registry লেখা আর state sync চাইবে। উনিশ নম্বর চ্যাপ্টারের thundering herd-এর ওষুধটাই এখানে লাগে — ক্লায়েন্টে **jitter সহ backoff**, আর gateway-তে সংযোগ গ্রহণের হারে একটা সীমা। এটা না থাকলে একটা node-এর মৃত্যু পরের node-টাকেও মারবে, তারপর তার পরেরটাকে।

</Callout>

## ধাপ ১১: Surge pricing একটা feedback loop

এতক্ষণ পর্যন্ত সব উপাদানই ছিল **open loop** — ইনপুট এলো, আউটপুট গেল, ব্যস। Surge আলাদা, কারণ **তার নিজের আউটপুট ঘুরে এসে তার নিজের ইনপুট বদলে দেয়**। এটা সফটওয়্যার ইঞ্জিনিয়ারিংয়ের চেয়ে নিয়ন্ত্রণ তত্ত্বের সমস্যা, আর যারা সেটা বোঝেন না তাঁরা এমন একটা সিস্টেম বানান যা সারা সকাল দোলে।

মূল হিসাবটা সরল। প্রতিটা H3 res-7 ঘরের জন্য, প্রতি ৩০ সেকেন্ডের বালতিতে:

```
demand  = ওই ঘরে গত 2 মিনিটে আসা ride request সংখ্যা
supply  = ওই ঘরে এখন available চালকের সংখ্যা
ratio   = demand / max(supply, 1)

ratio < 1.0   → multiplier 1.0
ratio 1.0-2.0 → multiplier 1.2
ratio 2.0-3.5 → multiplier 1.5
ratio 3.5-5.0 → multiplier 2.0
ratio > 5.0   → multiplier 2.5   (কড়া উপরের সীমা)
```

`supply` আসে geo index থেকে (`supplyByCell`), `demand` আসে trip service-এর ঘটনাপ্রবাহ থেকে। দুটোই ইতিমধ্যে আছে, তাই surge engine-এর নিজস্ব কোনো ডেটা সংগ্রহ লাগে না — একই hex টাইলিং দুই কাজে ব্যবহার করার এটাই লভ্যাংশ।

কিন্তু কাঁচা এই হিসাবটা প্রয়োগ করলে যা ঘটে, সেটাই কারখ ঘাটের সেই সকাল:

<Mermaid
title="Surge as a feedback loop"
code={`graph LR
  D["Demand in cell"] --> R["Ratio demand over supply"]
  S["Supply in cell"] --> R
  R --> M["Multiplier"]
  M -->|price rises| DD["Some riders drop out"]
  M -->|earnings rise| SS["Drivers move in"]
  DD -->|lowers| D
  SS -->|raises| S
  LAG["Delay: drivers take minutes to arrive"] --> SS`}
/>

লুপের প্রতিটা তীর কাজ করছে, আর তবু ফলাফল খারাপ — কারণ **`SS` তীরটায় কয়েক মিনিটের দেরি আছে**। মাল্টিপ্লায়ার বাড়ানোর ফল জোগানে পৌঁছাতে ৫–১০ মিনিট লাগে (চালককে গাড়ি চালিয়ে আসতে হয়), কিন্তু আপনি যদি প্রতি ৩০ সেকেন্ডে সিদ্ধান্ত নেন, তাহলে ফল দেখার আগেই আপনি আরও বিশবার সিদ্ধান্ত নিয়ে ফেলেছেন। **দেরিসহ লুপে দ্রুত প্রতিক্রিয়া মানেই দোলা।**

পাঁচটা damping কৌশল, আর পাঁচটাই দরকার:

**এক: EWMA smoothing।** কাঁচা ratio-টা ব্যবহার না করে তার একটা exponentially weighted গড় নিন, ৫ মিনিটের half-life-সহ। এতে একটা বিয়েবাড়ি বা একটা সিগন্যাল-জ্যামের ক্ষণিক ঝাঁকুনি দামে প্রতিফলিত হয় না।

**দুই: Hysteresis।** উপরে ওঠার সীমা আর নিচে নামার সীমা আলাদা রাখুন — যেমন ২.০x-এ উঠতে ratio ৩.৫ লাগে, কিন্তু ২.০x থেকে নামতে ratio ২.৮-এর নিচে যেতে হবে। এই ফাঁকটাই সীমানার ঠিক আশেপাশে দাম ওঠানামা করা বন্ধ করে।

**তিন: প্রতি ধাপে সর্বোচ্চ পরিবর্তনের সীমা।** এক আপডেটে ০.৩x-এর বেশি নড়বে না। ২.৫x-এ পৌঁছাতে কয়েক মিনিট লাগবে, আর সেটাই কাম্য।

**চার: ন্যূনতম স্থিতিকাল।** একটা মাল্টিপ্লায়ার বসানোর পর অন্তত ২ মিনিট সেটা বহাল থাকবে। এটা লুপের নমুনা-হারকে প্রতিক্রিয়ার দেরির কাছাকাছি নিয়ে আসে, যেটাই আসল ওষুধ।

**পাঁচ: স্থানিক মসৃণকরণ।** একটা ঘরের মাল্টিপ্লায়ার তার প্রতিবেশী ঘরগুলোর সাথে গড় করা হয় (k-ring 1)। নইলে রাস্তার এপারে ২.৫x আর ওপারে ১.০x — আর যাত্রীরা ৫০ মিটার হেঁটে সীমানা পেরিয়ে গিয়ে সস্তা রাইড ডাকে, যা আপনার demand সংকেতকেই মিথ্যা বানিয়ে দেয়। **মানুষ যখন আপনার সীমানা দেখে ফেলে, তখন তারা সীমানাটাকে খেলতে শুরু করে।**

```typescript
// Damped surge update for one cell. Everything here exists to slow the loop
// down to the speed at which the physical world can actually respond.
function nextMultiplier(cell: SurgeCellState, rawRatio: number, now: number): number {
	// 1. Smooth the input.
	const alpha = 1 - Math.exp(-UPDATE_INTERVAL_MS / EWMA_HALF_LIFE_MS);
	const ratio = cell.smoothedRatio + alpha * (rawRatio - cell.smoothedRatio);

	// 2. Refuse to move at all inside the dwell window.
	if (now - cell.changedAtMs < MIN_DWELL_MS) return cell.multiplier;

	// 3. Hysteresis: different thresholds for going up and coming down.
	const target = targetMultiplier(ratio, cell.multiplier);

	// 4. Rate limit the step.
	const delta = clamp(target - cell.multiplier, -MAX_STEP, MAX_STEP);

	// 5. Never above the cap, never below 1.0.
	return clamp(cell.multiplier + delta, 1.0, MAX_MULTIPLIER);
}
```

### Quote lock: যা বলা হয়েছে তাই দিতে হবে

যাত্রীকে ভাড়া দেখানো হয় রিকোয়েস্ট করার আগে। মাল্টিপ্লায়ার যদি এর পরে বদলায়, দুটো খারাপ পথ আছে — হয় যাত্রীকে বেশি চার্জ করা (বিশ্বাসভঙ্গ, এবং অনেক দেশে বেআইনি), নয়তো "দাম বদলে গেছে" বলে আবার নিশ্চিত করতে বলা (যা কেউ সহ্য করে না)।

সমাধান: **quote একটা স্বাক্ষরিত, মেয়াদযুক্ত টোকেন**।

```
quote = {
  quoteId, riderId, pickupCell, dropoffCell,
  baseFare, multiplier, currency,
  issuedAt, expiresAt: issuedAt + 120s
}
signature = HMAC(server_key, quote)
```

যাত্রী দুই মিনিটের মধ্যে নিশ্চিত করলে ওই দামই বলবৎ, মাল্টিপ্লায়ার যাই হোক। মেয়াদ পেরোলে নতুন quote লাগে। স্বাক্ষরটা দরকার কারণ quote-টা ক্লায়েন্টের হাতে ঘোরে, আর ক্লায়েন্টকে কখনো বিশ্বাস করা যায় না — বাইশ নম্বর চ্যাপ্টারে এই ধরনটাই বিস্তারিত আসবে।

<Callout type="warning">

Surge-এর সবচেয়ে বিপজ্জনক ব্যর্থতাটা technical নয়, দিকনির্দেশনার। ধরুন location pipeline পিছিয়ে পড়ল আর geo index-এ চালকদের পয়েন্ট বাসি হয়ে গেল। তখন `supply` দেখাবে প্রায় শূন্য, `ratio` লাফিয়ে উঠবে, আর surge engine বিশ্বস্তভাবে সারা শহরে ২.৫x বসিয়ে দেবে — যখন রাস্তায় আসলে যথেষ্ট গাড়ি আছে। এটা টাকার ক্ষতি নয়, এটা সংবাদের শিরোনাম।

তাই surge-এর ইনপুটে একটা **staleness যাচাই** বাধ্যতামূলক: জোগানের সংকেত ৯০ সেকেন্ডের বেশি পুরনো হলে মাল্টিপ্লায়ার **১.০-এ ধরে রাখুন**, সর্বোচ্চে নয়। উনিশ নম্বর চ্যাপ্টারের নিয়ম — ব্যর্থতার সময় সিস্টেম কোন দিকে হেলে পড়বে সেটা ডিজাইনের সিদ্ধান্ত, দুর্ঘটনা নয়।

</Callout>

## ধাপ ১২: পেমেন্টে হস্তান্তর

ট্রিপ শেষ। এখন টাকা। এখানে একটাই আসল প্রশ্ন, আর সেটার উত্তরে দুটো সম্পূর্ণ ভিন্ন সিস্টেম বেরিয়ে আসে: **টাকা আদায় না হলে ট্রিপ শেষ হবে কি?**

উত্তর: **হ্যাঁ, ট্রিপ শেষ হবে।** কারণ ট্রিপ শেষ হওয়াটা একটা ভৌত ঘটনা — যাত্রী নেমে গেছে, চালক পরের ভাড়ার জন্য মুক্ত। ওই মুক্তিটা একটা ব্যর্থ কার্ড লেনদেনের জন্য আটকে রাখা মানে একটা payment gateway-র outage-কে একটা **dispatch outage**-এ রূপান্তরিত করা। উনিশ নম্বর চ্যাপ্টারের bulkhead-এর যুক্তিটা হুবহু এখানে: দুটো ব্যবস্থার ব্যর্থতা এক প্রকোষ্ঠে থাকা চলবে না।

তাই হস্তান্তরটা সিঙ্ক্রোনাস কল নয়, একটা **event**, আর সেটা যায় ষোলো নম্বর চ্যাপ্টারের outbox দিয়ে:

```sql
-- Same transaction that writes the completion event writes the outbox row.
INSERT INTO trip_events (trip_id, seq, from_state, to_state, payload, ...)
VALUES ('trip-8821', 7, 'in_progress', 'completed', ...);

INSERT INTO outbox (topic, key, payload, created_at)
VALUES ('trip.completed', 'trip-8821',
        '{"tripId":"trip-8821","riderId":"rider-albiruni",
          "driverId":"driver-ibnrushd","distanceKm":7.4,
          "durationSec":1180,"baseFare":42.00,"multiplier":1.2,
          "currency":"USD","quoteId":"q-5512"}', now());
```

এরপরের গল্পটা চব্বিশ নম্বর চ্যাপ্টারের — double-entry ledger, exactly-once money movement, saga আর reconciliation। এখানে শুধু সীমানাটা ঠিক করে দেওয়াই যথেষ্ট, আর সীমানাটার চারটে নিয়ম:

**এক: `trip_id`-ই idempotency key।** এটা প্রাকৃতিকভাবে ইউনিক আর ব্যবসায়িকভাবে অর্থবহ, তাই আলাদা কোনো key বানানোর দরকার নেই। ইভেন্ট দুবার পৌঁছালে ledger দ্বিতীয়টা ফেলে দেবে।

**দুই: ট্রিপ শুরুতে pre-authorization, শেষে capture।** ট্রিপ শুরুর সময় একটা আনুমানিক অঙ্কের hold নেওয়া হয় — এটা এই ব্যবসার সবচেয়ে কার্যকর জালিয়াতি-প্রতিরোধ, কারণ কার্ড অচল হলে সেটা ট্রিপের আগেই ধরা পড়ে, ৭ কিলোমিটার পরে নয়।

**তিন: capture ব্যর্থ হলে ট্রিপ `unsettled`, `failed` নয়।** একটা বকেয়া রেকর্ড হয়, যাত্রী পরের রাইড চাওয়ার আগে সেটা মেটাতে বলা হয়, আর চালকের পাওনা প্ল্যাটফর্ম আগেই ledger-এ তুলে রাখে। **চালকের আয় যাত্রীর কার্ডের উপর নির্ভরশীল হওয়া উচিত নয়** — সেই ঝুঁকিটা প্ল্যাটফর্মের নেওয়ার কথা।

**চার: চালকের পাওনা একটা ledger entry, একটা payout নয়।** প্রতি ট্রিপে ব্যাংকে টাকা পাঠানো হয় না; ledger-এ জমা হয় আর সপ্তাহে একবার ব্যাচে payout যায়। এতে খরচ হাজার গুণ কমে আর সমন্বয় করাও সম্ভব হয়।

<Callout type="info">

লক্ষ করুন এই পুরো অংশটায় "payment API কল করলাম" বাক্যটা একবারও নেই। কারণ **ট্রিপ সিস্টেম পেমেন্ট সিস্টেমকে চেনে না** — সে শুধু একটা ঘটনা ঘোষণা করে। এতে পেমেন্টের প্রোভাইডার বদলানো, একাধিক প্রোভাইডার রাখা, বা দেশভেদে ভিন্ন নিয়ম চালানো — কোনোটাতেই ট্রিপ সিস্টেমের কোড ছুঁতে হয় না। ষোলো নম্বর চ্যাপ্টারের event-driven সীমানার এটাই ব্যবহারিক মূল্য।

</Callout>

## ধাপ ১৩: Regional partitioning, আর একটা region খারাপ হলে কী ভাঙে

এই সিস্টেমের একটা বিরল সৌভাগ্য আছে: **সমস্যাটা নিজেই ভৌগোলিকভাবে বিভাজিত।** সমরকন্দের একজন যাত্রীর জন্য ফেজের কোনো চালক কোনোদিন প্রার্থী হবে না। এই সত্যটা আমাদের একটা প্রায়-নিখুঁত shard key উপহার দেয়, যেটা বেশিরভাগ সিস্টেমে কষ্ট করে বানাতে হয়।

তাই **region-ই deployment unit, ডেটা unit, আর failure domain — তিনটেই একসাথে**:

| স্তর                        | ব্যাপ্তি            | কেন                                      |
| --------------------------- | ------------------- | ---------------------------------------- |
| Realtime gateway            | region              | সংযোগ ভৌগোলিকভাবে কাছে থাকা উচিত         |
| Location ingest + geo index | region              | key-গুলোতে ইতিমধ্যেই `{region}` hash tag |
| Dispatch                    | region              | candidate কখনো region ছাড়ায় না         |
| Surge engine                | region              | চাহিদা-জোগান স্থানীয় ঘটনা               |
| Trip store                  | region (হোম region) | ট্রিপ যেখানে শুরু, সেখানেই তার সত্য      |
| ETA / road network          | region বা বৃহত্তর   | কেবল-পঠন, ক্যাশেবল                       |
| ইউজার, চালকের কাগজ, ledger  | **গ্লোবাল**         | মানুষ শহর বদলায়, তাদের পরিচয় বদলায় না |

এই ভাগটাই সেই পরিচিত **control plane বনাম data plane** বিভাজন — গ্লোবাল ও ধীরে বদলানো জিনিস control plane-এ, আর দ্রুত ও স্থানীয় জিনিস data plane-এ। একুশ নম্বর চ্যাপ্টারে এই ধারণাটাই multi-region-এর প্রেক্ষিতে বিস্তারিত আসবে; এখানে যেটা গুরুত্বপূর্ণ সেটা হলো, **ভাগটা আমরা বেছে নিইনি — সমস্যাটা আমাদের দিয়েছে**, আর সেটা কাজে না লাগানোই হতো ভুল।

সীমান্তের শহরগুলোর জন্য একটা ছোট নিয়ম লাগে: প্রতিটা region তার সীমানার বাইরে কয়েক কিলোমিটার **buffer** পর্যন্ত চালক দেখতে পায়, আর সীমান্ত-ঘরগুলো দুটো region-এই index হয়। এতে সামান্য দ্বৈততা তৈরি হয়, কিন্তু বিকল্প — সীমানার এপারের যাত্রী ওপারের ৩০০ মিটার দূরের চালককে পায় না — অনেক খারাপ।

### একটা region যখন খারাপ হতে থাকে

এখন উনিশ নম্বর চ্যাপ্টারের প্রশ্নটা: **এটা ভাঙলে কী ভাঙে, আর কোন ক্রমে?** ভালো উত্তরটা একটা সিদ্ধান্তের তালিকা, একটা আশা নয়। আমাদের degradation ladder, সবচেয়ে সস্তা জিনিস আগে ছাড়া হয়:

**ধাপ ১ — Surge জমে যায়।** surge engine বন্ধ, শেষ পরিচিত মান বহাল, বা সংকেত বাসি হলে ১.০x। কেউ টের পায় না।

**ধাপ ২ — ETA আসন্ন হিসাবে নামে।** road-network সার্ভিস বাদ, সরলরেখার দূরত্ব x শহরের একটা সহগ। ETA কম নির্ভুল হয়, matching কিছুটা খারাপ হয়, কিন্তু চলে।

**ধাপ ৩ — Matching greedy-তে নামে।** batched solver বন্ধ, নিকটতম চালককে সরাসরি অফার। মোট অপেক্ষা ১০% বাড়ে, কিন্তু কোনো coordination লাগে না।

**ধাপ ৪ — নতুন রিকোয়েস্ট shed করা শুরু।** এখানেই কঠিন সিদ্ধান্ত। ৪০ সেকেন্ডের একটা স্পিনার দেখানোর চেয়ে সাথে সাথে "এই মুহূর্তে এই এলাকায় গাড়ি নেই" বলা ভালো — কারণ প্রথমটায় যাত্রী কিছুই করতে পারে না, দ্বিতীয়টায় সে হেঁটে বা অন্য উপায়ে যেতে পারে। উনিশ নম্বর চ্যাপ্টারের সেই বাক্য: **তাড়াতাড়ি "না" বলা দেরিতে "না" বলার চেয়ে সবার জন্যই ভালো।**

**ধাপ ৫ — চলমান ট্রিপ কখনো shed হয় না।** এটাই শেষ রেখা। যে ট্রিপ শুরু হয়ে গেছে সেটাকে শেষ হতেই হবে, এমনকি প্রায় সব সার্ভিস মরে গেলেও। এর জন্য ডিজাইনটা এভাবে করা:

- চালকের অ্যাপ ট্রিপের ঘটনাগুলো (arrived, started, completed) **স্থানীয়ভাবে জমা রাখে**, সার্ভার না থাকলেও ট্রিপ চালানো যায়
- ভাড়ার হিসাব ডিভাইসেই করা যায়, quote-এ locked মাল্টিপ্লায়ার আর জমানো দূরত্ব দিয়ে
- সংযোগ ফিরলে ঘটনাগুলো idempotency key সহ পাঠানো হয়, আর state machine সেগুলো ক্রমে প্রয়োগ করে
- geo index হারালে চলমান ট্রিপে কিছুই যায় আসে না, কারণ ট্রিপের চালক তো আগেই ঠিক হয়ে আছে

<Mermaid
title="Regional degradation ladder"
code={`graph TD
  H["Region healthy"] --> S1["1. Freeze surge"]
  S1 --> S2["2. Approximate ETA"]
  S2 --> S3["3. Greedy matching only"]
  S3 --> S4["4. Shed new requests"]
  S4 --> S5["5. In-progress trips continue<br/>offline capable"]
  S5 --> EV["Evacuate: route new demand<br/>to neighbouring region buffer"]`}
/>

শেষ ধাপটা লক্ষ করুন। region সম্পূর্ণ অচল হলে **নতুন চাহিদা প্রতিবেশী region-এর buffer-এ পাঠানো যায়** — কেবল সীমান্তের কাছাকাছি এলাকার জন্য, আর কম মানে। এটা পূর্ণ failover নয়, আংশিক উদ্ধার — কিন্তু একটা region-এর মৃত্যুতে ওই region-এর ১০০% বদলে ৭০% যাত্রা হারানোই লক্ষ্য।

<Callout type="warning">

region-প্রতি একটা leader (batched solver, surge engine) রাখার মানে হলো আপনি split-brain-এর ঝুঁকি কিনেছেন। দুটো নোড একসাথে নিজেকে সমরকন্দের dispatcher ভাবলে তারা **একই চালককে দুই ট্রিপে বসাবে** — অর্থাৎ ধাপ ৭-এর সেই race, শুধু এবার প্রক্রিয়া নয়, পুরো region-এর মাপে।

রক্ষাকবচটা একই: leader-এর কাছে একটা **lease** থাকবে যেটা নিয়মিত নবায়ন করতে হয়, আর প্রতিটা লেখায় একটা **fencing token** যাবে যেটা geo index যাচাই করবে। পুরনো leader ফিরে এসে লিখতে চাইলে তার token পিছিয়ে থাকবে আর লেখাটা প্রত্যাখ্যাত হবে। পনেরো নম্বর চ্যাপ্টারের এই যন্ত্রটা এখানে দুই স্তরে কাজ করছে — চালক-প্রতি claim-এ, আর region-প্রতি leadership-এ। **একই ধারণা, দুই মাপে।**

</Callout>

## ধাপ ১৪: ফেইলিওর মোড আর যা দেখে টের পাবেন

আঠারো নম্বর চ্যাপ্টারের নিয়ম — উপসর্গে alert করুন, কারণে নয়। এই সিস্টেমের SLI-গুলো হওয়া উচিত ব্যবহারকারীর অনুভূতির ভাষায়:

| SLI                   | লক্ষ্য                    | কেন এটাই                                         |
| --------------------- | ------------------------- | ------------------------------------------------ |
| Request থেকে accept   | p50 &lt; ৫s, p95 &lt; ২০s | যাত্রী ঠিক এটাই অনুভব করে                        |
| Match সাফল্যের হার    | &gt; ৯৭%                  | "গাড়ি নেই" সবচেয়ে দামি ব্যর্থতা                |
| অফার পৌঁছানোর latency | p99 &lt; ১s               | চালকের সিদ্ধান্তের বাজেট                         |
| Location pipeline lag | p99 &lt; ৩s               | সব matching-এর মানের মূল                         |
| Surge signal-এর বয়স  | &lt; ৯০s                  | এর বেশি হলে দাম মিথ্যা                           |
| Claim হারার হার       | &lt; ৫%                   | বাড়া মানে চালকের ঘাটতি বা dispatch-এ কাড়াকাড়ি |
| Double-booking        | **শূন্য**                 | এটা একটা correctness bug, একটা SLO নয়           |

আর ব্যর্থতাগুলো:

| ফেইলিওর                        | কী দেখা যায়                   | কী করবেন                                                                     |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| Geo index shard হারিয়ে গেল    | ওই এলাকায় candidate শূন্য     | কিছুই করার নেই — ৪ সেকেন্ডে নিজেই ভরে যাবে; ততক্ষণ ব্যাসার্ধ বাড়ান          |
| Location ingest পিছিয়ে পড়ল   | পয়েন্টের বয়স বাড়ছে          | `MAX_POINT_AGE` কড়া করুন, surge ১.০-এ আটকান, ingest স্কেল করুন              |
| ETA সার্ভিস ধীর                | dispatch-এ latency, match কমছে | circuit breaker, সরলরেখার আসন্ন হিসাবে নামুন                                 |
| Dispatch worker crash          | চালকরা `offered` অবস্থায় আটকা | lease মেয়াদে reaper তাদের ছেড়ে দেয় — এজন্যই lease                         |
| Claim হারার হার লাফ দিল        | একই চালক নিয়ে কাড়াকাড়ি      | চাহিদা জোগানের চেয়ে অনেক বেশি; ব্যাসার্ধ বাড়ান, surge কাজ করছে কি না দেখুন |
| Gateway node মারা গেল          | ২০,০০০ reconnect               | jitter সহ backoff, accept rate limit, অফারগুলো push-এ fallback               |
| Payment provider ডাউন          | capture ব্যর্থ                 | ট্রিপ `unsettled`-এ যাক, dispatch অক্ষত থাকুক                                |
| Region-এর leader হারানো        | batched matching বন্ধ          | greedy fallback, নতুন leader fencing token নিয়ে আসবে                        |
| GPS jitter (উঁচু দালানের মাঝে) | `moved` হার লাফাচ্ছে           | ক্লায়েন্টে smoothing, cell পরিবর্তনে ন্যূনতম স্থিতিকাল                      |

<Callout type="tip">

এই ড্যাশবোর্ডের সবচেয়ে কম আলোচিত কিন্তু সবচেয়ে ভবিষ্যদ্বাণীমূলক মেট্রিকটা হলো **claim হারার হার**। এটা একটা বিশুদ্ধ প্রতিযোগিতার সংকেত: বাড়া মানে একই চালকের জন্য একাধিক dispatch worker লড়ছে, অর্থাৎ ওই এলাকায় জোগান চাহিদার তুলনায় কমে গেছে। CPU বা latency কিছুই বলার আগেই এই সংখ্যাটা বলে দেয় বাজারটা টানটান হয়ে উঠছে — আর সেটাই surge, driver incentive আর সম্প্রসারণের সিদ্ধান্তের কাঁচামাল। **সবচেয়ে ভালো technical মেট্রিকগুলো প্রায়ই business মেট্রিকও।**

</Callout>

## ১৫ থেকে ১৯ — সিদ্ধান্তগুলো আসলে কোথা থেকে এলো

এই চ্যাপ্টারের প্রায় কোনো ধারণাই নতুন নয়। নতুন যেটা, সেটা হলো এতগুলো ধারণা একসাথে একটা সিস্টেমে বসানো — আর সেটাই advanced ব্যান্ডের আসল পরীক্ষা।

**অধ্যায় ১৫, Distributed Coordination** — চালকের claim-এ atomic compare-and-set, `claimUntil` হিসেবে **lease**, আর `fence` হিসেবে **fencing token**। ওই চ্যাপ্টারের সাবধানবাণীটা — মেয়াদহীন লক আর fencing ছাড়া লক দুটোই ভাঙে — এখানে হুবহু প্রয়োগ হয়েছে, দুবার: চালক-প্রতি claim-এ, আর region-প্রতি leader election-এ। আর ওই চ্যাপ্টারের সবচেয়ে বড় শিক্ষা — **coordination এড়ানোর সবচেয়ে ভালো উপায় ডেটাকে এমনভাবে ভাগ করা যাতে সেটা লাগেই না** — সেটাই driver-sticky ingest আর region-ভিত্তিক shard-এর ভিত্তি। পুরো সিস্টেমে coordination কেনা হয়েছে ঠিক **একটা** ফিল্ডের জন্য।

**অধ্যায় ১৬, Event-Driven ও CQRS** — ট্রিপের `trip_events` হলো append-only সত্য, আর `trips.state` তার projection। পেমেন্টে হস্তান্তর হয়েছে **outbox** দিয়ে, সিঙ্ক্রোনাস কলে নয়। আর `trip.accepted`, `trip.completed` ইভেন্টগুলো একই সাথে পেমেন্ট, analytics আর নোটিফিকেশনকে খাওয়াচ্ছে — কেউ কাউকে চেনে না।

**অধ্যায় ১৭, Search ও Ranking** — matching আসলে একটা ranking সমস্যা, শুধু নথির বদলে মানুষ। সেই দুই-ধাপের কাঠামোটাই ব্যবহার হয়েছে: সস্তা **candidate generation** (k-ring, সরলরেখা) তারপর দামি **scoring** (road ETA, acceptance rate, fairness)। আর ওই চ্যাপ্টারের সেই সতর্কতা — ranking-এর ওজনগুলো একটা প্রোডাক্ট নীতি, একটা গাণিতিক সত্য নয় — এখানে `idle_minutes`-এর ওজনে দেখা যায়, যা কয়েক মাস পরে জোগানের মানচিত্র বদলে দেয়।

**অধ্যায় ১৮, Observability ও SLO** — SLI-গুলো ব্যবহারকারীর ভাষায় লেখা (request থেকে accept, অফার পৌঁছানো), যন্ত্রের ভাষায় নয়। `moved` হার, location lag আর claim হারার হার — তিনটেই **leading indicator**, যেগুলো ব্যবহারকারী কিছু টের পাওয়ার আগেই সংকেত দেয়। আর double-booking-কে SLO-র বদলে correctness bug হিসেবে রাখা — কারণ কিছু জিনিসের জন্য error budget বলে কিছু হয় না।

**অধ্যায় ১৯, ব্যর্থতার জন্য ডিজাইন** — degradation ladder-টা পুরোটাই ওই চ্যাপ্টারের: surge জমিয়ে দেওয়া আর ETA আসন্ন করা হলো **graceful degradation**, নতুন রিকোয়েস্ট ফিরিয়ে দেওয়া হলো **load shedding**, পেমেন্টের ব্যর্থতা dispatch-এ ঢুকতে না দেওয়া হলো **bulkhead**, ETA সার্ভিসে **circuit breaker**, dispatch-এর সামগ্রিক সময়সীমা হলো **deadline propagation**, reconnect storm-এ **jitter সহ backoff**, প্রতিটা transition-এ **idempotency**, আর region-কে failure domain বানানো হলো **blast-radius thinking**।

<Callout type="info">

একটা প্যাটার্ন লক্ষ করুন: প্রতিটা advanced চ্যাপ্টারের হাতিয়ার এখানে **একটা নির্দিষ্ট জায়গায়** ব্যবহার হয়েছে, সব জায়গায় নয়। fencing token শুধু চালকের status-এ, event sourcing শুধু ট্রিপে, coordination শুধু claim-এ, strong consistency শুধু একটা ফিল্ডে। **সিনিয়র ডিজাইনের চিহ্ন হাতিয়ার জানা নয় — হাতিয়ারগুলো কোথায় ব্যবহার করবেন না সেটা জানা।**

</Callout>

## ইন্টারভিউতে এই ডিজাইন কীভাবে বলবেন

1. **স্কোপ কাটুন** (২ মিনিট) — pooling নেই, শিডিউল নেই। শুধু চাওয়া থেকে নামা পর্যন্ত।
2. **অসমতাটা তুলুন** (২ মিনিট) — যাত্রী আর চালকের চাহিদা আলাদা, আর চালকের latency যাত্রীর latency-কে গুণ করে নষ্ট করে।
3. **সংখ্যা বের করুন** (৪ মিনিট) — ১৭৫ রিকোয়েস্ট/sec বনাম ৫০,০০০ location write/sec। এই অনুপাতটা বলার সাথে সাথেই আপনি দেখিয়ে দিলেন আপনি জানেন আসল চাপ কোথায়।
4. **Location-কে primary store থেকে সরান** (৩ মিনিট) — কারণ ডেটাটা মুছে যাওয়া নিরাপদ, আর নিজে নিজেই ফিরে আসে।
5. **Index বেছে নিন** (৪ মিনিট) — geohash/quadtree/S2/H3-এর সৎ তুলনা, আর "প্রথম দিনে geohash যথেষ্ট" বলাটা বাদ দেবেন না।
6. **Race-টা নিজে ধরুন** (৫ মিনিট) — ইন্টারভিউয়ারকে ধরতে দেবেন না। "দুই worker একই চালককে অফার করবে" নিজে বলুন, তারপর claim-first, lease আর fence দিয়ে সারুন।
7. **State machine আঁকুন** (৪ মিনিট) — বিশেষ করে `completed` আর `settled` কেন আলাদা।
8. **Surge-কে feedback loop বলুন** (৪ মিনিট) — দোলার সমস্যা আর damping। এটা বলতে পারা মানুষ কম।
9. **Region আর degradation ladder** (৫ মিনিট) — কী আগে ছাড়বেন, আর কোনটা কখনো ছাড়বেন না।

<div class="takeaways">

### মূল শেখা

- এই সিস্টেমের আসল সংখ্যা ট্রিপ নয় — **location write**। ১৭৫ রিকোয়েস্ট/sec-এর বিপরীতে ৫০,০০০ write/sec, ২৮৫ গুণ। সবসময় জিজ্ঞেস করুন "ব্যবহারকারী কিছু না করলেও কি সিস্টেম লিখছে?"
- **যে ডেটা নিজে নিজেই সেরে ওঠে, তার জন্য durability কেনা টাকার অপচয়।** চালকের অবস্থান primary store ছোঁবে না; সেটা in-memory, TTL-চালিত, আর হারালে ৪ সেকেন্ডে ফিরে আসে
- Index তখনই বদলান যখন **cell বদলায়**, প্রতি ping-এ নয় — এক লাইনের এই শর্তে index write বিশ ভাগের এক ভাগে নেমে আসে
- geospatial index-এর পছন্দটা ধর্ম নয়: geohash প্রথম দিনের জন্য যথেষ্ট, quadtree ঘন ঘন update-এ ভাঙে, আর **H3 বেছে নেওয়ার আসল কারণ dispatch নয় — surge-এর জন্যও একই টাইলিং লাগে**
- **Claim আগে, অফার পরে।** dispatch race-এর পুরো সমাধানটা এই ক্রমে। সাথে **lease** যাতে crash করা worker কাউকে আটকে না রাখে, আর **fencing token** যাতে দেরিতে আসা accept কাউকে দুই ট্রিপে না বসায়
- Claim হারা একটা **স্বাভাবিক ফলাফল**, error নয় — কোনো retry নেই, শুধু পরের candidate
- ট্রিপ একটা row নয়, একটা **state machine** — transition টেবিলটাই স্পেসিফিকেশন, event log-টাই সত্য, আর `state` কলামটা শুধু projection
- **`completed` আর `settled` আলাদা রাখুন** — payment provider-এর outage কখনো dispatch outage হওয়া উচিত নয়
- Surge একটা **feedback loop**, আর প্রতিক্রিয়ায় দেরি থাকা লুপে দ্রুত সিদ্ধান্ত মানেই দোলা। EWMA, hysteresis, step limit, dwell time আর স্থানিক মসৃণকরণ — পাঁচটাই লাগে
- Surge-এর ইনপুট বাসি হলে **১.০x-এ পড়ুন, সর্বোচ্চে নয়** — ব্যর্থতার দিক ডিজাইনের সিদ্ধান্ত
- Region একই সাথে shard, deployment unit আর **failure domain** — আর degradation ladder-টা আগে থেকে লেখা থাকতে হবে: surge, তারপর ETA, তারপর matching, তারপর নতুন রিকোয়েস্ট; **চলমান ট্রিপ কখনো নয়**
- সিনিয়র ডিজাইনের চিহ্ন হাতিয়ার জানা নয় — **কোথায় হাতিয়ারটা লাগবে না সেটা জানা**। এখানে strong consistency কেনা হয়েছে ঠিক একটা ফিল্ডের জন্য

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Uber**-এর H3 লাইব্রেরিটা ঠিক এই সমস্যার জন্যই বানানো — dispatch, surge zoning আর demand forecasting তিনটেই একই ষড়ভুজ টাইলিং ভাগ করে নেয়, আর তাদের dispatch সিস্টেম region-ভিত্তিক shard-এ চলে
- **Lyft** আর **Grab** ব্যাচড assignment ব্যবহার করে — কয়েক সেকেন্ডের জানালায় জমিয়ে একবারে সমাধান, যাতে মোট অপেক্ষা কমে আর একই সাথে dispatch race-টা গঠনগতভাবেই দূর হয়
- **খাবার ও পার্সেল ডেলিভারি** (DoorDash, Swiggy, Deliveroo) হুবহু একই আকৃতির সমস্যা — শুধু সেখানে একজন রাইডার একাধিক অর্ডার বহন করতে পারে, তাই assignment-টা আরও কঠিন হয়ে যায়
- **গুদামের রোবট, অ্যাম্বুলেন্স ডিসপ্যাচ, ফিল্ড টেকনিশিয়ান রাউটিং, কল সেন্টারের এজেন্ট বণ্টন** — সীমিত চলমান সম্পদ, ভৌগোলিক বা দক্ষতাভিত্তিক index, আর atomic claim: প্যাটার্নটা অপরিবর্তিত
- **যেকোনো সিস্টেম যেখানে একটা সীমিত জিনিস একাধিক প্রার্থীকে দিতে হয়** — টিকিটের আসন, হোটেলের ঘর, GPU-র slot — সেখানে ধাপ ৭-এর claim-lease-fence ত্রয়ীটা সরাসরি প্রযোজ্য

</div>
