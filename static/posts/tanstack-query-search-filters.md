
---
title: TanStack Router + TanStack Query (Suspense) for Data Fetching with Pagination & Search
date: '2025-06-30'
tags: ['react', 'tanstack', 'router', 'query', 'pagination', 'suspense']
excerpt: Learn how to integrate TanStack Router with TanStack Query using Suspense for powerful, declarative data loading and route-aware pagination and search.
author: Ebn Sina
---

# 🚀 TanStack Router + TanStack Query (Suspense) with Pagination & Search

Fetching data in modern React apps should be **type-safe**, **suspense-enabled**, and **route-aware**. In this post, we'll use **TanStack Router** + **TanStack Query** to:

✅ Fetch paginated data via route `loader`  
✅ Handle loading and error states using Suspense  
✅ Use `validateSearch` for safe query param parsing  
✅ Sync pagination and search with URL  
✅ Keep things fast, modular, and scalable

---

## 🧱 1. Project Setup

Install the required packages:

```bash
npm install @tanstack/react-query @tanstack/react-router zod
```

---

## 🧠 2. Define the Backend API Function

Your backend returns paginated + filtered results, e.g., `/api/users?page=1&limit=10&search=john`.

```ts
// src/api/users.ts
import axios from 'axios'

export interface User {
  id: string
  name: string
  email: string
}

export interface UserListResponse {
  users: User[]
  total: number
  page: number
  limit: number
}

export async function fetchUsers(params: {
  page: number
  limit: number
  search?: string
}): Promise<UserListResponse> {
  const { data } = await axios.get('/api/users', {
    params,
  })
  return data
}
```

---

## 🌐 3. Configure TanStack Query + Router

### `queryClient.ts`

```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient()
```

### `main.tsx`

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from './lib/queryClient'
import { QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
)
```

---

## 📄 4. Route with `validateSearch` + `loader` + Suspense

```tsx
// src/routes/users.tsx
import {
  createFileRoute,
  useSearch,
  useLoaderData,
} from '@tanstack/react-router'
import { fetchUsers } from '../api/users'
import { z } from 'zod'

const SearchSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
})

export const Route = createFileRoute('/users')({
  validateSearch: SearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, search }) => {
    return context.queryClient.ensureQueryData({
      queryKey: ['users', search],
      queryFn: () => fetchUsers(search),
    })
  },
  component: UsersPage,
  pendingComponent: () => <div>🔄 Loading users...</div>,
  errorComponent: ({ error }) => <div>❌ Error: {error.message}</div>,
})
```

---

## 📦 5. The `UsersPage` Component (Uses Suspense + React Query)

```tsx
import { useQuery } from '@tanstack/react-query'
import { fetchUsers } from '../api/users'
import { Route } from './users'

export function UsersPage() {
  const search = Route.useSearch()
  const { data } = useQuery({
    queryKey: ['users', search],
    queryFn: () => fetchUsers(search),
  })

  const { users, total, page, limit } = data!

  return (
    <div>
      <h1>📄 Users</h1>

      <SearchForm initialSearch={search.search} />

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            <b>{user.name}</b> - {user.email}
          </li>
        ))}
      </ul>

      <PaginationControls page={page} limit={limit} total={total} />
    </div>
  )
}
```

---

## 🔍 6. Search & Pagination Components

### SearchForm

```tsx
import { useNavigate } from '@tanstack/react-router'
import { Route } from './users'

export function SearchForm({ initialSearch }: { initialSearch?: string }) {
  const navigate = useNavigate({ from: Route.id })
  const [term, setTerm] = React.useState(initialSearch ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        navigate({
          search: (prev) => ({ ...prev, search: term, page: 1 }),
        })
      }}
    >
      <input
        type="text"
        value={term}
        placeholder="Search by name"
        onChange={(e) => setTerm(e.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  )
}
```

---

### PaginationControls

```tsx
export function PaginationControls({
  page,
  limit,
  total,
}: {
  page: number
  limit: number
  total: number
}) {
  const navigate = useNavigate({ from: Route.id })
  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          disabled={p === page}
          onClick={() => navigate({ search: (s) => ({ ...s, page: p }) })}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
```

---

## 🔁 UX Bonus: Keep Previous Data While Loading

Enable `keepPreviousData` in `useQuery`:

```tsx
const { data, isFetching } = useQuery({
  queryKey: ['users', search],
  queryFn: () => fetchUsers(search),
  keepPreviousData: true,
})
```

Show a subtle loading indicator without blanking out the UI:

```tsx
{isFetching && <small>Updating...</small>}
```

---

## ✅ Summary

| Feature           | Implemented ✅ |
|-------------------|----------------|
| Typed search params | ✅ via `zod` |
| Suspense + fallback loading | ✅ |
| Error handling per route | ✅ |
| Pagination via URL | ✅ |
| Server-side search | ✅ |
| Sync with React Query | ✅ |

---

## 📌 Final Thoughts

TanStack Router + TanStack Query is a **powerful combo** for modern, scalable React apps:

- Everything is declarative and URL-driven
- Fetching is type-safe, cacheable, and integrated
- Clean fallback UI with Suspense
- Scales effortlessly for pagination, filters, sort, and more

Let me know if you'd like a **template repo**, **role-based auth**, or **mutation + invalidate example** next!
