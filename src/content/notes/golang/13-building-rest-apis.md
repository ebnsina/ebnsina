---
title: "Building REST APIs"
subtitle: "A complete, production-grade REST API from scratch — routing, validation, error responses, and the project structure used at real companies."
chapter: 13
level: "intermediate"
readingTime: "25 min"
topics: ["REST API", "HTTP", "routing", "validation", "project structure", "CRUD"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Production API Structure

Here's how real Go teams structure API projects. Not a toy — the actual layout used at companies like Uber, Stripe, and Cloudflare:

```
bookstore/
├── cmd/
│   └── server/
│       └── main.go           # Entry point — wires everything together
├── internal/
│   ├── handler/              # HTTP handlers (transport layer)
│   │   ├── book.go
│   │   ├── middleware.go
│   │   └── response.go       # Shared response helpers
│   ├── service/              # Business logic
│   │   └── book.go
│   ├── repository/           # Database access
│   │   └── book.go
│   └── model/                # Domain types
│       └── book.go
├── go.mod
└── go.sum
```

<Callout type="info">

**Real-World Analogy**

This is the restaurant model. **Handlers** = waiters (take the request, deliver the response). **Service** = kitchen (business logic, where the actual work happens). **Repository** = pantry (data storage and retrieval). The waiter never cooks, the kitchen never talks to customers, and the pantry just stores ingredients.

</Callout>

## Domain Model

Start with your core types:

```go
// internal/model/book.go
package model

import "time"

type Book struct {
    ID          int       `json:"id"`
    Title       string    `json:"title"`
    Author      string    `json:"author"`
    ISBN        string    `json:"isbn"`
    Price       float64   `json:"price"`
    PublishedAt time.Time `json:"published_at"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}

type CreateBookInput struct {
    Title       string  `json:"title"`
    Author      string  `json:"author"`
    ISBN        string  `json:"isbn"`
    Price       float64 `json:"price"`
    PublishedAt string  `json:"published_at"`
}

type UpdateBookInput struct {
    Title  *string  `json:"title,omitempty"`
    Author *string  `json:"author,omitempty"`
    Price  *float64 `json:"price,omitempty"`
}

type ListBooksParams struct {
    Page     int    `json:"page"`
    PageSize int    `json:"page_size"`
    SortBy   string `json:"sort_by"`
    Search   string `json:"search"`
}
```

## Input Validation

Never trust user input:

```go
// internal/model/book.go
func (i CreateBookInput) Validate() map[string]string {
    errors := make(map[string]string)

    if strings.TrimSpace(i.Title) == "" {
        errors["title"] = "title is required"
    } else if len(i.Title) > 200 {
        errors["title"] = "title must be under 200 characters"
    }

    if strings.TrimSpace(i.Author) == "" {
        errors["author"] = "author is required"
    }

    if i.ISBN != "" && !isValidISBN(i.ISBN) {
        errors["isbn"] = "invalid ISBN format"
    }

    if i.Price < 0 {
        errors["price"] = "price must be non-negative"
    }

    return errors
}

func isValidISBN(isbn string) bool {
    cleaned := strings.ReplaceAll(isbn, "-", "")
    return len(cleaned) == 10 || len(cleaned) == 13
}
```

## Response Helpers

Consistent API responses across all endpoints:

```go
// internal/handler/response.go
package handler

import (
    "encoding/json"
    "net/http"
)

type APIResponse struct {
    Data    any            `json:"data,omitempty"`
    Error   string         `json:"error,omitempty"`
    Errors  map[string]string `json:"errors,omitempty"`
    Meta    *Meta          `json:"meta,omitempty"`
}

