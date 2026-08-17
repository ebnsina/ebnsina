/**
 * Platform field limits.
 *
 * These are the numbers the builders count against, and they are the most
 * perishable thing in the toolkit — platforms change them without notice. They
 * live in one table so a correction is a one-line edit, and each carries the
 * date it was last checked so the UI can tell the reader how old it is rather
 * than presenting a stale number as fact.
 *
 * Checked against Fiverr's and Upwork's own help pages, mid-2026. The series
 * parts that describe these fields (freelance kit, parts 4–7) carry the same
 * caveat: confirm in the editor, because the field itself is the source of
 * truth.
 */

export const LIMITS_CHECKED = '2026-08';

export type Limit = {
	/** Hard maximum the platform enforces. */
	max: number;
	/** Where the useful ceiling actually sits, when it is lower than `max`
	 *  (a title that fits the field but truncates on the card is still wrong). */
	practical?: number;
	/** Bangla note explaining the practical limit. */
	note?: string;
};

type FieldMap = Record<string, Limit>;

export const UPWORK: FieldMap = {
	title: {
		max: 70,
		note: 'প্রোফাইল টাইটেল — সার্চ ফলাফলে পুরোটা দেখা যায় না, তাই শুরুতেই মূল কথা।'
	},
	overview: {
		max: 5000,
		practical: 250,
		note: 'ক্লায়েন্ট সার্চে প্রথম ~২৫০ অক্ষরের পরে কেটে যায় — সবচেয়ে শক্ত প্রমাণটা ওই সীমার ভেতরে রাখো।'
	},
	skills: { max: 20, note: 'প্রোফাইলে সর্বোচ্চ ২০টি স্কিল।' },
	portfolioTitle: { max: 70 },
	portfolioRole: { max: 100 },
	portfolioDescription: { max: 600 },
	portfolioSkills: { max: 5 }
};

export const FIVERR: FieldMap = {
	gigTitle: {
		max: 80,
		practical: 50,
		note: 'গিগ কার্ডে লম্বা টাইটেল কেটে যায়, তাই ৫০ অক্ষরের নিচে রাখাই নিরাপদ।'
	},
	gigDescription: { max: 1200, note: 'বর্ণনা ইংরেজিতে, আর কোনো যোগাযোগের তথ্য নয়।' },
	tags: { max: 5, note: 'পাঁচটি সার্চ ট্যাগ — কম কিন্তু নির্দিষ্ট ট্যাগ বেশি কাজ করে।' },
	packages: { max: 3 },
	faqs: { max: 10 },
	galleryImages: { max: 3 },
	galleryVideos: { max: 1 },
	galleryPdfs: { max: 2, note: 'PDF-এর প্রথম ৩ পাতা দেখা যায়, ডাউনলোড করা যায় না।' }
};

const TABLES: Record<string, FieldMap> = { upwork: UPWORK, fiverr: FIVERR };

export function limitFor(platform: string, field: string): Limit | undefined {
	return TABLES[platform]?.[field];
}

export type LengthState = 'empty' | 'ok' | 'over-practical' | 'over-max';

/** How a field's current length sits against its limit.
 *  `count` counts characters for text limits and items for list limits — the
 *  caller decides which by what it passes in. */
export function lengthState(count: number, limit?: Limit): LengthState {
	if (count === 0) return 'empty';
	if (!limit) return 'ok';
	if (count > limit.max) return 'over-max';
	if (limit.practical && count > limit.practical) return 'over-practical';
	return 'ok';
}
