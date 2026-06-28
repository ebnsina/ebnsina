---
title: 'Load Balancing'
subtitle: 'Build a reverse proxy with round-robin distribution, health checks, and sticky sessions.'
chapter: 5
level: 'intermediate'
readingTime: '20 min'
topics: ['load balancer', 'reverse proxy', 'health checks', 'round-robin']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Why Load Balancing?

One server can handle a few thousand requests per second. When you need more, you add more servers. A load balancer sits in front and distributes traffic across them. If one server dies, the load balancer stops sending traffic to it — no downtime for users.

<Callout type="info">

**Real-World Analogy**

Like a bank with multiple teller windows — instead of everyone lining up at one window, a queue manager distributes customers evenly across all open windows.

</Callout>

<Mermaid
title="Load Balancer Architecture"
code={`graph LR
  C["Clients"] --> LB["Load Balancer<br/>Round Robin"]
  LB --> S1["Server 1"]
  LB --> S2["Server 2"]
  LB --> S3["Server 3"]`}
/>

## Algorithms

| Algorithm            | How It Works                            | Best For                         |
| -------------------- | --------------------------------------- | -------------------------------- |
| Round Robin          | Rotate through servers sequentially     | Equal-capacity servers           |
| Weighted Round Robin | More traffic to stronger servers        | Mixed-capacity servers           |
| Least Connections    | Send to server with fewest active conns | Varying request durations        |
| IP Hash              | Same client IP always hits same server  | Session affinity without cookies |

## Building a Load Balancer

<CodeTabs tsFile="loadbalancer.ts" goFile="loadbalancer.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';

// --- Types ---
interface Backend {
	url: string;
	healthy: boolean;
	activeConnections: number;
	totalRequests: number;
	weight: number;
}

interface LBConfig {
	backends: { url: string; weight?: number }[];
	healthCheckInterval: number; // ms
	healthCheckPath: string;
	healthCheckTimeout: number; // ms
	algorithm: 'round-robin' | 'least-connections' | 'ip-hash';
}

// --- Load Balancer ---
class LoadBalancer {
	private backends: Backend[];
	private currentIndex = 0;
	private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
	private config: LBConfig;

	constructor(config: LBConfig) {
		this.config = config;
		this.backends = config.backends.map((b) => ({
			url: b.url,
			healthy: true,
			activeConnections: 0,
			totalRequests: 0,
			weight: b.weight || 1
		}));
	}

	// Pick a backend based on the configured algorithm
	private selectBackend(clientIP: string): Backend | null {
		const healthy = this.backends.filter((b) => b.healthy);
		if (healthy.length === 0) return null;

		switch (this.config.algorithm) {
			case 'round-robin': {
				const backend = healthy[this.currentIndex % healthy.length];
				this.currentIndex++;
				return backend;
			}
			case 'least-connections': {
				return healthy.reduce((min, b) => (b.activeConnections < min.activeConnections ? b : min));
			}
			case 'ip-hash': {
				let hash = 0;
				for (let i = 0; i < clientIP.length; i++) {
					hash = (hash * 31 + clientIP.charCodeAt(i)) >>> 0;
				}
				return healthy[hash % healthy.length];
			}
		}
	}

	// Proxy a request to a backend
	async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const clientIP = req.socket.remoteAddress || 'unknown';
		const backend = this.selectBackend(clientIP);

