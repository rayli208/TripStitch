export interface FontDef {
	id: string;
	name: string;
	/** Google Fonts family parameter value (spaces included) */
	family: string;
	/** Weights to load from Google Fonts */
	weights: number[];
}

export const FONTS: FontDef[] = [
	{ id: 'inter', name: 'Inter', family: 'Inter', weights: [400, 700, 800] },
	{ id: 'playfair', name: 'Playfair Display', family: 'Playfair Display', weights: [400, 700, 800] },
	{ id: 'montserrat', name: 'Montserrat', family: 'Montserrat', weights: [400, 700, 800] },
	{ id: 'lora', name: 'Lora', family: 'Lora', weights: [400, 700] },
	{ id: 'oswald', name: 'Oswald', family: 'Oswald', weights: [400, 700] },
	{ id: 'poppins', name: 'Poppins', family: 'Poppins', weights: [400, 700, 800] },
	{ id: 'raleway', name: 'Raleway', family: 'Raleway', weights: [400, 700, 800] },
	{ id: 'bebas', name: 'Bebas Neue', family: 'Bebas Neue', weights: [400] },
	{ id: 'dmserif', name: 'DM Serif Display', family: 'DM Serif Display', weights: [400] },
	{ id: 'spacegrotesk', name: 'Space Grotesk', family: 'Space Grotesk', weights: [400, 700] },
	{ id: 'archivo', name: 'Archivo', family: 'Archivo', weights: [400, 700, 800] },
	{ id: 'sourceserif', name: 'Source Serif 4', family: 'Source Serif 4', weights: [400, 700] },
	{ id: 'spacemono', name: 'Space Mono', family: 'Space Mono', weights: [400, 700] },
	{ id: 'crimsontext', name: 'Crimson Text', family: 'Crimson Text', weights: [400, 700] },
	{ id: 'bitter', name: 'Bitter', family: 'Bitter', weights: [400, 700, 800] },
	{ id: 'cabin', name: 'Cabin', family: 'Cabin', weights: [400, 700] },
	{ id: 'kanit', name: 'Kanit', family: 'Kanit', weights: [400, 700] },
	{ id: 'archivo-narrow', name: 'Archivo Narrow', family: 'Archivo Narrow', weights: [400, 700] },
	{ id: 'librebaskerville', name: 'Libre Baskerville', family: 'Libre Baskerville', weights: [400, 700] },
	{ id: 'josefinsans', name: 'Josefin Sans', family: 'Josefin Sans', weights: [400, 700] },
	{ id: 'anton', name: 'Anton', family: 'Anton', weights: [400] },
	{ id: 'righteous', name: 'Righteous', family: 'Righteous', weights: [400] },
	{ id: 'permanentmarker', name: 'Permanent Marker', family: 'Permanent Marker', weights: [400] },
	{ id: 'satisfy', name: 'Satisfy', family: 'Satisfy', weights: [400] }
];

export const DEFAULT_FONT_ID = 'inter';

export function getFontById(id: string): FontDef {
	return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** Returns a CSS / canvas-compatible font-family string */
export function fontFamily(fontId: string): string {
	const font = getFontById(fontId);
	return `${font.family}, system-ui, sans-serif`;
}

/** Build a Google Fonts URL that loads all specified fonts (or a single one) */
export function googleFontsUrl(fontIds?: string[]): string {
	const ids = fontIds ?? FONTS.map((f) => f.id);
	const families = ids.map((id) => {
		const font = getFontById(id);
		const wgts = font.weights.join(';');
		return `family=${font.family.replace(/ /g, '+')}:wght@${wgts}`;
	});
	return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

export const DEFAULT_BRAND_COLORS = [
	'#FFFFFF', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1',
	'#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];
