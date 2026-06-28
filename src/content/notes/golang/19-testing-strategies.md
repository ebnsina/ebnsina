---
title: 'Testing Strategies'
subtitle: 'Unit tests, integration tests, test fixtures, mocking, and testcontainers — testing that catches real bugs, not just checkbox coverage.'
chapter: 19
level: 'advanced'
readingTime: '22 min'
topics: ['testing', 'integration tests', 'mocking', 'testcontainers', 'fixtures', 'golden files']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Testing Pyramid in Go

```
         /  E2E  \          Few — slow, brittle, but validates everything
        /----------\
       / Integration \      Some — tests with real DB, Redis, APIs
      /----------------\
     /   Unit Tests      \  Many — fast, isolated, test logic
    /______________________\
```

<Callout type="info">

**Real-World Analogy**

**Unit tests** = checking each ingredient tastes right. **Integration tests** = cooking a dish and tasting it. **E2E tests** = having a customer order, eat, and pay — testing the full restaurant experience. You need all three, but most of your tests should be unit tests (fast and cheap).

</Callout>

## Unit Testing with Interfaces

The key to testable Go code: depend on interfaces, not implementations.

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

## Integration Tests with Testcontainers

Test against real databases, not mocks:

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

Compare output against saved "golden" files — great for complex output:

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

## Test Fixtures

Reusable test data:

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

## Testing Concurrent Code

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

## Key Takeaways

1. **Depend on interfaces** — mock implementations are trivial to write
2. **Table-driven tests** for comprehensive coverage with minimal code
3. **Testcontainers** for integration tests against real databases — no mocking the DB
4. **`testing.Short()`** to skip slow integration tests in fast feedback loops
5. **Golden files** for complex output comparison — update with `-update` flag
6. **Always run `-race`** — data races are bugs, not warnings
7. **Test fixtures with functional options** — `NewTestUser(func(u *User) { u.Role = "admin" })`
