---
title: 'Testing Strategy'
subtitle: 'Unit test, integration test, test fixture, mocking, আর testcontainers — এমন testing যা আসল bug ধরে, শুধু checkbox coverage নয়।'
chapter: 19
level: 'advanced'
readingTime: '22 মিনিট'
topics: ['testing', 'integration tests', 'mocking', 'testcontainers', 'fixtures', 'golden files']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতেমার একটা শার্ট বানানোর গার্মেন্টস কারখানা, আর সবচেয়ে বড় দায়িত্ব quality-control লাইনের। সেখানে করিম বসে থাকে সবার আগে — প্রতিটা বোতাম আলাদা করে টেনে দেখে ঠিকমতো সেলাই হয়েছে কিনা, প্রতিটা সেলাই আলাদা করে পরখ করে। একটা বোতাম, একটা সেলাই — একবারে একটা জিনিস, বাকি সব বাদ দিয়ে। এতে যদি কোনো একটা বোতাম ঢিলা থাকে, করিম সঙ্গে সঙ্গে ধরে ফেলে, কোন জায়গায় গড়বড় সেটাও নিশ্চিত জানে।

করিমের পাশেই একটা ইন্সপেকশন স্টেশন, যেখানে একটা বাঁধা checklist ঝোলানো — S সাদা, M সাদা, L নীল, XL কালো, এরকম অনেকগুলো সাইজ-রঙের কম্বিনেশন। রহিম প্রতিটা কম্বিনেশন একই স্টেশন দিয়ে একই নিয়মে চালিয়ে যায়, শুধু ইনপুট বদলায়, যন্ত্র একটাই। এরপর পুরো শার্টটা — কলার, হাতা, বোতাম, পকেট সব একসাথে জোড়া লাগিয়ে গায়ে পরিয়ে দেখা হয় সব অংশ একসাথে ঠিকমতো খাটছে কিনা। কিন্তু আসল কাস্টমার তো আর সবসময় হাজির থাকে না, তাই একটা নকল ডামি ধড় দাঁড় করানো থাকে — মানুষের বদলে ওটাতেই শার্ট পরিয়ে ফিটিং যাচাই হয়।

এই পুরো লাইনটাই আসলে testing strategy। করিমের একটা বোতাম বা সেলাই আলাদা পরখ করা হলো **unit test** (একটা function একলা যাচাই)। রহিমের বাঁধা checklist ধরে একই স্টেশনে অনেক কম্বিনেশন চালানো হলো **table-driven test** (এক লুপ, অনেক input/output কেস)। পুরো শার্ট জোড়া লাগিয়ে সব অংশ একসাথে যাচাই করা হলো **integration test**। আর কাস্টমার না থাকলে নকল ধড় দিয়ে কাজ চালানো হলো **mock/fake** — আসল database বা API-র বদলে দাঁড় করানো একটা stand-in। বাস্তবেও ঠিক এভাবে: বেশিরভাগ test হবে দ্রুত unit test, mock দিয়ে বাইরের নির্ভরতা সরিয়ে, আর কয়েকটা integration test আসল সিস্টেমে সব একসাথে খাটছে কিনা তা নিশ্চিত করতে — coverage শুধু একটা সংখ্যা, আসল লক্ষ্য bug ধরা।

## Go-তে Testing Pyramid

```
         /  E2E  \          Few — slow, brittle, but validates everything
        /----------\
       / Integration \      Some — tests with real DB, Redis, APIs
      /----------------\
     /   Unit Tests      \  Many — fast, isolated, test logic
    /______________________\
```

<Callout type="info">

**বাস্তব উদাহরণ**

**Unit test** = প্রতিটা উপকরণের স্বাদ ঠিক আছে কিনা যাচাই করা। **Integration test** = একটা পুরো রান্না করে সেটার স্বাদ নেওয়া। **E2E test** = একজন কাস্টমার অর্ডার দিয়ে খেয়ে বিল দিচ্ছে — পুরো রেস্তোরাঁর অভিজ্ঞতা টেস্ট করা। তিনটাই দরকার, কিন্তু আপনার বেশিরভাগ test হওয়া উচিত unit test (দ্রুত আর সস্তা)।

