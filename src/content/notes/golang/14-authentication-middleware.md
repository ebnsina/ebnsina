---
title: "Authentication & Middleware"
subtitle: "JWT authentication, middleware chains, CORS, rate limiting — the security and cross-cutting concerns every API needs."
chapter: 14
level: "intermediate"
readingTime: "20 min"
topics: ["authentication", "JWT", "middleware", "CORS", "rate limiting", "security"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Middleware Pattern

Middleware wraps HTTP handlers to add behavior before and after request processing. It's Go's way of handling cross-cutting concerns without cluttering business logic.

```go
// A middleware is a function that takes a handler and returns a new handler
type Middleware func(http.Handler) http.Handler

// Logging middleware — logs every request
func Logger(logger *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()

            // Wrap ResponseWriter to capture status code
            wrapped := &statusWriter{ResponseWriter: w, status: 200}
            next.ServeHTTP(wrapped, r)

            logger.Info("request completed",
                "method", r.Method,
                "path", r.URL.Path,
                "status", wrapped.status,
                "duration_ms", time.Since(start).Milliseconds(),
                "ip", r.RemoteAddr,
            )
        })
    }
}

type statusWriter struct {
    http.ResponseWriter
    status int
}

func (w *statusWriter) WriteHeader(status int) {
    w.status = status
    w.ResponseWriter.WriteHeader(status)
}
```

<Callout type="info">

**Real-World Analogy**

Middleware is like security checkpoints at an airport. Before you reach your gate (handler), you pass through ID check (auth), baggage scan (validation), and metal detector (rate limiting). Each checkpoint is independent — you can add or remove them without changing the gate itself.

</Callout>

## Chaining Middleware

```go
func Chain(handler http.Handler, middlewares ...Middleware) http.Handler {
    // Apply in reverse so the first middleware runs first
    for i := len(middlewares) - 1; i >= 0; i-- {
        handler = middlewares[i](handler)
    }
    return handler
}

// Usage
mux := http.NewServeMux()
mux.HandleFunc("GET /api/books", bookHandler.List)
mux.HandleFunc("POST /api/books", bookHandler.Create)

finalHandler := Chain(mux,
    Logger(logger),       // Runs first: log every request
    Recovery(),           // Runs second: catch panics
    CORS(corsConfig),     // Runs third: add CORS headers
    RateLimit(100),       // Runs fourth: limit requests
)

http.ListenAndServe(":8080", finalHandler)
```

## Panic Recovery

Prevents a single panicking handler from crashing the entire server:

```go
func Recovery() Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if err := recover(); err != nil {
                    slog.Error("panic recovered",
                        "error", err,
                        "path", r.URL.Path,
                        "stack", string(debug.Stack()),
                    )
                    http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
                }
            }()
            next.ServeHTTP(w, r)
        })
    }
}
```

## JWT Authentication

JSON Web Tokens are the industry standard for stateless API authentication:

```go
import "github.com/golang-jwt/jwt/v5"

type Claims struct {
    UserID int    `json:"user_id"`
    Email  string `json:"email"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

type AuthService struct {
    secretKey []byte
    issuer    string
}

func NewAuthService(secret, issuer string) *AuthService {
    return &AuthService{
        secretKey: []byte(secret),
        issuer:    issuer,
    }
}

// Generate a JWT token
func (s *AuthService) GenerateToken(userID int, email, role string) (string, error) {
    claims := Claims{
        UserID: userID,
        Email:  email,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            Issuer:    s.issuer,
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.secretKey)
}

// Validate a JWT token
func (s *AuthService) ValidateToken(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return s.secretKey, nil
    })
    if err != nil {
        return nil, fmt.Errorf("invalid token: %w", err)
    }

    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token claims")
    }

    return claims, nil
}
```

## Auth Middleware

```go
type contextKey string

const UserContextKey contextKey = "user"

func Auth(authService *AuthService) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Extract token from Authorization header
            authHeader := r.Header.Get("Authorization")
            if authHeader == "" {
                http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
                return
            }

            // Expect "Bearer <token>"
            parts := strings.SplitN(authHeader, " ", 2)
            if len(parts) != 2 || parts[0] != "Bearer" {
                http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
                return
            }

            // Validate token
            claims, err := authService.ValidateToken(parts[1])
            if err != nil {
                http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
                return
            }

            // Add user info to request context
            ctx := context.WithValue(r.Context(), UserContextKey, claims)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

