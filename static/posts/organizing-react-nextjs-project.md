---
title: Organizing Your React/Next.js App - Feature-Based vs Component-Based Structure
date: '2024-03-15'
tags: ['react', 'nextjs', 'typescript']
excerpt: This is an example blog post for our SvelteKit portfolio website.
---

## Ceremony

For an enterprise-level React/Next.js app, it's important to organize the project in a way that promotes scalability, maintainability, and a clean separation of concerns. Here’s a recommended project structure for an enterprise-level app:

Here’s an example of a that compares two common folder structures for a React/Next.js application: feature-based and component-based structures.

When building a React or Next.js app, one of the most important decisions is how to organize your project’s folder structure. A well-organized codebase enhances productivity, improves scalability, and makes the app easier to maintain in the long run. In this post, we'll explore **two common folder structures** for enterprise-level apps: **Feature-Based** and **Component-Based**.

## Why Folder Structure Matters

A project’s folder structure defines how files are organized and how code can be reused. Especially in large-scale apps, keeping things modular and well-organized is critical. Let's dive into the two most common ways to structure a Next.js app.

## Component-Based Structure

A **component-based structure** groups files by their type, organizing all components, hooks, services, and contexts into separate directories. This approach is common in small to medium-sized applications.

### Example Structure

Here’s an example of a **component-based folder structure**:

```bash
/src
├── /api
│   └── /auth.js        # API services related to authentication
│   └── /users.js       # API services related to user management
├── /components
│   └── /common         # Reusable UI components (buttons, modals, etc.)
│   └── /auth           # Components related to authentication (LoginForm, SignupForm)
│   └── /dashboard      # Components related to the dashboard
├── /contexts
│   └── /AuthContext.js # Context for authentication
│   └── /ThemeContext.js # Context for theming
├── /hooks
│   └── /useAuth.js     # Custom hooks for authentication
│   └── /useFetch.js    # Custom hooks for data fetching
├── /pages              # Next.js pages (routes)
│   └── /index.js
│   └── /login.js
│   └── /dashboard.js
├── /services           # API service files
│   └── /authService.js
│   └── /userService.js
└── /utils              # Utility functions (helpers, formatters, etc.)
    └── /dateUtils.js
    └── /storage.js
```

### Pros of Component-Based Structure

Clear separation of concerns: Each type of resource (components, hooks, services) has its own directory.
Easy to find related files: If you need a particular hook or component, it’s easy to locate.

### Cons of Component-Based Structure

Difficult to scale: As the app grows, it can be hard to manage files related to a single feature across multiple directories.
Tight coupling: Sometimes components and hooks are tightly coupled with specific features, but this structure doesn’t group them by features, which can lead to disorganization.

## Feature-Based Structure

A feature-based structure organizes files by feature or module rather than by type. This approach is often more scalable for enterprise-level applications, as each feature has its own self-contained folder for components, hooks, services, and contexts.

Example Structure
Here’s an example of a feature-based folder structure:

```bash
/src
├── /features
│ └── /auth # Authentication feature
│ ├── /components # Components related to authentication (LoginForm, SignupForm)
│ ├── /hooks # Feature-specific custom hooks (useLogin, useAuth)
│ ├── /context # Authentication context
│ ├── /services # API services for authentication (login, signup)
│ └── /index.js # Export all module-related files
│ └── /dashboard # Dashboard feature
│ ├── /components # Dashboard components (StatsCard, ActivityFeed)
│ ├── /hooks # Feature-specific hooks (useDashboardData)
│ └── /services # API services related to the dashboard
├── /pages # Next.js pages
│ └── /index.js
│ └── /login.js
│ └── /dashboard.js
└── /utils # Utility functions shared across features
└── /dateUtils.js
```

This is how every features looks like -

