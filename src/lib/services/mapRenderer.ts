import maplibregl from 'maplibre-gl';
import type { Location, TransportMode, AspectRatio, MapStyle } from '$lib/types';
import type { PauseClock } from './exportGuard';
import { getSupportedMimeType } from '$lib/utils/browserCompat';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import { STYLE_URLS } from '$lib/constants/map';

const TARGET_FPS = 30;

// ── Shared timing constants (used by all fly-to / route functions) ──
const FLY_TO_DURATION = 1500; // first-location fly-in duration
const FIRST_HOLD_MS = 1700; // hold after first fly-in
const ZOOM_OUT_MS = 1000; // subsequent: zoom out to overview
const PAUSE_MS = 400; // subsequent: pause at overview
const ZOOM_IN_MS = 1500; // subsequent: zoom in to new location
const HOLD_MS = 1200; // subsequent: hold on new location
const FINAL_MAP_DURATION = 4500;

// Derived timing helpers
const FIRST_TOTAL_MS = FLY_TO_DURATION + FIRST_HOLD_MS; // 3200ms
const ZOOM_IN_AT = ZOOM_OUT_MS + PAUSE_MS; // 1400ms
const OVERLAY_AT = ZOOM_IN_AT + ZOOM_IN_MS; // 2900ms
const SUBSEQUENT_TOTAL_MS = OVERLAY_AT + HOLD_MS; // 4100ms

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
		// If the map is already fully loaded and idle, resolve immediately
		if (map.loaded() && !map.isMoving()) {
			console.log('[MapRenderer] waitForIdle: map already idle, resolving immediately');
			resolve();
			return;
		}

		const start = performance.now();
		const timeout = setTimeout(() => {
			console.log(`[MapRenderer] waitForIdle: timeout after ${timeoutMs}ms (tiles may still be loading)`);
			resolve();
		}, timeoutMs);
		map.once('idle', () => {
			clearTimeout(timeout);
			console.log(`[MapRenderer] waitForIdle: idle event fired after ${((performance.now() - start) / 1000).toFixed(1)}s`);
			resolve();
		});
	});
}

/** Pre-warm the tile cache by jumping to each location's viewport so tiles
 *  are already loaded when encoding starts. Bounded by a per-position timeout. */
