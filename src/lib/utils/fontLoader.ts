import { getFontById, type FontDef } from '$lib/constants/fonts';

const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

/** Inject a Google Fonts <link> and wait for the font to be ready.
 *  Idempotent — subsequent calls for the same fontId resolve immediately. */
export async function loadFont(fontId: string): Promise<void> {
	if (loaded.has(fontId)) return;
	if (loading.has(fontId)) return loading.get(fontId);

	const promise = _load(fontId);
	loading.set(fontId, promise);
	try {
		await promise;
		loaded.add(fontId);
	} finally {
		loading.delete(fontId);
	}
}

async function _load(fontId: string): Promise<void> {
	const font = getFontById(fontId);
	injectLink(font);

	// Wait for at least the primary weight to be available
	const primary = font.weights.includes(700) ? 700 : font.weights[0];
	try {
		await document.fonts.load(`${primary} 16px "${font.family}"`);
	} catch {
		// Fallback: just wait a bit for the stylesheet to settle
		await new Promise((r) => setTimeout(r, 500));
	}
}

function linkId(font: FontDef): string {
	return `gf-${font.id}`;
}

function injectLink(font: FontDef) {
	if (document.getElementById(linkId(font))) return;

	const wgts = font.weights.join(';');
	const href = `https://fonts.googleapis.com/css2?family=${font.family.replace(/ /g, '+')}:wght@${wgts}&display=swap`;

	const link = document.createElement('link');
	link.id = linkId(font);
	link.rel = 'stylesheet';
	link.href = href;
	document.head.appendChild(link);
}

/** Add a <link rel="preload"> for a font — useful when the user hovers a font card. */
export function preloadFont(fontId: string): void {
	const font = getFontById(fontId);
	const id = `gf-pre-${font.id}`;
	if (document.getElementById(id)) return;

	const wgts = font.weights.join(';');
	const href = `https://fonts.googleapis.com/css2?family=${font.family.replace(/ /g, '+')}:wght@${wgts}&display=swap`;

	const link = document.createElement('link');
	link.id = id;
	link.rel = 'preload';
	link.as = 'style';
	link.href = href;
	document.head.appendChild(link);
}
