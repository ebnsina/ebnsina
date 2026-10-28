/** Categories are eight steps of ink strength — the page ink mixed toward the
 *  page background — so they stay monochrome, theme-aware and AA-legible as text
 *  in both themes (the lightest step is 65% ink). Categories are distinguished
 *  by *value*, never by hue. */
export const CAT_COLORS = [100, 95, 90, 85, 80, 75, 70, 65].map(
	(p) => `color-mix(in oklab, var(--fg) ${p}%, var(--bg))`
);

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
   base sweep, varied per card so no two read the same. Monochrome by default
   (each grey the lightness of the hue it replaced); the colour theme uses the hues. Every theme
   keeps a dark base so white text stays legible. Each entry feeds only CSS
   custom properties consumed by `.glass-card`:
     l1/l2/l3 — the light bloom colours (bright → mid → deep)
     b1/b2/b3 — the base sweep, dark to darkest
     a        — sweep angle;  x/y — origin of the primary light */
const AURORA_THEMES = [
	// northern indigo
	{
		l1: '#a0a0a0',
		l2: '#dadada',
		l3: '#323232',
		b1: '#414141',
		b2: '#2c2c2c',
		b3: '#1e1e1e',
		color: {
			l1: '#8799ff',
			l2: '#f3d3cd',
			l3: '#58006b',
			b1: '#0c27bf',
			b2: '#081b86',
			b3: '#14105e'
		},
		a: 152,
		x: 14,
		y: 8
	},
	// deep ocean
	{
		l1: '#d5d5d5',
		l2: '#e2e2e2',
		l3: '#4e4e4e',
		b1: '#5d5d5d',
		b2: '#393939',
		b3: '#202020',
		color: {
			l1: '#7fe3ff',
			l2: '#cfe4ff',
			l3: '#00527f',
			b1: '#0a5ea8',
			b2: '#063a6b',
			b3: '#04203f'
		},
		a: 118,
		x: 78,
		y: 14
	},
	// berry
	{
		l1: '#c9c9c9',
		l2: '#dedede',
		l3: '#333333',
		b1: '#5d5d5d',
		b2: '#3f3f3f',
		b3: '#202020',
		color: {
			l1: '#ffb3d1',
			l2: '#ffd6c2',
			l3: '#6b0033',
			b1: '#b3155e',
			b2: '#7a0f45',
			b3: '#430627'
		},
		a: 168,
		x: 26,
		y: 86
	},
	// pine
	{
		l1: '#dfdfdf',
		l2: '#ececec',
		l3: '#474747',
		b1: '#6b6b6b',
		b2: '#434343',
		b3: '#252525',
		color: {
			l1: '#9ff0c9',
			l2: '#e4f2c4',
			l3: '#04513a',
			b1: '#0f7a52',
			b2: '#0a4d38',
			b3: '#062b22'
		},
		a: 134,
		x: 88,
		y: 72
	},
	// ember
	{
		l1: '#d7d7d7',
		l2: '#b8b8b8',
		l3: '#414141',
		b1: '#6d6d6d',
		b2: '#4c4c4c',
		b3: '#272727',
		color: {
			l1: '#ffd08a',
			l2: '#ff9f86',
			l3: '#7a2200',
			b1: '#c2410c',
			b2: '#8a2b0a',
			b3: '#4a1605'
		},
		a: 196,
		x: 50,
		y: 6
	},
	// orchid
	{
		l1: '#c2c2c2',
		l2: '#e2e2e2',
		l3: '#292929',
		b1: '#575757',
		b2: '#393939',
		b3: '#1e1e1e',
		color: {
			l1: '#f0a8ff',
			l2: '#ffd6f5',
			l3: '#3d0073',
			b1: '#8b0fbf',
			b2: '#5a0b86',
			b3: '#2e0850'
		},
		a: 108,
		x: 8,
		y: 60
	},
	// brass
	{
		l1: '#e2e2e2',
		l2: '#d1d1d1',
		l3: '#434343',
		b1: '#707070',
		b2: '#4c4c4c',
		b3: '#282828',
		color: {
			l1: '#ffe08a',
			l2: '#ffc59e',
			l3: '#5c3d00',
			b1: '#9a6500',
			b2: '#6b4400',
			b3: '#392400'
		},
		a: 142,
		x: 70,
		y: 88
	},
	// lagoon
	{
		l1: '#e4e4e4',
		l2: '#e1e1e1',
		l3: '#3c3c3c',
		b1: '#666666',
		b2: '#444444',
		b3: '#262626',
		color: {
			l1: '#a8f0ff',
			l2: '#d4e2ff',
			l3: '#06405c',
			b1: '#0f6f8a',
			b2: '#0a4a63',
			b3: '#05293b'
		},
		a: 176,
		x: 34,
		y: 20
	}
];

// Two sets per card: monochrome (--aum-*) and the colour palette (--auc-*);
// layout.css picks one into --au-* depending on the theme.
const auroraVars = (t: (typeof AURORA_THEMES)[number]) => {
	const c = t.color;
	return `--aum-1:${t.l1};--aum-2:${t.l2};--aum-3:${t.l3};--aum-b1:${t.b1};--aum-b2:${t.b2};--aum-b3:${t.b3};--auc-1:${c.l1};--auc-2:${c.l2};--auc-3:${c.l3};--auc-b1:${c.b1};--auc-b2:${c.b2};--auc-b3:${c.b3};--aa:${t.a}deg;--ax:${t.x}%;--ay:${t.y}%`;
};

/** Inline style for a `.glass-card`, cycling through the aurora themes. */
export const auroraAt = (i: number) =>
	auroraVars(
		AURORA_THEMES[((i % AURORA_THEMES.length) + AURORA_THEMES.length) % AURORA_THEMES.length]
	);