export async function preWarmTileCache(
	map: maplibregl.Map,
	locations: Location[],
	onProgress?: (msg: string) => void
): Promise<void> {
	const start = performance.now();
	onProgress?.('Preparing map tiles...');
	const PER_TIMEOUT = 3000;

	for (const loc of locations) {
		// Close zoom (same as fly-to destination)
		map.jumpTo({ center: [loc.lng, loc.lat], zoom: CLOSE_ZOOM });
		await waitForIdle(map, PER_TIMEOUT);

		// Overview zoom (tiles needed during zoom-out phase)
		map.jumpTo({ center: [loc.lng, loc.lat], zoom: 8 });
		await waitForIdle(map, PER_TIMEOUT);
	}

	// Pre-warm the final route fitBounds viewport
	if (locations.length >= 2) {
		const bounds = new maplibregl.LngLatBounds();
		for (const loc of locations) bounds.extend([loc.lng, loc.lat]);
		const center = bounds.getCenter();
		map.jumpTo({ center: [center.lng, center.lat], zoom: 4 });
		await waitForIdle(map, PER_TIMEOUT);
	}

	// Reset to first location
	const first = locations[0];
	map.jumpTo({ center: [first.lng, first.lat], zoom: 10 });
	await waitForIdle(map, PER_TIMEOUT);

	console.log(`[MapRenderer] preWarmTileCache: ${locations.length} locations warmed in ${((performance.now() - start) / 1000).toFixed(1)}s`);
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
	secondaryColor: string = '#0a0f1e',
	locationIndex: number = 0,
	totalLocations: number = 1
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

		const blob = await recordMapAnimation(
			map, container, width, height, FIRST_TOTAL_MS,
			() => {
				map.flyTo({
					center: [location.lng, location.lat],
					zoom: CLOSE_ZOOM,
					duration: FLY_TO_DURATION,
					essential: true
				});
			},
			(ctx, elapsed) => {
				drawVignette(ctx, width, height);
				if (elapsed >= FLY_TO_DURATION) {
					const fadeAlpha = Math.min(1, (elapsed - FLY_TO_DURATION) / 400);
					ctx.globalAlpha = fadeAlpha;
					const point = map.project([location.lng, location.lat]);
					drawPinOnCanvas(ctx, point.x, point.y, displayName, titleColor, ff, location.rating, false);
					drawLocationLowerThird(ctx, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, null, secondaryColor);
					ctx.globalAlpha = 1;
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

	console.log(`[MapRenderer] Overview zoom: ${overviewZoom.toFixed(1)}, phases: out=${ZOOM_OUT_MS} pause=${PAUSE_MS} in=${ZOOM_IN_MS} hold=${HOLD_MS}`);

	const blob = await recordMapAnimation(
		map, container, width, height, SUBSEQUENT_TOTAL_MS,
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
			}, ZOOM_IN_AT);
		},
		(ctx, elapsed) => {
			drawVignette(ctx, width, height);
			if (elapsed < 500) {
				const pinAlpha = Math.max(0, 1 - elapsed / 500);
				ctx.globalAlpha = pinAlpha;
				const prevPoint = map.project([prevLocation.lng, prevLocation.lat]);
				if (prevPoint.x > -50 && prevPoint.x < width + 50 && prevPoint.y > -50 && prevPoint.y < height + 50) {
					drawPinOnCanvas(ctx, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
				}
				ctx.globalAlpha = 1;
			}
			if (elapsed >= OVERLAY_AT) {
				const fadeAlpha = Math.min(1, (elapsed - OVERLAY_AT) / 400);
				ctx.globalAlpha = fadeAlpha;
				const point = map.project([location.lng, location.lat]);
				drawPinOnCanvas(ctx, point.x, point.y, displayName, titleColor, ff, location.rating, false);
				drawLocationLowerThird(ctx, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, transportMode, secondaryColor);
				ctx.globalAlpha = 1;
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
			drawVignette(ctx, width, height, 0.7);
			for (const loc of locations) {
				const point = map.project([loc.lng, loc.lat]);
				const label = loc.label || loc.name.split(',')[0];
				drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
			}
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
		// Use accent color for text to match title card styling
		const textColor = accentColor;

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
		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(label, x, bgY + bgH / 2);
	}

	ctx.restore();
}

/** Draw a cinematic gradient vignette over the map frame */
function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number = 1) {
	// Top gradient: subtle darkening
	const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.18);
	topGrad.addColorStop(0, `rgba(0, 0, 0, ${0.3 * intensity})`);
	topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = topGrad;
	ctx.fillRect(0, 0, width, height * 0.18);

	// Bottom gradient: stronger for lower-third readability
	const botGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
	botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
	botGrad.addColorStop(0.45, `rgba(0, 0, 0, ${0.25 * intensity})`);
	botGrad.addColorStop(1, `rgba(0, 0, 0, ${0.65 * intensity})`);
	ctx.fillStyle = botGrad;
	ctx.fillRect(0, height * 0.5, width, height * 0.5);
}

/** Draw a cinematic lower-third location card with counter, name, rating, and transport */
function drawLocationLowerThird(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	name: string,
	locationIndex: number,
	totalLocations: number,
	accentColor: string,
	ff: string,
	rating: number | null,
	transportMode: TransportMode | null | undefined,
	secondaryColor: string
) {
	ctx.save();

	// Font sizes proportional to canvas width
	const nameFontSize = Math.round(width * 0.044);
	const counterFontSize = Math.round(width * 0.02);
	const transportFontSize = Math.round(width * 0.022);
	const starRadius = Math.round(width * 0.011);
	const maxTextW = width * 0.82;

	// --- Measure all elements ---

	// Name (wrap to max 2 lines)
	ctx.font = `700 ${nameFontSize}px ${ff}`;
	let nameLines = wrapText(ctx, name, maxTextW);
	if (nameLines.length > 2) {
		nameLines.length = 2;
		let last = nameLines[1];
		while (last.length > 1 && ctx.measureText(last + '...').width > maxTextW) {
			last = last.slice(0, -1);
		}
		nameLines[1] = last.trimEnd() + '...';
	}
	const nameLineH = nameFontSize * 1.2;
	const totalNameH = nameLines.length * nameLineH;

	// Counter
	ctx.font = `600 ${counterFontSize}px ${ff}`;
	const counterText = `${locationIndex + 1} of ${totalLocations}`;
	const counterMetrics = ctx.measureText(counterText);
	const counterPadX = Math.round(counterFontSize * 0.8);
	const counterPadY = Math.round(counterFontSize * 0.3);
	const counterPillW = counterMetrics.width + counterPadX * 2;
	const counterPillH = counterFontSize + counterPadY * 2;

	// Stars
	const hasRating = rating !== null && rating > 0;
	const starGap = Math.round(starRadius * 0.4);
	const starsRowH = hasRating ? starRadius * 2 : 0;

	// Transport
	const hasTransport = !!transportMode;

	// --- Vertical layout ---
	const gap = Math.round(height * 0.007);
	const gapLarge = Math.round(height * 0.01);

	let blockH = counterPillH + gapLarge + totalNameH;
	if (hasRating) blockH += gap + starsRowH;
	if (hasTransport) blockH += gap + transportFontSize;

	// Center block around height * 0.80
	const centerY = height * 0.80;
	let curY = centerY - blockH / 2;

	// --- Backdrop pill behind entire text block for readability ---
	const backdropPadX = Math.round(width * 0.05);
	const backdropPadY = Math.round(height * 0.012);
	ctx.font = `700 ${nameFontSize}px ${ff}`;
	let maxContentW = 0;
	for (const line of nameLines) maxContentW = Math.max(maxContentW, ctx.measureText(line).width);
	maxContentW = Math.max(maxContentW, counterPillW);
	const backdropW = maxContentW + backdropPadX * 2;
	const backdropH = blockH + backdropPadY * 2;
	const backdropX = width / 2 - backdropW / 2;
	const backdropY = curY - backdropPadY;

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 20;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.7);
	canvasRoundRect(ctx, backdropX, backdropY, backdropW, backdropH, 18);
	ctx.fill();
	ctx.shadowColor = 'transparent';

	// Accent-colored left stripe
	ctx.fillStyle = hexToRgba(accentColor, 0.85);
	canvasRoundRect(ctx, backdropX, backdropY, 4, backdropH, 2);
	ctx.fill();

	// --- Draw counter pill (accent-filled) ---
	const counterCY = curY + counterPillH / 2;
	const counterPillX = width / 2 - counterPillW / 2;

	ctx.fillStyle = hexToRgba(accentColor, 0.9);
	canvasRoundRect(ctx, counterPillX - 8, counterCY - counterPillH / 2, counterPillW + 16, counterPillH, counterPillH / 2);
	ctx.fill();

	ctx.font = `600 ${counterFontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#FFFFFF';
	ctx.fillText(counterText, width / 2, counterCY);
	curY += counterPillH + gapLarge;

	// --- Draw location name ---
	ctx.font = `700 ${nameFontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#FFFFFF';
	for (let i = 0; i < nameLines.length; i++) {
		ctx.fillText(nameLines[i], width / 2, curY + nameLineH / 2 + i * nameLineH);
	}
	curY += totalNameH;

	// --- Draw stars ---
	if (hasRating) {
		curY += gap;
		const starsCY = curY + starRadius;
		const totalStarsW = 5 * (starRadius * 2) + 4 * starGap;
		const starsX = width / 2 - totalStarsW / 2;

		for (let i = 0; i < 5; i++) {
			const cx = starsX + starRadius + i * (starRadius * 2 + starGap);
			if (rating! >= i + 1) {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
			} else if (rating! >= i + 0.5) {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
				ctx.save();
				ctx.beginPath();
				ctx.rect(cx - starRadius, starsCY - starRadius, starRadius, starRadius * 2);
				ctx.clip();
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
				ctx.restore();
			} else {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
			}
		}
		curY += starsRowH;
	}

	// --- Draw transport mode ---
	if (hasTransport) {
		curY += gap;
		const info = TRANSPORT_ICONS[transportMode!];
		const tText = `${info.icon}  ${info.label}`;
		ctx.font = `500 ${transportFontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
		ctx.fillText(tText, width / 2, curY + transportFontSize / 2);
	}

	ctx.restore();
}

/** Draw a large prominent location title at the top of the canvas (during fly-to) — LEGACY */
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
	const fontSize = width > 1200 ? 52 : 42;
	ctx.font = `700 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const padX = 48, padY = 22;
	const maxBgW = width - 60; // 30px margin each side

	// Truncate text with ellipsis if it overflows the canvas
	let displayText = text;
	let metrics = ctx.measureText(displayText);
	if (metrics.width + padX * 2 > maxBgW) {
		while (displayText.length > 1 && ctx.measureText(displayText + '...').width + padX * 2 > maxBgW) {
			displayText = displayText.slice(0, -1);
		}
		displayText = displayText.trimEnd() + '...';
		metrics = ctx.measureText(displayText);
	}

	const bgW = Math.min(metrics.width + padX * 2, maxBgW);
	const bgH = fontSize + padY * 2;
	const topOffset = width > 1200 ? 80 : 60;
	const bgX = width / 2 - bgW / 2;

	// Frosted glass-style background
	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.fill();

	// Subtle accent border
	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = hexToRgba(accentColor, 0.2);
	ctx.lineWidth = 1.5;
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.stroke();

	// Accent-colored bottom accent line (thinner, inset more)
	const lineY = topOffset + bgH - 2.5;
	ctx.fillStyle = hexToRgba(accentColor, 0.5);
	canvasRoundRect(ctx, bgX + 16, lineY, bgW - 32, 2.5, 1.25);
	ctx.fill();

	// Title text — white with subtle text shadow for legibility
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 6;
	ctx.shadowOffsetY = 2;
	ctx.fillStyle = accentColor;
	ctx.fillText(displayText, width / 2, topOffset + bgH / 2);
	ctx.shadowColor = 'transparent';

	// Star rating below the title bar
	if (rating && rating > 0) {
		const starSize = 14;
		const starGap = 5;
		const totalStarsW = 5 * (starSize * 2) + 4 * starGap;
		const starsY = topOffset + bgH + 18 + starSize;

		// Matching pill behind stars
		const pillW = totalStarsW + 28;
		const pillH = starSize * 2 + 16;
		const pillX = width / 2 - pillW / 2;
		const pillY = starsY - starSize - 8;
		ctx.shadowColor = 'rgba(0,0,0,0.25)';
		ctx.shadowBlur = 12;
		ctx.shadowOffsetY = 2;
		ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
		canvasRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
		ctx.fill();
		ctx.shadowColor = 'transparent';
		ctx.strokeStyle = hexToRgba(accentColor, 0.15);
		ctx.lineWidth = 1;
		canvasRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
		ctx.stroke();

		const starsX = width / 2 - totalStarsW / 2;
		for (let i = 0; i < 5; i++) {
			const cx = starsX + starSize + i * (starSize * 2 + starGap);
			if (rating >= i + 1) {
				drawStar(ctx, cx, starsY, starSize);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
			} else if (rating >= i + 0.5) {
				drawStar(ctx, cx, starsY, starSize);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
				ctx.save();
				ctx.beginPath();
				ctx.rect(cx - starSize, starsY - starSize, starSize, starSize * 2);
				ctx.clip();
				drawStar(ctx, cx, starsY, starSize);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
				ctx.restore();
			} else {
				drawStar(ctx, cx, starsY, starSize);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
			}
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

	ctx.save();
	const fontSize = 28;
	ctx.font = `600 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 26, padY = 12;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const bgX = width / 2 - bgW / 2;
	const bgY = height - height * 0.12 - bgH;

	// Frosted glass-style background matching title bar
	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 3;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
	ctx.fill();

	// Subtle accent border
	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = hexToRgba(accentColor, 0.2);
	ctx.lineWidth = 1;
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
	ctx.stroke();

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = accentColor;
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

	ctx.save();
	const fontSize = width > 1200 ? 40 : 34;
	ctx.font = `600 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 44, padY = 22;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const bgX = width / 2 - bgW / 2;
	// Position well above the bottom edge so it's not hidden by video controls
	const bgY = Math.round(height * 0.87 - bgH);

	// Frosted glass-style background matching other overlays
	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.82);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
	ctx.fill();

	// Accent left stripe
	ctx.shadowColor = 'transparent';
	ctx.fillStyle = hexToRgba(accentColor, 0.85);
	canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
	ctx.fill();

	// Accent-colored top accent line
	ctx.fillStyle = hexToRgba(accentColor, 0.7);
	canvasRoundRect(ctx, bgX + 16, bgY, bgW - 32, 3, 1.5);
	ctx.fill();

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = '#FFFFFF';
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
	// titleColor is used directly for text (user's chosen color)

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
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = '#FFFFFF';
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
		const logoSize = Math.round(width * 0.12);
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
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock
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

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = titleColor;
			ctx.globalAlpha = 0.6;
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
		const logoSize = Math.round(width * 0.12);
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
	let frameCount = 0;
	console.log(`[MapRenderer] drawTitleCardToCanvas: starting (${durationSec}s, bg=${bgImage ? 'media' : 'gradient'}, logo=${!!logoImage})`);
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= durationMs) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }
			drawFrame();
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame(); // final frame
	frameCount++;

	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(`[MapRenderer] drawTitleCardToCanvas done: ${frameCount} frames, wall=${wallTime}s`);
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
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock,
	locationIndex: number = 0,
	totalLocations: number = 1
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
		console.log(`[MapRenderer] drawFlyToToCanvas (first): "${location.name}" — flyTo=${FLY_TO_DURATION}ms + hold=${FIRST_HOLD_MS}ms`);
		const totalMs = FIRST_TOTAL_MS;

		map.flyTo({
			center: [location.lng, location.lat],
			zoom: CLOSE_ZOOM,
			duration: FLY_TO_DURATION,
			essential: true
		});

		const startTime = performance.now();
		let frameCount = 0;
		await new Promise<void>((resolve) => {
			const frame = () => {
				const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
				if (elapsed >= totalMs) { resolve(); return; }
				if (document.hidden) { requestAnimationFrame(frame); return; }
				drawMapFrame(elapsed, (ctx2, el) => {
					drawVignette(ctx2, width, height);
					if (el >= FLY_TO_DURATION) {
						const fadeAlpha = Math.min(1, (el - FLY_TO_DURATION) / 400);
						ctx2.globalAlpha = fadeAlpha;
						const point = map.project([location.lng, location.lat]);
						drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
						drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, null, secondaryColor);
						ctx2.globalAlpha = 1;
					}
				});
				frameCount++;
				requestAnimationFrame(frame);
			};
			frame();
		});
		// Draw final frame
		drawMapFrame(totalMs, (ctx2) => {
			drawVignette(ctx2, width, height);
			const point = map.project([location.lng, location.lat]);
			drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
			drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, null, secondaryColor);
		});
		frameCount++;
		const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
		console.log(`[MapRenderer] drawFlyToToCanvas (first) done: ${frameCount} frames, wall=${wallTime}s`);
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

	console.log(`[MapRenderer] Overview zoom: ${overviewZoom.toFixed(1)}, phases: out=${ZOOM_OUT_MS} pause=${PAUSE_MS} in=${ZOOM_IN_MS} hold=${HOLD_MS}`);

	// Start phase 1: zoom out
	map.flyTo({
		center: overviewCenter,
		zoom: overviewZoom,
		duration: ZOOM_OUT_MS,
		essential: true
	});

	// Phase 2 (zoom in) triggered by elapsed time instead of setTimeout
	let phase2Started = false;

	const startTime = performance.now();
	let frameCount = 0;
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= SUBSEQUENT_TOTAL_MS) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }

			// Trigger phase 2 zoom-in at the right elapsed time
			if (elapsed >= ZOOM_IN_AT && !phase2Started) {
				phase2Started = true;
				console.log(`[MapRenderer] drawFlyToToCanvas: phase 2 zoom-in triggered at elapsed=${elapsed.toFixed(0)}ms (target: ${ZOOM_IN_AT}ms)`);
				map.flyTo({
					center: [location.lng, location.lat],
					zoom: CLOSE_ZOOM,
					duration: ZOOM_IN_MS,
					essential: true
				});
			}

			drawMapFrame(elapsed, (ctx2, el) => {
				drawVignette(ctx2, width, height);
				if (el < 500) {
					const pinAlpha = Math.max(0, 1 - el / 500);
					ctx2.globalAlpha = pinAlpha;
					const prevPoint = map.project([prevLocation.lng, prevLocation.lat]);
					if (prevPoint.x > -50 && prevPoint.x < width + 50 && prevPoint.y > -50 && prevPoint.y < height + 50) {
						drawPinOnCanvas(ctx2, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
					}
					ctx2.globalAlpha = 1;
				}
				if (el >= OVERLAY_AT) {
					const fadeAlpha = Math.min(1, (el - OVERLAY_AT) / 400);
					ctx2.globalAlpha = fadeAlpha;
					const point = map.project([location.lng, location.lat]);
					drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
					drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, transportMode, secondaryColor);
					ctx2.globalAlpha = 1;
				}
			});
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Draw final frame
	drawMapFrame(SUBSEQUENT_TOTAL_MS, (ctx2) => {
		drawVignette(ctx2, width, height);
		const point = map.project([location.lng, location.lat]);
		drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
		drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, transportMode, secondaryColor);
	});
	frameCount++;
	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(`[MapRenderer] drawFlyToToCanvas (transition) done: "${prevLocation.name}" → "${location.name}", ${frameCount} frames, wall=${wallTime}s`);
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
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock
): Promise<void> {
	if (locations.length === 0) throw new Error('No locations for final route');

	const ff = fontFamily(fontId);
	await loadFont(fontId);

	const mapCanvas = map.getCanvas();
	const totalSegments = locations.length - 1;
	const segmentDuration = totalSegments > 0 ? 2000 / totalSegments : 0;

	console.log(`[MapRenderer] drawFinalRouteToCanvas: starting (${locations.length} locations, ${totalSegments} segments, segmentDur=${segmentDuration.toFixed(0)}ms, totalDur=${FINAL_MAP_DURATION}ms)`);

	// Track which segments have been added (elapsed-time based instead of setTimeout)
	let segmentsAdded = 0;

	const startTime = performance.now();
	let frameCount = 0;
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= FINAL_MAP_DURATION) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }

			// Add route segments based on elapsed time
			while (segmentsAdded < totalSegments && elapsed >= segmentsAdded * segmentDuration) {
				const from = locations[segmentsAdded];
				const to = locations[segmentsAdded + 1];
				const mode = to.transportMode ?? 'drove';
				const geom = routeGeometries?.[segmentsAdded];
				addRouteLine(map, from, to, mode, `route-${segmentsAdded}`, geom?.coordinates, titleColor);
				console.log(`[MapRenderer] drawFinalRouteToCanvas: added segment ${segmentsAdded + 1}/${totalSegments} at elapsed=${elapsed.toFixed(0)}ms`);
				segmentsAdded++;
			}

			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			drawVignette(ctx, width, height, 0.7);
			for (const loc of locations) {
				const point = map.project([loc.lng, loc.lat]);
				const label = loc.label || loc.name.split(',')[0];
				drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
			}
			drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
			frameCallback?.(ctx);
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Draw final frame
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	drawVignette(ctx, width, height, 0.7);
	for (const loc of locations) {
		const point = map.project([loc.lng, loc.lat]);
		const label = loc.label || loc.name.split(',')[0];
		drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
	}
	drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
	frameCallback?.(ctx);
	frameCount++;

	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(`[MapRenderer] drawFinalRouteToCanvas done: ${frameCount} frames, ${segmentsAdded}/${totalSegments} segments drawn, wall=${wallTime}s`);
}

