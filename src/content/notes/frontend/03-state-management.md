---
title: "State Management"
subtitle: "Local state, lifted state, context, global stores, and signals — managing data flow in complex UIs."
chapter: 3
level: "intermediate"
readingTime: "15 min"
topics: ["state", "context", "zustand", "redux", "signals", "state machines"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The State Problem

Every interactive UI has state — the current value of a form field, whether a modal is open, the list of items in a cart, the authenticated user. The challenge is not storing state but deciding where it lives and how it flows. Wrong decisions lead to components re-rendering unnecessarily, data getting out of sync, and bugs that are nearly impossible to trace.

<Callout type="info">

**Real-World Analogy**

Like managing inventory in a warehouse system — local state is what's on a single delivery truck, context is the zone warehouse, and the global store is the central distribution center that all zones read from.

</Callout>

## Level 1: Local State

State that belongs to a single component. Use `useState` for simple values, `useReducer` for complex state transitions.

```typescript
import { useState, useReducer } from "react";

// Simple: toggle, counter, form input
function SearchBox() {
  const [query, setQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={isExpanded ? "search-expanded" : "search-collapsed"}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsExpanded(true)}
        placeholder="Search..."
      />
      {isExpanded && query.length > 0 && (
        <SearchResults query={query} />
      )}
    </div>
  );
}

// Complex: useReducer for multi-field forms
interface FormState {
  name: string;
  email: string;
  phone: string;
  errors: Record<string, string>;
  submitting: boolean;
}

type FormAction =
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "SET_ERROR"; field: string; error: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; errors: Record<string, string> };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        [action.field]: action.value,
        errors: { ...state.errors, [action.field]: "" },
      };
    case "SET_ERROR":
      return {
        ...state,
        errors: { ...state.errors, [action.field]: action.error },
      };
    case "SUBMIT_START":
      return { ...state, submitting: true };
    case "SUBMIT_SUCCESS":
      return { ...state, submitting: false };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, errors: action.errors };
    default:
      return state;
  }
}

function RegistrationForm() {
  const [state, dispatch] = useReducer(formReducer, {
    name: "",
    email: "",
    phone: "",
    errors: {},
    submitting: false,
  });

  const handleSubmit = async () => {
    dispatch({ type: "SUBMIT_START" });
    try {
      await api.register(state);
      dispatch({ type: "SUBMIT_SUCCESS" });
    } catch (err) {
      dispatch({ type: "SUBMIT_ERROR", errors: parseErrors(err) });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.name}
        onChange={(e) => dispatch({ type: "SET_FIELD", field: "name", value: e.target.value })}
      />
      {state.errors.name && <span className="error">{state.errors.name}</span>}
      {/* ... more fields ... */}
    </form>
  );
}
```

## Level 2: Lifted State

When two sibling components need the same data, lift it to their closest common parent.

```typescript
// Parent owns the state, children receive it via props
function ProductPage() {
  const [selectedColor, setSelectedColor] = useState<string>("black");

  return (
    <div className="product-page">
      {/* Both children need selectedColor */}
      <ProductImage color={selectedColor} />
      <ProductOptions
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
      />
    </div>
  );
}

function ProductImage({ color }: { color: string }) {
  return <img src={`/products/phone-${color}.jpg`} alt={`Phone in ${color}`} />;
}

function ProductOptions({
  selectedColor,
  onColorChange,
}: {
  selectedColor: string;
  onColorChange: (color: string) => void;
}) {
  const colors = ["black", "white", "blue"];
  return (
    <div className="color-options">
      {colors.map((c) => (
        <button
          key={c}
          className={c === selectedColor ? "selected" : ""}
          onClick={() => onColorChange(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
```

## Level 3: Context

When lifted state needs to pass through many levels, Context avoids prop drilling. But use it wisely — every context change re-renders all consumers.

```typescript
import { createContext, useContext, useState, useMemo } from "react";

// Cart context
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  total: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, total }}>
      {children}
    </CartContext.Provider>
  );
}

// Any deeply nested component can access cart
function CartIcon() {
  const { items } = useCart();
  return (
    <div className="cart-icon">
      <ShoppingBagIcon />
      {items.length > 0 && <span className="badge">{items.length}</span>}
    </div>
  );
}
```

<Callout type="warning">

**Context performance trap**

Context re-renders ALL consumers when the value object changes. If you put `{ user, theme, locale, cart }` in a single context, changing the theme re-renders every component that reads the cart. Split contexts by update frequency — `ThemeContext`, `AuthContext`, `CartContext` as separate providers.

</Callout>

## Level 4: Global Stores (Zustand)

When context becomes unwieldy, a dedicated store library gives you fine-grained subscriptions and simpler APIs.

```typescript
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  total: () => number;
}

const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],

        addItem: (item) =>
          set((state) => {
            const existing = state.items.find((i) => i.id === item.id);
            if (existing) {
              return {
                items: state.items.map((i) =>
                  i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
                ),
              };
            }
            return { items: [...state.items, { ...item, quantity: 1 }] };
          }),

        removeItem: (id) =>
          set((state) => ({
            items: state.items.filter((i) => i.id !== id),
          })),

        clearCart: () => set({ items: [] }),

        total: () =>
          get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      }),
      { name: "cart-storage" } // persists to localStorage
    )
  )
);

// Usage — components only re-render when their selected slice changes
function CartCount() {
  const count = useCartStore((s) => s.items.length); // only re-renders on length change
  return <span>{count}</span>;
}

function CartTotal() {
  const total = useCartStore((s) => s.total()); // only re-renders on total change
  return <span>৳{total}</span>;
}
```

<Callout type="tip">

**State management decision tree:**
1. Does only one component need it? → `useState` / `useReducer`
2. Do a parent and its direct children need it? → Lift state up
3. Do many components across a subtree need it? → Context
4. Is it app-wide, persisted, or updated from many places? → Zustand / global store
5. Is the state transition logic complex with many edge cases? → State machine (XState)

</Callout>

## Level 5: Signals (Fine-Grained Reactivity)

Signals are a newer primitive that provide reactive state without re-rendering entire component trees. Used in Solid, Preact, Angular, and Qwik.

```typescript
// Preact Signals example
import { signal, computed } from "@preact/signals";

const count = signal(0);
const doubled = computed(() => count.value * 2);

// Only the text node updates — not the whole component
function Counter() {
  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}
```

## Key Takeaways

1. **Start local** — `useState` is your default. Only escalate when you have a real problem.
2. **Lift state** to the nearest common ancestor when siblings share data.
3. **Context** avoids prop drilling but re-renders all consumers — split by update frequency.
4. **Zustand** gives you global state with selector-based subscriptions and zero boilerplate.
5. **Signals** offer fine-grained reactivity without the virtual DOM diffing cost.
6. **Never put everything in global state** — most state is local. Global stores are for truly shared, app-wide data.

