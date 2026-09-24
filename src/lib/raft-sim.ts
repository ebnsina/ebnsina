// Five-node Raft as a discrete-event sim: terms, randomized election timeouts, RequestVote,
// AppendEntries with the consistency check, majority commit. No persistence or snapshots.
import { mulberry32 } from './rng';

export const NAMES = ['সিনা', 'ফাতিমা', 'খোয়ারিজমি', 'বিরুনি', 'কিন্দি'];
const N = NAMES.length;
export const MAJORITY = Math.floor(N / 2) + 1;
const HEARTBEAT = 0.05;
const TIMEOUT: [number, number] = [0.15, 0.3];
const DELAY: [number, number] = [0.01, 0.02];

export type Role = 'follower' | 'candidate' | 'leader';
export type Entry = { term: number; id: number; value: string }; // value '' = leader's no-op

type RaftNode = {
	role: Role;
	term: number;
	votedFor: number | null;
	log: Entry[];
	commit: number; // count of committed entries
	deadline: number; // election timeout, or next heartbeat for a leader
	votes: Set<number>;
	next: number[];
	match: number[];
};

type Body =
	| { kind: 'vote'; lastIndex: number; lastTerm: number }
	| { kind: 'voteReply'; granted: boolean }
	| { kind: 'append'; prev: number; prevTerm: number; entries: Entry[]; commit: number }
	| { kind: 'appendReply'; ok: boolean; match: number };

export type Msg = Body & {
	from: number;
	to: number;
	term: number;
	sent: number;
	at: number;
	seq: number;
};
export type Write = { id: number; value: string; node: number };

export class RaftSim {
	t = 0;
	nodes: RaftNode[];
	msgs: Msg[] = [];
	side: number[] = Array(N).fill(0); // nodes on different sides can't reach each other
	writes: Write[] = [];
	acked = new Set<number>(); // write ids a leader committed (the client got "OK")
	private rand: () => number;
	private seq = 0;
	private ids = 0;

	constructor(seed = 1) {
		this.rand = mulberry32(seed);
		this.nodes = Array.from({ length: N }, (_, i) => ({
			role: 'follower' as Role,
			term: 0,
			votedFor: null,
			log: [],
			commit: 0,
			// সিনা times out first, so every run opens with সিনা as leader.
			deadline: i === 0 ? 0.05 : this.timeout(),
			votes: new Set<number>(),
			next: [],
			match: []
		}));
	}

	private between([a, b]: [number, number]) {
		return a + this.rand() * (b - a);
	}
	private timeout() {
		return this.t + this.between(TIMEOUT);
	}

	connected(a: number, b: number) {
		return this.side[a] === this.side[b];
	}

	private send(from: number, to: number, body: Body) {
		const at = this.t + this.between(DELAY);
		this.msgs.push({
			...body,
			from,
			to,
			term: this.nodes[from].term,
			sent: this.t,
			at,
			seq: this.seq++
		});
	}

	private stepDown(i: number, term: number) {
		const n = this.nodes[i];
		if (term > n.term) {
			n.term = term;
			n.votedFor = null;
		}
		if (n.role !== 'follower') {
			n.role = 'follower';
			n.deadline = this.timeout();
		}
	}

	private sendAppend(i: number, j: number) {
		const n = this.nodes[i];
		const prev = n.next[j];
		this.send(i, j, {
			kind: 'append',
			prev,
			prevTerm: n.log[prev - 1]?.term ?? 0,
			entries: n.log.slice(prev),
			commit: n.commit
		});
	}

	private broadcast(i: number) {
		for (let j = 0; j < N; j++) if (j !== i) this.sendAppend(i, j);
		this.nodes[i].deadline = this.t + HEARTBEAT;
	}

	private becomeLeader(i: number) {
		const n = this.nodes[i];
		n.role = 'leader';
		// A no-op in the new term lets the leader commit (and so settle) everything before it.
		n.log.push({ term: n.term, id: this.ids++, value: '' });
		n.next = Array(N).fill(n.log.length);
		n.match = Array(N).fill(0);
		n.match[i] = n.log.length;
		this.broadcast(i);
	}

	private advanceCommit(i: number) {
		const n = this.nodes[i];
		for (let idx = n.log.length; idx > n.commit; idx--) {
			// Commit rule: only an entry from the leader's own term, stored on a majority.
			if (n.log[idx - 1].term !== n.term) break;
			if (n.match.filter((m) => m >= idx).length >= MAJORITY) {
				n.commit = idx;
				for (const e of n.log.slice(0, idx)) this.acked.add(e.id);
				break;
			}
		}
	}

