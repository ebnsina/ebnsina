---
title: 'ডেটা ফেচিং প্যাটার্ন'
subtitle: 'Fetch, SWR, React Query, loading states, error boundaries, এবং caching strategy — শক্তিশালী ডেটা লেয়ার বানানোর জন্য।'
chapter: 5
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['fetch', 'SWR', 'react query', 'caching', 'error boundaries', 'loading states']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ভাবো, ইবনে সিনা একটা পুরনো অফিসে বসে আছেন, আর অফিসের সব রেকর্ড রাখা আছে দূরের একটা রেকর্ড রুমে। কারও কোনো তথ্য লাগলেই অফিস একজন রানারকে (দৌড়বাজ পিয়ন) সেই রেকর্ড রুমে পাঠায়। রানার যতক্ষণ বাইরে, ততক্ষণ কাউন্টারে একটা "একটু অপেক্ষা করুন" সাইনবোর্ড ঝুলিয়ে রাখা হয় — যেন সবাই জানে খোঁজ চলছে। কপাল খারাপ থাকলে রানার খালি হাতে ফেরে (ফাইল হারিয়ে গেছে, রুম বন্ধ), তখন কাউন্টারে একটা ছোট্ট দুঃখপ্রকাশের নোটিশ টাঙিয়ে দেওয়া হয় — "দুঃখিত, এই মুহূর্তে তথ্যটা আনা গেল না।"

কিন্তু আল-খোয়ারিজমি অফিসটাকে চালাক বানিয়েছেন। রানার একবার কোনো তথ্য নিয়ে ফিরলে সেই উত্তরটা সঙ্গে সঙ্গে কাউন্টারের পাশের বোর্ডে পিন করে রাখা হয় — পরেরবার একই তথ্য কেউ চাইলে আর রানারকে দৌড়াতে হয় না, বোর্ড থেকে চোখের পলকে দিয়ে দেওয়া যায়। তবে বোর্ডের পিন করা কাগজ তো পুরনো হয়ে যেতে পারে। তাই ফাতিমা আল-ফিহরি একটা সুন্দর নিয়ম করলেন — কেউ চাইলে বোর্ডের পুরনো কপিটা সঙ্গে সঙ্গে দেখিয়ে দাও (কাউকে অপেক্ষায় রেখো না), আর ঠিক তখনই চুপচাপ রানারকে পাঠিয়ে দাও নতুন কপি আছে কিনা যাচাই করতে; নতুন কিছু পেলে বোর্ডের কাগজটা বদলে দাও।

এই গল্পটাই আসলে data fetching। "একটু অপেক্ষা করুন" সাইনবোর্ড হলো **loading state**, দুঃখপ্রকাশের নোটিশ হলো **error state**, রানারের আনা উত্তর পাশের বোর্ডে পিন করে রাখা হলো response **cache** করা (পরের জন যেন সঙ্গে সঙ্গে পায়), আর পুরনো কপি আগে দেখিয়ে দিয়ে ব্যাকগ্রাউন্ডে নতুনটা যাচাই করাটাই **stale-while-revalidate**। বাস্তবে React Query বা SWR ঠিক এই অফিসটার মতো কাজ করে — তোমার হয়ে loading/error সামলায়, response cache করে রাখে, আর স্ক্রিনে বাসি ডেটা দেখানোর ফাঁকেই চুপিচুপি ফ্রেশ ডেটা revalidate করে আনে।

## ডেটা ফেচিং-এর চ্যালেঞ্জ

প্রতিটি ফ্রন্টএন্ড অ্যাপ্লিকেশনকেই API থেকে ডেটা ফেচ করতে হয়। কিন্তু কম্পোনেন্টগুলোর মধ্যে ছড়িয়ে-ছিটিয়ে থাকা raw `fetch` কল ডুপ্লিকেট loading/error লজিক, race condition, stale ডেটা আর waterfall-এর জন্ম দেয়। এই সমস্যাগুলো সমাধান করে এমন প্যাটার্ন আর লাইব্রেরিগুলো বোঝা রেসপন্সিভ, নির্ভরযোগ্য UI বানানোর জন্য অপরিহার্য।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ফুড ডেলিভারি অ্যাপ যেভাবে রেস্টুরেন্টের ডেটা লোড করে — প্রথমে ক্যাশ করা রেস্টুরেন্ট দেখায় (stale-while-revalidate), তারপর ব্যাকগ্রাউন্ডে ফ্রেশ ডেটা ফেচ করে। নেটওয়ার্ক ফেল করলেও তুমি শেষ পরিচিত মেনুটা দেখতে পাও।

