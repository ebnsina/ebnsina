---
title: 'Dynamic Programming'
subtitle: 'জটিল সমস্যাকে overlapping subproblem-এ ভেঙে ফেলুন — shortest path, text diffing আর optimization-এর পেছনের টেকনিক।'
chapter: 8
level: 'advanced'
readingTime: '20 মিনিট'
topics: ['dynamic programming', 'memoization', 'tabulation', 'optimization']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরিকে অঙ্ক স্যার একটা মজার হোমওয়ার্ক দিয়েছেন — বাড়ির সিঁড়িতে মোট ১০টা ধাপ, একবারে এক ধাপ বা দুই ধাপ ওঠা যায়; কতভাবে উপরে পৌঁছানো যায় বের করতে হবে। ফাতিমা আল-ফিহরি প্রথমে বোকার মতো করে — ১০ নম্বর ধাপে পৌঁছাতে হলে আগে ৯ আর ৮ নম্বর ধাপে কতভাবে পৌঁছানো যায় জানা লাগে, তার জন্য আবার ৮, ৭, ৬... করে প্রতিবার একদম গোড়া থেকে গুনতে বসে। খেয়াল করলে দেখা যায়, "৫ নম্বর ধাপে কতভাবে?" — এই একই ছোট হিসাবটা সে দিনের মধ্যে বিশবার নতুন করে কষছে। কাগজ ভরে যায়, হাত ব্যথা হয়, তাও শেষ হয় না।

পাশের রুম থেকে বড় ভাই ইবনে সিনা এসে বলে — "একই জিনিস বারবার গুনছিস কেন? একবার যেটা বের করবি, খাতার মার্জিনে লিখে রাখ।" এবার ফাতিমা আল-ফিহরি প্রতিটা ধাপের উত্তর একবারই কষে, পাশে টুকে রাখে; পরেরবার "৫ নম্বর ধাপ" লাগলেই আর গোনে না, মার্জিন থেকে চোখ বুলিয়ে তুলে নেয়। প্রতিটা ধাপের উত্তর হয়ে যায় তার ঠিক নিচের দুই ধাপের যোগফল — লেখা থাকলে সেকেন্ডে বসে যায়। বিশাল খাটুনি নেমে আসে একটা ঝটপট খাতা-দেখা কাজে।

এই গল্পটাই আসলে **dynamic programming**। প্রতিটা ধাপের হিসাব হলো একটা **subproblem**, আর "৫ নম্বর ধাপ"-এর মতো একই ছোট হিসাব বড় হিসাবের ভেতরে ঘুরেফিরে বারবার লাগছে — এটাই **overlapping subproblems**। প্রতিটা উত্তর একবার কষে মার্জিনে লিখে রেখে পরে শুধু তুলে নেওয়া, নতুন করে না গোনা — এটাই **memoization** আর **reuse**, DP-র পুরো মূল কথা। বাস্তবে ঠিক এভাবেই দুটো ফাইলের পার্থক্য বের করা (text diff), ম্যাপে সবচেয়ে ছোট রাস্তা খোঁজা, কিংবা অটোকারেক্টে বানান মেলানো — এসব একই ছোট হিসাব বারবার না কষে একবার জমিয়ে রেখে দ্রুত সমাধান করা হয়।

## Dynamic Programming কী?

Dynamic programming (DP) হলো এমন সমস্যা সমাধানের একটা টেকনিক যেগুলোর দুটো property থাকে:

1. **Optimal substructure**: optimal solution-এর ভেতরে subproblem-গুলোর optimal solution থাকে
2. **Overlapping subproblems**: একই subproblem বারবার solve করা হয়

DP subproblem-গুলোর result জমিয়ে রেখে redundant কাজ এড়িয়ে যায়। ব্যস, এটুকুই। এটা কোনো ম্যাজিক না — এটা caching।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা শহর পার হওয়ার সবচেয়ে সস্তা route হিসাব করার মতো — point A থেকে point B পর্যন্ত cost প্রতিবার নতুন করে হিসাব না করে, আপনি result-টা সেভ করে রাখেন আর যখন অন্য কোনো route একই segment দিয়ে যায় তখন সেটা আবার ব্যবহার করেন।

</Callout>

## Top-Down (Memoization)

মূল সমস্যা থেকে শুরু করুন, recurse করুন, আর result cache করে রাখুন।

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

সবচেয়ে ছোট subproblem থেকে শুরু করে উপরের দিকে solution বানান। প্রায়ই এটা বেশি space-efficient হয়।

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

## ক্লাসিক DP সমস্যা

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

**DP-এর রেসিপি:**

1. state ডিফাইন করুন — কোন variable-গুলো একটা subproblem-কে বর্ণনা করে?
2. recurrence ডিফাইন করুন — current state ছোট state-গুলোর সাথে কীভাবে সম্পর্কিত?
3. base case ডিফাইন করুন — সবচেয়ে ছোট subproblem-গুলো কী কী?
4. direction ঠিক করুন — top-down (memoization) নাকি bottom-up (tabulation)?

</Callout>

## মূল যা শিখলাম

1. **DP = recursion + caching** — এর চেয়ে বেশি রহস্যময় কিছু না
2. **Top-down** লিখতে সহজ; **bottom-up** বাস্তবে প্রায়ই বেশি fast
3. আগে **state চিনে ফেলুন** — বাকিটা যান্ত্রিকভাবেই এসে যায়
4. বাস্তব ব্যবহার: text diff (LCS), shortest path (Dijkstra), compiler optimization, financial modeling
