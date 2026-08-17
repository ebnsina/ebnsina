/**
 * Toolkit state — one rune store, persisted to localStorage, no account.
 *
 * Same contract as `progress.svelte.ts`: nothing is read until `hydrate()` runs
 * in `onMount`, so SSR and the first client render agree. Gate UI on `ready`.
 *
 * The evidence bank is the root of the graph and is shared across kits — a
 * recorded outcome feeds a gig description today and a résumé bullet in the
 * next kit. Downstream artifacts therefore hold evidence **ids**; deleting a
 * piece of evidence drops those references rather than leaving copied text
 * behind to rot.
 */
import type {
	Evidence,
	FunnelWeek,
	GigDraft,
	Positioning,
	ProfileDraft,
	ProposalDraft,
	ToolkitState
} from './types';

const KEY = 'toolkit-v1';

const emptyPositioning = (): Positioning => ({
	role: '',
	domain: '',
	problemType: '',
	stack: []
});

const emptyState = (): ToolkitState => ({
	version: 1,
	evidence: [],
	positioning: emptyPositioning(),
	profiles: {},
	gigs: {},
	proposals: {},
	funnel: []
});

export const emptyProfile = (platform: ProfileDraft['platform']): ProfileDraft => ({
	platform,
	title: '',
	overview: '',
	skills: [],
	portfolio: []
});

export const emptyGig = (): GigDraft => ({
	title: '',
	category: '',
	tags: [],
	packages: [
		{ name: 'Basic', price: '', deliveryDays: '', revisions: '', includes: [] },
		{ name: 'Standard', price: '', deliveryDays: '', revisions: '', includes: [] },
		{ name: 'Premium', price: '', deliveryDays: '', revisions: '', includes: [] }
	],
	description: '',
	faqs: []
});

export const emptyProposal = (): ProposalDraft => ({
	jobPost: '',
	evidenceIds: [],
	opener: '',
	answers: [],
	closing: ''
});

/** Ids are time-ordered so lists stay stable without a sort key. */
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function migrate(raw: unknown): ToolkitState {
	if (!raw || typeof raw !== 'object') return emptyState();
	const s = raw as Partial<ToolkitState>;
	// Only one version so far; the shape check is what keeps a hand-edited or
	// truncated import from crashing every downstream `.map`.
	// Imported JSON may predate a field or have been hand-edited, so every
	// bindable slot is filled in rather than trusted.
	const evidence = (Array.isArray(s.evidence) ? s.evidence : []).map((e): Evidence => {
		const raw = (e ?? {}) as Partial<Evidence>;
		return {
			id: raw.id ?? newId(),
			label: raw.label ?? '',
			domain: raw.domain ?? '',
			problem: raw.problem ?? '',
			action: raw.action ?? '',
			scale: raw.scale ?? '',
			artifact: raw.artifact ?? '',
			tags: Array.isArray(raw.tags) ? raw.tags : [],
			createdAt: raw.createdAt ?? Date.now(),
			metric: {
				before: raw.metric?.before ?? '',
				after: raw.metric?.after ?? '',
				unit: raw.metric?.unit ?? ''
			}
		};
	});

	return {
		version: 1,
		evidence,
		positioning: { ...emptyPositioning(), ...(s.positioning ?? {}) },
		profiles: s.profiles ?? {},
		gigs: s.gigs ?? {},
		proposals: s.proposals ?? {},
		funnel: Array.isArray(s.funnel) ? s.funnel : []
	};
}

