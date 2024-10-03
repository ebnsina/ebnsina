import { error } from '@sveltejs/kit';
import { readingTime } from '$lib/utils/readingTime';
import frontMatter from 'front-matter';

export async function load({ params }) {
	const { tag } = params;

	const postFiles = import.meta.glob('/static/posts/*.md', { query: '?raw', import: 'default' });

	const posts = await Promise.all(
		Object.entries(postFiles).map(async ([filePath, resolver]) => {
			const fileContents = await resolver();
			const { attributes, body } = frontMatter(fileContents);
			const slug = filePath.split('/').pop()?.replace('.md', '') || '';

			return {
				slug,
				...(attributes as Record<string, unknown>),
				excerpt:
					(attributes as { excerpt?: string }).excerpt || body.split('\n').slice(0, 3).join('\n'),
				readingTime: readingTime(body)
			};
		})
	);

	const filteredPosts = posts.filter((post) => (post.tags as string[])?.includes(tag));

	if (filteredPosts.length === 0) {
		throw error(404, `No posts found with tag: ${tag}`);
	}

	return { posts: filteredPosts, tag };
}
