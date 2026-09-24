---
title: 'রেন্ডারিং প্যাটার্ন'
subtitle: 'CSR, SSR, SSG, এবং ISR — আপনার ওয়েব অ্যাপ্লিকেশনের জন্য কখন এবং কেন কোন রেন্ডারিং স্ট্র্যাটেজি ব্যবহার করবেন তা বুঝুন।'
chapter: 1
level: 'beginner'
readingTime: '15 মিনিট'
topics: ['CSR', 'SSR', 'SSG', 'ISR', 'hydration', 'rendering']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার একটা রেস্টুরেন্ট, আর মেন্যুতে সবচেয়ে জনপ্রিয় একটাই পদ — কাবসা। মজার ব্যাপার হলো, উনি এই একই পদ চার ভাবে পরিবেশন করেন। প্রথম টেবিলে খোয়ারিজমি এলে ওয়েটার কাঁচা উপকরণ — চাল, মশলা, মাংস — একটা ট্রেতে সাজিয়ে টেবিলেই একটা ছোট চুলা দিয়ে দেয়; খদ্দের নিজেই বসে রান্না করে খায়। দ্বিতীয় টেবিলে ফাতিমা অর্ডার দিলে রান্নাঘরে তাজা করে পুরো প্লেট বানিয়ে গরম গরম সাজিয়ে দেওয়া হয় — যতবার অর্ডার, ততবার নতুন করে রান্না।

পাশেই একটা বুফে টেবিল, যেখানে সকালেই বড় ডেকচিতে একগাদা কাবসা রেঁধে সাজিয়ে রাখা হয়েছে; যে যখন আসে, নিজের প্লেটে তুলে নেয় — কাউকে রান্নার জন্য অপেক্ষা করতে হয় না, কিন্তু দুপুর গড়ালে খাবারটা একটু বাসি লাগে। আর ঠিক তার পাশের বুফে ট্রেটা সিনা প্রতি ঘণ্টায় একবার নামিয়ে টাটকা করে আবার ভরে দেন — আগে থেকে রাঁধা, তবু নিয়ম করে সতেজ।

এই চার পরিবেশনই হলো রেন্ডারিং প্যাটার্ন। টেবিলে বসে নিজে রান্না করাটা **CSR** — server শুধু কাঁচামাল (JS) পাঠায়, browser নিজে page বানায়; দ্রুত interactive, কিন্তু প্রথমে খালি প্লেট আর SEO দুর্বল। প্রতিবার নতুন রেঁধে দেওয়াটা **SSR** — প্রতি request-এ server তাজা HTML বানায়; সবসময় fresh আর personalized, কিন্তু প্রতিবার রান্নাঘরের খরচ (server load) লাগে। সকালে একবার রেঁধে রাখা বুফে হলো **SSG** — build time-এ সব page আগে থেকে তৈরি, CDN থেকে সবচেয়ে দ্রুত, তবে পরের build পর্যন্ত content বাসি। আর প্রতি ঘণ্টায় রিফ্রেশ হওয়া ট্রেটা **ISR** — আগে থেকে বানানো page নির্দিষ্ট সময় পর background-এ regenerate হয়, তাই static-এর গতি আর মোটামুটি freshness দুটোই মেলে। বাস্তবে Next.js-এ ঠিক এভাবেই দোকানের product page ISR-এ, ব্লগ SSG-তে, আর ইউজারের dashboard SSR/CSR-এ রাখা হয়।

## কেন রেন্ডারিং প্যাটার্ন গুরুত্বপূর্ণ

আপনার অ্যাপ্লিকেশন যেভাবে HTML রেন্ডার করে তা তার performance, SEO ক্ষমতা এবং user experience নির্ধারণ করে। ভুল প্যাটার্ন বেছে নেওয়া মানে হতে পারে ধীর first load, search engine-এর কাছে অদৃশ্য content, বা অপ্রয়োজনীয় server খরচ। এই চারটি core প্যাটার্ন বোঝা আপনাকে আত্মবিশ্বাসের সাথে architectural সিদ্ধান্ত নেওয়ার শব্দভাণ্ডার দেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

