---
title: "Hash Maps & Sets"
subtitle: "Turn O(n) lookups into O(1) with hash-based data structures — the most practically useful tool in your kit."
chapter: 2
level: "beginner"
readingTime: "14 min"
topics: ["hash map", "hash set", "collision handling", "frequency counting"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Hash Maps Matter

Hash maps (also called dictionaries, associative arrays, or objects) are arguably the most important data structure in practical programming. They give you O(1) average-case lookups, insertions, and deletions. If you're ever doing repeated lookups in an array, a hash map is almost certainly the answer.

<Callout type="info">

**Real-World Analogy**

Like a phone contact list — each name maps directly to a phone number. You don't scroll through every contact; you search by name and jump straight to it. That's exactly how a hash map works: constant-time lookup by key.

</Callout>

## How Hashing Works

A hash function converts a key into an array index. The simplest version:

```typescript
function simpleHash(key: string, size: number): number {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) % size;
  }
  return hash;
}
```

When two keys produce the same index (a **collision**), common strategies include:
- **Chaining**: Each bucket holds a linked list of entries
- **Open addressing**: Probe the next available slot

## Practical Patterns

### Frequency Counting

The most common hash map pattern — count occurrences of elements.

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
    const key = s.split("").sort().join("");
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

**Hash maps vs. sorting**: Many problems can be solved by either sorting (O(n log n)) or using a hash map (O(n) time, O(n) space). Hash maps trade space for time — usually worth it.

</Callout>

## Complexity

| Operation | Average | Worst Case |
|-----------|---------|------------|
| Get | O(1) | O(n) |
| Set | O(1) | O(n) |
| Delete | O(1) | O(n) |
| Has | O(1) | O(n) |

Worst case happens with pathological hash collisions — extremely rare with good hash functions.

## Key Takeaways

1. **Default to hash maps** when you need fast lookups by key
2. **Frequency counting** is the #1 hash map pattern — learn it cold
3. **Sets** are hash maps without values — perfect for membership checks and deduplication
4. **Trade space for time**: O(n) extra memory for O(1) lookups is almost always worth it

