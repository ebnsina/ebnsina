---
title: 'API Gateway'
subtitle: 'একটি gateway বানান যা routing, authentication, rate limiting এবং request aggregation একটিই layer-এ সামলায়।'
chapter: 14
level: 'intermediate'
readingTime: '18 মিনিট'
topics: ['API gateway', 'reverse proxy', 'request aggregation', 'middleware pipeline']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা একটা বড় সরকারি অফিস ভবনে গেছে জমির একটা কাগজ ঠিক করাতে। ভেতরে ঢুকেই সে দেখল সামনে একটাই reception desk, আর তার পেছনে অসংখ্য department — কেউ সরাসরি ভেতরে ঢুকে যে কোনো ঘরে চলে যেতে পারে না। reception-এর লোক আগে ইবনে সিনার ভোটার আইডি দেখল, নাম-ঠিকানা মিলিয়ে একটা visitor slip দিল, তারপর বলল — আপনার কাজ তো ভূমি শাখায়, তিনতলায় বাঁয়ের ঘর, এই slip দেখিয়ে ঢুকবেন। ইবনে সিনাকে কোন department কোথায় সেটা খুঁজে বেড়াতে হলো না; reception-ই ঠিক করে দিল সে কোথায় যাবে।

একটু পরেই আল-খোয়ারিজমি এসে হাজির — সে সকাল থেকে এই নিয়ে পাঁচবার এসেছে, প্রতিবার একই কথা জিজ্ঞেস করে কর্মচারীদের বিরক্ত করছে। এবার reception তাকে থামিয়ে দিল, বলল — ভাই, একটু পরে আসেন, বারবার একই তদবিরে ভেতরে পাঠানো যাবে না। পাশে ফাতিমা আল-ফিহরি এল অন্য একটা কাজে; তার আইডি ঠিক ছিল, কিন্তু সে ভুল দরজায় যাচ্ছিল বলে reception তাকে হিসাব শাখায় redirect করে দিল। পুরো ভবনে ঢোকার একটাই দরজা, আর সেই দরজাই ঠিক করছে কে ঢুকবে, কে ঢুকবে না, আর কে কোন department-এ যাবে।

এই reception desk-টাই আসলে একটা **API gateway**। ভেতরের department-গুলো হলো আলাদা আলাদা backend service, আইডি যাচাই করাটা **authentication**, আল-খোয়ারিজমিকে বারবার ঢুকতে না দেওয়াটা **rate limiting**, আর ফাতিমা আল-ফিহরিকে সঠিক শাখায় পাঠানোটা **routing** — client কখনো সরাসরি service-এ যায় না, সবাই একটাই দরজা দিয়ে ঢোকে। বাস্তবে Kong বা AWS API Gateway ঠিক এই কাজটাই করে: সব request-এর একটাই entry point, যেখানে auth, rate limit আর route একসাথে সামলানো হয়।

## API Gateway কী?

একটি API gateway হলো সব client request-এর একক প্রবেশপথ। 10টা আলাদা microservice সরাসরি কল করার বদলে, client একটাই gateway কল করে যা route করে, authenticate করে, rate limit করে, আর মাঝে মাঝে একাধিক service-এর response aggregate করে।

এটাকে একটা হোটেলের concierge-এর মতো ভাবুন — অতিথিদের restaurant, spa বা gym কোথায় সেটা জানার দরকার নেই। তারা concierge-কে বলে কী চায়, আর concierge routing সামলায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটি বড় অফিস ভবনের reception desk-এর মতো — প্রতিটি floor ঘুরে না বেড়িয়ে আপনি reception-কে বলেন কী দরকার, তারা আপনার visitor badge যাচাই করে সঠিক department-এ পাঠায়।

</Callout>

<Mermaid
title="API Gateway Pattern"
code={`graph TD
  M["Mobile App"] --> G
  W["Web App"] --> G
  T["3rd Party"] --> G["API Gateway<br/>Auth + Rate Limit + Route"]
  G --> US["User Service"]
  G --> OS["Order Service"]
  G --> PS["Product Service"]`}
/>

## Gateway-র দায়িত্ব

| বিষয়               | কী করে                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Routing             | `/users/*` user service-এ, `/orders/*` order service-এ forward করা |
| Authentication      | Forward করার আগে JWT token যাচাই করা                               |
| Rate Limiting       | প্রতি API key বা IP অনুযায়ী throttle করা                          |
| Request Aggregation | একাধিক service-এর response একটিতে মিলিয়ে দেওয়া                   |
| Circuit Breaking    | যে service ব্যর্থ হচ্ছে তার দিকে forward বন্ধ করা                  |
| Logging/Tracing     | Correlation ID যোগ করা, সব request log করা                         |