function createToolkit() {
	let state = $state<ToolkitState>(emptyState());
	let ready = $state(false);
	let saveTimer: ReturnType<typeof setTimeout>;

	function write(json: string) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(KEY, json);
		} catch {
			// Quota or private mode — the tool keeps working for this session.
		}
	}

	function persist() {
		write(JSON.stringify(state));
	}

	/** Make sure every draft slot a step might read exists, so the steps can read
	 *  them without mutating anything. */
	function seed() {
		state.profiles.upwork ??= emptyProfile('upwork');
		state.profiles.fiverr ??= emptyProfile('fiverr');
		state.gigs.default ??= emptyGig();
		state.proposals.default ??= emptyProposal();
	}

	return {
		get ready() {
			return ready;
		},
		get evidence() {
			return state.evidence;
		},
		get positioning() {
			return state.positioning;
		},
		get funnel() {
			return state.funnel;
		},

		/**
		 * Persist whatever changed, debounced.
		 *
		 * The forms bind straight into the state proxy (that is what makes the
		 * fields feel native), so there is no single mutation point to hook. The
		 * `JSON.stringify` here deep-reads every field, which is exactly what makes
		 * a wrapping `$effect` re-run on any nested edit — so one call in the kit
		 * page covers every step's inputs.
		 */
		autosave() {
			const json = JSON.stringify(state);
			if (!ready) return; // don't clobber stored data before hydrate() ran
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => write(json), 300);
		},

		/** Client-only. Call in onMount. */
		hydrate() {
			if (typeof localStorage === 'undefined') return;
			try {
				const raw = localStorage.getItem(KEY);
				if (raw) state = migrate(JSON.parse(raw));
			} catch {
				state = emptyState();
			}
			seed();
			ready = true;
		},

		// ---- evidence ---------------------------------------------------------

		addEvidence(partial: Partial<Evidence> = {}): string {
			const id = newId();
			// Optional fields are created empty rather than left undefined so the
			// forms can bind straight to them without every input guarding for null.
			state.evidence.push({
				id,
				label: '',
				domain: '',
				problem: '',
				action: '',
				metric: { before: '', after: '', unit: '' },
				scale: '',
				artifact: '',
				tags: [],
				createdAt: Date.now(),
				...partial
			});
			persist();
			return id;
		},

		updateEvidence(id: string, patch: Partial<Evidence>) {
			const e = state.evidence.find((x) => x.id === id);
			if (!e) return;
			Object.assign(e, patch);
			persist();
		},

		removeEvidence(id: string) {
			state.evidence = state.evidence.filter((e) => e.id !== id);
			// Drop dangling references rather than leaving artifacts pointing at
			// evidence that no longer exists.
			if (state.positioning.proofId === id) state.positioning.proofId = undefined;
			for (const p of Object.values(state.proposals)) {
				p.evidenceIds = p.evidenceIds.filter((x) => x !== id);
			}
			persist();
		},

		evidenceById(id: string): Evidence | undefined {
			return state.evidence.find((e) => e.id === id);
		},

		pickEvidence(ids: string[]): Evidence[] {
			return ids
				.map((id) => state.evidence.find((e) => e.id === id))
				.filter((e): e is Evidence => !!e);
		},

		// ---- positioning ------------------------------------------------------

		setPositioning(patch: Partial<Positioning>) {
			Object.assign(state.positioning, patch);
			persist();
		},

		// ---- keyed drafts -----------------------------------------------------

		// Pure reads. These used to create the draft on first access, which meant
		// mutating state from inside a component's `$derived` — Svelte rejects
		// that, and it took down every step that used one. Slots are created in
		// `seed()` instead.
		profile(platform: string): ProfileDraft {
			return state.profiles[platform];
		},

		gig(key = 'default'): GigDraft {
			return state.gigs[key];
		},

		proposal(key = 'default'): ProposalDraft {
			return state.proposals[key];
		},

		/** Drafts are mutated in place by the forms; this commits the change. */
		save() {
			persist();
		},

		// ---- funnel -----------------------------------------------------------

		addWeek(weekOf: string): string {
			const id = newId();
			state.funnel.push({ id, weekOf, sent: 0, replies: 0, calls: 0, technical: 0, offers: 0 });
			state.funnel.sort((a, b) => b.weekOf.localeCompare(a.weekOf));
			persist();
			return id;
		},

		updateWeek(id: string, patch: Partial<FunnelWeek>) {
			const w = state.funnel.find((x) => x.id === id);
			if (!w) return;
			Object.assign(w, patch);
			persist();
		},

		removeWeek(id: string) {
			state.funnel = state.funnel.filter((w) => w.id !== id);
			persist();
		},

		// ---- portability ------------------------------------------------------

		/** Everything, as a JSON string. No account means export is the only
		 *  backup, so it is a first-class feature rather than a settings-page
		 *  afterthought. */
		exportJSON(): string {
			return JSON.stringify(state, null, 2);
		},

		importJSON(raw: string): boolean {
			try {
				state = migrate(JSON.parse(raw));
				seed();
				persist();
				return true;
			} catch {
				return false;
			}
		},

		reset() {
			state = emptyState();
			seed();
			persist();
		}
	};
}

export const toolkit = createToolkit();
