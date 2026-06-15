---
title: "Network Security"
subtitle: "CORS, CSP, MITM attacks, firewalls — practical security at the network layer that every developer should understand."
chapter: 8
level: "advanced"
readingTime: "16 min"
topics: ["CORS", "CSP", "firewall", "MITM", "security headers"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## CORS — Cross-Origin Resource Sharing

CORS is the browser's way of asking: "Is this frontend allowed to call this API?"

<Callout type="info">

**Real-World Analogy**

Like the security layers at an airport — firewall (entrance gate check), packet inspection (baggage scanner), authentication (passport control), and encryption (sealed diplomatic pouches). Multiple layers of defense.

</Callout>

When `app.example.com` makes a request to `api.example.com`, the browser sends a **preflight** request:

```typescript
// Browser sends preflight (automatically):
// OPTIONS /api/users
// Origin: https://app.example.com
// Access-Control-Request-Method: POST
// Access-Control-Request-Headers: Content-Type, Authorization

// Server must respond with:
// Access-Control-Allow-Origin: https://app.example.com
// Access-Control-Allow-Methods: GET, POST, PUT, DELETE
// Access-Control-Allow-Headers: Content-Type, Authorization
// Access-Control-Max-Age: 86400

// Express middleware
import cors from "cors";

app.use(cors({
  origin: ["https://app.example.com", "https://staging.example.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // allow cookies
  maxAge: 86400,      // cache preflight for 24h
}));
```

<Callout type="warning">

**Never use `Access-Control-Allow-Origin: *` with `credentials: true`**. This lets any website make authenticated requests to your API. Always whitelist specific origins.

</Callout>

## Security Headers

```typescript
// Essential security headers for any web application
const securityHeaders = {
  // Prevent clickjacking (embedding your site in an iframe)
  "X-Frame-Options": "DENY",

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // Force HTTPS for 1 year
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  // Control what the browser can load
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'nonce-abc123'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.example.com",
    "frame-ancestors 'none'",
  ].join("; "),

  // Control what info is sent in Referer header
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Opt into browser security features
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
```

## Content Security Policy (CSP)

CSP tells the browser exactly what resources your page is allowed to load. This prevents XSS attacks — even if an attacker injects a script tag, the browser won't execute it.

```typescript
// Without CSP: injected <script> runs freely
// With CSP: browser blocks scripts not in the whitelist

// Nonce-based CSP (recommended)
// Server generates a random nonce for each request
import crypto from "node:crypto";

function generateCSP(): { header: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("base64");

  return {
    nonce,
    header: [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  };
}

// In your HTML template:
// <script nonce="<%= nonce %>">...</script>
// Scripts without the matching nonce are blocked
```

## Man-in-the-Middle (MITM) Attacks

An attacker positions themselves between client and server, intercepting or modifying traffic.

**Defenses:**
- **TLS everywhere** — encrypted traffic can't be read or modified
- **HSTS** — prevents SSL stripping (downgrading HTTPS to HTTP)
- **Certificate pinning** — mobile apps verify the exact certificate, not just the chain
- **DNSSEC** — prevents DNS spoofing that could redirect traffic

## Rate Limiting at the Network Layer

```typescript
// Simple token bucket rate limiter
class RateLimiter {
  private tokens: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  isAllowed(clientIP: string): boolean {
    const now = Date.now();
    const bucket = this.tokens.get(clientIP);

    if (!bucket || bucket.resetAt < now) {
      this.tokens.set(clientIP, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxRequests) {
      return false; // 429 Too Many Requests
    }

    bucket.count++;
    return true;
  }
}

// Usage: 100 requests per minute per IP
const limiter = new RateLimiter(100, 60_000);
```

<Callout type="info">

**Defense in depth**: No single security measure is enough. Use TLS + security headers + CSP + rate limiting + input validation together. Each layer catches what the others miss.

</Callout>

## Key Takeaways

1. **CORS is a browser feature**, not a server security measure — APIs are still callable from non-browser clients
2. **Security headers are cheap insurance** — add them to every response
3. **CSP prevents XSS** even when your code has injection vulnerabilities
4. **TLS + HSTS together** prevent MITM and SSL stripping
5. **Rate limiting at the network layer** is your first line of defense against abuse

