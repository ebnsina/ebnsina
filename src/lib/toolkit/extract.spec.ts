import { describe, expect, it } from 'vitest';
import { extract, missingScreenerTokens } from './extract';

const POST = `
We are looking for a senior backend engineer to fix duplicate charges in our checkout.

Requirements:
- Must have experience with Stripe and idempotent payment flows
- At least 4 years of experience with Node.js and PostgreSQL
- Familiar with Kafka is a plus

Please start your proposal with the word "reconcile" so I know you read this.

How would you approach reconciliation for refunds?
What is your availability per week?

Budget is $3000 fixed price. Deadline is within 6 weeks, with long-term potential after that.
`;

describe('extract', () => {
	const e = extract(POST);

	it('finds the screening instruction and keeps it out of requirements', () => {
		expect(e.screeners).toHaveLength(1);
		expect(e.requirements.some((r) => r.includes('start your proposal'))).toBe(false);
	});

	it('collects every explicit question', () => {
		expect(e.questions).toHaveLength(2);
	});

	it('collects stated requirements', () => {
		expect(e.requirements.length).toBeGreaterThanOrEqual(3);
	});

	it('picks up technology keywords without matching inside other words', () => {
		expect(e.keywords).toEqual(expect.arrayContaining(['stripe', 'node', 'postgresql', 'kafka']));
		// "go" must not match inside "going"/"algorithm"
		expect(extract('We are going to build an algorithm').keywords).not.toContain('go');
	});

	it('separates budget and timeline signals', () => {
		expect(e.budget.join(' ')).toContain('$3000');
		expect(e.timeline.join(' ')).toContain('6 weeks');
	});

	it('raises the long-term-potential warning', () => {
		expect(e.warnings.length).toBeGreaterThanOrEqual(1);
	});

	it('returns empty structures for an empty post rather than throwing', () => {
		const empty = extract('');
		expect(empty.questions).toHaveLength(0);
		expect(empty.screeners).toHaveLength(0);
	});
});

describe('missingScreenerTokens', () => {
	const e = extract(POST);

	it('reports the required word when the draft omits it', () => {
		expect(missingScreenerTokens(e, 'Hi, I can fix your checkout.')).toEqual(['reconcile']);
	});

	it('is satisfied once the word appears, in any case', () => {
		expect(missingScreenerTokens(e, 'Reconcile — duplicate charges are usually retries.')).toEqual(
			[]
		);
	});

	it('returns nothing when the post had no screener', () => {
		expect(missingScreenerTokens(extract('Need a logo, $50.'), 'anything')).toEqual([]);
	});
});
