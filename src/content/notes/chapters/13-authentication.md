---
title: "Authentication & Authorization"
subtitle: "Implement JWT-based auth, refresh tokens, RBAC middleware, and secure password hashing from scratch."
chapter: 13
level: "beginner"
readingTime: "20 min"
topics: ["JWT", "bcrypt", "RBAC", "refresh tokens", "middleware"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## Authentication vs Authorization

**Authentication** answers "who are you?" — verifying identity via passwords, tokens, or OAuth. **Authorization** answers "what can you do?" — checking permissions to access resources.

<Callout type="info">

**Real-World Analogy**

Like a gym membership card — you verify your identity once at the front desk (login), get a card (token), and swipe it for access without showing your ID again. Your membership tier (basic/premium) determines what areas you can use (authorization).

</Callout>

<Diagram title="Auth Flow with JWT">
  <div class="diagram-row">
    <div class="box box-client">Client<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">email + password</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Auth Server<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Verify credentials</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-cache">JWT Token<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">access + refresh</span></div>
  </div>
  <div class="arrow-down">v</div>
  <div class="diagram-row">
    <div class="box box-client">Client<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Bearer token</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-lb">Auth Middleware<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Verify + RBAC</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Protected API</div>
  </div>
</Diagram>

## Why JWTs?

Traditional session-based auth stores session data on the server. This requires sticky sessions or shared session storage as you scale. JWTs are **stateless** — the token itself contains the user's identity and permissions. Any server can validate it without hitting a database.

The tradeoff: you can't revoke a JWT before it expires without maintaining a blacklist (which re-introduces server state). The solution: short-lived access tokens (15 min) + long-lived refresh tokens (7 days).

## Complete Auth System

<CodeTabs tsFile="auth.ts" goFile="auth.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// --- Password Hashing (using scrypt — built into Node, no deps) ---
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derived));
    });
  });
}

// --- JWT Implementation (no external deps) ---
interface JWTPayload {
  sub: string;        // user ID
  email: string;
  role: string;
  iat: number;        // issued at
  exp: number;        // expires at
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const ACCESS_TOKEN_TTL = 15 * 60;      // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 3600; // 7 days

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function signJWT(payload: Omit<JWTPayload, "iat" | "exp">, ttl: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(
    JSON.stringify({ ...payload, iat: now, exp: now + ttl })
  );
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token: string): JWTPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null; // invalid signature
  }

  const payload: JWTPayload = JSON.parse(
    Buffer.from(body, "base64url").toString()
  );

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null; // expired
  }

  return payload;
}

// --- User Store (replace with database) ---
interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin" | "editor";
  name: string;
}

const users = new Map<string, User>();
const refreshTokens = new Map<string, { userId: string; expiresAt: number }>();

// --- RBAC (Role-Based Access Control) ---
type Permission = "read:posts" | "write:posts" | "delete:posts" | "manage:users";

const rolePermissions: Record<string, Permission[]> = {
  user:   ["read:posts"],
  editor: ["read:posts", "write:posts"],
  admin:  ["read:posts", "write:posts", "delete:posts", "manage:users"],
};

