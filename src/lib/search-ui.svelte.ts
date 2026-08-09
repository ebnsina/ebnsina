/** Open/close state for the global ⌘K palette.
 *
 *  The panel is mounted once in the root layout, but the buttons that open it
 *  live elsewhere (the header, at two breakpoints). A shared rune keeps that a
 *  one-line import on both sides instead of prop-drilling through the layout. */
import { preload } from '$lib/search';

export const searchUI = $state({ open: false });

export function openSearch() {
	searchUI.open = true;
}

export function closeSearch() {
	searchUI.open = false;
}

/** Hover/focus of a trigger is the earliest honest signal that a search is
 *  coming — start fetching the index chunk then. */
export const warmSearch = preload;
