import { expect, test } from 'vitest';
import { mulberry32 } from './rng';
import { RaftSim } from './raft-sim';

function settle(sim: RaftSim, max = 5) {
	for (let i = 0; i < max * 100 && !sim.converged; i++) sim.step(0.01);
	expect(sim.converged).toBe(true);
}

test('every run opens with সিনা as leader', () => {
	const sim = new RaftSim(3);
	sim.step(1);
	expect(sim.leaders).toEqual([0]);
});

test('intended answer: a write on the minority leader is dropped, the majority write survives', () => {
	const sim = new RaftSim(1);
	sim.step(1);
	sim.side = [1, 1, 0, 0, 0];
	expect(sim.write(0, 'A')).toBe(true); // সিনা still thinks it leads, so it accepts…
	sim.step(1);
	const [, newLeader] = sim.leaders; // …while the majority elects someone else
	expect(newLeader).toBeGreaterThan(1);
	expect(sim.write(newLeader, 'B')).toBe(true);
	sim.step(1);
	expect(sim.nodes[0].commit).toBeLessThan(sim.nodes[0].log.length); // A never committed
	sim.heal();
	settle(sim);
	const out = sim.outcome();
	expect(out.lost.map((w) => w.value)).toEqual(['A']);
	expect(out.ackedLost).toEqual([]);
	expect(out.kept).toBe(1);
});

test('naive answer: leader kept in the majority, so its write commits and nothing is lost', () => {
	const sim = new RaftSim(1);
	sim.step(1);
	sim.side = [0, 0, 0, 1, 1];
	sim.write(0, 'A');
	sim.step(1);
	sim.heal();
	settle(sim);
	expect(sim.outcome().lost).toEqual([]);
});

test('safety under random partitions: committed entries never diverge or disappear', () => {
	for (let seed = 1; seed <= 40; seed++) {
		const sim = new RaftSim(seed);
		const r = mulberry32(seed * 7);
		const committed: number[] = []; // id committed at each index, across all nodes
		for (let round = 0; round < 30; round++) {
			if (r() < 0.3) sim.side = sim.side.map(() => (r() < 0.4 ? 1 : 0));
			if (r() < 0.2) sim.heal();
			for (const l of sim.leaders) if (r() < 0.5) sim.write(l, 'x');
			for (let k = 0; k < 20; k++) {
				sim.step(0.01);
				for (const n of sim.nodes)
					n.log.slice(0, n.commit).forEach((e, i) => {
						committed[i] ??= e.id;
						expect(e.id).toBe(committed[i]);
					});
			}
		}
		sim.heal();
		settle(sim);
		expect(sim.outcome().ackedLost).toEqual([]);
	}
});
