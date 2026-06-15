---
title: "Design Patterns in Go"
subtitle: "Go's simplicity changes how you apply classic patterns — no classes, no inheritance, just composition and interfaces."
chapter: 23
level: "advanced"
readingTime: "20 min"
topics: ["design patterns", "dependency injection", "options pattern", "strategy", "observer", "decorator"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Patterns Are Different in Go

Classic design patterns were written for Java and C++. Go's simplicity — no classes, no inheritance, first-class functions — means many patterns either simplify dramatically or aren't needed at all.

<Callout type="info">

**Real-World Analogy**

Using Java patterns in Go is like using a car jack to change a bicycle tire. The car jack works, but a simple hand pump is better for the job. Go's tools (interfaces, functions, composition) replace entire pattern families.

</Callout>

## Functional Options Pattern

The most idiomatic Go pattern for configurable constructors. Used in the standard library and almost every major Go library:

```go
type Server struct {
    host         string
    port         int
    timeout      time.Duration
    maxConns     int
    logger       *slog.Logger
    tlsCert      string
}

type Option func(*Server)

func WithPort(port int) Option {
    return func(s *Server) {
        s.port = port
    }
}

func WithTimeout(d time.Duration) Option {
    return func(s *Server) {
        s.timeout = d
    }
}

func WithMaxConnections(n int) Option {
    return func(s *Server) {
        s.maxConns = n
    }
}

func WithLogger(l *slog.Logger) Option {
    return func(s *Server) {
        s.logger = l
    }
}

func WithTLS(certFile string) Option {
    return func(s *Server) {
        s.tlsCert = certFile
    }
}

func NewServer(host string, opts ...Option) *Server {
    // Defaults
    s := &Server{
        host:     host,
        port:     8080,
        timeout:  30 * time.Second,
        maxConns: 100,
        logger:   slog.Default(),
    }

    // Apply options
    for _, opt := range opts {
        opt(s)
    }

    return s
}

// Clean, readable construction
server := NewServer("localhost",
    WithPort(9090),
    WithTimeout(60*time.Second),
    WithTLS("/etc/ssl/cert.pem"),
)

// Defaults are fine too
defaultServer := NewServer("localhost")
```

<Callout type="tip">

**Why this pattern dominates Go:** It handles optional parameters (Go has no default arguments), is self-documenting (each option is named), backwards-compatible (add new options without breaking existing callers), and composable (bundle options into presets).

</Callout>

## Dependency Injection (Without a Framework)

Go doesn't need a DI framework. Constructor injection with interfaces is enough:

```go
// Dependencies are interfaces
type UserRepository interface {
    GetByID(ctx context.Context, id int) (*User, error)
    Create(ctx context.Context, user *User) error
}

type EmailService interface {
    SendWelcome(ctx context.Context, user *User) error
}

type Logger interface {
    Info(msg string, args ...any)
    Error(msg string, args ...any)
}

// Service accepts interfaces via constructor
type UserService struct {
    repo   UserRepository
    email  EmailService
    logger Logger
}

func NewUserService(repo UserRepository, email EmailService, logger Logger) *UserService {
    return &UserService{repo: repo, email: email, logger: logger}
}

// Wire everything in main()
func main() {
    db := setupDB()
    logger := slog.Default()

    // Real implementations
    userRepo := postgres.NewUserRepository(db)
    emailSvc := sendgrid.NewEmailService(apiKey)

    userService := NewUserService(userRepo, emailSvc, logger)
    userHandler := NewUserHandler(userService)

    // Register routes...
}
```

## Strategy Pattern

In Java: define an interface, create classes, inject strategy. In Go: pass a function.

```go
// Go strategy pattern — just use functions
type PricingStrategy func(basePrice float64, quantity int) float64

func RegularPricing(basePrice float64, quantity int) float64 {
    return basePrice * float64(quantity)
}

func BulkPricing(basePrice float64, quantity int) float64 {
    if quantity >= 100 {
        return basePrice * float64(quantity) * 0.8  // 20% discount
    }
    if quantity >= 10 {
        return basePrice * float64(quantity) * 0.9  // 10% discount
    }
    return basePrice * float64(quantity)
}

func SeasonalPricing(discount float64) PricingStrategy {
    return func(basePrice float64, quantity int) float64 {
        return basePrice * float64(quantity) * (1 - discount)
    }
}

type Order struct {
    calculatePrice PricingStrategy
}

func NewOrder(strategy PricingStrategy) *Order {
    return &Order{calculatePrice: strategy}
}

// Usage
regularOrder := NewOrder(RegularPricing)
bulkOrder := NewOrder(BulkPricing)
holidayOrder := NewOrder(SeasonalPricing(0.25))  // 25% off

price := bulkOrder.calculatePrice(10.00, 50)  // $450 (10% discount)
```

## Decorator Pattern

Wrap functionality with additional behavior. In Go, this is just middleware:

```go
// HTTP handler decorator (middleware is the decorator pattern)
type HandlerDecorator func(http.HandlerFunc) http.HandlerFunc

func WithAuth(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if !isAuthenticated(r) {
            http.Error(w, "unauthorized", 401)
            return
        }
        next(w, r)
    }
}

func WithLogging(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next(w, r)
        slog.Info("request", "path", r.URL.Path, "duration", time.Since(start))
    }
}

// Compose decorators
handler := WithLogging(WithAuth(myHandler))

// For any interface, not just HTTP
type Repository interface {
    GetByID(ctx context.Context, id int) (*User, error)
}

// Caching decorator
type CachedRepository struct {
    inner Repository
    cache *Cache
}

func NewCachedRepository(inner Repository, cache *Cache) *CachedRepository {
    return &CachedRepository{inner: inner, cache: cache}
}

func (r *CachedRepository) GetByID(ctx context.Context, id int) (*User, error) {
    key := fmt.Sprintf("user:%d", id)
    if cached, ok := r.cache.Get(key); ok {
        return cached.(*User), nil
    }

    user, err := r.inner.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }

    r.cache.Set(key, user, 5*time.Minute)
    return user, nil
}

// Stack decorators
var repo Repository = postgres.NewUserRepo(db)
repo = NewCachedRepository(repo, cache)       // Add caching
repo = NewLoggingRepository(repo, logger)     // Add logging
```

## Observer Pattern (Event System)

```go
type EventType string

const (
    UserCreated EventType = "user.created"
    UserUpdated EventType = "user.updated"
    OrderPlaced EventType = "order.placed"
)

type Event struct {
    Type    EventType
    Payload any
    Time    time.Time
}

type EventHandler func(ctx context.Context, event Event) error

type EventBus struct {
    mu       sync.RWMutex
    handlers map[EventType][]EventHandler
}

func NewEventBus() *EventBus {
    return &EventBus{
        handlers: make(map[EventType][]EventHandler),
    }
}

func (eb *EventBus) Subscribe(eventType EventType, handler EventHandler) {
    eb.mu.Lock()
    defer eb.mu.Unlock()
    eb.handlers[eventType] = append(eb.handlers[eventType], handler)
}

func (eb *EventBus) Publish(ctx context.Context, event Event) {
    eb.mu.RLock()
    handlers := eb.handlers[event.Type]
    eb.mu.RUnlock()

    for _, handler := range handlers {
        go func() {
            if err := handler(ctx, event); err != nil {
                slog.Error("event handler failed",
                    "event", event.Type,
                    "error", err,
                )
            }
        }()
    }
}

// Usage
bus := NewEventBus()

bus.Subscribe(UserCreated, func(ctx context.Context, e Event) error {
    user := e.Payload.(*User)
    return emailService.SendWelcome(ctx, user)
})

bus.Subscribe(UserCreated, func(ctx context.Context, e Event) error {
    user := e.Payload.(*User)
    return analytics.Track(ctx, "signup", user.ID)
})

// When a user is created
bus.Publish(ctx, Event{
    Type:    UserCreated,
    Payload: newUser,
    Time:    time.Now(),
})
```

## Builder Pattern (When Needed)

Useful for complex object construction — but often the functional options pattern is better:

```go
type QueryBuilder struct {
    table      string
    conditions []string
    args       []any
    orderBy    string
    limit      int
    offset     int
}

func NewQuery(table string) *QueryBuilder {
    return &QueryBuilder{table: table}
}

func (qb *QueryBuilder) Where(condition string, args ...any) *QueryBuilder {
    qb.conditions = append(qb.conditions, condition)
    qb.args = append(qb.args, args...)
    return qb
}

func (qb *QueryBuilder) OrderBy(field string) *QueryBuilder {
    qb.orderBy = field
    return qb
}

func (qb *QueryBuilder) Limit(n int) *QueryBuilder {
    qb.limit = n
    return qb
}

func (qb *QueryBuilder) Offset(n int) *QueryBuilder {
    qb.offset = n
    return qb
}

func (qb *QueryBuilder) Build() (string, []any) {
    query := fmt.Sprintf("SELECT * FROM %s", qb.table)

    if len(qb.conditions) > 0 {
        query += " WHERE " + strings.Join(qb.conditions, " AND ")
    }
    if qb.orderBy != "" {
        query += fmt.Sprintf(" ORDER BY %s", qb.orderBy)
    }
    if qb.limit > 0 {
        query += fmt.Sprintf(" LIMIT %d", qb.limit)
    }
    if qb.offset > 0 {
        query += fmt.Sprintf(" OFFSET %d", qb.offset)
    }

    return query, qb.args
}

// Usage
query, args := NewQuery("users").
    Where("age > $1", 18).
    Where("role = $2", "admin").
    OrderBy("created_at DESC").
    Limit(20).
    Build()
```

## Patterns You Don't Need in Go

| Java Pattern | Go Alternative |
|---|---|
| Singleton | Package-level variable + `sync.Once` |
| Abstract Factory | Return interfaces from functions |
| Template Method | Pass a function parameter |
| Iterator | `range` keyword, channels |
| Command | Functions are first-class — just pass them |
| Visitor | Type switch or interface methods |

## Key Takeaways

1. **Functional options** for configurable constructors — the #1 Go pattern
2. **DI = constructor injection** — pass interfaces, wire in `main()`, no framework
3. **Strategy = pass a function** — no class hierarchy needed
4. **Decorator = wrap the interface** — same pattern as middleware
5. **Observer = event bus** with typed events and async handlers
6. **Many Java patterns are unnecessary** — Go's functions, interfaces, and composition replace them

