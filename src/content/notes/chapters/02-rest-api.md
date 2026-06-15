---
title: "REST API Design"
subtitle: "Design and build a complete REST API with proper HTTP semantics, validation, pagination, and filtering."
chapter: 2
level: "beginner"
readingTime: "20 min"
topics: ["REST", "HTTP methods", "pagination", "validation", "status codes"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## What is REST?

REST (Representational State Transfer) is an architectural style for designing APIs. It maps CRUD operations to HTTP methods and uses URLs to represent resources. The key constraint: every request must contain all information needed to process it — the server stores no client session state.

Think of it like a library catalog system.

<Callout type="info">

**Real-World Analogy**

Like a library catalog — each book (resource) has a unique call number (URL). You can check out (GET), donate (POST), update info (PUT), or remove (DELETE). The catalog doesn't remember you between visits — bring your card each time.

</Callout>

Each book (resource) has a unique call number (URL). You can check books out (GET), add new ones (POST), update information (PUT), or remove them (DELETE). The catalog doesn't remember who you are between visits — you bring your library card (auth token) each time.

<Diagram title="REST Resource Mapping">
  <div class="diagram-row">
    <div class="box box-client">GET /users</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">List users</div>
  </div>
  <div class="diagram-row">
    <div class="box box-client">POST /users</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Create user</div>
  </div>
  <div class="diagram-row">
    <div class="box box-client">GET /users/42</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Get user 42</div>
  </div>
  <div class="diagram-row">
    <div class="box box-client">PUT /users/42</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Update user 42</div>
  </div>
  <div class="diagram-row">
    <div class="box box-client">DELETE /users/42</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Delete user 42</div>
  </div>
</Diagram>

## HTTP Status Codes That Matter

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input, missing required fields |
| 401 | Unauthorized | Missing or invalid auth |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, version conflict |
| 422 | Unprocessable | Valid JSON but fails business rules |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Error | Unhandled server error |

## Complete REST API with Pagination and Filtering

This is a production-grade REST API for a blog platform. It includes cursor-based pagination, field filtering, input validation, and proper error formatting.

<CodeTabs tsFile="api.ts" goFile="api.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// --- Domain Types ---
interface Post {
  id: string;
  slug: string;
  title: string;
  body: string;
  authorId: string;
  tags: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

interface ValidationError {
  field: string;
  message: string;
}

// --- Store ---
const posts = new Map<string, Post>();

// Seed some data
for (let i = 1; i <= 50; i++) {
  const id = crypto.randomUUID();
  posts.set(id, {
    id,
    slug: `post-${i}`,
    title: `Blog Post ${i}`,
    body: `Content of post ${i}. This covers various system design topics.`,
    authorId: `user-${(i % 5) + 1}`,
    tags: i % 2 === 0 ? ["system-design", "backend"] : ["frontend", "react"],
    published: i % 3 !== 0,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - i * 43200000).toISOString(),
  });
}

// --- Validation ---
function validateCreatePost(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== "object") {
    return [{ field: "body", message: "Request body must be a JSON object" }];
  }

  if (!data.title || typeof data.title !== "string" || data.title.trim().length < 3) {
    errors.push({ field: "title", message: "Must be at least 3 characters" });
  }
  if (typeof data.title === "string" && data.title.length > 200) {
    errors.push({ field: "title", message: "Must be at most 200 characters" });
  }
  if (!data.body || typeof data.body !== "string" || data.body.trim().length < 10) {
    errors.push({ field: "body", message: "Must be at least 10 characters" });
  }
  if (!data.authorId || typeof data.authorId !== "string") {
    errors.push({ field: "authorId", message: "Required" });
  }
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push({ field: "tags", message: "Must be an array of strings" });
  }

  // Check slug uniqueness
  if (data.title && typeof data.title === "string") {
    const slug = slugify(data.title);
    const existing = Array.from(posts.values()).find((p) => p.slug === slug);
    if (existing) {
      errors.push({ field: "title", message: "A post with this title already exists" });
    }
  }

  return errors;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- Helpers ---
function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

