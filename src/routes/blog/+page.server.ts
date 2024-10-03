import { readingTime } from '$lib/utils/readingTime';
import fs from 'fs';
import path from 'path';
import frontMatter from 'front-matter';

export async function load() {
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

	const allTags = [...new Set(posts.flatMap((post) => post.tags as string[]))];

	return { posts, allTags };
}
