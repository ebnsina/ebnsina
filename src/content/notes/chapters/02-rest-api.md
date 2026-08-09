---
title: 'REST API ডিজাইন'
subtitle: 'সঠিক HTTP semantics, ভ্যালিডেশন, pagination আর filtering সহ একটি সম্পূর্ণ REST API ডিজাইন আর বানান।'
chapter: 2
level: 'beginner'
readingTime: '20 মিনিট'
topics: ['REST', 'HTTP methods', 'pagination', 'validation', 'status codes']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা ভাতের হোটেল, দেয়ালে ঝোলানো একটা ছাপানো মেনু — কী কী পদ আছে, প্রতিটার দাম, সব ফিক্সড। ইবনে সিনা গিয়ে বসল। প্রথমে জানতে চাইল আজ কাচ্চি আছে কিনা, ওয়েটার মেনু দেখিয়ে দিল — এটা নিছক দেখা, কিছু বদলায় না। তারপর ইবনে সিনা এক প্লেট কাচ্চির অর্ডার দিল, ওয়েটার নতুন একটা অর্ডার স্লিপ কাটল। খানিক পরে সে মত বদলে বলল, প্লেটটা দুই থেকে বাড়িয়ে তিন করে দাও — পুরনো অর্ডারটাই সে বদলে দিল, নতুন করে কিছু শুরু হলো না। শেষে ফাতিমা আল-ফিহরি ফোন করে বলল দেরি হবে, তখন ইবনে সিনা একটা অর্ডার একেবারে বাতিল করে দিল।

ওয়েটার প্রতিবার পরিষ্কার জবাব দেয়। খাবার টেবিলে চলে এলে বলে "স্যার, সার্ভ করা হয়েছে"। মেনুতে নেই এমন পদ চাইলে বলে "দুঃখিত, এই আইটেম আমাদের নেই"। আর রান্নাঘরে গ্যাস শেষ বা বাবুর্চি নেই — এমন গোলমাল হলে বলে "ভেতরে একটু সমস্যা, একটু পরে আসুন"। গুরুত্বপূর্ণ ব্যাপার হলো, মেনুটা সবার সামনে টাঙানো — ইবনে সিনা, আল-খোয়ারিজমি, ওয়েটার সবাই জানে কী চাওয়া যায় আর কীভাবে চাইতে হয়। মেনু নিয়ে কারো আলাদা করে তর্ক করতে হয় না।

গল্পটাই আসলে **REST API**। মেনুর পদগুলো হলো resource, আর তার সাথে কথা বলার নিয়মগুলোই হলো standard HTTP verb — পদ দেখা মানে **GET**, নতুন অর্ডার দেওয়া **POST**, অর্ডার বদলানো **PUT/PATCH**, বাতিল করা **DELETE**। ওয়েটারের জবাবগুলোই status code — "সার্ভ করা হয়েছে" মানে **200**, "এই আইটেম নেই" মানে **404**, "ভেতরে সমস্যা" মানে **500**। আর টাঙানো মেনুটাই হলো API contract — সবার মেনে নেওয়া একটা স্থির চুক্তি, যেটা দেখেই মোবাইল অ্যাপ বা ফ্রন্টএন্ড জানে কোন endpoint-এ কী verb পাঠালে কী রেসপন্স পাবে।

## REST কী?

REST (Representational State Transfer) হলো API ডিজাইনের একটা আর্কিটেকচারাল স্টাইল। এটা CRUD অপারেশনগুলোকে HTTP মেথডের সাথে ম্যাপ করে আর রিসোর্স রিপ্রেজেন্ট করতে URL ব্যবহার করে। মূল শর্ত: প্রতিটা রিকোয়েস্টে সেটা প্রসেস করার জন্য প্রয়োজনীয় সব তথ্য থাকতে হবে — সার্ভার কোনো ক্লায়েন্ট সেশন স্টেট রাখে না।

এটাকে একটা লাইব্রেরি ক্যাটালগ সিস্টেমের মতো ভাবুন।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা লাইব্রেরি ক্যাটালগের মতো — প্রতিটা বই (রিসোর্স)-এর একটা ইউনিক কল নাম্বার (URL) আছে। আপনি বই নিতে পারেন (GET), দান করতে পারেন (POST), তথ্য আপডেট করতে পারেন (PUT), বা সরাতে পারেন (DELETE)। ক্যাটালগ দুই ভিজিটের মাঝে আপনাকে মনে রাখে না — প্রতিবার আপনার কার্ড নিয়ে আসুন।