// ─── WebCodecs encoder variants ───
// These call onFrame(canvas) for each rendered frame instead of relying on captureStream.
// Map animations remain real-time (rAF), but use frame-index timestamps instead of PauseClock.

/** Generate title card frames offline (tight for-loop, no rAF). */
export async function generateTitleCardFrames(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	opts: TitleCardOpts,
	fps: number,
	onFrame: (canvas: HTMLCanvasElement) => void,
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

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) {
		bgImage = await loadImageFromFile(mediaFile);
	}

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try { logoImage = await loadImageFromUrl(opts.logoUrl); } catch { /* skip */ }
	}

	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 2.5;
	const totalFrames = Math.round(durationSec * fps);

	function drawTextOverlay() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);

		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}

		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = titleColor;
			ctx.globalAlpha = 0.6;
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
		const logoSize = Math.round(width * 0.12);
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

	console.log(`[MapRenderer] generateTitleCardFrames: ${totalFrames} frames (${durationSec}s @ ${fps}fps)`);
	for (let i = 0; i < totalFrames; i++) {
		drawFrame();
		onFrame(canvas);
	}
}

/** Draw a fly-to animation with frame encoding (real-time rAF, calls onFrame per frame).
 *  Same visual behavior as drawFlyToToCanvas but without PauseClock dependency. */