// Extract user from context in handlers
func GetUser(ctx context.Context) *Claims {
    claims, ok := ctx.Value(UserContextKey).(*Claims)
    if !ok {
        return nil
    }
    return claims
}

// Role-based authorization
func RequireRole(roles ...string) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            user := GetUser(r.Context())
            if user == nil {
                http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
                return
            }

            for _, role := range roles {
                if user.Role == role {
                    next.ServeHTTP(w, r)
                    return
                }
            }

            http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
        })
    }
}
```

## CORS Middleware

Required for browser-based clients calling your API from a different domain:

```go
type CORSConfig struct {
    AllowedOrigins []string
    AllowedMethods []string
    AllowedHeaders []string
    MaxAge         int
}

func CORS(cfg CORSConfig) Middleware {
    allowedOrigins := make(map[string]bool)
    for _, o := range cfg.AllowedOrigins {
        allowedOrigins[o] = true
    }

    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            if allowedOrigins["*"] || allowedOrigins[origin] {
                w.Header().Set("Access-Control-Allow-Origin", origin)
            }

            w.Header().Set("Access-Control-Allow-Methods", strings.Join(cfg.AllowedMethods, ", "))
            w.Header().Set("Access-Control-Allow-Headers", strings.Join(cfg.AllowedHeaders, ", "))
            w.Header().Set("Access-Control-Max-Age", strconv.Itoa(cfg.MaxAge))

            // Handle preflight
            if r.Method == "OPTIONS" {
                w.WriteHeader(http.StatusNoContent)
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}
```

## Rate Limiting

Protect your API from abuse:

```go
func RateLimit(requestsPerSecond int) Middleware {
    limiter := rate.NewLimiter(rate.Limit(requestsPerSecond), requestsPerSecond)

    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if !limiter.Allow() {
                w.Header().Set("Retry-After", "1")
                http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}

// Per-IP rate limiting
func PerIPRateLimit(requestsPerSecond int) Middleware {
    var mu sync.Mutex
    limiters := make(map[string]*rate.Limiter)

    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ip := r.RemoteAddr

            mu.Lock()
            lim, exists := limiters[ip]
            if !exists {
                lim = rate.NewLimiter(rate.Limit(requestsPerSecond), requestsPerSecond)
                limiters[ip] = lim
            }
            mu.Unlock()

            if !lim.Allow() {
                http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

## Request ID Middleware

Trace requests across services:

```go
func RequestID() Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            id := r.Header.Get("X-Request-ID")
            if id == "" {
                id = uuid.New().String()
            }

            ctx := context.WithValue(r.Context(), "request_id", id)
            w.Header().Set("X-Request-ID", id)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

## Selective Middleware

Apply auth only to protected routes:

```go
func main() {
    auth := Auth(authService)
    adminOnly := RequireRole("admin")

    mux := http.NewServeMux()

    // Public routes
    mux.HandleFunc("POST /api/auth/login", authHandler.Login)
    mux.HandleFunc("POST /api/auth/register", authHandler.Register)
    mux.HandleFunc("GET /api/books", bookHandler.List)

    // Protected routes — wrap individual handlers
    mux.Handle("POST /api/books", auth(adminOnly(http.HandlerFunc(bookHandler.Create))))
    mux.Handle("DELETE /api/books/{id}", auth(adminOnly(http.HandlerFunc(bookHandler.Delete))))

    // Global middleware
    handler := Chain(mux, Logger(logger), Recovery(), CORS(corsConfig))
    http.ListenAndServe(":8080", handler)
}
```

## Key Takeaways

1. **Middleware signature: `func(http.Handler) http.Handler`** — wraps handlers with extra behavior
2. **Chain middleware** for clean composition — logging, recovery, CORS, auth, rate limiting
3. **JWT for stateless auth** — token contains user info, no session storage needed
4. **Store user in `context.Context`** — handlers extract it without knowing about auth details
5. **CORS is mandatory** for browser clients — handle OPTIONS preflight
6. **Rate limit per IP** in production — global rate limits don't protect against individual abuse
7. **Apply auth selectively** — not every route needs authentication