	private onTimeout(i: number) {
		const n = this.nodes[i];
		if (n.role === 'leader') return this.broadcast(i);
		n.role = 'candidate';
		n.term++;
		n.votedFor = i;
		n.votes = new Set([i]);
		n.deadline = this.timeout();
		const lastIndex = n.log.length;
		const lastTerm = n.log[lastIndex - 1]?.term ?? 0;
		for (let j = 0; j < N; j++) if (j !== i) this.send(i, j, { kind: 'vote', lastIndex, lastTerm });
	}

	private deliver(m: Msg) {
		const n = this.nodes[m.to];
		if (m.term > n.term) this.stepDown(m.to, m.term);

		if (m.kind === 'vote') {
			const myLast = n.log[n.log.length - 1]?.term ?? 0;
			// Election restriction: never vote for a candidate whose log is behind ours.
			const upToDate =
				m.lastTerm > myLast || (m.lastTerm === myLast && m.lastIndex >= n.log.length);
			const granted = m.term === n.term && (n.votedFor ?? m.from) === m.from && upToDate;
			if (granted) {
				n.votedFor = m.from;
				n.deadline = this.timeout();
			}
			this.send(m.to, m.from, { kind: 'voteReply', granted });
		} else if (m.kind === 'voteReply') {
			if (n.role !== 'candidate' || m.term !== n.term || !m.granted) return;
			n.votes.add(m.from);
			if (n.votes.size >= MAJORITY) this.becomeLeader(m.to);
		} else if (m.kind === 'append') {
			if (m.term < n.term)
				return this.send(m.to, m.from, { kind: 'appendReply', ok: false, match: 0 });
			this.stepDown(m.to, m.term);
			n.deadline = this.timeout();
			// Consistency check: our log must hold the leader's entry just before these.
			if (m.prev > n.log.length || (m.prev > 0 && n.log[m.prev - 1].term !== m.prevTerm))
				return this.send(m.to, m.from, { kind: 'appendReply', ok: false, match: 0 });
			m.entries.forEach((e, k) => {
				const idx = m.prev + k;
				if (n.log[idx] && n.log[idx].term !== e.term) n.log.length = idx; // drop the conflicting tail
				if (!n.log[idx]) n.log.push(e);
			});
			const match = m.prev + m.entries.length;
			n.commit = Math.max(n.commit, Math.min(m.commit, match));
			this.send(m.to, m.from, { kind: 'appendReply', ok: true, match });
		} else {
			if (n.role !== 'leader' || m.term !== n.term) return;
			if (m.ok) {
				n.match[m.from] = Math.max(n.match[m.from], m.match);
				n.next[m.from] = n.match[m.from];
				this.advanceCommit(m.to);
			} else {
				n.next[m.from] = Math.max(0, n.next[m.from] - 1);
				this.sendAppend(m.to, m.from);
			}
		}
	}

	step(dt: number) {
		const until = this.t + dt;
		for (;;) {
			let mi = -1;
			let ni = -1;
			let next = Infinity;
			this.msgs.forEach((m, k) => {
				// msgs stay in send order, so strict < also breaks ties by seq
				if (m.at < next) {
					next = m.at;
					mi = k;
				}
			});
			this.nodes.forEach((n, i) => {
				if (n.deadline < next) {
					next = n.deadline;
					ni = i;
					mi = -1;
				}
			});
			if (next > until) break;
			this.t = next;
			if (mi >= 0) {
				const [m] = this.msgs.splice(mi, 1);
				if (this.connected(m.from, m.to)) this.deliver(m);
			} else this.onTimeout(ni);
		}
		this.t = until;
	}

	/** A client write sent to node `i`. Only a node that believes it's leader accepts it. */
	write(i: number, value: string) {
		const n = this.nodes[i];
		if (n.role !== 'leader') return false;
		const e = { term: n.term, id: this.ids++, value };
		n.log.push(e);
		n.match[i] = n.log.length;
		this.writes.push({ id: e.id, value, node: i });
		this.broadcast(i);
		return true;
	}

	heal() {
		this.side.fill(0);
	}

	get leaders() {
		return this.nodes.flatMap((n, i) => (n.role === 'leader' ? [i] : []));
	}

	/** One leader, everyone reachable, every log identical and fully committed. */
	get converged() {
		const [l, ...rest] = this.leaders;
		if (l === undefined || rest.length || this.side.some((s) => s !== this.side[0])) return false;
		const ref = this.nodes[l];
		return this.nodes.every(
			(n) =>
				n.commit === ref.log.length &&
				n.log.length === ref.log.length &&
				n.log.every((e, k) => e.id === ref.log[k].id)
		);
	}

	/** Which client writes survived. `ackedLost` must always be empty — that's Raft's promise. */
	outcome() {
		const final = new Set(this.nodes[this.leaders[0] ?? 0].log.map((e) => e.id));
		const lost = this.writes.filter((w) => !final.has(w.id));
		return {
			lost,
			ackedLost: lost.filter((w) => this.acked.has(w.id)),
			kept: this.writes.filter((w) => this.acked.has(w.id)).length
		};
	}
}
