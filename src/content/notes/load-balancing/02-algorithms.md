---
title: 'Load Balancing Algorithm'
subtitle: 'Round-robin, least connections, IP hash, weighted routing — কোন algorithm কখন মানানসই আর backend সমান না হলে কী ঘটে।'
chapter: 2
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['load balancing', 'round-robin', 'least connections', 'consistent hashing', 'weighted']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

রেস্টুরেন্টে অতিথিদের টেবিলে বসানো একজন host: round-robin পরের খালি টেবিলে rotation করে বসায়। Least connections সবচেয়ে কম লোক বসা টেবিলে বসায়। IP hash সবসময় একই অতিথিকে একই section-এ পাঠায়। Weighted routing বড় টেবিলগুলোতে বেশি অতিথি পাঠায়। একই সমস্যা, ভিন্ন নিয়ম — সঠিকটা নির্ভর করে আপনার টেবিলগুলো সমান কিনা আর একই অতিথিকে একসাথে বসানো জরুরি কিনা তার উপর।

</Callout>

## গল্পে বুঝি

সকালবেলা একটা ব্যস্ত ক্লিনিকের সামনের ডেস্ক সামলান ফাতিমা। ভেতরে তিনজন ডাক্তার — সিনিয়র সিনা, রাজি, আর নতুন ট্রেইনি খোয়ারিজমি। রোগী আসতেই থাকে, আর ফাতিমাকে ঠিক করতে হয় কাকে কোন ডাক্তারের ঘরে পাঠাবেন। সবচেয়ে সহজ দিনে তিনি শুধু পালা করে পাঠান — প্রথম রোগী সিনার কাছে, পরেরজন রাজির কাছে, তার পরেরজন খোয়ারিজমির কাছে, আবার সিনা থেকে শুরু। কিন্তু কোনো রোগীর চেকআপ দীর্ঘ হয়ে গেলে সেই ঘরের সামনে লাইন জমে যায়, তাই ফাতিমা মাঝে মাঝে চোখ বুলিয়ে দেখেন কোন ডাক্তারের সামনে এই মুহূর্তে সবচেয়ে ছোট লাইন, নতুন রোগীকে সোজা সেখানেই পাঠিয়ে দেন।

আরেকটা ব্যাপারও ফাতিমা মাথায় রাখেন। সিনা অভিজ্ঞ আর দ্রুত, তাই তাঁকে তিনি ট্রেইনি খোয়ারিজমির চেয়ে অনেক বেশি রোগী পাঠান — প্রতি পাঁচজনে চারজন সিনিয়রের কাছে, একজন ট্রেইনির কাছে। আর যেসব রোগী আগেও এসেছেন, যাঁদের ফাইল আর আগের চিকিৎসার ইতিহাস যে ডাক্তার জানেন, তাঁদের ফাতিমা সবসময় সেই একই ডাক্তারের কাছেই ফেরত পাঠান — নতুন করে সব বোঝানোর ঝামেলা এড়াতে।

ফাতিমার এই চারটা নিয়মই আসলে চারটা load-balancing algorithm। পালা করে একজন-একজন করে পাঠানো হলো **round-robin**; যার সামনে সবচেয়ে ছোট লাইন সেখানে পাঠানো হলো **least-connections**; সিনিয়রকে বড় ভাগ দেওয়া হলো **weighted**; আর পুরোনো রোগীকে সবসময় একই ডাক্তারের কাছে ফেরত পাঠানো হলো **IP-hash** বা **sticky** routing। বাস্তবে nginx বা HAProxy-র মতো load balancer এই একই নিয়মে ঠিক করে কোন request কোন backend server-এ যাবে — আপনার server-গুলো সমান শক্তির কিনা, আর একই client-কে একই server-এ রাখা জরুরি কিনা, তার উপর নির্ভর করে কোন নিয়মটা মানানসই।

## Round Robin

প্রতিটা request rotation করে পরের server-এ পাঠান। সহজ, কোনো state দরকার নেই।

```
Request 1 → server1
Request 2 → server2
Request 3 → server3
Request 4 → server1  (wraps)
```

**nginx:**

```nginx
upstream backend {
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
    server 10.0.0.12:3000;
}
```

Round robin হলো nginx-এর default — কোনো directive লাগে না।

**HAProxy:**

```
backend api_servers
    balance roundrobin
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
    server s3 10.0.0.12:3000 check
```

**কখন কাজ করে:** একই রকম request cost-এর homogeneous server। **কখন ব্যর্থ হয়:** যদি request-গুলোর processing time খুব ভিন্ন হয়, একটা ধীর request একটা server-কে আটকে রাখে যখন বাকিগুলো বসে থাকে।

## Least Connections

সবচেয়ে কম active connection আছে এমন server-এ পাঠান।

```
server1: 10 connections
server2: 4 connections   ← next request goes here
server3: 7 connections
```

**nginx:**

```nginx
upstream backend {
    least_conn;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
    server 10.0.0.12:3000;
}
```

**HAProxy:**

