import { l as head, h as attr, j as escape_html, v as bind_props, e as pop, p as push } from "../../../../chunks/index3.js";
import { c as cardGradients } from "../../../../chunks/constants.js";
function html(value) {
  var html2 = String(value ?? "");
  var open = "<!---->";
  return open + html2 + "<!---->";
}
function _page($$payload, $$props) {
  push();
  let data = $$props["data"];
  const { post } = data;
  const randomColor = cardGradients[Math.floor(Math.random() * cardGradients.length)];
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>${escape_html(post.title)} - Ebn Sina</title>`;
  });
  $$payload.out += `<section class="px-6 md:px-24 py-6 md:py-10 space-y-4"><div class="max-w-xl mx-auto flex flex-col justify-center items-center space-y-6"><div class="rounded-xl h-56 w-full"${attr("style", `background: conic-gradient(from 180deg at center, ${randomColor});`)}></div> <div class="text-xs text-slate-500"><time${attr("datetime", post.date)}>${escape_html(post.date)}</time> <span>·</span> <span>${escape_html(post.readingTime)} minutes to read</span></div> <h1 class="text-2xl md:text-3xl text-center font-bold">${escape_html(post.title)}</h1> <div class="flex space-x-2 items-center"><div${attr("class", `size-10 rounded-xl -rotate-6`)}${attr("style", `background: conic-gradient(from 180deg at center, ${randomColor});`)}></div> <p>Ebn Sina</p></div></div> <div class="pt-10 prose prose-zinc prose-headings:text-2xl prose-headings:font-medium prose-img:rounded-xl prose-headings:underline prose-a:text-primary mx-auto">${html(post.content)}</div></section>`;
  bind_props($$props, { data });
  pop();
}
export {
  _page as default
};
