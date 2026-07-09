---
title: 'Case Study: URL Shortener'
subtitle: 'শূন্য থেকে একটা সম্পূর্ণ URL shortener বানান — যা শিখেছেন সব প্রয়োগ করে: HTTP, database, caching, testing, আর deployment।'
chapter: 25
level: 'advanced'
readingTime: '25 মিনিট'
topics: ['project', 'URL shortener', 'full-stack', 'Redis', 'PostgreSQL', 'end-to-end']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## আমরা কী বানাচ্ছি

bit.ly-এর মতো একটা production-grade URL shortener। User একটা লম্বা URL জমা দেয়, একটা short code পায়, আর visitor-দের redirect করা হয়।

**Feature:**

- Short URL তৈরি (POST /api/shorten)
- মূল URL-এ redirect (GET /:code)
- Click analytics (GET /api/stats/:code)
- Rate limiting
- দ্রুত redirect-এর জন্য Redis caching

<Callout type="info">

**বাস্তব উদাহরণ**

একটা URL shortener হলো একটা coat check-এর মতো। আপনি আপনার কোট (লম্বা URL) জমা দেন, একটা নম্বর দেওয়া টিকিট (short code) পান। কেউ যখন টিকিটটা দেখায়, অ্যাটেনড্যান্ট আপনার কোট খুঁজে ফেরত দেয় (redirect)। অ্যাটেনড্যান্ট গুনে রাখে প্রতিটা টিকিট কতবার দেখানো হয়েছে (analytics)।

</Callout>

## Project Structure

```
urlshort/
├── cmd/server/main.go
├── internal/
│   ├── handler/
│   │   ├── shorten.go
│   │   ├── redirect.go
│   │   └── stats.go
│   ├── service/
│   │   └── url.go
│   ├── repository/
│   │   └── url.go
│   ├── model/
│   │   └── url.go
│   └── shortcode/
│       └── generator.go
├── migrations/
│   ├── 001_create_urls.up.sql
│   └── 001_create_urls.down.sql
├── go.mod
└── Dockerfile
```

## Database Schema

```sql
-- migrations/001_create_urls.up.sql
CREATE TABLE urls (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(10) UNIQUE NOT NULL,
    original    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    clicks      INTEGER DEFAULT 0
);

CREATE INDEX idx_urls_code ON urls(code);
CREATE INDEX idx_urls_expires ON urls(expires_at) WHERE expires_at IS NOT NULL;
```

## Domain Model

```go
// internal/model/url.go
package model

import "time"

type URL struct {
    ID        int        `json:"id"`
    Code      string     `json:"code"`
    Original  string     `json:"original_url"`
    CreatedAt time.Time  `json:"created_at"`
    ExpiresAt *time.Time `json:"expires_at,omitempty"`
    Clicks    int        `json:"clicks"`
}

type ShortenInput struct {
    URL       string `json:"url"`
    ExpiresIn string `json:"expires_in,omitempty"`  // "24h", "7d", etc.
}

type ShortenResponse struct {
    ShortURL    string `json:"short_url"`
    OriginalURL string `json:"original_url"`
    Code        string `json:"code"`
    ExpiresAt   string `json:"expires_at,omitempty"`
}

type StatsResponse struct {
    Code        string    `json:"code"`
    OriginalURL string    `json:"original_url"`
    Clicks      int       `json:"clicks"`
    CreatedAt   time.Time `json:"created_at"`
}
```

## Short Code Generator

```go
// internal/shortcode/generator.go
package shortcode

import (
    "crypto/rand"
    "math/big"
)

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func Generate(length int) (string, error) {
    code := make([]byte, length)
    for i := range code {
        n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
        if err != nil {
            return "", err
        }
        code[i] = charset[n.Int64()]
    }
    return string(code), nil
}
```

## Repository Layer

```go
// internal/repository/url.go
package repository

import (
    "context"
    "database/sql"
    "fmt"

    "github.com/yourname/urlshort/internal/model"
)

type URLRepository struct {
    db *sql.DB
}

func NewURLRepository(db *sql.DB) *URLRepository {
    return &URLRepository{db: db}
}

func (r *URLRepository) Create(ctx context.Context, url *model.URL) error {
    return r.db.QueryRowContext(ctx,
        `INSERT INTO urls (code, original, expires_at) VALUES ($1, $2, $3) RETURNING id, created_at`,
        url.Code, url.Original, url.ExpiresAt,
    ).Scan(&url.ID, &url.CreatedAt)
}

func (r *URLRepository) GetByCode(ctx context.Context, code string) (*model.URL, error) {
    var url model.URL
    err := r.db.QueryRowContext(ctx,
        `SELECT id, code, original, created_at, expires_at, clicks
         FROM urls WHERE code = $1`, code,
    ).Scan(&url.ID, &url.Code, &url.Original, &url.CreatedAt, &url.ExpiresAt, &url.Clicks)

    if err == sql.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("querying url by code %s: %w", code, err)
    }
    return &url, nil
}

func (r *URLRepository) IncrementClicks(ctx context.Context, code string) error {
    _, err := r.db.ExecContext(ctx,
        `UPDATE urls SET clicks = clicks + 1 WHERE code = $1`, code,
    )
    return err
}

func (r *URLRepository) CodeExists(ctx context.Context, code string) (bool, error) {
    var exists bool
    err := r.db.QueryRowContext(ctx,
        `SELECT EXISTS(SELECT 1 FROM urls WHERE code = $1)`, code,
    ).Scan(&exists)
    return exists, err
}
```

