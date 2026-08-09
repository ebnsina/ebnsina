---
title: 'Web Server Fundamentals — রোডম্যাপ'
subtitle: 'দশটি অধ্যায় যা ওয়েব সার্ভার সম্পর্কে একটি কার্যকর বোঝাপড়া গড়ে তোলে — raw TCP socket থেকে শুরু করে একটি real backend-এর সামনে বসানো টিউনড, হার্ডেনড nginx পর্যন্ত।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'http', 'nginx', 'web server', 'sockets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি যা করতে পারবেন

"ইউজার একটা URL টাইপ করল" আর "আপনার কোড রান হলো" — এই দুইয়ের মাঝে ঠিক কী ঘটে তা আপনি নিখুঁতভাবে জানবেন। raw socket থেকে একটি মিনিমাল HTTP/1.1 server আপনি নিজের হাতে লিখবেন এমন কোডে যা আপনি পুরোপুরি বোঝেন, এবং একটি real backend-এর সামনে reverse proxy হিসেবে nginx কনফিগার করবেন — TLS, caching, logging আর সেনসিবল ডিফল্ট সহ।

<Callout type="info">

**Prereqs:** আগে **Linux & VPS basics** ট্র্যাকটা শেষ করুন (অথবা VPS-এ আগে থেকেই স্বচ্ছন্দ হন)। এই ট্র্যাক ধরে নেয় যে আপনি SSH করতে পারেন, `systemctl` চালাতে পারেন, একটা config এডিট করতে পারেন, আর একটা journal পড়তে পারেন।

</Callout>

## ১০টি অধ্যায়, ক্রম অনুযায়ী

**Foundations**

1. **What is a web server** — একটি request-এর গঠন, চারটি স্টেজ
2. **HTTP from a raw socket** — `nc` দিয়ে HTTP বলুন, তারপর server লিখুন
3. **Building a real HTTP/1.1 parser** — method, headers, body, chunked
4. **Concurrency models** — process-per-request, threads, event loops
5. **Static files & MIME** — disk থেকে serve করা, ETags, cache-control

**Production with nginx**

6. **nginx fundamentals** — install, server blocks, locations, includes
7. **Reverse proxy** — আপনার app-এর সামনে nginx, headers, timeouts
8. **Access & error logs** — log formats, কী রাখবেন, কী grep করবেন

**Going deeper**

9. **Edge caching with nginx** — `proxy_cache`, microcaching, stale-while-revalidate
10. **Performance & hardening** — workers, sendfile, gzip/brotli, security headers, rate limiting

## এই ট্র্যাক কীভাবে ব্যবহার করবেন

ক্রম অনুযায়ী পড়ুন। প্রতিটা command চালান। প্রথম অর্ধেক আপনি বোঝেন এমন কোড লিখিয়ে intuition গড়ে তোলে। দ্বিতীয় অর্ধেক হলো সেই production tooling যা আপনি আসলে deploy করবেন।

মোট পড়ার সময়: ~২ ঘণ্টা। হাতে-কলমে সময়, প্রথমবারের জন্য: প্রায় একটা weekend।
