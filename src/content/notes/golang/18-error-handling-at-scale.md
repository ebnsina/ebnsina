---
title: "Error Handling at Scale"
subtitle: "Beyond 'if err != nil' — error wrapping strategies, domain errors, error budgets, and patterns from large Go codebases."
chapter: 18
level: "advanced"
readingTime: "18 min"
topics: ["error handling", "error wrapping", "domain errors", "error types", "observability"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Problem with Naive Error Handling

In small projects, `if err != nil { return err }` works fine. In large codebases with dozens of services, you need:
- **Context**: Where did this error originate?
- **Classification**: Is this a user error, a bug, or a transient failure?
- **Actionability**: Should we retry, alert, or return a 400?

<Callout type="info">

**Real-World Analogy**

Naive error handling is like a fire alarm that just says "FIRE!" A good alarm system says "Fire detected in Building B, Floor 3, Server Room, Sensor #7 — smoke detected at 2:34 PM." Same event, but the second one tells you exactly where to go and what to expect.

</Callout>

## Error Wrapping Strategy

Every function adds context as the error propagates up the call stack:

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

**Wrap for developers, respond for users.** The full error chain (`"getting profile: querying user 42: connection refused"`) goes to logs. The user gets `"user not found"` or `"internal error"`. Never expose internal error details to clients.

</Callout>

## Domain Error Types

Go beyond string errors — encode error semantics in types:

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

## Error-to-HTTP Mapping

Automatically map domain errors to HTTP responses:

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

## Retry-Aware Errors

Some errors are transient (network blip) and some are permanent (invalid input). Your retry logic needs to know the difference:

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

## Error Logging Best Practices

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

**Log errors once, at the boundary.** Inner layers wrap errors with context. The outermost layer (handler, middleware, or main loop) logs the full chain. Multiple layers logging the same error creates noise and makes debugging harder.

</Callout>

## Key Takeaways

1. **Wrap with `%w` at every layer** — builds a traceable error chain
2. **Use domain error types** — `AppError` with codes enables automatic HTTP mapping
3. **Log once at the boundary** — inner layers wrap, outer layers log and respond
4. **Separate user errors from developer errors** — users see "not found", logs show the full chain
5. **Distinguish retryable vs permanent errors** — retry logic needs to know the difference
6. **`errors.Is` for sentinel values**, **`errors.As` for typed errors** — both traverse the wrapped chain

