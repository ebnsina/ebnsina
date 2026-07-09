---
title: 'WebSockets ও realtime — রোডম্যাপ'
subtitle: "দশটি চ্যাপ্টার যা 'WebSocket handshake আসলে কী' থেকে শুরু করে Redis pub/sub, presence, auth আর সামনে nginx সহ একটি self-hosted, horizontally scaled realtime server পর্যন্ত নিয়ে যাবে।"
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'websockets', 'sse', 'realtime', 'pubsub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি কী করতে পারবেন

আপনি ঠিক জানবেন wire level-এ একটা WebSocket আসলে কী, কখন এটা ব্যবহার করবেন আর কখন SSE বা polling সঠিক পছন্দ, কীভাবে একটা Go server লিখবেন যা হাজার হাজার concurrent connection সামলায়, কীভাবে Redis বা NATS দিয়ে অনেকগুলো server process জুড়ে message fan out করবেন, কীভাবে presence track করবেন, এবং কীভাবে পুরো জিনিসটা TLS আর sane timeout সহ nginx-এর পেছনে self-hosted করে deploy করবেন।

<Callout type="info">

**Prereqs:** **Linux & VPS basics**, **Networking**, আর **Web Server fundamentals** শেষ করুন। WebSockets HTTP/1.1 Upgrade-এর উপর চলে — এই ট্র্যাকগুলো ছাড়া "nginx কেন 60 সেকেন্ডে connection ড্রপ করে দেয়" ব্যাপারটা রহস্য মনে হবে। Go এখানে প্রধান ভাষা; প্যাটার্নগুলো Node আর Python-এও একইভাবে খাটে।

</Callout>

## ১০টি চ্যাপ্টার, ক্রম অনুযায়ী

**Foundations**

1. **WebSockets কী এবং কখন ব্যবহার করবেন** — vs SSE, vs polling, vs gRPC streams
2. **handshake আর frame protocol** — Upgrade, masking, opcodes, close codes
3. **আপনার প্রথম server** — Go, end-to-end, ৮০ লাইনে
4. **উপরে message protocol** — JSON, msgpack, framing, versioning

**Real services**

5. **Server-Sent Events** — যখন one-way যথেষ্ট, এবং কীভাবে সেটা ভালোভাবে করবেন
6. **Pub/sub at scale** — Redis আর NATS, process জুড়ে fan-out
7. **Presence আর rooms** — কে online তা track করা, channel-এ join করা
8. **Auth, origin, rate limits** — production-safe connection handshake

**Production**

9. **Backpressure, reconnects, heartbeats** — slow client আর খারাপ network-এ টিকে থাকা
10. **Production self-host** — nginx, systemd, observability, scaling out

## এই ট্র্যাক কীভাবে ব্যবহার করবেন

ক্রম অনুযায়ী পড়ুন। প্রথম তিন চ্যাপ্টার ব্যাখ্যা করে একটা WebSocket কী এবং একটা কাজ করা server ship করে। চ্যাপ্টার 4 থেকে প্রতিটা চ্যাপ্টার একটা করে বাস্তব production capability যোগ করে। মোট পড়ার সময়: ~3 ঘণ্টা। প্রথমবার পুরোটা বানাতে hands-on সময়: একটা লম্বা weekend।

আপনার লাগবে Go 1.22+, Redis (চ্যাপ্টার 6 থেকে), আর চ্যাপ্টার 10-এর জন্য একটা VPS যার দিকে একটা domain pointed। বাকি সব `localhost`-এ চলে।
