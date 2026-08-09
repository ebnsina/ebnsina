// Bangla labels + descriptions for the notes tracks. Keyed by the same
// category slug as CATEGORIES (categories.ts). Track *identity* (slug, group)
// stays English-defined; only the display strings are localized here.
import { CATEGORIES, type CategoryMeta } from './categories';
import type { Locale } from '$lib/i18n/notes';

type LocalizedCategory = { label: string; description: string };

export const CATEGORIES_BN: Record<string, LocalizedCategory> = {
	chapters: { label: 'সিস্টেম ডিজাইন', description: 'সিস্টেম ডিজাইনের কোর কনসেপ্ট ও কেস স্টাডি' },
	'system-design': {
		label: 'সিস্টেম ডিজাইন: জিরো টু মাস্টারি',
		description:
			'যিনি কখনো সিস্টেম ডিজাইন করেননি তার জন্য সম্পূর্ণ কারিকুলাম — এস্টিমেশন, স্টোরেজ, স্কেলিং, ফেইলিওর এবং ছয়টি পূর্ণাঙ্গ প্রজেক্ট ডিজাইন'
	},
	video: {
		label: 'ভিডিও',
		description: 'কোডেক, কন্টেইনার, ট্রান্সকোডিং, প্যাকেজিং, ABR স্ট্রিমিং ও ডেলিভারি'
	},
	dsa: { label: 'ডেটা স্ট্রাকচার ও অ্যালগরিদম', description: 'ডেটা স্ট্রাকচার ও অ্যালগরিদম' },
	networking: { label: 'নেটওয়ার্কিং', description: 'ইন্টারনেট কীভাবে কাজ করে, TCP/IP, DNS, HTTP' },
	'db-internals': { label: 'ডেটাবেস ইন্টার্নাল', description: 'স্টোরেজ ইঞ্জিন, B-tree, WAL, MVCC' },
	sql: {
		label: 'SQL',
		description: 'কুয়েরি, জয়েন, ইনডেক্স, ট্রানজ্যাকশন ও কুয়েরি অপ্টিমাইজেশন'
	},
	'operating-systems': {
		label: 'অপারেটিং সিস্টেম',
		description: 'প্রসেস, থ্রেড, মেমরি, শিডিউলিং ও সিস্টেম কল'
	},
	golang: { label: 'Go', description: 'বেসিক থেকে প্রোডাকশন পর্যন্ত Go' },
	frontend: {
		label: 'ফ্রন্টএন্ড',
		description: 'রেন্ডারিং প্যাটার্ন, স্টেট ম্যানেজমেন্ট, পারফরম্যান্স'
	},
	'api-design': { label: 'API ডিজাইন', description: 'REST, পেজিনেশন, ভার্সনিং, রেট লিমিটিং' },
	graphql: { label: 'GraphQL', description: 'স্কিমা ডিজাইন, রিজলভার, সাবস্ক্রিপশন' },
	grpc: { label: 'gRPC', description: 'Protobuf, স্ট্রিমিং, ইন্টারসেপ্টর, TLS' },
	websockets: { label: 'WebSockets', description: 'রিয়েল-টাইম, pub/sub, প্রেজেন্স, ব্যাকপ্রেশার' },
	webhooks: { label: 'Webhooks', description: 'পাঠানো, সাইনিং, রিট্রাই, আইডেম্পোটেন্সি' },
	'linux-vps': { label: 'Linux / VPS', description: 'SSH, systemd, ফায়ারওয়াল, প্রসেস' },
	'web-server': { label: 'ওয়েব সার্ভার', description: 'Nginx, রিভার্স প্রক্সি, এজ ক্যাশিং' },
	'tls-certs': {
		label: 'TLS ও সার্টিফিকেট',
		description: "Let's Encrypt, ACME, সার্টিফিকেট ম্যানেজমেন্ট"
	},
	devops: { label: 'DevOps', description: 'কন্টেইনার, Kubernetes, CI/CD, IaC' },
	containers: { label: 'কন্টেইনার', description: 'Docker ফান্ডামেন্টালস ও প্যাটার্ন' },
	orchestration: { label: 'অর্কেস্ট্রেশন', description: 'Kubernetes ও কন্টেইনার অর্কেস্ট্রেশন' },
	iac: { label: 'IaC', description: 'ইনফ্রাস্ট্রাকচার অ্যাজ কোড, Terraform' },
	'data-modeling': { label: 'ডেটা মডেলিং', description: 'এনটিটি, নরমালাইজেশন, স্কিমা ইভোলিউশন' },
	nosql: { label: 'NoSQL', description: 'কী-ভ্যালু, ডকুমেন্ট, ওয়াইড-কলাম ও গ্রাফ ডেটা মডেল' },
	'auth-security': {
		label: 'অথ ও সিকিউরিটি',
		description: 'অথেন্টিকেশন, অথরাইজেশন, সিকিউরিটি প্যাটার্ন'
	},
	'api-gateway': { label: 'API গেটওয়ে', description: 'গেটওয়ে প্যাটার্ন, রাউটিং, অ্যাগ্রিগেশন' },
	caching: { label: 'ক্যাশিং', description: 'ক্যাশ স্ট্র্যাটেজি, Redis, CDN' },
	redis: {
		label: 'Redis',
		description: 'ডেটা স্ট্রাকচার, পার্সিস্টেন্স, pub/sub, স্ট্রিম ও ক্লাস্টারিং'
	},
	'background-jobs': { label: 'ব্যাকগ্রাউন্ড জব', description: 'জব কিউ, ওয়ার্কার, শিডিউলিং' },
	messaging: { label: 'মেসেজিং', description: 'মেসেজ কিউ, Kafka, RabbitMQ' },
	'event-driven': { label: 'ইভেন্ট-ড্রিভেন', description: 'ইভেন্ট সোর্সিং, CQRS, Saga প্যাটার্ন' },
	storage: { label: 'স্টোরেজ', description: 'অবজেক্ট স্টোরেজ, ব্লক স্টোরেজ, ফাইল সিস্টেম' },
	search: { label: 'সার্চ', description: 'ফুল-টেক্সট সার্চ, Elasticsearch, ইনডেক্সিং' },
	'load-balancing': {
		label: 'লোড ব্যালান্সিং',
		description: 'অ্যালগরিদম, হেলথ চেক, সেশন অ্যাফিনিটি'
	},
	'horizontal-scaling': {
		label: 'হরাইজন্টাল স্কেলিং',
		description: 'স্টেটলেস সার্ভিস, অটো-স্কেলিং'
	},
	'replication-sharding': {
		label: 'রেপ্লিকেশন ও শার্ডিং',
		description: 'ডেটাবেস স্কেলিং স্ট্র্যাটেজি'
	},
	'distributed-systems': {
		label: 'ডিস্ট্রিবিউটেড সিস্টেম',
		description: 'CAP, কনসিস্টেন্সি, কনসেনসাস, অর্ডারিং ও ডিস্ট্রিবিউটেড ট্রানজ্যাকশন'
	},
	observability: { label: 'অবজারভেবিলিটি', description: 'মেট্রিক, লগিং, ট্রেসিং, অ্যালার্টিং' },
	sre: { label: 'SRE', description: 'SLI, SLO, ইনসিডেন্ট রেসপন্স, chaos engineering' },
	testing: { label: 'টেস্টিং', description: 'ইউনিট, ইন্টিগ্রেশন, E2E, কন্ট্রাক্ট টেস্টিং' },
	performance: { label: 'পারফরম্যান্স', description: 'প্রোফাইলিং, অপ্টিমাইজেশন, বেঞ্চমার্কিং' },
	'disaster-recovery': {
		label: 'ডিজাস্টার রিকভারি',
		description: 'RTO, RPO, ব্যাকআপ স্ট্র্যাটেজি'
	},
	'capacity-cost': {
		label: 'ক্যাপাসিটি ও কস্ট',
		description: 'FinOps, ক্যাপাসিটি প্ল্যানিং, কস্ট অপ্টিমাইজেশন'
	},
	microservices: {
		label: 'মাইক্রোসার্ভিস',
		description: 'সার্ভিস বাউন্ডারি, কমিউনিকেশন, প্যাটার্ন'
	},
	'chaos-resilience': {
		label: 'Chaos ও রেজিলিয়েন্স',
		description: 'ফল্ট ইনজেকশন, সার্কিট ব্রেকার, বাল্কহেড'
	},
	'ethical-hacking': {
		label: 'এথিক্যাল হ্যাকিং',
		description: 'পেনিট্রেশন টেস্টিং, OSINT, এক্সপ্লয়টেশন, CTF — জিরো থেকে প্রফেশনাল'
	}
};

/** Category metadata with label/description localized for the given locale. */
export function categoryMeta(key: string, locale: Locale): CategoryMeta | undefined {
	const base = CATEGORIES[key];
	if (!base) return undefined;
	if (locale !== 'bn') return base;
	const bn = CATEGORIES_BN[key];
	return bn ? { ...base, label: bn.label, description: bn.description } : base;
}

/** Just the display label for a category in the given locale (falls back to slug). */
export function categoryLabel(key: string, locale: Locale): string {
	return categoryMeta(key, locale)?.label ?? key;
}
