// A fixed-size cache replaying a seeded access stream: a hot set, a long cold tail,
// and periodic batch scans of keys read exactly once. Deterministic per seed.
import { mulberry32 } from './rng';

export type Policy = 'lru' | 'lfu' | 'fifo';
export type Kind = 'hot' | 'cold' | 'scan';

export const HOT = 25; // keys that take HOT_SHARE of normal traffic
const HOT_SHARE = 0.8;
const COLD = 2000;
export const SCAN_EVERY = 400; // normal requests between batch scans
export const SCAN_LEN = 120; // unique keys per scan, never read again

type Slot = { key: string; freq: number; last: number; added: number };

export const kindOf = (key: string): Kind =>
	key[0] === 'h' ? 'hot' : key[0] === 'c' ? 'cold' : 'scan';

export class EvictionSim {
	n = 0; // requests served
	hits = 0;
	evictions = 0;
	slots: Slot[] = [];
	recent: boolean[] = []; // hit/miss of the last 500 requests
	scanLeft = 0;
	private scans = 0;
	private sinceScan = 0;
	private index = new Map<string, Slot>();
	private rand: () => number;

	capacity: number;
	policy: Policy;

	constructor(capacity: number, policy: Policy, seed = 1) {
		this.capacity = capacity;
		this.policy = policy;
		this.rand = mulberry32(seed);
	}

	/** Start a batch scan now (the sandbox button); the timed ones come from next(). */
	scan() {
		if (!this.scanLeft) this.scanLeft = SCAN_LEN;
	}

	private next() {
		if (this.scanLeft) return `s${this.scans}-${SCAN_LEN - this.scanLeft--}`;
		if (++this.sinceScan >= SCAN_EVERY) {
			this.sinceScan = 0;
			this.scans++;
			this.scanLeft = SCAN_LEN;
		}
		const r = this.rand();
		return r < HOT_SHARE
			? `h${Math.floor((r / HOT_SHARE) * HOT)}`
			: `c${Math.floor(((r - HOT_SHARE) / (1 - HOT_SHARE)) * COLD)}`;
	}

	private victim() {
		// ponytail: O(capacity) scan per eviction; fine for the ≤ 60 slots the UI allows.
		const score = (s: Slot) =>
			this.policy === 'lru' ? s.last : this.policy === 'fifo' ? s.added : s.freq * 1e9 + s.last;
		return this.slots.reduce((a, b) => (score(b) < score(a) ? b : a));
	}

	access() {
		const key = this.next();
		this.n++;
		const hit = this.index.get(key);
		if (hit) {
			this.hits++;
			hit.freq++;
			hit.last = this.n;
		} else {
			if (this.slots.length >= this.capacity) {
				const v = this.victim();
				this.index.delete(v.key);
				this.slots.splice(this.slots.indexOf(v), 1);
				this.evictions++;
			}
			const s = { key, freq: 1, last: this.n, added: this.n };
			this.slots.push(s);
			this.index.set(key, s);
		}
		this.recent.push(!!hit);
		if (this.recent.length > 500) this.recent.shift();
	}

	run(requests: number) {
		for (let i = 0; i < requests; i++) this.access();
	}

	resize(capacity: number) {
		this.capacity = capacity;
		while (this.slots.length > capacity) {
			const v = this.victim();
			this.index.delete(v.key);
			this.slots.splice(this.slots.indexOf(v), 1);
		}
	}

	get hitRatio() {
		return this.n ? this.hits / this.n : 0;
	}
	get recentRatio() {
		return this.recent.length ? this.recent.filter(Boolean).length / this.recent.length : 0;
	}
	get hotCached() {
		return this.slots.filter((s) => s.key[0] === 'h').length;
	}
}

// Memory is capped at MAX_SLOTS; reach TARGET hit ratio across REQUESTS mixed with scans.
export const CHALLENGE = { requests: 20000, maxSlots: 30, target: 0.6, seed: 5 };

export function runChallenge(slots: number, policy: Policy, seed = CHALLENGE.seed) {
	const sim = new EvictionSim(slots, policy, seed);
	sim.run(CHALLENGE.requests);
	return {
		hitRatio: sim.hitRatio,
		pass: slots <= CHALLENGE.maxSlots && sim.hitRatio >= CHALLENGE.target
	};
}
