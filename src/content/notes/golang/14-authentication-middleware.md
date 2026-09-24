---
title: 'Authentication ও Middleware'
subtitle: 'JWT authentication, middleware chain, CORS, rate limiting — প্রতিটা API-র দরকারি security আর cross-cutting concern।'
chapter: 14
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['authentication', 'JWT', 'middleware', 'CORS', 'rate limiting', 'security']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনা একটা বড় গার্মেন্টস ফ্যাক্টরিতে চাকরি করে। ভেতরে কাটিং, সেলাই, প্যাকিং — অনেকগুলো ডিপার্টমেন্ট, প্রত্যেকে যার যার আসল কাজে ব্যস্ত। কিন্তু কেউ চাইলেই সোজা হেঁটে কোনো ডিপার্টমেন্টে ঢুকে যেতে পারে না। মেইন গেটেই একটা পাহারা বসানো — যে-ই আসুক, ভেতরে যাওয়ার আগে গেটের কয়েকটা ধাপ পার হতেই হয়।

একদিন সকালে খোয়ারিজমি এল সাপ্লায়ার হিসেবে দেখা করতে। গেটে দারোয়ান প্রথমে তার আইডি কার্ড চাইল — কার্ড না থাকলে ওখানেই থামিয়ে দিত, ভেতরে ঢুকতেই দিত না। আইডি ঠিক থাকায় এবার রেজিস্টার খাতায় তার নাম, সময় আর কোথায় যাচ্ছে লিখে রাখল। এই দুই ধাপ পার হওয়ার পরই তাকে সেলাই ডিপার্টমেন্টের দিকে যেতে দেওয়া হলো, যেখানে আসল কাজটা হয়। ফাতিমা যখন এল, তার বেলাতেও ঠিক একই ধাপ — একই গেট, একই ক্রম।

এই গল্পটাই আসলে **middleware**। গেটের ধাপগুলো হলো middleware **chain** — request আসল **handler**-এ (ডিপার্টমেন্টে) পৌঁছানোর আগেই এক এক করে চলে। আইডি চেকটা হলো **authentication** middleware — কে আসছে সেটা যাচাই করে, ঠিক না হলে গেটেই আটকে দেয়, handler পর্যন্ত পৌঁছাতেই দেয় না। রেজিস্টার খাতাটা হলো **logging** middleware — প্রতিটা request নীরবে টুকে রাখে। বাস্তবে প্রতিটা API এভাবেই কাজ করে: business logic-এ হাত না দিয়ে auth, logging, rate limiting-এর মতো cross-cutting কাজগুলো handler-কে মুড়ে আলাদা স্তরে সামলানো হয়।

## Middleware Pattern

Middleware request process করার আগে ও পরে আচরণ যোগ করতে HTTP handler-কে মুড়ে দেয়। business logic-কে জঞ্জালে না ভরে cross-cutting concern সামলানোর এটাই Go-এর উপায়।

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

**বাস্তব জীবনের উপমা**

Middleware অনেকটা বিমানবন্দরের নিরাপত্তা চেকপয়েন্টের মতো। আপনার গেটে (handler) পৌঁছানোর আগে আপনি ID চেক (auth), লাগেজ স্ক্যান (validation), আর মেটাল ডিটেক্টর (rate limiting)-এর মধ্য দিয়ে যান। প্রতিটা চেকপয়েন্ট স্বাধীন — গেট না বদলেই আপনি এগুলো যোগ বা বাদ দিতে পারেন।

</Callout>

## Middleware Chaining

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

একটা panic করা handler যাতে পুরো server ক্র্যাশ করতে না পারে তা ঠেকায়:

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

JSON Web Token হলো stateless API authentication-এর industry standard:

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

আলাদা domain থেকে আপনার API কল করা browser-based client-এর জন্য দরকার:

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

আপনার API-কে অপব্যবহার থেকে রক্ষা করুন:

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

service-গুলোর মধ্য দিয়ে request ট্রেস করুন:

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

শুধু protected route-এ auth প্রয়োগ করুন:

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

## মূল শিক্ষা

1. **Middleware signature: `func(http.Handler) http.Handler`** — handler-কে অতিরিক্ত আচরণ দিয়ে মোড়ে
2. **Middleware chain করুন** পরিচ্ছন্ন composition-এর জন্য — logging, recovery, CORS, auth, rate limiting
3. **stateless auth-এর জন্য JWT** — token-এ user info থাকে, কোনো session storage লাগে না
4. **`context.Context`-এ user সংরক্ষণ করুন** — handler auth-এর খুঁটিনাটি না জেনেই সেটা বের করে নেয়
5. **browser client-এর জন্য CORS বাধ্যতামূলক** — OPTIONS preflight সামলান
6. **production-এ per IP rate limit করুন** — global rate limit ব্যক্তিগত অপব্যবহার থেকে রক্ষা করে না
7. **auth বাছাই করে প্রয়োগ করুন** — প্রতিটা route-এর authentication লাগে না