// --- Handlers ---
function listPosts(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // Parse query params
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const cursor = url.searchParams.get("cursor");
  const tag = url.searchParams.get("tag");
  const authorId = url.searchParams.get("author_id");
  const published = url.searchParams.get("published");
  const fields = url.searchParams.get("fields")?.split(",");

  // Filter
  let items = Array.from(posts.values());

  if (tag) items = items.filter((p) => p.tags.includes(tag));
  if (authorId) items = items.filter((p) => p.authorId === authorId);
  if (published !== null && published !== undefined) {
    items = items.filter((p) => p.published === (published === "true"));
  }

  // Sort by createdAt descending
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = items.length;

  // Cursor-based pagination
  if (cursor) {
    const cursorIndex = items.findIndex((p) => p.id === cursor);
    if (cursorIndex >= 0) {
      items = items.slice(cursorIndex + 1);
    }
  }

  const page = items.slice(0, limit);
  const hasMore = items.length > limit;
  const nextCursor = hasMore ? page[page.length - 1]?.id || null : null;

  // Field selection
  let responseData: unknown[] = page;
  if (fields && fields.length > 0) {
    responseData = page.map((p) => {
      const selected: Record<string, unknown> = {};
      for (const f of fields) {
        if (f in p) selected[f] = (p as Record<string, unknown>)[f];
      }
      return selected;
    });
  }

  const response: PaginatedResponse<unknown> = {
    data: responseData,
    pagination: { cursor: nextCursor, hasMore, total },
  };

  json(res, 200, response);
}

async function createPost(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const errors = validateCreatePost(body);

  if (errors.length > 0) {
    json(res, 422, { errors, status: 422 });
    return;
  }

  const data = body as { title: string; body: string; authorId: string; tags?: string[] };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const post: Post = {
    id,
    slug: slugify(data.title),
    title: data.title.trim(),
    body: data.body.trim(),
    authorId: data.authorId,
    tags: data.tags || [],
    published: false,
    createdAt: now,
    updatedAt: now,
  };

  posts.set(id, post);

  // Return 201 with Location header
  res.writeHead(201, {
    "Content-Type": "application/json",
    Location: `/api/posts/${post.slug}`,
  });
  res.end(JSON.stringify({ data: post, status: 201 }));
}

function getPost(res: http.ServerResponse, identifier: string): void {
  // Support lookup by ID or slug
  const post =
    posts.get(identifier) ||
    Array.from(posts.values()).find((p) => p.slug === identifier);

  if (!post) {
    json(res, 404, { error: "Post not found", status: 404 });
    return;
  }
  json(res, 200, { data: post, status: 200 });
}

async function updatePost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string
): Promise<void> {
  const post = posts.get(id);
  if (!post) {
    json(res, 404, { error: "Post not found", status: 404 });
    return;
  }

  const body = (await parseBody(req)) as Partial<Post>;
  if (body.title) post.title = body.title.trim();
  if (body.body) post.body = body.body.trim();
  if (body.tags) post.tags = body.tags;
  if (body.published !== undefined) post.published = body.published;
  post.updatedAt = new Date().toISOString();

  json(res, 200, { data: post, status: 200 });
}

function deletePost(res: http.ServerResponse, id: string): void {
  if (!posts.delete(id)) {
    json(res, 404, { error: "Post not found", status: 404 });
    return;
  }
  res.writeHead(204);
  res.end();
}

// --- Router ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method!;

  try {
    const match = path.match(/^\/api\/posts\/(.+)$/);

    if (path === "/api/posts" && method === "GET") return listPosts(req, res);
    if (path === "/api/posts" && method === "POST") return await createPost(req, res);
    if (match && method === "GET") return getPost(res, match[1]);
    if (match && method === "PUT") return await updatePost(req, res, match[1]);
    if (match && method === "DELETE") return deletePost(res, match[1]);

    json(res, 404, { error: "Not found", status: 404 });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Internal server error", status: 500 });
  }
});

server.listen(3000, () => console.log("API running on http://localhost:3000"));
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
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// --- Domain Types ---
type Post struct {
	ID        string   `json:"id"`
	Slug      string   `json:"slug"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	AuthorID  string   `json:"authorId"`
	Tags      []string `json:"tags"`
	Published bool     `json:"published"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Pagination Pagination  `json:"pagination"`
}

