---
title: 'Case Study: Social Media News Feed'
subtitle: 'Design and build a production news feed with fan-out, ranking, infinite scroll pagination, and real-time updates.'
chapter: 21
level: 'advanced'
readingTime: '32 min'
topics: ['news feed', 'fan-out', 'ranking algorithm', 'pagination', 'real-time updates']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## The News Feed Problem

The news feed is one of the hardest problems in system design because it sits at the intersection of four challenges: **fan-out at scale** (when a celebrity with 50M followers posts, how do you update 50M feeds?), **ranking** (showing the most relevant content, not just the newest), **real-time updates** (new posts should appear without refreshing), and **infinite scroll pagination** (loading more content seamlessly as you scroll).

Think of it like a personalized newspaper that rewrites itself every second.

<Callout type="info">

**Real-World Analogy**

Like a personalized newspaper — each reader gets a different front page based on their interests. The printing press must produce millions of unique editions simultaneously.

</Callout>

Each reader gets a different front page based on who they follow, what they engage with, and what's trending. The printing press (fan-out service) must produce millions of unique editions simultaneously. And unlike a real newspaper, readers expect new stories to appear the moment they're published.

<Mermaid
title="News Feed Architecture"
code={`graph TD
  P["Post Service<br/>Create Post"] --> F["Fan-out Service<br/>Write to Feeds"] --> S["Feed Store<br/>Per-User Timeline"]
  S --> R["Ranking Engine<br/>Score & Sort"] --> G["Social Graph<br/>Followers"] --> U["Real-time Updates<br/>New Posts"]`}
/>

## Requirements

- **Functional**: Create posts, follow/unfollow users, generate personalized feed, infinite scroll with cursor-based pagination, real-time "new posts" counter
- **Non-functional**: Feed generation under 200ms, support users with 10M+ followers (celebrities), eventual consistency acceptable for feeds
- **Scale**: 500M daily active users, 10K new posts/sec, 100K feed reads/sec

## Fan-Out Strategies Deep Dive

The fundamental question in news feed design is: **when does a post reach a user's feed?**

**Fan-Out on Write (Push Model):** When a user creates a post, immediately write it to every follower's feed. This is fast for readers (feed is pre-computed) but expensive for writers. If a user has 10K followers, one post triggers 10K writes. Works well for users with fewer than ~10K followers.

**Fan-Out on Read (Pull Model):** When a user opens their feed, fetch recent posts from all users they follow and merge them. This avoids the write amplification problem but makes reads expensive. Every feed load requires querying N users' post lists and merging them. Works well for celebrity accounts.

**Hybrid Approach (Industry Standard):** Use fan-out on write for normal users (fast reads, manageable writes) and fan-out on read for celebrities (avoids write storms). When you open your feed, the pre-computed feed from normal users is merged with on-the-fly fetched celebrity posts. This is what Twitter/X actually does.

## Step-by-Step: How a Post Reaches Your Feed

1. **User creates a post** — Post is stored in the post store
2. **Check follower count** — If the author has fewer than 10K followers, use fan-out on write. Otherwise, mark as celebrity post.
3. **Fan-out on write** — For normal users, the fan-out service writes the post ID to each follower's feed (a sorted set keyed by timestamp)
4. **Feed read request** — When a user opens their feed, fetch their pre-computed feed entries
5. **Merge celebrity posts** — Fetch recent posts from any celebrities the user follows and merge them into the feed
6. **Rank** — Score each post based on recency, engagement (likes/comments), and author affinity
7. **Paginate** — Return the top N posts with a cursor for the next page
8. **Real-time counter** — Track how many new posts have arrived since the user last loaded their feed

## Building the News Feed System

<CodeTabs tsFile="news-feed.ts" goFile="news-feed.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES
// ===========================================
interface Post {
	id: string;
	authorId: string;
	content: string;
	likes: number;
	comments: number;
	createdAt: number;
}

interface FeedItem {
	postId: string;
	score: number;
	addedAt: number;
}

interface FeedPage {
	posts: Post[];
	cursor: string | null;
	hasMore: boolean;
	newCount: number;
}

// ===========================================
// 2. SOCIAL GRAPH
// ===========================================
class SocialGraph {
	private followers = new Map<string, Set<string>>(); // userId -> followerIds
	private following = new Map<string, Set<string>>(); // userId -> followingIds
	private readonly celebrityThreshold = 10000;