```bash
/features
├── /auth                # Authentication feature/module
│   ├── /components      # Components related to authentication (LoginForm, SignupForm, etc.)
│   ├── /hooks           # Feature-specific custom hooks (e.g., useAuth, useLogin)
│   ├── /context         # Context API related to authentication
│   ├── /services        # API services related to authentication (login, signup, etc.)
│   ├── /types           # TypeScript types (if using TS)
│   └── index.js         # Export module-related files (optional)
│
├── /dashboard           # Dashboard feature/module
│   ├── /components      # Components related to the dashboard (StatsCard, RecentActivity, etc.)
│   ├── /hooks           # Feature-specific hooks (e.g., useDashboardData)
│   ├── /services        # API services related to dashboard data
│   ├── /context         # Context API or state related to the dashboard
│   ├── /types           # TypeScript types (if using TS)
│   └── index.js         # Export module-related files (optional)
│
├── /profile             # Profile management feature/module
│   ├── /components      # Components related to user profile (ProfileForm, AvatarUploader, etc.)
│   ├── /hooks           # Feature-specific hooks (e.g., useProfileData)
│   ├── /services        # API services related to user profiles
│   └── /context         # Context API or state related to profile management
│
└── /products            # Products feature/module
    ├── /components      # Components related to products (ProductCard, ProductList, etc.)
    ├── /hooks           # Feature-specific hooks (e.g., useProductData)
    ├── /services        # API services related to products
    └── /context         # Context API or state related to products
```

## Key Points:

- /components: Store components specific to the feature/module. These are typically not shared across other modules and are used within the scope of the specific feature.

- /hooks: Feature-specific custom hooks that encapsulate logic related to the feature, like useAuth, useDashboardData, or useProfile.

- /context: Context API files for managing the state related to the feature/module. For example, AuthContext for authentication or ProfileContext for profile management.

- /services: API service files that handle HTTP requests for that specific feature/module. For example, authService.js for login, registration, and token handling.

- /types: (Optional) TypeScript type definitions related to the feature (interfaces, types). This is optional, based on your project’s use of TypeScript.

- index.js: (Optional) You can add an index.js file to export all feature-related files for easier imports when using that module elsewhere in the app.

## Benefits:

Modular organization: Keeps feature-specific components and logic encapsulated and easily maintainable.
Separation of concerns: Each feature is self-contained with its own components, logic, and services.

Scalability: As new features or modules are added, they can follow the same structure, maintaining consistency across the codebase.
For shared components that are used across multiple features, keep them in the /components/common directory.

This separation ensures modularity and clean separation between feature-specific and common components.

Here’s how an index.js file might look for the auth feature module:

```js
// features/auth/index.js

// Export all components
export { default as LoginForm } from './components/LoginForm';
export { default as SignupForm } from './components/SignupForm';

// Export custom hooks
export { useAuth } from './hooks/useAuth';
export { useLogin } from './hooks/useLogin';

// Export context and provider
export { AuthContext, AuthProvider } from './context/AuthContext';

// Export services
export { login, signup, logout } from './services/authService';

// Export types (if using TypeScript)
export * from './types';
```

## How to use it:

Now, instead of importing individual files like this:

```js
import { LoginForm } from 'features/auth/components/LoginForm';
import { useAuth } from 'features/auth/hooks/useAuth';
import { AuthProvider } from 'features/auth/context/AuthContext';
import { login } from 'features/auth/services/authService';
```

You can simply import them like this:

```js
import { LoginForm, useAuth, AuthProvider, login } from 'features/auth';
```

## Benefits:

Cleaner imports: It reduces the amount of import clutter, especially for large feature sets.
Centralized exports: Any changes in file paths or new exports can be handled centrally without changing imports across multiple files.

Scalability: As the module grows with more hooks, components, or services, they can all be added to the index.js and remain organized.

### Pros of Feature-Based Structure

Modular and self-contained: Each feature is self-contained, with components, services, and hooks living in the same directory.

Scalable: It’s easier to scale and maintain large codebases, as new features can be added without disrupting the structure.
Easier collaboration: Teams working on different features can work independently in separate feature directories.

### Cons of Feature-Based Structure

Redundancy: Some components or hooks might need to be duplicated if they’re needed across multiple features (though this can be mitigated by moving them to a /common or /shared folder).

## Full Example

