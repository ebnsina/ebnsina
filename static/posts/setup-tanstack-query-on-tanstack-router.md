---
title: How to setup TanStack Query on TanStack router
date: '2025-06-30'
tags: ['react', 'tanstack', 'query', 'router']
excerpt: Setup TanStack Query on TanStack router
---

This guide walks you through integrating TanStack Query with TanStack Router in a React project for seamless data fetching and route-based data management.

1. Install Required Packages
```sh
npm install @tanstack/react-query @tanstack/react-query-devtools
```

2. Setup the Query Client
```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
```

3. Wrap Your App with Providers

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient()

// Set up a Router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
```

4. Define Routes and Use loader for Query Integration

Example route using loader with queryClient.fetchQuery():
```tsx
// src/routes/posts.route.tsx
import { createFileRoute } from '@tanstack/react-router';
import { queryClient } from '../lib/queryClient';
import { fetchPosts } from '../api/posts';

export const Route = createFileRoute('/posts')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['posts'],
      queryFn: fetchPosts,
    }),
  component: PostsComponent,
});

function PostsComponent() {
  const { data } = useQuery({ queryKey: ['posts'], queryFn: fetchPosts });

  return (
    <div>
      <h1>Posts</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

5. Add React Query Devtools (Optional)
```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <RouterProvider router={router} />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

Alternative: Use useQuery Directly in Component
```tsx
import { useQuery } from '@tanstack/react-query';

function Posts() {
  const { data, isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  if (isLoading) return <div>Loading...</div>;
  return <pre>{JSON.stringify(data)}</pre>;
}
```