	follow(followerId: string, followeeId: string): void {
		if (!this.followers.has(followeeId)) this.followers.set(followeeId, new Set());
		if (!this.following.has(followerId)) this.following.set(followerId, new Set());
		this.followers.get(followeeId)!.add(followerId);
		this.following.get(followerId)!.add(followeeId);
	}

	unfollow(followerId: string, followeeId: string): void {
		this.followers.get(followeeId)?.delete(followerId);
		this.following.get(followeeId)?.delete(followerId);
	}

	getFollowers(userId: string): string[] {
		return [...(this.followers.get(userId) || [])];
	}

	getFollowing(userId: string): string[] {
		return [...(this.following.get(userId) || [])];
	}

	isCelebrity(userId: string): boolean {
		return (this.followers.get(userId)?.size || 0) >= this.celebrityThreshold;
	}

	getFollowerCount(userId: string): number {
		return this.followers.get(userId)?.size || 0;
	}
}

// ===========================================
// 3. POST STORE
// ===========================================
class PostStore {
	private posts = new Map<string, Post>();
	private userPosts = new Map<string, string[]>(); // userId -> postIds

	create(authorId: string, content: string): Post {
		const post: Post = {
			id: crypto.randomUUID(),
			authorId,
			content,
			likes: 0,
			comments: 0,
			createdAt: Date.now()
		};
		this.posts.set(post.id, post);
		const list = this.userPosts.get(authorId) || [];
		list.push(post.id);
		this.userPosts.set(authorId, list);
		return post;
	}

	get(id: string): Post | null {
		return this.posts.get(id) || null;
	}

	getByUser(userId: string, limit = 50): Post[] {
		const ids = this.userPosts.get(userId) || [];
		return ids
			.slice(-limit)
			.reverse()
			.map((id) => this.posts.get(id)!)
			.filter(Boolean);
	}

	getByIds(ids: string[]): Post[] {
		return ids.map((id) => this.posts.get(id)!).filter(Boolean);
	}

	like(postId: string): void {
		const post = this.posts.get(postId);
		if (post) post.likes++;
	}
}

// ===========================================
// 4. FEED STORE (Per-user timeline)
// ===========================================
class FeedStore {
	private feeds = new Map<string, FeedItem[]>();
	private readonly maxFeedSize = 1000;

	addToFeed(userId: string, postId: string, score: number): void {
		const feed = this.feeds.get(userId) || [];
		feed.push({ postId, score, addedAt: Date.now() });
		// Keep feed bounded
		if (feed.length > this.maxFeedSize) {
			feed.sort((a, b) => b.score - a.score);
			feed.length = this.maxFeedSize;
		}
		this.feeds.set(userId, feed);
	}

	getFeed(userId: string): FeedItem[] {
		return (this.feeds.get(userId) || []).sort((a, b) => b.score - a.score);
	}
}

// ===========================================
// 5. RANKING ENGINE
// ===========================================
class RankingEngine {
	score(post: Post, viewerId: string, graph: SocialGraph): number {
		const ageHours = (Date.now() - post.createdAt) / 3600000;
		const recencyScore = Math.max(0, 100 - ageHours * 2); // Decay over 50 hours
		const engagementScore = post.likes * 2 + post.comments * 3;

		// Author affinity: boost posts from users the viewer follows closely
		const viewerFollowing = graph.getFollowing(viewerId);
		const affinityScore = viewerFollowing.includes(post.authorId) ? 10 : 0;

		return recencyScore + engagementScore + affinityScore;
	}
}

// ===========================================
// 6. FAN-OUT SERVICE
// ===========================================
class FanOutService {
	constructor(
		private graph: SocialGraph,
		private feedStore: FeedStore,
		private ranking: RankingEngine
	) {}

	async fanOut(post: Post): Promise<number> {
		if (this.graph.isCelebrity(post.authorId)) {
			// Celebrity: skip fan-out on write, will be fetched on read
			console.log(`[FAN-OUT] Celebrity post ${post.id} — skip push, will pull on read`);
			return 0;
		}

		const followers = this.graph.getFollowers(post.authorId);
		let count = 0;

		for (const followerId of followers) {
			const score = this.ranking.score(post, followerId, this.graph);
			this.feedStore.addToFeed(followerId, post.id, score);
			count++;
		}

		console.log(`[FAN-OUT] Post ${post.id} pushed to ${count} feeds`);
		return count;
	}
}

