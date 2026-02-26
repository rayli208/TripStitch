import maplibregl from 'maplibre-gl';
import type { Location, TransportMode, AspectRatio, MapStyle } from '$lib/types';
import { getSupportedMimeType } from '$lib/utils/browserCompat';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import { STYLE_URLS } from '$lib/constants/map';

const TARGET_FPS = 30;
const FLY_TO_DURATION = 2000;
const FINAL_MAP_DURATION = 6000;

const CYAN = '#00F5FF';
const MIDNIGHT = '#0F172A';

interface ResolutionMap {
	width: number;
	height: number;
}

const RESOLUTIONS: Record<AspectRatio, ResolutionMap> = {
	'9:16': { width: 1080, height: 1920 },
	'1:1': { width: 1080, height: 1080 },
	'16:9': { width: 1920, height: 1080 }
};

export function getResolution(aspectRatio: AspectRatio): ResolutionMap {
	return RESOLUTIONS[aspectRatio];
}

const TRANSPORT_ICONS: Record<TransportMode, { icon: string; label: string }> = {
	walked: { icon: '\u{1F6B6}', label: 'Walked' },
	drove: { icon: '\u{1F697}', label: 'Drove' },
	biked: { icon: '\u{1F6B4}', label: 'Biked' }
};

const LINE_DASH_PATTERN: Record<TransportMode, number[]> = {
	walked: [2, 4],
	drove: [],
	biked: [6, 4]
};

/** Create an offscreen map in a container, wait for it to load, then return it */
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

	console.log(`[MapRenderer] Creating offscreen map ${width}x${height} at [${center}] zoom=${zoom} style=${mapStyle}`);
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
			console.log('[MapRenderer] Map loaded successfully');
			resolve();
		});
		map.on('error', (e) => {
			console.error('[MapRenderer] Map load error:', e);
			reject(new Error(`Map failed to load: ${e.error?.message || 'unknown error'}`));
		});
	});

	// Wait for tiles to fully render
	await waitForIdle(map);

	return { map, container };
}

/** Clean up an offscreen map */
export function destroyMap(map: maplibregl.Map, container: HTMLDivElement) {
	map.remove();
	container.remove();
}

