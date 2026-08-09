---
title: 'TLS ও Certificates — রোডম্যাপ'
subtitle: 'আটটি চ্যাপ্টার যা TLS-কে রহস্য থেকে মাসল মেমরিতে নিয়ে যায় — এটা আসলে কী করে, কেন প্রতিটা অংশের অস্তিত্ব আছে, এবং কীভাবে কোনো ম্যানেজড সার্ভিস ছাড়াই আসল certificate ইস্যু, রিনিউ ও সার্ভ করবেন।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'tls', 'ssl', 'certificates', 'letsencrypt']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি যা করতে পারবেন

TLS handshake-এর সময় ঠিক কী ঘটে সেটা আপনি বুঝবেন, `/etc/letsencrypt/live/`-এর প্রতিটা ফাইল কী তা জানবেন, কীভাবে Let's Encrypt থেকে হাতে-কলমে এবং অটোপাইলটে একটা আসল certificate ইস্যু করতে হয় তা শিখবেন, এবং কোনো র‍্যান্ডম gist কপি-পেস্ট না করেই SSL Labs-এ A+ স্কোর পায় এমন TLS-এর জন্য nginx কনফিগার করতে পারবেন।

<Callout type="info">

**প্রিরেকুইজিট:** **Linux & VPS basics** ট্র্যাকটা শেষ করুন (আপনার ssh, systemd, nftables লাগবে) এবং **Web Server Fundamentals**-এর অন্তত ৬–৭ নম্বর চ্যাপ্টার (nginx basics ও reverse proxy)। এই ট্র্যাকটা ধরে নেয় যে আপনি nginx reload করতে পারেন এবং এর লগ পড়তে পারেন।

</Callout>

## ৮টি চ্যাপ্টার, ক্রম অনুযায়ী

**Foundations**

1. **TLS আসলে কী** — encryption + identity, দুইটা অর্ধেক
2. **TLS handshake** — প্রতিটা byte কী করে, ECDHE, AEAD, ALPN
3. **Certificates ও chain of trust** — keys, CSRs, CAs, validation কীভাবে কাজ করে

**আসল certificate ইস্যু করা**

4. **Let's Encrypt ও ACME** — প্রোটোকল end-to-end কীভাবে কাজ করে
5. **certbot দিয়ে আপনার প্রথম cert ইস্যু করা** — HTTP-01 challenge, ধাপে ধাপে
6. **Wildcard ও DNS-01** — যখন HTTP challenge যথেষ্ট নয়

**Production**

7. **TLS-এর জন্য nginx কনফিগার করা** — শক্ত defaults, OCSP stapling, HSTS
8. **Renewal, monitoring ও rotation** — ৯০ দিন পার করে বেঁচে থাকা

## এই ট্র্যাক কীভাবে ব্যবহার করবেন

ক্রম অনুযায়ী পড়ুন। প্রথম তিনটা চ্যাপ্টার ব্যাখ্যা করে TLS কী করছে; পরের তিনটা ধাপে ধাপে আসল certificate ইস্যু করে; শেষ দুইটা production hygiene। মোট: পড়তে ~৯০ মিনিট, একটা আসল domain ও VPS নিয়ে হাতে-কলমে আধা দিন।

আপনার নিয়ন্ত্রণে থাকা একটা domain লাগবে (যেকোনো registrar — শেখার জন্য $10-এ একটা `.com` কেনা ঠিক আছে) যেটা একটা A record দিয়ে আপনার VPS-এর IP-তে পয়েন্ট করা। সেটা ছাড়া Let's Encrypt-এর validation পাস করবে না।
