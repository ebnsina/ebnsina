import { q as current_component, t as fallback, j as escape_html, v as bind_props, h as attr, e as pop, w as stringify, p as push, l as head } from "../../chunks/index3.js";
function onDestroy(fn) {
  var context = (
    /** @type {Component} */
    current_component
  );
  (context.d ??= []).push(fn);
}
async function tick() {
}
function CTA($$payload, $$props) {
  let title = fallback($$props["title"], "Interested in Future Collaboration?");
  let subtitle = fallback($$props["subtitle"], "Feel free to reach out—I’m always open to new ideas and projects.");
  let buttonText = fallback($$props["buttonText"], "Contact Me");
  $$payload.out += `<div class="relative rounded-2xl p-10 text-center text-white mt-6 md:mt-16 mx-5 md:mx-10" style="background: conic-gradient(from 180deg at center, #000000, #1f2937, #4b5563, #000000);"><h2 class="text-2xl md:text-3xl font-bold mb-4">${escape_html(title)}</h2> <p class="mb-6 text-base md:text-lg text-slate-300">${escape_html(subtitle)}</p> <a href="mailto:ebnsina.dev@gmail.com" class="bg-white text-black px-10 py-3 text-sm rounded-2xl hover:bg-slate-100 transition">${escape_html(buttonText)}</a> <img class="absolute -left-12 md:-left-20 rotate-6 bottom-28 size-16" src="/images/coffee.svg" alt="fun arrow"></div>`;
  bind_props($$props, { title, subtitle, buttonText });
}
function Typewriter($$payload, $$props) {
  push();
  let sentences = fallback($$props["sentences"], () => [], true);
  let displayedText = "";
  let index = 0;
  let isTyping = true;
  let isVisible = true;
  let animationRunning = false;
  let timeoutIds = [];
  const typingSpeed = 100;
  const sentenceDelay = 1500;
  const fadeDelay = 500;
  const delay = (ms) => {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, ms);
      timeoutIds.push(timeoutId);
    });
  };
  const clearAllTimeouts = () => {
    timeoutIds.forEach((id) => clearTimeout(id));
    timeoutIds = [];
  };
  const typeSentence = async () => {
    if (!sentences.length || animationRunning) return;
    animationRunning = true;
    try {
      const words = sentences[index].split(" ");
      displayedText = "";
      isVisible = true;
      isTyping = true;
      for (let i = 0; i < words.length; i++) {
        if (!animationRunning) return;
        displayedText += (i === 0 ? "" : " ") + words[i];
        await delay(typingSpeed);
      }
      isTyping = false;
      await delay(sentenceDelay);
      if (!animationRunning) return;
      isVisible = false;
      await delay(fadeDelay);
      if (!animationRunning) return;
      index = (index + 1) % sentences.length;
      await tick();
      animationRunning = false;
      typeSentence();
    } catch (error) {
      console.error("Error in typeSentence:", error);
      animationRunning = false;
    }
  };
  onDestroy(() => {
    animationRunning = false;
    clearAllTimeouts();
  });
  if (sentences.length > 0 && !animationRunning) {
    index = 0;
    typeSentence();
  }
  $$payload.out += `<div class="relative inline-block whitespace-pre-wrap break-words max-w-full svelte-zul67j">`;
  if (isVisible) {
    $$payload.out += "<!--[-->";
    $$payload.out += `<h1 class="text-xl md:text-3xl xl:text-4xl font-bold svelte-zul67j">${escape_html(displayedText)}<span${attr("class", `caret bg-primary svelte-zul67j ${stringify([isTyping ? "isTyping" : ""].filter(Boolean).join(" "))}`)}>|</span></h1>`;
  } else {
    $$payload.out += "<!--[!-->";
  }
  $$payload.out += `<!--]--></div>`;
  bind_props($$props, { sentences });
  pop();
}
function _page($$payload) {
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>Marhaba - Ebn Sina</title>`;
  });
  $$payload.out += `<section class="relative py-10 border-b border-slate-200 px-6" style="background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);">`;
  Typewriter($$payload, {
    sentences: [
      "Merhaba, ben Ebn Sina, bir full stack geliştiricisiyim.",
      "Hello, I am Ebn Sina, a full stack developer.",
      "I am passionate about creating user-centric applications.",
      "Let's transform ideas into robust, scalable solutions."
    ]
  });
  $$payload.out += `<!----> <div class="relative text-sm md:text-base text-slate-600 leading-loose md:leading-10 mt-4 space-y-4"><ul><li>Meet a dedicated and versatile Full Stack Developer who seamlessly blends front-end
				creativity with back-end logic. With expertise in modern web technologies such as SvelteKit,
				TypeScript, and Tailwind CSS, I specialize in crafting dynamic, user-centric applications
				that are both robust and scalable. Whether designing intuitive interfaces or optimizing
				server-side performance, I thrive on turning complex challenges into elegant, functional
				solutions that deliver exceptional user experiences. Committed to continuous learning and
				innovation, I am always exploring new frameworks and tools to enhance my skills. When not
				coding, I enjoy sharing insights through blog posts and engaging with the developer
				community.</li> <li>I mostly <a class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2" href="/stack">work</a> with Svelte/SvelteKit, React/Nextjs to build awesome product that also has top level developer
				experiences.</li> <li>Sometimes i <a class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2" href="/blog">write</a> things about web development &amp; native apps development and all other bleeding edge technologies.</li></ul> <img class="absolute -right-16 bottom-28 -rotate-[140deg] size-20" src="/images/fun-arrow.svg" alt="fun arrow"></div></section> `;
  CTA($$payload, {});
  $$payload.out += `<!---->`;
}
export {
  _page as default
};
