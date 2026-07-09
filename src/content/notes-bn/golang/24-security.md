---
title: 'Security Best Practice'
subtitle: 'SQL injection, XSS, CSRF, secrets management, আর cryptography — বাস্তব-জগতের attack থেকে আপনার Go service নিরাপদ রাখুন।'
chapter: 24
level: 'advanced'
readingTime: '18 মিনিট'
topics: ['security', 'SQL injection', 'XSS', 'CSRF', 'bcrypt', 'secrets', 'HTTPS']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Security Mindset

প্রতিটা input untrusted। প্রতিটা output-এর sanitization দরকার। প্রতিটা secret-এর সুরক্ষা দরকার।

<Callout type="info">

**বাস্তব উদাহরণ**

Security হলো একটা বিল্ডিংয়ের প্রতিরক্ষা স্তরের মতো। সদর দরজায় একটা তালা আছে (authentication)। প্রতিটা রুমে ঢুকতে একটা keycard লাগে (authorization)। মূল্যবান জিনিস একটা সিন্দুকে থাকে (encryption)। সিকিউরিটি ক্যামেরা সবকিছু দেখে (logging)। কোনো একক স্তরই নিখুঁত নয়, কিন্তু একসাথে এরা বিল্ডিংটাকে ভাঙা খুব কঠিন করে তোলে।

</Callout>

## SQL Injection প্রতিরোধ

#1 vulnerability। কখনো user input SQL-এ concatenate করবেন না:

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

**Go-এর `database/sql` package default-ভাবে parameterize করে** যখন আপনি `$1`, `$2` placeholder ব্যবহার করেন। আপনি তখনই vulnerable, যখন আপনি নিজে হাতে string concatenate করে query-তে ঢোকান। SQL বানাতে কখনো `fmt.Sprintf` ব্যবহার করবেন না।

</Callout>

## bcrypt দিয়ে Password Hashing

কখনো plaintext password store করবেন না। bcrypt ব্যবহার করুন — এটা ডিজাইন করেই slow করা হয়েছে (brute force আটকায়):

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

## Input Validation ও Sanitization

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

**কখনো secret log করবেন না।** এমনকি error message-এও না। `slog.Error("db connection failed", "url", dbURL)` connection string-এ password print করে দিতে পারে। log করার আগে credential ছেঁটে ফেলুন।

</Callout>

## Authentication-এর জন্য Rate Limiting

brute-force login চেষ্টা আটকান:

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

## HTTPS ও TLS

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

| ক্ষেত্র        | করণীয়                                                              |
| -------------- | ------------------------------------------------------------------- |
| **SQL**        | সবসময় parameterized query ব্যবহার করুন (`$1`, `$2`)                |
| **Password**   | cost >= 12 সহ bcrypt, কখনো plaintext store করবেন না                 |
| **Secrets**    | environment variable, কখনো code বা git-এ নয়                        |
| **Input**      | length, format, type validate করুন। HTML sanitize করুন              |
| **Auth**       | login চেষ্টা rate limit করুন, constant-time comparison ব্যবহার করুন |
| **HTTPS**      | সর্বনিম্ন TLS 1.2+, HSTS header                                     |
| **Header**     | security header সেট করুন (CSP, X-Frame-Options, ইত্যাদি)            |
| **Error**      | কখনো client-কে internal error দেখাবেন না                            |
| **Logging**    | কখনো password, token, বা PII log করবেন না                           |
| **Dependency** | নিয়মিত `govulncheck` চালান, module আপডেট রাখুন                     |

```bash
# Check for known vulnerabilities in dependencies
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

## মূল কথা

1. **Parameterized query SQL injection আটকায়** — SQL-এর জন্য কখনো `fmt.Sprintf` নয়
2. **password-এর জন্য bcrypt** — cost 12+, constant-time comparison, কখনো hash return করবেন না
3. **boundary-তে সবকিছু validate করুন** — process করার আগে length, format, type
4. **secret environment থেকে** — না থাকলে fail fast, কখনো log করবেন না
5. **authentication rate limit করুন** — প্রতি IP-তে 15 মিনিটে 5 চেষ্টা
6. **প্রতিটা response-এ security header** — HSTS, CSP, X-Frame-Options
7. **`govulncheck`** — নিয়মিত dependency-তে জানা vulnerability scan করুন
