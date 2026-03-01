import type { Location, TransportMode } from '$lib/types';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

const PROFILE_MAP: Record<TransportMode, string> = {
	drove: 'driving',
	biked: 'cycling',
	walked: 'foot'
};

export interface RouteGeometry {
	coordinates: [number, number][]; // [lng, lat][]
}

// Cache route geometries by "fromLng,fromLat;toLng,toLat|profile"
const routeCache = new Map<string, RouteGeometry | null>();

function cacheKey(from: Location, to: Location, profile: string): string {
	return `${from.lng},${from.lat};${to.lng},${to.lat}|${profile}`;
}

/** Fetch road-following route geometry between two points (cached) */
export async function fetchRouteGeometry(
	from: Location,
	to: Location,
	mode: TransportMode
): Promise<RouteGeometry | null> {
	const profile = PROFILE_MAP[mode];
	const key = cacheKey(from, to, profile);

	const cached = routeCache.get(key);
	if (cached !== undefined) {
		console.log(`[RouteService] Cache hit for ${from.name} → ${to.name} (${profile})`);
		return cached;
	}

	const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
	const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;

	const fetchStart = performance.now();
	try {
		const res = await fetch(url);
		if (!res.ok) {
			console.warn(`[RouteService] HTTP ${res.status} for ${from.name} → ${to.name} (${profile})`);
			routeCache.set(key, null);
			return null;
		}
		const data = await res.json();
		const route = data?.routes?.[0];
		if (!route?.geometry?.coordinates) {
			console.warn(`[RouteService] No geometry in response for ${from.name} → ${to.name}`);
			routeCache.set(key, null);
			return null;
		}
		const pts = route.geometry.coordinates.length;
		const dist = route.distance ? (route.distance / 1000).toFixed(1) + 'km' : '?';
		console.log(`[RouteService] ${from.name} → ${to.name} (${profile}): ${pts} points, ${dist}, took ${((performance.now() - fetchStart) / 1000).toFixed(1)}s`);
		const result = { coordinates: route.geometry.coordinates };
		routeCache.set(key, result);
		return result;
	} catch (err) {
		console.warn(`[RouteService] Failed to fetch route ${from.name} → ${to.name} after ${((performance.now() - fetchStart) / 1000).toFixed(1)}s:`, err);
		return null;
	}
}

/** Fetch route geometries for all consecutive location pairs in parallel */
export async function fetchAllRouteGeometries(
	locations: Location[]
): Promise<(RouteGeometry | null)[]> {
	if (locations.length < 2) return [];

	console.log(`[RouteService] Fetching ${locations.length - 1} route geometries in parallel...`);
	const fetchStart = performance.now();
	const promises: Promise<RouteGeometry | null>[] = [];
	for (let i = 0; i < locations.length - 1; i++) {
		const from = locations[i];
		const to = locations[i + 1];
		const mode = to.transportMode ?? 'drove';
		promises.push(fetchRouteGeometry(from, to, mode));
	}

	const results = await Promise.all(promises);
	const successCount = results.filter(Boolean).length;
	console.log(`[RouteService] All routes fetched: ${successCount}/${results.length} succeeded in ${((performance.now() - fetchStart) / 1000).toFixed(1)}s`);
	return results;
}
