---
title: "Data Fetching Patterns"
subtitle: "Fetch, SWR, React Query, loading states, error boundaries, and caching strategies for robust data layers."
chapter: 5
level: "intermediate"
readingTime: "14 min"
topics: ["fetch", "SWR", "react query", "caching", "error boundaries", "loading states"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Data Fetching Challenge

Every frontend application needs to fetch data from APIs. But raw `fetch` calls scattered throughout your components lead to duplicated loading/error logic, race conditions, stale data, and waterfalls. Understanding the patterns and libraries that solve these problems is essential for building responsive, reliable UIs.

<Callout type="info">

**Real-World Analogy**

Like how a food delivery app loads restaurant data — first shows cached restaurants (stale-while-revalidate), then fetches fresh data in the background. If the network fails, you still see the last known menu.

</Callout>

## Level 0: Raw Fetch

The most basic approach. Works, but you end up writing the same loading/error boilerplate in every component.

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

Problems with this approach:
- Boilerplate repeated in every data-fetching component
- No caching — refetching on every mount
- No deduplication — two components fetching the same URL make two requests
- No background revalidation

## Level 1: Custom Hook

Extract the pattern into a reusable hook. Better, but still missing caching and deduplication.

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

SWR returns cached data immediately (stale), then fetches fresh data in the background (revalidate). This gives you instant UI while keeping data fresh.

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

React Query adds mutation support, pagination, infinite scroll, and more granular cache control on top of the SWR pattern.

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
- Use arrays: `["products", category, { sort, page }]`
- Be specific: `["product", id]` not just `["product"]`
- Use `queryClient.invalidateQueries({ queryKey: ["products"] })` to invalidate all product queries regardless of filters
- Prefetch on hover: `queryClient.prefetchQuery(...)` for instant page transitions

</Callout>

## Error Boundaries

Error boundaries catch rendering errors in the component tree and display fallback UI instead of crashing the whole page.

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

**Common data fetching mistakes:**
- **Fetching in useEffect without cleanup** — causes state updates on unmounted components and race conditions.
- **Not handling loading and error states** — users see broken UI or empty screens.
- **Waterfall fetching** — fetching B only after A resolves when they are independent. Fetch in parallel with `Promise.all` or colocate queries.
- **Over-fetching** — requesting 50 fields when the component only uses 3. Use GraphQL or create focused API endpoints.

</Callout>

## Pagination and Infinite Scroll

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

## Key Takeaways

1. **Raw fetch** works but repeats loading/error boilerplate everywhere
2. **SWR pattern** — serve stale cache instantly, revalidate in background, never show blank screens
3. **React Query** adds mutations, optimistic updates, pagination, and granular cache control
4. **Error boundaries** prevent one broken component from crashing the entire page
5. **Fetch in parallel** — independent requests should use `Promise.all`, not sequential `await`
6. **Cache keys** should be descriptive arrays that map to the data they represent

