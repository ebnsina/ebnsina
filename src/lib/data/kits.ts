/**
 * Kit registry — the same pattern as `series.ts` and `categories.ts`.
 *
 * A kit is one ordered chain of steps over the shared toolkit state. Steps are
 * reused across kits wherever the artifact is shared: the evidence bank and the
 * funnel tracker belong to every kit, while a gig builder belongs to one. That
 * is the point of the section being generic from the start — the freelance kit
 * and the remote-job kit differ only in their middle three steps.
 *
 * Adding a kit is this file plus whatever step components are genuinely new.
 */
import type { Kit } from '$lib/toolkit/types';

/** Steps shared by every kit, so they stay identical rather than drifting. */
const EVIDENCE_STEP = {
	id: 'evidence',
	label: 'প্রমাণের ভাণ্ডার',
	blurb: 'যা তুমি সত্যিই করেছ — সমস্যা, সিদ্ধান্ত, সংখ্যা। একবার লেখো, সব জায়গায় ব্যবহার করো।'
};

const POSITIONING_STEP = {
	id: 'positioning',
	label: 'পজিশনিং',
	blurb: 'দুই লাইনের পরিচয়: ডোমেইন আর সমস্যার ধরন, স্ট্যাক শেষে।'
};

const FUNNEL_STEP = {
	id: 'funnel',
	label: 'ফানেল ট্র্যাকার',
	blurb: 'কতগুলো পাঠালে, কতগুলো রিপ্লাই — কোন ধাপে থামছ সেটা সংখ্যায় দেখা।'
};

export const KITS: Kit[] = [
	{
		slug: 'freelance',
		title: 'ফ্রিল্যান্স কিট',
		tagline: 'Build a profile, a gig and a proposal that survive a marketplace.',
		description:
			'Fiverr আর Upwork-এর জন্য প্রোফাইল, গিগ আর প্রপোজাল — ধাপে ধাপে। টুলটা তোমার হয়ে লিখে দেয় না; এটা তোমার লেখা থেকে ফাঁপা অংশটা ধরে, প্ল্যাটফর্মের সীমা মেপে দেয়, আর জব পোস্ট থেকে ক্লায়েন্ট আসলে কী চেয়েছে সেটা বের করে আনে।',
		series: 'freelance-zero-to-pro',
		status: 'ready',
		steps: [
			{
				...EVIDENCE_STEP,
				reading: {
					series: 'freelance-zero-to-pro',
					part: '03-niche-and-positioning',
					label: 'পর্ব ৩'
				}
			},
			{
				...POSITIONING_STEP,
				reading: {
					series: 'freelance-zero-to-pro',
					part: '03-niche-and-positioning',
					label: 'পর্ব ৩'
				}
			},
			{
				id: 'profile',
				label: 'প্রোফাইল',
				blurb: 'Upwork ও Fiverr প্রোফাইল — টাইটেল, ওভারভিউ, স্কিল, পোর্টফোলিও।',
				reading: {
					series: 'freelance-zero-to-pro',
					part: '04-profile-that-converts',
					label: 'পর্ব ৪'
				}
			},
			{
				id: 'gig',
				label: 'গিগ',
				blurb: 'টাইটেল, ট্যাগ, তিনটা প্যাকেজ, বর্ণনা আর FAQ।',
				reading: { series: 'freelance-zero-to-pro', part: '05-fiverr-gig-anatomy', label: 'পর্ব ৫' }
			},
			{
				id: 'proposal',
				label: 'প্রপোজাল',
				blurb: 'জব পোস্ট পেস্ট করো — টুল বের করে দেবে কী কী চাওয়া হয়েছে, তারপর উত্তর সাজাও।',
				reading: { series: 'freelance-zero-to-pro', part: '07-upwork-proposals', label: 'পর্ব ৭' }
			},
			{
				...FUNNEL_STEP,
				reading: {
					series: 'freelance-zero-to-pro',
					part: '10-reviews-and-metrics',
					label: 'পর্ব ১০'
				}
			}
		]
	},
	{
		slug: 'remote-job',
		title: 'রিমোট জব কিট',
		tagline: 'The same evidence, aimed at a hiring loop instead of a marketplace.',
		description:
			'একই প্রমাণের ভাণ্ডার থেকে রেজিউমে বুলেট, আউটরিচ মেসেজ আর STAR গল্প — রিমোট জব সিরিজের ধাপগুলো ধরে। এখনো তৈরি হচ্ছে।',
		series: 'remote-job-prep',
		status: 'planned',
		steps: [
			EVIDENCE_STEP,
			POSITIONING_STEP,
			{ id: 'resume', label: 'রেজিউমে বুলেট', blurb: 'প্রমাণ থেকে বুলেট — ফল, পদ্ধতি, স্কেল।' },
			{ id: 'outreach', label: 'আউটরিচ', blurb: 'রেফারেল আর হায়ারিং ম্যানেজারকে লেখা মেসেজ।' },
			{ id: 'stories', label: 'স্টোরি ব্যাংক', blurb: 'বিহেভিয়ারাল রাউন্ডের বারোটা গল্প।' },
			FUNNEL_STEP
		]
	}
];

export const kitBySlug = (slug: string): Kit | undefined => KITS.find((k) => k.slug === slug);

export const readyKits = (): Kit[] => KITS.filter((k) => k.status === 'ready');
