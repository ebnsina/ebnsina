---
title: "CDN & Edge Caching"
subtitle: "Implement edge caching with cache headers, signed URLs for private content, and cache purging strategies."
chapter: 15
level: "intermediate"
readingTime: "15 min"
topics: ["CDN", "edge caching", "Cache-Control", "signed URLs", "cache purging"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What is CDN & Edge Caching?

A **Content Delivery Network (CDN)** is a globally distributed network of servers that caches content close to end users. Instead of every request traveling to your origin server, the CDN edge node closest to the user serves the cached response -- reducing latency from hundreds of milliseconds to single digits.

Think of it like a chain of local libraries. The main library (origin server) has every book, but it's across town. Your neighborhood branch (edge node) stocks copies of the most popular books. When you want a bestseller, you grab it from your local branch instantly. Only rare requests need to go to the main library.

<Mermaid
	title="CDN Edge Caching Architecture"
	code={`
graph LR
  C["Client<br/>Browser / App"] --> E["CDN Edge<br/>Cache Layer"] --> O["Origin Server<br/>Cache Headers"] --> S["Storage<br/>Files / Objects"]
`}
/>

## Real-World Analogy

<Callout type="info">

**Real-World Analogy**

Like a franchise with warehouses in every major city — instead of shipping everything from one central warehouse, local warehouses serve nearby customers faster.

</Callout>

When Netflix serves a new season of a show, the video files are pushed from their origin storage to CDN edge nodes around the world. A viewer in Tokyo gets the stream from a nearby edge server in Japan, not from a data center in Virginia. If the edge doesn't have the file cached, it pulls it from the origin once, then serves all subsequent Tokyo requests locally. Cloudflare does the same for web assets -- your CSS and JavaScript are cached at 300+ edge locations worldwide.

## Building a CDN Origin Server

Here's a complete origin server that implements proper cache headers, conditional requests with ETags, signed URLs for private content, and a cache purge API. This is the server-side logic that powers CDN caching behavior.

<CodeTabs tsFile="cdn-origin.ts" goFile="cdn-origin.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3000", 10);
const STATIC_DIR = process.env.STATIC_DIR || "./public";
const SIGNING_SECRET = process.env.SIGNING_SECRET || "change-me-in-production";
const PURGE_API_KEY = process.env.PURGE_API_KEY || "purge-secret-key";

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
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// --- ETag generation using file content hash ---
function generateETag(content: Buffer): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `"${hash.substring(0, 32)}"`;
}

// --- Cache-Control header based on file type ---
function getCacheControl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  // Immutable assets (hashed filenames) -- cache for 1 year
  if (filePath.includes(".hash.") || filePath.includes("/immutable/")) {
    return "public, max-age=31536000, immutable";
  }
  // HTML -- always revalidate
  if (ext === ".html") {
    return "public, no-cache, must-revalidate";
  }
  // Images and fonts -- cache 30 days with stale-while-revalidate
  if ([".png", ".jpg", ".gif", ".svg", ".woff2"].includes(ext)) {
    return "public, max-age=2592000, stale-while-revalidate=86400";
  }
  // CSS/JS -- cache 7 days
  if ([".css", ".js"].includes(ext)) {
    return "public, max-age=604800, stale-while-revalidate=3600";
  }
  // Default -- short cache with revalidation
  return "public, max-age=300, must-revalidate";
}

// --- Signed URL generation and validation ---
function generateSignedURL(filePath: string, ttlSeconds: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${filePath}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(payload)
    .digest("hex");

  const params = new URLSearchParams({
    file: filePath,
    expires: String(expiresAt),
    sig: signature,
  });
  return `/private?${params.toString()}`;
}

function validateSignedURL(params: URLSearchParams): SignedURLParams | null {
  const filePath = params.get("file");
  const expiresStr = params.get("expires");
  const signature = params.get("sig");

  if (!filePath || !expiresStr || !signature) return null;

  const expiresAt = parseInt(expiresStr, 10);
  if (isNaN(expiresAt)) return null;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) return null;

  // Verify HMAC signature
  const payload = `${filePath}:${expiresAt}`;
  const expected = crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(payload)
    .digest("hex");

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
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  let stat: fs.Stats;
  let content: Buffer;
  try {
    stat = await fs.promises.stat(fullPath);
    content = await fs.promises.readFile(fullPath);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "File not found" }));
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
    size: stat.size,
  });

  // --- Conditional request: If-None-Match (ETag) ---
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.writeHead(304, {
      ETag: etag,
      "Cache-Control": isPrivate ? "private, no-store" : getCacheControl(filePath),
    });
    res.end();
    return;
  }

  // --- Conditional request: If-Modified-Since ---
  const ifModifiedSince = req.headers["if-modified-since"];
  if (ifModifiedSince) {
    const clientDate = new Date(ifModifiedSince);
    if (lastModified <= clientDate) {
      res.writeHead(304, {
        ETag: etag,
        "Last-Modified": lastModified.toUTCString(),
        "Cache-Control": isPrivate ? "private, no-store" : getCacheControl(filePath),
      });
      res.end();
      return;
    }
  }

  // --- Full response ---
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(content.length),
    ETag: etag,
    "Last-Modified": lastModified.toUTCString(),
    "Cache-Control": isPrivate ? "private, no-store" : getCacheControl(filePath),
    "Accept-Ranges": "bytes",
    Vary: "Accept-Encoding",
  };

  // Add CDN-specific headers
  if (!isPrivate) {
    headers["CDN-Cache-Control"] = getCacheControl(filePath);
    headers["Surrogate-Control"] = getCacheControl(filePath);
  }

  res.writeHead(200, headers);
  res.end(content);
}

