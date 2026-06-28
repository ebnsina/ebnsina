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
