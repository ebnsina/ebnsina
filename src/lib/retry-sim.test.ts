import { expect, test } from 'vitest';
import { CHALLENGE, NAIVE, RetrySim, runChallenge, summarize } from './retry-sim';

test('naive retries never recover; backoff + jitter + breaker does', () => {
	const naive = runChallenge(NAIVE);
	expect(naive.pass).toBe(false);
	expect(naive.recoveredAt).toBeNull();
	expect(naive.amp).toBeGreaterThan(3);
	expect(runChallenge({ ...NAIVE, backoff: true, breaker: true }).pass).toBe(true);
});

test('the outcome is not a lucky seed', () => {
	for (let seed = 1; seed <= 10; seed++) {
		const run = (s: typeof NAIVE) => {
			const sim = new RetrySim(s, seed);
			sim.step(CHALLENGE.outageAt);
			sim.startOutage(CHALLENGE.outageFor);
			sim.step(CHALLENGE.seconds - CHALLENGE.outageAt);
			return summarize(sim.buckets.slice(-10)).success;
		};
		expect(run(NAIVE)).toBeLessThan(0.5);
		expect(run({ ...NAIVE, backoff: true, breaker: true })).toBeGreaterThan(CHALLENGE.target);
	}
});

test('same seed, different frame sizes → identical run', () => {
	const a = new RetrySim(NAIVE, 1);
	const b = new RetrySim(NAIVE, 1);
	a.step(20);
	for (let i = 0; i < 1200; i++) b.step(20 / 1200);
	expect(b.buckets).toEqual(a.buckets);
});
