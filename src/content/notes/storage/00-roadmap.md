---
title: 'ফাইল ও অবজেক্ট স্টোরেজ — রোডম্যাপ'
subtitle: 'লোকাল ডিস্ক, NFS, তারপর নিজে সেল্ফ-হোস্ট করুন MinIO। nginx আর Varnish দিয়ে একটা CDN বানান।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

তিন ধরনের স্টোরেজ ইনফ্রাস্ট্রাকচার: আপনার নিজের একটা হার্ড ড্রাইভ (block), নেটওয়ার্কে থাকা একটা শেয়ার্ড ফাইলিং ক্যাবিনেট (file), আর নম্বর দেওয়া বিনসহ একটা ওয়্যারহাউস যেখানে HTTP দিয়ে অ্যাক্সেস করেন (object)। এই ট্র্যাক তিনটাই কভার করে — কখন কোনটা ব্যবহার করবেন, MinIO দিয়ে কীভাবে অবজেক্ট স্টোরেজ সেল্ফ-হোস্ট করবেন, এজে (edge) ফাইল ক্যাশ করবেন কীভাবে, আর কোন অপারেশনাল প্যাটার্নগুলো স্টোরেজকে সস্তা ও নির্ভরযোগ্য রাখে।

</Callout>

## যা যা শিখবেন

স্টোরেজ দেখতে সহজ মনে হয়, যতক্ষণ না আপনি স্কেল করতে যান। একটা সার্ভারে লোকাল ডিস্ক দিব্যি চলে; দ্বিতীয় সার্ভার যোগ করার মুহূর্তেই ভেঙে পড়ে। এই ট্র্যাক শুরু হয় তিনটা স্টোরেজ প্রিমিটিভ দিয়ে — block, file, আর object — তারপর গভীরে যায় MinIO দিয়ে সেল্ফ-হোস্টেড অবজেক্ট স্টোরেজে, ফাইল আপলোড ঠিকঠাক হ্যান্ডল করা (ভ্যালিডেশন, ইমেজ প্রসেসিং, সরাসরি ব্রাউজার থেকে আপলোড), nginx আর Varnish দিয়ে একটা এজ ক্যাশ বানানো, আর সেই অপারেশনাল ডিসিপ্লিন যা খরচ কমিয়ে রাখে এবং ডেটা নিরাপদ রাখে।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Storage Primitives** — block, file, আর object storage; NFS সেটআপ; S3 সেম্যান্টিক্স; storage tier
2. **Self-Hosted Object Storage with MinIO** — single-node আর distributed mode; S3-compatible API; presigned URL; lifecycle policy
3. **File Uploads** — multipart পার্সিং; content-type ভ্যালিডেশন; সরাসরি স্টোরেজে আপলোড; ইমেজ প্রসেসিং; virus scanning; বড় ফাইলের জন্য multipart upload
4. **CDN with nginx and Varnish** — HTTP caching header; nginx proxy_cache; VCL কনফিগারেশন; URL আর tag দিয়ে cache invalidation; hit rate মনিটরিং
5. **Storage in Practice** — access control; presigned download URL; bucket organization; খরচ অপটিমাইজেশন; backup strategy; orphan file cleanup