</Callout>

## Interface দিয়ে Unit Testing

testable Go code-এর মূল চাবিকাঠি: implementation-এর উপর নয়, interface-এর উপর নির্ভর করুন।

```go
// Define what you need
type UserRepository interface {
    GetByID(ctx context.Context, id int) (*User, error)
    Create(ctx context.Context, user *User) error
}

type EmailSender interface {
    Send(ctx context.Context, to, subject, body string) error
}

// Service depends on interfaces
type UserService struct {
    repo  UserRepository
    email EmailSender
}

// In tests — use mocks
type mockRepo struct {
    users map[int]*User
}

func (m *mockRepo) GetByID(ctx context.Context, id int) (*User, error) {
    user, ok := m.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return user, nil
}

func (m *mockRepo) Create(ctx context.Context, user *User) error {
    m.users[user.ID] = user
    return nil
}

type mockEmailSender struct {
    sent []sentEmail
}

type sentEmail struct {
    To, Subject, Body string
}

func (m *mockEmailSender) Send(ctx context.Context, to, subject, body string) error {
    m.sent = append(m.sent, sentEmail{to, subject, body})
    return nil
}

func TestUserService_Register(t *testing.T) {
    repo := &mockRepo{users: make(map[int]*User)}
    emailer := &mockEmailSender{}
    service := NewUserService(repo, emailer)

    user, err := service.Register(context.Background(), RegisterInput{
        Email: "fatima@example.com",
        Name:  "Fatima",
    })

    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.Email != "fatima@example.com" {
        t.Errorf("email = %q, want %q", user.Email, "fatima@example.com")
    }

    // Verify welcome email was sent
    if len(emailer.sent) != 1 {
        t.Fatalf("expected 1 email sent, got %d", len(emailer.sent))
    }
    if emailer.sent[0].To != "fatima@example.com" {
        t.Errorf("email to = %q, want %q", emailer.sent[0].To, "fatima@example.com")
    }
}
```

## Testcontainers দিয়ে Integration Test

mock নয়, আসল database-এর বিরুদ্ধে test করুন:

```go
import (
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func setupTestDB(t *testing.T) *sql.DB {
    t.Helper()

    ctx := context.Background()

    pgContainer, err := postgres.Run(ctx,
        "postgres:16-alpine",
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2).
                WithStartupTimeout(5*time.Second),
        ),
    )
    if err != nil {
        t.Fatalf("starting postgres container: %v", err)
    }

    t.Cleanup(func() {
        pgContainer.Terminate(ctx)
    })

    connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
    if err != nil {
        t.Fatalf("getting connection string: %v", err)
    }

    db, err := sql.Open("postgres", connStr)
    if err != nil {
        t.Fatalf("connecting to database: %v", err)
    }

    // Run migrations
    runMigrations(db)

    return db
}

func TestUserRepository_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }

    db := setupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    // Test Create
    user := &User{Email: "test@example.com", Name: "Test User"}
    err := repo.Create(ctx, user)
    if err != nil {
        t.Fatalf("create user: %v", err)
    }
    if user.ID == 0 {
        t.Error("expected user ID to be set")
    }

    // Test GetByID
    found, err := repo.GetByID(ctx, user.ID)
    if err != nil {
        t.Fatalf("get user: %v", err)
    }
    if found.Email != "test@example.com" {
        t.Errorf("email = %q, want %q", found.Email, "test@example.com")
    }
}
```

```bash
# Run only unit tests (fast)
go test -short ./...

# Run all tests including integration
go test ./...
```

## HTTP Handler Testing

