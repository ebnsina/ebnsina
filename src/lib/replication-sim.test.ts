import { expect, test } from 'vitest';
import { ReplicationSim, runChallenge } from './replication-sim';

test('any-replica goes stale, always-primary overloads, a sticky window in between passes', () => {
	expect(runChallenge('replica', 0).stale).toBeGreaterThan(0);
	expect(runChallenge('primary', 0).pass).toBe(false);
	expect(runChallenge('sticky', 1).stale).toBeGreaterThan(0);
	expect(runChallenge('sticky', 5).pass).toBe(true);
	expect(runChallenge('sticky', 30).pass).toBe(false);
});

test('same seed, different frame sizes → identical run', () => {
	const a = new ReplicationSim(2, 'replica', 0, 1);
	const b = new ReplicationSim(2, 'replica', 0, 1);
	a.step(60);
	for (let i = 0; i < 3600; i++) b.step(60 / 3600);
	expect([b.reads, b.stale, b.writes]).toEqual([a.reads, a.stale, a.writes]);
});
