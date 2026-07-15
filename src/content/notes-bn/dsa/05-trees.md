---
title: 'Binary Trees ও BST'
subtitle: 'Recursive চিন্তা, tree traversal, আর binary search tree — hierarchical data-র প্রবেশদ্বার।'
chapter: 5
level: 'intermediate'
readingTime: '16 মিনিট'
topics: ['binary tree', 'BST', 'DFS', 'BFS', 'recursion']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতেমা আর তার ছোট ভাই রহিম একটা খেলা খেলছে — "নাম্বার গেস করো"। ফাতেমা মনে মনে ১ থেকে ১০০০-এর মধ্যে একটা সংখ্যা ঠিক করে রাখে, রহিমকে সেটা খুঁজে বের করতে হবে। রহিম যদি এক এক করে ১, ২, ৩ বলে যেত, তাহলে খারাপ সময়ে ১০০০ বার বলতে হতো। কিন্তু রহিম চালাক — সে প্রথমে বলে "৫০০?"। ফাতেমা বলে "বড়"। রহিম সাথে সাথে বুঝে যায় নিচের ৫০০টা সংখ্যা বাদ, উত্তরটা ৫০১ থেকে ১০০০-এর মধ্যে। এবার সে বলে "৭৫০?" — ফাতেমা বলে "ছোট"। প্রতিটা প্রশ্নে বাকি সম্ভাবনার অর্ধেক কেটে যাচ্ছে।

ঠিক এভাবেই একটা মোটা ছাপা অভিধানে শব্দ খুঁজি — মাঝখানে খুলি, যে শব্দ খুঁজছি সেটা এই পাতার আগে না পরে দেখি, তারপর বাঁ দিকের অর্ধেক বা ডান দিকের অর্ধেক নিয়ে আবার মাঝখানে খুলি। হাজার পাতার অভিধানেও দশ-বারো বার পাতা উল্টেই কাঙ্ক্ষিত শব্দে পৌঁছে যাই, প্রতিটা পাতা এক এক করে দেখতে হয় না। ফাতেমার নাম্বারটা ধরো tree-র root node, তার ছোট মানগুলো এক পাশে, বড় মানগুলো আরেক পাশে — অনেকটা পরিবারের বংশতালিকার মতো, প্রতিটা parent-এর নিচে দুটো করে child।

এই "মাঝখানে গিয়ে ছোট হলে বাঁয়ে, বড় হলে ডানে" যাওয়াটাই **binary search tree**-র মূল কথা। প্রতিটা **node**-এর একটা মান থাকে, তার left subtree-র সব মান ছোট আর right subtree-র সব মান বড়। খুঁজতে গিয়ে প্রতি ধাপে একটা তুলনা করে অর্ধেক বাদ দিই, তাই n-টা মানের মধ্যেও মাত্র **O(log n)** ধাপে target পাওয়া যায় — সব node এক এক করে দেখতে হয় না। বাস্তবে database index ঠিক এই কাঠামোতেই লক্ষ লক্ষ row-র মধ্যে চোখের পলকে একটা রেকর্ড খুঁজে বের করে; যেকোনো দ্রুত lookup-এর পেছনে এই left-right halving-এর জাদু কাজ করে।

## Tree কেন?

Tree hierarchical সম্পর্ক প্রকাশ করে: file system, DOM element, organization chart, database index। Binary tree — যেখানে প্রতিটি node-এর সর্বোচ্চ দুটি child থাকে — সবচেয়ে সাধারণ ধরন এবং heap, trie ও balanced search tree-র ভিত্তি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা কোম্পানির org chart-এর মতো — উপরে CEO, তার নিচে VP-রা, তাদের অধীনে director, তারপর manager, তারপর employee। এমন একটা tree structure যেখানে প্রতিটি node-এর child থাকে, আর নির্দিষ্ট মানুষ খুঁজতে আপনি নিচের দিকে traverse করেন।

</Callout>

## Binary Tree-র মূল কথা

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

## Tree Traversal

প্রতিটি node ভিজিট করার চারটি উপায় আছে। বিভিন্ন সমস্যার জন্য order-টা গুরুত্বপূর্ণ।

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

## সাধারণ Tree সমস্যা

### Max Depth

```typescript
function maxDepth(root: TreeNode | null): number {
	if (!root) return 0;
	return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}
```

### Binary Tree Invert করা

```typescript
function invertTree(root: TreeNode | null): TreeNode | null {
	if (!root) return null;
	[root.left, root.right] = [invertTree(root.right), invertTree(root.left)];
	return root;
}
```

### Lowest Common Ancestor

```typescript
function lowestCommonAncestor(root: TreeNode | null, p: TreeNode, q: TreeNode): TreeNode | null {
	if (!root || root === p || root === q) return root;

	const left = lowestCommonAncestor(root.left, p, q);
	const right = lowestCommonAncestor(root.right, p, q);

	if (left && right) return root; // p and q are on different sides
	return left || right;
}
```

## Binary Search Tree

একটা BST এই invariant বজায় রাখে: left child &lt; parent &lt; right child। এতে search, insert ও delete-এ O(log n) পাওয়া যায় — যদি tree-টা balanced থাকে।

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

**Tree recursion pattern**: বেশিরভাগ tree সমস্যা একই template অনুসরণ করে — base case (null node) সামলান, left ও right-এ recurse করুন, result গুলো একসাথে combine করুন। একবার এটা মজ্জাগত হয়ে গেলে tree সমস্যাগুলো যান্ত্রিক হয়ে যায়।

</Callout>

## মূল শিক্ষা

1. **Recursively চিন্তা করুন** — tree স্বভাবতই recursive structure
2. **চারটি traversal-ই জানুন** এবং কখন কোনটা ব্যবহার করবেন
3. **BST O(log n) operation দেয়** কিন্তু unbalanced হলে O(n)-এ নেমে যায়
4. **DFS** (pre/in/post-order) stack ব্যবহার করে; **BFS** (level-order) queue ব্যবহার করে
