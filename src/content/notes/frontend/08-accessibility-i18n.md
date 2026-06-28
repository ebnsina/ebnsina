---
title: 'Accessibility & i18n'
subtitle: 'ARIA, semantic HTML, keyboard navigation, screen readers, RTL support, and internationalization patterns.'
chapter: 8
level: 'advanced'
readingTime: '12 min'
topics: ['accessibility', 'a11y', 'ARIA', 'keyboard navigation', 'i18n', 'RTL', 'screen readers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Accessibility and i18n Matter

Accessibility (a11y) means building interfaces that everyone can use — including people with visual, motor, auditory, or cognitive disabilities. Internationalization (i18n) means building interfaces that work across languages, scripts, and cultures. Both are often treated as afterthoughts, but retrofitting them is far more expensive than building them in from the start. In many jurisdictions, web accessibility is a legal requirement.

<Callout type="info">

**Real-World Analogy**

Like making public buildings accessible — ramps for wheelchair users (keyboard navigation), Braille signs (screen readers), multilingual signs (i18n), and right-to-left support for different languages.

</Callout>

## Semantic HTML: The Foundation

The single most impactful thing you can do for accessibility is use the correct HTML elements. Screen readers, keyboard navigation, and browser features all depend on semantic structure.

```html
<!-- BAD: div soup — screen readers see nothing meaningful -->
<div class="header">
	<div class="nav">
		<div class="nav-item" onclick="navigate('/')">Home</div>
		<div class="nav-item" onclick="navigate('/about')">About</div>
	</div>
</div>
<div class="main">
	<div class="article">
		<div class="title">Understanding Accessibility</div>
		<div class="content">...</div>
	</div>
</div>

<!-- GOOD: semantic elements — screen readers announce structure -->
<header>
	<nav aria-label="Main navigation">
		<a href="/">Home</a>
		<a href="/about">About</a>
	</nav>
</header>
<main>
	<article>
		<h1>Understanding Accessibility</h1>
		<p>...</p>
	</article>
</main>
```

Key semantic elements and their purposes:

```html
<header>
	<!-- Site or section header -->
	<nav>
		<!-- Navigation links -->
		<main>
			<!-- Primary content (one per page) -->
			<article>
				<!-- Self-contained content -->
				<section>
					<!-- Thematic grouping with a heading -->
					<aside>
						<!-- Tangentially related content (sidebar) -->
						<footer>
							<!-- Site or section footer -->
							<button>
								<!-- Clickable action (NOT <div onclick>) -->
								<a>
									<!-- Navigation to a URL -->
									<form>
										<!-- User input collection -->
										<label>
											<!-- Describes a form input -->
											<table>
												<!-- Tabular data (NOT for layout) -->
											</table></label
										>
									</form></a
								>
							</button>
						</footer>
					</aside>
				</section>
			</article>
		</main>
	</nav>
</header>
```

## ARIA: When HTML Is Not Enough

ARIA (Accessible Rich Internet Applications) attributes add semantics to custom widgets that HTML elements alone cannot express. But the first rule of ARIA is: do not use ARIA if a native HTML element does the job.

```typescript
// Custom dropdown — needs ARIA because there is no native equivalent
function Dropdown({ label, options, value, onChange }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  return (
    <div className="dropdown">
      <button
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-activedescendant={activeIndex >= 0 ? `option-${activeIndex}` : undefined}
        aria-label={label}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
      >
        {value || "Select..."}
      </button>

      {isOpen && (
        <ul role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`option-${index}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Live regions — announce dynamic content to screen readers
function NotificationBanner({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive">
      {message}
    </div>
  );
}

function SearchResults({ count }: { count: number }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {count} results found
    </div>
  );
}
```

<Callout type="warning">

**Common ARIA mistakes:**

- **`role="button"` on a div** — just use `<button>`. You would also need to add `tabindex`, `onKeyDown` for Enter and Space, and focus styles. The `<button>` element gives you all of that for free.
- **Missing label on icon-only buttons** — `<button aria-label="Close modal"><XIcon /></button>` is required for screen readers.
- **`aria-hidden="true"` on interactive elements** — this removes them from the accessibility tree. Users relying on screen readers cannot interact with them.
- **Redundant ARIA** — `<button role="button">` adds nothing. The implicit role is already button.

</Callout>

## Keyboard Navigation

Every interactive element must be operable with a keyboard. Many users cannot use a mouse — those with motor disabilities, power keyboard users, and screen reader users all navigate with Tab, Enter, Space, and arrow keys.

```typescript
// Focus management for modals
import { useRef, useEffect } from "react";

