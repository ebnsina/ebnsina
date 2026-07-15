import { next } from '@vercel/edge';

// Vercel Edge Middleware — runs at the edge on every matched request, INCLUDING
// prerendered/static pages served from the CDN (where SvelteKit's hooks.server
// never runs). Its only job is observability: log when a known AI crawler fetches
// the site so we can confirm GEO/LLM discoverability is actually being picked up.
// It never blocks or rewrites — every request passes straight through via next().

export const config = {
	// Skip hashed immutable assets and the favicon to keep invocations (and noise)
	// down; still runs for HTML pages, sitemap.xml, robots.txt, llms.txt, rss.xml.
	matcher: ['/((?!_app/immutable|favicon\\.ico).*)']
};

// Substring-matched against the User-Agent (case-insensitive). Covers training
// crawlers, live-retrieval indexers, and on-demand "user fetched this" agents.
const AI_BOTS = [
	'GPTBot', // OpenAI — training
	'OAI-SearchBot', // OpenAI — ChatGPT search index
	'ChatGPT-User', // OpenAI — on-demand fetch from a ChatGPT answer
	'ClaudeBot', // Anthropic — crawler
	'Claude-Web', // Anthropic — on-demand fetch
	'anthropic-ai', // Anthropic — legacy UA
	'PerplexityBot', // Perplexity — index
	'Perplexity-User', // Perplexity — on-demand fetch
	'Google-Extended', // Google — Gemini/Vertex opt-in token
	'Applebot-Extended', // Apple Intelligence
	'Bingbot', // Microsoft — powers Copilot
	'CCBot', // Common Crawl — feeds many LLMs
	'Bytespider', // ByteDance/TikTok
	'Amazonbot', // Amazon
	'Meta-ExternalAgent', // Meta AI
	'cohere-ai', // Cohere
	'YouBot', // You.com
	'Diffbot' // Diffbot
];

export default function middleware(request: Request) {
	const ua = request.headers.get('user-agent') ?? '';
	const uaLower = ua.toLowerCase();
	const bot = AI_BOTS.find((name) => uaLower.includes(name.toLowerCase()));

	if (bot) {
		const { pathname } = new URL(request.url);
		const ip = request.headers.get('x-forwarded-for') ?? '';
		// Prefixed so it's trivially filterable in Vercel's log/observability UI.
		console.log(`[AI-CRAWLER] bot=${bot} path=${pathname} ip=${ip} ua="${ua}"`);
	}

	return next();
}
