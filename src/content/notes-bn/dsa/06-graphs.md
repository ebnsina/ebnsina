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