export async function drawFlyToWithEncoder(
	map: maplibregl.Map,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	location: Location,
	prevLocation: Location | null,
	transportMode: TransportMode | null,
	width: number,
	height: number,
	titleColor: string,
	fontId: string,
	secondaryColor: string,
	onFrame: (canvas: HTMLCanvasElement) => void,
	frameCallback?: FrameCallback,
	locationIndex: number = 0,
	totalLocations: number = 1
): Promise<void> {
	const displayName = location.label || location.name.split(',')[0];
	const ff = fontFamily(fontId);
	await loadFont(fontId);

	const mapCanvas = map.getCanvas();
	const frameIntervalMs = 1000 / TARGET_FPS;

	function drawMapFrame(elapsed: number, overlayFn: (ctx: CanvasRenderingContext2D, elapsed: number) => void) {
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(mapCanvas, 0, 0, width, height);
		overlayFn(ctx, elapsed);
		frameCallback?.(ctx);
	}

	if (!prevLocation) {
		map.flyTo({
			center: [location.lng, location.lat],
			zoom: CLOSE_ZOOM,
			duration: FLY_TO_DURATION,
			essential: true
		});

		const startTime = performance.now();
		let lastFrameTime = 0;
		let frameCount = 0;
		await new Promise<void>((resolve) => {
			const frame = () => {
				const now = performance.now();
				const elapsed = now - startTime;
				if (elapsed >= FIRST_TOTAL_MS) { resolve(); return; }
				if (document.hidden) { requestAnimationFrame(frame); return; }
				if (now - lastFrameTime >= frameIntervalMs) {
					drawMapFrame(elapsed, (ctx2, el) => {
						drawVignette(ctx2, width, height);
						if (el >= FLY_TO_DURATION) {
							const fadeAlpha = Math.min(1, (el - FLY_TO_DURATION) / 400);
							ctx2.globalAlpha = fadeAlpha;
							const point = map.project([location.lng, location.lat]);
							drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
							drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, null, secondaryColor);
							ctx2.globalAlpha = 1;
						}
					});
					onFrame(canvas);
					frameCount++;
					lastFrameTime = now;
				}
				requestAnimationFrame(frame);
			};
			frame();
		});
		// Final frame
		drawMapFrame(FIRST_TOTAL_MS, (ctx2) => {
			drawVignette(ctx2, width, height);
			const point = map.project([location.lng, location.lat]);
			drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
			drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, null, secondaryColor);
		});
		onFrame(canvas);
		frameCount++;
		console.log(`[MapRenderer] drawFlyToWithEncoder (first) done: ${frameCount} frames`);
		return;
	}

	// Subsequent location: zoom out → overview → zoom in
	const bounds = new maplibregl.LngLatBounds();
	bounds.extend([prevLocation.lng, prevLocation.lat]);
	bounds.extend([location.lng, location.lat]);
	const padding = Math.min(width, height) * 0.2;
	const cam = map.cameraForBounds(bounds, { padding });
	const overviewZoom = Math.max(2, Math.min(cam?.zoom ?? 8, CLOSE_ZOOM - 2));
	const boundsCenter = bounds.getCenter();
	const overviewCenter: [number, number] = [boundsCenter.lng, boundsCenter.lat];

	map.flyTo({
		center: overviewCenter,
		zoom: overviewZoom,
		duration: ZOOM_OUT_MS,
		essential: true
	});

	let phase2Started = false;
	const startTime = performance.now();
	let lastFrameTime = 0;
	let frameCount = 0;

	await new Promise<void>((resolve) => {
		const frame = () => {
			const now = performance.now();
			const elapsed = now - startTime;
			if (elapsed >= SUBSEQUENT_TOTAL_MS) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }

			if (elapsed >= ZOOM_IN_AT && !phase2Started) {
				phase2Started = true;
				map.flyTo({
					center: [location.lng, location.lat],
					zoom: CLOSE_ZOOM,
					duration: ZOOM_IN_MS,
					essential: true
				});
			}

			if (now - lastFrameTime >= frameIntervalMs) {
				drawMapFrame(elapsed, (ctx2, el) => {
					drawVignette(ctx2, width, height);
					if (el < 500) {
						const pinAlpha = Math.max(0, 1 - el / 500);
						ctx2.globalAlpha = pinAlpha;
						const prevPoint = map.project([prevLocation.lng, prevLocation.lat]);
						if (prevPoint.x > -50 && prevPoint.x < width + 50 && prevPoint.y > -50 && prevPoint.y < height + 50) {
							drawPinOnCanvas(ctx2, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
						}
						ctx2.globalAlpha = 1;
					}
					if (el >= OVERLAY_AT) {
						const fadeAlpha = Math.min(1, (el - OVERLAY_AT) / 400);
						ctx2.globalAlpha = fadeAlpha;
						const point = map.project([location.lng, location.lat]);
						drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
						drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, transportMode, secondaryColor);
						ctx2.globalAlpha = 1;
					}
				});
				onFrame(canvas);
				frameCount++;
				lastFrameTime = now;
			}
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Final frame
	drawMapFrame(SUBSEQUENT_TOTAL_MS, (ctx2) => {
		drawVignette(ctx2, width, height);
		const point = map.project([location.lng, location.lat]);
		drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
		drawLocationLowerThird(ctx2, width, height, displayName, locationIndex, totalLocations, titleColor, ff, location.rating, transportMode, secondaryColor);
	});
	onFrame(canvas);
	frameCount++;
	console.log(`[MapRenderer] drawFlyToWithEncoder (transition) done: ${frameCount} frames`);
}

/** Draw final route animation with frame encoding (real-time rAF, calls onFrame per frame). */
export async function drawFinalRouteWithEncoder(
	map: maplibregl.Map,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	locations: Location[],
	stats: { stops: number; miles: number; minutes: number },
	width: number,
	height: number,
	routeGeometries: ({ coordinates: [number, number][] } | null)[] | undefined,
	titleColor: string,
	fontId: string,
	secondaryColor: string,
	onFrame: (canvas: HTMLCanvasElement) => void,
	frameCallback?: FrameCallback
): Promise<void> {
	if (locations.length === 0) throw new Error('No locations for final route');

	const ff = fontFamily(fontId);
	await loadFont(fontId);

	const mapCanvas = map.getCanvas();
	const totalSegments = locations.length - 1;
	const segmentDuration = totalSegments > 0 ? 2000 / totalSegments : 0;
	const frameIntervalMs = 1000 / TARGET_FPS;

	let segmentsAdded = 0;
	const startTime = performance.now();
	let lastFrameTime = 0;
	let frameCount = 0;

	console.log(`[MapRenderer] drawFinalRouteWithEncoder: starting (${locations.length} locations, ${totalSegments} segments)`);

	await new Promise<void>((resolve) => {
		const frame = () => {
			const now = performance.now();
			const elapsed = now - startTime;
			if (elapsed >= FINAL_MAP_DURATION) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }

			// Add route segments based on elapsed time
			while (segmentsAdded < totalSegments && elapsed >= segmentsAdded * segmentDuration) {
				const from = locations[segmentsAdded];
				const to = locations[segmentsAdded + 1];
				const mode = to.transportMode ?? 'drove';
				const geom = routeGeometries?.[segmentsAdded];
				addRouteLine(map, from, to, mode, `route-${segmentsAdded}`, geom?.coordinates, titleColor);
				segmentsAdded++;
			}

			if (now - lastFrameTime >= frameIntervalMs) {
				ctx.clearRect(0, 0, width, height);
				ctx.drawImage(mapCanvas, 0, 0, width, height);
				drawVignette(ctx, width, height, 0.7);
				for (const loc of locations) {
					const point = map.project([loc.lng, loc.lat]);
					const label = loc.label || loc.name.split(',')[0];
					drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
				}
				drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
				frameCallback?.(ctx);
				onFrame(canvas);
				frameCount++;
				lastFrameTime = now;
			}
			requestAnimationFrame(frame);
		};
		frame();
	});
	// Final frame
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	drawVignette(ctx, width, height, 0.7);
	for (const loc of locations) {
		const point = map.project([loc.lng, loc.lat]);
		const label = loc.label || loc.name.split(',')[0];
		drawPinOnCanvas(ctx, point.x, point.y, label, titleColor, ff, loc.rating, true, hexToRgba(secondaryColor, 0.88));
	}
	drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
	frameCallback?.(ctx);
	onFrame(canvas);
	frameCount++;

	console.log(`[MapRenderer] drawFinalRouteWithEncoder done: ${frameCount} frames, ${segmentsAdded}/${totalSegments} segments`);
}

