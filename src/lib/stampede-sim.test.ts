import { expect, test } from 'vitest';
import { runChallenge, StampedeSim } from './stampede-sim';

test('no protection and a lock both fail at every TTL; early refresh passes', () => {
	for (const ttl of [2, 10, 30]) {
		expect(runChallenge(ttl, 'none').pass).toBe(false);
		expect(runChallenge(ttl, 'lock').pass).toBe(false);
		expect(runChallenge(ttl, 'early').pass).toBe(true);
	}
});

test('same seed, different frame sizes → identical run', () => {
	const a = new StampedeSim(300, 5, 'none', 2);
	const b = new StampedeSim(300, 5, 'none', 2);
	a.step(20);
	for (let i = 0; i < 1200; i++) b.step(20 / 1200);
	expect(b.dbQueries).toBe(a.dbQueries);
	expect(b.peakDb).toBe(a.peakDb);
});
