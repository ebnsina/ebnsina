import { t as fallback, h as attr, j as escape_html, v as bind_props, w as stringify, f as ensure_array_like, l as head, e as pop, p as push } from "../../../chunks/index3.js";
import { B as BlogPost } from "../../../chunks/BlogPost.js";
import { P as PatternedSection } from "../../../chunks/PatternedSection.js";
import { t as tagsColors } from "../../../chunks/constants.js";
function BlogTag($$payload, $$props) {
  let label = fallback($$props["label"], "interface");
  let color = fallback($$props["color"], "bg-green-50 text-green-700");
  const rotation = -4 + Math.random() * 8;
  $$payload.out += `<a class="block hover:underline underline-offset-2"${attr("href", `/blog/tag/${encodeURIComponent(label)}`)}><span${attr("class", `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs ${color} transition-all transform`)}${attr("style", ` transform: rotate(${stringify(rotation)}deg); box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.08); `)}>${escape_html(label)}</span></a>`;
  bind_props($$props, { label, color });
}
function _page($$payload, $$props) {
  push();
  let data = $$props["data"];
  const { posts, allTags } = data;
  const each_array = ensure_array_like(allTags);
  const each_array_1 = ensure_array_like(posts);
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>Blogs - Ebn Sina</title>`;
  });
  $$payload.out += `<section class="min-h-screen flex justify-center flex-col">`;
  PatternedSection($$payload, {
    title: "Blogs",
    description: "Deep dives and practical tips on development and technology."
  });
  $$payload.out += `<!----> <div class="px-6 py-10 border-b border-slate-200"><div class="flex gap-2.5 items-center flex-wrap"><!--[-->`;
  for (let index = 0, $$length = each_array.length; index < $$length; index++) {
    let tag = each_array[index];
    $$payload.out += `<div>`;
    BlogTag($$payload, {
      label: tag,
      color: tagsColors[index % tagsColors.length]
    });
    $$payload.out += `<!----></div>`;
  }
  $$payload.out += `<!--]--></div></div> <div class="pb-10 border-b border-slate-200 divide-y divide-slate-200"><!--[-->`;
  for (let index = 0, $$length = each_array_1.length; index < $$length; index++) {
    let post = each_array_1[index];
    $$payload.out += `<div class="pt-12 px-6">`;
    BlogPost($$payload, { post, index });
    $$payload.out += `<!----></div>`;
  }
  $$payload.out += `<!--]--></div></section>`;
  bind_props($$props, { data });
  pop();
}
export {
  _page as default
};