## Production API Gateway

<CodeTabs tsFile="gateway.ts" goFile="gateway.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// --- Types ---
interface RouteConfig {
	prefix: string;
	target: string;
	stripPrefix: boolean;
	rateLimit: { maxRequests: number; windowMs: number };
	requireAuth: boolean;
	timeout: number;
}

interface ServiceHealth {
	healthy: boolean;
	consecutiveFailures: number;
	lastCheck: number;
	circuitOpen: boolean;
}

// --- Configuration ---
const routes: RouteConfig[] = [
	{
		prefix: '/api/users',
		target: 'http://localhost:3001',
		stripPrefix: false,
		rateLimit: { maxRequests: 100, windowMs: 60000 },
		requireAuth: true,
		timeout: 5000
	},
	{
		prefix: '/api/orders',
		target: 'http://localhost:3002',
		stripPrefix: false,
		rateLimit: { maxRequests: 50, windowMs: 60000 },
		requireAuth: true,
		timeout: 10000
	},
	{
		prefix: '/api/products',
		target: 'http://localhost:3003',
		stripPrefix: false,
		rateLimit: { maxRequests: 200, windowMs: 60000 },
		requireAuth: false,
		timeout: 5000
	}
];

// --- Rate Limiter ---
const rateLimitWindows = new Map<string, number[]>();

function checkRateLimit(key: string, max: number, windowMs: number): boolean {
	const now = Date.now();
	const timestamps = (rateLimitWindows.get(key) || []).filter((t) => t > now - windowMs);
	timestamps.push(now);
	rateLimitWindows.set(key, timestamps);
	return timestamps.length <= max;
}

// --- Circuit Breaker ---
const serviceHealth = new Map<string, ServiceHealth>();
const FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30000;

function getServiceHealth(target: string): ServiceHealth {
	if (!serviceHealth.has(target)) {
		serviceHealth.set(target, {
			healthy: true,
			consecutiveFailures: 0,
			lastCheck: Date.now(),
			circuitOpen: false
		});
	}
	return serviceHealth.get(target)!;
}

function recordSuccess(target: string): void {
	const health = getServiceHealth(target);
	health.consecutiveFailures = 0;
	health.healthy = true;
	health.circuitOpen = false;
}

function recordFailure(target: string): void {
	const health = getServiceHealth(target);
	health.consecutiveFailures++;
	if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
		health.circuitOpen = true;
		health.lastCheck = Date.now();
		console.log(`Circuit OPEN for ${target}`);
	}
}

function isCircuitOpen(target: string): boolean {
	const health = getServiceHealth(target);
	if (!health.circuitOpen) return false;
	// Allow a probe after reset period
	if (Date.now() - health.lastCheck > CIRCUIT_RESET_MS) {
		health.circuitOpen = false;
		console.log(`Circuit HALF-OPEN for ${target} (allowing probe)`);
		return false;
	}
	return true;
}

// --- JWT Verification (simplified) ---
function verifyToken(authHeader: string | undefined): { sub: string; role: string } | null {
	if (!authHeader?.startsWith('Bearer ')) return null;
	// In production: verify JWT signature
	// This is a simplified check for the gateway example
	try {
		const token = authHeader.slice(7);
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		return { sub: payload.sub, role: payload.role };
	} catch {
		return null;
	}
}

// --- Request Aggregation ---
async function aggregateRequest(
	endpoints: { name: string; url: string }[],
	headers: Record<string, string>,
	timeout: number
): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	const results = await Promise.allSettled(
		endpoints.map(async (ep) => {
			const res = await fetch(ep.url, {
				headers,
				signal: controller.signal
			});
			return { name: ep.name, data: await res.json(), status: res.status };
		})
	);

	clearTimeout(timer);

	const aggregated: Record<string, unknown> = {};
	for (const result of results) {
		if (result.status === 'fulfilled') {
			aggregated[result.value.name] = result.value.data;
		} else {
			aggregated[(result as PromiseRejectedResult).reason?.name || 'unknown'] = {
				error: 'Service unavailable'
			};
		}
	}

	return aggregated;
}