function hasPermission(role: string, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

// --- Auth Middleware ---
interface AuthenticatedRequest extends http.IncomingMessage {
  user?: JWTPayload;
}

function requireAuth(
  handler: (req: AuthenticatedRequest, res: http.ServerResponse) => void | Promise<void>
) {
  return async (req: AuthenticatedRequest, res: http.ServerResponse) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      json(res, 401, { error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyJWT(token);
    if (!payload) {
      json(res, 401, { error: "Invalid or expired token" });
      return;
    }

    req.user = payload;
    await handler(req, res);
  };
}

function requirePermission(permission: Permission) {
  return (
    handler: (req: AuthenticatedRequest, res: http.ServerResponse) => void | Promise<void>
  ) => {
    return requireAuth(async (req, res) => {
      if (!req.user || !hasPermission(req.user.role, permission)) {
        json(res, 403, { error: "Insufficient permissions" });
        return;
      }
      await handler(req, res);
    });
  };
}

// --- Helpers ---
function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

// --- Route Handlers ---
async function handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const email = body.email as string;
  const password = body.password as string;
  const name = body.name as string;

  if (!email || !password || password.length < 8) {
    json(res, 400, { error: "Email and password (min 8 chars) are required" });
    return;
  }

  // Check existing user
  for (const u of users.values()) {
    if (u.email === email) {
      json(res, 409, { error: "Email already registered" });
      return;
    }
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const user: User = { id, email, passwordHash, role: "user", name: name || "" };
  users.set(id, user);

  const accessToken = signJWT({ sub: id, email, role: user.role }, ACCESS_TOKEN_TTL);
  const refreshToken = crypto.randomBytes(32).toString("hex");

  refreshTokens.set(refreshToken, {
    userId: id,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  });

  json(res, 201, {
    user: { id, email, name, role: user.role },
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

async function handleLogin(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const email = body.email as string;
  const password = body.password as string;

  let user: User | undefined;
  for (const u of users.values()) {
    if (u.email === email) { user = u; break; }
  }

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Use same error message to prevent user enumeration
    json(res, 401, { error: "Invalid email or password" });
    return;
  }

  const accessToken = signJWT(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_TOKEN_TTL
  );
  const refreshToken = crypto.randomBytes(32).toString("hex");

  refreshTokens.set(refreshToken, {
    userId: user.id,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  });

  json(res, 200, {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

async function handleRefresh(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const token = body.refreshToken as string;

  const stored = refreshTokens.get(token);
  if (!stored || stored.expiresAt < Date.now()) {
    json(res, 401, { error: "Invalid or expired refresh token" });
    return;
  }

  // Rotate refresh token (invalidate old one)
  refreshTokens.delete(token);

  const user = users.get(stored.userId);
  if (!user) {
    json(res, 401, { error: "User not found" });
    return;
  }

  const accessToken = signJWT(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_TOKEN_TTL
  );
  const newRefreshToken = crypto.randomBytes(32).toString("hex");

  refreshTokens.set(newRefreshToken, {
    userId: user.id,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  });

  json(res, 200, {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

// --- Protected route examples ---
const handleGetProfile = requireAuth(async (req, res) => {
  const user = users.get(req.user!.sub);
  if (!user) {
    json(res, 404, { error: "User not found" });
    return;
  }
  json(res, 200, {
    id: user.id, email: user.email, name: user.name, role: user.role,
  });
});

const handleAdminUsers = requirePermission("manage:users")(async (_req, res) => {
  const allUsers = Array.from(users.values()).map((u) => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
  }));
  json(res, 200, { users: allUsers });
});

// --- Router ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method!;

  try {
    if (url.pathname === "/auth/register" && method === "POST") return await handleRegister(req, res);
    if (url.pathname === "/auth/login" && method === "POST") return await handleLogin(req, res);
    if (url.pathname === "/auth/refresh" && method === "POST") return await handleRefresh(req, res);
    if (url.pathname === "/api/profile" && method === "GET") return await handleGetProfile(req, res);
    if (url.pathname === "/api/admin/users" && method === "GET") return await handleAdminUsers(req, res);
    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Internal server error" });
  }
});

server.listen(3000, () => console.log("Auth server on http://localhost:3000"));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// --- Types ---
type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"`
	Name         string `json:"name"`
}

type JWTPayload struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
	Iat   int64  `json:"iat"`
	Exp   int64  `json:"exp"`
}

type RefreshTokenData struct {
	UserID    string
	ExpiresAt time.Time
}

// --- Config ---
var (
	jwtSecret       = []byte("your-secret-key-change-in-production")
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 7 * 24 * time.Hour
)

// --- Store ---
type AuthStore struct {
	mu            sync.RWMutex
	users         map[string]*User
	refreshTokens map[string]RefreshTokenData
}

var store = &AuthStore{
	users:         make(map[string]*User),
	refreshTokens: make(map[string]RefreshTokenData),
}

// --- JWT ---
func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func signJWT(sub, email, role string, ttl time.Duration) string {
	header := base64URLEncode([]byte(`{"alg":"HS256","typ":"JWT"}`))
	now := time.Now().Unix()
	payload, _ := json.Marshal(JWTPayload{
		Sub: sub, Email: email, Role: role,
		Iat: now, Exp: now + int64(ttl.Seconds()),
	})
	body := base64URLEncode(payload)
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(header + "." + body))
	sig := base64URLEncode(mac.Sum(nil))
	return header + "." + body + "." + sig
}

func verifyJWT(token string) (*JWTPayload, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := base64URLEncode(mac.Sum(nil))

	if subtle.ConstantTimeCompare([]byte(parts[2]), []byte(expected)) != 1 {
		return nil, fmt.Errorf("invalid signature")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload")
	}

	var payload JWTPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("invalid payload JSON")
	}

	if payload.Exp < time.Now().Unix() {
		return nil, fmt.Errorf("token expired")
	}

	return &payload, nil
}

// --- RBAC ---
type Permission string

const (
	ReadPosts   Permission = "read:posts"
	WritePosts  Permission = "write:posts"
	DeletePosts Permission = "delete:posts"
	ManageUsers Permission = "manage:users"
)

var rolePermissions = map[string][]Permission{
	"user":   {ReadPosts},
	"editor": {ReadPosts, WritePosts},
	"admin":  {ReadPosts, WritePosts, DeletePosts, ManageUsers},
}

func hasPermission(role string, perm Permission) bool {
	perms := rolePermissions[role]
	for _, p := range perms {
		if p == perm {
			return true
		}
	}
	return false
}

// --- Middleware ---
func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, 401, map[string]string{"error": "Missing Authorization header"})
			return
		}

		payload, err := verifyJWT(strings.TrimPrefix(auth, "Bearer "))
		if err != nil {
			writeJSON(w, 401, map[string]string{"error": "Invalid or expired token"})
			return
		}

		// Store user info in header for downstream handlers
		r.Header.Set("X-User-ID", payload.Sub)
		r.Header.Set("X-User-Email", payload.Email)
		r.Header.Set("X-User-Role", payload.Role)

		next(w, r)
	}
}

