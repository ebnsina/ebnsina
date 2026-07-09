---
title: 'Hash Maps & Sets'
subtitle: 'হ্যাশ-ভিত্তিক ডেটা স্ট্রাকচার দিয়ে O(n) lookup-কে O(1)-তে নামিয়ে আনুন — আপনার টুলকিটের সবচেয়ে ব্যবহারিক জিনিস।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['hash map', 'hash set', 'collision handling', 'frequency counting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Hash Maps Matter

Hash map (এগুলোকে dictionary, associative array বা object-ও বলা হয়) ব্যবহারিক প্রোগ্রামিংয়ে সম্ভবত সবচেয়ে গুরুত্বপূর্ণ ডেটা স্ট্রাকচার। এগুলো আপনাকে গড়ে O(1) lookup, insertion আর deletion দেয়। কোনো array-তে যদি বারবার lookup করতে হয়, তাহলে hash map প্রায় নিশ্চিতভাবেই উত্তর।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ফোনের কন্টাক্ট লিস্টের মতো — প্রতিটি নাম সরাসরি একটা ফোন নম্বরে ম্যাপ করা থাকে। আপনি প্রতিটা কন্টাক্ট স্ক্রল করেন না; নাম দিয়ে খোঁজেন আর সোজা সেটাতে চলে যান। hash map ঠিক এভাবেই কাজ করে: key দিয়ে constant-time lookup।

</Callout>

## How Hashing Works

একটা hash function একটা key-কে array index-এ রূপান্তর করে। সবচেয়ে সহজ ভার্সনটা:

```typescript
function simpleHash(key: string, size: number): number {
	let hash = 0;
	for (const char of key) {
		hash = (hash * 31 + char.charCodeAt(0)) % size;
	}
	return hash;
}
```

যখন দুটো key একই index তৈরি করে (একটা **collision**), তখন সাধারণ কিছু কৌশল হলো:

- **Chaining**: প্রতিটা bucket entry-গুলোর একটা linked list ধরে রাখে
- **Open addressing**: পরের খালি slot-টা probe করা

## Practical Patterns

### Frequency Counting

সবচেয়ে কমন hash map প্যাটার্ন — element-গুলোর occurrence গোনা।

```typescript
function topKFrequent(nums: number[], k: number): number[] {
	const freq = new Map<number, number>();
	for (const n of nums) {
		freq.set(n, (freq.get(n) || 0) + 1);
	}

	return [...freq.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, k)
		.map(([num]) => num);
}
```

### Two Sum (Unsorted) — The Classic

```typescript
function twoSum(nums: number[], target: number): [number, number] | null {
	const seen = new Map<number, number>(); // value -> index

	for (let i = 0; i < nums.length; i++) {
		const complement = target - nums[i];
		if (seen.has(complement)) {
			return [seen.get(complement)!, i];
		}
		seen.set(nums[i], i);
	}
	return null;
}
```

### Group Anagrams

```typescript
function groupAnagrams(strs: string[]): string[][] {
	const groups = new Map<string, string[]>();

	for (const s of strs) {
		const key = s.split('').sort().join('');
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(s);
	}

	return [...groups.values()];
}
```

### Using Sets for Deduplication

```typescript
// Find the length of longest consecutive sequence
function longestConsecutive(nums: number[]): number {
	const set = new Set(nums);
	let best = 0;

	for (const n of set) {
		// Only start counting from sequence beginnings
		if (set.has(n - 1)) continue;

		let length = 1;
		let current = n;
		while (set.has(current + 1)) {
			current++;
			length++;
		}
		best = Math.max(best, length);
	}
	return best;
}
```

<Callout type="info">

**Hash map বনাম sorting**: অনেক সমস্যা হয় sorting দিয়ে (O(n log n)) নয়তো hash map দিয়ে (O(n) time, O(n) space) সমাধান করা যায়। Hash map time-এর জন্য space ব্যয় করে — সাধারণত এটা ভালোই লাভজনক।

</Callout>

## Complexity

| Operation | Average | Worst Case |
| --------- | ------- | ---------- |
| Get       | O(1)    | O(n)       |
| Set       | O(1)    | O(n)       |
| Delete    | O(1)    | O(n)       |
| Has       | O(1)    | O(n)       |

Worst case তখনই ঘটে যখন pathological hash collision হয় — ভালো hash function-এ এটা অত্যন্ত বিরল।

## Key Takeaways

1. **Hash map-কে ডিফল্ট ধরুন** যখন key দিয়ে দ্রুত lookup দরকার
2. **Frequency counting** হলো #1 hash map প্যাটার্ন — এটা পুরোপুরি রপ্ত করুন
3. **Set** হলো value ছাড়া hash map — membership check আর deduplication-এর জন্য পারফেক্ট
4. **Time-এর জন্য space ব্যয় করুন**: O(1) lookup-এর বিনিময়ে O(n) extra memory প্রায় সবসময়ই লাভজনক
