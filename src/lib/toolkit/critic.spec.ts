import { describe, expect, it } from 'vitest';
import { critique, critiqueEvidence, hasNumber, score, wordCount } from './critic';

describe('hasNumber', () => {
	it('finds Latin and Bangla digits and written magnitudes', () => {
		expect(hasNumber('latency 840ms')).toBe(true);
		expect(hasNumber('৪ মিলিয়ন ইউজার')).toBe(true);
		expect(hasNumber('cut cost by a third')).toBe(false);
	});
});

describe('wordCount', () => {
	it('counts Bangla and Latin the same way and treats blank as zero', () => {
		expect(wordCount('  ')).toBe(0);
		expect(wordCount('আমি চেকআউট ঠিক করেছি')).toBe(4);
	});
});

describe('critique — filler', () => {
	it('blocks template openings', () => {
		const f = critique({ field: 'opener', text: 'I hope this message finds you well.' });
		expect(
			f.some((x) => x.severity === 'blocker' && x.excerpt === 'i hope this message finds you well')
		).toBe(true);
	});

	it('blocks claim-adjectives that replace evidence', () => {
		const f = critique({ field: 'overview', text: 'I am a passionate, hardworking team player.' });
		expect(f.filter((x) => x.severity === 'blocker').length).toBeGreaterThanOrEqual(3);
	});

	it('passes clean, specific copy', () => {
		const f = critique({
			field: 'overview',
			text: 'I rebuilt a checkout flow so double charges fell from 0.4% to 0.02%.'
		});
		expect(f).toHaveLength(0);
	});
});

describe('critique — vague scale', () => {
	it('flags "highly scalable" when nothing is measured', () => {
		const f = critique({ field: 'overview', text: 'I build highly scalable systems.' });
		expect(f.some((x) => x.excerpt === 'highly scalable')).toBe(true);
	});

	it('allows the same phrase once a number is present', () => {
		const f = critique({
			field: 'overview',
			text: 'I build highly scalable systems — this one holds 5000 requests per second.'
		});
		expect(f.some((x) => x.excerpt === 'highly scalable')).toBe(false);
	});
});

describe('critique — limits', () => {
	it('blocks past the hard maximum', () => {
		const f = critique({
			field: 'title',
			text: 'x'.repeat(90),
			platform: 'fiverr',
			limitKey: 'gigTitle'
		});
		expect(f.some((x) => x.severity === 'blocker' && x.message.includes('80'))).toBe(true);
	});

	it('warns past the practical limit but does not block', () => {
		const f = critique({
			field: 'overview',
			text: 'y'.repeat(400),
			platform: 'upwork',
			limitKey: 'overview'
		});
		expect(f.every((x) => x.severity !== 'blocker')).toBe(true);
		expect(f.some((x) => x.severity === 'warning')).toBe(true);
	});
});

describe('critique — opener relevance', () => {
	const post = 'We need help fixing duplicate charges in our Stripe checkout during peak sales.';

	it('nudges when the opener could be sent to anyone', () => {
		const f = critique({
			field: 'opener',
			text: 'I am the right person for your project.',
			jobPost: post
		});
		expect(f.some((x) => x.message.includes('মিলছে না'))).toBe(true);
	});

	it('stays quiet when the opener engages the post', () => {
		const f = critique({
			field: 'opener',
			text: 'Duplicate charges at checkout usually come from retries, not from Stripe.',
			jobPost: post
		});
		expect(f.some((x) => x.message.includes('মিলছে না'))).toBe(false);
	});
});

describe('critiqueEvidence', () => {
	const base = {
		label: 'checkout',
		problem: 'Double charges during sales.',
		action:
			'I designed an idempotency key plus a nightly reconciliation job, choosing it over distributed transactions.'
	};

	it('blocks evidence with no measurement at all', () => {
		expect(
			critiqueEvidence(base).some((f) => f.field === 'metric' && f.severity === 'blocker')
		).toBe(true);
	});

	it('accepts scale in place of a before/after metric', () => {
		const f = critiqueEvidence({ ...base, scale: '4M MAU' });
		expect(f.some((x) => x.field === 'metric')).toBe(false);
	});

	it('warns when the action is too thin to show a decision', () => {
		const f = critiqueEvidence({ ...base, action: 'Fixed it.', scale: '4M MAU' });
		expect(f.some((x) => x.field === 'action')).toBe(true);
	});
});

describe('score', () => {
	it('is 100 when clean and never negative', () => {
		expect(score([])).toBe(100);
		expect(
			score(
				Array.from({ length: 9 }, () => ({
					severity: 'blocker' as const,
					field: 'f',
					message: '',
					fix: ''
				}))
			)
		).toBe(0);
	});
});
