---
title: 'Sorting Algorithms'
subtitle: 'Merge sort, quicksort, and when to use which — plus the patterns that emerge from sorted data.'
chapter: 7
level: 'intermediate'
readingTime: '15 min'
topics: ['merge sort', 'quicksort', 'binary search', 'sorting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Learn Sorting?

You'll rarely implement a sort from scratch — but understanding how they work tells you when to sort, what it costs, and how to exploit sorted data with binary search and two pointers.

<Callout type="info">

**Real-World Analogy**

Like organizing books on a shelf — Bubble sort compares adjacent books and swaps them. Merge sort divides books into groups, sorts each group, then merges. Quick sort picks one book as a reference and puts smaller ones left, bigger ones right.

</Callout>

## Merge Sort — Divide and Conquer

Split the array in half, sort each half, merge them back. Always O(n log n), stable, but uses O(n) extra space.

```typescript
function mergeSort(arr: number[]): number[] {
	if (arr.length <= 1) return arr;

	const mid = Math.floor(arr.length / 2);
	const left = mergeSort(arr.slice(0, mid));
	const right = mergeSort(arr.slice(mid));

	return merge(left, right);
}

function merge(left: number[], right: number[]): number[] {
	const result: number[] = [];
	let i = 0,
		j = 0;

	while (i < left.length && j < right.length) {
		if (left[i] <= right[j]) result.push(left[i++]);
		else result.push(right[j++]);
	}

	return [...result, ...left.slice(i), ...right.slice(j)];
}
```

## Quicksort — Partition and Conquer

Pick a pivot, partition elements around it, recurse. O(n log n) average, O(n²) worst case, but in-place.

```typescript
function quickSort(arr: number[], lo = 0, hi = arr.length - 1): number[] {
	if (lo >= hi) return arr;

	const pivotIdx = partition(arr, lo, hi);
	quickSort(arr, lo, pivotIdx - 1);
	quickSort(arr, pivotIdx + 1, hi);
	return arr;
}

function partition(arr: number[], lo: number, hi: number): number {
	const pivot = arr[hi];
	let i = lo;

	for (let j = lo; j < hi; j++) {
		if (arr[j] < pivot) {
			[arr[i], arr[j]] = [arr[j], arr[i]];
			i++;
		}
	}
	[arr[i], arr[hi]] = [arr[hi], arr[i]];
	return i;
}
```

## Binary Search — Exploiting Sorted Data

Once data is sorted, binary search finds any element in O(log n).

```typescript
function binarySearch(arr: number[], target: number): number {
	let lo = 0;
	let hi = arr.length - 1;

	while (lo <= hi) {
		const mid = lo + Math.floor((hi - lo) / 2);
		if (arr[mid] === target) return mid;
		if (arr[mid] < target) lo = mid + 1;
		else hi = mid - 1;
	}
	return -1;
}
```

<Callout type="tip">

**Binary search is not just for arrays.** Any time you have a monotonic function (always increasing or always decreasing), you can binary search on the answer. This is a powerful technique for optimization problems.

</Callout>

## Comparison

| Algorithm          | Best       | Average    | Worst      | Space    | Stable? |
| ------------------ | ---------- | ---------- | ---------- | -------- | ------- |
| Merge Sort         | O(n log n) | O(n log n) | O(n log n) | O(n)     | Yes     |
| Quicksort          | O(n log n) | O(n log n) | O(n²)      | O(log n) | No      |
| Timsort (built-in) | O(n)       | O(n log n) | O(n log n) | O(n)     | Yes     |

## Key Takeaways

1. **Use the built-in sort** (Timsort) for general use — it's optimized for real-world data
2. **Merge sort** when you need stability and guaranteed O(n log n)
3. **Quicksort** when you need in-place sorting and can accept rare O(n²)
4. **Binary search** is the reward for sorted data — master it