// --- Cache purge handler ---
function handlePurge(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
): void {
  // Verify API key
  const apiKey = req.headers["x-purge-key"];
  if (apiKey !== PURGE_API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let parsed: { paths?: string[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  if (!Array.isArray(parsed.paths) || parsed.paths.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "paths array is required" }));
    return;
  }

  const purged: string[] = [];
  for (const p of parsed.paths) {
    cacheRegistry.delete(p);
    purgedPaths.add(p);
    purged.push(p);
  }

  console.log(`[PURGE] Purged ${purged.length} paths: ${purged.join(", ")}`);

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Surrogate-Control": "no-store",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ purged, count: purged.length }));
}

// --- Signed URL generation endpoint ---
function handleGenerateSignedURL(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
): void {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== PURGE_API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let parsed: { path?: string; ttl?: number };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const filePath = parsed.path;
  const ttl = parsed.ttl || 3600; // Default 1 hour

  if (!filePath) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "path is required" }));
    return;
  }

  const signedURL = generateSignedURL(filePath, ttl);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ url: signedURL, expiresIn: ttl }));
}

// --- Request body reader ---
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// --- Router ---
async function router(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method || "GET";

  try {
    // Serve private content via signed URL
    if (url.pathname === "/private" && method === "GET") {
      const validated = validateSignedURL(url.searchParams);
      if (!validated) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or expired signed URL" }));
        return;
      }
      await serveStaticFile(req, res, validated.filePath, true);
      return;
    }

    // Cache purge API
    if (url.pathname === "/api/purge" && method === "POST") {
      const body = await readBody(req);
      handlePurge(req, res, body);
      return;
    }

    // Generate signed URL
    if (url.pathname === "/api/sign" && method === "POST") {
      const body = await readBody(req);
      handleGenerateSignedURL(req, res, body);
      return;
    }

    // Cache registry status
    if (url.pathname === "/api/cache-status" && method === "GET") {
      const entries = Object.fromEntries(cacheRegistry);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cached: entries, count: cacheRegistry.size }));
      return;
    }

    // Serve static files from /assets/*
    if (url.pathname.startsWith("/assets/") && method === "GET") {
      const filePath = url.pathname.slice(1); // Remove leading /
      await serveStaticFile(req, res, filePath, false);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error(`[ERROR] ${method} ${url.pathname}:`, err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
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
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
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

## What Makes This Production-Ready

- **Content-based ETags** -- SHA-256 hash of file contents ensures accurate cache invalidation
- **Conditional requests** -- supports both If-None-Match and If-Modified-Since for 304 responses
- **Tiered cache policies** -- different Cache-Control headers for HTML, assets, and immutable files
- **Signed URLs** -- HMAC-based, time-limited access to private content with constant-time comparison
- **Cache purge API** -- authenticated endpoint for instant invalidation when content changes
- **Directory traversal protection** -- resolves and validates file paths before serving

<div class="takeaways">

### Key Takeaways

- CDNs cache content at edge locations close to users, reducing latency by 10-100x
- Use content-based ETags (file hashing) for accurate cache validation, not timestamps alone
- Set Cache-Control policies per content type: immutable for hashed assets, no-cache for HTML
- Signed URLs provide time-limited access to private content without exposing credentials
- Always implement a cache purge mechanism for emergency content invalidation
- Conditional requests (304 Not Modified) save bandwidth even when caches expire

</div>

<div class="when-to-use">

### Real-World Usage

- **Cloudflare** caches web assets at 300+ global edge locations using these exact cache header semantics
- **Netflix** uses a custom CDN (Open Connect) to serve video content from ISP-embedded servers
- **Akamai** pioneered CDN technology and handles 30% of all web traffic with edge caching
- **Vercel** uses signed URLs and edge caching to serve Next.js static assets with immutable cache headers

</div>