// --- Proxy ---
async function proxyRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	route: RouteConfig,
	requestId: string
): Promise<void> {
	let targetPath = req.url || '/';
	if (route.stripPrefix) {
		targetPath = targetPath.slice(route.prefix.length) || '/';
	}

	const targetUrl = `${route.target}${targetPath}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), route.timeout);

	try {
		const body = await readBody(req);
		const proxyRes = await fetch(targetUrl, {
			method: req.method,
			headers: {
				'content-type': req.headers['content-type'] || 'application/json',
				'x-request-id': requestId,
				'x-forwarded-for': req.socket.remoteAddress || '',
				authorization: req.headers.authorization || ''
			},
			body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
			signal: controller.signal,
			redirect: 'manual'
		});

		clearTimeout(timer);
		recordSuccess(route.target);

		res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers));
		if (proxyRes.body) {
			const reader = proxyRes.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				res.write(value);
			}
		}
		res.end();
	} catch (err) {
		clearTimeout(timer);
		recordFailure(route.target);

		const isTimeout = (err as Error).name === 'AbortError';
		const status = isTimeout ? 504 : 502;
		const message = isTimeout ? 'Gateway timeout' : 'Bad gateway';

		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: message, requestId }));
	}
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks)));
	});
}

// --- Gateway Server ---
const server = http.createServer(async (req, res) => {
	const requestId = crypto.randomUUID();
	const start = performance.now();
	const clientIP = req.socket.remoteAddress || 'unknown';

	res.setHeader('X-Request-Id', requestId);

	// Aggregation endpoint
	if (req.url === '/api/dashboard' && req.method === 'GET') {
		const data = await aggregateRequest(
			[
				{ name: 'user', url: 'http://localhost:3001/api/users/me' },
				{ name: 'orders', url: 'http://localhost:3002/api/orders?limit=5' },
				{ name: 'recommendations', url: 'http://localhost:3003/api/products/recommended' }
			],
			{ authorization: req.headers.authorization || '' },
			5000
		);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
		return;
	}

	// Find matching route
	const route = routes.find((r) => req.url?.startsWith(r.prefix));
	if (!route) {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'No route matched', requestId }));
		return;
	}

	// Auth check
	if (route.requireAuth) {
		const user = verifyToken(req.headers.authorization);
		if (!user) {
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized', requestId }));
			return;
		}
	}

	// Rate limit check
	const rlKey = `${clientIP}:${route.prefix}`;
	if (!checkRateLimit(rlKey, route.rateLimit.maxRequests, route.rateLimit.windowMs)) {
		res.writeHead(429, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Too many requests', requestId }));
		return;
	}

	// Circuit breaker check
	if (isCircuitOpen(route.target)) {
		res.writeHead(503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Service temporarily unavailable', requestId }));
		return;
	}

	// Proxy request
	await proxyRequest(req, res, route, requestId);

	const duration = (performance.now() - start).toFixed(1);
	console.log(`${req.method} ${req.url} -> ${route.target} [${duration}ms] id=${requestId}`);
});

server.listen(8080, () => console.log('API Gateway on http://localhost:8080'));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// --- Config ---
type RouteConfig struct {
	Prefix      string
	Target      string
	StripPrefix bool
	MaxRequests int
	WindowMs    int64
	RequireAuth bool
	Timeout     time.Duration
}

var routes = []RouteConfig{
	{"/api/users", "http://localhost:3001", false, 100, 60000, true, 5 * time.Second},
	{"/api/orders", "http://localhost:3002", false, 50, 60000, true, 10 * time.Second},
	{"/api/products", "http://localhost:3003", false, 200, 60000, false, 5 * time.Second},
}

// --- Circuit Breaker ---
type CircuitBreaker struct {
	mu                  sync.Mutex
	consecutiveFailures int
	circuitOpen         bool
	lastFailure         time.Time
	threshold           int
	resetTimeout        time.Duration
}

func NewCircuitBreaker() *CircuitBreaker {
	return &CircuitBreaker{threshold: 5, resetTimeout: 30 * time.Second}
}

func (cb *CircuitBreaker) IsOpen() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if !cb.circuitOpen {
		return false
	}
	if time.Since(cb.lastFailure) > cb.resetTimeout {
		cb.circuitOpen = false
		return false
	}
	return true
}

func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.consecutiveFailures = 0
	cb.circuitOpen = false
}

func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.consecutiveFailures++
	cb.lastFailure = time.Now()
	if cb.consecutiveFailures >= cb.threshold {
		cb.circuitOpen = true
		log.Printf("Circuit OPEN")
	}
}

// --- Rate Limiter ---
type RateLimiter struct {
	mu      sync.Mutex
	windows map[string][]int64
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{windows: make(map[string][]int64)}
}

func (rl *RateLimiter) Allow(key string, max int, windowMs int64) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now().UnixMilli()
	var valid []int64
	for _, t := range rl.windows[key] {
		if t > now-windowMs {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	rl.windows[key] = valid
	return len(valid) <= max
}

// --- Gateway ---
type Gateway struct {
	routes    []RouteConfig
	proxies   map[string]*httputil.ReverseProxy
	breakers  map[string]*CircuitBreaker
	limiter   *RateLimiter
	reqCount  atomic.Int64
}

func NewGateway(routes []RouteConfig) *Gateway {
	g := &Gateway{
		routes:   routes,
		proxies:  make(map[string]*httputil.ReverseProxy),
		breakers: make(map[string]*CircuitBreaker),
		limiter:  NewRateLimiter(),
	}

	for _, r := range routes {
		target, _ := url.Parse(r.Target)
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
			g.breakers[r.Target].RecordFailure()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprintf(w, `{"error":"bad gateway","detail":"%s"}`, err.Error())
		}
		g.proxies[r.Target] = proxy
		g.breakers[r.Target] = NewCircuitBreaker()
	}

	return g
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	requestID := uuid.New().String()
	start := time.Now()
	w.Header().Set("X-Request-Id", requestID)

	// Aggregation endpoint
	if r.URL.Path == "/api/dashboard" && r.Method == http.MethodGet {
		g.handleAggregate(w, r, requestID)
		return
	}

	// Find route
	var route *RouteConfig
	for i := range g.routes {
		if strings.HasPrefix(r.URL.Path, g.routes[i].Prefix) {
			route = &g.routes[i]
			break
		}
	}
	if route == nil {
		writeJSON(w, 404, map[string]string{"error": "No route matched"})
		return
	}

	// Auth
	if route.RequireAuth {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
	}

	// Rate limit
	key := fmt.Sprintf("%s:%s", r.RemoteAddr, route.Prefix)
	if !g.limiter.Allow(key, route.MaxRequests, route.WindowMs) {
		writeJSON(w, 429, map[string]string{"error": "Too many requests"})
		return
	}

	// Circuit breaker
	if g.breakers[route.Target].IsOpen() {
		writeJSON(w, 503, map[string]string{"error": "Service unavailable"})
		return
	}

	// Proxy with timeout
	ctx, cancel := context.WithTimeout(r.Context(), route.Timeout)
	defer cancel()

	r.Header.Set("X-Request-Id", requestID)
	r.Header.Set("X-Forwarded-For", r.RemoteAddr)

	proxy := g.proxies[route.Target]
	proxy.ServeHTTP(w, r.WithContext(ctx))
	g.breakers[route.Target].RecordSuccess()

	g.reqCount.Add(1)
	log.Printf("%s %s -> %s [%v] id=%s",
		r.Method, r.URL.Path, route.Target, time.Since(start), requestID)
}

func (g *Gateway) handleAggregate(w http.ResponseWriter, r *http.Request, _ string) {
	type result struct {
		Name string
		Data json.RawMessage
		Err  error
	}

	endpoints := []struct{ Name, URL string }{
		{"user", "http://localhost:3001/api/users/me"},
		{"orders", "http://localhost:3002/api/orders?limit=5"},
		{"products", "http://localhost:3003/api/products/recommended"},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	results := make(chan result, len(endpoints))
	for _, ep := range endpoints {
		go func(name, url string) {
			req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
			req.Header.Set("Authorization", r.Header.Get("Authorization"))
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				results <- result{Name: name, Err: err}
				return
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			results <- result{Name: name, Data: body}
		}(ep.Name, ep.URL)
	}

	aggregated := make(map[string]json.RawMessage)
	for i := 0; i < len(endpoints); i++ {
		res := <-results
		if res.Err != nil {
			aggregated[res.Name] = json.RawMessage(`{"error":"service unavailable"}`)
		} else {
			aggregated[res.Name] = res.Data
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(aggregated)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	gateway := NewGateway(routes)
	log.Println("API Gateway on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", gateway))
}
```

</div>
</CodeTabs>

<div class="takeaways">

### মূল কথা

- একটি API gateway cross-cutting concern-গুলো একজায়গায় আনে: auth, rate limiting, logging, routing
- **Circuit breaker** ব্যর্থ হওয়া service-এ request থামিয়ে cascading failure আটকায়
- **Request aggregation** একাধিক service call মিলিয়ে client-এর round-trip কমায়
- Gateway-তে সবসময় **request ID** যোগ করুন এবং tracing-এর জন্য downstream-এ পাঠিয়ে দিন
- প্রতি route-এ **timeout** সেট করুন — একটি ধীর product search যেন order creation-কে timeout করে না ফেলে

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Netflix Zuul** তাদের API gateway হিসেবে দিনে কোটি কোটি request সামলায়
- **Kong** এবং **AWS API Gateway** জনপ্রিয় managed gateway সমাধান
- **Shopify** তাদের 300+ service-এর মধ্যে routing-এর জন্য একটি custom gateway ব্যবহার করে
- Custom routing logic দরকার না হলে একটি managed gateway ব্যবহার করুন। Request aggregation বা domain-specific auth flow-এর জন্য custom বানান।

</div>