// ===========================================
// 7. FEED GENERATOR
// ===========================================
class FeedGenerator {
	constructor(
		private postStore: PostStore,
		private feedStore: FeedStore,
		private graph: SocialGraph,
		private ranking: RankingEngine
	) {}

	generate(userId: string, cursor: string | null, limit = 20): FeedPage {
		// 1. Get pre-computed feed items (fan-out on write)
		const feedItems = this.feedStore.getFeed(userId);

		// 2. Merge celebrity posts (fan-out on read)
		const following = this.graph.getFollowing(userId);
		const celebrityPosts: Post[] = [];

		for (const followeeId of following) {
			if (this.graph.isCelebrity(followeeId)) {
				const recent = this.postStore.getByUser(followeeId, 10);
				celebrityPosts.push(...recent);
			}
		}

		// 3. Combine and deduplicate
		const allPostIds = new Set<string>();
		const allPosts: { post: Post; score: number }[] = [];

		for (const item of feedItems) {
			if (allPostIds.has(item.postId)) continue;
			const post = this.postStore.get(item.postId);
			if (!post) continue;
			allPostIds.add(item.postId);
			allPosts.push({ post, score: item.score });
		}

		for (const post of celebrityPosts) {
			if (allPostIds.has(post.id)) continue;
			allPostIds.add(post.id);
			const score = this.ranking.score(post, userId, this.graph);
			allPosts.push({ post, score });
		}

		// 4. Sort by score
		allPosts.sort((a, b) => b.score - a.score);

		// 5. Cursor-based pagination
		let startIdx = 0;
		if (cursor) {
			const cursorIdx = allPosts.findIndex((p) => p.post.id === cursor);
			if (cursorIdx >= 0) startIdx = cursorIdx + 1;
		}

		const page = allPosts.slice(startIdx, startIdx + limit);
		const hasMore = startIdx + limit < allPosts.length;
		const nextCursor = page.length > 0 ? page[page.length - 1].post.id : null;

		return {
			posts: page.map((p) => p.post),
			cursor: hasMore ? nextCursor : null,
			hasMore,
			newCount: 0
		};
	}
}

// ===========================================
// 8. REAL-TIME NEW POST COUNTER
// ===========================================
class NewPostTracker {
	private lastSeen = new Map<string, number>(); // userId -> timestamp

	markSeen(userId: string): void {
		this.lastSeen.set(userId, Date.now());
	}

	getNewCount(userId: string, feedItems: FeedItem[]): number {
		const lastSeen = this.lastSeen.get(userId) || 0;
		return feedItems.filter((item) => item.addedAt > lastSeen).length;
	}
}

// ===========================================
// 9. HTTP SERVER
// ===========================================
const graph = new SocialGraph();
const postStore = new PostStore();
const feedStore = new FeedStore();
const ranking = new RankingEngine();
const fanOut = new FanOutService(graph, feedStore, ranking);
const feedGen = new FeedGenerator(postStore, feedStore, graph, ranking);
const tracker = new NewPostTracker();

function parseBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
	});
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	try {
		// POST /api/posts
		if (url.pathname === '/api/posts' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!body.authorId || !body.content) {
				json(res, 400, { error: 'authorId and content required' });
				return;
			}
			const post = postStore.create(body.authorId, body.content);
			await fanOut.fanOut(post);
			json(res, 201, post);
			return;
		}

		// POST /api/follow/:userId
		const followMatch = url.pathname.match(/^\/api\/follow\/([^/]+)$/);
		if (followMatch && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!body.followerId) {
				json(res, 400, { error: 'followerId required' });
				return;
			}
			graph.follow(body.followerId, followMatch[1]);
			json(res, 200, { followed: followMatch[1] });
			return;
		}

		// DELETE /api/follow/:userId
		if (followMatch && method === 'DELETE') {
			const body = (await parseBody(req)) as any;
			if (!body.followerId) {
				json(res, 400, { error: 'followerId required' });
				return;
			}
			graph.unfollow(body.followerId, followMatch[1]);
			json(res, 200, { unfollowed: followMatch[1] });
			return;
		}

		// GET /api/feed?userId=&cursor=&limit=
		if (url.pathname === '/api/feed' && method === 'GET') {
			const userId = url.searchParams.get('userId');
			if (!userId) {
				json(res, 400, { error: 'userId required' });
				return;
			}
			const cursor = url.searchParams.get('cursor');
			const limit = parseInt(url.searchParams.get('limit') || '20');
			const feed = feedGen.generate(userId, cursor, limit);
			tracker.markSeen(userId);
			json(res, 200, feed);
			return;
		}

		// GET /api/feed/new-count?userId=
		if (url.pathname === '/api/feed/new-count' && method === 'GET') {
			const userId = url.searchParams.get('userId');
			if (!userId) {
				json(res, 400, { error: 'userId required' });
				return;
			}
			const items = feedStore.getFeed(userId);
			const count = tracker.getNewCount(userId, items);
			json(res, 200, { newCount: count });
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		json(res, 500, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`News Feed on http://localhost:${PORT}`));
process.on('SIGTERM', () => server.close());
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES
// ===========================================
type Post struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Content   string `json:"content"`
	Likes     int    `json:"likes"`
	Comments  int    `json:"comments"`
	CreatedAt int64  `json:"createdAt"`
}

type FeedItem struct {
	PostID  string  `json:"postId"`
	Score   float64 `json:"score"`
	AddedAt int64   `json:"addedAt"`
}

// ===========================================
// 2. SOCIAL GRAPH
// ===========================================
type SocialGraph struct {
	mu        sync.RWMutex
	followers map[string]map[string]bool
	following map[string]map[string]bool
}

func NewSocialGraph() *SocialGraph {
	return &SocialGraph{
		followers: make(map[string]map[string]bool),
		following: make(map[string]map[string]bool),
	}
}

func (g *SocialGraph) Follow(followerID, followeeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.followers[followeeID] == nil { g.followers[followeeID] = make(map[string]bool) }
	if g.following[followerID] == nil { g.following[followerID] = make(map[string]bool) }
	g.followers[followeeID][followerID] = true
	g.following[followerID][followeeID] = true
}

func (g *SocialGraph) Unfollow(followerID, followeeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.followers[followeeID], followerID)
	delete(g.following[followerID], followeeID)
}

func (g *SocialGraph) GetFollowers(userID string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	var result []string
	for id := range g.followers[userID] { result = append(result, id) }
	return result
}

func (g *SocialGraph) GetFollowing(userID string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	var result []string
	for id := range g.following[userID] { result = append(result, id) }
	return result
}

func (g *SocialGraph) IsCelebrity(userID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.followers[userID]) >= 10000
}

// ===========================================
// 3. POST STORE
// ===========================================
type PostStore struct {
	mu        sync.RWMutex
	posts     map[string]*Post
	userPosts map[string][]string
	counter   int64
}

func NewPostStore() *PostStore {
	return &PostStore{posts: make(map[string]*Post), userPosts: make(map[string][]string)}
}

func (ps *PostStore) Create(authorID, content string) *Post {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	ps.counter++
	p := &Post{
		ID: strconv.FormatInt(ps.counter, 10), AuthorID: authorID,
		Content: content, CreatedAt: time.Now().UnixMilli(),
	}
	ps.posts[p.ID] = p
	ps.userPosts[authorID] = append(ps.userPosts[authorID], p.ID)
	return p
}

func (ps *PostStore) Get(id string) *Post {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return ps.posts[id]
}

func (ps *PostStore) GetByUser(userID string, limit int) []*Post {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	ids := ps.userPosts[userID]
	start := len(ids) - limit
	if start < 0 { start = 0 }
	var result []*Post
	for i := len(ids) - 1; i >= start; i-- {
		if p := ps.posts[ids[i]]; p != nil { result = append(result, p) }
	}
	return result
}

// ===========================================
// 4. FEED STORE
// ===========================================
type FeedStore struct {
	mu    sync.RWMutex
	feeds map[string][]FeedItem
}

func NewFeedStore() *FeedStore {
	return &FeedStore{feeds: make(map[string][]FeedItem)}
}

