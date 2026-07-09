---
title: 'Accessibility ও i18n'
subtitle: 'ARIA, সেমান্টিক HTML, কীবোর্ড নেভিগেশন, স্ক্রিন রিডার, RTL সাপোর্ট এবং ইন্টারন্যাশনালাইজেশন প্যাটার্ন।'
chapter: 8
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['accessibility', 'a11y', 'ARIA', 'keyboard navigation', 'i18n', 'RTL', 'screen readers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Accessibility আর i18n কেন গুরুত্বপূর্ণ

Accessibility (a11y) মানে এমন ইন্টারফেস তৈরি করা যা সবাই ব্যবহার করতে পারে — দৃষ্টি, চলাচল, শ্রবণ বা জ্ঞানগত প্রতিবন্ধকতাসম্পন্ন মানুষসহ। Internationalization (i18n) মানে এমন ইন্টারফেস তৈরি করা যা বিভিন্ন ভাষা, লিপি আর সংস্কৃতিতে কাজ করে। দুটোকেই প্রায়ই পরে করার মতো কাজ হিসেবে দেখা হয়, কিন্তু পরে জোড়া লাগানো শুরু থেকে বানানোর চেয়ে অনেক বেশি খরচসাপেক্ষ। অনেক দেশেই ওয়েব অ্যাক্সেসিবিলিটি একটা আইনি বাধ্যবাধকতা।

<Callout type="info">

**বাস্তব জীবনের উপমা**

পাবলিক ভবন সবার জন্য অ্যাক্সেসযোগ্য করার মতো — হুইলচেয়ার ব্যবহারকারীদের জন্য র‍্যাম্প (কীবোর্ড নেভিগেশন), ব্রেইল সাইন (স্ক্রিন রিডার), বহুভাষিক সাইন (i18n) আর বিভিন্ন ভাষার জন্য ডান-থেকে-বাম সাপোর্ট।

</Callout>

## সেমান্টিক HTML: ভিত্তি

অ্যাক্সেসিবিলিটির জন্য আপনি সবচেয়ে প্রভাবশালী যে কাজটা করতে পারেন তা হলো সঠিক HTML এলিমেন্ট ব্যবহার করা। স্ক্রিন রিডার, কীবোর্ড নেভিগেশন আর ব্রাউজার ফিচার — সবই সেমান্টিক স্ট্রাকচারের উপর নির্ভর করে।

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

গুরুত্বপূর্ণ সেমান্টিক এলিমেন্ট আর তাদের কাজ:

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

## ARIA: HTML যখন যথেষ্ট নয়

ARIA (Accessible Rich Internet Applications) অ্যাট্রিবিউট কাস্টম উইজেটে এমন সেমান্টিক যোগ করে যা শুধু HTML এলিমেন্ট দিয়ে প্রকাশ করা যায় না। তবে ARIA-র প্রথম নিয়ম হলো: কোনো নেটিভ HTML এলিমেন্ট কাজটা করতে পারলে ARIA ব্যবহার করবেন না।

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

**ARIA-র সাধারণ ভুল:**

- **একটা div-এ `role="button"`** — শুধু `<button>` ব্যবহার করুন। ওই div-এ আপনাকে `tabindex`, Enter আর Space-এর জন্য `onKeyDown`, আর ফোকাস স্টাইলও যোগ করতে হবে। `<button>` এলিমেন্ট এসব বিনামূল্যে দিয়ে দেয়।
- **আইকন-অনলি বাটনে label না থাকা** — স্ক্রিন রিডারের জন্য `<button aria-label="Close modal"><XIcon /></button>` দরকার।
- **ইন্টারঅ্যাকটিভ এলিমেন্টে `aria-hidden="true"`** — এটা তাদের অ্যাক্সেসিবিলিটি ট্রি থেকে সরিয়ে দেয়। স্ক্রিন রিডারের উপর নির্ভরশীল ব্যবহারকারীরা তখন সেগুলোর সাথে ইন্টারঅ্যাক্ট করতে পারে না।
- **অপ্রয়োজনীয় ARIA** — `<button role="button">` কিছুই যোগ করে না। এর implicit role এমনিতেই button।

</Callout>

## কীবোর্ড নেভিগেশন

প্রতিটা ইন্টারঅ্যাকটিভ এলিমেন্ট কীবোর্ড দিয়ে চালানো যেতে হবে। অনেক ব্যবহারকারীই মাউস ব্যবহার করতে পারে না — চলাচলে প্রতিবন্ধকতাসম্পন্ন মানুষ, দক্ষ কীবোর্ড ব্যবহারকারী আর স্ক্রিন রিডার ব্যবহারকারী সবাই Tab, Enter, Space আর অ্যারো কী দিয়ে নেভিগেট করে।

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

**অ্যাক্সেসিবিলিটি টেস্টিং চেকলিস্ট:**

1. **কীবোর্ড**: আপনি কি Tab দিয়ে প্রতিটা ইন্টারঅ্যাকটিভ এলিমেন্টে পৌঁছে Enter/Space দিয়ে সেটা অ্যাক্টিভেট করতে পারেন?
2. **স্ক্রিন রিডার**: VoiceOver (Mac) বা NVDA (Windows) কি কনটেন্ট অর্থপূর্ণভাবে ঘোষণা করে?
3. **জুম**: 200% জুমে লেআউট কি কাজ করে?
4. **কালার কনট্রাস্ট**: টেক্সট আর ব্যাকগ্রাউন্ড কি WCAG AA মেনে চলে (সাধারণ টেক্সটের জন্য 4.5:1, বড় টেক্সটের জন্য 3:1)?
5. **মোশন**: অ্যানিমেশনের ক্ষেত্রে কি `prefers-reduced-motion` মানা হয়?
6. **ফর্ম**: প্রতিটা ইনপুটের কি দৃশ্যমান label আছে? এরর কি ঘোষণা করা হয়?

</Callout>

## Internationalization (i18n)

i18n হলো আপনার অ্যাপকে এমনভাবে ডিজাইন করার প্রক্রিয়া যাতে কোড পরিবর্তন ছাড়াই সেটা বিভিন্ন ভাষা আর অঞ্চলের জন্য মানিয়ে নেওয়া যায়। Localization (l10n) হলো আসল অনুবাদের কাজ।

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

## RTL (ডান-থেকে-বাম) সাপোর্ট

আপনার অ্যাপ যদি আরবি, হিব্রু, উর্দু বা অন্যান্য RTL ভাষা সাপোর্ট করে, তাহলে আপনার লেআউটকে উল্টে যেতে হবে।

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

## মূল বিষয়সমূহ

1. **সেমান্টিক HTML** হলো সবচেয়ে বড় অ্যাক্সেসিবিলিটি অর্জন — ARIA-র দিকে হাত বাড়ানোর আগে `<button>`, `<nav>`, `<main>`, `<label>` ব্যবহার করুন
2. **ARIA** কাস্টম উইজেটের ফাঁকগুলো পূরণ করে — কিন্তু কখনো নেটিভ এলিমেন্টের বিকল্প হিসেবে এটা ব্যবহার করবেন না
3. **কীবোর্ড নেভিগেশন** অপরিহার্য — মোডালে ফোকাস আটকে রাখুন, সব ইন্টারঅ্যাকটিভ এলিমেন্ট Tab-যোগ্য করুন, দৃশ্যমান ফোকাস ইন্ডিকেটর দেখান
4. **i18n** শুরু থেকেই বানানো উচিত — স্ট্রিং বাইরে রাখুন, plural আর ফরম্যাটিংয়ের জন্য ICU message format ব্যবহার করুন, Intl API কাজে লাগান
5. **RTL সাপোর্ট** আসে CSS logical properties ব্যবহার থেকে (`left`-এর বদলে `inline-start`)
6. **আসল টুল দিয়ে টেস্ট করুন** — VoiceOver, NVDA, Lighthouse accessibility audit, axe DevTools