```
backend api_servers
    balance leastconn
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

**কখন কাজ করে:** পরিবর্তনশীল request duration-এর workload — দীর্ঘ চলা request (upload, streaming, websocket)। স্বাভাবিকভাবেই overloaded server থেকে দূরে route করে। **কখন round-robin ভালো:** ছোট, একরকম request যেখানে connection tracking-এর overhead-এর দাম নেই।

## IP Hash (Source Affinity)

Client IP hash করে সবসময় একই client-কে একই server-এ route করা।

```
client 1.2.3.4 → hash → always server2
client 5.6.7.8 → hash → always server1
```

**nginx:**

```nginx
upstream backend {
    ip_hash;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}
```

**HAProxy:** `balance source` ব্যবহার করুন:

```
backend api_servers
    balance source
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

**কখন কাজ করে:** stateful application যেখানে in-memory state একটা নির্দিষ্ট server-এর সাথে বাঁধা (session data, WebSocket connection যেগুলো migrate করা যায় না)। **সমস্যাটা:** এটা একটা ঠেকনা। কোনো server down হলে, তার সাথে hash হওয়া সব client তাদের state হারায়। সঠিক সমাধান হলো state-টা Redis-এ বের করে আনা আর যেকোনো stateless algorithm ব্যবহার করা।

আরও: NAT-এর পেছনে থাকা client-রা একটা IP হিসেবে দেখায়, একটা server-কে overload করে।

## Weighted Round Robin

কিছু server বেশি শক্তিশালী। তাদের অনুপাত অনুযায়ী বেশি traffic পাঠান।

**nginx:**

```nginx
upstream backend {
    server 10.0.0.10:3000 weight=5;   # handles 5x the traffic
    server 10.0.0.11:3000 weight=1;   # handles 1x
}
```

এই weight দিয়ে: 6-টার মধ্যে 5-টা request `s1`-এ যায়, 6-টার মধ্যে 1-টা `s2`-তে।

**HAProxy:**

```
backend api_servers
    balance roundrobin
    server s1 10.0.0.10:3000 check weight 50
    server s2 10.0.0.11:3000 check weight 10
```

**ব্যবহারের ক্ষেত্র:**

- মিশ্র instance type (c5.4xlarge + c5.xlarge একসাথে)
- ধীরে ধীরে traffic shift (canary deployment — নতুন server weight=1-এ শুরু হয়, বাড়ে)
- cold start-এর পর নতুন server warm up করা

## Random with Two Choices (Power of Two)

দুটো server randomly বেছে নিন, যেটার connection কম তাতে পাঠান। খাঁটি random-এর চেয়ে ভালো, coordination overhead ছাড়াই প্রায় global least-connections-এর মতোই ভালো।

HAProxy নতুন version-গুলোতে এটা support করে:

```
backend api_servers
    balance random 2
```

বড়, distributed load balancer fleet-এর জন্য (যেমন service mesh-এ Nginx Plus বা Envoy), এটা global least-connections-এর চেয়ে বেশি পছন্দনীয় কারণ এটার জন্য LB instance-গুলোর মধ্যে shared state লাগে না।

## Consistent Hashing

একটা stable key-তে (URL, user ID) request hash করুন আর সবসময় একই backend-এ route করুন। IP hash-এর বিপরীতে, এটা server যোগ/অপসারণ সুন্দরভাবে handle করে — একটা server যোগ করলে শুধু `1/n` request reroute হয়।

**nginx Plus** (commercial):

```nginx
upstream backend {
    hash $request_uri consistent;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}
```

**ব্যবহারের ক্ষেত্র:** cache server যেখানে আপনি চান একই URL একই backend-এ hit করুক (cache hit rate সর্বোচ্চ করে)। যদি backend 1 `/api/users/123` cache করে, consistent hashing নিশ্চিত করে সেই URL সবসময় backend 1-এ যাবে।

## Algorithm বাছাইয়ের গাইড

```
Is request duration uniform?
  Yes → Round robin (simple, effective)
  No  → Least connections

Do servers have different capacity?
  Yes → Weighted round robin or weighted least connections

Does the client need to reach the same server?
  No  → Use Redis/external state, round robin
  Yes (legacy app) → IP hash or cookie-based affinity

Is this a cache cluster?
  Yes → Consistent hashing

Is this a distributed LB fleet (many LB instances)?
  Yes → Power of two random choices
```

## Slow Start

নতুন server বা failure থেকে recover হওয়া server-এর সঙ্গে সঙ্গে full traffic পাওয়া উচিত না — তারা এখনো warm up হচ্ছে হয়তো (cold JVM, cache warming, connection pool ভরা)।

**nginx Plus:**

```nginx
server 10.0.0.10:3000 slow_start=30s;
```

**HAProxy:** `weight` manipulation ব্যবহার করুন:

```bash
# Start the server at weight 10, gradually increase via runtime API
echo "set server backend/s1 weight 10" | socat stdio /var/run/haproxy/admin.sock
# After 30s:
echo "set server backend/s1 weight 100" | socat stdio /var/run/haproxy/admin.sock
```

এটা একটা "thundering herd" সমস্যা প্রতিরোধ করে যেখানে নতুন যোগ হওয়া একটা server সঙ্গে সঙ্গে 33% traffic পেয়ে হঠাৎ load-এ ভেঙে পড়ে।
