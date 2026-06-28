---
title: 'Security Best Practices'
subtitle: 'SQL injection, XSS, CSRF, secrets management, and cryptography — secure your Go services against real-world attacks.'
chapter: 24
level: 'advanced'
readingTime: '18 min'
topics: ['security', 'SQL injection', 'XSS', 'CSRF', 'bcrypt', 'secrets', 'HTTPS']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Security Mindset

Every input is untrusted. Every output needs sanitization. Every secret needs protection.

<Callout type="info">

**Real-World Analogy**

Security is like a building's defense layers. The front door has a lock (authentication). Each room requires a keycard (authorization). Valuables are in a safe (encryption). Security cameras watch everything (logging). No single layer is perfect, but together they make the building very hard to breach.

</Callout>

## SQL Injection Prevention

The #1 vulnerability. Never concatenate user input into SQL:

```go
// VULNERABLE — never do this
query := fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", userInput)
// If userInput = "'; DROP TABLE users; --" → your database is gone

// SAFE — always use parameterized queries
row := db.QueryRow("SELECT * FROM users WHERE email = $1", userInput)

// SAFE — using any standard Go database library
rows, err := db.Query(
    "SELECT * FROM users WHERE role = $1 AND active = $2",
    role, true,
)
```

<Callout type="warning">

**Go's `database/sql` package parameterizes by default** when you use `$1`, `$2` placeholders. You're only vulnerable if you manually concatenate strings into queries. Never use `fmt.Sprintf` to build SQL.

</Callout>

## Password Hashing with bcrypt

Never store plaintext passwords. Use bcrypt — it's slow by design (prevents brute force):

```go
import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    // Cost of 12 takes ~250ms — good balance of security and speed
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    if err != nil {
        return "", fmt.Errorf("hashing password: %w", err)
    }
    return string(bytes), nil
}

func CheckPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}

// Registration
func (s *AuthService) Register(ctx context.Context, email, password string) (*User, error) {
    // Validate password strength
    if len(password) < 8 {
        return nil, NewValidationError(map[string]string{
            "password": "must be at least 8 characters",
        })
    }

    hashedPassword, err := HashPassword(password)
    if err != nil {
        return nil, err
    }

    user := &User{
        Email:    strings.ToLower(strings.TrimSpace(email)),
        Password: hashedPassword,
    }

    if err := s.repo.Create(ctx, user); err != nil {
        return nil, err
    }

    user.Password = ""  // Never return the hash
    return user, nil
}

// Login
func (s *AuthService) Login(ctx context.Context, email, password string) (string, error) {
    user, err := s.repo.GetByEmail(ctx, email)
    if err != nil {
        // Same error for "not found" and "wrong password" — prevents enumeration
        return "", ErrInvalidCredentials
    }

    if !CheckPassword(password, user.Password) {
        return "", ErrInvalidCredentials
    }

    return s.generateToken(user)
}
```

## Input Validation and Sanitization

```go
import (
    "html"
    "regexp"
    "strings"
    "unicode/utf8"
)

func sanitizeInput(input string) string {
    // Trim whitespace
    input = strings.TrimSpace(input)

    // Escape HTML to prevent XSS
    input = html.EscapeString(input)

    // Remove null bytes (can bypass validation)
    input = strings.ReplaceAll(input, "\x00", "")

    return input
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

func validateEmail(email string) error {
    email = strings.TrimSpace(email)
    if !emailRegex.MatchString(email) {
        return fmt.Errorf("invalid email format")
    }
    if len(email) > 254 {
        return fmt.Errorf("email too long")
    }
    return nil
}

func validateUsername(username string) error {
    if utf8.RuneCountInString(username) < 3 || utf8.RuneCountInString(username) > 30 {
        return fmt.Errorf("username must be 3-30 characters")
    }
    if !regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(username) {
        return fmt.Errorf("username can only contain letters, numbers, hyphens, and underscores")
    }
    return nil
}
```

## Secrets Management