func requirePerm(perm Permission, next http.HandlerFunc) http.HandlerFunc {
	return requireAuth(func(w http.ResponseWriter, r *http.Request) {
		role := r.Header.Get("X-User-Role")
		if !hasPermission(role, perm) {
			writeJSON(w, 403, map[string]string{"error": "Insufficient permissions"})
			return
		}
		next(w, r)
	})
}

// --- Handlers ---
func handleRegister(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input)

	if input.Email == "" || len(input.Password) < 8 {
		writeJSON(w, 400, map[string]string{"error": "Email and password (min 8 chars) required"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	for _, u := range store.users {
		if u.Email == input.Email {
			writeJSON(w, 409, map[string]string{"error": "Email already registered"})
			return
		}
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	id := generateID()
	user := &User{ID: id, Email: input.Email, PasswordHash: string(hash), Role: "user", Name: input.Name}
	store.users[id] = user

	accessToken := signJWT(id, input.Email, "user", accessTokenTTL)
	refreshToken := generateRefreshToken()
	store.refreshTokens[refreshToken] = RefreshTokenData{
		UserID: id, ExpiresAt: time.Now().Add(refreshTokenTTL),
	}

	writeJSON(w, 201, map[string]interface{}{
		"user": user, "accessToken": accessToken,
		"refreshToken": refreshToken, "expiresIn": int(accessTokenTTL.Seconds()),
	})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input)

	store.mu.RLock()
	var user *User
	for _, u := range store.users {
		if u.Email == input.Email {
			user = u
			break
		}
	}
	store.mu.RUnlock()

	if user == nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)) != nil {
		writeJSON(w, 401, map[string]string{"error": "Invalid email or password"})
		return
	}

	accessToken := signJWT(user.ID, user.Email, user.Role, accessTokenTTL)
	refreshToken := generateRefreshToken()

	store.mu.Lock()
	store.refreshTokens[refreshToken] = RefreshTokenData{
		UserID: user.ID, ExpiresAt: time.Now().Add(refreshTokenTTL),
	}
	store.mu.Unlock()

	writeJSON(w, 200, map[string]interface{}{
		"user": user, "accessToken": accessToken,
		"refreshToken": refreshToken, "expiresIn": int(accessTokenTTL.Seconds()),
	})
}

