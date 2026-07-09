---
title: 'Scale-এ Error Handling'
subtitle: "'if err != nil'-এর বাইরে — error wrapping strategy, domain error, error budget, আর বড় Go codebase থেকে শেখা pattern।"
chapter: 18
level: 'advanced'
readingTime: '18 মিনিট'
topics: ['error handling', 'error wrapping', 'domain errors', 'error types', 'observability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Naive Error Handling-এর সমস্যা

ছোট project-এ `if err != nil { return err }` দিব্যি কাজ করে। কিন্তু ডজন ডজন service-ওয়ালা বড় codebase-এ আপনার দরকার:

- **Context**: এই error-টা আসলে কোথা থেকে এলো?
- **Classification**: এটা কি user error, একটা bug, নাকি একটা transient failure?
- **Actionability**: আমরা কি retry করব, alert দেব, নাকি একটা 400 return করব?

<Callout type="info">

**বাস্তব উদাহরণ**

Naive error handling হলো এমন একটা fire alarm-এর মতো যেটা শুধু বলে "আগুন!"। একটা ভালো alarm system বলে "Building B, Floor 3, Server Room, Sensor #7-এ আগুন detect হয়েছে — দুপুর 2:34-এ ধোঁয়া পাওয়া গেছে।" একই ঘটনা, কিন্তু দ্বিতীয়টা আপনাকে ঠিক কোথায় যেতে হবে আর কী আশা করতে হবে সেটা বলে দেয়।

</Callout>

## Error Wrapping Strategy

error যখন call stack বেয়ে উপরে উঠতে থাকে, প্রতিটা function তখন context যোগ করে:

```go
// Layer 1: Repository
func (r *UserRepo) GetByID(ctx context.Context, id int) (*User, error) {
    var user User
    err := r.db.QueryRowContext(ctx, "SELECT ... WHERE id = $1", id).Scan(...)
    if err == sql.ErrNoRows {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %d: %w", id, err)
    }
    return &user, nil
}

// Layer 2: Service
func (s *UserService) GetProfile(ctx context.Context, id int) (*Profile, error) {
    user, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("getting profile: %w", err)
    }
    // ...
}

// Layer 3: Handler
func (h *UserHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
    profile, err := h.service.GetProfile(r.Context(), id)
    if err != nil {
        // Full error chain: "getting profile: querying user 42: connection refused"
        // But the USER only sees a clean error
        if errors.Is(err, ErrNotFound) {
            respondError(w, 404, "user not found")
        } else {
            slog.Error("handler error", "error", err, "user_id", id)
            respondError(w, 500, "internal error")
        }
        return
    }
}
```

<Callout type="tip">

**Wrap করুন developer-দের জন্য, respond করুন user-দের জন্য।** পুরো error chain (`"getting profile: querying user 42: connection refused"`) log-এ যায়। User পায় `"user not found"` বা `"internal error"`। কখনো client-কে internal error-এর detail দেখাবেন না।

</Callout>

## Domain Error Type

string error-এর বাইরে যান — error-এর semantics টাইপে encode করুন:

```go
type ErrorCode string

const (
    ErrCodeNotFound      ErrorCode = "NOT_FOUND"
    ErrCodeConflict      ErrorCode = "CONFLICT"
    ErrCodeValidation    ErrorCode = "VALIDATION"
    ErrCodeUnauthorized  ErrorCode = "UNAUTHORIZED"
    ErrCodeForbidden     ErrorCode = "FORBIDDEN"
    ErrCodeInternal      ErrorCode = "INTERNAL"
    ErrCodeUnavailable   ErrorCode = "UNAVAILABLE"
)

type AppError struct {
    Code    ErrorCode         `json:"code"`
    Message string            `json:"message"`
    Details map[string]string `json:"details,omitempty"`
    Err     error             `json:"-"`  // Internal error — never serialized
}

func (e *AppError) Error() string {
    if e.Err != nil {
        return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
    }
    return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
    return e.Err
}

// Constructor functions
func NewNotFoundError(resource string, id any) *AppError {
    return &AppError{
        Code:    ErrCodeNotFound,
        Message: fmt.Sprintf("%s %v not found", resource, id),
    }
}

func NewValidationError(details map[string]string) *AppError {
    return &AppError{
        Code:    ErrCodeValidation,
        Message: "validation failed",
        Details: details,
    }
}

func NewConflictError(message string) *AppError {
    return &AppError{
        Code:    ErrCodeConflict,
        Message: message,
    }
}

func NewInternalError(message string, cause error) *AppError {
    return &AppError{
        Code:    ErrCodeInternal,
        Message: message,
        Err:     cause,
    }
}
```

## Error-থেকে-HTTP Mapping

domain error-গুলো automatically HTTP response-এ map করুন:

```go
func handleError(w http.ResponseWriter, err error) {
    var appErr *AppError
    if errors.As(err, &appErr) {
        status := errorCodeToHTTP(appErr.Code)
        writeJSON(w, status, map[string]any{
            "error":   appErr.Message,
            "code":    appErr.Code,
            "details": appErr.Details,
        })

        // Only log server errors
        if status >= 500 {
            slog.Error("server error",
                "code", appErr.Code,
                "message", appErr.Message,
                "cause", appErr.Err,
            )
        }
        return
    }

    // Unknown error — treat as internal
    slog.Error("unhandled error", "error", err)
    writeJSON(w, 500, map[string]string{"error": "internal server error"})
}

func errorCodeToHTTP(code ErrorCode) int {
    switch code {
    case ErrCodeNotFound:
        return http.StatusNotFound
    case ErrCodeConflict:
        return http.StatusConflict
    case ErrCodeValidation:
        return http.StatusUnprocessableEntity
    case ErrCodeUnauthorized:
        return http.StatusUnauthorized
    case ErrCodeForbidden:
        return http.StatusForbidden
    case ErrCodeUnavailable:
        return http.StatusServiceUnavailable
    default:
        return http.StatusInternalServerError
    }
}
```

## Retry-Aware Error

কিছু error transient (network-এ ক্ষণিকের সমস্যা) আর কিছু permanent (invalid input)। আপনার retry logic-এর এই পার্থক্যটা জানা দরকার:

```go
type RetryableError struct {
    Err       error
    RetryAfter time.Duration
}

func (e *RetryableError) Error() string {
    return fmt.Sprintf("retryable: %v (retry after %v)", e.Err, e.RetryAfter)
}

func (e *RetryableError) Unwrap() error {
    return e.Err
}

func IsRetryable(err error) bool {
    var retryErr *RetryableError
    return errors.As(err, &retryErr)
}

// Usage in a resilient client
func fetchWithRetry(ctx context.Context, url string, maxRetries int) ([]byte, error) {
    var lastErr error
    for attempt := 0; attempt < maxRetries; attempt++ {
        data, err := fetch(ctx, url)
        if err == nil {
            return data, nil
        }

        if !IsRetryable(err) {
            return nil, err  // Permanent error — don't retry
        }

        lastErr = err
        var retryErr *RetryableError
        if errors.As(err, &retryErr) {
            select {
            case <-time.After(retryErr.RetryAfter):
            case <-ctx.Done():
                return nil, ctx.Err()
            }
        }
    }
    return nil, fmt.Errorf("all %d attempts failed: %w", maxRetries, lastErr)
}
```

## Error Logging-এর Best Practice

```go
// BAD: logs at every layer — same error logged 3 times
func (r *Repo) Get(ctx context.Context, id int) (*User, error) {
    // ...
    slog.Error("db query failed", "error", err)  // Log #1
    return nil, err
}

func (s *Service) GetProfile(ctx context.Context, id int) (*Profile, error) {
    user, err := s.repo.Get(ctx, id)
    slog.Error("service failed", "error", err)  // Log #2 (same error!)
    return nil, err
}

// GOOD: log once at the boundary (handler/middleware)
func (r *Repo) Get(ctx context.Context, id int) (*User, error) {
    // ...
    return nil, fmt.Errorf("querying user %d: %w", id, err)  // Wrap only
}

func (s *Service) GetProfile(ctx context.Context, id int) (*Profile, error) {
    user, err := s.repo.Get(ctx, id)
    return nil, fmt.Errorf("getting profile: %w", err)  // Wrap only
}

// Handler logs with full context
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
    profile, err := h.service.GetProfile(r.Context(), id)
    if err != nil {
        slog.Error("request failed",  // Log once with full chain
            "error", err,
            "user_id", id,
            "request_id", getRequestID(r.Context()),
        )
        handleError(w, err)
    }
}
```

<Callout type="warning">

**error একবারই log করুন, boundary-তে।** ভেতরের layer-গুলো error-এ context wrap করে। সবচেয়ে বাইরের layer (handler, middleware, বা main loop) পুরো chain-টা log করে। একাধিক layer একই error log করলে noise তৈরি হয় আর debugging কঠিন হয়ে যায়।

</Callout>

## মূল কথা

1. **প্রতিটা layer-এ `%w` দিয়ে wrap করুন** — এটা একটা traceable error chain তৈরি করে
2. **domain error type ব্যবহার করুন** — code সহ `AppError` automatic HTTP mapping সম্ভব করে
3. **একবারই log করুন boundary-তে** — ভেতরের layer wrap করে, বাইরের layer log করে ও respond করে
4. **user error আর developer error আলাদা রাখুন** — user দেখে "not found", log-এ থাকে পুরো chain
5. **retryable বনাম permanent error আলাদা করুন** — retry logic-এর পার্থক্যটা জানা দরকার
6. **sentinel value-এর জন্য `errors.Is`**, **typed error-এর জন্য `errors.As`** — দুটোই wrapped chain traverse করে
