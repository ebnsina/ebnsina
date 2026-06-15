---
title: "Client-Server Architecture"
subtitle: "Build a real HTTP server that handles JSON API requests with proper routing, parsing, and error handling."
chapter: 1
level: "beginner"
readingTime: "15 min"
topics: ["HTTP", "request routing", "JSON", "error handling"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## What is Client-Server Architecture?

Every web application you've ever used follows this pattern: a **client** (browser, mobile app, CLI) sends a request to a **server**, which processes it and sends back a response. This is the most fundamental building block of distributed systems.

Think of it like a restaurant. The customer (client) places an order (request) with the waiter (HTTP protocol), who takes it to the kitchen (server). The kitchen processes the order and sends back the food (response).

<Diagram title="Client-Server Request Flow">
  <div class="diagram-row">
    <div class="box box-client">Browser<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Client</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-lb">HTTP<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Protocol</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">API Server<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Process & Respond</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-db">Database<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Storage</span></div>
  </div>
</Diagram>

## Real-World Analogy

<Callout type="info">

**Real-World Analogy**

Like ordering at a restaurant — you (client) tell the waiter your order (request), the kitchen (server) prepares it, and the waiter brings back your food (response).

</Callout>

When you open twitter.com, your browser sends an HTTP GET request to Twitter's servers. The server authenticates you, queries databases for your timeline, assembles the response, and sends back JSON data. Your browser renders it. Every single interaction — liking a tweet, posting, scrolling — is a client-server request/response cycle.

## Building a Production HTTP Server

Here's a complete HTTP server with JSON API routing, request validation, structured error handling, and graceful shutdown. This is production-ready code — not a tutorial snippet.

<CodeTabs tsFile="server.ts" goFile="server.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";

// --- Types ---
interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// --- In-memory store (replace with DB in production) ---
const todos = new Map<string, Todo>();
let nextId = 1;

// --- Helpers ---
function jsonResponse<T>(
  res: http.ServerResponse,
  statusCode: number,
  body: ApiResponse<T>
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "X-Request-Id": crypto.randomUUID(),
  });
  res.end(JSON.stringify(body));
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024; // 1MB limit

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

// --- Route handlers ---
function handleListTodos(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const items = Array.from(todos.values());
  jsonResponse(res, 200, { data: items, status: 200 });
}

function handleGetTodo(
  res: http.ServerResponse,
  id: string
): void {
  const todo = todos.get(id);
  if (!todo) {
    jsonResponse(res, 404, { error: "Todo not found", status: 404 });
    return;
  }
  jsonResponse(res, 200, { data: todo, status: 200 });
}

async function handleCreateTodo(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = (await parseBody(req)) as { title?: string } | null;

  if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    jsonResponse(res, 400, {
      error: "title is required and must be a non-empty string",
      status: 400,
    });
    return;
  }

  const todo: Todo = {
    id: String(nextId++),
    title: body.title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };

  todos.set(todo.id, todo);
  jsonResponse(res, 201, { data: todo, status: 201 });
}

async function handleUpdateTodo(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string
): Promise<void> {
  const existing = todos.get(id);
  if (!existing) {
    jsonResponse(res, 404, { error: "Todo not found", status: 404 });
    return;
  }

  const body = (await parseBody(req)) as {
    title?: string;
    completed?: boolean;
  } | null;

  if (body?.title !== undefined) existing.title = body.title.trim();
  if (body?.completed !== undefined) existing.completed = body.completed;

  jsonResponse(res, 200, { data: existing, status: 200 });
}

function handleDeleteTodo(
  res: http.ServerResponse,
  id: string
): void {
  if (!todos.delete(id)) {
    jsonResponse(res, 404, { error: "Todo not found", status: 404 });
    return;
  }
  jsonResponse(res, 204, { status: 204 });
}

// --- Router ---
async function router(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || "GET";

  // Simple pattern matching
  const todoMatch = path.match(/^\/api\/todos\/([a-zA-Z0-9]+)$/);

  try {
    if (path === "/api/todos" && method === "GET") {
      return handleListTodos(req, res);
    }
    if (path === "/api/todos" && method === "POST") {
      return await handleCreateTodo(req, res);
    }
    if (todoMatch && method === "GET") {
      return handleGetTodo(res, todoMatch[1]);
    }
    if (todoMatch && method === "PUT") {
      return await handleUpdateTodo(req, res, todoMatch[1]);
    }
    if (todoMatch && method === "DELETE") {
      return handleDeleteTodo(res, todoMatch[1]);
    }

    jsonResponse(res, 404, { error: "Not found", status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error(`[ERROR] ${method} ${path}:`, err);
    jsonResponse(res, 500, { error: message, status: 500 });
  }
}

// --- Server with graceful shutdown ---
const PORT = parseInt(process.env.PORT || "3000", 10);
const server = http.createServer(router);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("Server closed. Exiting.");
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// --- Types ---
type Todo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
	CreatedAt string `json:"createdAt"`
}

type ApiResponse struct {
	Data   interface{} `json:"data,omitempty"`
	Error  string      `json:"error,omitempty"`
	Status int         `json:"status"`
}

// --- In-memory store ---
type TodoStore struct {
	mu     sync.RWMutex
	todos  map[string]Todo
	nextID atomic.Int64
}

func NewTodoStore() *TodoStore {
	s := &TodoStore{todos: make(map[string]Todo)}
	s.nextID.Store(1)
	return s
}

func (s *TodoStore) List() []Todo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]Todo, 0, len(s.todos))
	for _, t := range s.todos {
		items = append(items, t)
	}
	return items
}

