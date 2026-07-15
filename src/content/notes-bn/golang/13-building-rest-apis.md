---
title: 'REST API বানানো'
subtitle: 'শূন্য থেকে একটা সম্পূর্ণ, production-grade REST API — routing, validation, error response, আর বাস্তব কোম্পানিতে ব্যবহৃত project structure।'
chapter: 13
level: 'intermediate'
readingTime: '25 মিনিট'
topics: ['REST API', 'HTTP', 'routing', 'validation', 'project structure', 'CRUD']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

রহিম নতুন একটা সরকারি সেবাকেন্দ্র চালু করছে। সামনে একটা ফ্রন্ট ডেস্ক, আর পেছনে কয়েকটা আলাদা স্পেশালিস্ট জানালা — একটা জন্মনিবন্ধনের, একটা ট্রেড লাইসেন্সের, একটা নাগরিক সনদের। ভিজিটর এসে ঢুকলেই প্রথমে রিসেপশনিস্ট ফাতেমার কাছে যায়। ফাতেমা প্রত্যেকের হাতের স্লিপটা দেখে — কোন সেবা লাগবে আর সেটা নতুন করা, দেখা, নাকি বাতিল করা — আর সেই অনুযায়ী তাকে ঠিক জানালাটার দিকে পাঠিয়ে দেয়। ফাতেমা নিজে কোনো কাগজ বানায় না, সে শুধু বিলি-বণ্টন করে।

প্রতিটা জানালার পেছনে আলাদা লোক বসা, একেকজন একেক কাজে দক্ষ। জন্মনিবন্ধনের জানালার লোকটা স্লিপের তথ্য পড়ে, নাম-তারিখ ঠিক আছে কিনা যাচাই করে, কাজটা সেরে তারপর একটা বাঁধা-ধরা ছকের ফর্মে উত্তর লিখে ভিজিটরের হাতে ধরিয়ে দেয়। প্রতিটা জানালা একই ছকের ফর্ম ব্যবহার করে, তাই ভিজিটর যে জানালাতেই যাক, উত্তরটা একই চেনা ফরম্যাটে পায়। ভুল স্লিপ এলে জানালার লোক ওই ফর্মেই "দুঃখিত, তথ্য ঠিক নেই" লিখে ফেরত দেয়।

এই পুরো ডেস্কটাই আসলে একটা **REST API**। কেন্দ্রের দরজা খোলা রাখা মানে **HTTP server** চালু করা; রিসেপশনিস্ট ফাতেমা হলো **router**, যে প্রতিটা **request**-এর URL path আর method (GET/POST/DELETE) দেখে ঠিক জায়গায় পাঠায়; প্রতিটা স্পেশালিস্ট জানালা হলো এক-একটা **route**-এর **handler**, যে ইনপুট পড়ে, যাচাই করে, কাজ সারে; আর সেই বাঁধা-ধরা ছকের ফর্মটাই হলো সবার জন্য একই আকৃতির **JSON response**। বাস্তবে Go-তে ঠিক এভাবেই `mux`-এ route বসিয়ে, প্রতিটা path-কে একটা handler-এ ম্যাপ করে, শেষে JSON ফেরত দিয়ে একটা API দাঁড় করানো হয় — ঠিক নিচের bookstore উদাহরণটার মতো।

## Production API Structure

বাস্তব Go দলগুলো কীভাবে API project সাজায় তা এখানে দেওয়া হলো। খেলনা নয় — Uber, Stripe, আর Cloudflare-এর মতো কোম্পানিতে ব্যবহৃত আসল layout:

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

**বাস্তব জীবনের উপমা**

এটাই রেস্তোরাঁ মডেল। **Handler** = ওয়েটার (request নেয়, response দেয়)। **Service** = রান্নাঘর (business logic, যেখানে আসল কাজ হয়)। **Repository** = ভাঁড়ার ঘর (data সংরক্ষণ আর উদ্ধার)। ওয়েটার কখনো রাঁধে না, রান্নাঘর কখনো কাস্টমারের সাথে কথা বলে না, আর ভাঁড়ার ঘর শুধু উপকরণ জমিয়ে রাখে।

</Callout>

## Domain Model

আপনার core type দিয়ে শুরু করুন:

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

কখনো user input-কে বিশ্বাস করবেন না:

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

## Response Helper

সব endpoint জুড়ে সামঞ্জস্যপূর্ণ API response:

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

## HTTP Handler

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

**service layer একটা interface-এর উপর নির্ভর করে (`BookRepository`), কোনো concrete implementation-এর উপর নয়।** এর মানে আপনি কোনো business logic না বদলে PostgreSQL-কে MySQL দিয়ে বদলাতে পারেন, বা test-এ mock ব্যবহার করতে পারেন। এটাই Go-এর dependency injection সংস্করণ — কোনো framework লাগে না।

</Callout>

## সব একসাথে জোড়া দেওয়া

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

## মূল শিক্ষা

1. **handler, service, আর repository আলাদা রাখুন** — প্রতিটা layer-এর একটা করে কাজ
2. **handler layer-এ input validate করুন** — কখনো user data-কে বিশ্বাস করবেন না
3. **সামঞ্জস্যপূর্ণ API response দিন** — success, error, আর validation failure-এর জন্য একই আকৃতি
4. **service interface-এর উপর নির্ভর করে** — testing আর implementation বদলানো সহজ হয়
5. **Go 1.22+ routing ব্যবহার করুন** — `mux.HandleFunc("GET /api/books/{id}", handler)`-এ কোনো framework লাগে না
6. **`main()`-এ dependency জোড়া দিন** — explicit, কোনো জাদু নেই, বোঝা সহজ
