import { n as noop, f as ensure_array_like, h as attr, j as escape_html, k as store_get, u as unsubscribe_stores, e as pop, p as push, l as head, m as slot } from "../../chunks/index3.js";
import "../../chunks/client.js";
import { w as writable } from "../../chunks/index2.js";
function default_slot($$props) {
  var children = $$props.$$slots?.default;
  if (children === true) {
    return $$props.children;
  } else {
    return children;
  }
}
const request_animation_frame = noop;
const now = () => Date.now();
const raf = {
  tick: (
    /** @param {any} _ */
    (_) => request_animation_frame()
  ),
  now: () => now(),
  tasks: /* @__PURE__ */ new Set()
};
function loop(callback) {
  let task;
  if (raf.tasks.size === 0) ;
  return {
    promise: new Promise((fulfill) => {
      raf.tasks.add(task = { c: callback, f: fulfill });
    }),
    abort() {
      raf.tasks.delete(task);
    }
  };
}
function is_date(obj) {
  return Object.prototype.toString.call(obj) === "[object Date]";
}
function tick_spring(ctx, last_value, current_value, target_value) {
  if (typeof current_value === "number" || is_date(current_value)) {
    const delta = target_value - current_value;
    const velocity = (current_value - last_value) / (ctx.dt || 1 / 60);
    const spring2 = ctx.opts.stiffness * delta;
    const damper = ctx.opts.damping * velocity;
    const acceleration = (spring2 - damper) * ctx.inv_mass;
    const d = (velocity + acceleration) * ctx.dt;
    if (Math.abs(d) < ctx.opts.precision && Math.abs(delta) < ctx.opts.precision) {
      return target_value;
    } else {
      ctx.settled = false;
      return is_date(current_value) ? new Date(current_value.getTime() + d) : current_value + d;
    }
  } else if (Array.isArray(current_value)) {
    return current_value.map(
      (_, i) => (
        // @ts-ignore
        tick_spring(ctx, last_value[i], current_value[i], target_value[i])
      )
    );
  } else if (typeof current_value === "object") {
    const next_value = {};
    for (const k in current_value) {
      next_value[k] = tick_spring(ctx, last_value[k], current_value[k], target_value[k]);
    }
    return next_value;
  } else {
    throw new Error(`Cannot spring ${typeof current_value} values`);
  }
}
function spring(value, opts = {}) {
  const store = writable(value);
  const { stiffness = 0.15, damping = 0.8, precision = 0.01 } = opts;
  let last_time;
  let task;
  let current_token;
  let last_value = (
    /** @type {T} */
    value
  );
  let target_value = (
    /** @type {T | undefined} */
    value
  );
  let inv_mass = 1;
  let inv_mass_recovery_rate = 0;
  let cancel_task = false;
  function set(new_value, opts2 = {}) {
    target_value = new_value;
    const token = current_token = {};
    if (value == null || opts2.hard || spring2.stiffness >= 1 && spring2.damping >= 1) {
      cancel_task = true;
      last_time = raf.now();
      last_value = new_value;
      store.set(value = target_value);
      return Promise.resolve();
    } else if (opts2.soft) {
      const rate = opts2.soft === true ? 0.5 : +opts2.soft;
      inv_mass_recovery_rate = 1 / (rate * 60);
      inv_mass = 0;
    }
    if (!task) {
      last_time = raf.now();
      cancel_task = false;
      task = loop((now2) => {
        if (cancel_task) {
          cancel_task = false;
          task = null;
          return false;
        }
        inv_mass = Math.min(inv_mass + inv_mass_recovery_rate, 1);
        const ctx = {
          inv_mass,
          opts: spring2,
          settled: true,
          dt: (now2 - last_time) * 60 / 1e3
        };
        const next_value = tick_spring(ctx, last_value, value, target_value);
        last_time = now2;
        last_value = /** @type {T} */
        value;
        store.set(value = /** @type {T} */
        next_value);
        if (ctx.settled) {
          task = null;
        }
        return !ctx.settled;
      });
    }
    return new Promise((fulfil) => {
      task.promise.then(() => {
        if (token === current_token) fulfil();
      });
    });
  }
  const spring2 = {
    set,
    update: (fn, opts2) => set(fn(
      /** @type {T} */
      target_value,
      /** @type {T} */
      value
    ), opts2),
    subscribe: store.subscribe,
    stiffness,
    damping,
    precision
  };
  return spring2;
}
function Footer($$payload, $$props) {
  push();
  var $$store_subs;
  const socials = [
    {
      label: "twitter",
      handler: "ebns1na",
      href: "https://x.com/ebns1na"
    },
    {
      label: "github",
      handler: "ebnsina",
      href: "https://github.com/ebnsina"
    },
    {
      label: "linkedin",
      handler: "ebn-sina",
      href: "https://www.linkedin.com/in/ebn-sina"
    },
    {
      label: "facebook",
      handler: "ebnsina.dev",
      href: "https://m.me/ebnsina.dev"
    },
    {
      label: "gmail",
      handler: "ebnsina.dev",
      href: "mailto:ebnsina.dev@gmail.com"
    }
  ];
  let hoveredIndex = -1;
  const animationProgress = spring(0, { stiffness: 0.1, damping: 0.4 });
  function getAnimatedText(text, progress) {
    const chars = text.split("");
    return chars.map((char, i) => {
      const charProgress = Math.max(0, Math.min(1, progress * chars.length - i));
      const randomChar = String.fromCharCode(33 + Math.floor(Math.random() * 94));
      return charProgress === 1 ? char : randomChar;
    }).join("");
  }
  const each_array = ensure_array_like(socials);
  $$payload.out += `<footer class="border-t border-slate-200"><div class="max-w-5xl mx-auto px-4 py-4 border-x"><ul class="flex space-x-4 items-center justify-center text-slate-600 text-sm"><!--[-->`;
  for (let index = 0, $$length = each_array.length; index < $$length; index++) {
    let social = each_array[index];
    $$payload.out += `<li><a class="hover:underline relative" target="_blank" rel="noopener noreferrer"${attr("href", social.href)}><span class="block w-[10s0px] bg-">`;
    if (hoveredIndex === index) {
      $$payload.out += "<!--[-->";
      $$payload.out += `<span>${escape_html(getAnimatedText(social.handler, store_get($$store_subs ??= {}, "$animationProgress", animationProgress)))}</span>`;
    } else {
      $$payload.out += "<!--[!-->";
      $$payload.out += `${escape_html(social.label)}`;
    }
    $$payload.out += `<!--]--></span></a></li>`;
  }
  $$payload.out += `<!--]--></ul></div></footer>`;
  if ($$store_subs) unsubscribe_stores($$store_subs);
  pop();
}
function Header($$payload) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/blog", label: "Blog" },
    { href: "/stack", label: "Stack" }
  ];
  const each_array = ensure_array_like(links);
  $$payload.out += `<header class="border-b"><div class="max-w-5xl mx-auto px-4 flex justify-between items-center border-x py-4 border-slate-300"><a class="text-2xl md:text-3xl font-extrabold text-black" href="/"><h1>ebn sina.</h1></a> <nav><ul class="flex space-x-6 items-center text-sm"><!--[-->`;
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let { href, label } = each_array[$$index];
    $$payload.out += `<li><a class="text-slate-600 hover:text-slate-800 transition-all"${attr("href", href)}>${escape_html(label)}</a></li>`;
  }
  $$payload.out += `<!--]--></ul></nav></div></header>`;
}
function _layout($$payload, $$props) {
  push();
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>Ebn Sina - Svelte Expert &amp; Full Stack Developer | JavaScript Instructor</title>`;
    $$payload2.out += `<meta name="description" content="Ebn Sina is a Full Stack Developer specializing in Svelte, JavaScript, Node.js, and modern frontend frameworks. Instructor, mentor, and open-source contributor."> <meta name="keywords" content="Ebn Sina, Svelte developer, Svelte expert, SvelteKit, JavaScript developer, Full Stack Developer, Node.js, React, Web Developer, Instructor, Frontend Mentor, Open Source, TypeScript, Software Engineer"> <meta name="author" content="Ebn Sina"> <meta property="og:title" content="Ebn Sina - Svelte Expert &amp; Full Stack Developer"> <meta property="og:description" content="Follow Ebn Sina, a Svelte and Full Stack JavaScript Developer creating high-performance web apps with SvelteKit, Node.js, and modern tech."> <meta property="og:type" content="website"> <meta property="og:url" content="https://ebnsina.vercel.app"> <meta property="og:image" content="https://ebnsina.vercel.app/og-image.jpg"> <meta name="twitter:card" content="summary_large_image"> <meta name="twitter:title" content="Ebn Sina - Svelte Expert &amp; Full Stack Developer"> <meta name="twitter:description" content="Full Stack Developer and Instructor with a focus on SvelteKit, JavaScript, and modern web technologies."> <meta name="twitter:image" content="https://ebnsina.vercel.app/twitter-card.jpg"> <link rel="canonical" href="https://ebnsina.vercel.app">`;
  });
  Header($$payload);
  $$payload.out += `<!----> <main class="min-h-screen max-w-5xl mx-auto border-x border-slate-200"><!---->`;
  slot($$payload, default_slot($$props), {});
  $$payload.out += `<!----></main> `;
  Footer($$payload);
  $$payload.out += `<!---->`;
  pop();
}
export {
  _layout as default
};
