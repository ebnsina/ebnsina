/**
 * The AI seam.
 *
 * Every generation task is described as data (`PromptSpec`) rather than as a
 * string. Today the only consumer is `render()`, which turns a spec into a
 * prompt the reader copies into whichever assistant they already pay for — no
 * backend, no API key, no rate limiting, no bill.
 *
 * If a hosted version is ever wanted, it is one more consumer of the same
 * object (`generate(spec)` behind an endpoint) and nothing upstream changes.
 * That is the whole reason the specs are built from the reader's stored
 * artifacts instead of from free text: the context is already structured.
 *
 * Rule that holds in both modes: **a spec never asks for invention.** Every
 * context block is something the reader wrote, and the constraints forbid
 * inventing numbers — because a fabricated metric is the one failure that
 * survives review and blows up in an interview.
 */
import type { Evidence, GigDraft, Positioning, PromptSpec, ProposalDraft } from './types';
import type { Extraction } from './extract';

const NO_INVENTION =
	'Do not invent facts, numbers, employers, or outcomes. Use only what is given above; if something is missing, leave a clearly marked gap like [NEEDS: metric] instead of guessing.';

const PLAIN_ENGLISH =
	'Write in plain, direct English. Short sentences. No filler openings, no "I hope this finds you well", no adjectives that replace evidence ("passionate", "detail-oriented", "world-class").';

function evidenceBlock(e: Evidence): string {
	const metric = e.metric?.before
		? `Measured: ${e.metric.before} → ${e.metric.after} ${e.metric.unit}`.trim()
		: '';
	return [
		`Label: ${e.label}`,
		e.domain && `Domain: ${e.domain}`,
		e.scale && `Scale: ${e.scale}`,
		`Problem: ${e.problem}`,
		`What I did: ${e.action}`,
		metric,
		e.artifact && `Public link: ${e.artifact}`
	]
		.filter(Boolean)
		.join('\n');
}

function positioningBlock(p: Positioning): string {
	return [
		`Role: ${p.role}`,
		`Domain: ${p.domain}`,
		`Problem type: ${p.problemType}`,
		p.stack.length ? `Stack: ${p.stack.join(', ')}` : ''
	]
		.filter(Boolean)
		.join('\n');
}

// ---- spec builders ----------------------------------------------------------

export function overviewSpec(p: Positioning, evidence: Evidence[], platform: string): PromptSpec {
	return {
		task: `Write my ${platform} profile overview.`,
		context: [
			{ label: 'My positioning', body: positioningBlock(p) },
			...evidence.map((e, i) => ({ label: `Evidence ${i + 1}`, body: evidenceBlock(e) }))
		],
		constraints: [
			'The first 250 characters must stand alone. They are all a client sees in search results.',
			'Open with the problem I solve, not with "I am a…".',
			'Every claim must be backed by one of the evidence blocks above.',
			PLAIN_ENGLISH,
			NO_INVENTION
		],
		output: 'Three short paragraphs. No headings, no bullet points, no sign-off.'
	};
}

export function gigSpec(gig: GigDraft, p: Positioning, evidence: Evidence[]): PromptSpec {
	return {
		task: 'Write the description for this Fiverr gig.',
		context: [
			{ label: 'My positioning', body: positioningBlock(p) },
			{
				label: 'Gig so far',
				body: [
					`Title: ${gig.title}`,
					gig.tags.length ? `Search tags: ${gig.tags.join(', ')}` : '',
					...gig.packages
						.filter((pk) => pk.name)
						.map(
							(pk) =>
								`Package ${pk.name}: ${pk.price}, ${pk.deliveryDays} days, ${pk.revisions} revisions: ${pk.includes.join('; ')}`
						)
				]
					.filter(Boolean)
					.join('\n')
			},
			...evidence.map((e, i) => ({ label: `Evidence ${i + 1}`, body: evidenceBlock(e) }))
		],
		constraints: [
			'Maximum 1200 characters.',
			'Lead with what the buyer gets, not with my biography.',
			'State plainly what is NOT included. That prevents the scope disputes that cost ratings.',
			PLAIN_ENGLISH,
			NO_INVENTION
		],
		output: 'The description body only, ready to paste into the gig editor.'
	};
}

export function proposalSpec(
	draft: ProposalDraft,
	extraction: Extraction,
	p: Positioning,
	evidence: Evidence[]
): PromptSpec {
	const asked = [
		extraction.screeners.length ? `Screening instruction: ${extraction.screeners.join(' | ')}` : '',
		extraction.questions.length ? `Questions asked:\n- ${extraction.questions.join('\n- ')}` : '',
		extraction.requirements.length
			? `Stated requirements:\n- ${extraction.requirements.join('\n- ')}`
			: ''
	]
		.filter(Boolean)
		.join('\n\n');

	return {
		task: 'Write my proposal for this job post.',
		context: [
			{ label: 'The job post', body: draft.jobPost },
			asked ? { label: 'What the client explicitly asked for', body: asked } : null,
			{ label: 'My positioning', body: positioningBlock(p) },
			...evidence.map((e, i) => ({ label: `Evidence ${i + 1}`, body: evidenceBlock(e) })),
			draft.opener.trim() ? { label: 'My draft opening line', body: draft.opener } : null,
			draft.answers.filter((a) => a.answer.trim()).length
				? {
						label: 'My answers to their questions',
						body: draft.answers
							.filter((a) => a.answer.trim())
							.map((a) => `Q: ${a.question}\nA: ${a.answer}`)
							.join('\n\n')
					}
				: null
		].filter((c): c is { label: string; body: string } => c !== null),
		constraints: [
			extraction.screeners.length
				? 'Follow the screening instruction exactly and literally. It is the first thing the client checks.'
				: '',
			'Open by naming their specific problem, not by introducing myself.',
			'Answer every question they asked, in their order.',
			'Use at most two pieces of evidence, and only ones relevant to this post.',
			'Under 200 words. A proposal is read on a phone between other proposals.',
			'End with one concrete next step, not with "looking forward to hearing from you".',
			PLAIN_ENGLISH,
			NO_INVENTION
		].filter(Boolean),
		output: 'The proposal text only: no subject line, no explanation of your choices.'
	};
}

// ---- rendering --------------------------------------------------------------

/** Turn a spec into a prompt the reader can paste anywhere.
 *
 * Plain markdown-ish text on purpose: it has to survive a copy into a chat box,
 * a phone keyboard, and whatever assistant is in front of them. */
export function render(spec: PromptSpec): string {
	const parts: string[] = [spec.task, ''];

	for (const c of spec.context) {
		parts.push(`## ${c.label}`, c.body.trim(), '');
	}

	parts.push('## Rules');
	for (const r of spec.constraints) parts.push(`- ${r}`);
	parts.push('', '## Output', spec.output);

	return parts.join('\n').trim();
}

/** Rough token estimate, so the UI can warn before a paste that will be cut off
 *  by a free-tier chat window. Deliberately crude — characters over four. */
export function approxTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
