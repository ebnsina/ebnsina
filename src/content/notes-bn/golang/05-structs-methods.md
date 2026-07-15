---
title: 'Structs ও Methods'
subtitle: 'Go-তে class নেই — আছে struct আর method। সহজ, বেশি explicit, আর অবাক করার মতো শক্তিশালী।'
chapter: 5
level: 'beginner'
readingTime: '18 মিনিট'
topics: ['structs', 'methods', 'receivers', 'embedding', 'constructors']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

স্কুলের অফিসে ফাতেমা আপা নতুন সেশনের ID কার্ড বানাচ্ছেন। কার্ডের একটা ছাপানো টেমপ্লেট আছে — একটা কার্ডেই পাশাপাশি বসানো নাম, রোল, ছবি আর ব্লাড গ্রুপের ঘর। করিমের কার্ড হোক বা রহিমের, প্রত্যেকের এলোমেলো কাগজে আলাদা করে নাম-রোল লেখা লাগে না; একই ছকের একটা কার্ডেই সম্পর্কিত সব তথ্য এক জায়গায় গোছানো থাকে। নামের ঘরে কেউ ব্লাড গ্রুপ বসিয়ে দেবে, সেই সুযোগও নেই — প্রতিটা ঘরের নির্দিষ্ট জায়গা, নির্দিষ্ট ধরন।

আবার এই কার্ডের সাথেই কয়েকটা কাজ বাঁধা থাকে, যেগুলো কার্ডের নিজের তথ্য নিয়েই চলে। "প্রিন্ট" বললে কার্ডটা তার নিজের নাম-রোল-ছবি দিয়েই ছাপা হয়; "সারাংশ দেখাও" বললে সে তার নিজের নাম আর রোল জুড়ে এক লাইনে বলে দেয়। কাজগুলো বাইরের কোনো কাগজ থেকে নয়, ঠিক ওই কার্ডটার নিজের ঘরগুলো থেকেই তথ্য নেয়।

এই কার্ড টেমপ্লেটটাই আসলে একটা **struct** — সম্পর্কিত কয়েকটা **field** (নাম, রোল, ছবি, ব্লাড গ্রুপ) এক নতুন **type**-এ একসাথে বেঁধে ফেলা। আর কার্ডের সাথে বাঁধা "প্রিন্ট" বা "সারাংশ দেখাও" কাজগুলোই হলো **method** — যে function সরাসরি ওই struct-এর সাথে যুক্ত থাকে আর তার নিজের data নিয়েই কাজ করে (সেই struct-টাই method-এর **receiver**)। বাস্তবে একটা `User`-এর নাম-ইমেইল একসাথে রাখা struct আর তার উপর বসানো `FullName()`-এর মতো method ঠিক এভাবেই ডেটা আর সেই ডেটার আচরণকে একই জায়গায় গুছিয়ে রাখে।

## Structs: Go-র বিল্ডিং ব্লক

একটা struct হলো field-এর একটা সংগ্রহ। সম্পর্কিত ডেটা একসাথে গোছানোর এটাই Go-র প্রধান উপায় — inheritance ছাড়া, constructor ছাড়া, আর কোনো আড়ম্বর ছাড়া একটা class-এর মতো।

```go
type User struct {
    ID        int
    Email     string
    FirstName string
    LastName  string
    CreatedAt time.Time
    IsActive  bool
}
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা struct অনেকটা ডাক্তারের চেম্বারে পূরণ করা একটা ফর্মের মতো। এতে নির্দিষ্ট field আছে (Name, Date of Birth, Insurance), প্রতিটার নির্দিষ্ট type সহ। আপনি Name field-এ আপনার বয়স বসাতে পারবেন না। আর প্রতিটা ফর্ম শুরু হয় ফাঁকা অবস্থায় (zero value), যতক্ষণ না আপনি এটা পূরণ করেন।

</Callout>

## Struct তৈরি করা

```go
// Method 1: Named fields (preferred — order doesn't matter, self-documenting)
user := User{
    ID:        1,
    Email:     "fatima@example.com",
    FirstName: "Fatima",
    LastName:  "al-Khwarizmi",
    CreatedAt: time.Now(),
    IsActive:  true,
}

// Method 2: Positional (fragile — avoid in production code)
user := User{1, "fatima@example.com", "Fatima", "al-Khwarizmi", time.Now(), true}

// Method 3: Zero value (all fields get defaults)
var user User  // ID=0, Email="", IsActive=false, etc.

