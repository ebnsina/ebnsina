---
title: 'স্টেট ম্যানেজমেন্ট'
subtitle: 'Local state, lifted state, context, global stores, আর signals — জটিল UI-তে ডেটা ফ্লো ম্যানেজ করা।'
chapter: 3
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['state', 'context', 'zustand', 'redux', 'signals', 'state machines']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## State-এর সমস্যাটা

প্রতিটা ইন্টারঅ্যাক্টিভ UI-এর কিছু না কিছু state থাকে — একটা ফর্ম ফিল্ডের বর্তমান মান, একটা modal খোলা আছে কিনা, কার্টে থাকা আইটেমের লিস্ট, লগইন করা ইউজার। আসল চ্যালেঞ্জটা state স্টোর করা নয়, বরং সিদ্ধান্ত নেওয়া যে সেটা কোথায় থাকবে আর কীভাবে ফ্লো করবে। ভুল সিদ্ধান্ত নিলে কম্পোনেন্ট অকারণে re-render হয়, ডেটা sync-এর বাইরে চলে যায়, আর এমন bug তৈরি হয় যেগুলো ট্রেস করা প্রায় অসম্ভব।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ওয়্যারহাউস সিস্টেমে inventory ম্যানেজ করার মতো — local state হলো একটামাত্র ডেলিভারি ট্রাকে যা আছে, context হলো জোন ওয়্যারহাউস, আর global store হলো কেন্দ্রীয় ডিস্ট্রিবিউশন সেন্টার যেখান থেকে সব জোন পড়ে।

</Callout>

## Level 1: Local State

যে state একটামাত্র কম্পোনেন্টের অন্তর্গত। সাধারণ মানের জন্য `useState` ব্যবহার করো, আর জটিল state ট্রানজিশনের জন্য `useReducer`।

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

যখন দুটো sibling কম্পোনেন্টের একই ডেটা দরকার হয়, তখন সেটাকে তাদের সবচেয়ে কাছের কমন parent-এ তুলে (lift) দাও।

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

যখন lifted state-কে অনেক লেভেল পার হয়ে যেতে হয়, তখন Context prop drilling এড়াতে সাহায্য করে। তবে বুদ্ধি করে ব্যবহার করো — প্রতিটা context পরিবর্তনে সব consumer re-render হয়।

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

**Context-এর performance ফাঁদ**

value object পরিবর্তন হলে Context তার সব consumer-কে re-render করে। যদি তুমি `{ user, theme, locale, cart }` একটা context-এ রাখো, তাহলে theme বদলালে cart পড়ে এমন প্রতিটা কম্পোনেন্টও re-render হবে। update-এর ফ্রিকোয়েন্সি অনুযায়ী context ভাগ করো — `ThemeContext`, `AuthContext`, `CartContext` আলাদা আলাদা provider হিসেবে।

</Callout>

## Level 4: Global Stores (Zustand)

যখন context সামলানো কঠিন হয়ে যায়, তখন একটা ডেডিকেটেড store লাইব্রেরি তোমাকে fine-grained subscription আর সহজ API দেয়।

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

**State management সিদ্ধান্তের গাছ (decision tree):**

1. শুধু একটা কম্পোনেন্টের কি এটা দরকার? → `useState` / `useReducer`
2. একটা parent আর তার সরাসরি children-এর কি দরকার? → State উপরে তুলে দাও (Lift)
3. একটা subtree জুড়ে অনেক কম্পোনেন্টের কি দরকার? → Context
4. এটা কি app-wide, persisted, নাকি অনেক জায়গা থেকে update হয়? → Zustand / global store
5. State ট্রানজিশনের লজিক কি অনেক edge case নিয়ে জটিল? → State machine (XState)

</Callout>

## Level 5: Signals (Fine-Grained Reactivity)

Signals হলো একটা নতুন primitive যা পুরো কম্পোনেন্ট tree re-render না করেই reactive state দেয়। Solid, Preact, Angular, আর Qwik-এ ব্যবহৃত হয়।

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

## মূল শেখার বিষয়

1. **Local দিয়ে শুরু করো** — `useState` হলো তোমার ডিফল্ট। বাস্তব সমস্যা হলে তবেই বড় সমাধানে যাও।
2. sibling-রা ডেটা শেয়ার করলে state-কে সবচেয়ে কাছের কমন ancestor-এ **lift** করো।
3. **Context** prop drilling এড়ায় কিন্তু সব consumer re-render করে — update ফ্রিকোয়েন্সি অনুযায়ী ভাগ করো।
4. **Zustand** তোমাকে selector-ভিত্তিক subscription আর শূন্য boilerplate সহ global state দেয়।
5. **Signals** virtual DOM diffing-এর খরচ ছাড়াই fine-grained reactivity দেয়।
6. **সবকিছু global state-এ রেখো না** — বেশিরভাগ state আসলে local। Global store শুধু সত্যিকারের শেয়ার করা, app-wide ডেটার জন্য।