/** Wait for all tiles to finish loading and rendering */
export function waitForIdle(map: maplibregl.Map, timeoutMs = 4000): Promise<void> {
	return new Promise((resolve) => {
		const timeout = setTimeout(resolve, timeoutMs);
		map.once('idle', () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

/** Record the map canvas for a given duration while an animation runs.
 *  drawOverlays is called every frame AFTER the map canvas is copied,
 *  so overlays (pins, labels, stats) render on top of the map. */
async function recordMapAnimation(
	map: maplibregl.Map,
	_container: HTMLDivElement,
	width: number,
	height: number,
	durationMs: number,
	animationFn?: () => void,
	drawOverlays?: (ctx: CanvasRenderingContext2D, elapsed: number) => void
): Promise<Blob> {
	const mimeType = getSupportedMimeType();
	const mapCanvas = map.getCanvas();

	const outputCanvas = document.createElement('canvas');
	outputCanvas.width = width;
	outputCanvas.height = height;
	const ctx = outputCanvas.getContext('2d')!;

	const stream = outputCanvas.captureStream(TARGET_FPS);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	recorder.start();
	console.log(`[MapRenderer] Recording started (${durationMs}ms, mime: ${mimeType})`);

	// Start the animation
	animationFn?.();

	const startTime = performance.now();
	await new Promise<void>((resolve) => {
		const drawFrame = () => {
			const elapsed = performance.now() - startTime;
			if (elapsed >= durationMs) {
				resolve();
				return;
			}
			// Copy map canvas to output canvas, then draw overlays on top
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			drawOverlays?.(ctx, elapsed);
			requestAnimationFrame(drawFrame);
		};
		drawFrame();
	});

	// Draw one final frame with overlays
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	drawOverlays?.(ctx, durationMs);
	await sleep(100);

	recorder.stop();
	stream.getTracks().forEach((t) => t.stop());
	console.log('[MapRenderer] Recording stopped, waiting for blob...');

	const blob = await done;
	console.log(`[MapRenderer] Recording blob ready: ${blob.size} bytes`);
	return blob;
}

const CLOSE_ZOOM = 18;

/** Render a fly-to animation for a single location.
 *  For the first location: moderate zoom → fly in.
 *  For subsequent locations: start zoomed in on prev → zoom out to show both → zoom into new. */
export async function renderFlyTo(
	location: Location,
	prevLocation: Location | null,
	transportMode: TransportMode | null,
	aspectRatio: AspectRatio,
	mapStyle: MapStyle = 'streets',
	titleColor: string = '#FFFFFF',
	fontId: string = 'inter',
	secondaryColor: string = '#0a0f1e'
): Promise<Blob> {
	const { width, height } = getResolution(aspectRatio);
	const displayName = location.label || location.name.split(',')[0];
	const ff = fontFamily(fontId);
	await loadFont(fontId);

	if (!prevLocation) {
		// First location: start at a moderate overview, fly in close
		console.log(`[MapRenderer] renderFlyTo (first): "${location.name}"`);
		const { map, container } = await createOffscreenMap(
			width, height, [location.lng, location.lat], 10, mapStyle
		);

		const HOLD = 2000;
		const blob = await recordMapAnimation(
			map, container, width, height, FLY_TO_DURATION + HOLD,
			() => {
				map.flyTo({
					center: [location.lng, location.lat],
					zoom: CLOSE_ZOOM,
					duration: FLY_TO_DURATION,
					essential: true
				});
			},
			(ctx, elapsed) => {
				if (elapsed >= FLY_TO_DURATION) {
					const point = map.project([location.lng, location.lat]);
					// Pin is just a dot (showLabel=false) since the title bar shows the name
					drawPinOnCanvas(ctx, point.x, point.y, displayName, titleColor, ff, location.rating, false);
					drawLocationTitleOnCanvas(ctx, displayName, width, titleColor, ff, location.rating, secondaryColor);
				}
			}
		);

		destroyMap(map, container);
		return blob;
	}

	// Subsequent location: zoom out from prev, then zoom into new
	console.log(`[MapRenderer] renderFlyTo (transition): "${prevLocation.name}" → "${location.name}"`);
	const { map, container } = await createOffscreenMap(
		width, height, [prevLocation.lng, prevLocation.lat], CLOSE_ZOOM, mapStyle
	);

	// Calculate overview zoom that fits both locations
	const bounds = new maplibregl.LngLatBounds();
	bounds.extend([prevLocation.lng, prevLocation.lat]);
	bounds.extend([location.lng, location.lat]);
	const padding = Math.min(width, height) * 0.2;
	const cam = map.cameraForBounds(bounds, { padding });
	// Always zoom out at least 2 levels from close-up, never below zoom 2
	const overviewZoom = Math.max(2, Math.min(cam?.zoom ?? 8, CLOSE_ZOOM - 2));
	const boundsCenter = bounds.getCenter();
	const overviewCenter: [number, number] = [boundsCenter.lng, boundsCenter.lat];

	// Phase timing
	const ZOOM_OUT_MS = 1500;
	const PAUSE_MS = 1200;
	const ZOOM_IN_MS = 2000;
	const HOLD_MS = 2000;
	const zoomInAt = ZOOM_OUT_MS + PAUSE_MS;
	const overlayAt = zoomInAt + ZOOM_IN_MS;
	const totalMs = overlayAt + HOLD_MS;

	console.log(`[MapRenderer] Overview zoom: ${overviewZoom.toFixed(1)}, phases: out=${ZOOM_OUT_MS} pause=${PAUSE_MS} in=${ZOOM_IN_MS} hold=${HOLD_MS}`);

	const blob = await recordMapAnimation(
		map, container, width, height, totalMs,
		() => {
			// Phase 1: Zoom out to overview showing both locations
			map.flyTo({
				center: overviewCenter,
				zoom: overviewZoom,
				duration: ZOOM_OUT_MS,
				essential: true
			});
			// Phase 2: After pause, zoom into new location
			setTimeout(() => {
				map.flyTo({
					center: [location.lng, location.lat],
					zoom: CLOSE_ZOOM,
					duration: ZOOM_IN_MS,
					essential: true
				});
			}, zoomInAt);
		},
		(ctx, elapsed) => {
			// Show previous location as plain dot while zoomed in (first 400ms)
			if (elapsed < 400) {
				const prevPoint = map.project([prevLocation.lng, prevLocation.lat]);
				if (prevPoint.x > -50 && prevPoint.x < width + 50 && prevPoint.y > -50 && prevPoint.y < height + 50) {
					drawPinOnCanvas(ctx, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
				}
			}
			// After zoom-in completes, show new location overlays
			if (elapsed >= overlayAt) {
				const point = map.project([location.lng, location.lat]);
				// Pin is just a dot (showLabel=false) since the title bar shows the name
				drawPinOnCanvas(ctx, point.x, point.y, displayName, titleColor, ff, location.rating, false);
				drawLocationTitleOnCanvas(ctx, displayName, width, titleColor, ff, location.rating, secondaryColor);
				if (transportMode) {
					drawTransportBadgeOnCanvas(ctx, transportMode, width, height, titleColor, ff, secondaryColor);
				}
			}
		}
	);

	destroyMap(map, container);
	return blob;
}

/** Render the final route map with animated route lines */
export async function renderFinalRoute(
	locations: Location[],
	stats: { stops: number; miles: number; minutes: number },
	aspectRatio: AspectRatio,
	routeGeometries?: ({ coordinates: [number, number][] } | null)[],
	mapStyle: MapStyle = 'streets',
	titleColor: string = '#FFFFFF',
	fontId: string = 'inter',
	secondaryColor: string = '#0a0f1e'
): Promise<Blob> {
	const { width, height } = getResolution(aspectRatio);
	const ff = fontFamily(fontId);
	await loadFont(fontId);

	if (locations.length === 0) throw new Error('No locations for final route');

	const bounds = new maplibregl.LngLatBounds();
	for (const loc of locations) {
		bounds.extend([loc.lng, loc.lat]);
	}
	// Extend bounds to include all route geometry points
	if (routeGeometries) {
		for (const geom of routeGeometries) {
			if (geom) {
				for (const coord of geom.coordinates) {
					bounds.extend(coord);
				}
			}
		}
	}

	const center = bounds.getCenter();
	console.log(`[MapRenderer] renderFinalRoute: ${locations.length} locations, bounds center: [${center.lng}, ${center.lat}]`);
	const { map, container } = await createOffscreenMap(width, height, [center.lng, center.lat], 2, mapStyle);

	// Fit to bounds with asymmetric padding — extra at bottom for stats bar, top for pin labels
	const pad = Math.min(width, height) * 0.14;
	const topPad = pad + 100; // room for pin labels above top pin
	const bottomPad = pad + Math.round(height * 0.20); // room for stats bar
	map.fitBounds(bounds, { padding: { top: topPad, bottom: bottomPad, left: pad, right: pad }, duration: 0 });
	await sleep(500);

	// Animate drawing route lines sequentially
	const totalSegments = locations.length - 1;
	const segmentDuration = totalSegments > 0 ? 2000 / totalSegments : 0;

	const blob = await recordMapAnimation(
		map, container, width, height, FINAL_MAP_DURATION,
		() => {
			// Draw each route segment with delay (these are map layers, rendered on the canvas)
			for (let i = 0; i < totalSegments; i++) {
				setTimeout(() => {
					const from = locations[i];
					const to = locations[i + 1];
					const mode = to.transportMode ?? 'drove';
					const geom = routeGeometries?.[i];
					addRouteLine(map, from, to, mode, `route-${i}`, geom?.coordinates, titleColor);
				}, i * segmentDuration);
			}
		},
		(ctx, elapsed) => {
			// Draw all pins with labels on canvas every frame (final route shows labels)
			for (const loc of locations) {
				const point = map.project([loc.lng, loc.lat]);
				const label = loc.label || loc.name.split(',')[0];
				drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
			}
			// Stats visible the entire time
			drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
		}
	);

	destroyMap(map, container);
	return blob;
}

// ─── Canvas-based overlay drawing functions ───
// These draw directly onto the output canvas so they appear in the recorded video.
// All accept a `accentColor` param derived from the user's chosen titleColor.

/** Helper: draw a rounded rectangle path */
function canvasRoundRect(
	ctx: CanvasRenderingContext2D,
	x: number, y: number, w: number, h: number, r: number
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Compute perceived luminance (0–1) of a hex color */
function luminance(hex: string): number {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Return white or near-black text color that contrasts with the given background */
function contrastTextColor(hex: string): string {
	return luminance(hex) > 0.5 ? '#0a0f1e' : '#FFFFFF';
}

/** Draw a 5-point star path centered at (cx, cy) with given outer radius */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number) {
	const innerR = outerR * 0.4;
	const spikes = 5;
	ctx.beginPath();
	for (let i = 0; i < spikes * 2; i++) {
		const r = i % 2 === 0 ? outerR : innerR;
		const angle = (Math.PI / 2) * -1 + (Math.PI / spikes) * i;
		const px = cx + Math.cos(angle) * r;
		const py = cy + Math.sin(angle) * r;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

/** Draw a map pin on the canvas.
 *  When showLabel is true (default, used in final route), draws label pill + rating above the pin.
 *  When showLabel is false (used during fly-to with title bar), draws only the colored dot. */
function drawPinOnCanvas(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	label: string,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	rating: number | null = null,
	showLabel: boolean = true,
	bgColor: string = 'rgba(10, 15, 30, 0.88)'
) {
	ctx.save();

	// Pin dot: outer glow + colored fill
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 4;

	// Outer ring
	ctx.beginPath();
	ctx.arc(x, y, 22, 0, Math.PI * 2);
	ctx.fillStyle = 'white';
	ctx.fill();
	ctx.shadowColor = 'transparent';

	// Inner colored dot using accent color
	ctx.beginPath();
	ctx.arc(x, y, 17, 0, Math.PI * 2);
	ctx.fillStyle = accentColor;
	ctx.fill();

	// Inner white dot for depth
	ctx.beginPath();
	ctx.arc(x, y, 6, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.7)';
	ctx.fill();

	if (showLabel) {
		const textColor = contrastTextColor(bgColor.startsWith('rgba') ? '#0a0f1e' : bgColor);

		// Label above pin — pill-shaped background
		const fontSize = 30;
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const metrics = ctx.measureText(label);
		const padX = 20, padY = 12;
		const bgW = metrics.width + padX * 2;
		const bgH = fontSize + padY * 2;
		const bgX = x - bgW / 2;
		const bgY = y - 38 - bgH;

		// Background pill
		ctx.shadowColor = 'rgba(0,0,0,0.4)';
		ctx.shadowBlur = 14;
		ctx.shadowOffsetY = 4;
		ctx.fillStyle = bgColor;
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
		ctx.fill();

		// Accent-colored border
		ctx.shadowColor = 'transparent';
		ctx.strokeStyle = hexToRgba(accentColor, 0.6);
		ctx.lineWidth = 2;
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
		ctx.stroke();

		// Label text
		ctx.fillStyle = textColor;
		ctx.fillText(label, x, bgY + bgH / 2);
	}

	ctx.restore();
}

/** Draw a large prominent location title at the top of the canvas (during fly-to) */
function drawLocationTitleOnCanvas(
	ctx: CanvasRenderingContext2D,
	text: string,
	width: number,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	rating: number | null = null,
	secondaryColor: string = '#0a0f1e'
) {
	ctx.save();
	const fontSize = width > 1200 ? 56 : 46;
	ctx.font = `800 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 44, padY = 20;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const topOffset = width > 1200 ? 80 : 60;
	const bgX = width / 2 - bgW / 2;

	const textColor = contrastTextColor(secondaryColor);

	// Secondary color background with stronger shadow
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 20;
	ctx.shadowOffsetY = 6;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.92);
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 14);
	ctx.fill();

	// Accent-colored bottom border line
	ctx.shadowColor = 'transparent';
	const lineY = topOffset + bgH - 3;
	ctx.fillStyle = hexToRgba(accentColor, 0.8);
	canvasRoundRect(ctx, bgX + 8, lineY, bgW - 16, 3, 1.5);
	ctx.fill();

	// Title text with contrast color
	ctx.fillStyle = textColor;
	ctx.fillText(text, width / 2, topOffset + bgH / 2);

	// Star rating below the title bar
	if (rating && rating > 0) {
		const starSize = 16;
		const starGap = 6;
		const totalStarsW = 5 * (starSize * 2) + 4 * starGap;
		const starsY = topOffset + bgH + 20 + starSize;

		// Secondary color pill behind stars
		const pillW = totalStarsW + 24;
		const pillH = starSize * 2 + 14;
		const pillX = width / 2 - pillW / 2;
		const pillY = starsY - starSize - 7;
		ctx.fillStyle = hexToRgba(secondaryColor, 0.88);
		canvasRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
		ctx.fill();

		const starsX = width / 2 - totalStarsW / 2;
		for (let i = 0; i < 5; i++) {
			const cx = starsX + starSize + i * (starSize * 2 + starGap);
			drawStar(ctx, cx, starsY, starSize);
			ctx.fillStyle = i < rating ? '#FBBF24' : 'rgba(255,255,255,0.2)';
			ctx.fill();
		}
	}

	ctx.restore();
}

/** Draw a transport mode badge on the canvas */
function drawTransportBadgeOnCanvas(
	ctx: CanvasRenderingContext2D,
	mode: TransportMode,
	width: number,
	height: number,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	secondaryColor: string = '#0a0f1e'
) {
	const info = TRANSPORT_ICONS[mode];
	const text = `${info.icon} ${info.label}`;
	const textColor = contrastTextColor(secondaryColor);

	ctx.save();
	const fontSize = 32;
	ctx.font = `700 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 28, padY = 14;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const bgX = width / 2 - bgW / 2;
	const bgY = height - height * 0.12 - bgH;

	// Secondary color background
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 12;
	ctx.shadowOffsetY = 3;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.92);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
	ctx.fill();

	// Accent border
	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = hexToRgba(accentColor, 0.4);
	ctx.lineWidth = 1.5;
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
	ctx.stroke();

	ctx.fillStyle = textColor;
	ctx.fillText(text, width / 2, bgY + bgH / 2);

	ctx.restore();
}

/** Draw stats bar on the canvas — large, high-contrast, clearly visible */
function drawStatsOnCanvas(
	ctx: CanvasRenderingContext2D,
	stats: { stops: number; miles: number; minutes: number },
	width: number,
	height: number,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	secondaryColor: string = '#0a0f1e'
) {
	const milesStr = stats.miles < 10 ? stats.miles.toFixed(1) : Math.round(stats.miles).toString();
	const minsStr = Math.round(stats.minutes).toString();
	const text = `${stats.stops} stops \u00B7 ${milesStr} mi \u00B7 ~${minsStr} min`;
	const textColor = contrastTextColor(secondaryColor);

	ctx.save();
	const fontSize = width > 1200 ? 44 : 36;
	ctx.font = `700 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 44, padY = 22;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const bgX = width / 2 - bgW / 2;
	// Position well above the bottom edge so it's not hidden by video controls
	const bgY = Math.round(height * 0.87 - bgH);

	// Secondary color background for max contrast
	ctx.shadowColor = 'rgba(0,0,0,0.6)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.95);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 14);
	ctx.fill();

	// Accent-colored top border line
	ctx.shadowColor = 'transparent';
	ctx.fillStyle = hexToRgba(accentColor, 0.7);
	canvasRoundRect(ctx, bgX + 8, bgY, bgW - 16, 3, 1.5);
	ctx.fill();

	// Subtle outer border
	ctx.strokeStyle = hexToRgba(contrastTextColor(secondaryColor), 0.1);
	ctx.lineWidth = 1;
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 14);
	ctx.stroke();

	ctx.fillStyle = textColor;
	ctx.fillText(text, width / 2, bgY + bgH / 2);

	ctx.restore();
}

/** Add a route line segment between two locations, using real route geometry if available */
function addRouteLine(
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
			geometry: {
				type: 'LineString',
				coordinates
			}
		}
	});

	// Dark outline layer for contrast on any map style
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

	// Accent-colored route line on top
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

/** Word-wrap text into lines that fit within maxWidth */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';
	for (const word of words) {
		const testLine = currentLine ? `${currentLine} ${word}` : word;
		if (ctx.measureText(testLine).width > maxWidth && currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = testLine;
		}
	}
	if (currentLine) lines.push(currentLine);
	return lines;
}

/** Load an image from a File */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
		img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
		img.src = url;
	});
}

/** Load an image from a URL (for logos) */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load image from URL'));
		img.src = url;
	});
}

/** Draw an image cover-fitted onto a canvas context */
function drawCoverFit(ctx: CanvasRenderingContext2D, source: HTMLImageElement, width: number, height: number) {
	const srcW = source.naturalWidth;
	const srcH = source.naturalHeight;
	const scale = Math.max(width / srcW, height / srcH);
	const drawW = srcW * scale;
	const drawH = srcH * scale;
	const dx = (width - drawW) / 2;
	const dy = (height - drawH) / 2;
	ctx.drawImage(source, dx, dy, drawW, drawH);
}

export interface TitleCardOpts {
	title: string;
	titleColor: string;
	aspectRatio: AspectRatio;
	description?: string;
	mediaFile?: File | null;
	logoUrl?: string | null;
	showLogo?: boolean;
	durationSec?: number;
	fontId?: string;
	secondaryColor?: string;
}

/** Render a title card: trip title over photo background or dark gradient, with optional logo watermark */
export async function renderTitleCard(opts: TitleCardOpts): Promise<Blob> {
	const { title, titleColor, aspectRatio, description, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const mimeType = getSupportedMimeType();
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	// Pre-compute word-wrapped title lines
	const fontSize = Math.round(width * 0.06);
	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);

	// Pre-compute description lines
	const descFontSize = Math.round(fontSize * 0.6);
	let descLines: string[] = [];
	if (description) {
		ctx.font = `400 ${descFontSize}px ${ff}`;
		descLines = wrapText(ctx, description, maxWidth);
	}

	const titleLineHeight = fontSize * 1.3;
	const descLineHeight = descFontSize * 1.4;
	const totalTitleHeight = titleLines.length * titleLineHeight;
	const descGap = description ? fontSize * 0.5 : 0;
	const totalDescHeight = descLines.length * descLineHeight;
	const totalBlockHeight = totalTitleHeight + descGap + totalDescHeight;
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	// Load cover photo if present
	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) {
		bgImage = await loadImageFromFile(mediaFile);
	}

	// Load logo if requested
	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			console.warn('[MapRenderer] Failed to load logo, skipping watermark');
		}
	}

	const durationSec = opts.durationSec ?? 2.5;
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const secTextColor = contrastTextColor(secColor);

	function drawTextOverlay() {
		ctx.save();

		// Draw secondary color background pill behind the entire text block
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);

		// Measure widest line for background width
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) {
			maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) {
				maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
			}
		}

		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		// Semi-transparent secondary color background
		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		// Title text
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = secTextColor;
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = secTextColor;
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = secTextColor;
			ctx.globalAlpha = 0.4;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(width * 0.35, lineY);
			ctx.lineTo(width * 0.65, lineY);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.07);
		const margin = Math.round(width * 0.04);
		// Maintain aspect ratio
		const scale = Math.min(logoSize / logoImage.naturalWidth, logoSize / logoImage.naturalHeight);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;

		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawTextOverlay();
		drawLogo();
	}

	// Record with rAF loop for reliable frame capture
	const stream = canvas.captureStream(TARGET_FPS);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	recorder.start();
	const durationMs = durationSec * 1000;
	const startTime = performance.now();
	await new Promise<void>((resolve) => {
		const frame = () => {
			if (performance.now() - startTime >= durationMs) { resolve(); return; }
			drawFrame();
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame(); // final frame
	await sleep(100);
	recorder.stop();
	stream.getTracks().forEach((t) => t.stop());

	console.log('[MapRenderer] Title card rendered');
	return done;
}

// ─── Direct-draw functions for single-pass recording ───
// These draw directly to a provided master canvas context,
// without creating internal MediaRecorder sessions.

type FrameCallback = (ctx: CanvasRenderingContext2D) => void;

/** Draw a title card directly to a provided canvas context for the given duration.
 *  Draws background, text overlay, and logo each frame via rAF loop. */
export async function drawTitleCardToCanvas(
	ctx: CanvasRenderingContext2D,
	opts: TitleCardOpts,
	frameCallback?: FrameCallback
): Promise<void> {
	const { title, titleColor, aspectRatio, description, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	// Pre-compute word-wrapped title lines
	const fontSize = Math.round(width * 0.06);
	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);

	// Pre-compute description lines
	const descFontSize = Math.round(fontSize * 0.6);
	let descLines: string[] = [];
	if (description) {
		ctx.font = `400 ${descFontSize}px ${ff}`;
		descLines = wrapText(ctx, description, maxWidth);
	}

	const titleLineHeight = fontSize * 1.3;
	const descLineHeight = descFontSize * 1.4;
	const totalTitleHeight = titleLines.length * titleLineHeight;
	const descGap = description ? fontSize * 0.5 : 0;
	const totalDescHeight = descLines.length * descLineHeight;
	const totalBlockHeight = totalTitleHeight + descGap + totalDescHeight;
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	// Load cover photo if present
	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) {
		bgImage = await loadImageFromFile(mediaFile);
	}

	// Load logo if requested
	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			console.warn('[MapRenderer] Failed to load logo, skipping watermark');
		}
	}

	const durationSec = opts.durationSec ?? 2.5;
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const secTextColor = contrastTextColor(secColor);

	function drawTextOverlay() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);

		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) {
			maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) {
				maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
			}
		}

		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = secTextColor;
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = secTextColor;
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = secTextColor;
			ctx.globalAlpha = 0.4;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(width * 0.35, lineY);
			ctx.lineTo(width * 0.65, lineY);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.07);
		const margin = Math.round(width * 0.04);
		const scale = Math.min(logoSize / logoImage.naturalWidth, logoSize / logoImage.naturalHeight);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawTextOverlay();
		drawLogo();
		frameCallback?.(ctx);
	}

	const durationMs = durationSec * 1000;
	const startTime = performance.now();
	await new Promise<void>((resolve) => {
		const frame = () => {
			if (performance.now() - startTime >= durationMs) { resolve(); return; }
			drawFrame();
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame(); // final frame

	console.log('[MapRenderer] Title card drawn to canvas');
}

/** Draw a fly-to animation directly to a provided canvas context using a reusable map.
 *  For the first location (prevLocation=null): map should already be at zoom 10 on the location.
 *  For subsequent locations: map should be at CLOSE_ZOOM on prevLocation. */
export async function drawFlyToToCanvas(
	map: maplibregl.Map,
	ctx: CanvasRenderingContext2D,
	location: Location,
	prevLocation: Location | null,
	transportMode: TransportMode | null,
	width: number,
	height: number,
	titleColor: string = '#FFFFFF',
	fontId: string = 'inter',
	secondaryColor: string = '#0a0f1e',
	frameCallback?: FrameCallback
): Promise<void> {
	const displayName = location.label || location.name.split(',')[0];
	const ff = fontFamily(fontId);
	await loadFont(fontId);

	const mapCanvas = map.getCanvas();

	function drawMapFrame(elapsed: number, overlayFn: (ctx: CanvasRenderingContext2D, elapsed: number) => void) {
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(mapCanvas, 0, 0, width, height);
		overlayFn(ctx, elapsed);
		frameCallback?.(ctx);
	}

	if (!prevLocation) {
		// First location: fly in from zoom 10 → CLOSE_ZOOM
		console.log(`[MapRenderer] drawFlyToToCanvas (first): "${location.name}"`);
		const HOLD = 2000;
		const totalMs = FLY_TO_DURATION + HOLD;

		map.flyTo({
			center: [location.lng, location.lat],
			zoom: CLOSE_ZOOM,
			duration: FLY_TO_DURATION,
			essential: true
		});

		const startTime = performance.now();
		await new Promise<void>((resolve) => {
			const frame = () => {
				const elapsed = performance.now() - startTime;
				if (elapsed >= totalMs) { resolve(); return; }
				drawMapFrame(elapsed, (ctx2, el) => {
					if (el >= FLY_TO_DURATION) {
						const point = map.project([location.lng, location.lat]);
						drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
						drawLocationTitleOnCanvas(ctx2, displayName, width, titleColor, ff, location.rating, secondaryColor);
					}
				});
				requestAnimationFrame(frame);
			};
			frame();
		});
		// Draw final frame
		drawMapFrame(totalMs, (ctx2) => {
			const point = map.project([location.lng, location.lat]);
			drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
			drawLocationTitleOnCanvas(ctx2, displayName, width, titleColor, ff, location.rating, secondaryColor);
		});
		return;
	}

	// Subsequent location: zoom out from prev → overview → zoom into new
	console.log(`[MapRenderer] drawFlyToToCanvas (transition): "${prevLocation.name}" → "${location.name}"`);

	const bounds = new maplibregl.LngLatBounds();
	bounds.extend([prevLocation.lng, prevLocation.lat]);
	bounds.extend([location.lng, location.lat]);
	const padding = Math.min(width, height) * 0.2;
	const cam = map.cameraForBounds(bounds, { padding });
	const overviewZoom = Math.max(2, Math.min(cam?.zoom ?? 8, CLOSE_ZOOM - 2));
	const boundsCenter = bounds.getCenter();
	const overviewCenter: [number, number] = [boundsCenter.lng, boundsCenter.lat];

	const ZOOM_OUT_MS = 1500;
	const PAUSE_MS = 1200;
	const ZOOM_IN_MS = 2000;
	const HOLD_MS = 2000;
	const zoomInAt = ZOOM_OUT_MS + PAUSE_MS;
	const overlayAt = zoomInAt + ZOOM_IN_MS;
	const totalMs = overlayAt + HOLD_MS;

	console.log(`[MapRenderer] Overview zoom: ${overviewZoom.toFixed(1)}, phases: out=${ZOOM_OUT_MS} pause=${PAUSE_MS} in=${ZOOM_IN_MS} hold=${HOLD_MS}`);

	// Start phase 1: zoom out
	map.flyTo({
		center: overviewCenter,
		zoom: overviewZoom,
		duration: ZOOM_OUT_MS,
		essential: true
	});
	// Schedule phase 2: zoom in
	setTimeout(() => {
		map.flyTo({
			center: [location.lng, location.lat],
			zoom: CLOSE_ZOOM,
			duration: ZOOM_IN_MS,
			essential: true
		});
	}, zoomInAt);

	const startTime = performance.now();
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime;
			if (elapsed >= totalMs) { resolve(); return; }
			drawMapFrame(elapsed, (ctx2, el) => {
				if (el < 400) {
					const prevPoint = map.project([prevLocation.lng, prevLocation.lat]);
					if (prevPoint.x > -50 && prevPoint.x < width + 50 && prevPoint.y > -50 && prevPoint.y < height + 50) {
						drawPinOnCanvas(ctx2, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
					}
				}
				if (el >= overlayAt) {
					const point = map.project([location.lng, location.lat]);
					drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
					drawLocationTitleOnCanvas(ctx2, displayName, width, titleColor, ff, location.rating, secondaryColor);
					if (transportMode) {
						drawTransportBadgeOnCanvas(ctx2, transportMode, width, height, titleColor, ff, secondaryColor);
					}
				}
			});
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Draw final frame
	drawMapFrame(totalMs, (ctx2) => {
		const point = map.project([location.lng, location.lat]);
		drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
		drawLocationTitleOnCanvas(ctx2, displayName, width, titleColor, ff, location.rating, secondaryColor);
		if (transportMode) {
			drawTransportBadgeOnCanvas(ctx2, transportMode, width, height, titleColor, ff, secondaryColor);
		}
	});
}

/** Draw the final route map animation directly to a provided canvas context using a reusable map.
 *  The map should already be positioned (fitBounds + idle) before calling this. */
export async function drawFinalRouteToCanvas(
	map: maplibregl.Map,
	ctx: CanvasRenderingContext2D,
	locations: Location[],
	stats: { stops: number; miles: number; minutes: number },
	width: number,
	height: number,
	routeGeometries: ({ coordinates: [number, number][] } | null)[] | undefined,
	titleColor: string = '#FFFFFF',
	fontId: string = 'inter',
	secondaryColor: string = '#0a0f1e',
	frameCallback?: FrameCallback
): Promise<void> {
	if (locations.length === 0) throw new Error('No locations for final route');

	const ff = fontFamily(fontId);
	await loadFont(fontId);

	const mapCanvas = map.getCanvas();
	const totalSegments = locations.length - 1;
	const segmentDuration = totalSegments > 0 ? 2000 / totalSegments : 0;

	// Start adding route line segments with staggered timing
	for (let i = 0; i < totalSegments; i++) {
		setTimeout(() => {
			const from = locations[i];
			const to = locations[i + 1];
			const mode = to.transportMode ?? 'drove';
			const geom = routeGeometries?.[i];
			addRouteLine(map, from, to, mode, `route-${i}`, geom?.coordinates, titleColor);
		}, i * segmentDuration);
	}

	const startTime = performance.now();
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime;
			if (elapsed >= FINAL_MAP_DURATION) { resolve(); return; }
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			// Draw pins with labels
			for (const loc of locations) {
				const point = map.project([loc.lng, loc.lat]);
				const label = loc.label || loc.name.split(',')[0];
				drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
			}
			drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
			frameCallback?.(ctx);
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Draw final frame
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	for (const loc of locations) {
		const point = map.project([loc.lng, loc.lat]);
		const label = loc.label || loc.name.split(',')[0];
		drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
	}
	drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
	frameCallback?.(ctx);

	console.log('[MapRenderer] Final route drawn to canvas');
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
