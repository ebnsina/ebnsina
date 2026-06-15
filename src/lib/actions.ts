/** Reveal element on scroll into view. Adds `.in` once visible. */
export function reveal(node: HTMLElement, delay = 0) {
	node.classList.add('reveal');
	if (delay) node.style.animationDelay = `${delay}ms`;

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('in');
					io.unobserve(node);
				}
			}
		},
		{ threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
	);
	io.observe(node);

	return { destroy: () => io.disconnect() };
}