</Callout>

## Level 0: Raw Fetch

সবচেয়ে বেসিক অ্যাপ্রোচ। কাজ করে, কিন্তু প্রতিটা কম্পোনেন্টে একই loading/error boilerplate লিখতে হয়।

```typescript
import { useState, useEffect } from "react";

interface Product {
  id: string;
  name: string;
  price: number;
}

function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setProducts(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setLoading(false);
        }
      }
    }

    fetchProducts();
    return () => { cancelled = true; }; // prevent state update on unmounted component
  }, []);

  if (loading) return <Skeleton count={6} />;
  if (error) return <ErrorMessage message={error.message} />;
  return <ProductGrid products={products} />;
}
```

এই অ্যাপ্রোচের সমস্যা:

- প্রতিটা ডেটা-ফেচিং কম্পোনেন্টে Boilerplate বারবার লিখতে হয়
- কোনো caching নেই — প্রতিবার mount-এ আবার ফেচ হয়
- কোনো deduplication নেই — একই URL ফেচ করা দুইটা কম্পোনেন্ট দুইটা আলাদা রিকোয়েস্ট পাঠায়
- কোনো background revalidation নেই

## Level 1: Custom Hook

প্যাটার্নটাকে একটা reusable hook-এ বের করে আনো। ভালো, কিন্তু এখনও caching আর deduplication নেই।

```typescript
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

// Usage
function ProductList() {
  const { data: products, loading, error } = useFetch<Product[]>("/api/products");

  if (loading) return <Skeleton count={6} />;
  if (error) return <ErrorMessage message={error.message} />;
  return <ProductGrid products={products!} />;
}
```

## Level 2: SWR (Stale-While-Revalidate)

SWR সাথে সাথেই ক্যাশ করা ডেটা রিটার্ন করে (stale), তারপর ব্যাকগ্রাউন্ডে ফ্রেশ ডেটা ফেচ করে (revalidate)। এতে ডেটা ফ্রেশ রেখেও তুমি ইনস্ট্যান্ট UI পাও।

```typescript
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

function ProductList() {
  const { data: products, error, isLoading, isValidating, mutate } = useSWR<Product[]>(
    "/api/products",
    fetcher,
    {
      revalidateOnFocus: true,       // refetch when tab regains focus
      revalidateOnReconnect: true,   // refetch when network reconnects
      dedupingInterval: 2000,        // deduplicate requests within 2s
    }
  );

  return (
    <div>
      {isValidating && <RefreshIndicator />}
      {isLoading && <Skeleton count={6} />}
      {error && <ErrorMessage message={error.message} retry={() => mutate()} />}
      {products && <ProductGrid products={products} />}
    </div>
  );
}
```

## Level 3: React Query (TanStack Query)

React Query, SWR প্যাটার্নের উপরে mutation সাপোর্ট, pagination, infinite scroll, আর আরও সূক্ষ্ম cache কন্ট্রোল যোগ করে।

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Queries — fetching data
function useProducts(category: string) {
  return useQuery({
    queryKey: ["products", category],   // cache key
    queryFn: () => fetchProducts(category),
    staleTime: 5 * 60 * 1000,          // fresh for 5 minutes
    gcTime: 30 * 60 * 1000,            // garbage collect after 30 min
    retry: 2,                           // retry failed requests twice
  });
}