func (fs *FeedStore) Add(userID, postID string, score float64) {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	feed := fs.feeds[userID]
	feed = append(feed, FeedItem{PostID: postID, Score: score, AddedAt: time.Now().UnixMilli()})
	if len(feed) > 1000 {
		sort.Slice(feed, func(i, j int) bool { return feed[i].Score > feed[j].Score })
		feed = feed[:1000]
	}
	fs.feeds[userID] = feed
}

func (fs *FeedStore) Get(userID string) []FeedItem {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	items := make([]FeedItem, len(fs.feeds[userID]))
	copy(items, fs.feeds[userID])
	sort.Slice(items, func(i, j int) bool { return items[i].Score > items[j].Score })
	return items
}

// ===========================================
// 5. RANKING & FAN-OUT
// ===========================================
func scorePost(p *Post, viewerID string, graph *SocialGraph) float64 {
	ageHours := float64(time.Now().UnixMilli()-p.CreatedAt) / 3600000
	recency := math.Max(0, 100-ageHours*2)
	engagement := float64(p.Likes*2 + p.Comments*3)
	affinity := 0.0
	for _, id := range graph.GetFollowing(viewerID) {
		if id == p.AuthorID { affinity = 10; break }
	}
	return recency + engagement + affinity
}

func fanOutPost(p *Post, graph *SocialGraph, feedStore *FeedStore) int {
	if graph.IsCelebrity(p.AuthorID) {
		log.Printf("[FAN-OUT] Celebrity post %s — skip push", p.ID)
		return 0
	}
	followers := graph.GetFollowers(p.AuthorID)
	for _, fid := range followers {
		score := scorePost(p, fid, graph)
		feedStore.Add(fid, p.ID, score)
	}
	log.Printf("[FAN-OUT] Post %s pushed to %d feeds", p.ID, len(followers))
	return len(followers)
}

// ===========================================
// 6. FEED GENERATOR
// ===========================================
type FeedPage struct {
	Posts    []*Post `json:"posts"`
	Cursor   *string `json:"cursor"`
	HasMore  bool    `json:"hasMore"`
	NewCount int     `json:"newCount"`
}

func generateFeed(userID string, cursor *string, limit int,
	postStore *PostStore, feedStore *FeedStore, graph *SocialGraph) FeedPage {

	feedItems := feedStore.Get(userID)

	// Merge celebrity posts
	type scored struct {
		post  *Post
		score float64
	}
	seen := make(map[string]bool)
	var all []scored

	for _, item := range feedItems {
		if seen[item.PostID] { continue }
		if p := postStore.Get(item.PostID); p != nil {
			seen[item.PostID] = true
			all = append(all, scored{p, item.Score})
		}
	}

	for _, followeeID := range graph.GetFollowing(userID) {
		if !graph.IsCelebrity(followeeID) { continue }
		for _, p := range postStore.GetByUser(followeeID, 10) {
			if seen[p.ID] { continue }
			seen[p.ID] = true
			all = append(all, scored{p, scorePost(p, userID, graph)})
		}
	}

	sort.Slice(all, func(i, j int) bool { return all[i].score > all[j].score })

	startIdx := 0
	if cursor != nil {
		for i, s := range all {
			if s.post.ID == *cursor { startIdx = i + 1; break }
		}
	}

	end := startIdx + limit
	if end > len(all) { end = len(all) }
	page := all[startIdx:end]
	hasMore := end < len(all)

	var posts []*Post
	var nextCursor *string
	for _, s := range page { posts = append(posts, s.post) }
	if hasMore && len(page) > 0 {
		c := page[len(page)-1].post.ID
		nextCursor = &c
	}

	return FeedPage{Posts: posts, Cursor: nextCursor, HasMore: hasMore}
}

