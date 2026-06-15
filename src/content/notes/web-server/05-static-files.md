---
title: "Static Files & MIME"
subtitle: "How a server turns a file path into bytes on the wire — content types, ETags, conditional requests, and the cache headers that keep every browser fast."
chapter: 5
level: "beginner"
readingTime: "12 min"
topics: ["static files", "mime", "etag", "cache control", "http"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What "static" means

A static file is one that lives on disk and is served as-is. No code runs to produce it. `index.html`, `style.css`, `app.js`, `logo.png` — all of these existed as files before the request arrived, and the server's only job is to send the file bytes back with a sensible `Content-Type`.

The opposite is **dynamic** content: HTML rendered from a template at request time, an API that returns JSON computed from a database query, anything where the body is built per request.

The interesting part: **most of what looks dynamic is actually static**. A JavaScript bundle, a CSS file, an image — once your build step has produced them, every user gets the same bytes. Serving them from a static file server is dramatically faster than going through your application.

<Callout type="info">

**Real-World Analogy**

Serving static files is like a vending machine — no cook is needed, the item is already packaged and waiting; the server just retrieves it and hands it over.

</Callout>

## The minimum static server

```go
package main

import (
    "log"
    "net/http"
)

func main() {
    fs := http.FileServer(http.Dir("./public"))
    http.Handle("/", fs)
    log.Println("listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Five lines. Now `./public/index.html` is at `http://localhost:8080/index.html`. Standard library does:

- Resolves the path safely (no directory traversal via `../../etc/passwd`).
- Sets `Content-Type` based on file extension.
- Honors `If-Modified-Since` and `If-None-Match` (returns 304 when the client has a fresh copy).
- Serves byte ranges (`Range: bytes=0-1023`).
- Writes correct `Content-Length` and `Last-Modified`.

This is genuinely a real static server, in five lines, with everything you need. nginx is faster and more configurable, but this works.

## MIME types — `Content-Type` is everything

When a browser receives a response, it decides what to do based on `Content-Type`:

- `text/html` — parse and render.
- `text/css` — apply as stylesheet.
- `application/javascript` — execute.
- `image/png` — display.
- `application/octet-stream` — offer download.

Get the type wrong, and the browser refuses to interpret the file or, worse, interprets it dangerously.

The list of types is long but predictable:

| Extension | MIME type |
|---|---|
| `.html`, `.htm` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js`, `.mjs` | `application/javascript; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.svg` | `image/svg+xml` |
| `.webp` | `image/webp` |
| `.woff2` | `font/woff2` |
| `.pdf` | `application/pdf` |
| `.txt` | `text/plain; charset=utf-8` |
| `.wasm` | `application/wasm` |

For text formats, always include `charset=utf-8`. Without it, the browser falls back to its locale guess, which used to break for non-ASCII content.

The standard library's `mime.TypeByExtension` is the canonical lookup in Go; nginx ships `/etc/nginx/mime.types`; every framework has its own variant.

## Range requests — partial downloads

```text
GET /movie.mp4 HTTP/1.1
Range: bytes=1024000-2048000
```

```text
HTTP/1.1 206 Partial Content
Content-Range: bytes 1024000-2048000/52428800
Content-Length: 1024001
Content-Type: video/mp4
```

The client asks for a byte range; the server returns just those bytes with status `206`. Used for video seeking, resumable downloads, and large-file fetches over flaky networks. `http.FileServer` and nginx both implement it correctly — you should never need to write the byte-range logic yourself.

## ETags and Last-Modified — conditional requests

A second request for the same file should not transfer the bytes again. HTTP has two mechanisms for "have you changed?":

**1. Last-Modified.** The server sends a timestamp. The browser caches the file with that timestamp. Next request, the browser sends:

```text
If-Modified-Since: Mon, 04 May 2026 10:42:00 GMT
```

If the file's mtime has not changed, the server replies:

```text
HTTP/1.1 304 Not Modified
```

Empty body. No bytes wasted.

**2. ETag.** The server generates a fingerprint (hash, version, mtime+size — anything that changes when the content changes) and sends it:

```text
ETag: "abc123-1234"
```

The browser caches the file with that ETag. Next request:

```text
If-None-Match: "abc123-1234"
```

Server compares; if the ETag still matches, returns `304 Not Modified`.

ETags are stronger than Last-Modified because they are insensitive to clock skew and detect content changes regardless of mtime. nginx's default ETag is `<hex-mtime>-<hex-size>` for static files, which is fine. Application-generated content should hash the content.

## Cache-Control — telling the browser how aggressively to cache

`Last-Modified` and `ETag` save bytes by allowing 304 responses, but the browser still makes a network round-trip to check. **`Cache-Control`** lets the browser skip the round-trip entirely.

```text
Cache-Control: public, max-age=31536000, immutable
```

This says: "Cache this for one year. Do not even ask me — just use the cached copy."

**The pattern**: serve fingerprinted assets (URLs that include a content hash) with a long max-age, and the HTML that references them with `no-cache`.

```text
GET /assets/app.7f3a2b9.js
Cache-Control: public, max-age=31536000, immutable
```

```text
GET /index.html
Cache-Control: no-cache
```

When you deploy a new version of `app.js`, it gets a new hash (`/assets/app.9c1e4d2.js`), the HTML changes to reference the new URL, and the browser fetches it fresh. The old `app.7f3a2b9.js` can stay cached forever — it will never be requested again.

**Cache-Control directives worth knowing:**

| Directive | Meaning |
|---|---|
| `public` | Any cache (browser, CDN, proxy) may cache. |
| `private` | Only the user's browser may cache (no shared caches). |
| `no-cache` | Cache, but revalidate every request before using. |
| `no-store` | Do not cache anywhere. |
| `max-age=N` | Cached copy is fresh for N seconds. |
| `immutable` | Will not change for the lifetime of `max-age`. Browser skips conditional requests. |
| `s-maxage=N` | Like `max-age` but only applies to *shared* caches (CDNs). |
| `stale-while-revalidate=N` | Serve stale up to N seconds while fetching a fresh copy. |

## Compression — gzip and brotli

Text content compresses dramatically. A 100KB JavaScript bundle becomes ~30KB gzipped, ~25KB with brotli. Saving 70% on every page load is enormous.

The client says what it accepts:

```text
Accept-Encoding: gzip, br, deflate
```

The server picks one and responds:

```text
Content-Encoding: br
```

Best practice: precompress static assets at build time, and configure the server to serve the `.gz` or `.br` file when the client supports it. nginx's `gzip_static on` and `brotli_static on` do exactly this — no per-request CPU cost.

Some content does not compress (already-compressed images, video, PDFs). Setting `Content-Encoding` on these is wasted CPU. Skip them.

## Path traversal — the one thing you must get right

```text
GET /../../etc/passwd HTTP/1.1
```

A naive static server might join the request path to the document root and serve any file the process can read. With your binary running as `nginx` or `myapp`, that includes a lot of files.

Defenses:

- **Resolve the path** (`filepath.Clean` in Go, `path.normalize` in Node).
- **Verify it is still under the document root** after resolution.
- **Refuse paths** containing `..`, null bytes, or non-ASCII control characters.
- **Use the standard library's file server**, which already does the above.

The vulnerable code is the kind that does:

```go
http.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
    filename := r.URL.Path[len("/files/"):]
    http.ServeFile(w, r, "/var/www/files/"+filename) // BAD
})
```

`filename` could be `../../etc/passwd`. The fix: `filepath.Join` and verify:

```go
root := "/var/www/files"
clean := filepath.Clean(filepath.Join(root, filename))
if !strings.HasPrefix(clean, root) {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}
http.ServeFile(w, r, clean)
```

Or use `http.FileServer(http.Dir(...))`, which handles this correctly.

## Why nginx is unbeatable for static files

nginx uses `sendfile()` — a Linux syscall that ships file bytes directly from the page cache to the socket without copying through userspace. Combined with `tcp_nopush` and `tcp_nodelay`, the server can push hundreds of MB/s of static content with almost zero CPU.

```nginx
location / {
    root /var/www/site;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    expires 1d;
}
```

Add `gzip_static on;` and `brotli_static on;` and pre-built `.gz` / `.br` versions are served automatically when the client supports them. Add `etag on;` and `if_modified_since exact;` and 304 responses just work.

For static workloads, nothing else comes close. Go and Node can do it, but they will use 10x the CPU.

## A practical static-asset strategy

Your build step produces a `dist/` directory:

```text
dist/
├── index.html
├── assets/
│   ├── app.7f3a2b9.js
│   ├── app.7f3a2b9.css
│   ├── logo.png
│   └── hero.webp
├── favicon.ico
└── robots.txt
```

Serve with nginx (chapter 6 covers config in detail), with these rules:

- **`/assets/*`** — `Cache-Control: public, max-age=31536000, immutable`. Hashed in filename, never reused.
- **`*.html`** — `Cache-Control: no-cache`. Always revalidate; the HTML may point at new asset URLs.
- **All static files** — `gzip_static on`, `brotli_static on`, `etag on`.

The browser ends up making one HTML request per navigation (which often returns 304) and zero asset requests after the first visit. Page loads feel instant.

## Recap

- A static file server: read file → set `Content-Type` → send bytes. Five lines is enough.
- MIME type drives browser behavior. Always set it; include `charset=utf-8` for text.
- ETag and Last-Modified enable 304 Not Modified; Cache-Control enables skipping the request entirely.
- Fingerprint asset URLs and serve with `immutable, max-age=1y`. Serve HTML with `no-cache`.
- Precompress with gzip/brotli at build time. Serve compressed via `gzip_static`.
- Path traversal is the static-file vulnerability. Use the standard library; do not join paths by hand.
- nginx with `sendfile` is the gold standard for static workloads.

Next chapter: nginx fundamentals — the config file that ties all of this together.

