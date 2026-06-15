---
title: "Graphs"
subtitle: "Represent relationships between entities — social networks, maps, dependencies — with BFS, DFS, and adjacency lists."
chapter: 6
level: "intermediate"
readingTime: "18 min"
topics: ["graph", "adjacency list", "BFS", "DFS", "topological sort"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Graphs?

Graphs model relationships. Social networks (who follows whom), maps (roads between cities), dependency trees (build order), web pages (links) — all graphs. If your problem involves connections between things, you're dealing with a graph.

<Callout type="info">

**Real-World Analogy**

Like an airline route map — cities are nodes, flight routes are edges. Some routes are direct, some require layovers. Finding the cheapest path from New York to Tokyo is a classic graph problem.

</Callout>

## Representing Graphs

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

## DFS and BFS on Graphs

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

Order nodes so that every directed edge goes from earlier to later. Used for build systems, course prerequisites, task scheduling.

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

**BFS vs DFS**: Use BFS when you need shortest path (unweighted) or level-by-level exploration. Use DFS when you need to explore all paths, detect cycles, or do topological sorting.

</Callout>

## Key Takeaways

1. **Adjacency lists** are the go-to representation — space-efficient and easy to traverse
2. **Always track visited nodes** to avoid infinite loops in graphs with cycles
3. **BFS finds shortest paths** in unweighted graphs; **DFS explores all paths**
4. **Topological sort** is essential for dependency resolution

