---
title: 'CDN ও Edge Caching'
subtitle: 'Cache header, private content-এর জন্য signed URL এবং cache purging strategy সহ edge caching বানান।'
chapter: 15
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['CDN', 'edge caching', 'Cache-Control', 'signed URLs', 'cache purging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

করিমের একটা প্রোডাক্ট কোম্পানি আছে, কারখানা ঢাকায়। শুরুতে সিলেট, চট্টগ্রাম, রাজশাহী — সব জেলার অর্ডার সরাসরি ঢাকার কারখানা থেকে পাঠানো হতো। ফাতেমা সিলেটে বসে একটা জিনিস অর্ডার করলে সেটা ঢাকা থেকে ট্রাকে করে আসতে দুই দিন লেগে যেত, আর সব অর্ডারের চাপ একা কারখানার ওপরেই পড়ত। দূরত্বই ছিল আসল সমস্যা।

তাই করিম বুদ্ধি করে প্রতিটা জেলায় একটা করে ছোট distribution hub বসাল। এখন যেগুলো বেশি বিক্রি হয়, সেগুলোর স্টক আগে থেকেই কাছের hub-এ রাখা থাকে। ফাতেমা সিলেটে অর্ডার দিলে সিলেটের hub থেকেই কয়েক ঘণ্টায় ডেলিভারি হয়ে যায় — ঢাকা পর্যন্ত যেতেই হয় না। hub-গুলো নির্দিষ্ট সময় পরপর কারখানা থেকে নতুন স্টক এনে রিস্টক করে, আর পুরনো বা মেয়াদ-ফুরানো মাল সরিয়ে ফেলে যাতে গ্রাহক বাসি জিনিস না পায়। কোনো জিনিস হুট করে বদলে গেলে করিম সব hub-কে বলে দেয় পুরনো স্টক এক্ষুনি ফেলে দিতে।

এই গল্পটাই আসলে **CDN ও edge caching**। জেলার distribution hub হলো edge (PoP), ঢাকার কারখানা হলো origin server, কাছের hub থেকে দ্রুত ডেলিভারি হলো কম latency, hub-এর নিয়মিত রিস্টক হলো cache-এর TTL, আর পুরনো স্টক সরানো হলো cache purge/expiry। বাস্তবে Cloudflare বা Akamai ঠিক এভাবেই বিশ্বজুড়ে edge location-এ content cache করে রাখে, যাতে ইউজার দূরের origin-এ না গিয়ে সবচেয়ে কাছের edge থেকেই সাড়া পায়।

## CDN ও Edge Caching কী?

একটি **Content Delivery Network (CDN)** হলো বিশ্বজুড়ে ছড়িয়ে থাকা server-এর একটি network যা end user-দের কাছাকাছি content cache করে রাখে। প্রতিটি request আপনার origin server পর্যন্ত যাওয়ার বদলে, user-এর সবচেয়ে কাছের CDN edge node cache করা response দেয় — এতে latency শত শত millisecond থেকে single digit-এ নেমে আসে।

এটাকে স্থানীয় লাইব্রেরির একটা চেইনের মতো ভাবুন। মূল লাইব্রেরিতে (origin server) সব বই আছে, কিন্তু সেটা শহরের ওপারে। আপনার পাড়ার শাখা (edge node) সবচেয়ে জনপ্রিয় বইগুলোর কপি রাখে। একটা bestseller চাইলে আপনি সেটা তখনই স্থানীয় শাখা থেকে পান। শুধু বিরল request-গুলোকেই মূল লাইব্রেরিতে যেতে হয়।

<Mermaid
title="CDN Edge Caching Architecture"
code={`graph LR
  C["Client<br/>Browser / App"] --> E["CDN Edge<br/>Cache Layer"] --> O["Origin Server<br/>Cache Headers"] --> S["Storage<br/>Files / Objects"]`}
/>

## বাস্তব জীবনের উদাহরণ

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

প্রতিটি বড় শহরে warehouse থাকা একটি franchise-এর মতো — সবকিছু একটা কেন্দ্রীয় warehouse থেকে পাঠানোর বদলে, স্থানীয় warehouse কাছের গ্রাহকদের দ্রুত সেবা দেয়।

</Callout>

Netflix যখন একটি show-এর নতুন season দেয়, তখন video file-গুলো তাদের origin storage থেকে বিশ্বজুড়ে CDN edge node-এ push করা হয়। Tokyo-র একজন viewer Japan-এর কাছের একটি edge server থেকে stream পান, Virginia-র data center থেকে নয়। Edge-এ file cache না থাকলে, সেটা একবার origin থেকে টেনে আনে, তারপর পরবর্তী সব Tokyo request স্থানীয়ভাবেই দেয়। Cloudflare web asset-এর জন্য একই কাজ করে — আপনার CSS আর JavaScript বিশ্বজুড়ে 300+ edge location-এ cache করা থাকে।

## একটি CDN Origin Server বানানো

এখানে একটি সম্পূর্ণ origin server আছে যা যথাযথ cache header, ETag সহ conditional request, private content-এর জন্য signed URL এবং একটি cache purge API implement করে। এটাই সেই server-side logic যা CDN caching-এর আচরণ চালায়।

<CodeTabs tsFile="cdn-origin.ts" goFile="cdn-origin.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- Configuration ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = process.env.STATIC_DIR || './public';
const SIGNING_SECRET = process.env.SIGNING_SECRET || 'change-me-in-production';
const PURGE_API_KEY = process.env.PURGE_API_KEY || 'purge-secret-key';

// --- Types ---
interface CacheEntry {
	etag: string;
	lastModified: Date;
	contentType: string;
	size: number;
}

interface SignedURLParams {
	filePath: string;
	expiresAt: number;
	signature: string;
}

// --- In-memory cache metadata registry ---
const cacheRegistry = new Map<string, CacheEntry>();
const purgedPaths = new Set<string>();

// --- Content type detection ---
const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.mp4': 'video/mp4'
};

