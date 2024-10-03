import { readingTime } from '$lib/utils/readingTime';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import frontMatter from 'front-matter';

export async function load({ params }) {
	const { tag } = params;
	const postsDirectory = path.join(process.cwd(), 'static', 'posts');
	const files = fs.readdirSync(postsDirectory);

	const posts = await Promise.all(
		files.map(async (filename) => {
			const filePath = path.join(postsDirectory, filename);
			const fileContents = fs.readFileSync(filePath, 'utf8');
			const { attributes, body } = frontMatter(fileContents);
			const slug = filename.replace('.md', '');

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
