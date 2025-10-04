import * as server from '../entries/pages/blog/_slug_/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/blog/_slug_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/blog/[slug]/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.BLmSvvGO.js","_app/immutable/chunks/disclose-version.BuVPf9N3.js","_app/immutable/chunks/runtime.BJVVMfAd.js","_app/immutable/chunks/attributes.B9OdHb92.js","_app/immutable/chunks/class.BCV2RDZ7.js","_app/immutable/chunks/lifecycle.D5STnbjP.js","_app/immutable/chunks/props.DaD9cqxp.js","_app/immutable/chunks/constants.CgaeA7Ce.js"];
export const stylesheets = [];
export const fonts = [];
