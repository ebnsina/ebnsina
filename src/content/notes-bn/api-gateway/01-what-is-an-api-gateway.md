---
title: 'What Is an API Gateway'
subtitle: 'আপনার সার্ভিসগুলোর সামনে একটাই entry point — backend-এ হাত না দিয়েই routing, auth, rate limiting আর transformation।'
chapter: 1
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['api gateway', 'reverse proxy', 'routing', 'cross-cutting concerns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা হোটেলের concierge — প্রতিটা অতিথির অনুরোধ তার মধ্য দিয়ে যায়। সে যাচাই করে আপনি অতিথি কিনা (auth), আপনাকে ঠিক ডিপার্টমেন্টে পাঠায় (routing), একজন অতিথিকে সব স্টাফের সময় দখল করতে দেয় না (rate limiting), আর দরকার হলে অনুবাদ করে দেয় (transformation)। ডিপার্টমেন্টগুলো কখনো যাচাই-না-হওয়া অতিথিদের সরাসরি সামলায় না।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমি বাগদাদের একটা বড় হোটেলে উঠেছেন। রাত এগারোটায় খিদে পেয়েছে, শার্টটাও ধুতে দিতে হবে, আর ভোরে এয়ারপোর্টে যাওয়ার জন্য একটা গাড়িও লাগবে। কিন্তু তাকে রান্নাঘর কোথায়, লন্ড্রি কোন তলায়, ট্রান্সপোর্ট ডেস্কে কে বসে — এসব খুঁজে বের করতে হয় না। তিনি শুধু লবিতে নেমে concierge ইবনে সিনার কাছে যান। ইবনে সিনা এক ঝলকে তার রুম কার্ড দেখে নিশ্চিত হন ইনি সত্যিই একজন অতিথি, তারপর ডিনারের অর্ডার রান্নাঘরে, শার্ট লন্ড্রিতে আর গাড়ির কথা ট্রান্সপোর্টে চুপচাপ পাঠিয়ে দেন। আল-খোয়ারিজমি কখনো পেছনের করিডরে ঢোকেন না, কোন স্টাফ কী করে তাও জানেন না।

পরদিন আরেক অতিথি ফাতিমা আল-ফিহরি একই concierge-এর কাছে ডাক্তারের ব্যবস্থা চান। ইবনে সিনা আবার সেই একই কাজ করেন — পরিচয় যাচাই, তারপর সঠিক ডিপার্টমেন্টে পাঠানো, আর প্রতিটা অনুরোধ খাতায় টুকে রাখা কে কখন কী চেয়েছিল। রান্নাঘর বা লন্ড্রিকে কখনো ভাবতে হয় না অতিথি আসল কিনা, কিংবা কে বেশি বেশি অনুরোধ পাঠাচ্ছে — সেই ঝামেলা concierge-ই সামলে দেন।

এই concierge-ই হলো একটা **API gateway**। অতিথিরা যেমন সবকিছুর জন্য শুধু একজন concierge-এর কাছেই যায়, তেমনি সব client শুধু একটাই entry point — gateway-র সাথে কথা বলে, ভেতরের সার্ভিসগুলোর ঠিকানা কখনো জানে না; এটাই unified façade। আর রান্নাঘর, লন্ড্রি, ট্রান্সপোর্ট যেমন আলাদা আলাদা backend service, তেমনি concierge-এর পরিচয় যাচাই আর অনুরোধ খাতায় টুকে রাখাই হলো centralised auth আর logging-এর মতো cross-cutting concern — এক জায়গায়, একবার। বাস্তবে Kong বা AWS API Gateway ঠিক এভাবেই কাজ করে: প্রতিটা সার্ভিসে আলাদা করে auth বা rate limiting না বসিয়ে সবটা একটাই দরজায় সামলানো হয়।

## এটা কোন সমস্যা সমাধান করে

gateway না থাকলে প্রতিটা client সরাসরি প্রতিটা সার্ভিসের সাথে কথা বলে:

```
Mobile app  ──→ User Service :3001
            ──→ Order Service :3002
            ──→ Product Service :3003
            ──→ Payment Service :3004
```

প্রতিটা সার্ভিসকে আলাদাভাবে auth, rate limiting, logging, CORS, SSL termination বানাতে হয়। auth logic বদলালে আপনাকে দশটা সার্ভিস আপডেট করতে হয়। নতুন সার্ভিস যোগ করলে mobile app-কে নতুন build ছাড়তে হয় সেই নতুন URL-এ হিট করার জন্য।

একটা gateway থাকলে:

```
Mobile app  ──→ API Gateway :443
                    ├──→ User Service :3001
                    ├──→ Order Service :3002
                    ├──→ Product Service :3003
                    └──→ Payment Service :3004
```

gateway cross-cutting concern-গুলোর মালিক। সার্ভিসগুলো শুধু business logic সামলায়।

## একটা Gateway কী করে

**Routing** — আসা path-গুলোকে backend সার্ভিসে ম্যাপ করা:

```
GET  /users/*        → user-service
GET  /orders/*       → order-service
POST /payments/*     → payment-service
```

**Authentication** — request কোনো সার্ভিসে পৌঁছানোর আগেই JWT/API key যাচাই করা। সার্ভিসগুলো gateway-কে বিশ্বাস করে আর আবার যাচাই করে না।

**Rate limiting** — per client, per route, per plan tier request-এ সীমা বসানো।

**SSL termination** — client থেকে HTTPS গ্রহণ করে ভেতরে HTTP forward করা। সার্ভিসগুলোর certificate লাগে না।

**Request/response transformation** — header যোগ করা, field বাদ দেওয়া, payload নতুন করে সাজানো।

**Load balancing** — প্রতিটা সার্ভিসের একাধিক instance-এর মধ্যে traffic ভাগ করা।

**Observability** — সব traffic-এর access log, trace ID, latency metric সংগ্রহের একটাই জায়গা।

## Gateway vs Reverse Proxy vs Load Balancer

এই শব্দগুলো একে অপরের সাথে মিলে যায়, তবে অর্থ আলাদা:

|                    | Reverse Proxy | Load Balancer    | API Gateway                    |
| ------------------ | ------------- | ---------------- | ------------------------------ |
| যা দিয়ে route করে | URL/host      | Connection       | URL + headers + method         |
| Auth               | না            | না               | হ্যাঁ                          |
| Rate limiting      | না            | না               | হ্যাঁ                          |
| Payload transform  | কদাচিৎ        | না               | হ্যাঁ                          |
| উদাহরণ             | nginx, Caddy  | HAProxy, AWS NLB | Kong, AWS API Gateway, Traefik |

একটা gateway হলো application-layer সচেতনতা সহ একটা reverse proxy। অনেক টুল এই সীমারেখা ঝাপসা করে দেয় — nginx plugin দিয়ে gateway-র কাজ করতে পারে, Traefik হলো এমন একটা proxy যার মধ্যে gateway-র ফিচার built-in।

## Self-Hosted vs Managed

**Self-hosted:** Kong, Traefik, Envoy, nginx + Lua। আপনি gateway চালান, config-এর মালিক আপনি, compute খরচ আপনি দেন। বেশি নিয়ন্ত্রণ, বেশি ops-এর ঝামেলা।

**Managed:** AWS API Gateway, Google Cloud Endpoints, Azure API Management, Cloudflare API Gateway। পুরোপুরি managed, per-request pricing, opinionated configuration।

**কখন managed জেতে:** early-stage, ছোট টিম, AWS-native stack। কিছু না চালিয়েই আপনি auth, rate limiting আর একটা dashboard পান।

**কখন self-hosted জেতে:** বেশি traffic (managed gateway দ্রুত খরুচে হয়ে যায়), non-AWS stack, custom plugin দরকার, কড়া latency requirement।

## Node.js-এ একটা Minimal Gateway

Kong বা AWS-এর দিকে হাত বাড়ানোর আগে বুঝে নিন একটা gateway আসলে কী — middleware সহ একটা reverse proxy:

```typescript
import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const routes: Record<string, string> = {
	'/users': 'http://user-service:3001',
	'/orders': 'http://order-service:3002',
	'/products': 'http://product-service:3003'
};

function matchRoute(path: string): string | null {
	for (const [prefix, target] of Object.entries(routes)) {
		if (path.startsWith(prefix)) return target;
	}
	return null;
}

const gateway = http.createServer((req, res) => {
	// 1. Auth
	const token = req.headers['authorization']?.split(' ')[1];
	if (!verifyJWT(token)) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

	// 2. Rate limiting (simplified)
	const clientIp = req.socket.remoteAddress!;
	if (isRateLimited(clientIp)) {
		res.writeHead(429, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Too Many Requests' }));
		return;
	}

	// 3. Route
	const target = matchRoute(req.url ?? '/');
	if (!target) {
		res.writeHead(404);
		res.end(JSON.stringify({ error: 'Not Found' }));
		return;
	}

	// 4. Add internal headers
	req.headers['x-request-id'] = crypto.randomUUID();
	req.headers['x-forwarded-for'] = clientIp;

	// 5. Proxy
	proxy.web(req, res, { target });
});

gateway.listen(3000);
```

Production gateway এই loop-টাই — শুধু বিপুলভাবে optimize আর hardened করা।
