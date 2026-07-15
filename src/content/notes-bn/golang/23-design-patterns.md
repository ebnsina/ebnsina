---
title: 'Go-তে Design Pattern'
subtitle: 'Go-এর সরলতা classic pattern প্রয়োগের ধরন বদলে দেয় — কোনো class নেই, কোনো inheritance নেই, শুধু composition আর interface।'
chapter: 23
level: 'advanced'
readingTime: '20 মিনিট'
topics:
  [
    'design patterns',
    'dependency injection',
    'options pattern',
    'strategy',
    'observer',
    'decorator'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিমের ছোট ভাই তমাল দুই রকম খেলনা কিনেছিল। একটা LEGO-র সেট — ছোট ছোট আলাদা ব্লক, ইচ্ছেমতো স্ন্যাপ করে জোড়া দিয়ে গাড়ি বানানো যায়, চাকা খুলে ডানা লাগিয়ে দিলেই সেটা প্লেন হয়ে যায়। আরেকটা ছিল দোকান থেকে কেনা একটা গোটা মার্বেল পাথর কেটে বানানো ঘোড়ার মূর্তি — দেখতে সুন্দর, কিন্তু এক টুকরো, ঘোড়ার লেজটা একটু ছোট করতে চাইলেও কিছুই করার নেই, পুরোটা ফেলে নতুন মূর্তি কিনতে হবে। কয়েক দিন পর তমাল LEGO দিয়েই সারাদিন কাটায়, মূর্তিটা তাকের কোণে পড়ে থাকে — কারণ LEGO-তে সে যা খুশি বানাতে আর ভাঙতে পারে।

Go-তে code লেখাটাও ঠিক এই LEGO-র মতো। এখানে বড় class hierarchy বা inheritance-এর গোটা মূর্তি বানানো হয় না — বরং ছোট ছোট interface আর function-কে ব্লকের মতো snap করে একটা struct-এ বসিয়ে দেওয়া হয়। behavior বদলাতে হলে পুরো জিনিস ফেলে দিতে হয় না, শুধু একটা ব্লক খুলে অন্যটা বসিয়ে দিলেই চলে — দাম বসানোর নিয়ম বদলাতে একটা pricing function swap করা, বা কোনো handler-কে auth-logging দিয়ে wrap করা।

এই গল্পটাই আসলে Go-এর **composition over inheritance**। মূর্তির মতো আটকে থাকা inheritance-এর বদলে LEGO-র মতো ছোট টুকরো জোড়া দেওয়াই Go-এর মূল ধরন — আর এই ছোট টুকরো swap করাটাই **strategy pattern** (function pass করে দাম হিসাব বদলানো), টুকরোর ওপর টুকরো চাপিয়ে দেওয়াটাই **decorator pattern** (middleware দিয়ে handler wrap), ব্লক জোড়ার নিয়মটা লুকিয়ে দেওয়াটাই **factory** আর **functional options**। বাস্তবে Go-এর standard library আর প্রায় প্রতিটা বড় library ঠিক এভাবেই — rigid family tree না বানিয়ে composable interface দিয়ে — লেখা হয়, যাতে কালকে নতুন behavior লাগলে গোটা code না ভেঙে শুধু একটা নতুন ব্লক snap করা যায়।

## Go-তে Pattern আলাদা

Classic design pattern-গুলো লেখা হয়েছিল Java আর C++-এর জন্য। Go-এর সরলতা — কোনো class নেই, কোনো inheritance নেই, first-class function — মানে অনেক pattern হয় খুব সরল হয়ে যায়, নয়তো একেবারেই দরকার পড়ে না।

<Callout type="info">

**বাস্তব উদাহরণ**

Go-তে Java pattern ব্যবহার করা হলো সাইকেলের টায়ার বদলাতে গাড়ির জ্যাক ব্যবহার করার মতো। গাড়ির জ্যাক কাজ করে, কিন্তু কাজটার জন্য একটা সাধারণ হ্যান্ড পাম্প ভালো। Go-এর টুল (interface, function, composition) পুরো pattern পরিবারকেই বদলে দেয়।

</Callout>

## Functional Options Pattern

configurable constructor-এর জন্য সবচেয়ে idiomatic Go pattern। standard library আর প্রায় প্রতিটা বড় Go library-তে ব্যবহৃত হয়:

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

**এই pattern কেন Go-তে রাজত্ব করে:** এটা optional parameter সামলায় (Go-তে default argument নেই), self-documenting (প্রতিটা option-এর নাম আছে), backwards-compatible (existing caller না ভেঙেই নতুন option যোগ করা যায়), আর composable (option-গুলোকে preset-এ বান্ডল করা যায়)।

</Callout>

## Dependency Injection (Framework ছাড়া)

Go-এর কোনো DI framework দরকার নেই। interface সহ constructor injection-ই যথেষ্ট:

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

Java-তে: একটা interface define করুন, class বানান, strategy inject করুন। Go-তে: একটা function pass করুন।

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

অতিরিক্ত behavior দিয়ে কোনো functionality wrap করা। Go-তে এটা শুধুই middleware:

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

## Builder Pattern (যখন দরকার)

জটিল object construction-এর জন্য দরকারি — কিন্তু প্রায়ই functional options pattern ভালো:

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

## যেসব Pattern Go-তে দরকার নেই

| Java Pattern     | Go Alternative                             |
| ---------------- | ------------------------------------------ |
| Singleton        | Package-level variable + `sync.Once`       |
| Abstract Factory | Return interfaces from functions           |
| Template Method  | Pass a function parameter                  |
| Iterator         | `range` keyword, channels                  |
| Command          | Functions are first-class — just pass them |
| Visitor          | Type switch or interface methods           |

## মূল কথা

1. **Functional options** configurable constructor-এর জন্য — Go-এর #1 pattern
2. **DI = constructor injection** — interface pass করুন, `main()`-এ wire করুন, কোনো framework নেই
3. **Strategy = একটা function pass করুন** — কোনো class hierarchy দরকার নেই
4. **Decorator = interface-টা wrap করুন** — middleware-এর মতোই একই pattern
5. **Observer = event bus** typed event আর async handler সহ
6. **অনেক Java pattern অপ্রয়োজনীয়** — Go-এর function, interface, আর composition সেগুলোর জায়গা নেয়
