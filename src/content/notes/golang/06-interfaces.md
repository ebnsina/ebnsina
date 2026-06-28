---
title: 'Interfaces & Polymorphism'
subtitle: "Go interfaces are implicit — no 'implements' keyword needed. This changes everything about how you design software."
chapter: 6
level: 'intermediate'
readingTime: '20 min'
topics: ['interfaces', 'polymorphism', 'type assertions', 'composition', 'dependency injection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What Makes Go Interfaces Different

In Java, you write `class Dog implements Animal`. In Go, there's no `implements` keyword. A type satisfies an interface **automatically** if it has the right methods. This is called **structural typing** (or duck typing at compile time).

```go
// Define an interface
type Writer interface {
    Write(p []byte) (n int, err error)
}

// Any type with a Write method satisfies Writer — no declaration needed
type FileWriter struct {
    path string
}

func (fw *FileWriter) Write(p []byte) (int, error) {
    return os.WriteFile(fw.path, p, 0644), nil  // Simplified
}

// FileWriter IS a Writer, automatically
var w Writer = &FileWriter{path: "/tmp/log.txt"}
```

<Callout type="info">

**Real-World Analogy**

Go interfaces are like electrical outlets. A device doesn't need to register itself as "outlet-compatible." If its plug has the right shape (methods), it fits. An American plug fits American outlets. A USB-C cable fits any USB-C port. No paperwork required.

</Callout>

## The Power of Small Interfaces

Go's standard library uses tiny interfaces — often just one method. This makes them incredibly composable:

```go
// io.Reader — anything you can read from
type Reader interface {
    Read(p []byte) (n int, err error)
}

// io.Writer — anything you can write to
type Writer interface {
    Write(p []byte) (n int, err error)
}

// io.Closer — anything you can close
type Closer interface {
    Close() error
}

// Compose them
type ReadWriter interface {
    Reader
    Writer
}

type ReadWriteCloser interface {
    Reader
    Writer
    Closer
}
```

These interfaces are satisfied by files, network connections, HTTP request bodies, buffers, compressed streams, and hundreds of other types — all without knowing about each other.

<Callout type="tip">

**Go proverb: "The bigger the interface, the weaker the abstraction."**

An interface with 10 methods is hard to implement and hard to mock. An interface with 1 method is easy to implement, test, and compose. Accept the smallest interface that does the job.

</Callout>

## Real-World Interface: Payment Processing

```go
// Small, focused interface
type PaymentProcessor interface {
    Charge(ctx context.Context, amount Money, source PaymentSource) (*Transaction, error)
    Refund(ctx context.Context, transactionID string) error
}

// Stripe implementation
type StripeProcessor struct {
    client *stripe.Client
    apiKey string
}

func (s *StripeProcessor) Charge(ctx context.Context, amount Money, source PaymentSource) (*Transaction, error) {
    params := &stripe.ChargeParams{
        Amount:   stripe.Int64(amount.Cents()),
        Currency: stripe.String(string(amount.Currency)),
        Source:   &stripe.SourceParams{Token: stripe.String(source.Token)},
    }
    charge, err := s.client.Charges.New(params)
    if err != nil {
        return nil, fmt.Errorf("stripe charge failed: %w", err)
    }
    return &Transaction{
        ID:     charge.ID,
        Amount: amount,
        Status: "completed",
    }, nil
}

func (s *StripeProcessor) Refund(ctx context.Context, transactionID string) error {
    _, err := s.client.Refunds.New(&stripe.RefundParams{
        Charge: stripe.String(transactionID),
    })
    return err
}

// Your service depends on the INTERFACE, not Stripe directly
type OrderService struct {
    payments PaymentProcessor  // Could be Stripe, PayPal, or a mock
    db       *sql.DB
}

func NewOrderService(p PaymentProcessor, db *sql.DB) *OrderService {
    return &OrderService{payments: p, db: db}
}

func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    tx, err := s.payments.Charge(ctx, order.Total, order.PaymentSource)
    if err != nil {
        return fmt.Errorf("payment failed: %w", err)
    }
    // Save order with transaction ID...
    return nil
}
```

## The Empty Interface and `any`

`interface{}` (or its alias `any` since Go 1.18) accepts any type:

```go
func printAnything(v any) {
    fmt.Printf("Type: %T, Value: %v\n", v, v)
}

printAnything(42)        // Type: int, Value: 42
printAnything("hello")   // Type: string, Value: hello
printAnything(true)      // Type: bool, Value: true
```

<Callout type="warning">

**Avoid `any` in your own APIs.** It throws away type safety. Use it only when you genuinely need to accept any type (like `json.Unmarshal`, `fmt.Println`). If you know the possible types, use generics or a type switch instead.

</Callout>

## Type Assertions and Type Switches

When you have an interface value, you can extract the concrete type:

```go
// Type assertion — "I believe this Writer is actually a *FileWriter"
var w Writer = &FileWriter{path: "/tmp/log.txt"}

fw, ok := w.(*FileWriter)
if ok {
    fmt.Println("File path:", fw.path)
}

// Type switch — handle multiple possible types
func describe(v any) string {
    switch val := v.(type) {
    case int:
        return fmt.Sprintf("integer: %d", val)
    case string:
        return fmt.Sprintf("string of length %d: %q", len(val), val)
    case error:
        return fmt.Sprintf("error: %v", val)
    case nil:
        return "nil"
    default:
        return fmt.Sprintf("unknown type %T", val)
    }
}
```

## Interface Composition Pattern

Build complex behavior from small, composable interfaces:

```go
// Small, focused interfaces
type UserReader interface {
    GetUser(ctx context.Context, id int) (*User, error)
    ListUsers(ctx context.Context, filter UserFilter) ([]*User, error)
}

type UserWriter interface {
    CreateUser(ctx context.Context, input CreateUserInput) (*User, error)
    UpdateUser(ctx context.Context, id int, input UpdateUserInput) (*User, error)
    DeleteUser(ctx context.Context, id int) error
}

// Composed interface for full access
type UserRepository interface {
    UserReader
    UserWriter
}

// Handler only needs read access
type UserHandler struct {
    users UserReader  // Only accepts the read interface
}

// Admin handler needs full access
type AdminHandler struct {
    users UserRepository
}
```

<Callout type="info">

**Real-World Analogy**

This is like access cards in an office. A regular employee card opens the front door and break room (Reader). A manager card also opens the supply closet and server room (Writer). The CTO card opens everything (Repository). You give each person the minimum access they need.

</Callout>

## Accept Interfaces, Return Structs

This is the most important Go design rule for production code:

```go
// GOOD: Accept interface — callers have flexibility
func ProcessData(r io.Reader) error {
    data, err := io.ReadAll(r)
    // ...
}

// Can be called with anything that reads:
ProcessData(os.Stdin)                           // Standard input
ProcessData(strings.NewReader("hello"))         // String
ProcessData(resp.Body)                          // HTTP response
ProcessData(&bytes.Buffer{})                    // Buffer

// GOOD: Return concrete type — callers know exactly what they get
func NewUserService(db *sql.DB) *UserService {
    return &UserService{db: db}
}

// BAD: Returning an interface hides what you actually get
func NewUserService(db *sql.DB) UserServiceInterface {
    return &UserService{db: db}  // Unnecessary abstraction
}
```

## Testing with Interfaces

Interfaces make testing trivial — swap the real implementation with a mock:

```go
// In production: real Stripe processor
service := NewOrderService(&StripeProcessor{client: stripeClient}, db)

// In tests: mock processor
type MockPaymentProcessor struct {
    ChargeFunc func(ctx context.Context, amount Money, source PaymentSource) (*Transaction, error)
    RefundFunc func(ctx context.Context, transactionID string) error
}

func (m *MockPaymentProcessor) Charge(ctx context.Context, amount Money, source PaymentSource) (*Transaction, error) {
    return m.ChargeFunc(ctx, amount, source)
}

func (m *MockPaymentProcessor) Refund(ctx context.Context, transactionID string) error {
    return m.RefundFunc(ctx, transactionID)
}

func TestPlaceOrder(t *testing.T) {
    mock := &MockPaymentProcessor{
        ChargeFunc: func(ctx context.Context, amount Money, source PaymentSource) (*Transaction, error) {
            return &Transaction{ID: "tx_test_123", Status: "completed"}, nil
        },
    }

    service := NewOrderService(mock, testDB)
    err := service.PlaceOrder(ctx, testOrder)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}
```

## Nil Interface Gotcha

The most common interface pitfall in Go:

```go
type MyError struct {
    Message string
}

func (e *MyError) Error() string {
    return e.Message
}

func doWork() error {
    var err *MyError  // nil pointer to MyError
    // ...some logic that doesn't set err...
    return err  // DANGER: returns non-nil interface holding nil pointer!
}

result := doWork()
if result != nil {
    // This executes! Because the interface is NOT nil.
    // It holds a (*MyError, nil) pair — the type is set, the value is nil.
    fmt.Println(result)  // Panic: nil pointer dereference
}

// FIX: Return nil explicitly
func doWork() error {
    var err *MyError
    // ...
    if err != nil {
        return err
    }
    return nil  // Return bare nil, not a typed nil
}
```

<Callout type="warning">

**An interface in Go is a (type, value) pair.** It's only `nil` when BOTH are nil. If you assign a nil pointer of a specific type, the interface has a type but no value — it's NOT nil. Always return bare `nil` for "no error."

</Callout>

## Key Takeaways

1. **Interfaces are implicit** — no `implements` keyword. If the methods match, the type satisfies the interface
2. **Keep interfaces small** — 1-3 methods. Compose them for larger contracts
3. **Accept interfaces, return structs** — this maximizes flexibility for callers and clarity for implementers
4. **Define interfaces where they're used**, not where they're implemented — the consumer knows what it needs
5. **Interfaces enable testing** — swap real implementations for mocks without changing business logic
6. **Watch for nil interfaces** — a nil pointer in an interface is NOT a nil interface
