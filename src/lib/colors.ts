/** Categories are eight steps along the emerald (primary) lightness ramp —
 *  oklch(L 0.11 165), stored as hex so the same values work in CSS (color-mix).
 *
 *  Categories are therefore distinguished by *value*, not by hue. Keep it that
 *  way: adding a second hue here re-introduces the rainbow this replaced. */
export const CAT_COLORS = [
	'#006543', // oklch 0.44 0.11 165
	'#007350',
	'#0f825e',
	'#29926d',
	'#3ca17b',
	'#4eb18a',
	'#5fc199',
	'#70d1a9' // oklch 0.79 0.11 165
];

export const catColor = (i: number) =>
	CAT_COLORS[((i % CAT_COLORS.length) + CAT_COLORS.length) % CAT_COLORS.length];

function hashIndex(key: string, len: number) {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % len;
}

/** Deterministic, well-spread colour from a string key (so colours look varied
 *  and don't repeat in lockstep across lists). */
export const catFor = (key: string) => CAT_COLORS[hashIndex(key, CAT_COLORS.length)];

/* ============================================================
   Aurora card gradients
   ============================================================
   Each card gets its own aurora: two or three soft lights blooming over a deep
   base sweep, varied per card so no two read the same. These stay deliberately
   multi-hued — the aurora is decorative background, not brand colour. Indigo
   (--accent) is reserved for brand text, links and primary buttons. Every theme
   keeps a dark base so white text stays legible. Each entry feeds only CSS
   custom properties consumed by `.glass-card`:
     l1/l2/l3 — the light bloom colours (bright → mid → deep)
     b1/b2/b3 — the base sweep, dark to darkest
     a        — sweep angle;  x/y — origin of the primary light */
const AURORA_THEMES = [
	// northern indigo
	{
		l1: '#8799ff',
		l2: '#f3d3cd',
		l3: '#58006b',
		b1: '#0c27bf',
		b2: '#081b86',
		b3: '#14105e',
		a: 152,
		x: 14,
		y: 8
	},
	// deep ocean
	{
		l1: '#7fe3ff',
		l2: '#cfe4ff',
		l3: '#00527f',
		b1: '#0a5ea8',
		b2: '#063a6b',
		b3: '#04203f',
		a: 118,
		x: 78,
		y: 14
	},
	// berry
	{
		l1: '#ffb3d1',
		l2: '#ffd6c2',
		l3: '#6b0033',
		b1: '#b3155e',
		b2: '#7a0f45',
		b3: '#430627',
		a: 168,
		x: 26,
		y: 86
	},
	// pine
	{
		l1: '#9ff0c9',
		l2: '#e4f2c4',
		l3: '#04513a',
		b1: '#0f7a52',
		b2: '#0a4d38',
		b3: '#062b22',
		a: 134,
		x: 88,
		y: 72
	},
	// ember
	{
		l1: '#ffd08a',
		l2: '#ff9f86',
		l3: '#7a2200',
		b1: '#c2410c',
		b2: '#8a2b0a',
		b3: '#4a1605',
		a: 196,
		x: 50,
		y: 6
	},
	// orchid
	{
		l1: '#f0a8ff',
		l2: '#ffd6f5',
		l3: '#3d0073',
		b1: '#8b0fbf',
		b2: '#5a0b86',
		b3: '#2e0850',
		a: 108,
		x: 8,
		y: 60
	},
	// brass
	{
		l1: '#ffe08a',
		l2: '#ffc59e',
		l3: '#5c3d00',
		b1: '#9a6500',
		b2: '#6b4400',
		b3: '#392400',
		a: 142,
		x: 70,
		y: 88
	},
	// lagoon
	{
		l1: '#a8f0ff',
		l2: '#d4e2ff',
		l3: '#06405c',
		b1: '#0f6f8a',
		b2: '#0a4a63',
		b3: '#05293b',
		a: 176,
		x: 34,
		y: 20
	}
];

const auroraVars = (t: (typeof AURORA_THEMES)[number]) =>
	`--au-1:${t.l1};--au-2:${t.l2};--au-3:${t.l3};--au-b1:${t.b1};--au-b2:${t.b2};--au-b3:${t.b3};--aa:${t.a}deg;--ax:${t.x}%;--ay:${t.y}%`;

/** Inline style for a `.glass-card`, cycling through the aurora themes. */
export const auroraAt = (i: number) =>
	auroraVars(
		AURORA_THEMES[((i % AURORA_THEMES.length) + AURORA_THEMES.length) % AURORA_THEMES.length]
	);
