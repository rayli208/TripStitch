import type { Location, TransportMode } from '$lib/types';
import { PUBLIC_ORS_KEY } from '$env/static/public';
import { db } from '$lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────
// Two-tier route cache
//
// L1: in-memory Map (free, per-session, dies on reload)
// L2: Firestore `routes/{key}` (shared globally — Phoenixville → Bistro on
//     Bridge gets fetched ONCE EVER across all users for the next 90 days).
// L3: OpenRouteService API call.
//
// Cost guards in place:
// • coords rounded to 5 decimals (~1m) so float drift doesn't miss the cache
// • 90-day staleness check — older docs trigger one refresh, then cached again
// • 2,000-point geometry cap — long routes are downsampled before write so a
//   single doc can't blow up storage
// • Failed lookups never pollute Firestore — null cached only in memory
// • All Firestore writes wrapped in try/catch — a Firestore write failure
//   never breaks routing for the user
// • Routing-disabled flag short-circuits both Firestore AND ORS calls
// ─────────────────────────────────────────────────────────────────────────

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

const PROFILE_MAP: Record<TransportMode, string> = {
	drove: 'driving-car',
	biked: 'cycling-regular',
	walked: 'foot-walking'
};

export interface RouteGeometry {
	coordinates: [number, number][]; // [lng, lat][]
}

// L1 — per-session in-memory cache (instant, free)
const memCache = new Map<string, RouteGeometry | null>();

// Refresh L2 docs older than this. Routes change very slowly (new construction,
// closures), so 90 days is conservative without wasting writes.
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

// Hard cap on stored geometry length. Even a cross-country trip rarely needs
// more than ~1500 points for visual smoothness. Caps doc size at ~30 KB.
const MAX_STORED_POINTS = 2000;

let routingDisabled = false;
let routingDisabledReason = '';

export function isRoutingDisabled(): boolean {
	return routingDisabled;
}

export function getRoutingDisabledReason(): string {
	return routingDisabledReason;
}

function disableRouting(reason: string) {
	if (!routingDisabled) {
		routingDisabled = true;
		routingDisabledReason = reason;
		console.warn(`[RouteService] ${reason}`);
	}
}

/** Round to ~1m precision so micro-float-drift doesn't fragment the cache. */
function r5(n: number): number {
	return Math.round(n * 1e5) / 1e5;
}

/** Stable doc ID from rounded coordinates + profile. */
function routeDocId(from: Location, to: Location, profile: string): string {
	return `${r5(from.lat)},${r5(from.lng)}_${r5(to.lat)},${r5(to.lng)}_${profile}`;
}

/** Same as docId but for the in-memory cache (kept identical for simplicity). */
function memKey(from: Location, to: Location, profile: string): string {
	return routeDocId(from, to, profile);
}

/** Downsample a long route geometry by uniform stride. */
function downsample(coords: [number, number][], maxPoints: number): [number, number][] {
	if (coords.length <= maxPoints) return coords;
	const stride = coords.length / maxPoints;
	const out: [number, number][] = [];
	for (let i = 0; i < maxPoints; i++) {
		out.push(coords[Math.floor(i * stride)]);
	}
	// Always preserve the final point so the route ends at the destination.
	if (out[out.length - 1] !== coords[coords.length - 1]) {
		out[out.length - 1] = coords[coords.length - 1];
	}
	return out;
}

/** Firestore stores arrays of arrays inside maps fine, but flat arrays are
 * smaller. We store [lng,lat,lng,lat,...] and rebuild on read. */
function flatten(coords: [number, number][]): number[] {
	const flat = new Array<number>(coords.length * 2);
	for (let i = 0; i < coords.length; i++) {
		flat[i * 2] = coords[i][0];
		flat[i * 2 + 1] = coords[i][1];
	}
	return flat;
}

function unflatten(flat: number[]): [number, number][] {
	const out: [number, number][] = [];
	for (let i = 0; i < flat.length; i += 2) {
		out.push([flat[i], flat[i + 1]]);
	}
	return out;
}

/** Try Firestore L2 cache. Never throws — failure just falls through to ORS. */
async function readFirestoreCache(docId: string): Promise<RouteGeometry | null> {
	try {
		const snap = await getDoc(doc(db, 'routes', docId));
		if (!snap.exists()) return null;
		const data = snap.data() as { flatCoords?: number[]; fetchedAt?: number };
		if (!data.flatCoords || !Array.isArray(data.flatCoords) || data.flatCoords.length < 2) {
			return null;
		}
		// Stale check
		const age = Date.now() - (data.fetchedAt ?? 0);
		if (age > STALE_AFTER_MS) return null;
		return { coordinates: unflatten(data.flatCoords) };
	} catch (err) {
		// Firestore unavailable / rules denied / network blip — fall through to ORS
		console.warn('[RouteService] Firestore L2 read failed:', (err as Error)?.message);
		return null;
	}
}

