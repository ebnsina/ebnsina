// Discrete-event sim of a load balancer in front of equal backends, one of which is slow.
// Arrivals and per-request work come from a seeded stream separate from routing,
// so every algorithm faces the exact same traffic.
import { mulberry32 } from './rng';

export const ALGOS = ['round-robin', 'random', 'least-conn', 'two-choices'] as const;
export type Algo = (typeof ALGOS)[number];

type Req = { at: number; work: number; start: number; end: number };
export type Backend = {
	slow: number;
	queue: Req[];
	slots: (Req | null)[];
	done: Req[];
	dropped: number;
};

export const BACKENDS = 4;
export const SLOW_INDEX = 1; // s2 is the slow one
export const SLOTS = 2; // concurrent requests a backend works on at once
export const MEAN_WORK = 0.1; // seconds on a normal backend
const QUEUE_CAP = 60;

export function percentile(jobs: Req[], p: number, since = -Infinity) {
	const lat: number[] = [];
	for (let i = jobs.length - 1; i >= 0 && jobs[i].end >= since; i--)
		lat.push(jobs[i].end - jobs[i].at);
	if (!lat.length) return 0;
	lat.sort((a, b) => a - b);
	return lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
}

export class LbSim {
	t = 0;
	rate: number;
	algo: Algo;
	backends: Backend[];
	done: Req[] = [];
	private traffic: () => number;
	private pick: () => number;
	private rr = 0;
	private nextArrival: number;

	constructor(rate: number, algo: Algo, slow: number, seed = 1) {
		this.rate = rate;
		this.algo = algo;
		this.traffic = mulberry32(seed);
		this.pick = mulberry32(seed ^ 0x9e3779b9);
		this.backends = Array.from({ length: BACKENDS }, (_, i) => ({
			slow: i === SLOW_INDEX ? slow : 1,
			queue: [],
			slots: Array(SLOTS).fill(null),
			done: [],
			dropped: 0
		}));
		this.nextArrival = this.gap();
	}

	private exp(mean: number) {
		return -Math.log(1 - this.traffic()) * mean;
	}

	private gap() {
		return this.rate > 0 ? this.t + this.exp(1 / this.rate) : Infinity;
	}

	setRate(rate: number) {
		this.rate = rate;
		this.nextArrival = this.gap();
	}

	setSlow(slow: number) {
		this.backends[SLOW_INDEX].slow = slow;
	}

	inFlight(b: Backend) {
		return b.queue.length + b.slots.filter(Boolean).length;
	}

	get dropped() {
		return this.backends.reduce((n, b) => n + b.dropped, 0);
	}

	private route() {
		const n = this.backends.length;
		const load = (i: number) => this.inFlight(this.backends[i]);
		switch (this.algo) {
			case 'round-robin':
				return this.rr++ % n;
			case 'random':
				return Math.floor(this.pick() * n);
			case 'least-conn': {
				let best = 0;
				for (let i = 1; i < n; i++) if (load(i) < load(best)) best = i;
				return best;
			}
			case 'two-choices': {
				const a = Math.floor(this.pick() * n);
				let b = Math.floor(this.pick() * (n - 1));
				if (b >= a) b++;
				return load(b) < load(a) ? b : a;
			}
		}
	}

	private assign(b: Backend) {
		for (let s = 0; s < b.slots.length && b.queue.length; s++) {
			if (b.slots[s]) continue;
			const r = b.queue.shift()!;
			r.start = this.t;
			r.end = this.t + r.work * b.slow;
			b.slots[s] = r;
		}
	}

	step(dt: number) {
		const until = this.t + dt;
		for (;;) {
			let next = this.nextArrival;
			let hit: [Backend, number] | null = null;
			for (const b of this.backends)
				b.slots.forEach((r, s) => {
					if (r && r.end < next) {
						next = r.end;
						hit = [b, s];
					}
				});
			if (next > until) break;
			this.t = next;
			if (hit) {
				const [b, s] = hit as [Backend, number];
				const r = b.slots[s]!;
				b.slots[s] = null;
				b.done.push(r);
				this.done.push(r);
				this.assign(b);
			} else {
				// ~100 ms of work, drawn at arrival so routing never changes the traffic.
				const work = 0.06 + this.exp(MEAN_WORK - 0.06);
				const b = this.backends[this.route()];
				if (b.queue.length < QUEUE_CAP) b.queue.push({ at: this.t, work, start: 0, end: 0 });
				else b.dropped++;
				this.assign(b);
				this.nextArrival = this.gap();
			}
		}
		this.t = until;
	}
}

// The chapter's challenge: one backend is 3x slower, pick the algorithm that hides it.
export const CHALLENGE = { rate: 40, slow: 3, seconds: 60, budget: 0.65, seed: 3 };

export function runChallenge(algo: Algo) {
	const sim = new LbSim(CHALLENGE.rate, algo, CHALLENGE.slow, CHALLENGE.seed);
	sim.step(CHALLENGE.seconds);
	const p99 = percentile(sim.done, 0.99);
	const slowShare = sim.backends[SLOW_INDEX].done.length / Math.max(1, sim.done.length);
	return {
		p99,
		dropped: sim.dropped,
		slowShare,
		pass: sim.dropped === 0 && p99 <= CHALLENGE.budget
	};
}