function getContentType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

// --- ETag generation using file content hash ---
function generateETag(content: Buffer): string {
	const hash = crypto.createHash('sha256').update(content).digest('hex');
	return `"${hash.substring(0, 32)}"`;
}

// --- Cache-Control header based on file type ---
function getCacheControl(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	// Immutable assets (hashed filenames) -- cache for 1 year
	if (filePath.includes('.hash.') || filePath.includes('/immutable/')) {
		return 'public, max-age=31536000, immutable';
	}
	// HTML -- always revalidate
	if (ext === '.html') {
		return 'public, no-cache, must-revalidate';
	}
	// Images and fonts -- cache 30 days with stale-while-revalidate
	if (['.png', '.jpg', '.gif', '.svg', '.woff2'].includes(ext)) {
		return 'public, max-age=2592000, stale-while-revalidate=86400';
	}
	// CSS/JS -- cache 7 days
	if (['.css', '.js'].includes(ext)) {
		return 'public, max-age=604800, stale-while-revalidate=3600';
	}
	// Default -- short cache with revalidation
	return 'public, max-age=300, must-revalidate';
}

// --- Signed URL generation and validation ---
function generateSignedURL(filePath: string, ttlSeconds: number): string {
	const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
	const payload = `${filePath}:${expiresAt}`;
	const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

	const params = new URLSearchParams({
		file: filePath,
		expires: String(expiresAt),
		sig: signature
	});
	return `/private?${params.toString()}`;
}

function validateSignedURL(params: URLSearchParams): SignedURLParams | null {
	const filePath = params.get('file');
	const expiresStr = params.get('expires');
	const signature = params.get('sig');

	if (!filePath || !expiresStr || !signature) return null;

	const expiresAt = parseInt(expiresStr, 10);
	if (isNaN(expiresAt)) return null;

	// Check expiration
	const now = Math.floor(Date.now() / 1000);
	if (now > expiresAt) return null;

	// Verify HMAC signature
	const payload = `${filePath}:${expiresAt}`;
	const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

	if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		return null;
	}

	return { filePath, expiresAt, signature };
}

