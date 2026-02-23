import type { MapStyle } from '$lib/types';

export const MAPTILER_KEY = 'd77Rwd4AjfBQ7hVy9Eka';

export const STYLE_URLS: Record<MapStyle, string> = {
	streets: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
	satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
	outdoor: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
	topo: `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
	dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
	light: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`
};