type Pagination struct {
	Cursor  *string `json:"cursor"`
	HasMore bool    `json:"hasMore"`
	Total   int     `json:"total"`
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// --- Store ---
type PostStore struct {
	mu    sync.RWMutex
	posts map[string]Post
}

func NewPostStore() *PostStore {
	s := &PostStore{posts: make(map[string]Post)}
	// Seed data
	for i := 1; i <= 50; i++ {
		id := uuid.New().String()
		tags := []string{"frontend", "react"}
		if i%2 == 0 {
			tags = []string{"system-design", "backend"}
		}
		s.posts[id] = Post{
			ID:        id,
			Slug:      fmt.Sprintf("post-%d", i),
			Title:     fmt.Sprintf("Blog Post %d", i),
			Body:      fmt.Sprintf("Content of post %d about system design.", i),
			AuthorID:  fmt.Sprintf("user-%d", (i%5)+1),
			Tags:      tags,
			Published: i%3 != 0,
			CreatedAt: time.Now().Add(-time.Duration(i) * 24 * time.Hour).UTC().Format(time.RFC3339),
			UpdatedAt: time.Now().Add(-time.Duration(i) * 12 * time.Hour).UTC().Format(time.RFC3339),
		}
	}
	return s
}

// --- Validation ---
func validateCreatePost(data map[string]interface{}, store *PostStore) []ValidationError {
	var errs []ValidationError

	title, _ := data["title"].(string)
	if len(strings.TrimSpace(title)) < 3 {
		errs = append(errs, ValidationError{Field: "title", Message: "Must be at least 3 characters"})
	}
	if len(title) > 200 {
		errs = append(errs, ValidationError{Field: "title", Message: "Must be at most 200 characters"})
	}

	body, _ := data["body"].(string)
	if len(strings.TrimSpace(body)) < 10 {
		errs = append(errs, ValidationError{Field: "body", Message: "Must be at least 10 characters"})
	}

	authorID, _ := data["authorId"].(string)
	if authorID == "" {
		errs = append(errs, ValidationError{Field: "authorId", Message: "Required"})
	}

	// Check slug uniqueness
	if title != "" {
		slug := slugify(title)
		store.mu.RLock()
		for _, p := range store.posts {
			if p.Slug == slug {
				errs = append(errs, ValidationError{Field: "title", Message: "A post with this title already exists"})
				break
			}
		}
		store.mu.RUnlock()
	}

	return errs
}

var slugRegex = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(text string) string {
	slug := slugRegex.ReplaceAllString(strings.ToLower(text), "-")
	return strings.Trim(slug, "-")
}

// --- Handlers ---
type PostHandler struct {
	store *PostStore
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *PostHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	cursor := q.Get("cursor")
	tag := q.Get("tag")
	authorID := q.Get("author_id")
	published := q.Get("published")

	h.store.mu.RLock()
	items := make([]Post, 0, len(h.store.posts))
	for _, p := range h.store.posts {
		if tag != "" && !contains(p.Tags, tag) {
			continue
		}
		if authorID != "" && p.AuthorID != authorID {
			continue
		}
		if published != "" {
			pub := published == "true"
			if p.Published != pub {
				continue
			}
		}
		items = append(items, p)
	}
	h.store.mu.RUnlock()

	// Sort by createdAt descending
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt > items[j].CreatedAt
	})

	total := len(items)

	// Cursor-based pagination
	if cursor != "" {
		idx := -1
		for i, p := range items {
			if p.ID == cursor {
				idx = i
				break
			}
		}
		if idx >= 0 {
			items = items[idx+1:]
		}
	}

	hasMore := len(items) > limit
	if len(items) > limit {
		items = items[:limit]
	}

	var nextCursor *string
	if hasMore && len(items) > 0 {
		c := items[len(items)-1].ID
		nextCursor = &c
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Data:       items,
		Pagination: Pagination{Cursor: nextCursor, HasMore: hasMore, Total: total},
	})
}

