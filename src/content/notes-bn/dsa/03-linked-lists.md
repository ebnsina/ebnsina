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

## গল্পে বুঝি

করিম তার ছোট বোন ফাতেমার জন্মদিনে সারা বাড়িতে একটা treasure hunt সাজিয়েছে। প্রথম clue-টা সে ফাতেমার হাতে ধরিয়ে দিল — কাগজে লেখা: "রান্নাঘরের চালের ড্রামে দেখো।" ফাতেমা সেখানে গিয়ে দ্বিতীয় clue পেল: "বারান্দার টবের নিচে।" টবের নিচের clue বলল আলমারির কথা, আলমারিরটা বলল ছাদের কথা — এভাবে একটার পর একটা চিরকুট ধরে ধরে সে শেষ chocolate-এর বাক্স পর্যন্ত পৌঁছাল। মজার ব্যাপারটা হলো, ফাতেমা চাইলেও সরাসরি পঞ্চম clue-এ লাফ দিতে পারবে না — কারণ কোন চিরকুট কোথায় লুকানো সেটা শুধু তার আগের চিরকুটটাই জানে। প্রথম থেকে শুরু করে এক এক করে হাঁটা ছাড়া উপায় নেই।

খেলার মাঝপথে করিমের মনে হলো, আলমারি আর ছাদের মাঝে আরেকটা মজার stop যোগ করা যাক — সোফার নিচে। পুরো খেলা নতুন করে সাজাতে হলো না তাকে। সে শুধু আলমারির চিরকুটে লিখল "সোফার নিচে দেখো", আর সোফার নিচে একটা নতুন চিরকুট রাখল যেখানে লেখা আগের সেই ছাদের ঠিকানা। মাত্র একটা চিরকুট বদলে আর একটা নতুন রেখেই মাঝখানে নতুন stop ঢুকে গেল — বাকি কোনো চিরকুট ছুঁতেও হলো না।

এই খেলাটাই আসলে একটা **linked list**। প্রতিটা চিরকুট হলো একটা **node** — তাতে দুটো জিনিস আছে: একটা তথ্য (এখানে যে কাজটা, বা কোনো value) আর পরের চিরকুট কোথায় তার ঠিকানা, অর্থাৎ **pointer to next**। ফাতেমার হাতের প্রথম চিরকুটটাই **head**। যেহেতু কোনো node শুধু তার পরেরটাকে চেনে, তাই index দিয়ে সরাসরি পাঁচ নম্বরে পৌঁছানো যায় না — head থেকে হেঁটে যেতেই হয় (**no random access**)। কিন্তু মাঝখানে insert করা সস্তা: একটা pointer বদলে, নতুন node-কে পুরনো ঠিকানায় তাক করালেই হলো, বাকি সব node অক্ষত থাকে (**cheap insert by re-pointing**)। বাস্তবে music player-এর playlist ঠিক এভাবেই কাজ করে — প্রতিটা গান পরের গানের দিকে pointer রাখে, তাই মাঝখানে একটা গান যোগ বা বাদ দিতে পুরো তালিকা নতুন করে সাজাতে হয় না, শুধু দুটো link বদলালেই চলে।

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