```go
func TestBookHandler_Create(t *testing.T) {
    tests := []struct {
        name       string
        body       string
        wantStatus int
        wantError  string
    }{
        {
            name:       "valid book",
            body:       `{"title":"Go in Action","author":"William Kennedy","price":29.99}`,
            wantStatus: http.StatusCreated,
        },
        {
            name:       "missing title",
            body:       `{"author":"William Kennedy","price":29.99}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantError:  "title is required",
        },
        {
            name:       "invalid JSON",
            body:       `{invalid`,
            wantStatus: http.StatusBadRequest,
            wantError:  "invalid JSON",
        },
        {
            name:       "negative price",
            body:       `{"title":"Go","author":"Author","price":-5}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantError:  "price must be non-negative",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup
            service := newMockBookService()
            handler := NewBookHandler(service)

            req := httptest.NewRequest("POST", "/api/books", strings.NewReader(tt.body))
            req.Header.Set("Content-Type", "application/json")
            rec := httptest.NewRecorder()

            // Execute
            handler.Create(rec, req)

            // Assert status
            if rec.Code != tt.wantStatus {
                t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
            }

            // Assert error message if expected
            if tt.wantError != "" {
                body := rec.Body.String()
                if !strings.Contains(body, tt.wantError) {
                    t.Errorf("body = %s, want to contain %q", body, tt.wantError)
                }
            }
        })
    }
}
```

## Golden File Testing

output-কে সেভ করা "golden" file-এর সাথে তুলনা করুন — জটিল output-এর জন্য দারুণ:

```go
var update = flag.Bool("update", false, "update golden files")

func TestGenerateReport(t *testing.T) {
    report := generateReport(testData)
    output, _ := json.MarshalIndent(report, "", "  ")

    goldenFile := filepath.Join("testdata", t.Name()+".golden")

    if *update {
        os.MkdirAll("testdata", 0755)
        os.WriteFile(goldenFile, output, 0644)
        return
    }

    expected, err := os.ReadFile(goldenFile)
    if err != nil {
        t.Fatalf("reading golden file: %v (run with -update to create)", err)
    }

    if !bytes.Equal(output, expected) {
        t.Errorf("output doesn't match golden file.\nGot:\n%s\nWant:\n%s", output, expected)
    }
}
```

```bash
# Generate/update golden files
go test -run TestGenerateReport -update ./...

# Verify against golden files
go test -run TestGenerateReport ./...
```

## Test Fixture

আবার ব্যবহারযোগ্য test data:

```go
// internal/testutil/fixtures.go
package testutil

func NewTestUser(overrides ...func(*User)) *User {
    user := &User{
        ID:        1,
        Email:     "test@example.com",
        Name:      "Test User",
        Role:      "user",
        CreatedAt: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
    }
    for _, fn := range overrides {
        fn(user)
    }
    return user
}

// Usage in tests
user := testutil.NewTestUser()
admin := testutil.NewTestUser(func(u *User) {
    u.Role = "admin"
    u.Email = "admin@example.com"
})
```

## Concurrent Code Testing

```go
func TestSafeCache_Concurrent(t *testing.T) {
    cache := NewSafeCache()

    var wg sync.WaitGroup

    // 100 goroutines writing
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            cache.Set(fmt.Sprintf("key-%d", i), fmt.Sprintf("val-%d", i))
        }()
    }

    // 100 goroutines reading
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            cache.Get(fmt.Sprintf("key-%d", i))
        }()
    }

    wg.Wait()

    // If we get here without panic or race detector warning, the cache is safe
}
```

```bash
# Always run with race detector
go test -race ./...
```

## Test Organization

```
internal/
├── service/
│   ├── user.go
│   ├── user_test.go          # Unit tests (same package)
│   └── user_integration_test.go  # Integration tests
├── handler/
│   ├── user.go
│   └── user_test.go
└── testutil/                 # Shared test helpers
    ├── fixtures.go
    ├── db.go                 # setupTestDB()
    └── assert.go             # Custom assertions
```

## মূল কথা

1. **interface-এর উপর নির্ভর করুন** — mock implementation লেখা খুবই সহজ
2. **Table-driven test** সবচেয়ে কম code-এ ব্যাপক coverage-এর জন্য
3. **Testcontainers** আসল database-এর বিরুদ্ধে integration test-এর জন্য — DB mock করার দরকার নেই
4. **`testing.Short()`** দ্রুত feedback loop-এ slow integration test skip করার জন্য
5. **Golden file** জটিল output তুলনার জন্য — `-update` flag দিয়ে update করুন
6. **সবসময় `-race` দিয়ে চালান** — data race হলো bug, warning নয়
7. **functional option সহ test fixture** — `NewTestUser(func(u *User) { u.Role = "admin" })`
