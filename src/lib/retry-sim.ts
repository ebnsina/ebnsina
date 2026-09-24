// Client → service → dependency, stepped in fixed ticks so any frame rate gives the same run.
// Timed-out attempts stay in the dependency's queue: it still does the work nobody waits for.
import { mulberry32 } from './rng';

export type Settings = { retries: number; timeout: number; backoff: boolean; breaker: boolean };
export type BreakerState = 'closed' | 'open' | 'half-open';
type Req = { left: number; tries: number };
type Attempt = { req: Req; deadline: number; settled: boolean; probe: boolean };
// One per simulated second; queue/breaker/down are snapshots from the start of that second.
export type Bucket = {
	arrived: number;
	done: number;
	ok: number;
	sent: number;
	wasted: number;
	queue: number;
	breaker: BreakerState;
	down: boolean;
};

export const RATE = 80; // user requests/s
export const WORKERS = 10; // ~100 ms each → ~100 req/s dependency capacity
export const CAPACITY = WORKERS * 10;
export const SLOWDOWN = 10; // service time multiplier during the outage
export const BREAKER = { window: 1, minCalls: 10, ratio: 0.5, open: 2, probes: 5 };
const TICK = 0.005;
const BACKOFF_BASE = 0.2;
const QUEUE_CAP = 5000;

export class RetrySim {
	t = 0;
	settings: Settings;
	queue: Attempt[] = [];
	busy: ({ a: Attempt; end: number } | null)[] = Array(WORKERS).fill(null);
	buckets: Bucket[] = [];
	breaker: BreakerState = 'closed';
	outage = { from: -1, to: -1 };
	private n = 0; // integer tick count, so time never drifts
	private clock = 0; // requested time; ticks trail it by under one TICK
	private head = 0;
	private inflight: Attempt[] = [];
	private ihead = 0;
	private scheduled: { at: number; req: Req }[] = [];
	private window: { t: number; ok: boolean }[] = [];
	private openUntil = 0;
	private probesOut = 0;
	private probesOk = 0;
	private rand: () => number;
	private nextArrival: number;

	constructor(settings: Settings, seed = 1) {
		this.settings = settings;
		this.rand = mulberry32(seed);
		this.nextArrival = this.exp(1 / RATE);
	}

	private exp(mean: number) {
		return -Math.log(1 - this.rand()) * mean;
	}

	private bucket() {
		const i = Math.floor(this.t);
		while (this.buckets.length <= i)
			this.buckets.push({
				arrived: 0,
				done: 0,
				ok: 0,
				sent: 0,
				wasted: 0,
				queue: this.queued,
				breaker: this.breaker,
				down: this.down
			});
		return this.buckets[i];
	}

	startOutage(seconds: number) {
		this.outage = { from: this.t, to: this.t + seconds };
	}

	get down() {
		return this.t >= this.outage.from && this.t < this.outage.to;
	}

	get queued() {
		return this.queue.length - this.head;
	}

	private finish(ok: boolean) {
		const b = this.bucket();
		b.done++;
		if (ok) b.ok++;
	}

	private send(req: Req) {
		req.left--;
		req.tries++;
		let probe = false;
		if (this.settings.breaker && this.breaker !== 'closed') {
			// Open (or half-open with its probes already out): fail fast, and don't retry into it.
			if (this.breaker === 'open' || this.probesOut >= BREAKER.probes) return this.finish(false);
			probe = true;
			this.probesOut++;
		}
		const a: Attempt = { req, deadline: this.t + this.settings.timeout, settled: false, probe };
		this.bucket().sent++;
		if (this.queued >= QUEUE_CAP) return this.settle(a, false);
		this.queue.push(a);
		this.inflight.push(a);
	}

	private settle(a: Attempt, ok: boolean) {
		a.settled = true;
		this.record(a, ok);
		if (ok) return this.finish(true);
		if (a.req.left <= 0) return this.finish(false);
		const delay = this.settings.backoff ? this.rand() * BACKOFF_BASE * 2 ** (a.req.tries - 1) : 0;
		this.scheduled.push({ at: this.t + delay, req: a.req });
	}

	private record(a: Attempt, ok: boolean) {
		if (!this.settings.breaker) return;
		if (this.breaker === 'half-open') {
			if (!a.probe) return;
			this.probesOut--;
			if (!ok) return this.trip();
			if (++this.probesOk >= BREAKER.probes) this.breaker = 'closed';
			return;
		}
		if (this.breaker === 'open') return;
		this.window.push({ t: this.t, ok });
		while (this.window[0].t < this.t - BREAKER.window) this.window.shift();
		const fails = this.window.filter((w) => !w.ok).length;
		if (this.window.length >= BREAKER.minCalls && fails / this.window.length >= BREAKER.ratio)
			this.trip();
	}

