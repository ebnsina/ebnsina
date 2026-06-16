// Client-side learning-progress store for the notes journey.
// Single source of truth = the set of completed chapters; XP is derived from it,
// so it can never desync or double-count. Persisted to localStorage (no DB).

const KEY = 'notes-progress-v1';

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'mastery';

export const XP_BY_LEVEL: Record<Level, number> = {
	beginner: 10,
	intermediate: 20,
	advanced: 30,
	mastery: 50
};

export function xpForLevel(level: string): number {
	return XP_BY_LEVEL[level as Level] ?? 10;
}

const RANKS = [
	{ name: 'Curious', min: 0 },
	{ name: 'Novice', min: 80 },
	{ name: 'Apprentice', min: 220 },
	{ name: 'Practitioner', min: 500 },
	{ name: 'Engineer', min: 950 },
	{ name: 'Architect', min: 1700 },
	{ name: 'Distinguished', min: 3000 }
] as const;

type Entry = { at: number; xp: number };
type State = Record<string, Entry>;

const idOf = (category: string, slug: string) => `${category}/${slug}`;

function read(): State {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as State) : {};
	} catch {
		return {};
	}
}

class Progress {
	completed = $state<State>({});
	ready = $state(false);

	/** Load from localStorage once, after mount (avoids SSR hydration mismatch). */
	hydrate() {
		if (this.ready) return;
		this.completed = read();
		this.ready = true;
	}

	private persist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(KEY, JSON.stringify(this.completed));
		} catch {
			/* quota exceeded / private mode — progress just won't persist */
		}
	}

	isDone(category: string, slug: string) {
		return idOf(category, slug) in this.completed;
	}

	complete(category: string, slug: string, level: string) {
		const key = idOf(category, slug);
		if (key in this.completed) return;
		this.completed = { ...this.completed, [key]: { at: Date.now(), xp: xpForLevel(level) } };
		this.persist();
	}

	uncomplete(category: string, slug: string) {
		const key = idOf(category, slug);
		if (!(key in this.completed)) return;
		const next = { ...this.completed };
		delete next[key];
		this.completed = next;
		this.persist();
	}

	toggle(category: string, slug: string, level: string) {
		if (this.isDone(category, slug)) this.uncomplete(category, slug);
		else this.complete(category, slug, level);
	}

	/** How many of the given chapter slugs in a category are complete. */
	doneIn(category: string, slugs: string[]) {
		return slugs.reduce((n, s) => n + (this.isDone(category, s) ? 1 : 0), 0);
	}

	/** A track (category) is "mastered" once every one of its chapters is done. */
	isTrackComplete(category: string, slugs: string[]) {
		return slugs.length > 0 && this.doneIn(category, slugs) === slugs.length;
	}

	get xp() {
		let sum = 0;
		for (const k in this.completed) sum += this.completed[k].xp;
		return sum;
	}

	get count() {
		return Object.keys(this.completed).length;
	}

	/** Current rank + progress toward the next one. */
	get rank() {
		const xp = this.xp;
		let i = 0;
		for (let r = 0; r < RANKS.length; r++) if (xp >= RANKS[r].min) i = r;
		const current = RANKS[i];
		const next = RANKS[i + 1] ?? null;
		const into = xp - current.min;
		const span = next ? next.min - current.min : 1;
		const pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;
		return { name: current.name, level: i + 1, next, pct, toNext: next ? next.min - xp : 0 };
	}

	// ---- backup / restore (manual, since there's no account sync) ----

	export() {
		return JSON.stringify({ v: 1, completed: this.completed }, null, 2);
	}

	import(json: string) {
		const parsed = JSON.parse(json);
		const data = (parsed?.completed ?? parsed) as Record<string, Partial<Entry>>;
		if (!data || typeof data !== 'object') throw new Error('Invalid progress file');
		const clean: State = {};
		for (const k in data) {
			const e = data[k];
			if (e && typeof e.xp === 'number') clean[k] = { at: e.at ?? Date.now(), xp: e.xp };
		}
		this.completed = clean;
		this.persist();
	}

	reset() {
		this.completed = {};
		this.persist();
	}
}

export const progress = new Progress();