func handleRefresh(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RefreshToken string `json:"refreshToken"`
	}
	json.NewDecoder(r.Body).Decode(&input)

	store.mu.Lock()
	defer store.mu.Unlock()

	data, ok := store.refreshTokens[input.RefreshToken]
	if !ok || time.Now().After(data.ExpiresAt) {
		writeJSON(w, 401, map[string]string{"error": "Invalid or expired refresh token"})
		return
	}

	delete(store.refreshTokens, input.RefreshToken) // rotate

	user := store.users[data.UserID]
	if user == nil {
		writeJSON(w, 401, map[string]string{"error": "User not found"})
		return
	}

	accessToken := signJWT(user.ID, user.Email, user.Role, accessTokenTTL)
	newRefresh := generateRefreshToken()
	store.refreshTokens[newRefresh] = RefreshTokenData{
		UserID: user.ID, ExpiresAt: time.Now().Add(refreshTokenTTL),
	}

	writeJSON(w, 200, map[string]interface{}{
		"accessToken": accessToken, "refreshToken": newRefresh,
		"expiresIn": int(accessTokenTTL.Seconds()),
	})
}

// --- Helpers ---
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateRefreshToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/auth/register", handleRegister)
	mux.HandleFunc("/auth/login", handleLogin)
	mux.HandleFunc("/auth/refresh", handleRefresh)

	mux.HandleFunc("/api/profile", requireAuth(func(w http.ResponseWriter, r *http.Request) {
		store.mu.RLock()
		user := store.users[r.Header.Get("X-User-ID")]
		store.mu.RUnlock()
		if user == nil {
			writeJSON(w, 404, map[string]string{"error": "User not found"})
			return
		}
		writeJSON(w, 200, user)
	}))

	mux.HandleFunc("/api/admin/users", requirePerm(ManageUsers, func(w http.ResponseWriter, _ *http.Request) {
		store.mu.RLock()
		defer store.mu.RUnlock()
		var list []User
		for _, u := range store.users {
			list = append(list, *u)
		}
		writeJSON(w, 200, map[string]interface{}{"users": list})
	}))

	log.Println("Auth server on http://localhost:3000")
	log.Fatal(http.ListenAndServe(":3000", mux))
}
```

</div>
</CodeTabs>

<div class="takeaways">

### Key Takeaways

- Use **timing-safe comparison** for signature verification — prevents timing attacks
- **Rotate refresh tokens** on every use — if one is stolen, it can only be used once
- Return the **same error** for "user not found" and "wrong password" — prevents user enumeration
- **RBAC** is simpler than ABAC (attribute-based) and sufficient for most applications
- Hash passwords with **bcrypt** (Go) or **scrypt** (Node.js) — never SHA-256 or MD5

</div>

<div class="when-to-use">

### Real-World Usage

- **Auth0** and **Firebase Auth** implement exactly this JWT + refresh token flow
- **GitHub** uses short-lived tokens with refresh for their OAuth apps
- **Stripe** uses API keys (simpler than JWT) because they don't need user sessions
- For most apps, use a managed auth service (Auth0, Clerk, Supabase Auth). Build custom only if you have specific compliance needs.

</div>