function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Save the element that was focused before modal opened
      previousFocus.current = document.activeElement as HTMLElement;

      // Move focus into the modal
      modalRef.current?.focus();

      // Trap focus inside the modal
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
          return;
        }

        if (e.key === "Tab") {
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable || focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    } else {
      // Restore focus when modal closes
      previousFocus.current?.focus();
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title">Confirm Action</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

```css
/* Visible focus indicators — critical for keyboard users */
:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

/* Only show focus ring for keyboard navigation, not mouse clicks */
:focus:not(:focus-visible) {
	outline: none;
}

/* Skip navigation link for keyboard users */
.skip-link {
	position: absolute;
	top: -100%;
	left: 0;
	padding: 8px 16px;
	background: var(--color-accent);
	color: white;
	z-index: 100;
}

.skip-link:focus {
	top: 0;
}
```

<Callout type="tip">

**Accessibility testing checklist:**

1. **Keyboard**: Can you Tab to every interactive element and activate it with Enter/Space?
2. **Screen reader**: Does VoiceOver (Mac) or NVDA (Windows) announce content meaningfully?
3. **Zoom**: Does the layout work at 200% zoom?
4. **Color contrast**: Do text and backgrounds meet WCAG AA (4.5:1 for normal text, 3:1 for large text)?
5. **Motion**: Is `prefers-reduced-motion` respected for animations?
6. **Forms**: Does every input have a visible label? Are errors announced?

</Callout>

## Internationalization (i18n)

i18n is the process of designing your app so it can be adapted to different languages and regions without code changes. Localization (l10n) is the actual translation work.

```typescript
// Using next-intl for type-safe i18n in Next.js
// messages/en.json
{
  "products": {
    "title": "Our Products",
    "addToCart": "Add to Cart",
    "outOfStock": "Out of Stock",
    "price": "Price: {amount, number, currency}",
    "itemCount": "{count, plural, =0 {No items} one {# item} other {# items}}"
  }
}

// messages/bn.json
{
  "products": {
    "title": "আমাদের পণ্য",
    "addToCart": "কার্টে যোগ করুন",
    "outOfStock": "স্টকে নেই",
    "price": "মূল্য: {amount, number, currency}",
    "itemCount": "{count, plural, =0 {কোনো আইটেম নেই} one {# আইটেম} other {# আইটেম}}"
  }
}
```

```typescript
// Using translations in components
import { useTranslations } from "next-intl";

function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("products");

  return (
    <div className="product-card">
      <h3>{product.name}</h3>
      <p>{t("price", { amount: product.price })}</p>
      <button disabled={!product.inStock}>
        {product.inStock ? t("addToCart") : t("outOfStock")}
      </button>
    </div>
  );
}

// Date and number formatting — always use Intl API
function FormattedDate({ date }: { date: Date }) {
  const formatted = new Intl.DateTimeFormat("bn-BD", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

  return <time dateTime={date.toISOString()}>{formatted}</time>;
  // Output: ২০ মার্চ, ২০২৬
}

function FormattedCurrency({ amount }: { amount: number }) {
  const formatted = new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
  }).format(amount);

  return <span>{formatted}</span>;
  // Output: ৳১,৫০০.০০
}
```

## RTL (Right-to-Left) Support

If your app supports Arabic, Hebrew, Urdu, or other RTL languages, your layout must flip.

```css
/* Use logical properties instead of physical ones */
/* BAD — breaks in RTL */
.card {
	margin-left: 16px;
	padding-right: 12px;
	text-align: left;
	border-left: 2px solid blue;
}

/* GOOD — works in both LTR and RTL */
.card {
	margin-inline-start: 16px;
	padding-inline-end: 12px;
	text-align: start;
	border-inline-start: 2px solid blue;
}
```

```typescript
// Set direction based on locale
function RootLayout({ locale, children }: { locale: string; children: React.ReactNode }) {
  const dir = ["ar", "he", "ur", "fa"].includes(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
```

## Key Takeaways

1. **Semantic HTML** is the single biggest accessibility win — use `<button>`, `<nav>`, `<main>`, `<label>` before reaching for ARIA
2. **ARIA** fills the gaps for custom widgets — but never use it as a substitute for native elements
3. **Keyboard navigation** is essential — trap focus in modals, make all interactive elements tabbable, show visible focus indicators
4. **i18n** should be built in from the start — externalize strings, use ICU message format for plurals and formatting, leverage the Intl API
5. **RTL support** comes from using CSS logical properties (`inline-start` instead of `left`)
6. **Test with real tools** — VoiceOver, NVDA, Lighthouse accessibility audit, axe DevTools
