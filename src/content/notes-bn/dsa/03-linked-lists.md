---
title: 'Linked Lists'
subtitle: 'পয়েন্টার-ভিত্তিক ডেটা স্ট্রাকচার বুঝুন — nodes, traversal, এবং কেন এগুলো queues, LRU caches ও আরও অনেক কিছুর জন্য গুরুত্বপূর্ণ।'
chapter: 3
level: 'beginner'
topics: ['linked list', 'singly linked', 'doubly linked', 'fast slow pointers']
readingTime: '13 মিনিট'
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Linked Lists কেন?

Linked lists দৈনন্দিন কোডে arrays-এর মতো ঘন ঘন ব্যবহৃত হয় না, কিন্তু এগুলো অনেক গুরুত্বপূর্ণ ডেটা স্ট্রাকচারের ভিত্তি: queues, deques, LRU caches, graphs-এর adjacency lists, এবং আরও অনেক কিছু। পয়েন্টার কীভাবে nodes-কে সংযুক্ত করে সেটা বোঝা পরবর্তীতে trees ও graphs নিয়ে কাজ করার জন্য অপরিহার্য।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা scavenger hunt-এর মতো — প্রতিটা clue তোমাকে বলে দেয় পরেরটা কোথায় পাবে, কিন্তু তুমি সরাসরি clue #5-এ লাফ দিতে পারো না। মাঝখানে একটা নতুন clue ঢোকাতে চাইলে শুধু দুটো পয়েন্টার আপডেট করলেই হয় — সবকিছু নতুন করে নম্বর দেওয়ার দরকার নেই।

</Callout>

## Singly Linked List

প্রতিটা node একটা value আর পরের node-এর দিকে একটা পয়েন্টার ধরে রাখে।

```typescript
class ListNode<T> {
	value: T;
	next: ListNode<T> | null = null;

	constructor(value: T) {
		this.value = value;
	}
}

class LinkedList<T> {
	head: ListNode<T> | null = null;
	size = 0;

	// O(1) — prepend to front
	prepend(value: T): void {
		const node = new ListNode(value);
		node.next = this.head;
		this.head = node;
		this.size++;
	}

	// O(n) — append to end
	append(value: T): void {
		const node = new ListNode(value);
		if (!this.head) {
			this.head = node;
		} else {
			let current = this.head;
			while (current.next) current = current.next;
			current.next = node;
		}
		this.size++;
	}

	// O(n) — delete first occurrence
	delete(value: T): boolean {
		if (!this.head) return false;

		if (this.head.value === value) {
			this.head = this.head.next;
			this.size--;
			return true;
		}

		let current = this.head;
		while (current.next) {
			if (current.next.value === value) {
				current.next = current.next.next;
				this.size--;
				return true;
			}
			current = current.next;
		}
		return false;
	}
}
```

## Fast & Slow Pointer Pattern

সবচেয়ে গুরুত্বপূর্ণ linked list কৌশল। দুটো পয়েন্টার ভিন্ন গতিতে চালিয়ে cycles শনাক্ত করা, midpoints খুঁজে বের করা, এবং আরও অনেক কিছু করা যায়।

```typescript
// Detect cycle in a linked list
function hasCycle<T>(head: ListNode<T> | null): boolean {
	let slow = head;
	let fast = head;

	while (fast?.next) {
		slow = slow!.next;
		fast = fast.next.next;
		if (slow === fast) return true;
	}
	return false;
}

// Find the middle node
function findMiddle<T>(head: ListNode<T> | null): ListNode<T> | null {
	let slow = head;
	let fast = head;

	while (fast?.next) {
		slow = slow!.next;
		fast = fast.next.next;
	}
	return slow;
}

// Reverse a linked list (iterative)
function reverse<T>(head: ListNode<T> | null): ListNode<T> | null {
	let prev: ListNode<T> | null = null;
	let current = head;

	while (current) {
		const next = current.next;
		current.next = prev;
		prev = current;
		current = next;
	}
	return prev;
}
```

<Callout type="tip">

**একটা linked list reverse করা** বারবার সামনে আসে — interviews-এ এবং বাস্তব কোডে (যেমন, একটা undo history-র একটা segment reverse করা)। যতক্ষণ না ভাবা ছাড়াই লিখতে পারো, ততক্ষণ practice করো।

</Callout>

## Arrays বনাম Linked Lists

| Operation          | Array      | Linked List      |
| ------------------ | ---------- | ---------------- |
| Index দিয়ে access | O(1)       | O(n)             |
| সামনে insert       | O(n)       | O(1)             |
| শেষে insert        | O(1)\*     | O(n) or O(1)\*\* |
| সামনে থেকে delete  | O(n)       | O(1)             |
| Search             | O(n)       | O(n)             |
| Memory             | Contiguous | Scattered        |

\* Dynamic arrays-এর জন্য amortized।
\*\* একটা tail pointer রাখলে O(1)।

## মূল বিষয়গুলো

1. **Linked lists সামনের দিকের insertions/deletions-এ পারদর্শী** — O(1), যেখানে arrays-এ O(n)
2. **Fast & slow pointers** cycle detection ও midpoint খুঁজে বের করার কাজটা সুন্দরভাবে সমাধান করে
3. **একটা linked list reverse করা** সবচেয়ে সাধারণ linked list operation — এটা ভালোভাবে জানো
4. **ডিফল্ট হিসেবে arrays ব্যবহার করো** — linked lists হলো আরও জটিল স্ট্রাকচারের building blocks, একা খুব কমই ব্যবহৃত হয়
