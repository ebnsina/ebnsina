---
title: 'Linked Lists'
subtitle: 'Understand pointer-based data structures — nodes, traversal, and why they matter for queues, LRU caches, and more.'
chapter: 3
level: 'beginner'
readingTime: '13 min'
topics: ['linked list', 'singly linked', 'doubly linked', 'fast slow pointers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Linked Lists?

Linked lists aren't used as often as arrays in day-to-day code, but they're the foundation for many critical data structures: queues, deques, LRU caches, adjacency lists for graphs, and more. Understanding how pointers connect nodes is essential for working with trees and graphs later.

<Callout type="info">

**Real-World Analogy**

Like a scavenger hunt — each clue tells you where to find the next one, but you can't jump to clue #5 directly. To insert a new clue in the middle, you just update two pointers — no need to renumber everything.

</Callout>

## Singly Linked List

Each node holds a value and a pointer to the next node.

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

The most important linked list technique. Use two pointers moving at different speeds to detect cycles, find midpoints, and more.

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

**Reversing a linked list** comes up constantly — in interviews and in real code (e.g., reversing a segment of an undo history). Practice until you can write it without thinking.

</Callout>

## Arrays vs. Linked Lists

| Operation         | Array      | Linked List      |
| ----------------- | ---------- | ---------------- |
| Access by index   | O(1)       | O(n)             |
| Insert at front   | O(n)       | O(1)             |
| Insert at end     | O(1)\*     | O(n) or O(1)\*\* |
| Delete from front | O(n)       | O(1)             |
| Search            | O(n)       | O(n)             |
| Memory            | Contiguous | Scattered        |

\* Amortized for dynamic arrays.
\*\* O(1) if you maintain a tail pointer.

## Key Takeaways

1. **Linked lists excel at front insertions/deletions** — O(1) vs arrays' O(n)
2. **Fast & slow pointers** solve cycle detection and midpoint finding elegantly
3. **Reversing a linked list** is the most common linked list operation — know it cold
4. **Use arrays by default** — linked lists are building blocks for more complex structures, rarely used alone
