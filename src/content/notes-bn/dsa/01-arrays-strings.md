---
title: 'Arrays ও Strings'
subtitle: 'সবচেয়ে fundamental দুটি data structure আয়ত্ত করুন — contiguous memory, indexing, এবং common manipulation pattern।'
chapter: 1
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['arrays', 'strings', 'two pointers', 'sliding window']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিম কাজ করে পোস্ট অফিসে। দেয়ালজুড়ে লম্বা একটা সারিতে নম্বর দেওয়া pigeonhole — মানে চিঠি রাখার ছোট ছোট খোপ — পরপর সাজানো, #1, #2, #3 করে করে একদম শেষ পর্যন্ত। কেউ যদি বলে "লকার #47-এ চিঠি আছে কিনা দেখো", করিমকে এক এক করে গুনতে হয় না। সে জানে খোপগুলোর মাপ সমান আর পরপর বসানো, তাই শুরু থেকে ৪৭ ঘর সমান দূরত্বে হেঁটে সোজা #47-এ হাত দেয় — এক সেকেন্ড। এটাই হলো index দিয়ে সরাসরি পৌঁছানো, খরচ সবসময় সমান।

কিন্তু ঝামেলা হয় যখন নতুন একটা এলাকা যোগ হয় আর সেটার খোপ #10 আর #11-এর ঠিক মাঝখানে বসাতে হবে। খোপগুলো তো পরপর বসানো, মাঝখানে ফাঁকা জায়গা নেই। তাই করিমকে #11 থেকে শুরু করে শেষ খোপ পর্যন্ত প্রত্যেকটার চিঠি এক ঘর করে পেছনে সরাতে হয় — #11 যায় #12-তে, #12 যায় #13-তে, এভাবে সব। সারি যত বড়, ততই বেশি ঘর সরাতে হয়, তত বেশি খাটুনি।

এই সারিটাই আসলে একটা **array**। খোপগুলো memory-তে পরপর (contiguous) বসানো বলেই যেকোনো **index**-এ পৌঁছানো যায় এক ধাপে, খরচ **O(1)** — ঠিক করিমের সরাসরি #47-এ হাত দেওয়ার মতো। আর মাঝখানে নতুন কিছু **insert** করতে গেলে পরের সব element এক ঘর করে **shift** করতে হয়, তাই সেটা খরুচে। বাস্তবে যখন কোনো leaderboard-এ খেলোয়াড়দের score পরপর সাজানো থাকে, তখন র‍্যাঙ্ক ধরে সরাসরি কাউকে দেখা সস্তা, কিন্তু মাঝখানে নতুন কাউকে ঢোকানো — তখনই এই shift-এর খরচটা টের পাওয়া যায়।

## Arrays আগে কেন?

Arrays হলো computing-এর সবচেয়ে basic data structure। বাকি প্রতিটি data structure হয় arrays-এর উপর তৈরি, নয়তো এর সাথে তুলনা করা হয়। memory-তে arrays কীভাবে কাজ করে — O(1) random access সহ contiguous block — সেটা বোঝাই বাকি সবকিছুর ভিত্তি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

জিমে সারি সারি locker-এর মতো — প্রতিটি locker-এর একটা fixed নম্বর (index) আছে, আর আপনি বাকিগুলো না দেখেই সরাসরি locker #47-এ চলে যেতে পারেন। কিন্তু সামনে একটা নতুন locker যোগ করলে, প্রতিটা নম্বর shift হয়ে যায়।

</Callout>

## Memory-তে Arrays কীভাবে কাজ করে

একটা array তার element গুলো **contiguous memory location**-এ রাখে। মানে হলো, যদি প্রথম element থাকে `0x100` address-এ এবং প্রতিটা element 4 bytes নেয়, তাহলে element `i` থাকবে `0x100 + (i × 4)` address-এ।

এই কারণেই array access হয় O(1) — এটা শুধু arithmetic মাত্র।

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

Two pointer technique হলো সবচেয়ে common array pattern। দুটো index ব্যবহার করুন যেগুলো একে অপরের দিকে (বা একই দিকে) এগোয়, এতে O(n²)-এর বদলে O(n)-এ সমস্যা সমাধান করা যায়।

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

যখন আপনাকে এমন একটা subarray বা substring খুঁজে বের করতে হয় যা কোনো শর্ত পূরণ করে, তখন sliding window আপনাকে O(n)-এ সেটা করতে দেয় — একটা "window" রক্ষা করার মাধ্যমে যা expand আর contract হয়।

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

**কোন pattern কখন ব্যবহার করবেন:**

- **Two pointers**: sorted arrays, palindromes, pair/triplet খুঁজে বের করা
- **Sliding window**: size বা condition constraint সহ subarray/substring-এর সমস্যা

</Callout>

## Complexity Cheat Sheet

| Operation       | Array  | String (immutable) |
| --------------- | ------ | ------------------ |
| Access by index | O(1)   | O(1)               |
| Search          | O(n)   | O(n)               |
| Insert at end   | O(1)\* | O(n)               |
| Insert at start | O(n)   | O(n)               |
| Delete          | O(n)   | O(n)               |

\* Amortized — মাঝে মাঝে resizing-এর খরচ O(n), কিন্তু অনেকগুলো insertion-এর গড়ে সেটা O(1)।

## মূল শিক্ষা

1. **Arrays O(1) access দেয়** contiguous memory layout-এর কারণে
2. **Two pointers** sorted data-তে nested loop-এর প্রয়োজন দূর করে
3. **Sliding window** O(n×k) subarray সমস্যাকে O(n)-এ পরিণত করে
4. **Strings হলো immutable arrays** — এগুলো আবার তৈরি করতে O(n) খরচ হয়, তাই mutate করার দরকার হলে character-এর array ব্যবহার করুন
