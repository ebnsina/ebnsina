import { j as escape_html, v as bind_props } from "./index3.js";
function PatternedSection($$payload, $$props) {
  let title = $$props["title"];
  let description = $$props["description"];
  $$payload.out += `<div class="py-20 border-b border-slate-200 px-6" style="background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);"><h1 class="text-xl md:text-3xl xl:text-4xl font-bold mb-4">${escape_html(title)}</h1> <p class="text-sm md:text-base text-slate-600">${escape_html(description)}</p></div>`;
  bind_props($$props, { title, description });
}
export {
  PatternedSection as P
};