// ===========================================
// 7. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	graph := NewSocialGraph()
	postStore := NewPostStore()
	feedStore := NewFeedStore()
	followPattern := regexp.MustCompile(`^/api/follow/([^/]+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/posts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		var body struct {
			AuthorID string `json:"authorId"`
			Content  string `json:"content"`
		}
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
		if body.AuthorID == "" || body.Content == "" {
			writeJSON(w, 400, map[string]string{"error": "authorId and content required"}); return
		}
		p := postStore.Create(body.AuthorID, body.Content)
		fanOutPost(p, graph, feedStore)
		writeJSON(w, 201, p)
	})

	mux.HandleFunc("/api/follow/", func(w http.ResponseWriter, r *http.Request) {
		m := followPattern.FindStringSubmatch(r.URL.Path)
		if m == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
		var body struct { FollowerID string `json:"followerId"` }
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
		if body.FollowerID == "" {
			writeJSON(w, 400, map[string]string{"error": "followerId required"}); return
		}
		if r.Method == http.MethodPost {
			graph.Follow(body.FollowerID, m[1])
			writeJSON(w, 200, map[string]string{"followed": m[1]}); return
		}
		if r.Method == http.MethodDelete {
			graph.Unfollow(body.FollowerID, m[1])
			writeJSON(w, 200, map[string]string{"unfollowed": m[1]}); return
		}
		writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
	})

	mux.HandleFunc("/api/feed", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		if userID == "" { writeJSON(w, 400, map[string]string{"error": "userId required"}); return }
		var cursor *string
		if c := r.URL.Query().Get("cursor"); c != "" { cursor = &c }
		limit := 20
		if l := r.URL.Query().Get("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil { limit = parsed }
		}
		feed := generateFeed(userID, cursor, limit, postStore, feedStore, graph)
		writeJSON(w, 200, feed)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}

	go func() {
		log.Printf("News Feed on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	srv.Close()
}
```

</div>
</CodeTabs>

## Design Decisions Explained

### Why Hybrid Fan-Out?

Pure fan-out on write breaks when a celebrity with 50M followers posts — that's 50M writes for a single post, taking minutes and overwhelming the write pipeline. Pure fan-out on read makes every feed load slow because you're querying hundreds of users' post lists. The hybrid approach gets the best of both: fast reads for 99% of posts (pre-computed feeds from normal users) with on-demand fetching only for the celebrity posts that would cause write storms.

### Why Cursor-Based Pagination Instead of Offset?

With offset pagination (`LIMIT 20 OFFSET 40`), if 5 new posts are inserted while the user scrolls, page 3 will show duplicates of posts from page 2. Cursor-based pagination (`WHERE id &lt; cursor LIMIT 20`) is stable — it always picks up exactly where you left off, regardless of new insertions. This is critical for infinite scroll where users spend minutes scrolling through feeds.

### Why Rank Instead of Pure Chronological?

A chronological feed shows you whatever was posted most recently, even if it's irrelevant. Ranking transforms a reverse-chronological list into a personalized experience. Even a simple formula (recency + engagement + affinity) dramatically improves engagement because users see high-quality content first. Instagram's switch from chronological to ranked feeds in 2016 increased engagement significantly because users were missing 70% of posts in chronological order.

### Why Eventual Consistency for Feeds?

When a user posts, their followers don't need to see it in their feed instantly. A delay of 1-2 seconds is perfectly acceptable. This relaxation lets us use async fan-out (message queues) instead of synchronous writes, which is the only way to handle posts from users with millions of followers without blocking the post creation API.

<div class="takeaways">

### Key Takeaways

- Hybrid fan-out (push for normal users, pull for celebrities) is the industry standard approach
- Cursor-based pagination prevents duplicate/missing posts during infinite scroll, unlike offset pagination
- Ranking transforms a reverse-chronological list into a personalized experience — even a simple score formula dramatically improves engagement
- Celebrity posts should be fetched on-read to avoid fan-out storms (one post to 50M followers = 50M writes)
- Pre-computed feeds trade storage for speed — reading a feed is just reading a sorted list
- Real-time "new posts" counters create engagement without forcefully refreshing the feed

</div>

<div class="when-to-use">

### Real-World Usage

- **Twitter/X** uses hybrid fan-out: push for users with fewer than 10K followers, pull for celebrities — timeline is served from Redis
- **Facebook** ranks ~2000 candidate posts per feed load using a multi-stage ML pipeline
- **Instagram** switched from chronological to ranked feeds in 2016 and saw a significant increase in engagement
- **LinkedIn** uses a two-pass ranking system: first pass retrieves candidates, second pass applies personalized scoring
- This architecture serves personalized feeds in under 200ms for 500M+ daily active users

</div>