```go
// NEVER hardcode secrets
const apiKey = "sk_live_abc123"  // BAD — ends up in git history

// Read from environment variables
apiKey := os.Getenv("API_KEY")
if apiKey == "" {
    log.Fatal("API_KEY environment variable is required")
}

// For multiple secrets, validate at startup
type Secrets struct {
    DBPassword    string
    JWTSecret     string
    APIKey        string
    EncryptionKey string
}

func LoadSecrets() (*Secrets, error) {
    s := &Secrets{
        DBPassword:    os.Getenv("DB_PASSWORD"),
        JWTSecret:     os.Getenv("JWT_SECRET"),
        APIKey:        os.Getenv("API_KEY"),
        EncryptionKey: os.Getenv("ENCRYPTION_KEY"),
    }

    // Fail fast if any secret is missing
    missing := []string{}
    if s.DBPassword == "" { missing = append(missing, "DB_PASSWORD") }
    if s.JWTSecret == "" { missing = append(missing, "JWT_SECRET") }
    if s.APIKey == "" { missing = append(missing, "API_KEY") }

    if len(missing) > 0 {
        return nil, fmt.Errorf("missing required secrets: %s", strings.Join(missing, ", "))
    }

    return s, nil
}
```

<Callout type="warning">

**Never log secrets.** Even in error messages. `slog.Error("db connection failed", "url", dbURL)` might print the password in the connection string. Strip credentials before logging.

</Callout>

## Rate Limiting for Authentication

Prevent brute-force login attempts:

```go
type LoginRateLimiter struct {
    mu       sync.Mutex
    attempts map[string][]time.Time
    limit    int
    window   time.Duration
}

func NewLoginRateLimiter(limit int, window time.Duration) *LoginRateLimiter {
    return &LoginRateLimiter{
        attempts: make(map[string][]time.Time),
        limit:    limit,
        window:   window,
    }
}

func (rl *LoginRateLimiter) Allow(identifier string) bool {
    rl.mu.Lock()
    defer rl.mu.Unlock()

    now := time.Now()
    cutoff := now.Add(-rl.window)

    // Remove expired attempts
    valid := make([]time.Time, 0)
    for _, t := range rl.attempts[identifier] {
        if t.After(cutoff) {
            valid = append(valid, t)
        }
    }

    if len(valid) >= rl.limit {
        rl.attempts[identifier] = valid
        return false  // Rate limited
    }

    rl.attempts[identifier] = append(valid, now)
    return true
}

// Usage in auth handler
loginLimiter := NewLoginRateLimiter(5, 15*time.Minute)  // 5 attempts per 15 min

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
    ip := r.RemoteAddr

    if !loginLimiter.Allow(ip) {
        http.Error(w, "too many login attempts, try again later", http.StatusTooManyRequests)
        return
    }

    // ... normal login logic
}
```

## HTTPS and TLS

```go
// Always use HTTPS in production
func main() {
    mux := http.NewServeMux()
    // ... register routes

    server := &http.Server{
        Addr:    ":443",
        Handler: mux,
        TLSConfig: &tls.Config{
            MinVersion: tls.VersionTLS12,
            CurvePreferences: []tls.CurveID{
                tls.X25519,
                tls.CurveP256,
            },
        },
    }

    log.Fatal(server.ListenAndServeTLS("cert.pem", "key.pem"))
}

// Security headers middleware
func SecurityHeaders() Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            w.Header().Set("X-Content-Type-Options", "nosniff")
            w.Header().Set("X-Frame-Options", "DENY")
            w.Header().Set("X-XSS-Protection", "1; mode=block")
            w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
            w.Header().Set("Content-Security-Policy", "default-src 'self'")
            w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

            next.ServeHTTP(w, r)
        })
    }
}
```

## Security Checklist

| Area             | Action                                                  |
| ---------------- | ------------------------------------------------------- |
| **SQL**          | Always use parameterized queries (`$1`, `$2`)           |
| **Passwords**    | bcrypt with cost >= 12, never store plaintext           |
| **Secrets**      | Environment variables, never in code or git             |
| **Input**        | Validate length, format, type. Sanitize HTML            |
| **Auth**         | Rate limit login attempts, use constant-time comparison |
| **HTTPS**        | TLS 1.2+ minimum, HSTS header                           |
| **Headers**      | Set security headers (CSP, X-Frame-Options, etc.)       |
| **Errors**       | Never expose internal errors to clients                 |
| **Logging**      | Never log passwords, tokens, or PII                     |
| **Dependencies** | Run `govulncheck` regularly, keep modules updated       |

```bash
# Check for known vulnerabilities in dependencies
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

## Key Takeaways

1. **Parameterized queries prevent SQL injection** — never use `fmt.Sprintf` for SQL
2. **bcrypt for passwords** — cost 12+, constant-time comparison, never return hashes
3. **Validate everything at the boundary** — length, format, type before processing
4. **Secrets from environment** — fail fast if missing, never log them
5. **Rate limit authentication** — 5 attempts per 15 minutes per IP
6. **Security headers on every response** — HSTS, CSP, X-Frame-Options
7. **`govulncheck`** — scan dependencies for known vulnerabilities regularly
