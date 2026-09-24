// One hot cache key in front of a DB, under Poisson traffic. Seeded and frame-rate independent.
import { mulberry32 } from './rng';

export type Mode = 'none' | 'lock' | 'early';

export const DB_TIME = 0.2; // one DB rebuild of the value, as in the chapter's example

export class StampedeSim {
	t = 0;
	rate: number;
	ttl: number;
	mode: Mode;
	expiresAt: number; // the value is fresh while t < expiresAt
	db: number[] = []; // end times of in-flight DB queries
	waiting = 0; // requests blocked until a DB query finishes
	peakDb = 0;
	dbQueries = 0;
	requests = 0;
	slow = 0; // requests not answered straight from the cache
	private lockHeld = false;
	private rand: () => number;
	private nextArrival: number;

	constructor(rate: number, ttl: number, mode: Mode, seed = 1) {
		this.rate = rate;
		this.ttl = ttl;
		this.mode = mode;
		this.rand = mulberry32(seed);
		this.expiresAt = ttl; // the cache starts warm
		this.nextArrival = this.gap();
	}

	private gap() {
		return this.rate > 0 ? this.t - Math.log(1 - this.rand()) / this.rate : Infinity;
	}

	setRate(rate: number) {
		this.rate = rate;
		this.nextArrival = this.gap();
	}

	private query() {
		this.db.push(this.t + DB_TIME);
		this.dbQueries++;
		this.peakDb = Math.max(this.peakDb, this.db.length);
	}

	private arrive() {
		this.requests++;
		const fresh = this.t < this.expiresAt;
		if (fresh) {
			// XFetch (β = 1): refresh early with a probability that rises as expiry nears.
			if (this.mode === 'early' && this.t - DB_TIME * Math.log(1 - this.rand()) >= this.expiresAt)
				this.query();
			return;
		}
		this.slow++;
		if (this.mode !== 'lock') {
			this.query(); // every miss goes to the DB itself
			this.waiting++;
		} else if (!this.lockHeld) {
			this.lockHeld = true;
			this.query();
			this.waiting++;
		} else this.waiting++;
	}

	step(dt: number) {
		const until = this.t + dt;
		for (;;) {
			const done = this.db.length ? Math.min(...this.db) : Infinity;
			const next = Math.min(done, this.nextArrival);
			if (next > until) break;
			this.t = next;
			if (next === done) {
				this.db.splice(this.db.indexOf(done), 1);
				this.expiresAt = this.t + this.ttl;
				this.lockHeld = false;
				// In 'none' each finished query answers only its own request; otherwise everyone waiting.
				this.waiting = this.mode === 'lock' ? 0 : Math.min(this.waiting, this.db.length);
			} else {
				this.arrive();
				this.nextArrival = this.gap();
			}
		}
		this.t = until;
	}
}

// High-traffic home page: the DB must never see more than DB_LIMIT queries at once,
// and no reader may wait on a rebuild — the chapter's "zero latency spike" row.
export const CHALLENGE = { rate: 500, seconds: 120, dbLimit: 20, seed: 3 };

export function runChallenge(ttl: number, mode: Mode, seed = CHALLENGE.seed) {
	const sim = new StampedeSim(CHALLENGE.rate, ttl, mode, seed);
	sim.step(CHALLENGE.seconds);
	return result(sim);
}

export function result(sim: StampedeSim) {
	return {
		peakDb: sim.peakDb,
		slow: sim.slow,
		dbQueries: sim.dbQueries,
		pass: sim.peakDb <= CHALLENGE.dbLimit && sim.slow === 0
	};
}
