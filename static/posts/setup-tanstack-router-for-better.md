---
title: Setup TanStack router for better
date: '2025-05-09'
tags: ['react', 'tanstack', 'shadcn', 'typescript']
excerpt: In this post i will show you how to setup tanstack router with shadcn, tanstack query for better software building
---

## Install TanStack router with shadcn

```sh
npx create-tsrouter-app@latest my-better-tanstack-app --template file-router --tailwind --add-ons shadcn
```

Then add any shadcn component

```sh
npx shadcn@canary add button
```

## Install TanStack and query and setup with router also implement auth

__root.tsx
```
import type { AuthContextType } from "@/store/AuthContext"; // import AuthContext
import type { QueryClient } from "@tanstack/react-query"; // import queryClient
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

interface MyRouterContext { // create type/interface for router context
  auth: AuthContextType;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({ // pass router context
  component: () => (
    <>
      <div className="flex flex-col justify-between min-h-screen">
        <Header />
        <div className="container mx-auto px-4 md:px-0 py-6">
          <Outlet />
        </div>
        <Footer />
      </div>

      <Toaster />
      <TanStackRouterDevtools />
    </>
  ),
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    );
  },
});
```

main.tsx
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // import pkg
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

const queryClient = new QueryClient(); // create query client 

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import reportWebVitals from "./reportWebVitals.ts";
import { AuthProvider, useAuth } from "./store/AuthContext.tsx"; // Import AuthContext
import "./styles.css";

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // pass auth context as undefined initially
    queryClient: queryClient, // pass queryClient context
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();

  return <RouterProvider router={router} context={{ auth }} />;
}

// Render the app
const rootElement = document.getElementById("app");

if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}> // Wrap provider
        <AuthProvider>
          <InnerApp />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
```

Access here like this:
```tsx
export const Route = createFileRoute("/signin")({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticate) {
      throw redirect({ to: search.redirect || FALLBACK_ROUTE });
    }
  },
  validateSearch: redirectSchema,
  component: () => <div>Sign In</div>,
});
```
