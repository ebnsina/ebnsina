---
title: 'Component Architecture'
subtitle: 'Composition, props, slots, compound components, and atomic design — building reusable UI that scales.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['components', 'composition', 'atomic design', 'props', 'slots', 'compound components']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Component Architecture Matters

Every modern frontend framework is built on the idea of components — self-contained, reusable pieces of UI. But knowing what a component is and knowing how to architect a component system are very different skills. Poor component design leads to prop drilling, duplicated logic, and components that are impossible to reuse.

<Callout type="info">

**Real-World Analogy**

Like building with LEGO — small reusable pieces (atoms) combine into molecules (a card), organisms (a product grid), templates (a page layout). Each piece works independently.

</Callout>

## The Component Spectrum

Components range from purely presentational to highly stateful. Understanding where a component falls on this spectrum determines how you design it.

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

## Props: The Component API

Props are the public API of your component. Design them carefully — changing props is a breaking change for every consumer.

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

**Props design rules:**

- Fewer props = easier to use. Aim for 3-5 required props max.
- Use `children` or slots for flexible content injection.
- Prefer composition (`<Card><CardHeader />`) over configuration (`<Card headerTitle="..." headerSubtitle="...">`).
- Type your props strictly — use union types instead of `string` where possible.

</Callout>

## Compound Components

Compound components share implicit state through React Context, giving users full control over structure while the parent manages coordination.

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

Brad Frost's Atomic Design gives you a mental model for organizing components into layers.

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

**Common mistakes in component architecture:**

- **God components**: A single component that does everything. If a component is over 200 lines, it probably needs to be split.
- **Premature abstraction**: Do not create a generic `<DataDisplay>` before you have three concrete use cases. Start specific, then generalize.
- **Prop drilling 5+ levels deep**: If you are passing props through multiple intermediary components, use Context or a state manager instead.

</Callout>

## Slots Pattern (Framework-Agnostic)

Slots let parent components inject content into specific regions of a child component. React uses `children` and named props. Astro and Vue have explicit slots.

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

## Key Takeaways

1. **Composition over configuration** — use `children` and sub-components instead of giant prop objects
2. **Compound components** share state via Context for flexible, readable APIs
3. **Atomic Design** gives you a shared vocabulary — atoms, molecules, organisms, templates, pages
4. **Props are your public API** — keep them minimal, typed, and stable
5. **Slots/named content** enable flexible layouts without tight coupling between parent and child
