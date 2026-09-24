---
title: 'ক্লায়েন্ট-সার্ভার আর্কিটেকচার'
subtitle: 'একটি রিয়েল HTTP সার্ভার বানান যা সঠিক রাউটিং, পার্সিং আর এরর হ্যান্ডলিং সহ JSON API রিকোয়েস্ট হ্যান্ডল করে।'
chapter: 1
level: 'beginner'
readingTime: '15 মিনিট'
topics: ['HTTP', 'request routing', 'JSON', 'error handling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি একটা রেস্টুরেন্টে ঢুকে টেবিলে বসল। সে নিজে কিন্তু কিচেনে গিয়ে রান্না করতে যায় না — খাবার কীভাবে বানানো হচ্ছে সেটা নিয়েও তার মাথাব্যথা নেই। সে শুধু ওয়েটার সিনাকে ডেকে বলল, "একটা কাচ্চি বিরিয়ানি দেন।" সিনা অর্ডারটা লিখে নিয়ে কিচেনে গিয়ে শেফ ফাতিমাকে দিয়ে এল। ফাতিমা কিচেনে বসে বিরিয়ানিটা রান্না করল, প্লেটে সাজাল, আর সিনার হাতে তুলে দিল। সিনা প্লেটটা নিয়ে খোয়ারিজমির টেবিলে পৌঁছে দিল।

মজার ব্যাপার হলো, খোয়ারিজমি আর ফাতিমা কেউ কারো সাথে সরাসরি কথা বলল না — সব যাওয়া-আসা হলো সিনার মাধ্যমে। খোয়ারিজমি শুধু জানে কী চাইতে হবে; ফাতিমা শুধু জানে কীভাবে বানাতে হবে। দুজনের কাজ আলাদা, আর সিনা মাঝখানে থেকে অর্ডার আর প্লেট এদিক-ওদিক করে দিল।

এই গল্পটাই আসলে **client-server আর্কিটেকচার**। খোয়ারিজমি হলো client — সে request (অর্ডার) পাঠায় কিন্তু নিজে কাজটা করে না। ফাতিমার কিচেন হলো server — সে request প্রসেস করে response (খাবার) ফেরত দেয়। আর ওয়েটার সিনা হলো network, যে request আর response দুই দিকেই বয়ে নিয়ে যায়। এই আলাদা-আলাদা roles-এর কারণেই আপনার ব্রাউজার (client) জানে না Facebook-এর server ভেতরে কীভাবে ডেটা খোঁজে — সে শুধু request পাঠায় আর response পায়।

## ক্লায়েন্ট-সার্ভার আর্কিটেকচার কী?

আপনি যত ওয়েব অ্যাপ্লিকেশন ব্যবহার করেছেন, সবগুলোই এই প্যাটার্ন মেনে চলে: একটি **ক্লায়েন্ট** (ব্রাউজার, মোবাইল অ্যাপ, CLI) একটি **সার্ভার**-এ রিকোয়েস্ট পাঠায়, সার্ভার সেটা প্রসেস করে রেসপন্স ফেরত পাঠায়। এটাই ডিস্ট্রিবিউটেড সিস্টেমের সবচেয়ে মৌলিক বিল্ডিং ব্লক।

এটাকে একটা রেস্টুরেন্টের মতো ভাবুন। কাস্টমার (ক্লায়েন্ট) ওয়েটারের (HTTP প্রোটোকল) কাছে অর্ডার (রিকোয়েস্ট) দেয়, ওয়েটার সেটা কিচেনে (সার্ভার) নিয়ে যায়। কিচেন অর্ডারটা প্রসেস করে খাবার (রেসপন্স) ফেরত পাঠায়।

<Mermaid
title="Client-Server Request Flow"
code={`graph LR
  C["Browser<br/>Client"] --> H["HTTP<br/>Protocol"] --> S["API Server<br/>Process & Respond"] --> D["Database<br/>Storage"]`}
/>

## বাস্তব জীবনের উপমা

<Callout type="info">

**বাস্তব জীবনের উপমা**

রেস্টুরেন্টে অর্ডার দেওয়ার মতো — আপনি (ক্লায়েন্ট) ওয়েটারকে আপনার অর্ডার (রিকোয়েস্ট) বলেন, কিচেন (সার্ভার) সেটা বানায়, আর ওয়েটার আপনার খাবার (রেসপন্স) নিয়ে আসে।

</Callout>

আপনি যখন twitter.com খোলেন, তখন আপনার ব্রাউজার Twitter-এর সার্ভারে একটা HTTP GET রিকোয়েস্ট পাঠায়। সার্ভার আপনাকে অথেনটিকেট করে, আপনার টাইমলাইনের জন্য ডেটাবেস কোয়েরি করে, রেসপন্স তৈরি করে, আর JSON ডেটা ফেরত পাঠায়। আপনার ব্রাউজার সেটা রেন্ডার করে। প্রতিটা ইন্টারঅ্যাকশন — একটা টুইট লাইক করা, পোস্ট করা, স্ক্রল করা — একেকটা ক্লায়েন্ট-সার্ভার রিকোয়েস্ট/রেসপন্স সাইকেল।

## একটি প্রোডাকশন HTTP সার্ভার বানানো

এখানে একটি সম্পূর্ণ HTTP সার্ভার আছে — JSON API রাউটিং, রিকোয়েস্ট ভ্যালিডেশন, স্ট্রাকচার্ড এরর হ্যান্ডলিং আর graceful shutdown সহ। এটা প্রোডাকশন-রেডি কোড — কোনো টিউটোরিয়াল স্নিপেট নয়।

<CodeTabs tsFile="server.ts" goFile="server.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';

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
function jsonResponse<T>(res: http.ServerResponse, statusCode: number, body: ApiResponse<T>): void {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json',
		'X-Request-Id': crypto.randomUUID()
	});
	res.end(JSON.stringify(body));
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const MAX_BODY = 1024 * 1024; // 1MB limit

		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error('Request body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});

		req.on('end', () => {
			try {
				const raw = Buffer.concat(chunks).toString('utf-8');
				resolve(raw ? JSON.parse(raw) : null);
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});

		req.on('error', reject);
	});
}

