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

export const catColor = (i: number) =>
	CAT_COLORS[((i % CAT_COLORS.length) + CAT_COLORS.length) % CAT_COLORS.length];

/** Deterministic, well-spread colour from a string key (so colours look varied
 *  and don't repeat in lockstep across lists). */
export function catFor(key: string) {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return CAT_COLORS[(h >>> 0) % CAT_COLORS.length];
}
