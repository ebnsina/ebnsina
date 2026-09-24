---
title: 'Sorting Algorithms'
subtitle: 'Merge sort, quicksort, আর কখন কোনটা ব্যবহার করবেন — সাথে sorted data থেকে যেসব প্যাটার্ন বেরিয়ে আসে।'
chapter: 7
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['merge sort', 'quicksort', 'binary search', 'sorting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনা স্যার ক্লাস নাইনের ফাইনাল পরীক্ষার খাতাগুলো হাতে নিয়ে বসেছেন — চল্লিশটা খাতা, রোল নম্বর অনুযায়ী সাজাতে হবে। প্রথমে তিনি পুরনো অভ্যাসে করলেন — পাশাপাশি দুটো খাতা দেখেন, উল্টো থাকলে জায়গা বদলে দেন, তারপর পরের জোড়া। এক পাস শেষ হলে আবার শুরু থেকে, আবার আরেক পাস। প্রতিটা পাসে শুধু একটা খাতা তার ঠিক জায়গায় বসে। চল্লিশটা খাতার জন্য এভাবে বারবার পাস দিতে গিয়ে দুপুর গড়িয়ে বিকেল — কারণ খাতার সংখ্যা দ্বিগুণ হলে খাটনি চারগুণ হয়।

পরের বছর সিনা স্যার চালাকি করলেন। চল্লিশটা খাতা তিনি খোয়ারিজমি আর ফাতিমার মধ্যে ভাগ করে দিলেন — যে যার ছোট স্তূপটা আলাদাভাবে রোল অনুযায়ী সাজিয়ে ফেলল, ছোট স্তূপ সাজানো সহজ। তারপর দুই সাজানো স্তূপ পাশাপাশি রেখে দুজনের হাতের ওপরের খাতা দুটোর মধ্যে যেটার রোল ছোট, সেটাই আগে নতুন স্তূপে — এভাবে একবার করে টেনে নিতেই পুরো সাজানো খাতা তৈরি। ভাগ করো, ছোট অংশ সাজাও, তারপর মিলিয়ে নাও — কাজ শেষ চোখের পলকে।

এই দুটো পদ্ধতিই আসলে দুই ধরনের **sorting**। প্রথম, বারবার পাশের জিনিসের সাথে তুলনা করে জায়গা বদলানো — **bubble sort**/**insertion sort**, খাতা দ্বিগুণ হলে খাটনি চারগুণ, তাই **O(n²)**। দ্বিতীয়, স্তূপ ভাগ করে ছোট অংশ সাজিয়ে merge করা — এটাই **merge sort**, যার মূল কৌশল **divide and conquer**, খরচ অনেক কম **O(n log n)**। বাস্তবে যখন হাজার-লাখ রেকর্ড সাজাতে হয় — ধরুন ই-কমার্স সাইটে দাম বা রেটিং অনুযায়ী প্রোডাক্ট সাজানো — তখন এই O(n log n) পদ্ধতিগুলোই (merge sort, quicksort) কাজে লাগে, আর তাই ভাষার built-in `sort` ঠিক এই আইডিয়ার ওপরই দাঁড়িয়ে।

## Why Learn Sorting?

আপনি খুব কমই scratch থেকে কোনো sort লিখবেন — কিন্তু এগুলো কীভাবে কাজ করে সেটা বুঝলে আপনি জানবেন কখন sort করতে হবে, এর খরচ কত, আর কীভাবে binary search ও two pointers দিয়ে sorted data কাজে লাগাতে হবে।

<Callout type="info">

**Real-World Analogy**

শেলফে বই সাজানোর মতো — Bubble sort পাশাপাশি থাকা বইগুলো তুলনা করে আর swap করে। Merge sort বইগুলোকে গ্রুপে ভাগ করে, প্রতিটি গ্রুপ sort করে, তারপর merge করে। Quick sort একটা বইকে reference হিসেবে নেয় আর ছোটগুলো বামে, বড়গুলো ডানে রাখে।

</Callout>

## Merge Sort — Divide and Conquer

array-কে অর্ধেক করে ভাগ করুন, প্রতিটি অর্ধেক sort করুন, তারপর আবার merge করুন। সবসময় O(n log n), stable, কিন্তু O(n) extra space লাগে।

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

একটা pivot বেছে নিন, তার চারপাশে element গুলো partition করুন, তারপর recurse করুন। average-এ O(n log n), worst case-এ O(n²), কিন্তু in-place।

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

একবার data sorted হয়ে গেলে, binary search যেকোনো element কে O(log n)-এ খুঁজে বের করে।

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

**Binary search শুধু array-র জন্য নয়।** যখনই আপনার কাছে একটা monotonic function থাকে (সবসময় বাড়ছে বা সবসময় কমছে), তখন আপনি answer-এর উপর binary search করতে পারেন। optimization সমস্যার জন্য এটা একটা শক্তিশালী technique।

</Callout>

## Comparison

| Algorithm          | Best       | Average    | Worst      | Space    | Stable? |
| ------------------ | ---------- | ---------- | ---------- | -------- | ------- |
| Merge Sort         | O(n log n) | O(n log n) | O(n log n) | O(n)     | Yes     |
| Quicksort          | O(n log n) | O(n log n) | O(n²)      | O(log n) | No      |
| Timsort (built-in) | O(n)       | O(n log n) | O(n log n) | O(n)     | Yes     |

## Key Takeaways

1. **built-in sort ব্যবহার করুন** (Timsort) সাধারণ কাজের জন্য — এটা real-world data-র জন্য optimized
2. **Merge sort** যখন আপনার stability আর guaranteed O(n log n) দরকার
3. **Quicksort** যখন আপনার in-place sorting দরকার আর মাঝেমধ্যে O(n²) মেনে নিতে পারেন
4. **Binary search** হলো sorted data-র পুরস্কার — এটা রপ্ত করুন