func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	var data map[string]interface{}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&data); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": "Invalid JSON", "status": 400})
		return
	}

	errs := validateCreatePost(data, h.store)
	if len(errs) > 0 {
		writeJSON(w, 422, map[string]interface{}{"errors": errs, "status": 422})
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	title := strings.TrimSpace(data["title"].(string))

	tags := []string{}
	if t, ok := data["tags"].([]interface{}); ok {
		for _, v := range t {
			if s, ok := v.(string); ok {
				tags = append(tags, s)
			}
		}
	}

	post := Post{
		ID:        uuid.New().String(),
		Slug:      slugify(title),
		Title:     title,
		Body:      strings.TrimSpace(data["body"].(string)),
		AuthorID:  data["authorId"].(string),
		Tags:      tags,
		Published: false,
		CreatedAt: now,
		UpdatedAt: now,
	}

	h.store.mu.Lock()
	h.store.posts[post.ID] = post
	h.store.mu.Unlock()

	w.Header().Set("Location", "/api/posts/"+post.Slug)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"data": post, "status": 201})
}

func (h *PostHandler) Get(w http.ResponseWriter, _ *http.Request, identifier string) {
	h.store.mu.RLock()
	defer h.store.mu.RUnlock()

	// Lookup by ID or slug
	if post, ok := h.store.posts[identifier]; ok {
		writeJSON(w, http.StatusOK, map[string]interface{}{"data": post, "status": 200})
		return
	}
	for _, p := range h.store.posts {
		if p.Slug == identifier {
			writeJSON(w, http.StatusOK, map[string]interface{}{"data": p, "status": 200})
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]interface{}{"error": "Post not found", "status": 404})
}

func (h *PostHandler) Delete(w http.ResponseWriter, _ *http.Request, id string) {
	h.store.mu.Lock()
	defer h.store.mu.Unlock()
	if _, ok := h.store.posts[id]; !ok {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"error": "Post not found", "status": 404})
		return
	}
	delete(h.store.posts, id)
	w.WriteHeader(http.StatusNoContent)
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// --- Router ---
func main() {
	store := NewPostStore()
	handler := &PostHandler{store: store}
	postIDPattern := regexp.MustCompile(`^/api/posts/(.+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/posts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handler.List(w, r)
		case http.MethodPost:
			handler.Create(w, r)
		default:
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
		}
	})

	mux.HandleFunc("/api/posts/", func(w http.ResponseWriter, r *http.Request) {
		m := postIDPattern.FindStringSubmatch(r.URL.Path)
		if m == nil {
			writeJSON(w, 404, map[string]string{"error": "Not found"})
			return
		}
		id := m[1]
		switch r.Method {
		case http.MethodGet:
			handler.Get(w, r, id)
		case http.MethodDelete:
			handler.Delete(w, r, id)
		default:
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
		}
	})

	log.Println("API running on http://localhost:3000")
	log.Fatal(http.ListenAndServe(":3000", mux))
}
```

</div>
</CodeTabs>

<Callout type="tip" title="Cursor vs Offset Pagination">

  Offset pagination (`?page=5&limit=20`) breaks when items are inserted or deleted between requests — users see duplicates or miss items. Cursor-based pagination (`?cursor=abc123&limit=20`) uses the last item's ID as a bookmark, making it stable even with concurrent writes. This is why Twitter, Slack, and Facebook all use cursor-based pagination.

</Callout>

<div class="takeaways">

### Key Takeaways

- Use nouns for URLs (`/posts`), not verbs (`/getPosts`) — let HTTP methods convey the action
- Return proper status codes — `201` for created, `422` for validation failures, `204` for deletes
- Cursor-based pagination is more reliable than offset pagination for mutable datasets
- Always validate at the API boundary and return structured error messages with field names
- Support both ID and slug lookups — IDs for internal use, slugs for human-readable URLs

</div>

<div class="when-to-use">

### Real-World Usage

- **GitHub REST API** uses cursor-based pagination with `Link` headers for navigation
- **Stripe** returns structured validation errors with field-level detail, exactly like our implementation
- **Shopify** uses both ID and slug for resource lookups, enabling clean URLs for merchants
- REST works best for CRUD-heavy apps. For real-time or graph-shaped data, consider GraphQL or WebSockets

</div>

