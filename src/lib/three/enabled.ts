/** Whether to mount WebGL 3D: skip on small screens and when the user prefers
 *  reduced motion — avoids battery drain / jank on phones. */
export function threeEnabled(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return (
		window.matchMedia('(min-width: 768px)').matches &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}
