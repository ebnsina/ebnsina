---
title: 'Performance Optimization'
subtitle: 'Code splitting, lazy loading, tree shaking, bundle analysis, and Core Web Vitals — making your frontend fast.'
chapter: 6
level: 'advanced'
readingTime: '15 min'
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

## Why Performance Matters

Performance is not a feature — it is the foundation. A study by Google showed that a 1-second delay in mobile load time can reduce conversions by up to 20%. Users on slower connections and cheaper devices are especially impacted. Understanding the tools and techniques to measure and optimize frontend performance separates good developers from great ones.

<Callout type="info">

**Real-World Analogy**

Like optimizing a factory production line — code splitting is having separate lines for different products. Lazy loading is only powering up a machine when an order needs it.

</Callout>

## Core Web Vitals

Google's three metrics that measure real user experience:

| Metric                              | What It Measures    | Good       | Needs Work | Poor    |
| ----------------------------------- | ------------------- | ---------- | ---------- | ------- |
| **LCP** (Largest Contentful Paint)  | Loading performance | &lt; 2.5s  | 2.5–4s     | > 4s    |
| **INP** (Interaction to Next Paint) | Responsiveness      | &lt; 200ms | 200–500ms  | > 500ms |
| **CLS** (Cumulative Layout Shift)   | Visual stability    | &lt; 0.1   | 0.1–0.25   | > 0.25  |

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

Instead of shipping one massive JavaScript bundle, split your code into smaller chunks that load on demand.

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

## Lazy Loading Images and Components

Load resources only when they are needed — when they enter the viewport or when the user triggers an action.

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

**Performance optimization priority:**

1. **Measure first** — use Lighthouse, Chrome DevTools Performance tab, or `web-vitals`
2. **Reduce bundle size** — code splitting, tree shaking, smaller libraries
3. **Optimize images** — use WebP/AVIF, responsive srcsets, lazy loading
4. **Minimize render work** — memoization, virtualization for long lists
5. **Cache aggressively** — service workers, CDN headers, SWR patterns

</Callout>

## Tree Shaking

Tree shaking removes unused exports from your final bundle. It works with ES modules (`import`/`export`) — not CommonJS (`require`).

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

## Virtualization for Long Lists

Rendering 10,000 DOM nodes kills performance. Virtualization only renders the items currently visible in the viewport.

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

Prevent unnecessary re-renders and expensive recalculations.

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

**Do not memoize everything:**

- `memo` has a cost — it must compare all props on every render. Only use it on components that re-render with the same props frequently.
- `useMemo` and `useCallback` add complexity. Profile first, optimize only where measurements show a problem.
- Premature optimization makes code harder to read with no measurable benefit.

</Callout>

## Bundle Analysis

Visualize what is in your JavaScript bundle to identify bloat.

```bash
# Next.js
npx @next/bundle-analyzer

# Vite
npx vite-bundle-visualizer

# Webpack
npx webpack-bundle-analyzer dist/stats.json
```

Common findings and fixes:

- `moment.js` (300KB) — replace with `date-fns` (tree-shakeable) or `dayjs` (2KB)
- `lodash` (70KB) — use `lodash-es` for tree shaking or individual imports
- Duplicate dependencies — check with `npm ls <package>`
- Unused polyfills — configure browserslist to target modern browsers only

## Key Takeaways

1. **Core Web Vitals** (LCP, INP, CLS) are the three metrics that matter most — measure them with real user data
2. **Code splitting** at the route level is the single biggest performance win for most apps
3. **Lazy load** images natively with `loading="lazy"` and heavy components with `React.lazy`
4. **Tree shaking** works with ES modules — use named imports and tree-shakeable libraries
5. **Virtualize** long lists instead of rendering thousands of DOM nodes
6. **Measure before optimizing** — use Lighthouse, bundle analyzers, and DevTools profiler
