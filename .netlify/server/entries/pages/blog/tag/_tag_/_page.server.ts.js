import { e as error } from "../../../../../chunks/index.js";
import { r as readingTime } from "../../../../../chunks/readingTime.js";
import frontMatter from "front-matter";
async function load({ params }) {
  const { tag } = params;
  const postFiles = /* @__PURE__ */ Object.assign({ "/static/posts/deploy-nodejs-on-vps.md": () => import("../../../../../chunks/deploy-nodejs-on-vps.js").then((m) => m["default"]), "/static/posts/diy-auth-tanstack-router.md": () => import("../../../../../chunks/diy-auth-tanstack-router.js").then((m) => m["default"]), "/static/posts/how-to-manage-multiple-git-accounts-on-macos.md": () => import("../../../../../chunks/how-to-manage-multiple-git-accounts-on-macos.js").then((m) => m["default"]), "/static/posts/organizing-react-nextjs-project.md": () => import("../../../../../chunks/organizing-react-nextjs-project.js").then((m) => m["default"]), "/static/posts/react-form-validate-with-hook-form-and-zod.md": () => import("../../../../../chunks/react-form-validate-with-hook-form-and-zod.js").then((m) => m["default"]), "/static/posts/setup-tanstack-query-on-tanstack-router.md": () => import("../../../../../chunks/setup-tanstack-query-on-tanstack-router.js").then((m) => m["default"]), "/static/posts/tanstack-query-search-filters.md": () => import("../../../../../chunks/tanstack-query-search-filters.js").then((m) => m["default"]), "/static/posts/whats-new-in-react-19.md": () => import("../../../../../chunks/whats-new-in-react-19.js").then((m) => m["default"]), "/static/posts/why-svelte-and-sveltekit-awesome.md": () => import("../../../../../chunks/why-svelte-and-sveltekit-awesome.js").then((m) => m["default"]) });
  const posts = await Promise.all(
    Object.entries(postFiles).map(async ([filePath, resolver]) => {
      const fileContents = await resolver();
      const { attributes, body } = frontMatter(fileContents);
      const slug = filePath.split("/").pop()?.replace(".md", "") || "";
      return {
        slug,
        ...attributes,
        excerpt: attributes.excerpt || body.split("\n").slice(0, 3).join("\n"),
        readingTime: readingTime(body)
      };
    })
  );
  const filteredPosts = posts.filter((post) => post.tags?.includes(tag));
  if (filteredPosts.length === 0) {
    throw error(404, `No posts found with tag: ${tag}`);
  }
  return { posts: filteredPosts, tag };
}
export {
  load
};
