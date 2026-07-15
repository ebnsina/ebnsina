---
title: 'কেস স্টাডি: সোশ্যাল মিডিয়া নিউজ ফিড'
subtitle: 'ফ্যান-আউট, র‍্যাঙ্কিং, ইনফিনিট স্ক্রল পেজিনেশন আর রিয়েল-টাইম আপডেট সহ একটি প্রোডাকশন নিউজ ফিড ডিজাইন ও তৈরি করুন।'
chapter: 21
level: 'advanced'
readingTime: '32 মিনিট'
topics: ['news feed', 'fan-out', 'ranking algorithm', 'pagination', 'real-time updates']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

করিম একজন ব্যক্তিগত সংবাদপত্রের সম্পাদক। তার কাজটা অদ্ভুত — প্রতিটা পাঠকের জন্য সে আলাদা একটা ফ্রন্ট পেজ বানায়, যেখানে শুধু সেই পাঠক যে লেখকদের ফলো করে, তাদেরই খবর থাকে। রহিম যদি পাঁচজন সাধারণ কলাম-লেখককে ফলো করে, তাহলে করিম চালাকিটা এভাবে করে: ওই সাধারণ লেখকদের কেউ যেই মুহূর্তে নতুন কিছু লেখে, করিম সাথে সাথেই সেটা তাদের প্রতিটা follower-এর আগে থেকে সাজানো কাগজে বসিয়ে দেয়। ফলে রহিম সকালে কাগজ খুললেই তার পার্সোনালাইজড পেজ পুরো তৈরি — কোনো অপেক্ষা নেই।

কিন্তু ঝামেলা বাধে ফাতেমাকে নিয়ে। ফাতেমা এমন একজন জনপ্রিয় কলামিস্ট যাকে লাখ লাখ মানুষ ফলো করে। সে একটা লেখা লিখলে করিমকে যদি লাখ লাখ কাগজে হাতে হাতে সেটা কপি করে বসাতে হয়, তাহলে সারাদিনেও কাজ শেষ হবে না। তাই ফাতেমার মতো হট লেখকদের বেলায় করিম আগে থেকে কিছু বসায় না — বরং কোনো পাঠক যখন তার কাগজটা খোলে, ঠিক তখনই করিম দৌড়ে গিয়ে ফাতেমার সাম্প্রতিক লেখা এনে সেই কাগজের সাধারণ খবরের সাথে জুড়ে দেয়। আর কোন খবরটা সবচেয়ে মজার বা প্রাসঙ্গিক, সেটা করিম কাগজের একদম উপরে বসায়, কম গুরুত্বেরগুলো নিচে।

করিমই এখানে **feed service**, আর প্রতিটা পাঠকের আলাদা কাগজ হলো তার **personalized feed**। সাধারণ লেখকদের খবর লেখামাত্রই সব follower-এর কাগজে আগে বসিয়ে রাখাটাই **fan-out on write**, আর ফাতেমার মতো celebrity/hot লেখকদের খবর পাঠক কাগজ খোলার মুহূর্তে এনে জোড়া দেওয়াটাই **fan-out on read** — এভাবেই সেই "একটা পোস্ট বনাম লাখ লাখ কপি" সমস্যা এড়ানো হয়। আর সবচেয়ে আকর্ষণীয় খবর উপরে বসানোটাই **ranking**। বাস্তবে Twitter/X আর Instagram ঠিক এই হাইব্রিড কৌশলেই কোটি কোটি মানুষের feed সামলায়।

## নিউজ ফিড সমস্যা

নিউজ ফিড হলো সিস্টেম ডিজাইনের সবচেয়ে কঠিন সমস্যাগুলোর একটা, কারণ এটা চারটা চ্যালেঞ্জের সংযোগস্থলে বসে থাকে: **স্কেলে ফ্যান-আউট** (৫০M ফলোয়ার আছে এমন একজন সেলিব্রিটি যখন পোস্ট করে, তখন তুমি কীভাবে ৫০M ফিড আপডেট করবে?), **র‍্যাঙ্কিং** (শুধু নতুন কনটেন্ট নয়, সবচেয়ে প্রাসঙ্গিক কনটেন্ট দেখানো), **রিয়েল-টাইম আপডেট** (রিফ্রেশ না করেই নতুন পোস্ট দেখানো উচিত), আর **ইনফিনিট স্ক্রল পেজিনেশন** (স্ক্রল করার সাথে সাথে আরও কনটেন্ট নিরবচ্ছিন্নভাবে লোড হওয়া)।