// --- Serve static file with caching headers ---
async function serveStaticFile(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	filePath: string,
	isPrivate: boolean
): Promise<void> {
	const fullPath = path.resolve(STATIC_DIR, filePath);

	// Prevent directory traversal
	if (!fullPath.startsWith(path.resolve(STATIC_DIR))) {
		res.writeHead(403, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Forbidden' }));
		return;
	}

	let stat: fs.Stats;
	let content: Buffer;
	try {
		stat = await fs.promises.stat(fullPath);
		content = await fs.promises.readFile(fullPath);
	} catch {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'File not found' }));
		return;
	}

	const etag = generateETag(content);
	const lastModified = stat.mtime;
	const contentType = getContentType(filePath);

	// Update cache registry
	cacheRegistry.set(filePath, {
		etag,
		lastModified,
		contentType,
		size: stat.size
	});

	// --- Conditional request: If-None-Match (ETag) ---
	const ifNoneMatch = req.headers['if-none-match'];
	if (ifNoneMatch && ifNoneMatch === etag) {
		res.writeHead(304, {
			ETag: etag,
			'Cache-Control': isPrivate ? 'private, no-store' : getCacheControl(filePath)
		});
		res.end();
		return;
	}

	// --- Conditional request: If-Modified-Since ---
	const ifModifiedSince = req.headers['if-modified-since'];
	if (ifModifiedSince) {
		const clientDate = new Date(ifModifiedSince);
		if (lastModified <= clientDate) {
			res.writeHead(304, {
				ETag: etag,
				'Last-Modified': lastModified.toUTCString(),
				'Cache-Control': isPrivate ? 'private, no-store' : getCacheControl(filePath)
			});
			res.end();
			return;
		}
	}

	// --- Full response ---
	const headers: Record<string, string> = {
		'Content-Type': contentType,
		'Content-Length': String(content.length),
		ETag: etag,
		'Last-Modified': lastModified.toUTCString(),
		'Cache-Control': isPrivate ? 'private, no-store' : getCacheControl(filePath),
		'Accept-Ranges': 'bytes',
		Vary: 'Accept-Encoding'
	};

	// Add CDN-specific headers
	if (!isPrivate) {
		headers['CDN-Cache-Control'] = getCacheControl(filePath);
		headers['Surrogate-Control'] = getCacheControl(filePath);
	}

	res.writeHead(200, headers);
	res.end(content);
}

// --- Cache purge handler ---
function handlePurge(req: http.IncomingMessage, res: http.ServerResponse, body: string): void {
	// Verify API key
	const apiKey = req.headers['x-purge-key'];
	if (apiKey !== PURGE_API_KEY) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

	let parsed: { paths?: string[] };
	try {
		parsed = JSON.parse(body);
	} catch {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid JSON body' }));
		return;
	}

	if (!Array.isArray(parsed.paths) || parsed.paths.length === 0) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'paths array is required' }));
		return;
	}

	const purged: string[] = [];
	for (const p of parsed.paths) {
		cacheRegistry.delete(p);
		purgedPaths.add(p);
		purged.push(p);
	}

	console.log(`[PURGE] Purged ${purged.length} paths: ${purged.join(', ')}`);

	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Surrogate-Control': 'no-store',
		'Cache-Control': 'no-store'
	});
	res.end(JSON.stringify({ purged, count: purged.length }));
}

// --- Signed URL generation endpoint ---
function handleGenerateSignedURL(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	body: string
): void {
	const apiKey = req.headers['x-api-key'];
	if (apiKey !== PURGE_API_KEY) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

	let parsed: { path?: string; ttl?: number };
	try {
		parsed = JSON.parse(body);
	} catch {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid JSON' }));
		return;
	}

	const filePath = parsed.path;
	const ttl = parsed.ttl || 3600; // Default 1 hour

	if (!filePath) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'path is required' }));
		return;
	}

	const signedURL = generateSignedURL(filePath, ttl);
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ url: signedURL, expiresIn: ttl }));
}

