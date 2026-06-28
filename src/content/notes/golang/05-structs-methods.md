---
title: 'Structs & Methods'
subtitle: "Go doesn't have classes — it has structs with methods. Simpler, more explicit, and surprisingly powerful."
chapter: 5
level: 'beginner'
readingTime: '18 min'
topics: ['structs', 'methods', 'receivers', 'embedding', 'constructors']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Structs: Go's Building Blocks

A struct is a collection of fields. It's Go's primary way to group related data together — like a class without inheritance, without constructors, and without the ceremony.

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

**Real-World Analogy**

A struct is like a form you fill out at a doctor's office. It has specific fields (Name, Date of Birth, Insurance), each with a specific type. You can't put your age in the Name field. And every form starts blank (zero values) until you fill it in.

</Callout>

## Creating Structs

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

**Always use named fields** when creating structs. Positional initialization breaks when you add or reorder fields. The Go vet tool will warn you about this.

</Callout>

## Constructor Functions

Go has no constructors. Instead, use factory functions — a convention, not a language feature:

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

## Methods: Functions Attached to Types

A method is a function with a **receiver** — the type it's attached to:

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

## Value vs Pointer Receivers

This is the most important decision when writing methods:

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

**Real-World Analogy**

**Value receiver** = taking a photocopy of a document and writing on the copy. The original stays unchanged. Use for read-only operations.

**Pointer receiver** = being given the original document. Any changes you make affect the real thing. Use when you need to modify state.

</Callout>

### When to Use Which?

| Use pointer receiver `*T` when...                                | Use value receiver `T` when...      |
| ---------------------------------------------------------------- | ----------------------------------- |
| The method modifies the struct                                   | The method only reads fields        |
| The struct is large (avoids copying)                             | The struct is small (a few fields)  |
| Consistency — if any method needs a pointer, use pointer for all | The type is immutable by design     |
| The struct contains a `sync.Mutex` or similar                    | Primitive-like types (Point, Color) |

<Callout type="tip">

**Industry rule:** If in doubt, use a pointer receiver. If any method on a type uses a pointer receiver, all methods should use pointer receivers for consistency.

</Callout>

## Struct Tags: Metadata for Serialization

Tags are string metadata attached to struct fields. Libraries use them via reflection.

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

Common tag formats:

- `json:"field_name"` — JSON encoding/decoding
- `json:"field_name,omitempty"` — skip if zero value
- `db:"column_name"` — database column mapping (sqlx, gorm)
- `validate:"required,min=1"` — validation rules

## Struct Embedding: Composition Over Inheritance

Go doesn't have inheritance. Instead, it uses **embedding** — placing one struct inside another:

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

**Real-World Analogy**

Embedding is like a manager's badge that includes all the info from a regular employee badge, plus extra fields like "Department Head" and "Budget Authority." The manager doesn't re-enter their name and employee ID — those fields are promoted from the embedded employee badge.

</Callout>

## Real-World Example: HTTP Service

Putting it all together — a typical Go service structure:

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

## Key Takeaways

1. **Structs group related data** — no classes, no inheritance, no constructors
2. **`NewXxx` factory functions** are the convention for constructors with validation
3. **Pointer receivers modify**, value receivers read — when in doubt, use pointer
4. **Struct tags** control serialization (`json`, `db`, `validate`)
5. **Embedding provides composition** — fields and methods are promoted, not inherited
6. **Keep structs focused** — a `UserService` holds its dependencies and provides methods. This is the core pattern for all Go services
