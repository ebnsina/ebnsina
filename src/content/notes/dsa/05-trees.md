---
title: "Binary Trees & BSTs"
subtitle: "Recursive thinking, tree traversals, and binary search trees — the gateway to hierarchical data."
chapter: 5
level: "intermediate"
readingTime: "16 min"
topics: ["binary tree", "BST", "DFS", "BFS", "recursion"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Trees?

Trees represent hierarchical relationships: file systems, DOM elements, organization charts, database indices. Binary trees — where each node has at most two children — are the most common variant and the foundation for heaps, tries, and balanced search trees.

<Callout type="info">

**Real-World Analogy**

Like a company org chart — CEO at the top, VPs below, directors under them, then managers, then employees. A tree structure where each node has children, and you traverse down to find specific people.

</Callout>

## Binary Tree Basics

```typescript
class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;

  constructor(val: number) {
    this.val = val;
  }
}
```

## Tree Traversals

There are four ways to visit every node. The order matters for different problems.

```typescript
// In-order: left → root → right (gives sorted order for BST)
function inorder(root: TreeNode | null): number[] {
  if (!root) return [];
  return [...inorder(root.left), root.val, ...inorder(root.right)];
}

// Pre-order: root → left → right (copy/serialize a tree)
function preorder(root: TreeNode | null): number[] {
  if (!root) return [];
  return [root.val, ...preorder(root.left), ...preorder(root.right)];
}

// Post-order: left → right → root (delete a tree, evaluate expressions)
function postorder(root: TreeNode | null): number[] {
  if (!root) return [];
  return [...postorder(root.left), ...postorder(root.right), root.val];
}

// Level-order: BFS — see each "row" of the tree
function levelOrder(root: TreeNode | null): number[][] {
  if (!root) return [];
  const result: number[][] = [];
  const queue: TreeNode[] = [root];

  while (queue.length) {
    const level: number[] = [];
    const size = queue.length;
    for (let i = 0; i < size; i++) {
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

## Common Tree Problems

### Max Depth

```typescript
function maxDepth(root: TreeNode | null): number {
  if (!root) return 0;
  return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}
```

### Invert a Binary Tree

```typescript
function invertTree(root: TreeNode | null): TreeNode | null {
  if (!root) return null;
  [root.left, root.right] = [invertTree(root.right), invertTree(root.left)];
  return root;
}
```

### Lowest Common Ancestor

```typescript
function lowestCommonAncestor(
  root: TreeNode | null,
  p: TreeNode,
  q: TreeNode
): TreeNode | null {
  if (!root || root === p || root === q) return root;

  const left = lowestCommonAncestor(root.left, p, q);
  const right = lowestCommonAncestor(root.right, p, q);

  if (left && right) return root; // p and q are on different sides
  return left || right;
}
```

## Binary Search Trees

A BST maintains the invariant: left child &lt; parent &lt; right child. This gives O(log n) search, insert, and delete — if the tree is balanced.

```typescript
class BST {
  root: TreeNode | null = null;

  insert(val: number): void {
    this.root = this._insert(this.root, val);
  }

  private _insert(node: TreeNode | null, val: number): TreeNode {
    if (!node) return new TreeNode(val);
    if (val < node.val) node.left = this._insert(node.left, val);
    else node.right = this._insert(node.right, val);
    return node;
  }

  search(val: number): boolean {
    let current = this.root;
    while (current) {
      if (val === current.val) return true;
      current = val < current.val ? current.left : current.right;
    }
    return false;
  }
}
```

<Callout type="tip">

**The tree recursion pattern**: Most tree problems follow the same template — handle the base case (null node), recurse on left and right, combine results. Once you internalize this, tree problems become mechanical.

</Callout>

## Key Takeaways

1. **Think recursively** — trees are naturally recursive structures
2. **Know all four traversals** and when to use each
3. **BSTs give O(log n) operations** but degrade to O(n) if unbalanced
4. **DFS** (pre/in/post-order) uses a stack; **BFS** (level-order) uses a queue