// ─── Outro Card ───

export interface OutroCardOpts {
	title: string;
	titleColor: string;
	aspectRatio: AspectRatio;
	mediaFile?: File | null;
	logoUrl?: string | null;
	showLogo?: boolean;
	fontId?: string;
	secondaryColor?: string;
	username?: string;
	displayName?: string;
	socialLinks?: { instagram?: string; youtube?: string; tiktok?: string; website?: string };
	durationSec?: number;
}

/** Build the social handles text lines from profile data */
function buildSocialLines(opts: OutroCardOpts): string[] {
	const lines: string[] = [];
	if (opts.displayName) lines.push(opts.displayName);
	else if (opts.username) lines.push(`@${opts.username}`);
	const socials: string[] = [];
	if (opts.socialLinks?.instagram) socials.push(`@${opts.socialLinks.instagram.replace(/^@/, '')}`);
	if (opts.socialLinks?.youtube) socials.push(opts.socialLinks.youtube);
	if (opts.socialLinks?.tiktok) socials.push(`@${opts.socialLinks.tiktok.replace(/^@/, '')}`);
	if (opts.socialLinks?.website) socials.push(opts.socialLinks.website.replace(/^https?:\/\//, ''));
	// Put each social on its own line to avoid overflow
	for (const s of socials) lines.push(s);
	return lines;
}

/** Draw an outro card directly to a provided canvas context (MediaRecorder path). */
export async function drawOutroCardToCanvas(
	ctx: CanvasRenderingContext2D,
	opts: OutroCardOpts,
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock
): Promise<void> {
	const { title, titleColor, aspectRatio, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.05);
	const socialFontSize = Math.round(fontSize * 0.5);
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 3;

	// Title lines
	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);
	const titleLineHeight = fontSize * 1.3;
	const totalTitleHeight = titleLines.length * titleLineHeight;

	// Social lines
	const socialLines = buildSocialLines(opts);
	ctx.font = `400 ${socialFontSize}px ${ff}`;
	const socialLineHeight = socialFontSize * 1.6;
	const totalSocialHeight = socialLines.length * socialLineHeight;

	// Layout
	const separatorGap = fontSize * 0.6;
	const socialGap = fontSize * 0.5;
	const totalBlockHeight = totalTitleHeight + separatorGap + totalSocialHeight + (socialLines.length > 0 ? socialGap : 0);
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) bgImage = await loadImageFromFile(mediaFile);

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try { logoImage = await loadImageFromUrl(opts.logoUrl); } catch { /* skip */ }
	}

	function drawContent() {
		ctx.save();

		// Background pill
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);
		const maxContentW = width * 0.85;
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		ctx.font = `400 ${socialFontSize}px ${ff}`;
		for (const line of socialLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		maxLineW = Math.min(maxLineW, maxContentW - padX * 2);

		const bgW = Math.min(maxLineW + padX * 2, maxContentW);
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		// Title
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		// Decorative separator (accent-colored)
		const lineY = blockStartY + totalTitleHeight + separatorGap * 0.5;
		ctx.strokeStyle = titleColor;
		ctx.globalAlpha = 0.6;
		ctx.lineWidth = 2;
		const sepW = Math.min(bgW * 0.5, width * 0.3);
		ctx.beginPath();
		ctx.moveTo(width / 2 - sepW / 2, lineY);
		ctx.lineTo(width / 2 + sepW / 2, lineY);
		ctx.stroke();
		ctx.globalAlpha = 1;

		// Social text
		if (socialLines.length > 0) {
			const socialStartY = blockStartY + totalTitleHeight + separatorGap + socialGap;
			ctx.font = `400 ${socialFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			const maxTextW = bgW - padX * 2;
			for (let i = 0; i < socialLines.length; i++) {
				let line = socialLines[i];
				// Truncate if still too wide
				if (ctx.measureText(line).width > maxTextW) {
					while (line.length > 1 && ctx.measureText(line + '...').width > maxTextW) {
						line = line.slice(0, -1);
					}
					line = line.trimEnd() + '...';
				}
				ctx.fillText(line, width / 2, socialStartY + i * socialLineHeight);
			}
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
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
		drawContent();
		drawLogo();
		frameCallback?.(ctx);
	}

	const durationMs = durationSec * 1000;
	const startTime = performance.now();
	let frameCount = 0;
	console.log(`[MapRenderer] drawOutroCardToCanvas: starting (${durationSec}s)`);
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= durationMs) { resolve(); return; }
			if (document.hidden) { requestAnimationFrame(frame); return; }
			drawFrame();
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame(); // final frame
	frameCount++;
	console.log(`[MapRenderer] drawOutroCardToCanvas done: ${frameCount} frames`);
}

/** Generate outro card frames offline (WebCodecs path). */
export async function generateOutroCardFrames(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	opts: OutroCardOpts,
	fps: number,
	onFrame: (canvas: HTMLCanvasElement) => void,
	frameCallback?: FrameCallback
): Promise<void> {
	const { title, titleColor, aspectRatio, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.05);
	const socialFontSize = Math.round(fontSize * 0.5);
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 3;

	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);
	const titleLineHeight = fontSize * 1.3;
	const totalTitleHeight = titleLines.length * titleLineHeight;

	const socialLines = buildSocialLines(opts);
	ctx.font = `400 ${socialFontSize}px ${ff}`;
	const socialLineHeight = socialFontSize * 1.6;
	const totalSocialHeight = socialLines.length * socialLineHeight;

	const separatorGap = fontSize * 0.6;
	const socialGap = fontSize * 0.5;
	const totalBlockHeight = totalTitleHeight + separatorGap + totalSocialHeight + (socialLines.length > 0 ? socialGap : 0);
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) bgImage = await loadImageFromFile(mediaFile);

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try { logoImage = await loadImageFromUrl(opts.logoUrl); } catch { /* skip */ }
	}

	function drawContent() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);
		const maxContentW = width * 0.85;
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		ctx.font = `400 ${socialFontSize}px ${ff}`;
		for (const line of socialLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		maxLineW = Math.min(maxLineW, maxContentW - padX * 2);

		const bgW = Math.min(maxLineW + padX * 2, maxContentW);
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		// Decorative separator (accent-colored)
		const lineY = blockStartY + totalTitleHeight + separatorGap * 0.5;
		ctx.strokeStyle = titleColor;
		ctx.globalAlpha = 0.6;
		ctx.lineWidth = 2;
		const sepW = Math.min(bgW * 0.5, width * 0.3);
		ctx.beginPath();
		ctx.moveTo(width / 2 - sepW / 2, lineY);
		ctx.lineTo(width / 2 + sepW / 2, lineY);
		ctx.stroke();
		ctx.globalAlpha = 1;

		if (socialLines.length > 0) {
			const socialStartY = blockStartY + totalTitleHeight + separatorGap + socialGap;
			ctx.font = `400 ${socialFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			const maxTextW = bgW - padX * 2;
			for (let i = 0; i < socialLines.length; i++) {
				let line = socialLines[i];
				if (ctx.measureText(line).width > maxTextW) {
					while (line.length > 1 && ctx.measureText(line + '...').width > maxTextW) {
						line = line.slice(0, -1);
					}
					line = line.trimEnd() + '...';
				}
				ctx.fillText(line, width / 2, socialStartY + i * socialLineHeight);
			}
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
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
		drawContent();
		drawLogo();
		frameCallback?.(ctx);
	}

	const totalFrames = Math.round(durationSec * fps);
	console.log(`[MapRenderer] generateOutroCardFrames: ${totalFrames} frames (${durationSec}s @ ${fps}fps)`);
	for (let i = 0; i < totalFrames; i++) {
		drawFrame();
		onFrame(canvas);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
