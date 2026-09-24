import { expect, test } from 'vitest';
import { MIN_WORKERS, QueueSim, runChallenge } from './queue-sim';

test('naive capacity math (45 ÷ 10 → 5 workers) fails; 6 is the answer', () => {
	expect(runChallenge(5).pass).toBe(false);
	expect(MIN_WORKERS).toBe(6);
});

test('same seed, different frame sizes → identical run', () => {
	const a = new QueueSim(30, 3, 1);
	const b = new QueueSim(30, 3, 1);
	a.step(20);
	for (let i = 0; i < 1200; i++) b.step(20 / 1200);
	expect(b.done.length).toBe(a.done.length);
	expect(b.percentile(0.99)).toBeCloseTo(a.percentile(0.99), 9);
});