এটাকে ভাবো একটা পার্সোনালাইজড সংবাদপত্র হিসেবে, যেটা প্রতি সেকেন্ডে নিজেকে নতুন করে লেখে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা পার্সোনালাইজড সংবাদপত্রের মতো — প্রতিটা পাঠক তার আগ্রহ অনুযায়ী আলাদা ফ্রন্ট পেজ পায়। প্রিন্টিং প্রেসকে একসাথে লক্ষ লক্ষ ইউনিক সংস্করণ তৈরি করতে হয়।

</Callout>

প্রতিটা পাঠক আলাদা ফ্রন্ট পেজ পায় — সে কাকে ফলো করে, কীসের সাথে এনগেজ করে, আর কী ট্রেন্ডিং তার ওপর ভিত্তি করে। প্রিন্টিং প্রেস (ফ্যান-আউট সার্ভিস) কে একসাথে লক্ষ লক্ষ ইউনিক সংস্করণ তৈরি করতে হয়। আর সত্যিকারের সংবাদপত্রের বিপরীতে, পাঠকরা আশা করে নতুন খবর প্রকাশ হওয়ার মুহূর্তেই সেটা দেখা যাবে।

<Mermaid
title="News Feed Architecture"
code={`graph TD
  P["Post Service<br/>Create Post"] --> F["Fan-out Service<br/>Write to Feeds"] --> S["Feed Store<br/>Per-User Timeline"]
  S --> R["Ranking Engine<br/>Score & Sort"] --> G["Social Graph<br/>Followers"] --> U["Real-time Updates<br/>New Posts"]`}
/>

## রিকোয়ারমেন্ট

- **ফাংশনাল**: পোস্ট তৈরি, ইউজার ফলো/আনফলো, পার্সোনালাইজড ফিড জেনারেট, কার্সর-বেসড পেজিনেশন সহ ইনফিনিট স্ক্রল, রিয়েল-টাইম "নতুন পোস্ট" কাউন্টার
- **নন-ফাংশনাল**: ২০০ms এর নিচে ফিড জেনারেশন, ১০M+ ফলোয়ার আছে এমন ইউজার (সেলিব্রিটি) সাপোর্ট, ফিডের জন্য eventual consistency গ্রহণযোগ্য
- **স্কেল**: ৫০০M ডেইলি অ্যাক্টিভ ইউজার, ১০K নতুন পোস্ট/সেকেন্ড, ১০০K ফিড রিড/সেকেন্ড

## ফ্যান-আউট স্ট্র্যাটেজি গভীরভাবে

নিউজ ফিড ডিজাইনের মৌলিক প্রশ্ন হলো: **একটা পোস্ট কখন একজন ইউজারের ফিডে পৌঁছায়?**

**ফ্যান-আউট অন রাইট (পুশ মডেল):** একজন ইউজার যখন পোস্ট তৈরি করে, তখনই সেটা প্রতিটা ফলোয়ারের ফিডে লিখে ফেলা হয়। এটা পাঠকদের জন্য দ্রুত (ফিড আগে থেকেই কম্পিউট করা) কিন্তু লেখকদের জন্য ব্যয়বহুল। একজন ইউজারের যদি ১০K ফলোয়ার থাকে, তাহলে একটা পোস্ট ১০K রাইট ট্রিগার করে। ~১০K এর কম ফলোয়ার আছে এমন ইউজারের জন্য এটা ভালো কাজ করে।

**ফ্যান-আউট অন রিড (পুল মডেল):** একজন ইউজার যখন তার ফিড খোলে, তখন সে যাদের ফলো করে তাদের সবার সাম্প্রতিক পোস্ট এনে merge করা হয়। এটা রাইট অ্যামপ্লিফিকেশন সমস্যা এড়ায় কিন্তু রিডকে ব্যয়বহুল করে তোলে। প্রতিটা ফিড লোডের জন্য N জন ইউজারের পোস্ট লিস্ট কোয়েরি করে merge করতে হয়। সেলিব্রিটি অ্যাকাউন্টের জন্য এটা ভালো কাজ করে।

**হাইব্রিড অ্যাপ্রোচ (ইন্ডাস্ট্রি স্ট্যান্ডার্ড):** সাধারণ ইউজারদের জন্য ফ্যান-আউট অন রাইট ব্যবহার করো (দ্রুত রিড, সামলানোর মতো রাইট) আর সেলিব্রিটিদের জন্য ফ্যান-আউট অন রিড (রাইট স্টর্ম এড়ায়)। তুমি যখন তোমার ফিড খোলো, তখন সাধারণ ইউজারদের আগে থেকে কম্পিউট করা ফিডের সাথে সাথে-সাথে ফেচ করা সেলিব্রিটি পোস্ট merge করা হয়। Twitter/X আসলে এটাই করে।

