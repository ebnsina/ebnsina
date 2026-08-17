/**
 * Shared types for the /tools kits.
 *
 * The whole toolkit is one artifact chain: evidence feeds positioning, which
 * constrains every downstream artifact (a gig, a proposal, a résumé bullet).
 * Artifacts therefore reference evidence **by id** and never copy its text —
 * that is what lets one recorded outcome serve a Fiverr gig and a behavioural
 * interview answer at the same time, across kits.
 */

/** One thing you actually did, recorded once, reused everywhere.
 *  The fields mirror the shape both series ask readers to write down:
 *  problem → action → number → what it changed. */
export type Evidence = {
	id: string;
	/** Short handle you'll recognise in a picker: "চেকআউট ডাবল-চার্জ". */
	label: string;
	/** Domain it belongs to — payments, video, logistics… drives positioning. */
	domain: string;
	/** What was wrong or hard, in one or two sentences. */
	problem: string;
	/** What *you* did — the decision, not the team's summary. */
	action: string;
	/** The measurement, kept as three parts so the critic can check it exists.
	 *  Always present (empty strings when unmeasured) so forms can bind to it. */
	metric: { before: string; after: string; unit: string };
	/** Scale context: "৪ মিলিয়ন MAU", "দিনে ২ লাখ অর্ডার". */
	scale: string;
	/** A public link that backs this up, if there is one. */
	artifact: string;
	tags: string[];
	createdAt: number;
};

/** The two-line identity every downstream artifact opens with. */
export type Positioning = {
	/** "Senior Backend Engineer", "Motion designer" — level + role. */
	role: string;
	/** Payments, video, e-commerce… */
	domain: string;
	/** Reliability, scale, migration, latency, cost. */
	problemType: string;
	stack: string[];
	/** Evidence id used as the headline proof. */
	proofId?: string;
};

export type Platform = 'upwork' | 'fiverr' | 'generic';

/** A field the reader fills in, checked against a platform limit. */
export type FieldValue = { value: string; platform?: Platform };

export type ProfileDraft = {
	platform: Platform;
	title: string;
	overview: string;
	skills: string[];
	portfolio: { title: string; role: string; description: string; skills: string[] }[];
};

export type GigPackage = {
	name: string;
	price: string;
	deliveryDays: string;
	revisions: string;
	includes: string[];
};

export type GigDraft = {
	title: string;
	category: string;
	tags: string[];
	packages: GigPackage[];
	description: string;
	faqs: { q: string; a: string }[];
};

export type ProposalDraft = {
	/** The raw job post, pasted in. */
	jobPost: string;
	/** Evidence chosen to answer it. */
	evidenceIds: string[];
	/** The reader's own opening line — the critic is hardest on this one. */
	opener: string;
	/** Answers to the questions `extract` found in the post. */
	answers: { question: string; answer: string }[];
	closing: string;
};

/** One week of the funnel numbers both series tell readers to measure. */
export type FunnelWeek = {
	id: string;
	/** ISO week start, so weeks sort without a date library. */
	weekOf: string;
	sent: number;
	replies: number;
	calls: number;
	technical: number;
	offers: number;
};

/** Everything the toolkit stores, versioned so an import can be migrated. */
export type ToolkitState = {
	version: 1;
	evidence: Evidence[];
	positioning: Positioning;
	profiles: Record<string, ProfileDraft>;
	gigs: Record<string, GigDraft>;
	proposals: Record<string, ProposalDraft>;
	funnel: FunnelWeek[];
};

// ---- critic -----------------------------------------------------------------

export type Severity = 'blocker' | 'warning' | 'nudge';

/** A finding always carries the fix. A score alone tells the reader they failed
 *  without telling them what to type instead, which is the failure mode of
 *  every other writing tool. */
export type Finding = {
	severity: Severity;
	/** Which field it applies to, for anchoring in the UI. */
	field: string;
	/** What is wrong, in Bangla. */
	message: string;
	/** What to do about it, in Bangla. */
	fix: string;
	/** The offending excerpt, when there is one. */
	excerpt?: string;
};

// ---- the AI seam ------------------------------------------------------------

/**
 * A structured description of a generation task.
 *
 * Today `render()` turns this into a prompt the reader pastes into whatever
 * assistant they already use. Later, `generate()` can send the same object to
 * an endpoint. Nothing upstream knows which happened — that is the point of
 * keeping it data rather than a string.
 */
export type PromptSpec = {
	/** One line: what is being produced. */
	task: string;
	/** Facts the model must work from — never invented, always the reader's. */
	context: { label: string; body: string }[];
	/** Hard rules: length limits, banned phrasing, required structure. */
	constraints: string[];
	/** What shape the answer should take. */
	output: string;
};

/** A step inside a kit. Steps are shared across kits wherever the artifact is
 *  shared — evidence and funnel belong to every kit, a gig belongs to one. */
export type KitStep = {
	id: string;
	/** Bangla label shown in the stepper. */
	label: string;
	/** One-line Bangla description. */
	blurb: string;
	/** Which series part explains this step, for the "read the chapter" link. */
	reading?: { series: string; part: string; label: string };
};

export type Kit = {
	slug: string;
	/** Bangla display name. */
	title: string;
	/** English one-liner for the /tools index chrome. */
	tagline: string;
	/** Bangla blurb on the kit page. */
	description: string;
	steps: KitStep[];
	/** The series this kit accompanies. */
	series?: string;
	status: 'ready' | 'planned';
};