## Service Layer

```go
// internal/service/url.go
package service

import (
    "context"
    "fmt"
    "net/url"
    "time"

    "github.com/redis/go-redis/v9"
    "github.com/yourname/urlshort/internal/model"
    "github.com/yourname/urlshort/internal/shortcode"
)

type URLRepository interface {
    Create(ctx context.Context, url *model.URL) error
    GetByCode(ctx context.Context, code string) (*model.URL, error)
    IncrementClicks(ctx context.Context, code string) error
    CodeExists(ctx context.Context, code string) (bool, error)
}

type URLService struct {
    repo     URLRepository
    cache    *redis.Client
    baseURL  string
    codeLen  int
}

func NewURLService(repo URLRepository, cache *redis.Client, baseURL string) *URLService {
    return &URLService{
        repo:    repo,
        cache:   cache,
        baseURL: baseURL,
        codeLen: 7,
    }
}

func (s *URLService) Shorten(ctx context.Context, input model.ShortenInput) (*model.ShortenResponse, error) {
    // Validate URL
    if _, err := url.ParseRequestURI(input.URL); err != nil {
        return nil, fmt.Errorf("invalid URL: %w", err)
    }

    // Parse expiration
    var expiresAt *time.Time
    if input.ExpiresIn != "" {
        d, err := time.ParseDuration(input.ExpiresIn)
        if err != nil {
            return nil, fmt.Errorf("invalid expiration: %w", err)
        }
        t := time.Now().Add(d)
        expiresAt = &t
    }

    // Generate unique code (retry on collision)
    var code string
    for attempts := 0; attempts < 5; attempts++ {
        var err error
        code, err = shortcode.Generate(s.codeLen)
        if err != nil {
            return nil, fmt.Errorf("generating code: %w", err)
        }

        exists, err := s.repo.CodeExists(ctx, code)
        if err != nil {
            return nil, fmt.Errorf("checking code: %w", err)
        }
        if !exists {
            break
        }
        if attempts == 4 {
            return nil, fmt.Errorf("failed to generate unique code after 5 attempts")
        }
    }

    // Save to database
    urlRecord := &model.URL{
        Code:      code,
        Original:  input.URL,
        ExpiresAt: expiresAt,
    }
    if err := s.repo.Create(ctx, urlRecord); err != nil {
        return nil, fmt.Errorf("saving URL: %w", err)
    }

    // Cache for fast redirects
    cacheTTL := 24 * time.Hour
    if expiresAt != nil {
        cacheTTL = time.Until(*expiresAt)
    }
    s.cache.Set(ctx, "url:"+code, input.URL, cacheTTL)

    resp := &model.ShortenResponse{
        ShortURL:    fmt.Sprintf("%s/%s", s.baseURL, code),
        OriginalURL: input.URL,
        Code:        code,
    }
    if expiresAt != nil {
        resp.ExpiresAt = expiresAt.Format(time.RFC3339)
    }

    return resp, nil
}

func (s *URLService) Resolve(ctx context.Context, code string) (string, error) {
    // Check cache first
    cached, err := s.cache.Get(ctx, "url:"+code).Result()
    if err == nil {
        // Increment clicks asynchronously
        go s.repo.IncrementClicks(context.Background(), code)
        return cached, nil
    }

    // Cache miss — check database
    urlRecord, err := s.repo.GetByCode(ctx, code)
    if err != nil {
        return "", fmt.Errorf("resolving code: %w", err)
    }
    if urlRecord == nil {
        return "", ErrNotFound
    }

    // Check expiration
    if urlRecord.ExpiresAt != nil && time.Now().After(*urlRecord.ExpiresAt) {
        return "", ErrExpired
    }

    // Re-cache and increment
    s.cache.Set(ctx, "url:"+code, urlRecord.Original, 24*time.Hour)
    go s.repo.IncrementClicks(context.Background(), code)

    return urlRecord.Original, nil
}

func (s *URLService) GetStats(ctx context.Context, code string) (*model.StatsResponse, error) {
    urlRecord, err := s.repo.GetByCode(ctx, code)
    if err != nil {
        return nil, err
    }
    if urlRecord == nil {
        return nil, ErrNotFound
    }

    return &model.StatsResponse{
        Code:        urlRecord.Code,
        OriginalURL: urlRecord.Original,
        Clicks:      urlRecord.Clicks,
        CreatedAt:   urlRecord.CreatedAt,
    }, nil
}
```

## HTTP Handler