## ধাপে ধাপে: একটা পোস্ট কীভাবে তোমার ফিডে পৌঁছায়

1. **ইউজার একটা পোস্ট তৈরি করে** — পোস্ট পোস্ট স্টোরে জমা হয়
2. **ফলোয়ার সংখ্যা চেক করো** — লেখকের যদি ১০K এর কম ফলোয়ার থাকে, ফ্যান-আউট অন রাইট ব্যবহার করো। নাহলে সেলিব্রিটি পোস্ট হিসেবে মার্ক করো।
3. **ফ্যান-আউট অন রাইট** — সাধারণ ইউজারদের জন্য ফ্যান-আউট সার্ভিস প্রতিটা ফলোয়ারের ফিডে পোস্ট ID লেখে (টাইমস্ট্যাম্প দিয়ে কি করা একটা sorted set)
4. **ফিড রিড রিকোয়েস্ট** — একজন ইউজার যখন তার ফিড খোলে, তখন তার আগে থেকে কম্পিউট করা ফিড এন্ট্রিগুলো ফেচ করা হয়
5. **সেলিব্রিটি পোস্ট merge করো** — ইউজার যে সেলিব্রিটিদের ফলো করে তাদের সাম্প্রতিক পোস্ট ফেচ করে ফিডে merge করো
6. **র‍্যাঙ্ক করো** — recency, engagement (লাইক/কমেন্ট), আর author affinity এর ভিত্তিতে প্রতিটা পোস্টকে স্কোর দাও
7. **পেজিনেট করো** — পরের পেজের জন্য একটা কার্সর সহ টপ N পোস্ট রিটার্ন করো
8. **রিয়েল-টাইম কাউন্টার** — ইউজার সর্বশেষ ফিড লোড করার পর থেকে কতগুলো নতুন পোস্ট এসেছে তা ট্র্যাক করো

## নিউজ ফিড সিস্টেম তৈরি করা

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

## ডিজাইন ডিসিশন ব্যাখ্যা

### হাইব্রিড ফ্যান-আউট কেন?

খাঁটি ফ্যান-আউট অন রাইট ভেঙে পড়ে যখন ৫০M ফলোয়ার আছে এমন একজন সেলিব্রিটি পোস্ট করে — সেটা একটা পোস্টের জন্য ৫০M রাইট, যাতে কয়েক মিনিট লাগে আর রাইট পাইপলাইন ধসে পড়ে। খাঁটি ফ্যান-আউট অন রিড প্রতিটা ফিড লোডকে ধীর করে দেয় কারণ তুমি শত শত ইউজারের পোস্ট লিস্ট কোয়েরি করছ। হাইব্রিড অ্যাপ্রোচ দুই দিকের সেরাটা দেয়: ৯৯% পোস্টের জন্য দ্রুত রিড (সাধারণ ইউজারদের আগে থেকে কম্পিউট করা ফিড) আর শুধু সেই সেলিব্রিটি পোস্টগুলোর জন্য চাহিদামতো ফেচ করা যেগুলো রাইট স্টর্ম ঘটাত।

### অফসেটের বদলে কার্সর-বেসড পেজিনেশন কেন?

অফসেট পেজিনেশনে (`LIMIT 20 OFFSET 40`), ইউজার স্ক্রল করার সময় যদি ৫টা নতুন পোস্ট যোগ হয়, তাহলে পেজ ৩ এ পেজ ২ এর পোস্টগুলোর ডুপ্লিকেট দেখাবে। কার্সর-বেসড পেজিনেশন (`WHERE id &lt; cursor LIMIT 20`) স্থিতিশীল — নতুন কিছু যোগ হলেও সেটা সবসময় ঠিক যেখানে থেমেছিলে সেখান থেকেই তুলে নেয়। ইনফিনিট স্ক্রলের জন্য এটা গুরুত্বপূর্ণ, যেখানে ইউজাররা মিনিটের পর মিনিট ফিড স্ক্রল করে কাটায়।

### খাঁটি ক্রনোলজিক্যালের বদলে র‍্যাঙ্ক কেন?

