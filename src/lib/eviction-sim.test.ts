import { expect, test } from 'vitest';
import { CHALLENGE, runChallenge } from './eviction-sim';

test('LRU and FIFO fail even with double the memory; LFU passes within budget', () => {
	expect(runChallenge(60, 'lru').pass).toBe(false);
	expect(runChallenge(60, 'lru').hitRatio).toBeLessThan(CHALLENGE.target);
	expect(runChallenge(CHALLENGE.maxSlots, 'fifo').pass).toBe(false);
	expect(runChallenge(CHALLENGE.maxSlots, 'lfu').pass).toBe(true);
	expect(runChallenge(61, 'lfu').pass).toBe(false); // over the memory budget
});
