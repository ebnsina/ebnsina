/** Harmonised categorical palette — one coordinated family. Authored as
 *  oklch(0.6 0.11 H) (constant lightness/chroma, hue-only) and stored as the
 *  sRGB-hex equivalents so the same values work in CSS (color-mix/color) AND in
 *  three.js (THREE.Color, which can't parse oklch()). Used everywhere a category
 *  needs a colour — folders, track avatars, badges, level markers, project/blog
 *  cards, the 3D accents. Cherry (--accent) stays the only fully-saturated brand
 *  colour; these read as soft tints over the page background. */
export const CAT_COLORS = [
	'#4984bf', // blue   (oklch 0.6 0.11 250)
	'#8572bb', // violet (oklch 0.6 0.11 295)
	'#ab6595', // plum   (oklch 0.6 0.11 340)
	'#b96558', // clay   (oklch 0.6 0.11 30)
	'#aa732b', // amber  (oklch 0.6 0.11 70)
	'#6a8d43', // green  (oklch 0.6 0.11 130)
	'#2d9570', // teal   (oklch 0.6 0.11 165)
	'#00929f' // cyan   (oklch 0.6 0.11 205)
];

// Vivid variant — same hue family at higher chroma (oklch 0.58 0.17 H). For
// solid colour tiles (e.g. timeline avatars) that should pop with white text,
// while soft-tint usage stays on CAT_COLORS.
export const CAT_VIVID = [
	'#007cd9', // blue
	'#8460d2', // violet
	'#b84999', // plum
	'#cb4838', // clay
	'#b76200', // amber
	'#578c00', // green
	'#009860', // teal
	'#0093aa' // cyan
];

export const catColor = (i: number) =>
	CAT_COLORS[((i % CAT_COLORS.length) + CAT_COLORS.length) % CAT_COLORS.length];

export const catVivid = (i: number) =>
	CAT_VIVID[((i % CAT_VIVID.length) + CAT_VIVID.length) % CAT_VIVID.length];

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

/** Same stable hash as {@link catFor}, but the vivid variant. */
export const catVividFor = (key: string) => CAT_VIVID[hashIndex(key, CAT_VIVID.length)];

/* ============================================================
   Aurora card gradients
   ============================================================
   Cards no longer take a flat hue from the categorical palette — each one gets
   its own aurora (auroragradient.com style): two or three soft lights blooming
   over a deep base sweep. Every theme keeps a dark base so white text stays
   legible, and varies the sweep angle + light origin so no two cards read the
   same. Each entry feeds only CSS custom properties consumed by `.glass-card`:
     l1/l2/l3 — the light bloom colours (bright → warm → deep)
     b1/b2/b3 — the base sweep, dark to darkest
     a        — sweep angle;  x/y — origin of the primary light */
const AURORA_THEMES = [
	// northern indigo
	{ l1: '#8799ff', l2: '#f3d3cd', l3: '#58006b', b1: '#0c27bf', b2: '#081b86', b3: '#14105e', a: 152, x: 14, y: 8 },
	// deep ocean
	{ l1: '#7fe3ff', l2: '#cfe4ff', l3: '#00527f', b1: '#0a5ea8', b2: '#063a6b', b3: '#04203f', a: 118, x: 78, y: 14 },
	// berry
	{ l1: '#ffb3d1', l2: '#ffd6c2', l3: '#6b0033', b1: '#b3155e', b2: '#7a0f45', b3: '#430627', a: 168, x: 26, y: 86 },
	// pine
	{ l1: '#9ff0c9', l2: '#e4f2c4', l3: '#04513a', b1: '#0f7a52', b2: '#0a4d38', b3: '#062b22', a: 134, x: 88, y: 72 },
	// ember
	{ l1: '#ffd08a', l2: '#ff9f86', l3: '#7a2200', b1: '#c2410c', b2: '#8a2b0a', b3: '#4a1605', a: 196, x: 50, y: 6 },
	// orchid
	{ l1: '#f0a8ff', l2: '#ffd6f5', l3: '#3d0073', b1: '#8b0fbf', b2: '#5a0b86', b3: '#2e0850', a: 108, x: 8, y: 60 },
	// brass
	{ l1: '#ffe08a', l2: '#ffc59e', l3: '#5c3d00', b1: '#9a6500', b2: '#6b4400', b3: '#392400', a: 142, x: 70, y: 88 },
	// lagoon
	{ l1: '#a8f0ff', l2: '#d4e2ff', l3: '#06405c', b1: '#0f6f8a', b2: '#0a4a63', b3: '#05293b', a: 176, x: 34, y: 20 }
];

const auroraVars = (t: (typeof AURORA_THEMES)[number]) =>
	`--au-1:${t.l1};--au-2:${t.l2};--au-3:${t.l3};--au-b1:${t.b1};--au-b2:${t.b2};--au-b3:${t.b3};--aa:${t.a}deg;--ax:${t.x}%;--ay:${t.y}%`;

/** Inline style for a `.glass-card`, cycling through the aurora themes. */
export const auroraAt = (i: number) =>
	auroraVars(AURORA_THEMES[((i % AURORA_THEMES.length) + AURORA_THEMES.length) % AURORA_THEMES.length]);

/** Same, but stable for a given string key (title, slug, …). */
export const auroraFor = (key: string) => auroraVars(AURORA_THEMES[hashIndex(key, AURORA_THEMES.length)]);
