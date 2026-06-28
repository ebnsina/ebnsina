---
title: 'Dynamic Programming'
subtitle: 'Break complex problems into overlapping subproblems — the technique behind shortest paths, text diffing, and optimization.'
chapter: 8
level: 'advanced'
readingTime: '20 min'
topics: ['dynamic programming', 'memoization', 'tabulation', 'optimization']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is Dynamic Programming?

Dynamic programming (DP) is a technique for solving problems that have two properties:

1. **Optimal substructure**: The optimal solution contains optimal solutions to subproblems
2. **Overlapping subproblems**: The same subproblems are solved multiple times

DP avoids redundant work by storing results of subproblems. That's it. It's not magic — it's caching.

<Callout type="info">

**Real-World Analogy**

Like calculating the cheapest route across a city — instead of recalculating the cost from point A to point B every time, you save the result and reuse it when another route passes through the same segment.

</Callout>

## Top-Down (Memoization)

Start with the original problem, recurse, and cache results.

```typescript
// Fibonacci — naive recursion is O(2^n), memoized is O(n)
function fib(n: number, memo = new Map<number, number>()): number {
	if (n <= 1) return n;
	if (memo.has(n)) return memo.get(n)!;

	const result = fib(n - 1, memo) + fib(n - 2, memo);
	memo.set(n, result);
	return result;
}
```

## Bottom-Up (Tabulation)

Build the solution from smallest subproblems up. Often more space-efficient.

```typescript
// Fibonacci — bottom-up, O(1) space
function fibBottomUp(n: number): number {
	if (n <= 1) return n;
	let prev = 0,
		curr = 1;

	for (let i = 2; i <= n; i++) {
		[prev, curr] = [curr, prev + curr];
	}
	return curr;
}
```

## Classic DP Problems

### Climbing Stairs

```typescript
// How many ways to climb n stairs taking 1 or 2 steps at a time?
function climbStairs(n: number): number {
	if (n <= 2) return n;
	let prev = 1,
		curr = 2;

	for (let i = 3; i <= n; i++) {
		[prev, curr] = [curr, prev + curr];
	}
	return curr;
}
```

### Longest Common Subsequence

```typescript
function lcs(text1: string, text2: string): number {
	const m = text1.length,
		n = text2.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (text1[i - 1] === text2[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}
	return dp[m][n];
}
```

### Coin Change

```typescript
function coinChange(coins: number[], amount: number): number {
	const dp = new Array(amount + 1).fill(Infinity);
	dp[0] = 0;

	for (let i = 1; i <= amount; i++) {
		for (const coin of coins) {
			if (coin <= i) {
				dp[i] = Math.min(dp[i], dp[i - coin] + 1);
			}
		}
	}
	return dp[amount] === Infinity ? -1 : dp[amount];
}
```

<Callout type="tip">

**The DP recipe:**

1. Define the state — what variables describe a subproblem?
2. Define the recurrence — how does the current state relate to smaller states?
3. Define the base cases — what are the smallest subproblems?
4. Decide direction — top-down (memoization) or bottom-up (tabulation)?

</Callout>

## Key Takeaways

1. **DP = recursion + caching** — nothing more mystical than that
2. **Top-down** is easier to write; **bottom-up** is often faster in practice
3. **Identify the state** first — the rest follows mechanically
4. Real-world uses: text diff (LCS), shortest paths (Dijkstra), compiler optimization, financial modeling