		if (!backend) {
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'No healthy backends available' }));
			return;
		}

		backend.activeConnections++;
		backend.totalRequests++;

		const targetUrl = new URL(req.url || '/', backend.url);
		const startTime = Date.now();

		try {
			const proxyRes = await fetch(targetUrl.toString(), {
				method: req.method,
				headers: {
					...Object.fromEntries(
						Object.entries(req.headers).filter(([, v]) => v !== undefined) as [string, string][]
					),
					'X-Forwarded-For': clientIP,
					'X-Forwarded-Proto': 'http',
					'X-Real-IP': clientIP
				},
				body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await streamToBuffer(req),
				redirect: 'manual'
			});

			// Forward response headers
			res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers));

			// Stream response body
			if (proxyRes.body) {
				const reader = proxyRes.body.getReader();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					res.write(value);
				}
			}
			res.end();

			const duration = Date.now() - startTime;
			console.log(`${req.method} ${req.url} -> ${backend.url} [${proxyRes.status}] ${duration}ms`);
		} catch (err) {
			console.error(`Backend ${backend.url} error:`, err);
			backend.healthy = false;
			res.writeHead(502, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Bad gateway' }));
		} finally {
			backend.activeConnections--;
		}
	}

	// Health checking
	startHealthChecks(): void {
		this.healthCheckTimer = setInterval(async () => {
			const checks = this.backends.map(async (backend) => {
				try {
					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

					const res = await fetch(`${backend.url}${this.config.healthCheckPath}`, {
						signal: controller.signal
					});
					clearTimeout(timeout);

					const wasHealthy = backend.healthy;
					backend.healthy = res.ok;

					if (!wasHealthy && backend.healthy) {
						console.log(`Backend ${backend.url} is now HEALTHY`);
					} else if (wasHealthy && !backend.healthy) {
						console.log(`Backend ${backend.url} is now UNHEALTHY`);
					}
				} catch {
					if (backend.healthy) {
						console.log(`Backend ${backend.url} is now UNHEALTHY`);
					}
					backend.healthy = false;
				}
			});

			await Promise.all(checks);
		}, this.config.healthCheckInterval);
	}

	stopHealthChecks(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
		}
	}

	getStatus(): object {
		return {
			backends: this.backends.map((b) => ({
				url: b.url,
				healthy: b.healthy,
				activeConnections: b.activeConnections,
				totalRequests: b.totalRequests
			}))
		};
	}
}

function streamToBuffer(stream: http.IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on('data', (c) => chunks.push(c));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('error', reject);
	});
}

// --- Start ---
const lb = new LoadBalancer({
	backends: [
		{ url: 'http://localhost:3001', weight: 2 },
		{ url: 'http://localhost:3002', weight: 1 },
		{ url: 'http://localhost:3003', weight: 1 }
	],
	healthCheckInterval: 5000,
	healthCheckPath: '/health',
	healthCheckTimeout: 3000,
	algorithm: 'round-robin'
});

lb.startHealthChecks();

const server = http.createServer((req, res) => {
	if (req.url === '/lb/status') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(lb.getStatus()));
		return;
	}
	lb.handleRequest(req, res);
});

server.listen(8080, () => {
	console.log('Load balancer listening on http://localhost:8080');
});

process.on('SIGTERM', () => {
	lb.stopHealthChecks();
	server.close();
});
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// --- Types ---
type Backend struct {
	URL               *url.URL
	Healthy           atomic.Bool
	ActiveConnections atomic.Int64
	TotalRequests     atomic.Int64
	Weight            int
	ReverseProxy      *httputil.ReverseProxy
}

type Config struct {
	Backends           []BackendConfig
	HealthCheckPath    string
	HealthCheckInterval time.Duration
	HealthCheckTimeout  time.Duration
	Algorithm          string // "round-robin", "least-conn", "ip-hash"
}

type BackendConfig struct {
	URL    string
	Weight int
}

// --- Load Balancer ---
type LoadBalancer struct {
	backends []*Backend
	current  atomic.Uint64
	config   Config
}

func NewLoadBalancer(config Config) *LoadBalancer {
	lb := &LoadBalancer{config: config}

	for _, bc := range config.Backends {
		u, err := url.Parse(bc.URL)
		if err != nil {
			log.Fatalf("Invalid backend URL %s: %v", bc.URL, err)
		}

		proxy := httputil.NewSingleHostReverseProxy(u)
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("Proxy error for %s: %v", u.String(), err)
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprintf(w, `{"error":"bad gateway"}`)
		}

		weight := bc.Weight
		if weight <= 0 {
			weight = 1
		}

		b := &Backend{
			URL:          u,
			Weight:       weight,
			ReverseProxy: proxy,
		}
		b.Healthy.Store(true)
		lb.backends = append(lb.backends, b)
	}

	return lb
}

func (lb *LoadBalancer) healthyBackends() []*Backend {
	var healthy []*Backend
	for _, b := range lb.backends {
		if b.Healthy.Load() {
			healthy = append(healthy, b)
		}
	}
	return healthy
}

func (lb *LoadBalancer) selectBackend(clientIP string) *Backend {
	healthy := lb.healthyBackends()
	if len(healthy) == 0 {
		return nil
	}

	switch lb.config.Algorithm {
	case "least-conn":
		var min *Backend
		for _, b := range healthy {
			if min == nil || b.ActiveConnections.Load() < min.ActiveConnections.Load() {
				min = b
			}
		}
		return min

	case "ip-hash":
		h := fnv.New32a()
		h.Write([]byte(clientIP))
		idx := h.Sum32() % uint32(len(healthy))
		return healthy[idx]

	default: // round-robin
		idx := lb.current.Add(1) - 1
		return healthy[idx%uint64(len(healthy))]
	}
}

