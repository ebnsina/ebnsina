---
title: 'কম্পোনেন্ট আর্কিটেকচার'
subtitle: 'Composition, props, slots, compound components, এবং atomic design — এমন reusable UI তৈরি করা যা scale করে।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['components', 'composition', 'atomic design', 'props', 'slots', 'compound components']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা প্রিফ্যাব কারখানা আছে, যেখানে আস্ত ঘর বানানো হয় না — বানানো হয় আলাদা আলাদা স্ট্যান্ডার্ড রুম-ইউনিট। একটা বাথরুম পড, একটা কিচেন পড, একটা জানালার ইউনিট — প্রতিটা নিজে থেকেই সম্পূর্ণ, প্লাম্বিং-টাইলস-ফিটিং সব লাগানো, বাক্সবন্দি হয়ে বেরিয়ে আসে। মজার ব্যাপার হলো, একই বাথরুম পড কারখানা থেকে বেরিয়ে কখনো শহরের এই টাওয়ারে বসে, কখনো নদীর ওপারের ওই অ্যাপার্টমেন্টে — একবার ডিজাইন করা পড বারবার নানা বিল্ডিংয়ে ব্যবহার হয়।

সাইটে গিয়ে ফাতিমা আল-ফিহরি এই পডগুলো জোড়া দেন — একটা কিচেন পড, একটা বাথরুম পড আর দুটো ঘর মিলে একটা ফ্ল্যাট, আর ফ্ল্যাটের ওপর ফ্ল্যাট বসিয়ে গোটা টাওয়ার। কোন ফ্ল্যাটে বাথরুমের কল পিতলের হবে, কোনটায় ইস্পাতের — এটা পড নিজে ঠিক করে না; বাইরে থেকে, অর্থাৎ যিনি বসাচ্ছেন তিনি, প্রতিটা পডকে তার ফিটিং হাতে ধরিয়ে দেন। পড শুধু যা হাতে পায় তাই বসিয়ে দেয়।

গল্পটা আসলে **component architecture**-এর — প্রতিটা প্রিফ্যাব পড হলো একটা **component** (নিজে থেকে সম্পূর্ণ, self-contained), একই পড নানা বিল্ডিংয়ে বসানোই **reuse**, পড জোড়া দিয়ে ফ্ল্যাট আর ফ্ল্যাট দিয়ে টাওয়ার বানানোটাই **composition** বা nesting, আর বাইরে থেকে পডকে ফিটিং ধরিয়ে দেওয়াই parent থেকে **props** পাঠানো। বাস্তবে ঠিক এভাবেই একটা `Button` বা `Card` component একবার লিখে পুরো অ্যাপে বারবার ব্যবহার হয়, ছোট component জুড়ে বড় UI বানানো হয়, আর প্রতিটা component তার কাজের ডেটা props হিসেবে বাইরে থেকে পায়।

## কেন Component Architecture গুরুত্বপূর্ণ

প্রতিটি আধুনিক frontend framework component-এর ধারণার উপর গড়ে উঠেছে — self-contained, reusable UI-এর টুকরো। কিন্তু একটা component কী তা জানা আর একটা component system কীভাবে architect করতে হয় তা জানা খুবই আলাদা দক্ষতা। খারাপ component design prop drilling, ডুপ্লিকেট করা logic, এবং এমন component-এর দিকে নিয়ে যায় যেগুলো reuse করা অসম্ভব।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

LEGO দিয়ে তৈরির মতো — ছোট reusable টুকরো (atom) মিলে molecule (একটা card), organism (একটা product grid), template (একটা page layout) তৈরি হয়। প্রতিটি টুকরো স্বাধীনভাবে কাজ করে।

</Callout>

## Component-এর Spectrum

Component বিশুদ্ধভাবে presentational থেকে অত্যন্ত stateful পর্যন্ত হতে পারে। এই spectrum-এ একটা component কোথায় পড়ে তা বোঝা নির্ধারণ করে আপনি কীভাবে সেটা design করবেন।

```typescript
// 1. Presentational — pure UI, no logic
interface BadgeProps {
  label: string;
  color: "green" | "yellow" | "red";
}

function Badge({ label, color }: BadgeProps) {
  return <span className={`badge badge-${color}`}>{label}</span>;
}

// 2. Container — manages state, delegates rendering
function ProductListContainer() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts().then((data) => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton count={6} />;
  return <ProductGrid products={products} />;
}

// 3. Compound — a group that shares implicit state
<Select value={selected} onChange={setSelected}>
  <Select.Trigger>Choose a category</Select.Trigger>
  <Select.Options>
    <Select.Option value="electronics">Electronics</Select.Option>
    <Select.Option value="clothing">Clothing</Select.Option>
  </Select.Options>
</Select>
```

## Props: Component-এর API

Props হলো আপনার component-এর public API। এগুলো সাবধানে design করুন — props পরিবর্তন করা প্রতিটি consumer-এর জন্য একটা breaking change।

```typescript
// Bad: too many unrelated props crammed together
interface CardProps {
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  badge: string;
  badgeColor: string;
  onClick: () => void;
  onHover: () => void;
  isLoading: boolean;
  error: string | null;
  showFooter: boolean;
  footerText: string;
}

// Better: composed from smaller, focused interfaces
interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}

interface CardImageProps {
  src: string;
  alt: string;
  aspectRatio?: "square" | "video" | "wide";
}

// Usage — compose what you need
<Card onClick={handleClick}>
  <CardImage src="/phone.jpg" alt="Smartphone" aspectRatio="square" />
  <CardHeader title="Samsung Galaxy" subtitle="Latest model" badge={<Badge label="New" color="green" />} />
  <CardFooter>
    <Price amount={45000} currency="BDT" />
    <AddToCartButton productId="123" />
  </CardFooter>
</Card>
```

