// Key placement across shards: `hash % N` vs a consistent-hash ring with virtual nodes.
// Pure and deterministic: the same inputs always place every key the same way.

export type Strategy = 'modulo' | 'ring';

export const KEYS = Array.from({ length: 2000 }, (_, i) => `customer-${i + 1}`);

// FNV-1a with a murmur finalizer, so sequential keys still spread evenly.
export function hash(s: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

const KEY_HASHES = KEYS.map(hash);

/** Owning shard (0…nodes-1) of every key in KEYS. */
export function place(strategy: Strategy, nodes: number, vnodes: number) {
	if (strategy === 'modulo') return KEY_HASHES.map((h) => h % nodes);
	const ring: [number, number][] = [];
	for (let n = 0; n < nodes; n++)
		for (let v = 0; v < vnodes; v++) ring.push([hash(`shard-${n}#${v}`), n]);
	ring.sort((a, b) => a[0] - b[0]);
	return KEY_HASHES.map((h) => {
		// First ring point clockwise from the key, wrapping to the start.
		let lo = 0;
		let hi = ring.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (ring[mid][0] < h) lo = mid + 1;
			else hi = mid;
		}
		return ring[lo % ring.length][1];
	});
}

export function loads(owners: number[], nodes: number) {
	const out = Array(nodes).fill(0);
	for (const o of owners) out[o]++;
	return out;
}

/** Fullest shard relative to a perfectly even split (1 = perfect). */
export function imbalance(owners: number[], nodes: number) {
	return Math.max(...loads(owners, nodes)) / (owners.length / nodes);
}

export function moved(a: number[], b: number[]) {
	return a.reduce((n, o, i) => n + (o !== b[i] ? 1 : 0), 0);
}

// Challenge: grow 4 → 5 shards; move few keys and keep the fullest shard near average.
export const CHALLENGE = { from: 4, to: 5, maxMoved: 0.25, maxImbalance: 1.2 };

export function runChallenge(strategy: Strategy, vnodes: number) {
	const before = place(strategy, CHALLENGE.from, vnodes);
	const after = place(strategy, CHALLENGE.to, vnodes);
	const movedShare = moved(before, after) / KEYS.length;
	const worst = imbalance(after, CHALLENGE.to);
	return {
		movedShare,
		imbalance: worst,
		pass: movedShare <= CHALLENGE.maxMoved && worst <= CHALLENGE.maxImbalance
	};
}