```bash
/sina-saas-app
│
├── /public
│   └── favicon.ico
│   └── /assets     # Static assets like images, fonts, etc.
│
├── /src
│   ├── /api        # API services or wrappers for data fetching (e.g., Axios or fetch)
│   │   └── /services  # Grouped API service files (e.g., auth, users, products, etc.)
│   │   └── /endpoints.js  # Centralized API endpoints file
│   │
│   ├── /components
│   │   └── /common      # Reusable common components (buttons, forms, modals, etc.)
│   │   └── /layout      # Components for layout (header, footer, sidebar, etc.)
│   │   └── /specific    # Page-specific or complex components
│   │   └── /icons       # Custom icons or icon wrappers
│   │
│   ├── /config       # Configuration files (API configs, environment variables, etc.)
│   │   └── index.js  # Exporting environment variables
│   │
│   ├── /contexts     # React Context API for managing global states (e.g., AuthContext, ThemeContext)
│   │
│   ├── /features     # Feature-based modular structure (e.g., users, products, dashboard)
│   │   └── /auth     # Example feature (grouping components, hooks, context for authentication)
│   │   └── /dashboard
│   │   └── /profile
│   │
│   ├── /hooks        # Custom hooks (e.g., `useFetch`, `useAuth`)
│   │   └── useAuth.js
│   │
│   ├── /pages        # Next.js Pages (routes)
│   │   └── /api      # API routes (for Next.js API routes)
│   │   └── /_app.js  # Custom Next.js App file
│   │   └── /_document.js  # Custom Document file for server-side logic
│   │   └── /index.js  # Landing page
│   │
│   ├── /store        # State management (Redux, Zustand, etc.)
│   │   └── /slices   # State slices (Redux toolkit reducers and actions)
│   │   └── store.js  # Store configuration
│   │
│   ├── /styles       # Global styles and theme (Tailwind, SCSS, CSS Modules, etc.)
│   │   └── /global.css  # Global styles
│   │   └── /theme.js    # Theme variables (colors, fonts)
│   │
│   ├── /utils        # Utility functions (formatting, helper functions)
│   │   └── dateUtils.js  # Date formatting helpers
│   │   └── constants.js  # App-wide constants
│   │
│   ├── /middleware   # Middleware logic for handling requests, routes, etc.
│   │   └── auth.js   # Middleware for authentication logic
│   │
│   ├── /lib          # Reusable libraries (e.g., authentication logic, JWT handling)
│   │
│   └── /tests        # Test files for unit, integration, or end-to-end testing
│       └── /unit     # Unit tests
│       └── /e2e      # End-to-end tests (e.g., Cypress)
│       └── /mocks    # Mocks and fixtures for testing
│
├── .env              # Environment variables
├── .eslintrc.js      # ESLint configuration
├── .prettierrc       # Prettier configuration
├── next.config.js    # Next.js configuration
├── package.json      # Dependencies and scripts
├── README.md         # Project documentation
└── tsconfig.json     # TypeScript configuration (if using TypeScript)
```

### Key Directories:

- /api: API service files for making HTTP requests, including service logic for each API group (auth, users, products, etc.).

- /components: Reusable UI components, often split into common components, layout, and more complex ones.

- /config: Application-level configuration such as API base URLs, environment variable handling, etc.

- /contexts: React Context API for global state management like authentication or theme.

- /features: Modular organization where each feature (like users, profile, dashboard) has its own folder for components, hooks, contexts, and logic.

- /hooks: Custom React hooks for encapsulating reusable logic.

- /pages: Standard Next.js routing structure with pages for handling routes.

- /store: State management using Redux, Zustand, or other libraries.

- /styles: Tailwind CSS or other styling methods (global styles, theme variables).

- /utils: Helper and utility functions.

- /tests: Unit, integration, and end-to-end tests, along with mocks for testing.

This structure helps with modularization, better collaboration among teams, and scalability, crucial for enterprise-level applications.

## Which Should You Choose?

For small to medium-sized applications, a component-based structure might work well since it’s easy to get started and provides a clear separation of concerns. However, as your app grows and you begin to add more features, you might find the structure harder to manage.

For large, enterprise-level applications, a feature-based structure is usually the better choice. It helps in organizing large codebases, allows for better scalability, and makes it easier for multiple teams to work on different parts of the app independently.

## Conclusion

Both component-based and feature-based folder structures have their own benefits and drawbacks. The best approach depends on your project’s size and complexity. For small apps, a component-based structure might suffice, but for large, enterprise-level projects, a feature-based structure is often the best way to go.

Happy coding! 🎉