<Callout type="tip">

**Props design-এর নিয়ম:**

- কম props = ব্যবহার করা সহজ। সর্বোচ্চ ৩-৫টা required props লক্ষ্য রাখুন।
- flexible content injection-এর জন্য `children` বা slot ব্যবহার করুন।
- configuration (`<Card headerTitle="..." headerSubtitle="...">`)-এর চেয়ে composition (`<Card><CardHeader />`) পছন্দ করুন।
- আপনার props কঠোরভাবে type করুন — যেখানে সম্ভব `string`-এর বদলে union type ব্যবহার করুন।

</Callout>

## Compound Components

Compound component React Context-এর মাধ্যমে implicit state শেয়ার করে, যা user-কে structure-এর উপর পূর্ণ নিয়ন্ত্রণ দেয় যখন parent সমন্বয় সামলায়।

```typescript
import { createContext, useContext, useState } from "react";

// Shared context for the accordion
interface AccordionContextType {
  openIndex: number | null;
  toggle: (index: number) => void;
}

const AccordionContext = createContext<AccordionContextType | null>(null);

function useAccordion() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("Accordion components must be used within <Accordion>");
  return ctx;
}

// Parent provides the state
function Accordion({ children }: { children: React.ReactNode }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const toggle = (index: number) =>
    setOpenIndex((prev) => (prev === index ? null : index));

  return (
    <AccordionContext.Provider value={{ openIndex, toggle }}>
      <div className="accordion">{children}</div>
    </AccordionContext.Provider>
  );
}

// Children consume the state
function AccordionItem({ index, title, children }: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  const { openIndex, toggle } = useAccordion();
  const isOpen = openIndex === index;

  return (
    <div className="accordion-item">
      <button onClick={() => toggle(index)} aria-expanded={isOpen}>
        {title}
      </button>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
}

// Attach sub-components
Accordion.Item = AccordionItem;

// Usage
<Accordion>
  <Accordion.Item index={0} title="What is Stripe?">
    Stripe is an online payment processing platform...
  </Accordion.Item>
  <Accordion.Item index={1} title="How does it work?">
    You can send money, pay bills, and shop online...
  </Accordion.Item>
</Accordion>
```

## Atomic Design Hierarchy

Brad Frost-এর Atomic Design আপনাকে component-গুলোকে layer-এ সংগঠিত করার একটা mental model দেয়।

```
atoms/          → Button, Input, Badge, Avatar, Icon
molecules/      → SearchBar (Input + Button), UserChip (Avatar + Name)
organisms/      → Navbar (Logo + SearchBar + UserMenu), ProductCard
templates/      → ProductListingTemplate (Navbar + Sidebar + Grid)
pages/          → ElectronicsPage (template + real data)
```

```typescript
// atoms/Button.tsx
interface ButtonProps {
  variant: "primary" | "secondary" | "ghost";
  size: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

function Button({ variant, size, children, onClick, disabled }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// molecules/SearchBar.tsx
function SearchBar({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");

  return (
    <div className="search-bar">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
      />
      <Button variant="primary" size="md" onClick={() => onSearch(query)}>
        Search
      </Button>
    </div>
  );
}

// organisms/Navbar.tsx
function Navbar() {
  return (
    <nav className="navbar">
      <Logo />
      <SearchBar onSearch={handleSearch} />
      <UserMenu />
    </nav>
  );
}
```

<Callout type="warning">

**Component architecture-এ সাধারণ ভুল:**

- **God component**: একটা মাত্র component যা সবকিছু করে। একটা component যদি ২০০ লাইনের বেশি হয়, সম্ভবত সেটাকে ভাগ করা দরকার।
- **অকাল abstraction**: তিনটা concrete use case না হওয়া পর্যন্ত একটা generic `<DataDisplay>` তৈরি করবেন না। নির্দিষ্ট দিয়ে শুরু করুন, তারপর generalize করুন।
- **৫+ level গভীর Prop drilling**: আপনি যদি একাধিক মধ্যবর্তী component-এর মধ্য দিয়ে props পাঠাচ্ছেন, তার বদলে Context বা একটা state manager ব্যবহার করুন।

</Callout>

## Slots Pattern (Framework-Agnostic)

Slot parent component-কে একটা child component-এর নির্দিষ্ট region-এ content inject করতে দেয়। React `children` এবং named props ব্যবহার করে। Astro এবং Vue-তে explicit slot আছে।

```typescript
// React: named slots via props
interface LayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function DashboardLayout({ header, sidebar, children, footer }: LayoutProps) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">{header}</header>
      <aside className="dashboard-sidebar">{sidebar}</aside>
      <main className="dashboard-main">{children}</main>
      {footer && <footer className="dashboard-footer">{footer}</footer>}
    </div>
  );
}

// Usage
<DashboardLayout
  header={<Navbar />}
  sidebar={<SideMenu items={menuItems} />}
  footer={<FooterLinks />}
>
  <ProductTable products={products} />
</DashboardLayout>
```

## মূল টেকঅ্যাওয়ে

1. **Configuration-এর চেয়ে composition** — বিশাল prop object-এর বদলে `children` এবং sub-component ব্যবহার করুন
2. **Compound component** flexible, readable API-র জন্য Context-এর মাধ্যমে state শেয়ার করে
3. **Atomic Design** আপনাকে একটা শেয়ার্ড শব্দভাণ্ডার দেয় — atom, molecule, organism, template, page
4. **Props হলো আপনার public API** — এগুলো minimal, typed এবং stable রাখুন
5. **Slot/named content** parent আর child-এর মধ্যে tight coupling ছাড়াই flexible layout সম্ভব করে
