import { h as attr, j as escape_html, v as bind_props, e as pop, p as push } from "./index3.js";
import { a as cardColors } from "./constants.js";
function BlogPost($$payload, $$props) {
  push();
  let post = $$props["post"];
  let index = $$props["index"];
  const isEven = index % 2 === 1;
  const randomColor = cardColors[index % cardColors.length];
  $$payload.out += `<article class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-12"><div${attr("class", isEven ? "md:order-2" : "")}><time class="text-xs text-slate-600"${attr("datetime", post.date)}>${escape_html(post.date)}</time> <span>·</span> <span class="text-xs text-slate-600">${escape_html(post.readingTime)} minutes to read</span> <a class="hover:underline hover:text-primary"${attr("href", `/blog/${post.slug}`)}><h1 class="text-xl font-semibold mt-2">${escape_html(post.title)}</h1></a> <p class="mt-2 text-slate-700 text-sm">${escape_html(post.excerpt)}</p> <div class="mt-4 flex space-x-2 items-center"><div${attr("class", `rounded-xl size-10 -rotate-6 hover:rotate-0 transition-all transform ${randomColor}`)}></div> <span class="text-sm text-slate-600">Ebn Sina</span></div></div> <div${attr("class", isEven ? "md:order-1" : "")}><div class="relative rounded-xl h-56 w-full flex items-center justify-center text-center p-4" style="background: conic-gradient(from 180deg at center, #000000, #1f2937, #4b5563, #000000);"><h2${attr("class", `text-white text-2xl font-extrabold drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] truncate ${isEven ? "-rotate-3" : "rotate-3"}`)}>${escape_html(post.title)}</h2></div></div></article>`;
  bind_props($$props, { post, index });
  pop();
}
export {
  BlogPost as B
};
