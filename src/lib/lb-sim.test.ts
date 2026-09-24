import { expect, test } from 'vitest';
import { LbSim, percentile, runChallenge } from './lb-sim';

test('round-robin and random drown the slow backend; least-conn and two-choices pass', () => {
	expect(runChallenge('round-robin').pass).toBe(false);
	expect(runChallenge('random').pass).toBe(false);
	expect(runChallenge('least-conn').pass).toBe(true);
	expect(runChallenge('two-choices').pass).toBe(true);
});

test('same seed, different frame sizes → identical run', () => {
	const a = new LbSim(40, 'least-conn', 3, 1);
	const b = new LbSim(40, 'least-conn', 3, 1);
	a.step(20);
	for (let i = 0; i < 1200; i++) b.step(20 / 1200);
	expect(b.done.length).toBe(a.done.length);
	expect(percentile(b.done, 0.99)).toBeCloseTo(percentile(a.done, 0.99), 9);
});
