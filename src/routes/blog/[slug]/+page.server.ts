import { error } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import frontMatter from 'front-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import { readingTime } from '$lib/utils/readingTime';

export async function load({ params }) {
	const { slug } = params;
	const postsDirectory = path.resolve('static', 'posts');
	const filePath = path.join(postsDirectory, `${slug}.md`);

	try {
		const fileContents = await fs.readFile(filePath, 'utf8');
		const { attributes, body } = frontMatter(fileContents);

		const processedContent = await unified()
			.use(remarkParse)
			.use(remarkRehype)
			.use(rehypeHighlight)
			.use(rehypeStringify)
			.process(body);

		const content = processedContent.toString();

		return {
			post: {
				...(attributes as Record<string, unknown>),
				slug,
				content,
				readingTime: readingTime(body)
			}
		};
	} catch (e) {
		console.error('Error processing markdown:', e);
		throw error(404, `Could not find or process ${slug}`);
	}
}