</Callout>

প্রতিটা বই (রিসোর্স)-এর একটা ইউনিক কল নাম্বার (URL) আছে। আপনি বই নিতে পারেন (GET), নতুন যোগ করতে পারেন (POST), তথ্য আপডেট করতে পারেন (PUT), বা সরাতে পারেন (DELETE)। ক্যাটালগ দুই ভিজিটের মাঝে আপনি কে সেটা মনে রাখে না — প্রতিবার আপনার লাইব্রেরি কার্ড (auth token) নিয়ে আসেন।

<Mermaid
title="REST Resource Mapping"
code={`graph LR
  A["GET /users"] --> A2["List users"]
  B["POST /users"] --> B2["Create user"]
  C["GET /users/42"] --> C2["Get user 42"]
  D["PUT /users/42"] --> D2["Update user 42"]
  E["DELETE /users/42"] --> E2["Delete user 42"]`}
/>

## যে HTTP স্ট্যাটাস কোডগুলো গুরুত্বপূর্ণ

| কোড | অর্থ              | কখন ব্যবহার করবেন                           |
| --- | ----------------- | ------------------------------------------- |
| 200 | OK                | সফল GET, PUT                                |
| 201 | Created           | সফল POST যা একটা রিসোর্স তৈরি করে           |
| 204 | No Content        | সফল DELETE                                  |
| 400 | Bad Request       | ভুল ইনপুট, প্রয়োজনীয় ফিল্ড মিসিং          |
| 401 | Unauthorized      | auth মিসিং বা ভুল                           |
| 403 | Forbidden         | auth ঠিক আছে কিন্তু পর্যাপ্ত permission নেই |
| 404 | Not Found         | রিসোর্স নেই                                 |
| 409 | Conflict          | ডুপ্লিকেট রিসোর্স, ভার্সন কনফ্লিক্ট         |
| 422 | Unprocessable     | JSON ঠিক আছে কিন্তু বিজনেস রুল ফেল করে      |
| 429 | Too Many Requests | রেট লিমিট করা হয়েছে                        |
| 500 | Internal Error    | হ্যান্ডল না করা সার্ভার এরর                 |

## Pagination আর Filtering সহ সম্পূর্ণ REST API

এটা একটা ব্লগ প্ল্যাটফর্মের জন্য প্রোডাকশন-গ্রেড REST API। এতে cursor-based pagination, field filtering, ইনপুট ভ্যালিডেশন আর সঠিক এরর ফরম্যাটিং আছে।

<CodeTabs tsFile="api.ts" goFile="api.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

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
		tags: i % 2 === 0 ? ['system-design', 'backend'] : ['frontend', 'react'],
		published: i % 3 !== 0,
		createdAt: new Date(Date.now() - i * 86400000).toISOString(),
		updatedAt: new Date(Date.now() - i * 43200000).toISOString()
	});
}

// --- Validation ---
function validateCreatePost(body: unknown): ValidationError[] {
	const errors: ValidationError[] = [];
	const data = body as Record<string, unknown>;

	if (!data || typeof data !== 'object') {
		return [{ field: 'body', message: 'Request body must be a JSON object' }];
	}

	if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 3) {
		errors.push({ field: 'title', message: 'Must be at least 3 characters' });
	}
	if (typeof data.title === 'string' && data.title.length > 200) {
		errors.push({ field: 'title', message: 'Must be at most 200 characters' });
	}
	if (!data.body || typeof data.body !== 'string' || data.body.trim().length < 10) {
		errors.push({ field: 'body', message: 'Must be at least 10 characters' });
	}
	if (!data.authorId || typeof data.authorId !== 'string') {
		errors.push({ field: 'authorId', message: 'Required' });
	}
	if (data.tags && !Array.isArray(data.tags)) {
		errors.push({ field: 'tags', message: 'Must be an array of strings' });
	}

	// Check slug uniqueness
	if (data.title && typeof data.title === 'string') {
		const slug = slugify(data.title);
		const existing = Array.from(posts.values()).find((p) => p.slug === slug);
		if (existing) {
			errors.push({ field: 'title', message: 'A post with this title already exists' });
		}
	}

	return errors;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

// --- Helpers ---
function json(res: http.ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
	});
}

