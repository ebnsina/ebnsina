---
title: "Stacks & Queues"
subtitle: "LIFO and FIFO — two simple abstractions that power undo systems, BFS, task schedulers, and expression parsing."
chapter: 4
level: "beginner"
readingTime: "11 min"
topics: ["stack", "queue", "monotonic stack", "BFS"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Stacks — Last In, First Out

A stack is like a stack of plates: you can only add or remove from the top. This simple constraint makes it perfect for tracking state that needs to be unwound — function calls, undo history, matching brackets.

<Callout type="info">

**Real-World Analogy**

**Stack:** Like a stack of plates in a cafeteria — you always take from the top (LIFO). **Queue:** Like the line at a coffee shop — first come, first served (FIFO).

</Callout>

```typescript
// Stack using an array
class Stack<T> {
  private items: T[] = [];

  push(item: T): void { this.items.push(item); }
  pop(): T | undefined { return this.items.pop(); }
  peek(): T | undefined { return this.items[this.items.length - 1]; }
  isEmpty(): boolean { return this.items.length === 0; }
  get size(): number { return this.items.length; }
}
```

### Valid Parentheses — The Classic Stack Problem

```typescript
function isValid(s: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = {
    ")": "(", "}": "{", "]": "[",
  };

  for (const char of s) {
    if ("({[".includes(char)) {
      stack.push(char);
    } else {
      if (stack.pop() !== pairs[char]) return false;
    }
  }
  return stack.length === 0;
}
```

### Monotonic Stack

A stack where elements are always in sorted order. Useful for "next greater element" problems.

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

A queue is like a line at a store: first person in line gets served first. Queues are essential for BFS, task scheduling, and buffering.

```typescript
// Queue using an array (simple but O(n) dequeue)
// For production, use a linked-list-based queue
class Queue<T> {
  private items: T[] = [];

  enqueue(item: T): void { this.items.push(item); }
  dequeue(): T | undefined { return this.items.shift(); }
  peek(): T | undefined { return this.items[0]; }
  isEmpty(): boolean { return this.items.length === 0; }
  get size(): number { return this.items.length; }
}
```

### BFS with a Queue

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

**Real-world uses:**
- **Stacks**: function call stack, undo/redo, browser back button, expression evaluation
- **Queues**: BFS, print spoolers, message queues (Redis, RabbitMQ), task schedulers

</Callout>

## Key Takeaways

1. **Stacks** are for problems where you need to "unwind" — matching, backtracking, DFS
2. **Queues** are for problems where order matters — BFS, scheduling, buffering
3. **Monotonic stacks** turn O(n²) "next greater/smaller" problems into O(n)
4. Both are building blocks — you'll use them inside other algorithms constantly

