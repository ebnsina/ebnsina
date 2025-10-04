import { f as ensure_array_like, l as head, j as escape_html, v as bind_props } from "../../../../../chunks/index3.js";
import { B as BlogPost } from "../../../../../chunks/BlogPost.js";
function _page($$payload, $$props) {
  let data = $$props["data"];
  const { posts, tag } = data;
  const each_array = ensure_array_like(posts);
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>${escape_html(tag)} - Articles &amp; Insights - Ebn Sina</title>`;
  });
  $$payload.out += `<section><div class="py-20 border-b border-slate-200 px-6" style="background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);"><h1 class="text-xl md:text-3xl xl:text-4xl font-bold mb-4">Articles Tagged: <span class="text-primary">${escape_html(tag)}</span></h1> <p class="text-sm md:text-base text-slate-600">Curated posts focused on <strong>${escape_html(tag)}</strong> to deepen your knowledge.</p></div> <div class="pb-10 border-b border-slate-200 divide-y divide-slate-200"><!--[-->`;
  for (let index = 0, $$length = each_array.length; index < $$length; index++) {
    let post = each_array[index];
    $$payload.out += `<div class="pt-12 px-6">`;
    BlogPost($$payload, { post, index });
    $$payload.out += `<!----></div>`;
  }
  $$payload.out += `<!--]--></div></section>`;
  bind_props($$props, { data });
}
export {
  _page as default
};