// Method 4: Pointer to struct
user := &User{
    ID:    1,
    Email: "fatima@example.com",
}
```

<Callout type="warning">

**Struct তৈরি করার সময় সবসময় named field ব্যবহার করুন।** Positional initialization তখনই ভেঙে পড়ে যখন আপনি field যোগ করেন বা তাদের ক্রম বদলান। Go vet টুল এই নিয়ে আপনাকে সতর্ক করবে।

</Callout>

## Constructor Functions

Go-তে কোনো constructor নেই। এর বদলে factory function ব্যবহার করুন — এটা একটা convention, ভাষার কোনো feature নয়:

```go
// Convention: NewXxx returns a pointer to a new instance
func NewUser(email, first, last string) *User {
    return &User{
        ID:        generateID(),
        Email:     email,
        FirstName: first,
        LastName:  last,
        CreatedAt: time.Now(),
        IsActive:  true,
    }
}

// With validation
func NewUser(email, first, last string) (*User, error) {
    if !strings.Contains(email, "@") {
        return nil, fmt.Errorf("invalid email: %s", email)
    }
    return &User{
        ID:        generateID(),
        Email:     strings.ToLower(email),
        FirstName: first,
        LastName:  last,
        CreatedAt: time.Now(),
        IsActive:  true,
    }, nil
}

user, err := NewUser("fatima@example.com", "Fatima", "al-Khwarizmi")
```

## Methods: Type-এর সাথে যুক্ত Function

একটা method হলো একটা **receiver** সহ একটা function — যে type-এর সাথে এটা যুক্ত:

```go
type Rectangle struct {
    Width  float64
    Height float64
}

// Value receiver — works on a COPY of the struct
func (r Rectangle) Area() float64 {
    return r.Width * r.Height
}

// Value receiver — also a copy
func (r Rectangle) Perimeter() float64 {
    return 2 * (r.Width + r.Height)
}

rect := Rectangle{Width: 10, Height: 5}
fmt.Println(rect.Area())       // 50
fmt.Println(rect.Perimeter())  // 30
```

## Value বনাম Pointer Receivers

Method লেখার সময় এটাই সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত:

```go
type Account struct {
    Balance float64
}

// Value receiver — CANNOT modify the original
func (a Account) GetBalance() float64 {
    return a.Balance
}

// Pointer receiver — CAN modify the original
func (a *Account) Deposit(amount float64) {
    a.Balance += amount  // Modifies the actual Account
}

func (a *Account) Withdraw(amount float64) error {
    if amount > a.Balance {
        return fmt.Errorf("insufficient funds: have %.2f, want %.2f", a.Balance, amount)
    }
    a.Balance -= amount
    return nil
}

acc := &Account{Balance: 100}
acc.Deposit(50)
fmt.Println(acc.Balance)  // 150
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

**Value receiver** = একটা নথির ফটোকপি নিয়ে কপিটায় লেখা। মূলটা অপরিবর্তিত থাকে। Read-only operation-এর জন্য ব্যবহার করুন।

**Pointer receiver** = আপনাকে মূল নথিটাই দেওয়া হলো। আপনি যা পরিবর্তন করেন তা আসল জিনিসেই প্রভাব ফেলে। State পরিবর্তন করা দরকার হলে ব্যবহার করুন।

</Callout>

### কখন কোনটা ব্যবহার করবেন?

| Pointer receiver `*T` ব্যবহার করুন যখন...                        | Value receiver `T` ব্যবহার করুন যখন... |
| ---------------------------------------------------------------- | -------------------------------------- |
| Method struct পরিবর্তন করে                                       | Method শুধু field পড়ে                 |
| Struct বড় (copy এড়ায়)                                         | Struct ছোট (কয়েকটা field)             |
| Consistency — কোনো একটা method-এ pointer লাগলে, সবগুলোতে pointer | Type ডিজাইনগতভাবে immutable            |
| Struct-এ একটা `sync.Mutex` বা তেমন কিছু আছে                      | Primitive-সদৃশ type (Point, Color)     |

<Callout type="tip">

**Industry নিয়ম:** সন্দেহ হলে, pointer receiver ব্যবহার করুন। একটা type-এর কোনো একটা method যদি pointer receiver ব্যবহার করে, তাহলে consistency-র জন্য সব method-এই pointer receiver ব্যবহার করা উচিত।

</Callout>

## Struct Tags: Serialization-এর জন্য Metadata

Tag হলো struct field-এর সাথে যুক্ত string metadata। Library-গুলো reflection-এর মাধ্যমে এগুলো ব্যবহার করে।

```go
type User struct {
    ID        int       `json:"id" db:"user_id"`
    Email     string    `json:"email" validate:"required,email"`
    FirstName string    `json:"first_name" db:"first_name"`
    Password  string    `json:"-"`  // Never include in JSON output
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// JSON serialization respects tags
user := User{ID: 1, Email: "fatima@example.com", FirstName: "Fatima", Password: "secret"}
data, _ := json.Marshal(user)
// {"id":1,"email":"fatima@example.com","first_name":"Fatima","created_at":"0001-01-01T00:00:00Z"}
// Note: Password is excluded because of json:"-"
```

