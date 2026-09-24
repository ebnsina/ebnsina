// One primary, two async replicas. Users write, then read their own data back.
// A read is stale when it lands on a replica that hasn't replayed that user's last write yet.
import { mulberry32 } from './rng';

export type Routing = 'replica' | 'sticky' | 'primary';
export type Target = 0 | 1 | 2; // 0 = primary, 1–2 = replicas

const USERS = 40;
const REPLICAS = 2;
const BROWSE_RATE = USERS * 0.5; // background reads/s across all users
const WRITE_RATE = USERS / 60; // each user writes about once a minute

/** Replica lag per write is uniform in [0.5, 1.5] × the mean. */
export const LAG_SPREAD = [0.5, 1.5] as const;

export type ReadEvent = { t: number; target: Target; stale: boolean; followUp: boolean };

export class ReplicationSim {
	t = 0;
	reads = 0;
	primaryReads = 0;
	stale = 0;
	writes = 0;
	recent: ReadEvent[] = [];
	lag: number; // mean replica lag, seconds
	routing: Routing;
	window: number; // sticky: seconds after a write that the user's reads stay on primary

	private rand: () => number;
	private lastWrite = new Float64Array(USERS).fill(-Infinity);
	private appliedAt = Array.from({ length: REPLICAS }, () => new Float64Array(USERS));
	private nextBrowse: number;
	private nextWrite: number;
	private followUps: { t: number; user: number }[] = [];

	constructor(lag: number, routing: Routing, window: number, seed = 1) {
		this.lag = lag;
		this.routing = routing;
		this.window = window;
		this.rand = mulberry32(seed);
		this.nextBrowse = this.exp(1 / BROWSE_RATE);
		this.nextWrite = this.exp(1 / WRITE_RATE);
	}

	private exp(mean: number) {
		return -Math.log(1 - this.rand()) * mean;
	}

	private user() {
		return Math.floor(this.rand() * USERS);
	}

	private read(user: number, followUp: boolean) {
		const sticky = this.routing === 'sticky' && this.t - this.lastWrite[user] < this.window;
		const target: Target =
			this.routing === 'primary' || sticky
				? 0
				: ((1 + Math.floor(this.rand() * REPLICAS)) as Target);
		const stale = target > 0 && this.t < this.appliedAt[target - 1][user];
		this.reads++;
		if (target === 0) this.primaryReads++;
		if (stale) this.stale++;
		this.recent.push({ t: this.t, target, stale, followUp });
		if (this.recent.length > 400) this.recent.splice(0, 100);
	}

	private write(user: number) {
		this.writes++;
		this.lastWrite[user] = this.t;
		// Each replica replays it after its own lag.
		for (const applied of this.appliedAt)
			applied[user] =
				this.t + this.lag * (LAG_SPREAD[0] + this.rand() * (LAG_SPREAD[1] - LAG_SPREAD[0]));
		// The app redirects to the saved page: a read-back 0.1–0.6 s later.
		this.followUps.push({ t: this.t + 0.1 + this.rand() * 0.5, user });
		this.followUps.sort((a, b) => a.t - b.t);
	}

	step(dt: number) {
		const until = this.t + dt;
		for (;;) {
			const f = this.followUps[0]?.t ?? Infinity;
			const next = Math.min(this.nextBrowse, this.nextWrite, f);
			if (next > until) break;
			this.t = next;
			if (next === f) this.read(this.followUps.shift()!.user, true);
			else if (next === this.nextWrite) {
				this.write(this.user());
				this.nextWrite = this.t + this.exp(1 / WRITE_RATE);
			} else {
				this.read(this.user(), false);
				this.nextBrowse = this.t + this.exp(1 / BROWSE_RATE);
			}
		}
		this.t = until;
	}

	get primaryShare() {
		return this.reads ? this.primaryReads / this.reads : 0;
	}
}

// Challenge: replicas lag ~2 s. No user may miss their own write, and the primary
// may serve at most a fifth of all reads.
export const CHALLENGE = { lag: 2, seconds: 300, maxPrimaryShare: 0.2, seed: 3 };

export function runChallenge(routing: Routing, window: number) {
	const sim = new ReplicationSim(CHALLENGE.lag, routing, window, CHALLENGE.seed);
	sim.step(CHALLENGE.seconds);
	return {
		stale: sim.stale,
		primaryShare: sim.primaryShare,
		pass: sim.stale === 0 && sim.primaryShare <= CHALLENGE.maxPrimaryShare
	};
}
