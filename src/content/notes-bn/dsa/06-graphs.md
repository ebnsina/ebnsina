---
title: 'Graphs'
subtitle: 'এনটিটিগুলোর মধ্যে সম্পর্ক প্রকাশ করুন — সোশ্যাল নেটওয়ার্ক, ম্যাপ, ডিপেন্ডেন্সি — BFS, DFS আর adjacency list দিয়ে।'
chapter: 6
level: 'intermediate'
readingTime: '18 মিনিট'
topics: ['graph', 'adjacency list', 'BFS', 'DFS', 'topological sort']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিম থাকে মিরপুরে, আর তার বন্ধু ফাতেমা থাকে ধানমন্ডিতে। করিম একদিন বাসে করে ফাতেমার বাসায় যাবে ঠিক করল। শহরের বাস-ম্যাপটা খুলে দেখল — প্রতিটা বাস স্টপ যেন একেকটা বিন্দু, আর দুই স্টপের মধ্যে বাস রুট থাকলে সেই দুটো বিন্দু একটা লাইন দিয়ে জোড়া। কিছু রুট আবার একমুখী — এক স্টপ থেকে আরেক স্টপে বাস যায়, কিন্তু ওই একই রুটে ফেরত আসে না। আবার কিছু রুট ছোট, কয়েক মিনিটেই পার হয়ে যায়; কিছু রুট লম্বা, ভাড়াও বেশি, সময়ও বেশি।

করিম দুইভাবে রাস্তা খুঁজতে পারে। এক — নিজের স্টপ থেকে শুরু করে আগে সবচেয়ে কাছের স্টপগুলো দেখবে, তারপর তার পরের রিং, তারপর তার পরের রিং — এভাবে ঢেউয়ের মতো ছড়িয়ে ছড়িয়ে ফাতেমার স্টপ খুঁজবে। এতে সবচেয়ে কম স্টপ পার হওয়া রাস্তাটা আগে পাওয়া যায়। দুই — যেকোনো একটা রুট ধরে সেটার শেষ মাথা পর্যন্ত টানা যাবে, ওখানে ফাতেমার স্টপ না পেলে পিছিয়ে এসে পরের রুট ধরবে। প্রথমটায় দ্রুত কাছের রাস্তা মেলে, দ্বিতীয়টায় ম্যাপের প্রতিটা কোনা একে একে চষে ফেলা যায়।

এই গল্পটাই আসলে **graph**। প্রতিটা বাস স্টপ হলো একটা **node** (বা **vertex**), আর দুই স্টপের মধ্যেকার রুট হলো একটা **edge**। একমুখী রুটগুলো **directed** edge, আর যে রুটে ভাড়া/সময় হিসাব করা হয় সেগুলো **weighted** edge। করিমের প্রথম কৌশল — রিং বাই রিং কাছের স্টপ আগে দেখা — হলো **BFS**, যেটা সবচেয়ে কম স্টপের (shortest) রাস্তা আগে বের করে। দ্বিতীয় কৌশল — এক রুট শেষ পর্যন্ত ধরে তারপর backtrack — হলো **DFS**। আর সবচেয়ে কম ভাড়া বা সবচেয়ে ছোট রাস্তাটা বের করাই **shortest path**। বাস্তবে Google Maps ঠিক এভাবেই দুই জায়গার মধ্যে রাস্তা বের করে, আর Facebook-এর মতো social network-এ "আপনার বন্ধুর বন্ধু" খুঁজে বের করাও একই graph সমস্যা।

## Graphs কেন?

Graph দিয়ে সম্পর্ক মডেল করা হয়। সোশ্যাল নেটওয়ার্ক (কে কাকে ফলো করে), ম্যাপ (শহরগুলোর মধ্যে রাস্তা), ডিপেন্ডেন্সি ট্রি (build order), ওয়েব পেজ (লিংক) — সবই graph। আপনার সমস্যায় যদি জিনিসগুলোর মধ্যে কানেকশন থাকে, তাহলে আপনি আসলে একটা graph নিয়েই কাজ করছেন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা এয়ারলাইন রুট ম্যাপের মতো — শহরগুলো হলো node, ফ্লাইট রুটগুলো হলো edge। কিছু রুট direct, কিছুতে layover লাগে। New York থেকে Tokyo পর্যন্ত সবচেয়ে সস্তা path বের করা হলো একটা ক্লাসিক graph সমস্যা।

</Callout>

## Graph রিপ্রেজেন্ট করা

```typescript
// Adjacency list — most common, space-efficient
type Graph = Map<string, string[]>;

function buildGraph(edges: [string, string][]): Graph {
	const graph: Graph = new Map();

	for (const [from, to] of edges) {
		if (!graph.has(from)) graph.set(from, []);
		if (!graph.has(to)) graph.set(to, []);
		graph.get(from)!.push(to);
		graph.get(to)!.push(from); // omit for directed graph
	}
	return graph;
}
```

## Graph-এ DFS আর BFS

```typescript
// DFS — go deep, then backtrack
function dfs(graph: Graph, start: string): string[] {
	const visited = new Set<string>();
	const result: string[] = [];

	function visit(node: string) {
		if (visited.has(node)) return;
		visited.add(node);
		result.push(node);
		for (const neighbor of graph.get(node) || []) {
			visit(neighbor);
		}
	}

	visit(start);
	return result;
}

// BFS — explore level by level
function bfs(graph: Graph, start: string): string[] {
	const visited = new Set<string>([start]);
	const queue: string[] = [start];
	const result: string[] = [];

	while (queue.length) {
		const node = queue.shift()!;
		result.push(node);

		for (const neighbor of graph.get(node) || []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}
	return result;
}
```

## Topological Sort

Node-গুলোকে এমনভাবে সাজান যাতে প্রতিটা directed edge আগের থেকে পরের দিকে যায়। এটা build system, কোর্সের prerequisite, task scheduling-এ ব্যবহার হয়।

```typescript
function topologicalSort(graph: Map<string, string[]>): string[] {
	const visited = new Set<string>();
	const result: string[] = [];

	function dfs(node: string) {
		if (visited.has(node)) return;
		visited.add(node);
		for (const neighbor of graph.get(node) || []) {
			dfs(neighbor);
		}
		result.push(node); // add after all dependencies
	}

	for (const node of graph.keys()) {
		dfs(node);
	}

	return result.reverse();
}
```

<Callout type="info">

**BFS vs DFS**: যখন shortest path (unweighted) বা লেভেল-বাই-লেভেল exploration দরকার তখন BFS ব্যবহার করুন। যখন সব path explore করা, cycle detect করা, বা topological sorting দরকার তখন DFS ব্যবহার করুন।

</Callout>

## মূল কথা

1. **Adjacency list** হলো সবচেয়ে বেশি ব্যবহৃত রিপ্রেজেন্টেশন — space-efficient আর traverse করা সহজ
2. **সবসময় visited node track করুন** — cycle থাকা graph-এ infinite loop এড়াতে
3. **BFS unweighted graph-এ shortest path বের করে**; **DFS সব path explore করে**
4. **Topological sort** ডিপেন্ডেন্সি resolution-এর জন্য অপরিহার্য