// --- Request body reader ---
function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > 1024 * 1024) {
				reject(new Error('Body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}

// --- Router ---
async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	try {
		// Serve private content via signed URL
		if (url.pathname === '/private' && method === 'GET') {
			const validated = validateSignedURL(url.searchParams);
			if (!validated) {
				res.writeHead(403, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid or expired signed URL' }));
				return;
			}
			await serveStaticFile(req, res, validated.filePath, true);
			return;
		}

		// Cache purge API
		if (url.pathname === '/api/purge' && method === 'POST') {
			const body = await readBody(req);
			handlePurge(req, res, body);
			return;
		}

		// Generate signed URL
		if (url.pathname === '/api/sign' && method === 'POST') {
			const body = await readBody(req);
			handleGenerateSignedURL(req, res, body);
			return;
		}

		// Cache registry status
		if (url.pathname === '/api/cache-status' && method === 'GET') {
			const entries = Object.fromEntries(cacheRegistry);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ cached: entries, count: cacheRegistry.size }));
			return;
		}

		// Serve static files from /assets/*
		if (url.pathname.startsWith('/assets/') && method === 'GET') {
			const filePath = url.pathname.slice(1); // Remove leading /
			await serveStaticFile(req, res, filePath, false);
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	} catch (err) {
		console.error(`[ERROR] ${method} ${url.pathname}:`, err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Internal server error' }));
	}
}

// --- Server with graceful shutdown ---
const server = http.createServer(router);

server.listen(PORT, () => {
	console.log(`CDN origin server listening on http://localhost:${PORT}`);
	console.log(`Serving static files from: ${path.resolve(STATIC_DIR)}`);
});

function shutdown(signal: string): void {
	console.log(`\n${signal} received. Shutting down...`);
	server.close(() => {
		console.log('Server closed.');
		process.exit(0);
	});
	setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// --- Configuration ---
var (
	staticDir     = envOrDefault("STATIC_DIR", "./public")
	signingSecret = envOrDefault("SIGNING_SECRET", "change-me-in-production")
	purgeAPIKey   = envOrDefault("PURGE_API_KEY", "purge-secret-key")
)

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// --- Types ---
type CacheEntry struct {
	ETag         string    `json:"etag"`
	LastModified time.Time `json:"lastModified"`
	ContentType  string    `json:"contentType"`
	Size         int64     `json:"size"`
}

type CacheRegistry struct {
	mu      sync.RWMutex
	entries map[string]CacheEntry
	purged  map[string]bool
}

func NewCacheRegistry() *CacheRegistry {
	return &CacheRegistry{
		entries: make(map[string]CacheEntry),
		purged:  make(map[string]bool),
	}
}

func (cr *CacheRegistry) Set(path string, entry CacheEntry) {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	cr.entries[path] = entry
}

func (cr *CacheRegistry) Delete(path string) {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	delete(cr.entries, path)
	cr.purged[path] = true
}

func (cr *CacheRegistry) Snapshot() map[string]CacheEntry {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	out := make(map[string]CacheEntry, len(cr.entries))
	for k, v := range cr.entries {
		out[k] = v
	}
	return out
}

var registry = NewCacheRegistry()

// --- MIME types ---
var mimeTypes = map[string]string{
	".html":  "text/html",
	".css":   "text/css",
	".js":    "application/javascript",
	".json":  "application/json",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".gif":   "image/gif",
	".svg":   "image/svg+xml",
	".woff2": "font/woff2",
	".mp4":   "video/mp4",
}

func getContentType(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if ct, ok := mimeTypes[ext]; ok {
		return ct
	}
	return "application/octet-stream"
}

// --- ETag from content hash ---
func generateETag(content []byte) string {
	h := sha256.Sum256(content)
	return fmt.Sprintf(`"%s"`, hex.EncodeToString(h[:16]))
}

// --- Cache-Control by file type ---
func getCacheControl(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))

	if strings.Contains(filePath, ".hash.") || strings.Contains(filePath, "/immutable/") {
		return "public, max-age=31536000, immutable"
	}
	if ext == ".html" {
		return "public, no-cache, must-revalidate"
	}
	switch ext {
	case ".png", ".jpg", ".gif", ".svg", ".woff2":
		return "public, max-age=2592000, stale-while-revalidate=86400"
	case ".css", ".js":
		return "public, max-age=604800, stale-while-revalidate=3600"
	}
	return "public, max-age=300, must-revalidate"
}

// --- Signed URL generation ---
func generateSignedURL(filePath string, ttlSeconds int) string {
	expiresAt := time.Now().Unix() + int64(ttlSeconds)
	payload := fmt.Sprintf("%s:%d", filePath, expiresAt)
	mac := hmac.New(sha256.New, []byte(signingSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("/private?file=%s&expires=%d&sig=%s", filePath, expiresAt, sig)
}

func validateSignedURL(r *http.Request) (string, bool) {
	filePath := r.URL.Query().Get("file")
	expiresStr := r.URL.Query().Get("expires")
	signature := r.URL.Query().Get("sig")

	if filePath == "" || expiresStr == "" || signature == "" {
		return "", false
	}

	expiresAt, err := strconv.ParseInt(expiresStr, 10, 64)
	if err != nil || time.Now().Unix() > expiresAt {
		return "", false
	}

	payload := fmt.Sprintf("%s:%d", filePath, expiresAt)
	mac := hmac.New(sha256.New, []byte(signingSecret))
	mac.Write([]byte(payload))
	expected := hex.EncodeToString(mac.Sum(nil))

	sigBytes, _ := hex.DecodeString(signature)
	expBytes, _ := hex.DecodeString(expected)
	if !hmac.Equal(sigBytes, expBytes) {
		return "", false
	}

	return filePath, true
}

// --- Serve static file with cache headers ---
func serveStaticFile(w http.ResponseWriter, r *http.Request, filePath string, private bool) {
	fullPath := filepath.Join(staticDir, filepath.Clean(filePath))
	absStatic, _ := filepath.Abs(staticDir)
	absFile, _ := filepath.Abs(fullPath)

	if !strings.HasPrefix(absFile, absStatic) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "File not found")
		return
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	etag := generateETag(content)
	lastModified := info.ModTime()
	contentType := getContentType(filePath)

	registry.Set(filePath, CacheEntry{
		ETag:         etag,
		LastModified: lastModified,
		ContentType:  contentType,
		Size:         info.Size(),
	})

	cacheControl := getCacheControl(filePath)
	if private {
		cacheControl = "private, no-store"
	}

	// Conditional: If-None-Match
	if inm := r.Header.Get("If-None-Match"); inm == etag {
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", cacheControl)
		w.WriteHeader(http.StatusNotModified)
		return
	}

	// Conditional: If-Modified-Since
	if ims := r.Header.Get("If-Modified-Since"); ims != "" {
		clientTime, err := http.ParseTime(ims)
		if err == nil && !lastModified.After(clientTime) {
			w.Header().Set("ETag", etag)
			w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
			w.Header().Set("Cache-Control", cacheControl)
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}

	// Full response
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(content)))
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Vary", "Accept-Encoding")

	if !private {
		w.Header().Set("CDN-Cache-Control", getCacheControl(filePath))
		w.Header().Set("Surrogate-Control", getCacheControl(filePath))
	}

	w.WriteHeader(http.StatusOK)
	w.Write(content)
}

// --- JSON helpers ---
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{"error": msg, "status": status})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// --- Handlers ---
func handlePurge(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Purge-Key") != purgeAPIKey {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Failed to read body")
		return
	}

	var input struct {
		Paths []string `json:"paths"`
	}
	if err := json.Unmarshal(body, &input); err != nil || len(input.Paths) == 0 {
		writeJSONError(w, http.StatusBadRequest, "paths array is required")
		return
	}

	for _, p := range input.Paths {
		registry.Delete(p)
	}

	log.Printf("[PURGE] Purged %d paths: %s", len(input.Paths), strings.Join(input.Paths, ", "))
	w.Header().Set("Surrogate-Control", "no-store")
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]interface{}{"purged": input.Paths, "count": len(input.Paths)})
}

