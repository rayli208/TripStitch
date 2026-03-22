/**
 * Nominatim (OpenStreetMap) geocoder for fetching town/city boundary polygons.
 * Returns GeoJSON boundary geometry that can be drawn on MapLibre GL.
 */

export interface TownResult {
	displayName: string;
	lat: number;
	lng: number;
	boundaryGeoJSON: GeoJSON.Geometry | null;
	/** [west, south, east, north] */
	boundingBox: [number, number, number, number];
	type: string;
	importance: number;
}

let lastRequestTime = 0;

/** Enforce Nominatim's 1 request/second policy */
async function throttle(): Promise<void> {
	const now = Date.now();
	const elapsed = now - lastRequestTime;
	if (elapsed < 1100) {
		await new Promise((r) => setTimeout(r, 1100 - elapsed));
	}
	lastRequestTime = Date.now();
}

/**
 * Search for towns/cities and return their boundary polygons.
 * Uses Nominatim's `polygon_geojson=1` to get administrative boundaries.
 */
export async function searchTowns(query: string): Promise<TownResult[]> {
	await throttle();

	const url = new URL('https://nominatim.openstreetmap.org/search');
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('polygon_geojson', '1');
	url.searchParams.set('limit', '5');
	url.searchParams.set('featuretype', 'settlement');

	const res = await fetch(url.toString(), {
		headers: { 'User-Agent': 'TripStitch/1.0 (https://tripstitch.blog)' }
	});

	if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);

	const data: NominatimResult[] = await res.json();

	return data
		.filter((item) => item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon'))
		.map((item) => ({
			displayName: item.display_name,
			lat: parseFloat(item.lat),
			lng: parseFloat(item.lon),
			boundaryGeoJSON: item.geojson ?? null,
			boundingBox: [
				parseFloat(item.boundingbox[2]), // west
				parseFloat(item.boundingbox[0]), // south
				parseFloat(item.boundingbox[3]), // east
				parseFloat(item.boundingbox[1]) // north
			] as [number, number, number, number],
			type: item.type,
			importance: item.importance
		}));
}

interface NominatimResult {
	display_name: string;
	lat: string;
	lon: string;
	boundingbox: [string, string, string, string]; // [south, north, west, east]
	geojson?: GeoJSON.Geometry;
	type: string;
	importance: number;
}