	private trip() {
		this.breaker = 'open';
		this.openUntil = this.t + BREAKER.open;
		this.window = [];
	}

	private tick() {
		this.t = ++this.n * TICK;
		if (this.breaker === 'open' && this.t >= this.openUntil) {
			this.breaker = 'half-open';
			this.probesOut = 0;
			this.probesOk = 0;
		}
		while (this.nextArrival <= this.t) {
			this.bucket().arrived++;
			this.send({ left: this.settings.retries + 1, tries: 0 });
			this.nextArrival += this.exp(1 / RATE);
		}
		if (this.scheduled.length) {
			const due = this.scheduled.filter((s) => s.at <= this.t);
			this.scheduled = this.scheduled.filter((s) => s.at > this.t);
			for (const s of due) this.send(s.req);
		}
		for (let i = 0; i < WORKERS; i++) {
			const w = this.busy[i];
			if (w && w.end <= this.t) {
				if (w.a.settled) this.bucket().wasted++;
				else this.settle(w.a, true);
				this.busy[i] = null;
			}
			if (!this.busy[i] && this.head < this.queue.length) {
				const a = this.queue[this.head++];
				const service = (0.06 + this.exp(0.04)) * (this.down ? SLOWDOWN : 1);
				this.busy[i] = { a, end: this.t + service };
			}
		}
		// Deadlines are pushed in send order, so a front-to-back scan finds every expiry.
		while (this.ihead < this.inflight.length && this.inflight[this.ihead].deadline <= this.t) {
			const a = this.inflight[this.ihead++];
			if (!a.settled) this.settle(a, false);
		}
		if (this.head > 4096) {
			this.queue = this.queue.slice(this.head);
			this.head = 0;
		}
		if (this.ihead > 4096) {
			this.inflight = this.inflight.slice(this.ihead);
			this.ihead = 0;
		}
	}

	/** Advance by `dt` seconds in fixed ticks. */
	step(dt: number) {
		this.clock += dt;
		const target = Math.floor(this.clock / TICK + 1e-6);
		while (this.n < target) this.tick();
	}
}

/** Success rate, dependency load (attempts/s) and attempts per user request over some seconds. */
export function summarize(bs: Bucket[]) {
	let done = 0,
		ok = 0,
		sent = 0,
		arrived = 0;
	for (const b of bs) {
		done += b.done;
		ok += b.ok;
		sent += b.sent;
		arrived += b.arrived;
	}
	return {
		success: done ? ok / done : 1,
		load: bs.length ? sent / bs.length : 0,
		amp: arrived ? sent / arrived : 1
	};
}

// The challenge: a 5 s slowdown at t=10; recover to 95% success within 15 s of it ending.
export const CHALLENGE = {
	seed: 7,
	outageAt: 10,
	outageFor: 5,
	seconds: 60,
	target: 0.95,
	within: 15
};
export const NAIVE: Settings = { retries: 3, timeout: 3, backoff: false, breaker: false };

/** First second after the outage from which every later second meets the target, or null. */
export function recoveredAt(buckets: Bucket[]) {
	const end = CHALLENGE.outageAt + CHALLENGE.outageFor;
	let at: number | null = null;
	for (let s = CHALLENGE.seconds - 1; s >= end; s--) {
		const b = buckets[s];
		if (!b || (b.done && b.ok / b.done < CHALLENGE.target)) break;
		at = s;
	}
	return at;
}

export function runChallenge(settings: Settings) {
	const sim = new RetrySim(settings, CHALLENGE.seed);
	sim.step(CHALLENGE.outageAt);
	sim.startOutage(CHALLENGE.outageFor);
	sim.step(CHALLENGE.seconds - CHALLENGE.outageAt);
	const at = recoveredAt(sim.buckets);
	const after = sim.buckets.slice(CHALLENGE.outageAt + CHALLENGE.outageFor);
	const { amp, load } = summarize(after);
	return {
		sim,
		recoveredAt: at,
		recoverySeconds: at === null ? null : at - CHALLENGE.outageAt - CHALLENGE.outageFor,
		pass: at !== null && at - CHALLENGE.outageAt - CHALLENGE.outageFor <= CHALLENGE.within,
		amp, // after the outage ends
		load,
		wasted: sim.buckets.reduce((n, b) => n + b.wasted, 0)
	};
}
