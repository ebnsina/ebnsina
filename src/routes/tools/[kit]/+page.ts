import { error } from '@sveltejs/kit';
import { KITS, kitBySlug } from '$lib/data/kits';

export function entries() {
	return KITS.map((k) => ({ kit: k.slug }));
}

export function load({ params }) {
	const kit = kitBySlug(params.kit);
	if (!kit) error(404, 'Kit not found');
	return { kit };
}