// --- Handlers ---
function listPosts(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = new URL(req.url!, `http://${req.headers.host}`);

	// Parse query params
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const cursor = url.searchParams.get('cursor');
	const tag = url.searchParams.get('tag');
	const authorId = url.searchParams.get('author_id');
	const published = url.searchParams.get('published');
	const fields = url.searchParams.get('fields')?.split(',');

	// Filter
	let items = Array.from(posts.values());

	if (tag) items = items.filter((p) => p.tags.includes(tag));
	if (authorId) items = items.filter((p) => p.authorId === authorId);
	if (published !== null && published !== undefined) {
		items = items.filter((p) => p.published === (published === 'true'));
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
		pagination: { cursor: nextCursor, hasMore, total }
	};

	json(res, 200, response);
}

async function createPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
		updatedAt: now
	};

	posts.set(id, post);

	// Return 201 with Location header
	res.writeHead(201, {
		'Content-Type': 'application/json',
		Location: `/api/posts/${post.slug}`
	});
	res.end(JSON.stringify({ data: post, status: 201 }));
}

function getPost(res: http.ServerResponse, identifier: string): void {
	// Support lookup by ID or slug
	const post =
		posts.get(identifier) || Array.from(posts.values()).find((p) => p.slug === identifier);

	if (!post) {
		json(res, 404, { error: 'Post not found', status: 404 });
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
		json(res, 404, { error: 'Post not found', status: 404 });
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
		json(res, 404, { error: 'Post not found', status: 404 });
		return;
	}
	res.writeHead(204);
	res.end();
}

// --- Router ---
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const path = url.pathname;
	const method = req.method!;

	try {
		const match = path.match(/^\/api\/posts\/(.+)$/);

		if (path === '/api/posts' && method === 'GET') return listPosts(req, res);
		if (path === '/api/posts' && method === 'POST') return await createPost(req, res);
		if (match && method === 'GET') return getPost(res, match[1]);
		if (match && method === 'PUT') return await updatePost(req, res, match[1]);
		if (match && method === 'DELETE') return deletePost(res, match[1]);

		json(res, 404, { error: 'Not found', status: 404 });
	} catch (err) {
		console.error(err);
		json(res, 500, { error: 'Internal server error', status: 500 });
	}
});

server.listen(3000, () => console.log('API running on http://localhost:3000'));
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

Offset pagination (`?page=5&limit=20`) ভেঙে পড়ে যখন রিকোয়েস্টের মাঝে আইটেম যোগ বা মুছে ফেলা হয় — ইউজাররা ডুপ্লিকেট দেখে বা আইটেম মিস করে। Cursor-based pagination (`?cursor=abc123&limit=20`) শেষ আইটেমের ID কে একটা বুকমার্ক হিসেবে ব্যবহার করে, ফলে কনকারেন্ট রাইটের সময়েও এটা স্থির থাকে। এই কারণেই Twitter, Slack আর Facebook সবাই cursor-based pagination ব্যবহার করে।

</Callout>

<div class="takeaways">

### মূল শিক্ষা

- URL-এর জন্য noun ব্যবহার করুন (`/posts`), verb নয় (`/getPosts`) — অ্যাকশন বোঝানোর কাজটা HTTP মেথডের হাতে ছেড়ে দিন
- সঠিক স্ট্যাটাস কোড ফেরত দিন — তৈরির জন্য `201`, ভ্যালিডেশন ফেলের জন্য `422`, ডিলিটের জন্য `204`
- পরিবর্তনশীল ডেটাসেটের জন্য cursor-based pagination offset pagination-এর চেয়ে বেশি নির্ভরযোগ্য
- সবসময় API সীমানায় ভ্যালিডেট করুন আর ফিল্ড নাম সহ স্ট্রাকচার্ড এরর মেসেজ ফেরত দিন
- ID আর slug — দুটো দিয়েই lookup সাপোর্ট করুন — ID অভ্যন্তরীণ ব্যবহারের জন্য, slug মানুষের পড়ার উপযোগী URL-এর জন্য

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **GitHub REST API** নেভিগেশনের জন্য `Link` হেডার সহ cursor-based pagination ব্যবহার করে
- **Stripe** ফিল্ড-লেভেল ডিটেইল সহ স্ট্রাকচার্ড ভ্যালিডেশন এরর ফেরত দেয়, ঠিক আমাদের implementation-এর মতো
- **Shopify** রিসোর্স lookup-এর জন্য ID আর slug দুটোই ব্যবহার করে, যা মার্চেন্টদের জন্য পরিষ্কার URL দেয়
- REST CRUD-নির্ভর অ্যাপের জন্য সবচেয়ে ভালো কাজ করে। রিয়েল-টাইম বা graph-আকৃতির ডেটার জন্য GraphQL বা WebSockets বিবেচনা করুন

</div>
