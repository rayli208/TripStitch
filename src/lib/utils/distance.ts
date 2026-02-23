import type { TransportMode } from '$lib/types';

const EARTH_RADIUS_MILES = 3958.8;

// Average speeds in mph
const SPEED_MAP: Record<TransportMode, number> = {
	walked: 3,
	biked: 12,
	drove: 25
};

function toRadians(deg: number): number {
	return (deg * Math.PI) / 180;
}

/** Haversine distance between two lat/lng points in miles */
export function haversineDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const dLat = toRadians(lat2 - lat1);
	const dLng = toRadians(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_MILES * c;
}

/** Estimate travel time in minutes */
export function estimateTravelTime(distanceMiles: number, mode: TransportMode): number {
	return (distanceMiles / SPEED_MAP[mode]) * 60;
}

/** Calculate total distance across consecutive locations */
export function totalDistance(locations: { lat: number; lng: number }[]): number {
	let total = 0;
	for (let i = 1; i < locations.length; i++) {
		total += haversineDistance(
			locations[i - 1].lat,
			locations[i - 1].lng,
			locations[i].lat,
			locations[i].lng
		);
	}
	return total;
}

/** Suggest transport mode based on distance between two points */
export function suggestTransportMode(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): TransportMode {
	const dist = haversineDistance(lat1, lng1, lat2, lng2);
	if (dist < 1) return 'walked';
	if (dist < 5) return 'biked';
	return 'drove';
}

/** Calculate total travel time across consecutive locations */
export function totalTravelTime(
	locations: { lat: number; lng: number; transportMode: TransportMode | null }[]
): number {
	let total = 0;
	for (let i = 1; i < locations.length; i++) {
		const dist = haversineDistance(
			locations[i - 1].lat,
			locations[i - 1].lng,
			locations[i].lat,
			locations[i].lng
		);
		const mode = locations[i].transportMode ?? 'drove';
		total += estimateTravelTime(dist, mode);
	}
	return total;
}