বিভিন্ন রেস্টুরেন্ট স্টাইলের মতো — SSG হলো একটা বুফে (আগে থেকে রান্না করা এবং তৈরি), SSR হলো অর্ডার অনুযায়ী তৈরি, CSR হলো একটা DIY গ্রিল যেখানে আপনি আপনার টেবিলেই রান্না করেন, ISR হলো এমন একটা বুফে যা প্রতি ঘণ্টায় খাবার রিফ্রেশ করে।

</Callout>

## Client-Side Rendering (CSR)

CSR-এ, server একটা minimal HTML shell এবং একটা JavaScript bundle পাঠায়। Browser সেই JS ডাউনলোড করে, execute করে, এবং পুরো page content সম্পূর্ণভাবে client-এ রেন্ডার করে।

```html
<!-- What the server sends -->
<!DOCTYPE html>
<html>
	<body>
		<div id="root"></div>
		<script src="/bundle.js"></script>
	</body>
</html>
```

```typescript
// React CSR entry point
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

**কখন CSR ব্যবহার করবেন:**

- Dashboard এবং admin panel (SEO দরকার নেই)
- অত্যন্ত interactive অ্যাপ্লিকেশন (Figma, Google Docs)
- Authentication wall-এর পিছনে থাকা অ্যাপ

**Trade-off:**

- JS লোড এবং execute না হওয়া পর্যন্ত blank page (দুর্বল FCP)
- Search engine content index না-ও করতে পারে
- কিছু রেন্ডার হওয়ার আগে পুরো bundle ডাউনলোড হতে হয়

## Server-Side Rendering (SSR)

SSR-এ, server প্রতিটি request-এর জন্য সম্পূর্ণ HTML generate করে। Browser display-ready content পায়, তারপর interactivity-র জন্য JavaScript দিয়ে সেটাকে "hydrate" করে।

```typescript
// Next.js SSR with getServerSideProps
import type { GetServerSideProps } from "next";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params!;
  const res = await fetch(`https://api.example.com/products/${id}`);
  const product: Product = await res.json();

  return {
    props: { product },
  };
};

export default function ProductPage({ product }: { product: Product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>Price: ৳{product.price}</p>
      <p>{product.stock > 0 ? "In Stock" : "Out of Stock"}</p>
      <button onClick={() => addToCart(product.id)}>Add to Cart</button>
    </div>
  );
}
```

**কখন SSR ব্যবহার করবেন:**

- ঘন ঘন পরিবর্তনশীল data-যুক্ত page (stock price, inventory)
- Personalized content (user-নির্দিষ্ট dashboard)
- Dynamic data-সহ SEO-critical page

**Trade-off:**

- প্রতিটি request server-এ যায় (বেশি server খরচ)
- Time to First Byte (TTFB) server-এর গতির উপর নির্ভর করে
- একটা চালু server দরকার (শুধু CDN নয়)

## Static Site Generation (SSG)

SSG-তে, সব page build time-এ generate হয়। Output হলো সাধারণ HTML file যা কোনো server-side computation ছাড়াই CDN থেকে serve করা যায়।

```typescript
// Next.js SSG with getStaticProps
import type { GetStaticProps, GetStaticPaths } from "next";

interface BlogPost {
  slug: string;
  title: string;
  content: string;
  publishedAt: string;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await fetchAllPosts();
  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const post = await fetchPostBySlug(params!.slug as string);
  return {
    props: { post },
  };
};

