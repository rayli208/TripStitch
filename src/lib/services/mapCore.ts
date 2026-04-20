/**
 * MapLibre offscreen-map lifecycle and shared image/route helpers.
 *
 * Owns:
 *  - offscreen map creation / teardown / idle-wait
 *  - tile pre-warming to avoid mid-recording stalls
 *  - route-line layer addition (used by final-route renderer)
 *  - image loading helpers (used by title/outro renderers)
 *  - getResolution (tier-aware width/height for a given aspect ratio)
 */
import maplibregl from 'maplibre-gl';
import type { Location, TransportMode, AspectRatio, MapStyle } from '$lib/types';
import { STYLE_URLS } from '$lib/constants/map';
import { getResolutionForTier, type UserTier } from '$lib/constants/limits';
import { CLOSE_ZOOM } from './timingConfig';

interface ResolutionMap {
	width: number;
	height: number;
}

export function getResolution(aspectRatio: AspectRatio, tier: UserTier = 'free'): ResolutionMap {
	return getResolutionForTier(aspectRatio, tier);
}

const LINE_DASH_PATTERN: Record<TransportMode, number[]> = {
	walked: [2, 4],
	drove: [],
	biked: [6, 4]
};

/** Create an offscreen map in a hidden container, wait for initial load + idle. */
export async function createOffscreenMap(
	width: number,
	height: number,
	center: [number, number],
	zoom: number,
	mapStyle: MapStyle = 'streets'
): Promise<{ map: maplibregl.Map; container: HTMLDivElement }> {
	const container = document.createElement('div');
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.style.position = 'absolute';
	container.style.left = '-9999px';
	container.style.top = '-9999px';
	document.body.appendChild(container);

	console.log(
		`[MapCore] Creating offscreen map ${width}x${height} at [${center}] zoom=${zoom} style=${mapStyle}`
	);
	const map = new maplibregl.Map({
		container,
		style: STYLE_URLS[mapStyle],
		center,
		zoom,
		interactive: false,
		pixelRatio: 1,
		canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
		attributionControl: false
	});

	await new Promise<void>((resolve, reject) => {
		map.on('load', () => {
			console.log('[MapCore] Map loaded successfully');
			resolve();
		});
		map.on('error', (e) => {
			console.error('[MapCore] Map load error:', e);
			reject(new Error(`Map failed to load: ${e.error?.message || 'unknown error'}`));
		});
	});

	await waitForIdle(map);

	return { map, container };
}

export function destroyMap(map: maplibregl.Map, container: HTMLDivElement) {
	map.remove();
	container.remove();
}

/** Resolves on `idle`, or after `timeoutMs` to avoid hanging on slow tile loads. */
export function waitForIdle(map: maplibregl.Map, timeoutMs = 4000): Promise<void> {
	return new Promise((resolve) => {
		if (map.loaded() && !map.isMoving()) {
			console.log('[MapCore] waitForIdle: already idle');
			resolve();
			return;
		}

		const start = performance.now();
		const timeout = setTimeout(() => {
			console.log(`[MapCore] waitForIdle: timeout after ${timeoutMs}ms`);
			resolve();
		}, timeoutMs);
		map.once('idle', () => {
			clearTimeout(timeout);
			console.log(
				`[MapCore] waitForIdle: idle after ${((performance.now() - start) / 1000).toFixed(1)}s`
			);
			resolve();
		});
	});
}

/**
 * Jump to each location's close + overview viewport so tiles are already
 * cached when the main recording starts. Bounded by a per-position timeout.
 */
export async function preWarmTileCache(
	map: maplibregl.Map,
	locations: Location[],
	onProgress?: (msg: string) => void
): Promise<void> {
	const start = performance.now();
	onProgress?.('Preparing map tiles...');
	const PER_TIMEOUT = 3000;

	for (const loc of locations) {
		map.jumpTo({ center: [loc.lng, loc.lat], zoom: CLOSE_ZOOM });
		await waitForIdle(map, PER_TIMEOUT);

		map.jumpTo({ center: [loc.lng, loc.lat], zoom: 8 });
		await waitForIdle(map, PER_TIMEOUT);
	}

	if (locations.length >= 2) {
		const bounds = new maplibregl.LngLatBounds();
		for (const loc of locations) bounds.extend([loc.lng, loc.lat]);
		const center = bounds.getCenter();
		map.jumpTo({ center: [center.lng, center.lat], zoom: 4 });
		await waitForIdle(map, PER_TIMEOUT);
	}

	const first = locations[0];
	map.jumpTo({ center: [first.lng, first.lat], zoom: 10 });
	await waitForIdle(map, PER_TIMEOUT);

	console.log(
		`[MapCore] preWarmTileCache: ${locations.length} locations in ${((performance.now() - start) / 1000).toFixed(1)}s`
	);
}

/**
 * Add a route line segment with a dark outline + accent-colored top line.
 * Uses `routeCoordinates` if provided (real routing geometry), otherwise
 * falls back to a straight line between the two endpoints.
 */
export function addRouteLine(
	map: maplibregl.Map,
	from: Location,
	to: Location,
	mode: TransportMode,
	id: string,
	routeCoordinates?: [number, number][],
	accentColor: string = '#FFFFFF'
) {
	const dashArray = LINE_DASH_PATTERN[mode];
	const coordinates = routeCoordinates ?? [
		[from.lng, from.lat],
		[to.lng, to.lat]
	];

	map.addSource(id, {
		type: 'geojson',
		data: {
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates }
		}
	});

	map.addLayer({
		id: `${id}-outline`,
		type: 'line',
		source: id,
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': 'rgba(10, 15, 30, 0.6)',
			'line-width': 10,
			'line-opacity': 1
		} as Record<string, unknown>
	});

	const paint: Record<string, unknown> = {
		'line-color': accentColor,
		'line-width': 6,
		'line-opacity': 1
	};

	if (dashArray.length > 0) {
		paint['line-dasharray'] = dashArray;
	}

	map.addLayer({
		id,
		type: 'line',
		source: id,
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: paint as Record<string, unknown>
	});
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
	});
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load image from URL'));
		img.src = url;
	});
}

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
