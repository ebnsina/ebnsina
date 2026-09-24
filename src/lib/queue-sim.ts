// Discrete-event sim of one server: Poisson arrivals, N workers, a bounded FIFO queue.
// Frame-rate independent and seeded, so the same inputs always give the same result.

import { mulberry32 } from './rng';

export type Job = { at: number; start: number; end: number };

const QUEUE_CAP = 120;

export class QueueSim {
	t = 0;
	queue: number[] = [];
	workers: (Job | null)[];
	done: Job[] = [];
	dropped = 0;
	private size: number;
	private rand: () => number;
	private nextArrival: number;

	rate: number;

	constructor(rate: number, workers: number, seed = 1) {
		this.rate = rate;
		this.rand = mulberry32(seed);
		this.workers = Array(workers).fill(null);
		this.size = workers;
		this.nextArrival = this.gap();
	}

	private exp(mean: number) {
		return -Math.log(1 - this.rand()) * mean;
	}

	private gap() {
		return this.rate > 0 ? this.t + this.exp(1 / this.rate) : Infinity;
	}

	// ~100 ms per request: a fixed 60 ms of work plus a random tail.
	private service() {
		return 0.06 + this.exp(0.04);
	}

	setRate(rate: number) {
		this.rate = rate;
		this.nextArrival = this.gap(); // arrivals are memoryless, so resampling is exact
	}

	setWorkers(n: number) {
		// Removed workers finish their current job first, then disappear.
		if (n >= this.workers.length) this.workers.push(...Array(n - this.workers.length).fill(null));
		else this.workers = [...this.workers.slice(0, n), ...this.workers.slice(n).filter(Boolean)];
		this.size = n;
	}

	private assign() {
		for (let i = 0; i < this.size && this.queue.length; i++) {
			if (this.workers[i]) continue;
			const at = this.queue.shift()!;
			this.workers[i] = { at, start: this.t, end: this.t + this.service() };
		}
	}

	step(dt: number) {
		const until = this.t + dt;
		for (;;) {
			let wi = -1;
			let next = this.nextArrival;
			this.workers.forEach((w, i) => {
				if (w && w.end < next) {
					next = w.end;
					wi = i;
				}
			});
			if (next > until) break;
			this.t = next;
			if (wi >= 0) {
				this.done.push(this.workers[wi]!);
				this.workers[wi] = null;
				if (wi >= this.size) this.workers.splice(wi, 1);
			} else {
				if (this.queue.length < QUEUE_CAP) this.queue.push(this.t);
				else this.dropped++;
				this.nextArrival = this.gap();
			}
			this.assign();
		}
		this.t = until;
	}

	/** Latency percentile (seconds) over jobs finished in the last `window` seconds. */
	percentile(p: number, window = Infinity) {
		const lat: number[] = [];
		for (let i = this.done.length - 1; i >= 0 && this.done[i].end >= this.t - window; i--)
			lat.push(this.done[i].end - this.done[i].at);
		if (!lat.length) return 0;
		lat.sort((a, b) => a - b);
		return lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
	}

	get busy() {
		return this.workers.filter(Boolean).length;
	}
}

// The chapter's challenge: fixed traffic, find the fewest workers that hold the p99 budget.
export const CHALLENGE = { rate: 45, seconds: 60, budget: 0.4, seed: 7 };

export function runChallenge(workers: number) {
	const sim = new QueueSim(CHALLENGE.rate, workers, CHALLENGE.seed);
	sim.step(CHALLENGE.seconds);
	const p99 = sim.percentile(0.99);
	return { p99, dropped: sim.dropped, pass: sim.dropped === 0 && p99 <= CHALLENGE.budget };
}

/** Fewest workers that pass — the answer the challenge rewards. */
export const MIN_WORKERS = Array.from({ length: 12 }, (_, i) => i + 1).find(
	(w) => runChallenge(w).pass
)!;
