import { init } from '../serverless.js';

export const handler = init((() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.png","images/coffee.svg","images/fun-arrow.svg","posts/deploy-nodejs-on-vps.md","posts/diy-auth-tanstack-router.md","posts/how-to-manage-multiple-git-accounts-on-macos.md","posts/organizing-react-nextjs-project.md","posts/react-form-validate-with-hook-form-and-zod.md","posts/setup-tanstack-query-on-tanstack-router.md","posts/tanstack-query-search-filters.md","posts/whats-new-in-react-19.md","posts/why-svelte-and-sveltekit-awesome.md"]),
	mimeTypes: {".png":"image/png",".svg":"image/svg+xml",".md":"text/markdown"},
	_: {
		client: {"start":"_app/immutable/entry/start.CockfRXk.js","app":"_app/immutable/entry/app.CyBV-CPW.js","imports":["_app/immutable/entry/start.CockfRXk.js","_app/immutable/chunks/entry.7LcSSL-U.js","_app/immutable/chunks/index-client.BHQksL_p.js","_app/immutable/chunks/runtime.BJVVMfAd.js","_app/immutable/entry/app.CyBV-CPW.js","_app/immutable/chunks/runtime.BJVVMfAd.js","_app/immutable/chunks/disclose-version.BuVPf9N3.js","_app/immutable/chunks/if.C2OoTVJt.js","_app/immutable/chunks/props.DaD9cqxp.js","_app/immutable/chunks/index-client.BHQksL_p.js"],"stylesheets":[],"fonts":[],"uses_env_dynamic_public":false},
		nodes: [
			__memo(() => import('../server/nodes/0.js')),
			__memo(() => import('../server/nodes/1.js')),
			__memo(() => import('../server/nodes/2.js')),
			__memo(() => import('../server/nodes/3.js')),
			__memo(() => import('../server/nodes/4.js')),
			__memo(() => import('../server/nodes/5.js')),
			__memo(() => import('../server/nodes/6.js'))
		],
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/blog",
				pattern: /^\/blog\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/blog/tag/[tag]",
				pattern: /^\/blog\/tag\/([^/]+?)\/?$/,
				params: [{"name":"tag","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/blog/[slug]",
				pattern: /^\/blog\/([^/]+?)\/?$/,
				params: [{"name":"slug","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/stack",
				pattern: /^\/stack\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			}
		],
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})());