// --- Route handlers ---
function handleListTodos(_req: http.IncomingMessage, res: http.ServerResponse): void {
	const items = Array.from(todos.values());
	jsonResponse(res, 200, { data: items, status: 200 });
}

function handleGetTodo(res: http.ServerResponse, id: string): void {
	const todo = todos.get(id);
	if (!todo) {
		jsonResponse(res, 404, { error: 'Todo not found', status: 404 });
		return;
	}
	jsonResponse(res, 200, { data: todo, status: 200 });
}

async function handleCreateTodo(
	req: http.IncomingMessage,
	res: http.ServerResponse
): Promise<void> {
	const body = (await parseBody(req)) as { title?: string } | null;

	if (!body?.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
		jsonResponse(res, 400, {
			error: 'title is required and must be a non-empty string',
			status: 400
		});
		return;
	}

	const todo: Todo = {
		id: String(nextId++),
		title: body.title.trim(),
		completed: false,
		createdAt: new Date().toISOString()
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
		jsonResponse(res, 404, { error: 'Todo not found', status: 404 });
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

function handleDeleteTodo(res: http.ServerResponse, id: string): void {
	if (!todos.delete(id)) {
		jsonResponse(res, 404, { error: 'Todo not found', status: 404 });
		return;
	}
	jsonResponse(res, 204, { status: 204 });
}

// --- Router ---
async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const path = url.pathname;
	const method = req.method || 'GET';

	// Simple pattern matching
	const todoMatch = path.match(/^\/api\/todos\/([a-zA-Z0-9]+)$/);

	try {
		if (path === '/api/todos' && method === 'GET') {
			return handleListTodos(req, res);
		}
		if (path === '/api/todos' && method === 'POST') {
			return await handleCreateTodo(req, res);
		}
		if (todoMatch && method === 'GET') {
			return handleGetTodo(res, todoMatch[1]);
		}
		if (todoMatch && method === 'PUT') {
			return await handleUpdateTodo(req, res, todoMatch[1]);
		}
		if (todoMatch && method === 'DELETE') {
			return handleDeleteTodo(res, todoMatch[1]);
		}

		jsonResponse(res, 404, { error: 'Not found', status: 404 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal server error';
		console.error(`[ERROR] ${method} ${path}:`, err);
		jsonResponse(res, 500, { error: message, status: 500 });
	}
}

// --- Server with graceful shutdown ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(router);

server.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});

function shutdown(signal: string): void {
	console.log(`\n${signal} received. Shutting down gracefully...`);
	server.close(() => {
		console.log('Server closed. Exiting.');
		process.exit(0);
	});

	// Force exit after 10s
	setTimeout(() => {
		console.error('Forced shutdown after timeout');
		process.exit(1);
	}, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
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

## এটাকে প্রোডাকশন-রেডি বানায় কী কী

- **রিকোয়েস্ট বডির সাইজ লিমিট** — মেমরি নিঃশেষ করে দেওয়ার অ্যাটাক ঠেকায় (1MB সীমা)
- **Graceful shutdown** — SIGTERM/SIGINT হ্যান্ডল করে, বের হওয়ার আগে চলমান রিকোয়েস্টগুলো শেষ করে দেয়
- **স্ট্রাকচার্ড এরর রেসপন্স** — ক্লায়েন্টের জন্য একই রকম JSON এরর ফরম্যাট
- **ইনপুট ভ্যালিডেশন** — ভাঙা বা মিসিং ডেটা স্পষ্ট মেসেজ দিয়ে reject করে
- **টাইমআউট কনফিগারেশন** (Go) — read/write/idle টাইমআউট স্লো-ক্লায়েন্ট অ্যাটাক ঠেকায়
- **Thread safety** (Go) — `sync.RWMutex` কনকারেন্ট map অ্যাক্সেস রক্ষা করে

<div class="takeaways">

### মূল শিক্ষা

- ক্লায়েন্ট-সার্ভার একটা request/response মডেল — ক্লায়েন্ট শুরু করে, সার্ভার রেসপন্স দেয়
- সার্ভার সীমানায় সবসময় ইনপুট ভ্যালিডেট করুন — ক্লায়েন্টের ডেটাকে কখনো বিশ্বাস করবেন না
- Graceful shutdown ডিপ্লয়মেন্টের সময় রিকোয়েস্ট হারিয়ে যাওয়া ঠেকায়
- স্ট্রাকচার্ড এরর রেসপন্স ব্যবহার করুন যাতে ক্লায়েন্ট প্রোগ্রাম্যাটিক্যালি এরর হ্যান্ডল করতে পারে
- অপব্যবহার থেকে বাঁচতে টাইমআউট আর বডি সাইজ লিমিট সেট করুন

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **প্রতিটা ওয়েব কোম্পানি** এই প্যাটার্ন ব্যবহার করে — এটাই সব ওয়েব সার্ভিসের ভিত্তি
- **Stripe** এই একই request/response মডেল ব্যবহার করে প্রতি সেকেন্ডে লাখ লাখ API রিকোয়েস্ট হ্যান্ডল করে
- **GitHub-এর API** এই একই প্যাটার্ন মেনে চলে: JSON রেসপন্স, সঠিক HTTP স্ট্যাটাস কোড, রিকোয়েস্ট ভ্যালিডেশন
- যখন আপনার ট্রাফিক এক সার্ভারের সামর্থ্যের চেয়ে বেশি হয়ে যাবে, তখন সামনে একটা load balancer যোগ করবেন (Chapter 5)

</div>