type Meta struct {
    Page       int `json:"page"`
    PageSize   int `json:"page_size"`
    TotalCount int `json:"total_count"`
    TotalPages int `json:"total_pages"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func respondOK(w http.ResponseWriter, data any) {
    writeJSON(w, http.StatusOK, APIResponse{Data: data})
}

func respondCreated(w http.ResponseWriter, data any) {
    writeJSON(w, http.StatusCreated, APIResponse{Data: data})
}

func respondError(w http.ResponseWriter, status int, message string) {
    writeJSON(w, status, APIResponse{Error: message})
}

func respondValidationError(w http.ResponseWriter, errors map[string]string) {
    writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
        Error:  "validation failed",
        Errors: errors,
    })
}
```

## HTTP Handlers

```go
// internal/handler/book.go
package handler

import (
    "encoding/json"
    "errors"
    "net/http"
    "strconv"

    "github.com/yourname/bookstore/internal/model"
    "github.com/yourname/bookstore/internal/service"
)

type BookHandler struct {
    service *service.BookService
}

func NewBookHandler(s *service.BookService) *BookHandler {
    return &BookHandler{service: s}
}

func (h *BookHandler) RegisterRoutes(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/books", h.List)
    mux.HandleFunc("GET /api/books/{id}", h.GetByID)
    mux.HandleFunc("POST /api/books", h.Create)
    mux.HandleFunc("PATCH /api/books/{id}", h.Update)
    mux.HandleFunc("DELETE /api/books/{id}", h.Delete)
}

func (h *BookHandler) List(w http.ResponseWriter, r *http.Request) {
    params := model.ListBooksParams{
        Page:     queryInt(r, "page", 1),
        PageSize: queryInt(r, "page_size", 20),
        SortBy:   r.URL.Query().Get("sort_by"),
        Search:   r.URL.Query().Get("search"),
    }

    if params.PageSize > 100 {
        params.PageSize = 100
    }

    books, total, err := h.service.List(r.Context(), params)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to list books")
        return
    }

    totalPages := (total + params.PageSize - 1) / params.PageSize
    writeJSON(w, http.StatusOK, APIResponse{
        Data: books,
        Meta: &Meta{
            Page:       params.Page,
            PageSize:   params.PageSize,
            TotalCount: total,
            TotalPages: totalPages,
        },
    })
}

func (h *BookHandler) GetByID(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.Atoi(r.PathValue("id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid book ID")
        return
    }

    book, err := h.service.GetByID(r.Context(), id)
    if errors.Is(err, service.ErrNotFound) {
        respondError(w, http.StatusNotFound, "book not found")
        return
    }
    if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to get book")
        return
    }

    respondOK(w, book)
}

func (h *BookHandler) Create(w http.ResponseWriter, r *http.Request) {
    var input model.CreateBookInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        respondError(w, http.StatusBadRequest, "invalid JSON body")
        return
    }

    if errs := input.Validate(); len(errs) > 0 {
        respondValidationError(w, errs)
        return
    }

    book, err := h.service.Create(r.Context(), input)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to create book")
        return
    }

    respondCreated(w, book)
}

func (h *BookHandler) Update(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.Atoi(r.PathValue("id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid book ID")
        return
    }

    var input model.UpdateBookInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        respondError(w, http.StatusBadRequest, "invalid JSON body")
        return
    }

    book, err := h.service.Update(r.Context(), id, input)
    if errors.Is(err, service.ErrNotFound) {
        respondError(w, http.StatusNotFound, "book not found")
        return
    }
    if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to update book")
        return
    }

    respondOK(w, book)
}

func (h *BookHandler) Delete(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.Atoi(r.PathValue("id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid book ID")
        return
    }

    if err := h.service.Delete(r.Context(), id); errors.Is(err, service.ErrNotFound) {
        respondError(w, http.StatusNotFound, "book not found")
        return
    } else if err != nil {
        respondError(w, http.StatusInternalServerError, "failed to delete book")
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

func queryInt(r *http.Request, key string, defaultVal int) int {
    v := r.URL.Query().Get(key)
    if v == "" {
        return defaultVal
    }
    n, err := strconv.Atoi(v)
    if err != nil {
        return defaultVal
    }
    return n
}
```

## Service Layer (Business Logic)

```go
// internal/service/book.go
package service

import (
    "context"
    "errors"
    "fmt"
    "time"

    "github.com/yourname/bookstore/internal/model"
)

var ErrNotFound = errors.New("not found")

type BookRepository interface {
    List(ctx context.Context, params model.ListBooksParams) ([]*model.Book, int, error)
    GetByID(ctx context.Context, id int) (*model.Book, error)
    Create(ctx context.Context, book *model.Book) error
    Update(ctx context.Context, book *model.Book) error
    Delete(ctx context.Context, id int) error
}

type BookService struct {
    repo BookRepository
}

func NewBookService(repo BookRepository) *BookService {
    return &BookService{repo: repo}
}

func (s *BookService) List(ctx context.Context, params model.ListBooksParams) ([]*model.Book, int, error) {
    return s.repo.List(ctx, params)
}

func (s *BookService) GetByID(ctx context.Context, id int) (*model.Book, error) {
    return s.repo.GetByID(ctx, id)
}

func (s *BookService) Create(ctx context.Context, input model.CreateBookInput) (*model.Book, error) {
    publishedAt, err := time.Parse("2006-01-02", input.PublishedAt)
    if err != nil {
        return nil, fmt.Errorf("invalid published_at date: %w", err)
    }

    book := &model.Book{
        Title:       input.Title,
        Author:      input.Author,
        ISBN:        input.ISBN,
        Price:       input.Price,
        PublishedAt: publishedAt,
        CreatedAt:   time.Now(),
        UpdatedAt:   time.Now(),
    }

    if err := s.repo.Create(ctx, book); err != nil {
        return nil, fmt.Errorf("creating book: %w", err)
    }

    return book, nil
}

func (s *BookService) Update(ctx context.Context, id int, input model.UpdateBookInput) (*model.Book, error) {
    book, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }

    if input.Title != nil {
        book.Title = *input.Title
    }
    if input.Author != nil {
        book.Author = *input.Author
    }
    if input.Price != nil {
        book.Price = *input.Price
    }
    book.UpdatedAt = time.Now()

    if err := s.repo.Update(ctx, book); err != nil {
        return nil, fmt.Errorf("updating book: %w", err)
    }

    return book, nil
}

func (s *BookService) Delete(ctx context.Context, id int) error {
    return s.repo.Delete(ctx, id)
}
```

<Callout type="tip">

**The service layer depends on an interface (`BookRepository`), not a concrete implementation.** This means you can swap PostgreSQL for MySQL, or use a mock in tests, without changing any business logic. This is Go's version of dependency injection — no frameworks needed.

</Callout>

## Wiring It All Together

```go
// cmd/server/main.go
package main

import (
    "database/sql"
    "fmt"
    "log"
    "log/slog"
    "net/http"
    "os"

    _ "github.com/lib/pq"
    "github.com/yourname/bookstore/internal/handler"
    "github.com/yourname/bookstore/internal/repository"
    "github.com/yourname/bookstore/internal/service"
)

func main() {
    // Config
    port := getEnv("PORT", "8080")
    dbURL := getEnv("DATABASE_URL", "postgres://localhost/bookstore?sslmode=disable")

    // Database
    db, err := sql.Open("postgres", dbURL)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
    db.SetMaxOpenConns(25)

    // Wire dependencies
    bookRepo := repository.NewBookRepository(db)
    bookService := service.NewBookService(bookRepo)
    bookHandler := handler.NewBookHandler(bookService)

    // Routes
    mux := http.NewServeMux()
    bookHandler.RegisterRoutes(mux)

    mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })

    // Start
    slog.Info("server starting", "port", port)
    log.Fatal(http.ListenAndServe(fmt.Sprintf(":%s", port), mux))
}
```

## Key Takeaways

1. **Separate handlers, services, and repositories** — each layer has one job
2. **Validate input at the handler layer** — never trust user data
3. **Return consistent API responses** — same shape for success, errors, and validation failures
4. **Services depend on interfaces** — enables testing and swapping implementations
5. **Use Go 1.22+ routing** — `mux.HandleFunc("GET /api/books/{id}", handler)` needs no framework
6. **Wire dependencies in `main()`** — explicit, no magic, easy to understand