func handleSign(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Api-Key") != purgeAPIKey {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Failed to read body")
		return
	}

	var input struct {
		Path string `json:"path"`
		TTL  int    `json:"ttl"`
	}
	if err := json.Unmarshal(body, &input); err != nil || input.Path == "" {
		writeJSONError(w, http.StatusBadRequest, "path is required")
		return
	}
	if input.TTL == 0 {
		input.TTL = 3600
	}

	url := generateSignedURL(input.Path, input.TTL)
	writeJSON(w, http.StatusOK, map[string]interface{}{"url": url, "expiresIn": input.TTL})
}

func handleCacheStatus(w http.ResponseWriter, _ *http.Request) {
	snap := registry.Snapshot()
	writeJSON(w, http.StatusOK, map[string]interface{}{"cached": snap, "count": len(snap)})
}

// --- Main ---
func main() {
	port := envOrDefault("PORT", "3000")

	mux := http.NewServeMux()

	mux.HandleFunc("/private", func(w http.ResponseWriter, r *http.Request) {
		filePath, ok := validateSignedURL(r)
		if !ok {
			writeJSONError(w, http.StatusForbidden, "Invalid or expired signed URL")
			return
		}
		serveStaticFile(w, r, filePath, true)
	})

	mux.HandleFunc("/api/purge", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		handlePurge(w, r)
	})

	mux.HandleFunc("/api/sign", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		handleSign(w, r)
	})

	mux.HandleFunc("/api/cache-status", func(w http.ResponseWriter, r *http.Request) {
		handleCacheStatus(w, r)
	})

	mux.HandleFunc("/assets/", func(w http.ResponseWriter, r *http.Request) {
		filePath := strings.TrimPrefix(r.URL.Path, "/")
		serveStaticFile(w, r, filePath, false)
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("CDN origin server listening on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Forced shutdown: %v", err)
	}
	log.Println("Server closed.")
}
```

</div>
</CodeTabs>

## এটাকে যা Production-Ready করে

- **Content-based ETag** -- file content-এর SHA-256 hash সঠিক cache invalidation নিশ্চিত করে
- **Conditional request** -- 304 response-এর জন্য If-None-Match এবং If-Modified-Since দুটোই সাপোর্ট করে
- **Tiered cache policy** -- HTML, asset এবং immutable file-এর জন্য আলাদা Cache-Control header
- **Signed URL** -- HMAC-ভিত্তিক, সময়-সীমিত access, constant-time comparison সহ private content-এর জন্য
- **Cache purge API** -- content বদলালে তাৎক্ষণিক invalidation-এর জন্য authenticated endpoint
- **Directory traversal protection** -- serve করার আগে file path resolve করে validate করে

<div class="takeaways">

### মূল কথা

- CDN user-দের কাছাকাছি edge location-এ content cache করে latency 10-100x কমায়
- সঠিক cache validation-এর জন্য শুধু timestamp নয়, content-based ETag (file hashing) ব্যবহার করুন
- প্রতিটি content type অনুযায়ী Cache-Control policy সেট করুন: hashed asset-এর জন্য immutable, HTML-এর জন্য no-cache
- Signed URL credential না দেখিয়েই private content-এ সময়-সীমিত access দেয়
- জরুরি content invalidation-এর জন্য সবসময় একটি cache purge ব্যবস্থা রাখুন
- Conditional request (304 Not Modified) cache expire হলেও bandwidth বাঁচায়

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Cloudflare** ঠিক এই cache header semantics ব্যবহার করে 300+ global edge location-এ web asset cache করে
- **Netflix** video content ISP-এ বসানো server থেকে দিতে একটি custom CDN (Open Connect) ব্যবহার করে
- **Akamai** CDN প্রযুক্তির পথিকৃৎ এবং edge caching দিয়ে সব web traffic-এর 30% সামলায়
- **Vercel** immutable cache header সহ Next.js static asset দিতে signed URL এবং edge caching ব্যবহার করে

</div>
