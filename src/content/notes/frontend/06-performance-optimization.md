---
title: 'পারফরম্যান্স অপটিমাইজেশন'
subtitle: 'Code splitting, lazy loading, tree shaking, bundle analysis, আর Core Web Vitals — তোমার ফ্রন্টএন্ডকে দ্রুত বানানো।'
chapter: 6
level: 'advanced'
readingTime: '15 মিনিট'
topics:
  [
    'performance',
    'code splitting',
    'lazy loading',
    'tree shaking',
    'core web vitals',
    'bundle size'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বুখারার বাজারে সিনার একটা দোকান। দোকান খোলার সময় সে যদি পেছনের গুদামের পুরো মালপত্র টেনে সামনে সাজিয়ে বসত, দোকান খুলতেই ঘণ্টা পার হয়ে যেত, সামনেটা জিনিসে ঠাসা হয়ে খদ্দের ঢোকার জায়গাই থাকত না। তাই সে বুদ্ধি করে বেশিরভাগ মাল গুদামে প্যাক করাই রাখে — কেউ যখন কোনো একটা জিনিস চায়, ঠিক তখনই সেটা খুলে বের করে দেয়। আর মাল আসে বড় এক কন্টেইনারে নয়, বরং ছোট ছোট লেবেল-লাগানো ক্রেটে; যে ক্রেটটা দরকার শুধু সেটাই খুলে।

খদ্দেররা দিনভর একই প্রশ্ন করে — "সমরকন্দের রেশমের গজপ্রতি দাম কত?" প্রতিবার হিসাব কষার বদলে সিনা একবার হিসাব করে দামটা একটা কাগজে লিখে কাউন্টারে সেঁটে রাখে; পরের বার শুধু কাগজ দেখে বলে দেয়। আর যেসব মাল ঢাউস আকারের, সেগুলো সে টানটান করে ছোট বাক্সে রি-প্যাক করে রাখে — কম জায়গা নেয়, দ্রুত নাড়াচাড়া করা যায়, গাড়িতে চটপট ওঠে।

এই দোকানটাই আসলে একটা ফ্রন্টএন্ড অ্যাপ। "চাওয়ার মুহূর্তে তবেই জিনিস খোলা" হলো **lazy loading** — রিসোর্স তখনই লোড করা যখন সত্যিই দরকার। বড় কন্টেইনারের বদলে ছোট লেবেল-করা ক্রেট হলো **code splitting** — এক বিশাল bundle না পাঠিয়ে ছোট ছোট chunk প্রয়োজনমতো লোড। বারবার একই দামের হিসাব কাগজে লিখে রাখা হলো **memoization** — একই ইনপুটের ফল বারবার না গুনে ক্যাশ করা। আর ঢাউস মাল ছোট বাক্সে রি-প্যাক করা হলো **image optimization** আর ছোট **bundle size** — WebP/AVIF, tree shaking, ছোট লাইব্রেরি দিয়ে যা কম বাইট নেয়, দ্রুত পৌঁছায়। বাস্তবে React.lazy, dynamic import, `loading="lazy"`, useMemo — সব এই একই নীতিতে চলে: যতটুকু দরকার ঠিক ততটুকুই, ঠিক যখন দরকার তখনই।

## পারফরম্যান্স কেন গুরুত্বপূর্ণ

পারফরম্যান্স কোনো ফিচার নয় — এটাই ভিত্তি। Google-এর একটা স্টাডি দেখিয়েছে যে মোবাইল লোড টাইমে ১ সেকেন্ডের দেরি conversion ২০% পর্যন্ত কমিয়ে দিতে পারে। ধীর কানেকশন আর সস্তা ডিভাইসের ইউজাররা বিশেষভাবে ক্ষতিগ্রস্ত হয়। ফ্রন্টএন্ড পারফরম্যান্স মাপা আর অপটিমাইজ করার টুল ও টেকনিক বোঝাটাই ভালো ডেভেলপারকে দুর্দান্ত ডেভেলপার থেকে আলাদা করে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ফ্যাক্টরির প্রোডাকশন লাইন অপটিমাইজ করার মতো — code splitting হলো বিভিন্ন প্রোডাক্টের জন্য আলাদা আলাদা লাইন রাখা। Lazy loading হলো কোনো মেশিন কেবল তখনই চালু করা যখন একটা অর্ডারের জন্য সেটা দরকার।

</Callout>

## Core Web Vitals

Google-এর তিনটা মেট্রিক যা বাস্তব ইউজার এক্সপেরিয়েন্স মাপে:

| Metric                              | কী মাপে             | ভালো       | কাজ দরকার | খারাপ   |
| ----------------------------------- | ------------------- | ---------- | --------- | ------- |
| **LCP** (Largest Contentful Paint)  | Loading performance | &lt; 2.5s  | 2.5–4s    | > 4s    |
| **INP** (Interaction to Next Paint) | Responsiveness      | &lt; 200ms | 200–500ms | > 500ms |
| **CLS** (Cumulative Layout Shift)   | Visual stability    | &lt; 0.1   | 0.1–0.25  | > 0.25  |

```typescript
// Measure Core Web Vitals in your app
import { onLCP, onINP, onCLS } from 'web-vitals';

function sendToAnalytics(metric: { name: string; value: number; id: string }) {
	fetch('/api/analytics', {
		method: 'POST',
		body: JSON.stringify(metric),
		headers: { 'Content-Type': 'application/json' }
	});
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
```

## Code Splitting

একটা বিশাল JavaScript bundle পাঠানোর বদলে, তোমার কোডকে ছোট ছোট chunk-এ ভাগ করো যেগুলো প্রয়োজনমতো লোড হয়।

```typescript
// React.lazy — route-level code splitting
import { lazy, Suspense } from "react";

// These are loaded only when the route is visited
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Analytics = lazy(() => import("./pages/Analytics"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}

// Named chunks for better debugging
const Editor = lazy(() =>
  import(/* webpackChunkName: "editor" */ "./pages/Editor")
);
```

```typescript
// Component-level code splitting — heavy components loaded on demand
const MarkdownEditor = lazy(() => import("./components/MarkdownEditor"));
const ChartDashboard = lazy(() => import("./components/ChartDashboard"));

function BlogPostEditor({ showPreview }: { showPreview: boolean }) {
  return (
    <div>
      <Suspense fallback={<EditorSkeleton />}>
        <MarkdownEditor />
      </Suspense>
      {showPreview && (
        <Suspense fallback={<ChartSkeleton />}>
          <ChartDashboard />
        </Suspense>
      )}
    </div>
  );
}
```

## Image আর Component Lazy Loading

রিসোর্স কেবল তখনই লোড করো যখন সেগুলো দরকার — যখন সেগুলো viewport-এ ঢোকে বা ইউজার কোনো অ্যাকশন ট্রিগার করে।

```typescript
// Native lazy loading for images
function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={400}
      height={300}
    />
  );
}

// Intersection Observer for custom lazy loading
import { useRef, useState, useEffect } from "react";

function useLazyLoad() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" } // start loading 200px before viewport
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function LazySection({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useLazyLoad();

  return (
    <div ref={ref}>
      {isVisible ? children : <Skeleton height={300} />}
    </div>
  );
}
```

<Callout type="tip">

**পারফরম্যান্স অপটিমাইজেশনের অগ্রাধিকার:**

1. **আগে মাপো** — Lighthouse, Chrome DevTools Performance tab, বা `web-vitals` ব্যবহার করো
2. **Bundle size কমাও** — code splitting, tree shaking, ছোট লাইব্রেরি
3. **Image অপটিমাইজ করো** — WebP/AVIF ব্যবহার করো, responsive srcset, lazy loading
4. **Render work কমাও** — memoization, লম্বা লিস্টের জন্য virtualization
5. **আক্রমণাত্মকভাবে cache করো** — service worker, CDN header, SWR প্যাটার্ন

</Callout>

## Tree Shaking

Tree shaking তোমার ফাইনাল bundle থেকে অব্যবহৃত export বাদ দেয়। এটা ES module-এর (`import`/`export`) সাথে কাজ করে — CommonJS (`require`)-এর সাথে নয়।

```typescript
// math.ts — library module
export function add(a: number, b: number) {
	return a + b;
}
export function subtract(a: number, b: number) {
	return a - b;
}
export function multiply(a: number, b: number) {
	return a * b;
}
export function divide(a: number, b: number) {
	return a / b;
}
export function power(a: number, b: number) {
	return Math.pow(a, b);
}

// app.ts — only uses add
import { add } from './math';
console.log(add(1, 2));

// After tree shaking: subtract, multiply, divide, power are removed from bundle
```

```typescript
// BAD: imports entire library (no tree shaking)
import _ from 'lodash';
_.debounce(fn, 300);

// GOOD: import only what you need
import debounce from 'lodash/debounce';
debounce(fn, 300);

// BETTER: use a tree-shakeable alternative
import { debounce } from 'lodash-es';
debounce(fn, 300);
```

## লম্বা লিস্টের জন্য Virtualization

10,000 DOM node render করা পারফরম্যান্স শেষ করে দেয়। Virtualization কেবল viewport-এ এখন দৃশ্যমান আইটেমগুলোই render করে।

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

function VirtualProductList({ products }: { products: Product[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // estimated row height in px
    overscan: 5,            // render 5 extra items above/below viewport
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const product = products[virtualItem.index];
          return (
            <div
              key={product.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ProductRow product={product} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## Memoization

অপ্রয়োজনীয় re-render আর ব্যয়বহুল পুনর্গণনা প্রতিরোধ করো।

```typescript
import { memo, useMemo, useCallback } from "react";

// memo — skip re-render if props haven't changed
const ProductCard = memo(function ProductCard({ product }: { product: Product }) {
  return (
    <div className="product-card">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <p>৳{product.price}</p>
    </div>
  );
});

// useMemo — cache expensive computations
function ProductAnalytics({ orders }: { orders: Order[] }) {
  const stats = useMemo(() => {
    // Expensive: processing 100k orders
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const avgOrder = totalRevenue / orders.length;
    const topProducts = calculateTopProducts(orders);
    return { totalRevenue, avgOrder, topProducts };
  }, [orders]); // only recalculates when orders changes

  return <StatsDisplay stats={stats} />;
}

// useCallback — stable function references for child components
function ProductPage() {
  const [cart, setCart] = useState<string[]>([]);

  const addToCart = useCallback((id: string) => {
    setCart((prev) => [...prev, id]);
  }, []);

  // ProductCard won't re-render because addToCart reference is stable
  return <ProductCard product={product} onAdd={addToCart} />;
}
```

<Callout type="warning">

**সবকিছু memoize করো না:**

- `memo`-এর একটা খরচ আছে — প্রতিটা render-এ এটাকে সব prop তুলনা করতে হয়। কেবল সেই কম্পোনেন্টে এটা ব্যবহার করো যেগুলো একই prop নিয়ে ঘন ঘন re-render হয়।
- `useMemo` আর `useCallback` জটিলতা বাড়ায়। আগে profile করো, কেবল সেখানেই optimize করো যেখানে মাপজোখ কোনো সমস্যা দেখায়।
- অকালে optimize করলে কোড পড়া কঠিন হয়ে যায়, অথচ কোনো মাপযোগ্য সুবিধা মেলে না।

</Callout>

## Bundle Analysis

তোমার JavaScript bundle-এ কী আছে তা ভিজ্যুয়ালাইজ করে bloat শনাক্ত করো।

```bash
# Next.js
npx @next/bundle-analyzer

# Vite
npx vite-bundle-visualizer

# Webpack
npx webpack-bundle-analyzer dist/stats.json
```

সাধারণ যা পাওয়া যায় আর সমাধান:

- `moment.js` (300KB) — `date-fns` (tree-shakeable) বা `dayjs` (2KB) দিয়ে বদলাও
- `lodash` (70KB) — tree shaking-এর জন্য `lodash-es` বা আলাদা আলাদা import ব্যবহার করো
- Duplicate dependency — `npm ls <package>` দিয়ে চেক করো
- অব্যবহৃত polyfill — শুধু আধুনিক ব্রাউজার টার্গেট করতে browserslist কনফিগার করো

## মূল কথা

1. **Core Web Vitals** (LCP, INP, CLS) হলো তিনটা মেট্রিক যা সবচেয়ে বেশি গুরুত্বপূর্ণ — বাস্তব ইউজার ডেটা দিয়ে সেগুলো মাপো
2. **Code splitting** route level-এ করাটা বেশিরভাগ অ্যাপের জন্য একক সবচেয়ে বড় পারফরম্যান্স জয়
3. **Lazy load** — image-কে natively `loading="lazy"` দিয়ে আর heavy কম্পোনেন্টকে `React.lazy` দিয়ে লোড করো
4. **Tree shaking** ES module-এর সাথে কাজ করে — named import আর tree-shakeable লাইব্রেরি ব্যবহার করো
5. হাজার হাজার DOM node render করার বদলে লম্বা লিস্ট **Virtualize** করো
6. **অপটিমাইজ করার আগে মাপো** — Lighthouse, bundle analyzer, আর DevTools profiler ব্যবহার করো