export default function BlogPost({ post }: { post: BlogPost }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <time>{post.publishedAt}</time>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

**কখন SSG ব্যবহার করবেন:**

- Marketing page, blog, documentation
- যে content খুব কমই পরিবর্তন হয়
- সর্বোচ্চ performance যেখানে জরুরি

**Trade-off:**

- Page সংখ্যার সাথে build time বাড়ে
- পরের build পর্যন্ত content বাসি থাকে
- ঘন ঘন পরিবর্তনশীল data-র জন্য উপযুক্ত নয়

## Incremental Static Regeneration (ISR)

ISR হলো SSG-র গতি আর SSR-এর freshness-এর সমন্বয়। Page statically generate হয় কিন্তু একটা নির্দিষ্ট time interval-এর পর background-এ re-generate হতে পারে।

```typescript
// Next.js ISR — revalidate every 60 seconds
export const getStaticProps: GetStaticProps = async ({ params }) => {
	const product = await fetchProduct(params!.id as string);

	return {
		props: { product },
		revalidate: 60 // Re-generate page every 60 seconds
	};
};
```

**ISR-এর flow:**

1. প্রথম visitor statically generate করা page পায় (দ্রুত)
2. `revalidate` সেকেন্ডের পর, পরবর্তী request একটা background regeneration trigger করে
3. নতুনটা generate হওয়ার সময় বাসি page-টা serve করা হয়
4. একবার generate হয়ে গেলে, পরবর্তী সব visitor fresh page পায়

<Callout type="tip">

**সঠিক প্যাটার্ন বেছে নেওয়া:**

- **SEO + static content দরকার?** SSG ব্যবহার করুন
- **SEO + dynamic data দরকার?** SSR বা ISR ব্যবহার করুন
- **SEO দরকার নেই + অত্যন্ত interactive?** CSR ব্যবহার করুন
- **SEO দরকার + data প্রতি কয়েক মিনিটে পরিবর্তন হয়?** ISR-ই আপনার sweet spot

</Callout>

## Hydration: Server আর Client-এর মধ্যে সেতু

SSR বা SSG যখন HTML delivery করে, page দৃশ্যমান হয় কিন্তু interactive নয়। Hydration হলো সেই প্রক্রিয়া যেখানে React (বা যেকোনো framework) বিদ্যমান HTML-এ event handler attach করে।

```typescript
// The hydration problem visualized
// 1. Server renders: <button>Buy Now</button> — visible but dead
// 2. JS bundle downloads (could be 200KB+)
// 3. React hydrates: attaches onClick to the button — now interactive

// Partial hydration with Astro (islands architecture)
// Only hydrate the interactive parts
---
import StaticHeader from "../components/Header.astro";  // No JS
import ProductCard from "../components/ProductCard";      // Needs JS
---

<StaticHeader />
<ProductCard client:visible />  <!-- Only hydrates when scrolled into view -->
```

<Callout type="warning">

**সাধারণ ভুল: Hydration mismatch**

Server-rendered HTML যদি client যা রেন্ডার করে তার সাথে না মেলে, React একটা hydration error throw করবে এবং পুরো component tree আবার রেন্ডার করবে। Initial render-এর সময় `Date.now()`, `Math.random()`, বা `window.innerWidth`-এর মতো browser-only API ব্যবহার এড়িয়ে চলুন। এর বদলে client-only value-র জন্য `useEffect` ব্যবহার করুন।

</Callout>

## তুলনামূলক টেবিল

| Pattern | Build Time               | TTFB               | SEO   | Data Freshness  | Server Cost |
| ------- | ------------------------ | ------------------ | ----- | --------------- | ----------- |
| CSR     | Fast                     | Fast (empty HTML)  | Poor  | Real-time       | Low (CDN)   |
| SSR     | N/A                      | Slow (server work) | Great | Real-time       | High        |
| SSG     | Slow (scales with pages) | Fast (CDN)         | Great | Build-time only | Low (CDN)   |
| ISR     | Moderate                 | Fast (CDN)         | Great | Periodic        | Moderate    |

## মূল টেকঅ্যাওয়ে

1. **CSR** একটা খালি shell পাঠায় — auth-এর পিছনে থাকা SPA-র জন্য চমৎকার, SEO-র জন্য ভয়াবহ
2. **SSR** প্রতি request-এ fresh HTML generate করে — dynamic, personalized page-এর জন্য আদর্শ
3. **SSG** deploy time-এ সবকিছু আগে থেকে build করে — CDN থেকে সম্ভাব্য দ্রুততম delivery
4. **ISR** হলো hybrid — static গতির সাথে পর্যায়ক্রমিক freshness, নির্দিষ্ট সময়সূচিতে পরিবর্তন হওয়া content-এর জন্য সেরা
5. **Hydration** server HTML আর client interactivity-র মধ্যকার ফাঁক পূরণ করে — সেরা performance-এর জন্য যা hydrate করা দরকার তা সর্বনিম্ন রাখুন
