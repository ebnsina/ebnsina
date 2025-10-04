import { r as readingTime } from "../../../../chunks/readingTime.js";
import { e as error } from "../../../../chunks/index.js";
import frontMatter from "front-matter";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
async function load({ params }) {
  const { slug } = params;
  const postFiles = /* @__PURE__ */ Object.assign({ "/static/posts/deploy-nodejs-on-vps.md": () => import("../../../../chunks/deploy-nodejs-on-vps.js").then((m) => m["default"]), "/static/posts/diy-auth-tanstack-router.md": () => import("../../../../chunks/diy-auth-tanstack-router.js").then((m) => m["default"]), "/static/posts/how-to-manage-multiple-git-accounts-on-macos.md": () => import("../../../../chunks/how-to-manage-multiple-git-accounts-on-macos.js").then((m) => m["default"]), "/static/posts/organizing-react-nextjs-project.md": () => import("../../../../chunks/organizing-react-nextjs-project.js").then((m) => m["default"]), "/static/posts/react-form-validate-with-hook-form-and-zod.md": () => import("../../../../chunks/react-form-validate-with-hook-form-and-zod.js").then((m) => m["default"]), "/static/posts/setup-tanstack-query-on-tanstack-router.md": () => import("../../../../chunks/setup-tanstack-query-on-tanstack-router.js").then((m) => m["default"]), "/static/posts/tanstack-query-search-filters.md": () => import("../../../../chunks/tanstack-query-search-filters.js").then((m) => m["default"]), "/static/posts/whats-new-in-react-19.md": () => import("../../../../chunks/whats-new-in-react-19.js").then((m) => m["default"]), "/static/posts/why-svelte-and-sveltekit-awesome.md": () => import("../../../../chunks/why-svelte-and-sveltekit-awesome.js").then((m) => m["default"]) });
  const fileResolver = postFiles[`/static/posts/${slug}.md`];
  if (!fileResolver) {
    throw error(404, `Could not find or process ${slug}`);
  }
  try {
    const fileContents = await fileResolver();
    const { attributes, body } = frontMatter(fileContents);
    const processedContent = await unified().use(remarkParse).use(remarkRehype).use(rehypeHighlight).use(rehypeStringify).process(body);
    const content = processedContent.toString();
    return {
      post: {
        ...attributes,
        slug,
        content,
        readingTime: readingTime(body)
      }
    };
  } catch (e) {
    console.error("Error processing markdown:", e);
    throw error(500, `Error processing the content of ${slug}`);
  }
}
export {
  load
};