```go
// internal/handler/shorten.go
func (h *Handler) Shorten(w http.ResponseWriter, r *http.Request) {
    var input model.ShortenInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        respondError(w, http.StatusBadRequest, "invalid JSON")
        return
    }

    if input.URL == "" {
        respondError(w, http.StatusBadRequest, "url is required")
        return
    }

    result, err := h.service.Shorten(r.Context(), input)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusCreated, result)
}

// internal/handler/redirect.go
func (h *Handler) Redirect(w http.ResponseWriter, r *http.Request) {
    code := r.PathValue("code")

    originalURL, err := h.service.Resolve(r.Context(), code)
    if errors.Is(err, service.ErrNotFound) || errors.Is(err, service.ErrExpired) {
        http.NotFound(w, r)
        return
    }
    if err != nil {
        respondError(w, http.StatusInternalServerError, "redirect failed")
        return
    }

    http.Redirect(w, r, originalURL, http.StatusMovedPermanently)
}

// internal/handler/stats.go
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
    code := r.PathValue("code")

    stats, err := h.service.GetStats(r.Context(), code)
    if errors.Is(err, service.ErrNotFound) {
        respondError(w, http.StatusNotFound, "URL not found")
        return
    }
    if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to get stats")
        return
    }

    respondJSON(w, http.StatusOK, stats)
}
```

## সব একসাথে Wire করা

```go
// cmd/server/main.go
func main() {
    // Config
    port := getEnv("PORT", "8080")
    dbURL := getEnv("DATABASE_URL", "postgres://localhost/urlshort?sslmode=disable")
    redisURL := getEnv("REDIS_URL", "localhost:6379")
    baseURL := getEnv("BASE_URL", "http://localhost:8080")

    // Database
    db, err := sql.Open("postgres", dbURL)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
    db.SetMaxOpenConns(25)

    // Redis
    rdb := redis.NewClient(&redis.Options{Addr: redisURL})
    defer rdb.Close()

    // Wire dependencies
    repo := repository.NewURLRepository(db)
    service := service.NewURLService(repo, rdb, baseURL)
    handler := handler.NewHandler(service)

    // Routes
    mux := http.NewServeMux()
    mux.HandleFunc("POST /api/shorten", handler.Shorten)
    mux.HandleFunc("GET /api/stats/{code}", handler.Stats)
    mux.HandleFunc("GET /{code}", handler.Redirect)

    // Middleware
    finalHandler := Chain(mux,
        Logger(slog.Default()),
        Recovery(),
        RateLimit(100),
    )

    // Start with graceful shutdown
    server := &http.Server{
        Addr:         ":" + port,
        Handler:      finalHandler,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
    }

    go func() {
        slog.Info("server starting", "port", port, "base_url", baseURL)
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    server.Shutdown(ctx)
    slog.Info("server stopped")
}
```

## Service-টা Test করা

```go
func TestURLService_Shorten(t *testing.T) {
    repo := newMockRepo()
    cache := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
    svc := service.NewURLService(repo, cache, "http://localhost:8080")

    tests := []struct {
        name    string
        input   model.ShortenInput
        wantErr bool
    }{
        {
            name:  "valid URL",
            input: model.ShortenInput{URL: "https://example.com/very/long/path"},
        },
        {
            name:    "empty URL",
            input:   model.ShortenInput{URL: ""},
            wantErr: true,
        },
        {
            name:    "invalid URL",
            input:   model.ShortenInput{URL: "not-a-url"},
            wantErr: true,
        },
        {
            name:  "with expiration",
            input: model.ShortenInput{URL: "https://example.com", ExpiresIn: "24h"},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := svc.Shorten(context.Background(), tt.input)
            if tt.wantErr {
                if err == nil {
                    t.Error("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if result.Code == "" {
                t.Error("expected non-empty code")
            }
            if result.OriginalURL != tt.input.URL {
                t.Errorf("original URL = %q, want %q", result.OriginalURL, tt.input.URL)
            }
        })
    }
}
```

## চালিয়ে দেখুন

```bash
# Shorten a URL
curl -X POST http://localhost:8080/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/very/long/path/to/page"}'
# {"short_url":"http://localhost:8080/aB3xK9m","original_url":"...","code":"aB3xK9m"}

# Redirect
curl -L http://localhost:8080/aB3xK9m
# → redirects to https://example.com/very/long/path/to/page

# Check stats
curl http://localhost:8080/api/stats/aB3xK9m
# {"code":"aB3xK9m","original_url":"...","clicks":1,"created_at":"..."}
```

## মূল কথা

1. **Clean architecture** — handler → service → repository, প্রতিটা layer-এর একটা কাজ
2. **Cache-first read** — O(1) redirect-এর জন্য Redis, source of truth হিসেবে database
3. **Async click tracking** — `go repo.IncrementClicks()` redirect-কে block করে না
4. **Collision handling** — duplicate হলে code generation 5 বার পর্যন্ত retry
5. **Graceful shutdown** — থামার আগে in-flight redirect শেষ করে
6. **এই project কোর্সের প্রতিটা concept ব্যবহার করে** — struct, interface, goroutine, context, error handling, testing, middleware, database pattern, আর deployment
