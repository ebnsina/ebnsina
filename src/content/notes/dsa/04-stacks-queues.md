---
title: 'Stacks ও Queues'
subtitle: 'LIFO আর FIFO — দুটি সাধারণ abstraction যা undo সিস্টেম, BFS, task scheduler আর expression parsing চালায়।'
chapter: 4
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['stack', 'queue', 'monotonic stack', 'BFS']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমির হোটেলের রান্নাঘর। ধোয়া প্লেটগুলো একটার উপর একটা করে সাজানো থাকে একটা লম্বা স্তূপে। বাবুর্চি সিনা যখন খাবার বাড়তে যায়, সে সবসময় স্তূপের একদম উপরের প্লেটটাই তুলে নেয় — মানে যে প্লেটটা সবার শেষে ধুয়ে রাখা হয়েছিল, সেটাই আগে হাতে ওঠে। নিচের পুরনো প্লেটগুলো ততক্ষণ চাপা পড়ে থাকে যতক্ষণ না উপরেরগুলো সরে যায়। উপর থেকেই রাখা, উপর থেকেই তোলা।

আবার হোটেলের সামনে খাবারের লাইন। ফাতিমা সকাল সকাল এসে সবার আগে টোকেন নিয়েছে, তার পেছনে একে একে আরও অনেকে দাঁড়িয়েছে। খোয়ারিজমি যখন প্লেট বাড়ায়, সে লাইনের সামনের জন থেকে শুরু করে — যে আগে এসেছে, সে আগে খাবার পায়। শেষে আসা লোকটাকে সবার শেষ পর্যন্ত অপেক্ষা করতেই হবে, কেউ লাইন টপকাতে পারবে না।

এই দুটো ছবিই আসলে দুটো আলাদা data structure। প্লেটের স্তূপ হলো **stack** — শেষে যেটা রাখা হয়, সেটাই আগে ওঠে, একে বলে **LIFO** (last in, first out); প্লেট রাখা মানে `push`, তোলা মানে `pop`। আর সামনের লাইন হলো **queue** — আগে যে আসে, আগে সে যায়, একে বলে **FIFO** (first in, first out)। বাস্তবে editor-এ Ctrl+Z দিয়ে **undo** করা ঠিক এই stack-এর মতোই কাজ করে (শেষ কাজটাই আগে বাতিল হয়), আর printer-এর **print queue** বা task scheduler ঠিক এই লাইনের মতো — যে job আগে জমা পড়ে, সেটাই আগে চলে।

## Stacks — Last In, First Out

Stack অনেকটা প্লেটের স্তূপের মতো: আপনি শুধু উপর থেকেই কিছু যোগ বা সরাতে পারবেন। এই সহজ সীমাবদ্ধতাটাই এটিকে এমন state ট্র্যাক করার জন্য দারুণ বানিয়ে দেয় যেগুলোকে আবার গুটিয়ে আনতে হয় — function call, undo history, ব্র্যাকেট মেলানো।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

**Stack:** ক্যাফেটেরিয়ায় প্লেটের স্তূপের মতো — আপনি সবসময় উপর থেকে নেন (LIFO)। **Queue:** কফি শপের লাইনের মতো — যে আগে আসে, সে আগে সেবা পায় (FIFO)।

</Callout>

```typescript
// Stack using an array
class Stack<T> {
	private items: T[] = [];

	push(item: T): void {
		this.items.push(item);
	}
	pop(): T | undefined {
		return this.items.pop();
	}
	peek(): T | undefined {
		return this.items[this.items.length - 1];
	}
	isEmpty(): boolean {
		return this.items.length === 0;
	}
	get size(): number {
		return this.items.length;
	}
}
```

### Valid Parentheses — ক্লাসিক Stack সমস্যা

```typescript
function isValid(s: string): boolean {
	const stack: string[] = [];
	const pairs: Record<string, string> = {
		')': '(',
		'}': '{',
		']': '['
	};

	for (const char of s) {
		if ('({['.includes(char)) {
			stack.push(char);
		} else {
			if (stack.pop() !== pairs[char]) return false;
		}
	}
	return stack.length === 0;
}
```

### Monotonic Stack

এমন একটি stack যেখানে element গুলো সবসময় sorted order-এ থাকে। "next greater element" ধরনের সমস্যার জন্য কাজে লাগে।

```typescript
// For each element, find the next greater element
function nextGreaterElement(nums: number[]): number[] {
	const result = new Array(nums.length).fill(-1);
	const stack: number[] = []; // stores indices

	for (let i = 0; i < nums.length; i++) {
		while (stack.length && nums[i] > nums[stack[stack.length - 1]]) {
			const idx = stack.pop()!;
			result[idx] = nums[i];
		}
		stack.push(i);
	}
	return result;
}
// [2, 1, 4, 3] → [4, 4, -1, -1]
```

## Queues — First In, First Out

Queue অনেকটা দোকানের লাইনের মতো: লাইনের প্রথম ব্যক্তি আগে সেবা পায়। BFS, task scheduling আর buffering-এর জন্য queue অপরিহার্য।

```typescript
// Queue using an array (simple but O(n) dequeue)
// For production, use a linked-list-based queue
class Queue<T> {
	private items: T[] = [];

	enqueue(item: T): void {
		this.items.push(item);
	}
	dequeue(): T | undefined {
		return this.items.shift();
	}
	peek(): T | undefined {
		return this.items[0];
	}
	isEmpty(): boolean {
		return this.items.length === 0;
	}
	get size(): number {
		return this.items.length;
	}
}
```

### Queue দিয়ে BFS

```typescript
// Level-order traversal of a binary tree
function levelOrder(root: TreeNode | null): number[][] {
	if (!root) return [];
	const result: number[][] = [];
	const queue: TreeNode[] = [root];

	while (queue.length) {
		const levelSize = queue.length;
		const level: number[] = [];

		for (let i = 0; i < levelSize; i++) {
			const node = queue.shift()!;
			level.push(node.val);
			if (node.left) queue.push(node.left);
			if (node.right) queue.push(node.right);
		}
		result.push(level);
	}
	return result;
}
```

<Callout type="info">

**বাস্তব জীবনের ব্যবহার:**

- **Stacks**: function call stack, undo/redo, ব্রাউজারের back button, expression evaluation
- **Queues**: BFS, print spooler, message queue (Redis, RabbitMQ), task scheduler

</Callout>

## মূল কথা

1. **Stacks** এমন সমস্যার জন্য যেখানে আপনাকে "unwind" করতে হয় — matching, backtracking, DFS
2. **Queues** এমন সমস্যার জন্য যেখানে order গুরুত্বপূর্ণ — BFS, scheduling, buffering
3. **Monotonic stacks** O(n²) "next greater/smaller" সমস্যাগুলোকে O(n)-এ নামিয়ে আনে
4. দুটোই building block — অন্য algorithm-এর ভেতরে এগুলো আপনি নিয়মিত ব্যবহার করবেন
