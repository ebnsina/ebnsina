import type { PageLoad } from './$types';
import { readingTime } from '$lib/utils/readingTime';
import frontMatter from 'front-matter';

export const load: PageLoad = async () => {
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

	const allTags = [...new Set(posts.flatMap((post) => post.tags as string[]))];

	return { posts, allTags };
};
