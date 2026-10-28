import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
export { gsap, ScrollTrigger, SplitText };

// Runs setup inside a scoped gsap.matchMedia; `reduce` is true under prefers-reduced-motion.
export function motion(scope: HTMLElement, setup: (reduce: boolean) => void) {
	const mm = gsap.matchMedia(scope);
	mm.add(
		{ reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
		(c) => setup(!!c.conditions?.reduce)
	);
	return () => mm.revert();
}
