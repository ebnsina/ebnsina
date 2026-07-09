---
title: 'রাউটিং ও নেভিগেশন'
subtitle: 'আধুনিক ওয়েব অ্যাপের জন্য client-side routing, file-based routing, dynamic routes, nested layouts, আর middleware।'
chapter: 4
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['routing', 'navigation', 'dynamic routes', 'layouts', 'middleware']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Routing কীভাবে কাজ করে

সাধারণ একটা ওয়েবসাইটে প্রতিটা navigation সার্ভার থেকে পুরো পেজ লোড ট্রিগার করে। আধুনিক একটা SPA-তে routing হয় client-এ — JavaScript link ক্লিক intercept করে, URL update করে, আর পুরো reload ছাড়াই দৃশ্যমান কম্পোনেন্ট বদলে দেয়। দুটো মডেল আর তার মাঝামাঝি hybrid approach বোঝা frontend আর্কিটেকচারের জন্য জরুরি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা mall directory-র মতো — /floor/3/shop/42 তোমাকে একটা নির্দিষ্ট দোকানে নিয়ে যায়। Nested layout হলো mall → floor → wing → shop হায়ারার্কির মতো।

</Callout>

## Client-Side Routing-এর মূল বিষয়

মূলত, client-side routing History API ব্যবহার করে সার্ভার রিকোয়েস্ট ট্রিগার না করেই URL বদলায়।

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

বেশিরভাগ আধুনিক framework ফাইল সিস্টেমকে অটোমেটিক route-এ ম্যাপ করে। এটা ম্যানুয়াল route কনফিগারেশন পুরোপুরি বাদ দিয়ে দেয়।

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

## Dynamic Routes আর Parameters

Dynamic segment তোমাকে URL-এর পরিবর্তনশীল অংশ match করতে আর সেগুলোকে parameter হিসেবে বের করে আনতে দেয়।

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

Nested layout তোমাকে navigation-এর সময় re-render না করেই একগুচ্ছ পেজ জুড়ে UI chrome (header, sidebar, footer) শেয়ার করতে দেয়।

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

**Layout ডিজাইনের নীতি:**

- Root layout গ্লোবাল বিষয় সামলায়: font, theme provider, error boundary
- Section layout navigation সামলায়: sidebar, breadcrumb, sub-navigation
- Layout পাতলা রাখো — এগুলো অর্কেস্ট্রেট করবে, business logic ধরে রাখবে না
- URL-এ প্রভাব না ফেলে layout শেয়ার করতে route group `(groupName)` ব্যবহার করো

</Callout>

## Route Guard আর Middleware

Middleware একটা route render হওয়ার আগে চলে। authentication check, redirect, আর request পরিবর্তনের জন্য এটা ব্যবহার করো।

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

**Routing-এর সাধারণ ভুল:**

- **Client-only auth guard** নিরাপদ নয়। সবসময় সার্ভারে token যাচাই করো। একটা client guard শুধু UX উন্নত করে — এটা protected পেজের ঝলক (flash) দেখানো ঠেকায়।
- **Catch-all route ভুলে যাওয়া** — unmatched URL-এর জন্য সবসময় একটা 404 পেজ যোগ করো।
- **URL হার্ডকোড করা** — route বদলালে ভাঙা link এড়াতে route constant বা একটা type-safe router ব্যবহার করো।

</Callout>

## Search Params আর URL State

URL search parameter হলো এক ধরনের state। এগুলো শেয়ার করা যায়, bookmark করা যায়, আর পেজ refresh-এও টিকে থাকে।

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

## মূল শেখার বিষয়

1. **Client-side routing** History API ব্যবহার করে পুরো পেজ reload ছাড়াই কন্টেন্ট বদলায়
2. **File-based routing** তোমার ডিরেক্টরি স্ট্রাকচারকে অটোমেটিক URL-এ ম্যাপ করে
3. **Dynamic segment** (`[id]`, `:id`) URL-এর পরিবর্তনশীল অংশকে parameter হিসেবে বের করে আনে
4. **Nested layout** route group জুড়ে UI chrome শেয়ার করে আর যা বদলায় শুধু সেটাই re-render করে
5. **Middleware আর guard** render হওয়ার আগে auth, redirect, আর request প্রসেসিং সামলায়
6. **URL search param** হলো state — filter, pagination, আর শেয়ারযোগ্য view-এর জন্য এগুলো ব্যবহার করো
