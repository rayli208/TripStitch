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

/** Fetch road-following route geometry between two points */
export async function fetchRouteGeometry(
	from: Location,
	to: Location,
	mode: TransportMode
): Promise<RouteGeometry | null> {
	const profile = PROFILE_MAP[mode];
	const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
	const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;

	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const data = await res.json();
		const route = data?.routes?.[0];
		if (!route?.geometry?.coordinates) return null;
		return { coordinates: route.geometry.coordinates };
	} catch (err) {
		console.warn(`[RouteService] Failed to fetch route ${from.name} → ${to.name}:`, err);
		return null;
	}
}

/** Fetch route geometries for all consecutive location pairs in parallel */
export async function fetchAllRouteGeometries(
	locations: Location[]
): Promise<(RouteGeometry | null)[]> {
	if (locations.length < 2) return [];

	const promises: Promise<RouteGeometry | null>[] = [];
	for (let i = 0; i < locations.length - 1; i++) {
		const from = locations[i];
		const to = locations[i + 1];
		const mode = to.transportMode ?? 'drove';
		promises.push(fetchRouteGeometry(from, to, mode));
	}

	return Promise.all(promises);
}
