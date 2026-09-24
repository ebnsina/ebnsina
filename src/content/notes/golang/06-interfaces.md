---
title: 'Interfaces ও Polymorphism'
subtitle: "Go interface implicit — কোনো 'implements' keyword লাগে না। এটা সফটওয়্যার ডিজাইন করার পুরো ধরনটাই বদলে দেয়।"
chapter: 6
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['interfaces', 'polymorphism', 'type assertions', 'composition', 'dependency injection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার একটা কুরিয়ার কোম্পানি। একদিন ডেলিভারি বেড়ে গেল, তাই সে দোকানের সামনে একটা কাগজ ঝুলিয়ে দিল — "গাড়ি চালাতে পারে এমন লোক চাই।" এখানে খেয়াল করুন, সিনা কিন্তু লেখেনি "শুধু পেশাদার ট্যাক্সিওয়ালা চাই" বা "শুধু ট্রাক ড্রাইভার চাই।" সে শুধু একটাই শর্ত দিয়েছে — লোকটা গাড়ি চালাতে **পারতে** হবে। এখন পাশের খোয়ারিজমি, যে সারাজীবন ট্যাক্সি চালিয়েছে, সে-ও যোগ্য। পাড়ার ফাতিমা, যে নিজের প্রাইভেট কারে অফিস যাওয়া-আসা করে, সে-ও যোগ্য। এমনকি সিনা নিজে, যদি সে চালাতে জানে, সে-ও যোগ্য। কে সে, তার আগের পরিচয় কী — কিছুই বিচার্য নয়। শুধু "গাড়ি চালাতে পারে" এই একটা কাজ পারলেই সে ওই "ড্রাইভার" পদের জন্য উপযুক্ত।

মজাটা হলো, সিনার কাজটাও এতে সহজ হয়ে গেল। কোনদিন খোয়ারিজমি অসুস্থ, তো ফাতিমাকে ডেকে সেই একই ডেলিভারির গাড়িতে বসিয়ে দিলেই চলে। সিনাকে নতুন করে কিছু শেখাতে হয় না, কারণ যে-ই আসুক, সে তো "চালাতে পারা" শর্তটা আগে থেকেই পূরণ করে। গাড়ি একই, রাস্তা একই, শুধু চালকের চেয়ারে বসা মানুষটা বদলে যায় — আর কাজ ঠিক আগের মতোই চলতে থাকে।

এটাই আসলে Go-র **interface**। "গাড়ি চালাতে পারা" শর্তটাই হলো একটা interface — একটা behaviour contract, যা বলে দেয় কোন কাজটা (method) করতে জানতে হবে। খোয়ারিজমি, ফাতিমা বা সিনা হলো আলাদা আলাদা concrete type; তাদের কেউ নিজেকে "আমি ড্রাইভার" বলে ঘোষণা দেয় না, বরং কাজটা করতে **পারলেই** তারা আপনাআপনি interface-টা implement করে ফেলে — পরিচয় দিয়ে নয়, সামর্থ্য দিয়ে বিচার। আর একজনের জায়গায় আরেকজনকে বসিয়ে দিয়েও একই কাজ চালিয়ে নেওয়াটাই **polymorphism**। বাস্তবে এভাবেই আমরা `PaymentProcessor`-এর জায়গায় Stripe, PayPal বা একটা mock — যে-ই "charge করতে পারে" — বসিয়ে দিই, বাকি কোড এক লাইনও না বদলে।

## Go Interface-কে আলাদা করে কী

Java-তে আপনি লেখেন `class Dog implements Animal`। Go-তে কোনো `implements` keyword নেই। একটা type **automatically** একটা interface পূরণ করে যদি তার সঠিক method থাকে। একে বলে **structural typing** (অথবা compile time-এ duck typing)।

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

**বাস্তব জীবনের উপমা**

Go interface অনেকটা বৈদ্যুতিক আউটলেটের মতো। একটা ডিভাইসকে নিজেকে "outlet-compatible" হিসেবে register করতে হয় না। যদি এর প্লাগের সঠিক আকার থাকে (method), তাহলে এটা লেগে যায়। একটা American প্লাগ American আউটলেটে লাগে। একটা USB-C ক্যাবল যেকোনো USB-C পোর্টে লাগে। কোনো কাগজপত্র লাগে না।

</Callout>

## ছোট Interface-এর শক্তি

Go-র standard library ছোট ছোট interface ব্যবহার করে — প্রায়ই কেবল একটা method। এটা এগুলোকে অবিশ্বাস্যভাবে composable করে তোলে:

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

এই interface-গুলো file, network connection, HTTP request body, buffer, compressed stream, আর আরও শত শত type দিয়ে পূরণ হয় — সবগুলো একে অপরের ব্যাপারে না জেনেই।

<Callout type="tip">

**Go প্রবাদ: "Interface যত বড়, abstraction তত দুর্বল।"**

10 method-এর একটা interface implement করা কঠিন আর mock করা কঠিন। 1 method-এর একটা interface implement, test, আর compose করা সহজ। কাজটা যতটুকু করে তার সবচেয়ে ছোট interface গ্রহণ করুন।

</Callout>

## বাস্তব জীবনের Interface: Payment Processing

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

## Empty Interface এবং `any`

`interface{}` (অথবা Go 1.18 থেকে এর alias `any`) যেকোনো type গ্রহণ করে:

```go
func printAnything(v any) {
    fmt.Printf("Type: %T, Value: %v\n", v, v)
}

printAnything(42)        // Type: int, Value: 42
printAnything("hello")   // Type: string, Value: hello
printAnything(true)      // Type: bool, Value: true
```

<Callout type="warning">

**আপনার নিজের API-তে `any` এড়িয়ে চলুন।** এটা type safety ছুড়ে ফেলে দেয়। শুধু তখনই ব্যবহার করুন যখন আপনার সত্যিই যেকোনো type গ্রহণ করা দরকার (যেমন `json.Unmarshal`, `fmt.Println`)। সম্ভাব্য type-গুলো জানা থাকলে, এর বদলে generics বা একটা type switch ব্যবহার করুন।

</Callout>

## Type Assertion এবং Type Switch

আপনার কাছে একটা interface value থাকলে, আপনি concrete type বের করতে পারেন:

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

## Interface Composition প্যাটার্ন

ছোট, composable interface থেকে জটিল আচরণ তৈরি করুন:

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

**বাস্তব জীবনের উপমা**

এটা অনেকটা অফিসের access card-এর মতো। একজন সাধারণ কর্মচারীর কার্ড সদর দরজা আর break room খোলে (Reader)। একজন ম্যানেজারের কার্ড supply closet আর server room-ও খোলে (Writer)। CTO-র কার্ড সবকিছু খোলে (Repository)। আপনি প্রত্যেককে ঠিক ততটুকু access দেন যতটুকু তার দরকার।

</Callout>

## Interface গ্রহণ করুন, Struct Return করুন

Production কোডের জন্য এটাই সবচেয়ে গুরুত্বপূর্ণ Go ডিজাইন নিয়ম:

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

## Interface দিয়ে Testing

Interface testing-কে খুব সহজ করে দেয় — আসল implementation-কে একটা mock দিয়ে বদলে দিন:

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

## Nil Interface-এর ফাঁদ

Go-তে সবচেয়ে সাধারণ interface গোলযোগ:

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

**Go-তে একটা interface হলো একটা (type, value) জোড়া।** এটা কেবল তখনই `nil` যখন দুটোই nil। আপনি যদি একটা নির্দিষ্ট type-এর nil pointer assign করেন, তাহলে interface-এর একটা type আছে কিন্তু কোনো value নেই — এটা nil নয়। "কোনো error নেই"-এর জন্য সবসময় খালি `nil` return করুন।

</Callout>

## মূল যেসব শিখলেন

1. **Interface implicit** — কোনো `implements` keyword নেই। method মিললে, type interface পূরণ করে
2. **Interface ছোট রাখুন** — 1-3 method। বড় চুক্তির জন্য এগুলো compose করুন
3. **Interface গ্রহণ করুন, struct return করুন** — এটা caller-দের জন্য flexibility আর implementer-দের জন্য স্পষ্টতা সর্বোচ্চ করে
4. **Interface যেখানে ব্যবহার হয় সেখানে সংজ্ঞায়িত করুন**, যেখানে implement হয় সেখানে নয় — consumer জানে তার কী দরকার
5. **Interface testing সম্ভব করে** — business logic না বদলেই আসল implementation-কে mock দিয়ে বদলান
6. **Nil interface-এর ব্যাপারে সাবধান** — একটা interface-এ থাকা nil pointer কোনো nil interface নয়