func (s *TodoStore) Get(id string) (Todo, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.todos[id]
	return t, ok
}

func (s *TodoStore) Create(title string) Todo {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := fmt.Sprintf("%d", s.nextID.Add(1)-1)
	t := Todo{
		ID:        id,
		Title:     title,
		Completed: false,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	s.todos[id] = t
	return t
}

func (s *TodoStore) Update(id string, title *string, completed *bool) (Todo, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.todos[id]
	if !ok {
		return Todo{}, false
	}
	if title != nil {
		t.Title = *title
	}
	if completed != nil {
		t.Completed = *completed
	}
	s.todos[id] = t
	return t, true
}

func (s *TodoStore) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.todos[id]
	if ok {
		delete(s.todos, id)
	}
	return ok
}

// --- Helpers ---
func writeJSON(w http.ResponseWriter, statusCode int, resp ApiResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}

// --- Handlers ---
type TodoHandler struct {
	store *TodoStore
}

func (h *TodoHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/todos")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.list(w, r)
	case path == "" && r.Method == http.MethodPost:
		h.create(w, r)
	case path != "" && r.Method == http.MethodGet:
		h.get(w, r, path)
	case path != "" && r.Method == http.MethodPut:
		h.update(w, r, path)
	case path != "" && r.Method == http.MethodDelete:
		h.delete(w, r, path)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, ApiResponse{
			Error: "Method not allowed", Status: http.StatusMethodNotAllowed,
		})
	}
}

func (h *TodoHandler) list(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, ApiResponse{Data: h.store.List(), Status: 200})
}

func (h *TodoHandler) get(w http.ResponseWriter, _ *http.Request, id string) {
	todo, ok := h.store.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, ApiResponse{Error: "Todo not found", Status: 404})
		return
	}
	writeJSON(w, http.StatusOK, ApiResponse{Data: todo, Status: 200})
}

func (h *TodoHandler) create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, ApiResponse{Error: "Invalid JSON", Status: 400})
		return
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		writeJSON(w, http.StatusBadRequest, ApiResponse{
			Error: "title is required and must be non-empty", Status: 400,
		})
		return
	}

	todo := h.store.Create(title)
	writeJSON(w, http.StatusCreated, ApiResponse{Data: todo, Status: 201})
}

func (h *TodoHandler) update(w http.ResponseWriter, r *http.Request, id string) {
	var input struct {
		Title     *string `json:"title"`
		Completed *bool   `json:"completed"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, ApiResponse{Error: "Invalid JSON", Status: 400})
		return
	}

	todo, ok := h.store.Update(id, input.Title, input.Completed)
	if !ok {
		writeJSON(w, http.StatusNotFound, ApiResponse{Error: "Todo not found", Status: 404})
		return
	}
	writeJSON(w, http.StatusOK, ApiResponse{Data: todo, Status: 200})
}

func (h *TodoHandler) delete(w http.ResponseWriter, _ *http.Request, id string) {
	if !h.store.Delete(id) {
		writeJSON(w, http.StatusNotFound, ApiResponse{Error: "Todo not found", Status: 404})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Main with graceful shutdown ---
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	store := NewTodoStore()
	handler := &TodoHandler{store: store}

	mux := http.NewServeMux()
	mux.Handle("/api/todos", handler)
	mux.Handle("/api/todos/", handler)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server listening on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("%s received. Shutting down gracefully...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Forced shutdown: %v", err)
	}
	log.Println("Server closed. Exiting.")
}
```

</div>
</CodeTabs>

## What Makes This Production-Ready

- **Request body size limits** — prevents memory exhaustion attacks (1MB cap)
- **Graceful shutdown** — handles SIGTERM/SIGINT, drains in-flight requests before exiting
- **Structured error responses** — consistent JSON error format for clients
- **Input validation** — rejects malformed or missing data with clear messages
- **Timeout configuration** (Go) — read/write/idle timeouts prevent slow-client attacks
- **Thread safety** (Go) — `sync.RWMutex` protects concurrent map access

<div class="takeaways">

### Key Takeaways

- Client-server is a request/response model — the client initiates, the server responds
- Always validate input at the server boundary — never trust client data
- Graceful shutdown prevents dropped requests during deployments
- Use structured error responses so clients can programmatically handle errors
- Set timeouts and body size limits to protect against abuse

</div>

<div class="when-to-use">

### Real-World Usage

- **Every web company** uses this pattern — it's the foundation of all web services
- **Stripe** handles millions of API requests per second using this exact request/response model
- **GitHub's API** follows these same patterns: JSON responses, proper HTTP status codes, request validation
- When your traffic grows beyond what one server can handle, you'll add a load balancer in front (Chapter 5)

</div>