// Mutations — modifying data
function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (item: { productId: string; quantity: number }) =>
      fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      }).then((r) => r.json()),

    // Optimistic update
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previous = queryClient.getQueryData<CartItem[]>(["cart"]);

      queryClient.setQueryData<CartItem[]>(["cart"], (old) => [
        ...(old ?? []),
        { ...newItem, id: "temp-" + Date.now(), name: "Loading..." },
      ]);

      return { previous };
    },

    onError: (_err, _newItem, context) => {
      queryClient.setQueryData(["cart"], context?.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}

// Usage in component
function ProductCard({ product }: { product: Product }) {
  const addToCart = useAddToCart();

  return (
    <div className="product-card">
      <h3>{product.name}</h3>
      <p>৳{product.price}</p>
      <button
        onClick={() => addToCart.mutate({ productId: product.id, quantity: 1 })}
        disabled={addToCart.isPending}
      >
        {addToCart.isPending ? "Adding..." : "Add to Cart"}
      </button>
    </div>
  );
}
```

<Callout type="tip">

**React Query cache key strategy:**

- অ্যারে ব্যবহার করো: `["products", category, { sort, page }]`
- স্পেসিফিক হও: শুধু `["product"]` নয়, `["product", id]`
- filter যাই হোক না কেন সব product query invalidate করতে `queryClient.invalidateQueries({ queryKey: ["products"] })` ব্যবহার করো
- hover-এ prefetch করো: ইনস্ট্যান্ট page transition-এর জন্য `queryClient.prefetchQuery(...)`

</Callout>

## Error Boundaries

Error boundary কম্পোনেন্ট ট্রি-তে rendering error ধরে ফেলে আর পুরো পেজ ক্র্যাশ করার বদলে fallback UI দেখায়।

```typescript
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    // Send to error tracking service
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.reset);
      }
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Usage with React Query
<ErrorBoundary fallback={(error, reset) => (
  <div className="error-panel">
    <p>Something went wrong: {error.message}</p>
    <button onClick={reset}>Try Again</button>
  </div>
)}>
  <Suspense fallback={<Skeleton count={6} />}>
    <ProductList />
  </Suspense>
</ErrorBoundary>
```

<Callout type="warning">

**ডেটা ফেচিং-এর সাধারণ ভুল:**

- **cleanup ছাড়া useEffect-এ ফেচ করা** — unmounted কম্পোনেন্টে state update আর race condition ঘটায়।
- **loading আর error state হ্যান্ডল না করা** — ইউজার ভাঙা UI বা খালি স্ক্রিন দেখে।
- **Waterfall fetching** — A আর B স্বাধীন হওয়া সত্ত্বেও A রিজলভ হওয়ার পরেই কেবল B ফেচ করা। `Promise.all` দিয়ে প্যারালালি ফেচ করো বা query গুলো একসাথে রাখো।
- **Over-fetching** — কম্পোনেন্ট শুধু 3টা field ব্যবহার করলেও 50টা field চাওয়া। GraphQL ব্যবহার করো বা ফোকাসড API endpoint বানাও।

</Callout>

## Pagination আর Infinite Scroll

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";

function useInfiniteProducts() {
  return useInfiniteQuery({
    queryKey: ["products", "infinite"],
    queryFn: ({ pageParam }) =>
      fetch(`/api/products?cursor=${pageParam}&limit=20`).then((r) => r.json()),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function InfiniteProductList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteProducts();

  const products = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <ProductGrid products={products} />
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading more..." : "Load More"}
        </button>
      )}
    </div>
  );
}
```

## মূল কথা

1. **Raw fetch** কাজ করে কিন্তু সব জায়গায় loading/error boilerplate পুনরাবৃত্তি করে
2. **SWR প্যাটার্ন** — stale cache সাথে সাথে সার্ভ করো, ব্যাকগ্রাউন্ডে revalidate করো, কখনো খালি স্ক্রিন দেখিও না
3. **React Query** mutation, optimistic update, pagination, আর সূক্ষ্ম cache কন্ট্রোল যোগ করে
4. **Error boundary** একটা ভাঙা কম্পোনেন্টকে পুরো পেজ ক্র্যাশ করা থেকে আটকায়
5. **প্যারালালি ফেচ করো** — স্বাধীন রিকোয়েস্টে সিকোয়েন্সিয়াল `await` নয়, `Promise.all` ব্যবহার করা উচিত
6. **Cache key** এমন বর্ণনামূলক অ্যারে হওয়া উচিত যা তারা যে ডেটা রিপ্রেজেন্ট করে তার সাথে ম্যাপ করে
