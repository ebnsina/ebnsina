---
title: How to Set Up DIY auth with TanStack Router
date: '2025-06-30'
tags: ['React', 'TanStack Query', 'TanStack Router', 'Data Fetching', 'Routing']
excerpt: Learn how to integrate TanStack Query (React Query) with TanStack Router for data fetching, caching, and route-based loading in React applications.
author: Ebn Sina
description: A step-by-step guide to setting up TanStack Query with TanStack Router, including context setup, route loaders, caching, and authentication-aware data fetching in React.
---



# DIY Auth with TanStack Router 

Want to build your own authentication system using **TanStack Router** without Firebase or Auth0? This guide walks you through everything: route guards, login/logout flow, and handling `redirectTo` after login.

---

## What You'll Build

✅ Auth state (with token in localStorage)  
✅ Route guards using `beforeLoad`  
✅ Login page with smart redirect  
✅ Logout functionality  
✅ Type-safe router context

---

## 1. Install TanStack Router

```bash
npm install @tanstack/react-router
```

2. Configure __root route for router context
```tsx
import * as React from 'react'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import type { AuthContext } from '../auth'

interface MyRouterContext {
  auth: AuthContext
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" initialIsOpen={false} />
    </>
  ),
})
```

2. Create Auth Context
```tsx
// src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import axios from 'axios'

interface User {
  id: string
  email: string
  token: string
}

interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (email: string, password: string) => Promise<void>
}

const AuthCtx = createContext<AuthContextType | null>(null)

const key = 'tanstack.auth.user'

function getStoredUser(): User | null {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function setStoredUser(user: User | null) {
  if (user) {
    localStorage.setItem(key, JSON.stringify(user))
  } else {
    localStorage.removeItem(key)
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(getStoredUser())
  const isAuthenticated = !!user

  useEffect(() => {
    setUser(getStoredUser())
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await axios.post<User>('/api/login', { email, password })
    const user = response.data
    setStoredUser(user)
    setUser(user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const response = await axios.post<User>('/api/register', { email, password })
    const user = response.data
    setStoredUser(user)
    setUser(user)
  }, [])

  const logout = useCallback(async () => {
    setStoredUser(null)
    setUser(null)
  }, [])

  return (
    <AuthCtx.Provider
      value={{
        isAuthenticated,
        user,
        login,
        logout,
        register,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

3. Setup Router with Auth Context
```tsx
// src/main.ts
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { AuthProvider, useAuth } from './auth'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Will be injected at runtime
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function InnerApp() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  </React.StrictMode>
)
```


4. Create Protected Layout

```tsx
// src/routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirectTo: location.href },
      })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const auth = useAuth()

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      auth.logout().then(() => {
        router.invalidate().finally(() => {
          navigate({ to: '/' })
        })
      })
    }
  }

  return (
    <div className="p-2 h-full">
      <h1>Authenticated Route</h1>
      <p>This route's content is only visible to authenticated users.</p>

      <ul className="py-2 flex gap-2">
        <li>
          <Link
            to="/dashboard"
            className="hover:underline data-[status='active']:font-semibold"
          >
            Dashboard
          </Link>
        </li>
        <li>
          <button
            type="button"
            className="hover:underline"
            onClick={handleLogout}
          >
            Logout
          </button>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
```

5. Login Page with redirectTo Support

```tsx
// src/routes/login.tsx
import { z } from 'zod' 
import {
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useAuth } from '../auth'

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const fallback = '/dashboard' as const

const LoginSearchSchema = z.object({
  redirectTo: z.string().optional().catch(''),
})

export const Route = createFileRoute('/login')({
  validateSearch: LoginSearchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirectTo || fallback })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const navigate = useNavigate({ from: Route.id })
  const { redirectTo } = Route.useSearch() 

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()

    const data = new FormData(e.currentTarget);
    const email = data.get('email);
    const password = data.get('password);

    await auth.login(email, password);
    await router.invalidate();

    await navigate({ to: search.redirect || fallback })
  }

  return (
    <div>
      <h1>Login</h1>

      <form onSubmit={handleLogin}>
      <input name="email" placeholder="Enter email" type="email" className="border rounded-md p-2 w-full" required />
      <input name="password" placeholder="Enter password" type="password" className="border rounded-md p-2 w-full" required />
        <button type="submit">Login</button>
      </form>
    </div>
  )
}
```

6. Example Protected Route
```tsx
// src/routes/_authenticated/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
    </div>
  )
}
```
