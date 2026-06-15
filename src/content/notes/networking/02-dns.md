---
title: "DNS — The Internet's Phone Book"
subtitle: "How domain names become IP addresses — recursive resolvers, authoritative servers, caching, and DNS record types."
chapter: 2
level: "beginner"
readingTime: "14 min"
topics: ["DNS", "domain names", "resolvers", "records"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why DNS Exists

Humans remember names (`google.com`), computers need numbers (`142.250.80.46`). DNS (Domain Name System) bridges this gap — it's a globally distributed database that maps domain names to IP addresses.

<Callout type="info">

**Real-World Analogy**

Like calling 411 (directory assistance) to find a phone number. You give a name, they return the number. DNS is the internet's phone book — you type "google.com" and DNS returns the IP address.

</Callout>

## The DNS Resolution Process

When you type `api.example.com` in your browser:

1. **Browser cache** — checked first (cached from previous lookups)
2. **OS cache** — your operating system's resolver cache
3. **Recursive resolver** — your ISP's DNS server (or `8.8.8.8`, `1.1.1.1`)
4. **Root nameserver** — knows where to find `.com`
5. **TLD nameserver** — knows where to find `example.com`
6. **Authoritative nameserver** — has the actual answer

```typescript
// Simplified DNS resolution
interface DNSRecord {
  name: string;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  value: string;
  ttl: number; // seconds until this record expires
}

async function resolve(domain: string): Promise<string> {
  // Step 1: Check local cache
  const cached = cache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Step 2: Ask recursive resolver
  // The resolver handles the root → TLD → authoritative chain
  const record = await queryResolver(domain, "A");

  // Step 3: Cache the result
  cache.set(domain, {
    value: record.value,
    expiresAt: Date.now() + record.ttl * 1000,
  });

  return record.value;
}
```

## DNS Record Types

| Type | Purpose | Example Value |
|------|---------|--------------|
| A | Domain → IPv4 address | `93.184.216.34` |
| AAAA | Domain → IPv6 address | `2606:2800:220:1::` |
| CNAME | Alias to another domain | `www.example.com → example.com` |
| MX | Mail server for domain | `mail.example.com` (priority: 10) |
| TXT | Arbitrary text | SPF records, domain verification |
| NS | Nameserver for zone | `ns1.example.com` |

## TTL and Caching

Every DNS record has a **TTL (Time to Live)** — how many seconds resolvers should cache it. This is a tradeoff:

- **Short TTL (60s)**: Changes propagate fast, but more DNS queries (slower for users)
- **Long TTL (86400s)**: Fewer queries, but changes take up to 24 hours to propagate

```typescript
// Real-world TTL strategy
const records = {
  // Static infrastructure — cache aggressively
  "cdn.example.com": { type: "CNAME", value: "d123.cloudfront.net", ttl: 86400 },

  // API endpoint — moderate cache for flexibility
  "api.example.com": { type: "A", value: "10.0.1.50", ttl: 300 },

  // Failover record — short TTL for quick switching
  "primary.example.com": { type: "A", value: "10.0.1.10", ttl: 60 },
};
```

<Callout type="tip">

**DNS propagation** isn't really "propagation" — it's cache expiration. When you change a DNS record, the old record stays cached everywhere until its TTL expires. That's why lowering TTL *before* a migration is a common practice.

</Callout>

## DNS as a Load Balancer

DNS can return multiple IP addresses for one domain. The resolver rotates through them (round-robin), spreading traffic across servers:

```typescript
// Round-robin DNS
const responses = [
  { type: "A", value: "10.0.1.1", ttl: 60 },
  { type: "A", value: "10.0.1.2", ttl: 60 },
  { type: "A", value: "10.0.1.3", ttl: 60 },
];

// GeoDNS — return different IPs based on client location
function geoDNS(clientIP: string): string {
  const region = geolocate(clientIP);
  const servers: Record<string, string> = {
    "us-east": "10.0.1.1",
    "eu-west": "10.0.2.1",
    "ap-south": "10.0.3.1",
  };
  return servers[region] || servers["us-east"];
}
```

## Security: DNS Attacks

DNS was designed without security. Common attacks:

- **DNS spoofing**: Attacker sends fake DNS responses, redirecting users to malicious servers
- **DNS amplification DDoS**: Attacker uses DNS servers to amplify traffic aimed at a victim
- **DNSSEC**: Cryptographic signatures on DNS records to prevent spoofing (adoption still growing)

## Key Takeaways

1. **DNS is hierarchical** — root → TLD → authoritative, with caching at every level
2. **TTL controls caching** — lower it before migrations, raise it for stable records
3. **DNS is more than name→IP** — it handles mail routing, verification, aliasing, and load balancing
4. **DNS is a single point of failure** — if your DNS goes down, nothing works (use multiple providers)

