import { expect, test } from 'vitest';
import { runChallenge } from './sharding-sim';

test('hash % N moves most keys; a ring needs enough vnodes to also stay balanced', () => {
	expect(runChallenge('modulo', 1).movedShare).toBeGreaterThan(0.7);
	expect(runChallenge('modulo', 1).pass).toBe(false);
	expect(runChallenge('ring', 1).pass).toBe(false);
	expect(runChallenge('ring', 100).pass).toBe(true);
});
