import { l as head } from "../../../chunks/index3.js";
import { P as PatternedSection } from "../../../chunks/PatternedSection.js";
function _page($$payload) {
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>Tech Stack - Ebn Sina</title>`;
  });
  $$payload.out += `<section class="min-h-screen">`;
  PatternedSection($$payload, {
    title: "Tech Stack",
    description: "The tools I rely on daily to build modern web applications."
  });
  $$payload.out += `<!----> <div class="prose prose-slate px-6 mt-10 max-w-3xl mx-auto"><p>These are the technologies and tools where I feel most productive and confident:</p> <ol class="space-y-8 list-decimal pl-6"><li><h2 class="font-semibold text-base md:text-lg">Frameworks</h2> <p class="text-sm text-slate-600 leading-loose">I primarily use <strong>SvelteKit</strong> and <strong>React (TanStack Start/Remix/Next.js)</strong>. I've been hands-on with both since
					their early stages. Every project starts with <code>TypeScript</code> for type safety and scalability.</p></li> <li><h2 class="font-semibold text-base md:text-lg">Code Editor</h2> <p class="text-sm text-slate-600 leading-loose">I’ve used VS Code for years, but recently switched to <strong>Zed</strong>. It’s fast,
					elegant, and currently my favorite coding environment.</p></li> <li><h2 class="font-semibold text-base md:text-lg">Styling</h2> <p class="text-sm text-slate-600 leading-loose"><strong>Tailwind CSS</strong> is my preferred choice for styling. I often build my own UI components
					or extend minimalist UI libraries when needed.</p></li> <li><h2 class="font-semibold text-base md:text-lg">Database</h2> <p class="text-sm text-slate-600 leading-loose"><strong>PostgreSQL</strong> is my go-to database. I typically use <strong>Prisma</strong> for ORM, schema migrations, and dev tooling (e.g. Prisma Studio). Occasionally, I use <strong>Drizzle ORM</strong> depending on the project.</p></li> <li><h2 class="font-semibold text-base md:text-lg">AI Assistant</h2> <p class="text-sm text-slate-600 leading-loose">I regularly use <strong>Claude</strong> and <strong>ChatGPT</strong> for refactoring, debugging,
					and architectural suggestions. Both have solid knowledge of SvelteKit, Next.js, Prisma, and
					modern full-stack workflows.</p></li> <li><h2 class="font-semibold text-base md:text-lg">Coding Principles &amp; Best Practices</h2> <ul class="list-disc list-inside space-y-1 text-sm text-slate-600 leading-loose"><li>Favor <code>let</code> over <code>const</code> when flexibility is required</li> <li>Organize code into larger, cohesive files rather than many fragmented components</li> <li>Keep frequently changing code colocated for easier maintenance and readability</li> <li>Prefer pragmatic copy-pasting over premature abstraction to avoid unnecessary complexity</li> <li>Write clear, self-documenting code with meaningful variable and function names</li> <li>Adopt consistent formatting and linting to maintain code quality</li> <li>Keep functions small and focused; each should have a single responsibility</li> <li>Write unit tests for critical logic to ensure reliability and catch regressions early</li> <li>Use TypeScript or similar tools to enforce type safety and catch errors at compile time</li> <li>Document complex or non-obvious logic for future maintainers</li></ul></li> <li><h2 class="font-semibold text-base md:text-lg">Deployment</h2> <p class="text-sm text-slate-600 leading-loose"><code>Vercel</code> is my preferred platform for frontend hosting. I also deploy to <code>Netlify</code>, <code>Deno Deploy</code>, or custom <code>VPS</code> setups based on
					performance or budget needs.</p></li></ol></div></section>`;
}
export {
  _page as default
};