ক্রনোলজিক্যাল ফিড তোমাকে সবচেয়ে সাম্প্রতিক যা পোস্ট হয়েছে তা-ই দেখায়, সেটা অপ্রাসঙ্গিক হলেও। র‍্যাঙ্কিং একটা রিভার্স-ক্রনোলজিক্যাল লিস্টকে পার্সোনালাইজড অভিজ্ঞতায় রূপান্তরিত করে। এমনকি একটা সাধারণ ফর্মুলা (recency + engagement + affinity) নাটকীয়ভাবে এনগেজমেন্ট বাড়ায় কারণ ইউজাররা প্রথমেই উঁচু মানের কনটেন্ট দেখে। Instagram এর ২০১৬ সালে ক্রনোলজিক্যাল থেকে র‍্যাঙ্কড ফিডে সরে যাওয়া এনগেজমেন্ট উল্লেখযোগ্যভাবে বাড়িয়েছিল, কারণ ক্রনোলজিক্যাল অর্ডারে ইউজাররা ৭০% পোস্ট মিস করছিল।

### ফিডের জন্য eventual consistency কেন?

একজন ইউজার যখন পোস্ট করে, তার ফলোয়ারদের সেটা তাদের ফিডে সাথে সাথে দেখার দরকার নেই। ১-২ সেকেন্ড দেরি পুরোপুরি গ্রহণযোগ্য। এই শিথিলতা আমাদের সিঙ্ক্রোনাস রাইটের বদলে async ফ্যান-আউট (message queue) ব্যবহার করতে দেয়, যা লক্ষ লক্ষ ফলোয়ার আছে এমন ইউজারদের পোস্ট পোস্ট-তৈরির API ব্লক না করে সামলানোর একমাত্র উপায়।

<div class="takeaways">

### মূল শিক্ষা

- হাইব্রিড ফ্যান-আউট (সাধারণ ইউজারদের জন্য পুশ, সেলিব্রিটিদের জন্য পুল) হলো ইন্ডাস্ট্রি স্ট্যান্ডার্ড অ্যাপ্রোচ
- কার্সর-বেসড পেজিনেশন ইনফিনিট স্ক্রলের সময় ডুপ্লিকেট/মিসিং পোস্ট রোধ করে, অফসেট পেজিনেশনের বিপরীতে
- র‍্যাঙ্কিং একটা রিভার্স-ক্রনোলজিক্যাল লিস্টকে পার্সোনালাইজড অভিজ্ঞতায় রূপান্তরিত করে — এমনকি একটা সাধারণ স্কোর ফর্মুলাও নাটকীয়ভাবে এনগেজমেন্ট বাড়ায়
- সেলিব্রিটি পোস্ট ফ্যান-আউট স্টর্ম এড়াতে অন-রিড ফেচ করা উচিত (৫০M ফলোয়ারের কাছে একটা পোস্ট = ৫০M রাইট)
- আগে থেকে কম্পিউট করা ফিড স্টোরেজের বিনিময়ে গতি দেয় — একটা ফিড পড়া মানে শুধু একটা sorted লিস্ট পড়া
- রিয়েল-টাইম "নতুন পোস্ট" কাউন্টার জোর করে ফিড রিফ্রেশ না করেই এনগেজমেন্ট তৈরি করে

</div>

<div class="when-to-use">

### বাস্তব জগতে ব্যবহার

- **Twitter/X** হাইব্রিড ফ্যান-আউট ব্যবহার করে: ১০K এর কম ফলোয়ার আছে এমন ইউজারদের জন্য পুশ, সেলিব্রিটিদের জন্য পুল — টাইমলাইন Redis থেকে সার্ভ করা হয়
- **Facebook** একটা মাল্টি-স্টেজ ML পাইপলাইন ব্যবহার করে প্রতি ফিড লোডে ~২০০০ ক্যান্ডিডেট পোস্ট র‍্যাঙ্ক করে
- **Instagram** ২০১৬ সালে ক্রনোলজিক্যাল থেকে র‍্যাঙ্কড ফিডে সরে গিয়েছিল আর এনগেজমেন্টে উল্লেখযোগ্য বৃদ্ধি দেখেছিল
- **LinkedIn** একটা টু-পাস র‍্যাঙ্কিং সিস্টেম ব্যবহার করে: প্রথম পাস ক্যান্ডিডেট আনে, দ্বিতীয় পাস পার্সোনালাইজড স্কোরিং প্রয়োগ করে
- এই আর্কিটেকচার ৫০০M+ ডেইলি অ্যাক্টিভ ইউজারের জন্য ২০০ms এর নিচে পার্সোনালাইজড ফিড সার্ভ করে

</div>