সাধারণ tag ফরম্যাট:

- `json:"field_name"` — JSON encoding/decoding
- `json:"field_name,omitempty"` — zero value হলে বাদ দাও
- `db:"column_name"` — database column mapping (sqlx, gorm)
- `validate:"required,min=1"` — validation নিয়ম

## Struct Embedding: Inheritance-এর বদলে Composition

Go-তে inheritance নেই। এর বদলে এটা **embedding** ব্যবহার করে — একটা struct-কে আরেকটার ভেতরে বসানো:

```go
type Address struct {
    Street string
    City   string
    State  string
    Zip    string
}

type Employee struct {
    User            // Embedded — Employee "inherits" all User fields and methods
    Address         // Embedded — Employee also gets Address fields
    Department string
    Salary     float64
}

emp := Employee{
    User: User{
        ID:        1,
        Email:     "fatima@company.com",
        FirstName: "Fatima",
        LastName:  "al-Khwarizmi",
    },
    Address: Address{
        Street: "123 Main St",
        City:   "Austin",
        State:  "TX",
    },
    Department: "Engineering",
    Salary:     120000,
}

// Access embedded fields directly (promoted)
fmt.Println(emp.Email)      // "fatima@company.com" (from User)
fmt.Println(emp.City)       // "Austin" (from Address)
fmt.Println(emp.Department) // "Engineering" (own field)

// Call embedded methods directly
fmt.Println(emp.FullName()) // If User has a FullName() method
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

Embedding অনেকটা একজন ম্যানেজারের ব্যাজের মতো, যাতে একজন সাধারণ কর্মচারীর ব্যাজের সব তথ্য থাকে, সাথে "Department Head" আর "Budget Authority"-র মতো অতিরিক্ত field থাকে। ম্যানেজার তাঁর নাম আর employee ID আবার লেখেন না — সেই field-গুলো embedded employee ব্যাজ থেকে promote হয়ে আসে।

</Callout>

## বাস্তব জীবনের উদাহরণ: HTTP Service

সবকিছু একসাথে করলে — একটা সাধারণ Go service স্ট্রাকচার:

```go
type UserService struct {
    db     *sql.DB
    cache  *redis.Client
    logger *slog.Logger
}

func NewUserService(db *sql.DB, cache *redis.Client, logger *slog.Logger) *UserService {
    return &UserService{
        db:     db,
        cache:  cache,
        logger: logger,
    }
}

func (s *UserService) GetByID(ctx context.Context, id int) (*User, error) {
    // Check cache first
    cached, err := s.cache.Get(ctx, fmt.Sprintf("user:%d", id)).Result()
    if err == nil {
        var user User
        if err := json.Unmarshal([]byte(cached), &user); err == nil {
            return &user, nil
        }
    }

    // Cache miss — query database
    var user User
    err = s.db.QueryRowContext(ctx,
        "SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1",
        id,
    ).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.CreatedAt)

    if err == sql.ErrNoRows {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %d: %w", id, err)
    }

    // Cache for next time
    data, _ := json.Marshal(user)
    s.cache.Set(ctx, fmt.Sprintf("user:%d", id), data, 5*time.Minute)

    return &user, nil
}

func (s *UserService) Create(ctx context.Context, input CreateUserInput) (*User, error) {
    user := &User{
        Email:     strings.ToLower(input.Email),
        FirstName: input.FirstName,
        LastName:  input.LastName,
        CreatedAt: time.Now(),
        IsActive:  true,
    }

    err := s.db.QueryRowContext(ctx,
        "INSERT INTO users (email, first_name, last_name, created_at, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        user.Email, user.FirstName, user.LastName, user.CreatedAt, user.IsActive,
    ).Scan(&user.ID)

    if err != nil {
        return nil, fmt.Errorf("inserting user: %w", err)
    }

    s.logger.Info("user created", "id", user.ID, "email", user.Email)
    return user, nil
}
```

## মূল যেসব শিখলেন

1. **Struct সম্পর্কিত ডেটা গোছায়** — কোনো class নেই, inheritance নেই, constructor নেই
2. **`NewXxx` factory function** হলো validation সহ constructor-এর convention
3. **Pointer receiver পরিবর্তন করে**, value receiver পড়ে — সন্দেহ হলে pointer ব্যবহার করুন
4. **Struct tag** serialization নিয়ন্ত্রণ করে (`json`, `db`, `validate`)
5. **Embedding composition দেয়** — field আর method promote হয়, inherit হয় না
6. **Struct-কে focused রাখুন** — একটা `UserService` তার dependency ধরে রাখে আর method দেয়। এটাই সব Go service-এর মূল প্যাটার্ন
