/**
 * Small geodesy helpers used by the spotlight renderer's radius-context mode.
 * Avoids a Turf.js dependency for the one polygon-generation case we need.
 */

const EARTH_RADIUS_M = 6378137;

export const MILES_TO_METERS = 1609.344;
export const KM_TO_METERS = 1000;

/**
 * Generate a closed-polygon GeoJSON ring approximating a circle on the earth's
 * surface, using the spherical forward geodesic formula. `points` controls
 * smoothness — 64 looks clean at overlay zoom levels.
 */
export function circlePolygon(
	center: [number, number],
	radiusMeters: number,
	points = 64
): GeoJSON.Polygon {
	const [lng, lat] = center;
	const latRad = (lat * Math.PI) / 180;
	const lngRad = (lng * Math.PI) / 180;
	const angular = radiusMeters / EARTH_RADIUS_M;

	const coords: [number, number][] = [];
	for (let i = 0; i <= points; i++) {
		const bearing = (i / points) * 2 * Math.PI;
		const lat2 = Math.asin(
			Math.sin(latRad) * Math.cos(angular) +
				Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
		);
		const lng2 =
			lngRad +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
				Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2)
			);
		coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
	}
	return { type: 'Polygon', coordinates: [coords] };
}

/** Axis-aligned bbox [west, south, east, north] that fully contains a circle. */
export function circleBbox(
	center: [number, number],
	radiusMeters: number
): [number, number, number, number] {
	const [lng, lat] = center;
	const latRad = (lat * Math.PI) / 180;
	const latOffsetDeg = ((radiusMeters / EARTH_RADIUS_M) * 180) / Math.PI;
	const lngOffsetDeg = latOffsetDeg / Math.max(Math.cos(latRad), 0.01);
	return [lng - lngOffsetDeg, lat - latOffsetDeg, lng + lngOffsetDeg, lat + latOffsetDeg];
}