func (lb *LoadBalancer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Status endpoint
	if r.URL.Path == "/lb/status" {
		lb.statusHandler(w)
		return
	}

	clientIP := r.RemoteAddr
	backend := lb.selectBackend(clientIP)
	if backend == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `{"error":"no healthy backends"}`)
		return
	}

	backend.ActiveConnections.Add(1)
	backend.TotalRequests.Add(1)
	defer backend.ActiveConnections.Add(-1)

	// Add proxy headers
	r.Header.Set("X-Forwarded-For", clientIP)
	r.Header.Set("X-Real-IP", clientIP)
	r.Header.Set("X-Forwarded-Proto", "http")

	start := time.Now()
	backend.ReverseProxy.ServeHTTP(w, r)
	log.Printf("%s %s -> %s [%v]", r.Method, r.URL.Path, backend.URL, time.Since(start))
}

func (lb *LoadBalancer) statusHandler(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"backends":[`)
	for i, b := range lb.backends {
		if i > 0 {
			fmt.Fprint(w, ",")
		}
		fmt.Fprintf(w,
			`{"url":"%s","healthy":%t,"activeConnections":%d,"totalRequests":%d}`,
			b.URL, b.Healthy.Load(), b.ActiveConnections.Load(), b.TotalRequests.Load(),
		)
	}
	fmt.Fprint(w, "]}")
}

// --- Health Checking ---
func (lb *LoadBalancer) StartHealthChecks(ctx context.Context) {
	ticker := time.NewTicker(lb.config.HealthCheckInterval)
	defer ticker.Stop()

	client := &http.Client{Timeout: lb.config.HealthCheckTimeout}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			var wg sync.WaitGroup
			for _, b := range lb.backends {
				wg.Add(1)
				go func(backend *Backend) {
					defer wg.Done()
					checkURL := backend.URL.String() + lb.config.HealthCheckPath

					resp, err := client.Get(checkURL)
					wasHealthy := backend.Healthy.Load()

					if err != nil || resp.StatusCode >= 500 {
						backend.Healthy.Store(false)
						if wasHealthy {
							log.Printf("Backend %s is now UNHEALTHY", backend.URL)
						}
					} else {
						backend.Healthy.Store(true)
						if !wasHealthy {
							log.Printf("Backend %s is now HEALTHY", backend.URL)
						}
					}
					if resp != nil {
						io.Copy(io.Discard, resp.Body)
						resp.Body.Close()
					}
				}(b)
			}
			wg.Wait()
		}
	}
}

func main() {
	config := Config{
		Backends: []BackendConfig{
			{URL: "http://localhost:3001", Weight: 2},
			{URL: "http://localhost:3002", Weight: 1},
			{URL: "http://localhost:3003", Weight: 1},
		},
		HealthCheckPath:     "/health",
		HealthCheckInterval: 5 * time.Second,
		HealthCheckTimeout:  3 * time.Second,
		Algorithm:           "round-robin",
	}

	lb := NewLoadBalancer(config)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go lb.StartHealthChecks(ctx)

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      lb,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Println("Load balancer listening on :8080")
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
	log.Println("Load balancer stopped")
}
```

</div>
</CodeTabs>

<div class="takeaways">

### Key Takeaways

- Load balancers distribute traffic and remove unhealthy servers automatically
- Round-robin is the simplest and works well when servers have equal capacity
- Least-connections is better when request durations vary significantly
- IP-hash provides sticky sessions without cookies but causes uneven distribution
- Always implement health checks — without them, the LB sends traffic to dead servers

</div>

<div class="when-to-use">

### Real-World Usage

- **Netflix** uses multiple layers of load balancing: DNS-level, then AWS ELB, then Zuul (custom proxy)
- **Cloudflare** processes 50M+ HTTP requests per second across their load-balanced edge network
- **AWS ALB** (Application Load Balancer) supports path-based routing, WebSockets, and gRPC
- Start with your cloud provider's LB (ALB, Cloud Load Balancing). Build custom only if you need routing logic they don't support.

</div>
