import { readingTime } from '$lib/utils/readingTime';
import { error } from '@sveltejs/kit';
import frontMatter from 'front-matter';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export async function load({ params }) {
	const { slug } = params;
	const postFiles = import.meta.glob('/static/posts/*.md', { query: '?raw', import: 'default' });

	const fileResolver = postFiles[`/static/posts/${slug}.md`];
	if (!fileResolver) {
		throw error(404, `Could not find or process ${slug}`);
	}

	try {
		const fileContents = await fileResolver();
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
		throw error(500, `Error processing the content of ${slug}`);
	}
}
