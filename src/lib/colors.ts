/** Shared vivid palette. Folders use these at full strength; cards apply them
 *  as a soft tint over the page background (so cards stay light/eye-friendly). */
export const CARD_COLORS = [
	'#3b6fe0', // blue
	'#d97c1a', // amber
	'#7c3aed', // violet
	'#0d9488', // teal
	'#16a34a', // green
	'#e11d48', // rose
	'#4f46e5', // indigo
	'#db2777', // pink
	'#0891b2', // cyan
	'#ca8a04', // gold
	'#9333ea', // purple
	'#059669', // emerald
	'#2563eb', // royal blue
	'#c026d3', // fuchsia
	'#65a30d', // lime
	'#dc2626' // red
];

export const cardColor = (i: number) =>
	CARD_COLORS[((i % CARD_COLORS.length) + CARD_COLORS.length) % CARD_COLORS.length];

/** Deterministic, well-spread colour from a string key (so colours look random
 *  and don't repeat in lockstep across lists). */
export function colorFor(key: string) {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return CARD_COLORS[(h >>> 0) % CARD_COLORS.length];
}
