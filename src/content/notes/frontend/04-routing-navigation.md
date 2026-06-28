---
title: 'Routing & Navigation'
subtitle: 'Client-side routing, file-based routing, dynamic routes, nested layouts, and middleware for modern web apps.'
chapter: 4
level: 'intermediate'
readingTime: '12 min'
topics: ['routing', 'navigation', 'dynamic routes', 'layouts', 'middleware']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## How Routing Works

In a traditional website, every navigation triggers a full page load from the server. In a modern SPA, routing happens on the client — JavaScript intercepts link clicks, updates the URL, and swaps the visible component without a full reload. Understanding both models and the hybrid approaches in between is essential for frontend architecture.

<Callout type="info">

**Real-World Analogy**

Like a mall directory — /floor/3/shop/42 takes you to a specific store. Nested layouts are like the mall → floor → wing → shop hierarchy.

</Callout>

## Client-Side Routing Basics

At its core, client-side routing uses the History API to change the URL without triggering a server request.

```typescript
// How client-side routing works under the hood
// 1. Intercept clicks on <a> tags
document.addEventListener('click', (e) => {
	const anchor = (e.target as HTMLElement).closest('a');
	if (!anchor || anchor.origin !== window.location.origin) return;

	e.preventDefault();

	// 2. Push the new URL to browser history
	window.history.pushState({}, '', anchor.href);

	// 3. Match the URL to a component and render it
	renderRoute(anchor.pathname);
});

// 4. Handle browser back/forward
window.addEventListener('popstate', () => {
	renderRoute(window.location.pathname);
});
```

## File-Based Routing

Most modern frameworks map the file system to routes automatically. This eliminates manual route configuration entirely.

```
src/pages/
├── index.tsx          → /
├── about.tsx          → /about
├── blog/
│   ├── index.tsx      → /blog
│   └── [slug].tsx     → /blog/hello-world, /blog/any-slug
├── products/
│   ├── index.tsx      → /products
│   ├── [id].tsx       → /products/123
│   └── [...path].tsx  → /products/a/b/c (catch-all)
└── (auth)/
    ├── layout.tsx     → shared layout for login & register
    ├── login.tsx      → /login
    └── register.tsx   → /register
```

```typescript
// Next.js App Router: src/app/products/[id]/page.tsx
interface ProductPageProps {
  params: { id: string };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await fetchProduct(params.id);

  return (
    <div>
      <h1>{product.name}</h1>
      <p>৳{product.price}</p>
    </div>
  );
}

// Generate static params at build time
export async function generateStaticParams() {
  const products = await fetchAllProducts();
  return products.map((p) => ({ id: p.id }));
}
```

## Dynamic Routes and Parameters

Dynamic segments let you match variable URL parts and extract them as parameters.

```typescript
// React Router v6 — dynamic segments
import { createBrowserRouter, RouterProvider, useParams } from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "products/:id", element: <ProductDetailPage /> },
      { path: "categories/:category/products", element: <CategoryProductsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

// Accessing route params
function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProduct(id!).then(setProduct);
  }, [id]);

  if (!product) return <Skeleton />;
  return <ProductView product={product} />;
}
```

## Nested Layouts

Nested layouts let you share UI chrome (headers, sidebars, footers) across groups of pages without re-rendering them on navigation.

```typescript
// Next.js App Router layout nesting
// src/app/layout.tsx — root layout (wraps everything)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}

// src/app/dashboard/layout.tsx — dashboard layout (nested inside root)
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-container">
      <DashboardSidebar />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}

// src/app/dashboard/analytics/page.tsx
// This page gets: RootLayout > DashboardLayout > AnalyticsPage
export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
```

<Callout type="tip">

**Layout design principles:**

- Root layout handles global concerns: fonts, theme provider, error boundaries
- Section layouts handle navigation: sidebar, breadcrumbs, sub-navigation
- Keep layouts thin — they should orchestrate, not contain business logic
- Use route groups `(groupName)` to share layouts without affecting the URL

</Callout>

## Route Guards and Middleware

Middleware runs before a route renders. Use it for authentication checks, redirects, and request modification.

```typescript
// Next.js middleware — runs on the edge before every request
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
	const token = request.cookies.get('auth-token')?.value;
	const { pathname } = request.nextUrl;

	// Redirect unauthenticated users from protected routes
	const protectedPaths = ['/dashboard', '/settings', '/orders'];
	const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

	if (isProtected && !token) {
		const loginUrl = new URL('/login', request.url);
		loginUrl.searchParams.set('redirect', pathname);
		return NextResponse.redirect(loginUrl);
	}

	// Redirect authenticated users away from auth pages
	if (token && (pathname === '/login' || pathname === '/register')) {
		return NextResponse.redirect(new URL('/dashboard', request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ['/dashboard/:path*', '/settings/:path*', '/orders/:path*', '/login', '/register']
};
```

```typescript
// React Router v6 — route guard as a wrapper component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Usage in route config
{
  path: "dashboard",
  element: (
    <ProtectedRoute>
      <DashboardLayout />
    </ProtectedRoute>
  ),
  children: [
    { index: true, element: <DashboardHome /> },
    { path: "orders", element: <OrdersPage /> },
  ],
}
```

<Callout type="warning">

**Common routing mistakes:**

- **Client-only auth guards** are not secure. Always validate tokens on the server. A client guard only improves UX — it prevents a flash of the protected page.
- **Forgetting the catch-all route** — always add a 404 page for unmatched URLs.
- **Hardcoding URLs** — use route constants or a type-safe router to avoid broken links when routes change.

</Callout>

## Search Params and URL State

URL search parameters are a form of state. They are shareable, bookmarkable, and survive page refreshes.

```typescript
import { useSearchParams } from "react-router-dom";

function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "newest";
  const page = Number(searchParams.get("page") ?? "1");

  const updateFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      prev.set(key, value);
      if (key !== "page") prev.set("page", "1"); // reset page on filter change
      return prev;
    });
  };

  // URL: /products?category=phones&sort=price-asc&page=2
  return (
    <div>
      <FilterBar category={category} sort={sort} onChange={updateFilter} />
      <ProductGrid category={category} sort={sort} page={page} />
      <Pagination current={page} onChange={(p) => updateFilter("page", String(p))} />
    </div>
  );
}
```

## Key Takeaways

1. **Client-side routing** uses the History API to swap content without full page reloads
2. **File-based routing** maps your directory structure to URLs automatically
3. **Dynamic segments** (`[id]`, `:id`) extract variable parts of URLs as parameters
4. **Nested layouts** share UI chrome across route groups and only re-render what changes
5. **Middleware and guards** handle auth, redirects, and request processing before rendering
6. **URL search params** are state — use them for filters, pagination, and shareable views
