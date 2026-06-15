---
title: "Rendering Patterns"
subtitle: "CSR, SSR, SSG, and ISR — understand when and why to use each rendering strategy for your web application."
chapter: 1
level: "beginner"
readingTime: "15 min"
topics: ["CSR", "SSR", "SSG", "ISR", "hydration", "rendering"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Rendering Patterns Matter

The way your application renders HTML determines its performance, SEO capability, and user experience. Choosing the wrong pattern can mean slow first loads, invisible content for search engines, or unnecessary server costs. Understanding these four core patterns gives you the vocabulary to make architectural decisions confidently.

<Callout type="info">

**Real-World Analogy**

Like different restaurant styles — SSG is a buffet (pre-cooked and ready), SSR is made-to-order, CSR is a DIY grill where you cook at your table, ISR is a buffet that refreshes dishes every hour.

</Callout>

## Client-Side Rendering (CSR)

With CSR, the server sends a minimal HTML shell and a JavaScript bundle. The browser downloads the JS, executes it, and renders the page content entirely on the client.

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

**When to use CSR:**
- Dashboards and admin panels (no SEO needed)
- Highly interactive applications (Figma, Google Docs)
- Apps behind authentication walls

**Trade-offs:**
- Blank page until JS loads and executes (poor FCP)
- Search engines may not index content
- Full bundle must download before anything renders

## Server-Side Rendering (SSR)

With SSR, the server generates complete HTML for each request. The browser receives ready-to-display content, then "hydrates" it with JavaScript for interactivity.

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

**When to use SSR:**
- Pages with frequently changing data (stock prices, inventory)
- Personalized content (user-specific dashboards)
- SEO-critical pages with dynamic data

**Trade-offs:**
- Every request hits the server (higher server costs)
- Time to First Byte (TTFB) depends on server speed
- Requires a running server (not just a CDN)

## Static Site Generation (SSG)

With SSG, all pages are generated at build time. The output is plain HTML files that can be served from a CDN with zero server-side computation.

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

**When to use SSG:**
- Marketing pages, blogs, documentation
- Content that changes infrequently
- Maximum performance is critical

**Trade-offs:**
- Build times grow with page count
- Content is stale until next build
- Not suitable for frequently changing data

## Incremental Static Regeneration (ISR)

ISR combines the speed of SSG with the freshness of SSR. Pages are statically generated but can be re-generated in the background after a specified time interval.

```typescript
// Next.js ISR — revalidate every 60 seconds
export const getStaticProps: GetStaticProps = async ({ params }) => {
  const product = await fetchProduct(params!.id as string);

  return {
    props: { product },
    revalidate: 60, // Re-generate page every 60 seconds
  };
};
```

**The ISR flow:**
1. First visitor gets the statically generated page (fast)
2. After `revalidate` seconds, the next request triggers a background regeneration
3. The stale page is served while the new one generates
4. Once generated, all subsequent visitors get the fresh page

<Callout type="tip">

**Choosing the right pattern:**
- **Need SEO + static content?** Use SSG
- **Need SEO + dynamic data?** Use SSR or ISR
- **No SEO needed + highly interactive?** Use CSR
- **Need SEO + data changes every few minutes?** ISR is your sweet spot

</Callout>

## Hydration: The Bridge Between Server and Client

When SSR or SSG delivers HTML, the page is visible but not interactive. Hydration is the process where React (or any framework) attaches event handlers to the existing HTML.

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

**Common mistake: Hydration mismatch**

If the server-rendered HTML doesn't match what the client renders, React will throw a hydration error and re-render the entire component tree. Avoid using `Date.now()`, `Math.random()`, or browser-only APIs like `window.innerWidth` during initial render. Use `useEffect` for client-only values instead.

</Callout>

## Comparison Table

| Pattern | Build Time | TTFB | SEO | Data Freshness | Server Cost |
|---------|-----------|------|-----|----------------|-------------|
| CSR | Fast | Fast (empty HTML) | Poor | Real-time | Low (CDN) |
| SSR | N/A | Slow (server work) | Great | Real-time | High |
| SSG | Slow (scales with pages) | Fast (CDN) | Great | Build-time only | Low (CDN) |
| ISR | Moderate | Fast (CDN) | Great | Periodic | Moderate |

## Key Takeaways

1. **CSR** ships an empty shell — great for SPAs behind auth, terrible for SEO
2. **SSR** generates fresh HTML per request — ideal for dynamic, personalized pages
3. **SSG** pre-builds everything at deploy time — fastest possible delivery from CDN
4. **ISR** is the hybrid — static speed with periodic freshness, best for content that changes on a schedule
5. **Hydration** bridges the gap between server HTML and client interactivity — minimize what needs hydrating for best performance