/** Persist a successful ORS fetch to Firestore. Best-effort, never blocks. */
async function writeFirestoreCache(
	docId: string,
	profile: string,
	coords: [number, number][]
): Promise<void> {
	try {
		const stored = downsample(coords, MAX_STORED_POINTS);
		await setDoc(doc(db, 'routes', docId), {
			flatCoords: flatten(stored),
			profile,
			pointCount: stored.length,
			fetchedAt: Date.now()
		});
	} catch (err) {
		// Don't surface Firestore write failures — routing already succeeded for the user
		console.warn('[RouteService] Firestore L2 write failed:', (err as Error)?.message);
	}
}

/** Fetch road-following route geometry between two points with L1 + L2 cache. */
export async function fetchRouteGeometry(
	from: Location,
	to: Location,
	mode: TransportMode
): Promise<RouteGeometry | null> {
	if (routingDisabled) return null;

	const profile = PROFILE_MAP[mode];
	const k = memKey(from, to, profile);

	// L1
	const memHit = memCache.get(k);
	if (memHit !== undefined) return memHit;

	// L2
	const docId = routeDocId(from, to, profile);
	const fsHit = await readFirestoreCache(docId);
	if (fsHit) {
		memCache.set(k, fsHit);
		return fsHit;
	}

	// L3 — ORS
	if (!PUBLIC_ORS_KEY) {
		disableRouting('PUBLIC_ORS_KEY is missing — routes will use straight lines.');
		return null;
	}

	const url = `${ORS_BASE}/${profile}/geojson`;
	const fetchStart = performance.now();
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 8000);

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: PUBLIC_ORS_KEY,
				'Content-Type': 'application/json',
				Accept: 'application/json, application/geo+json'
			},
			body: JSON.stringify({
				coordinates: [
					[from.lng, from.lat],
					[to.lng, to.lat]
				]
			}),
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		if (res.status === 401 || res.status === 403) {
			disableRouting(`OpenRouteService rejected the API key (${res.status}). Routes will use straight lines.`);
			memCache.set(k, null);
			return null;
		}
		if (res.status === 429) {
			disableRouting('OpenRouteService quota hit (429). Routes will use straight lines for this session.');
			memCache.set(k, null);
			return null;
		}
		if (!res.ok) {
			console.warn(`[RouteService] HTTP ${res.status} for ${from.name} → ${to.name}`);
			memCache.set(k, null);
			return null;
		}

		const data = await res.json();
		const coords = data?.features?.[0]?.geometry?.coordinates;
		if (!Array.isArray(coords) || coords.length === 0) {
			memCache.set(k, null);
			return null;
		}

		const result: RouteGeometry = { coordinates: coords as [number, number][] };
		const elapsed = ((performance.now() - fetchStart) / 1000).toFixed(2);
		console.log(`[RouteService] ${from.name} → ${to.name} (${profile}): ${coords.length} pts in ${elapsed}s — caching`);

		memCache.set(k, result);
		// Fire-and-forget L2 write — don't await, the user already has their route
		writeFirestoreCache(docId, profile, result.coordinates);
		return result;
	} catch (err) {
		clearTimeout(timeoutId);
		const e = err as Error;
		const elapsed = ((performance.now() - fetchStart) / 1000).toFixed(1);
		const reason =
			e?.name === 'AbortError'
				? 'timeout (8s)'
				: e?.message?.includes('Failed to fetch')
					? 'network/CORS error'
					: (e?.message ?? 'network error');
		console.warn(`[RouteService] ${from.name} → ${to.name} failed after ${elapsed}s: ${reason}`);
		memCache.set(k, null);
		return null;
	}
}

/** Fetch route geometries for all consecutive location pairs in parallel */
export async function fetchAllRouteGeometries(
	locations: Location[]
): Promise<(RouteGeometry | null)[]> {
	if (locations.length < 2) return [];

	if (routingDisabled) {
		return new Array(locations.length - 1).fill(null);
	}

	const promises: Promise<RouteGeometry | null>[] = [];
	for (let i = 0; i < locations.length - 1; i++) {
		const from = locations[i];
		const to = locations[i + 1];
		const mode = to.transportMode ?? 'drove';
		promises.push(fetchRouteGeometry(from, to, mode));
	}

	return await Promise.all(promises);
}
