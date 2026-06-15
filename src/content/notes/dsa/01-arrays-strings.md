---
title: "Arrays & Strings"
subtitle: "Master the two most fundamental data structures — contiguous memory, indexing, and common manipulation patterns."
chapter: 1
level: "beginner"
readingTime: "12 min"
topics: ["arrays", "strings", "two pointers", "sliding window"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Arrays First?

Arrays are the most basic data structure in computing. Every other data structure is either built on top of arrays or compared against them. Understanding how arrays work in memory — contiguous blocks with O(1) random access — is the foundation for everything else.

<Callout type="info">

**Real-World Analogy**

Like a row of lockers in a gym — each locker has a fixed number (index), and you can go directly to locker #47 without checking all the others. But if a new locker is added at the front, every number shifts.

</Callout>

## How Arrays Work in Memory

An array stores elements in **contiguous memory locations**. This means if the first element is at address `0x100` and each element takes 4 bytes, element `i` is at address `0x100 + (i × 4)`.

This is why array access is O(1) — it's just arithmetic.

```typescript
// Arrays in TypeScript
const nums: number[] = [10, 20, 30, 40, 50];

// O(1) access — direct index
console.log(nums[3]); // 40

// O(n) insertion at beginning — everything shifts
nums.unshift(5); // [5, 10, 20, 30, 40, 50]

// O(1) insertion at end (amortized)
nums.push(60); // [5, 10, 20, 30, 40, 50, 60]
```

## Two Pointer Pattern

The two pointer technique is the most common array pattern. Use two indices that move toward each other (or in the same direction) to solve problems in O(n) instead of O(n²).

```typescript
// Check if a string is a palindrome
function isPalindrome(s: string): boolean {
  let left = 0;
  let right = s.length - 1;

  while (left < right) {
    if (s[left] !== s[right]) return false;
    left++;
    right--;
  }
  return true;
}

// Two Sum (sorted array) — O(n)
function twoSum(nums: number[], target: number): [number, number] | null {
  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    const sum = nums[left] + nums[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return null;
}
```

## Sliding Window Pattern

When you need to find a subarray or substring that meets some condition, the sliding window lets you do it in O(n) by maintaining a "window" that expands and contracts.

```typescript
// Maximum sum subarray of size k
function maxSubarraySum(nums: number[], k: number): number {
  let windowSum = 0;
  let maxSum = -Infinity;

  for (let i = 0; i < nums.length; i++) {
    windowSum += nums[i];

    if (i >= k - 1) {
      maxSum = Math.max(maxSum, windowSum);
      windowSum -= nums[i - k + 1];
    }
  }
  return maxSum;
}

// Longest substring without repeating characters
function lengthOfLongestSubstring(s: string): number {
  const seen = new Map<string, number>();
  let maxLen = 0;
  let start = 0;

  for (let end = 0; end < s.length; end++) {
    if (seen.has(s[end]) && seen.get(s[end])! >= start) {
      start = seen.get(s[end])! + 1;
    }
    seen.set(s[end], end);
    maxLen = Math.max(maxLen, end - start + 1);
  }
  return maxLen;
}
```

<Callout type="tip">

**When to use each pattern:**
- **Two pointers**: sorted arrays, palindromes, pair/triplet finding
- **Sliding window**: subarray/substring problems with a size or condition constraint

</Callout>

## Complexity Cheat Sheet

| Operation | Array | String (immutable) |
|-----------|-------|-------------------|
| Access by index | O(1) | O(1) |
| Search | O(n) | O(n) |
| Insert at end | O(1)* | O(n) |
| Insert at start | O(n) | O(n) |
| Delete | O(n) | O(n) |

\* Amortized — occasional resizing costs O(n), but averaged over many insertions it's O(1).

## Key Takeaways

1. **Arrays give O(1) access** because of contiguous memory layout
2. **Two pointers** eliminate the need for nested loops on sorted data
3. **Sliding window** turns O(n×k) subarray problems into O(n)
4. **Strings are immutable arrays** — rebuilding them costs O(n), so use arrays of characters when you need to mutate

