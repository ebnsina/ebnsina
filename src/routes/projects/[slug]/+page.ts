import { error } from '@sveltejs/kit';
import { projects } from '$lib/data/projects';

export function entries() {
	return projects.filter((p) => p.caseStudy).map((p) => ({ slug: p.slug }));
}

export function load({ params }) {
	const project = projects.find((p) => p.slug === params.slug);
	if (!project || !project.caseStudy) error(404, 'Case study not found');
	return { project };
}
