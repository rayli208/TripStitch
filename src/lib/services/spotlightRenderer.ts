/**
 * Location Spotlight renderer: generates a short map video that starts with a
 * context overview (town boundary OR radius-around-pin) and zooms into a
 * specific location. Designed for use as a top-corner overlay in YouTube
 * travel-vlog edits.
 *
 * Render paths:
 *   Opaque: WebCodecs H.264 + mp4-muxer → MP4 (fast, Chrome/Safari), or
 *           MediaRecorder → WebM/MP4 fallback.
 *   Alpha:  MediaRecorder with VP8/VP9 + canvas.captureStream() → WebM with a
 *           transparent alpha track (Chrome/Edge/Firefox). WebCodecs VP9 is
 *           NOT used here — Chrome's encoder does not emit alpha frames, so
 *           MediaRecorder is the correct path.
 *
 * Options:
 *   durationSec   — 3 | 5 | 8 (timing scaled proportionally)
 *   loopable      — if true, camera orbits around the pin instead of flying in,
 *                   so the last frame matches the first for seamless looping
 *   contextShape  — 'boundary' (use town polygon) | 'radius' (circle of N
 *                   meters around the pin)
 *   exportMode    — 'opaque' (vignette + MP4) | 'alpha' (rounded-rect mask,
 *                   no vignette, transparent WebM)
 */
import maplibregl from 'maplibre-gl';
import type { MapStyle, AspectRatio } from '$lib/types';
import { STYLE_URLS } from '$lib/constants/map';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import { getResolution } from './mapRenderer';
import {
	canUseWebCodecs,
	getSupportedMimeType,
	getAlphaMimeType
} from '$lib/utils/browserCompat';
import { circlePolygon, circleBbox } from './geoUtils';

const TARGET_FPS = 30;
const PIN_ZOOM = 16;

export type SpotlightDuration = 3 | 5 | 8;
export type SpotlightContextShape = 'boundary' | 'radius';
export type SpotlightExportMode = 'opaque' | 'alpha';

export interface SpotlightConfig {
	locationName: string;
	address: string;
	/** Town boundary polygon. Ignored when `contextShape === 'radius'`. */
	boundaryGeoJSON: GeoJSON.Geometry | null;
	/** [west, south, east, north]. Ignored when `contextShape === 'radius'`. */
	boundaryBbox: [number, number, number, number] | null;
	pinLocation: [number, number]; // [lng, lat]
	mapStyle: MapStyle;
	accentColor: string;
	fontId: string;
	aspectRatio: AspectRatio;
	secondaryColor: string;
	durationSec: SpotlightDuration;
	loopable: boolean;
	contextShape: SpotlightContextShape;
	/** Required when `contextShape === 'radius'`. Meters. */
	radiusMeters: number;
	exportMode: SpotlightExportMode;
}

export interface SpotlightResult {
	blob: Blob;
	url: string;
	/** File extension the caller should use when downloading. */
	ext: 'mp4' | 'webm';
	/** Whether the output has a transparent background. */
	hasAlpha: boolean;
}

interface Timing {
	holdOverviewMs: number;
	flyMs: number;
	holdPinMs: number;
	totalMs: number;
}

function computeTiming(durationSec: SpotlightDuration, loopable: boolean): Timing {
	const totalMs = durationSec * 1000;
	if (loopable) {
		return { holdOverviewMs: 0, flyMs: 0, holdPinMs: totalMs, totalMs };
	}
	// Proportions: 20% hold overview, 55% fly, 25% hold pin
	const holdOverviewMs = Math.round(totalMs * 0.2);
	const flyMs = Math.round(totalMs * 0.55);
	const holdPinMs = totalMs - holdOverviewMs - flyMs;
	return { holdOverviewMs, flyMs, holdPinMs, totalMs };
}

export async function renderSpotlight(
	config: SpotlightConfig,
	onProgress?: (msg: string) => void,
	abortSignal?: AbortSignal
): Promise<SpotlightResult> {
	const { width, height } = getResolution(config.aspectRatio);
	const ff = fontFamily(config.fontId);
	await loadFont(config.fontId);

	const timing = computeTiming(config.durationSec, config.loopable);

	console.log(
		`[Spotlight] Starting render: ${width}x${height}, style=${config.mapStyle}, ` +
			`duration=${config.durationSec}s loop=${config.loopable} ` +
			`context=${config.contextShape} export=${config.exportMode}`
	);

	// ── Resolve the context polygon + bbox (either boundary OR radius circle) ──
	const { contextGeoJSON, contextBbox } = resolveContext(config);

	onProgress?.('Creating map...');
	const container = document.createElement('div');
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.style.position = 'absolute';
	container.style.left = '-9999px';
	container.style.top = '-9999px';
	document.body.appendChild(container);

	const map = new maplibregl.Map({
		container,
		style: STYLE_URLS[config.mapStyle],
		center: [(contextBbox[0] + contextBbox[2]) / 2, (contextBbox[1] + contextBbox[3]) / 2],
		zoom: 2,
		interactive: false,
		pixelRatio: 1,
		canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
		attributionControl: false
	});

	await new Promise<void>((resolve, reject) => {
		map.on('load', () => resolve());
		map.on('error', (e) => reject(new Error(`Map failed to load: ${e.error?.message || 'unknown'}`)));
	});

	// ── Add context polygon layers ──
	map.addSource('spotlight-context', {
		type: 'geojson',
		data: { type: 'Feature', properties: {}, geometry: contextGeoJSON }
	});
	map.addLayer({
		id: 'context-fill',
		type: 'fill',
		source: 'spotlight-context',
		paint: { 'fill-color': config.accentColor, 'fill-opacity': 0.18 }
	});
	map.addLayer({
		id: 'context-outline',
		type: 'line',
		source: 'spotlight-context',
		paint: { 'line-color': config.accentColor, 'line-width': 5, 'line-opacity': 0.9 }
	});

	// Fit bounds to context shape AND pin — so a pin outside the town stays
	// visible during the overview phase, letting the viewer see proximity.
	const bounds = new maplibregl.LngLatBounds(
		[contextBbox[0], contextBbox[1]],
		[contextBbox[2], contextBbox[3]]
	);
	bounds.extend(config.pinLocation);
	const pad = Math.min(width, height) * 0.15;
	map.fitBounds(bounds, {
		padding: { top: pad + 60, bottom: pad + 60, left: pad, right: pad },
		duration: 0
	});
	await waitForIdle(map);

	// Pre-warm tiles at destination zoom
	onProgress?.('Loading map tiles...');
	map.jumpTo({ center: config.pinLocation, zoom: PIN_ZOOM });
	await waitForIdle(map, 3000);

	// Position the camera for the initial frame:
	//   - Loop mode: start zoomed in at pin, bearing 0
	//   - Normal mode: back to overview
	if (config.loopable) {
		map.jumpTo({ center: config.pinLocation, zoom: PIN_ZOOM, bearing: 0 });
	} else {
		map.fitBounds(bounds, {
			padding: { top: pad + 60, bottom: pad + 60, left: pad, right: pad },
			duration: 0
		});
	}
	await waitForIdle(map, 3000);

	if (abortSignal?.aborted) {
		cleanup(map, container);
		throw new Error('Export cancelled');
	}

	onProgress?.('Recording animation...');

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { alpha: config.exportMode === 'alpha' })!;
	const mapCanvas = map.getCanvas();

	// ── Per-frame compositing ──
	// Draws the map (optionally clipped to a rounded rect in alpha mode), then
	// overlays name banner, pin, and address banner according to the timing.
	const cornerRadius = config.exportMode === 'alpha' ? Math.round(Math.min(width, height) * 0.05) : 0;
	const alpha = config.exportMode === 'alpha';

	const drawFrame = (elapsed: number) => {
		ctx.clearRect(0, 0, width, height);

		if (alpha) {
			ctx.save();
			clipRoundedRect(ctx, 0, 0, width, height, cornerRadius);
			ctx.clip();
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			ctx.restore();
		} else {
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			drawVignette(ctx, width, height);
		}

		drawNameBanner(
			ctx,
			config.locationName,
			width,
			height,
			config.accentColor,
			ff,
			config.secondaryColor
		);

		// Pin visible from t=0 with a brief fade-in — so viewers can see the
		// pin's location relative to the town during the overview phase.
		const pinFade = Math.min(1, elapsed / 400);
		ctx.globalAlpha = pinFade;
		const point = map.project(config.pinLocation);
		drawPin(ctx, point.x, point.y, config.accentColor);
		ctx.globalAlpha = 1;

		// Address banner holds until we've mostly flown in — otherwise it sits
		// on screen with no visual anchor.
		const addressAppearAt = config.loopable
			? 0
			: timing.holdOverviewMs + timing.flyMs * 0.7;
		if (elapsed >= addressAppearAt) {
			const addrFade = Math.min(1, (elapsed - addressAppearAt) / 400);
			ctx.globalAlpha = addrFade;
			drawAddressBanner(
				ctx,
				config.address,
				width,
				height,
				config.accentColor,
				ff,
				config.secondaryColor
			);
			ctx.globalAlpha = 1;
		}
	};

	// ── Camera driver: flyTo in normal mode, per-frame setBearing in loop mode ──
	let flyToStarted = false;
	const driveCamera = (elapsed: number) => {
		if (config.loopable) {
			const bearing = (elapsed / timing.totalMs) * 360;
			map.jumpTo({ center: config.pinLocation, zoom: PIN_ZOOM, bearing });
			return;
		}
		if (!flyToStarted && elapsed >= timing.holdOverviewMs) {
			flyToStarted = true;
			map.flyTo({
				center: config.pinLocation,
				zoom: PIN_ZOOM,
				duration: timing.flyMs,
				essential: true
			});
		}
	};

	// ── Choose encoder path ──
	const useAlpha = config.exportMode === 'alpha';
	const alphaMimeType = useAlpha ? getAlphaMimeType() : null;
	const h264Supported = !useAlpha ? await canUseWebCodecs(width, height) : false;

	let blob: Blob;
	let ext: 'mp4' | 'webm';
	let hasAlpha = false;

	if (useAlpha && alphaMimeType) {
		console.log(`[Spotlight] Using MediaRecorder alpha pipeline (${alphaMimeType})`);
		blob = await recordWithMediaRecorder(
			canvas,
			alphaMimeType,
			timing.totalMs,
			abortSignal,
			drawFrame,
			driveCamera,
			onProgress
		);
		ext = 'webm';
		hasAlpha = true;
	} else if (useAlpha && !alphaMimeType) {
		cleanup(map, container);
		throw new Error(
			'Transparent export is not supported in this browser. Use Chrome, Edge, or Firefox, or switch to the opaque export mode.'
		);
	} else if (h264Supported) {
		console.log('[Spotlight] Using WebCodecs H.264 pipeline');
		const { createFrameEncoder } = await import('./webCodecsEncoder');
		const encoder = createFrameEncoder({
			width,
			height,
			fps: TARGET_FPS,
			bitrate: 5_000_000
		});
		await driveRenderLoop(timing.totalMs, abortSignal, drawFrame, driveCamera, canvas, encoder);
		onProgress?.('Finalizing...');
		blob = await encoder.finalize();
		ext = 'mp4';
	} else {
		const mimeType = getSupportedMimeType();
		console.log(`[Spotlight] Using MediaRecorder opaque fallback (${mimeType})`);
		blob = await recordWithMediaRecorder(
			canvas,
			mimeType,
			timing.totalMs,
			abortSignal,
			drawFrame,
			driveCamera,
			onProgress
		);
		ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
	}

	cleanup(map, container);
	console.log(
		`[Spotlight] Render complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB, ext=${ext}, alpha=${hasAlpha}`
	);

	const url = URL.createObjectURL(blob);
	return { blob, url, ext, hasAlpha };
}

// ── Render-loop driver (shared by all three encoder paths) ──

interface MinimalEncoder {
	encodeFrame(canvas: HTMLCanvasElement): void;
}

async function driveRenderLoop(
	totalMs: number,
	abortSignal: AbortSignal | undefined,
	drawFrame: (elapsed: number) => void,
	driveCamera: (elapsed: number) => void,
	canvas: HTMLCanvasElement,
	encoder: MinimalEncoder | null
): Promise<void> {
	const frameIntervalMs = 1000 / TARGET_FPS;
	let lastFrameTime = 0;

	await new Promise<void>((resolve) => {
		const start = performance.now();
		const tick = () => {
			if (abortSignal?.aborted) {
				resolve();
				return;
			}
			const now = performance.now();
			const elapsed = now - start;
			if (elapsed >= totalMs) {
				resolve();
				return;
			}

			driveCamera(elapsed);

			// Encoder paths: gate frame emission to the target FPS.
			// MediaRecorder path: draw every rAF (captureStream handles FPS).
			if (encoder) {
				if (now - lastFrameTime >= frameIntervalMs) {
					drawFrame(elapsed);
					encoder.encodeFrame(canvas);
					lastFrameTime = now;
				}
			} else {
				drawFrame(elapsed);
			}

			requestAnimationFrame(tick);
		};
		tick();
	});

	if (encoder) {
		drawFrame(totalMs);
		encoder.encodeFrame(canvas);
	}
}

/**
 * MediaRecorder path used by both the opaque fallback and the alpha-export
 * mode. Canvas.captureStream() preserves alpha when the canvas has an alpha
 * channel and the mime type is WebM (VP8 or VP9).
 */
async function recordWithMediaRecorder(
	canvas: HTMLCanvasElement,
	mimeType: string,
	totalMs: number,
	abortSignal: AbortSignal | undefined,
	drawFrame: (elapsed: number) => void,
	driveCamera: (elapsed: number) => void,
	onProgress?: (msg: string) => void
): Promise<Blob> {
	const stream = canvas.captureStream(TARGET_FPS);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};
	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});
	recorder.start();
	await driveRenderLoop(totalMs, abortSignal, drawFrame, driveCamera, canvas, null);
	// Final frame + small buffer so MediaRecorder flushes the last chunk
	drawFrame(totalMs);
	driveCamera(totalMs);
	await new Promise((r) => setTimeout(r, 120));
	recorder.stop();
	stream.getTracks().forEach((t) => t.stop());
	onProgress?.('Finalizing...');
	return done;
}

// ── Context resolution ──

function resolveContext(config: SpotlightConfig): {
	contextGeoJSON: GeoJSON.Geometry;
	contextBbox: [number, number, number, number];
} {
	if (
		config.contextShape === 'boundary' &&
		config.boundaryGeoJSON &&
		config.boundaryBbox
	) {
		return {
			contextGeoJSON: config.boundaryGeoJSON,
			contextBbox: config.boundaryBbox
		};
	}
	// Radius mode (or boundary requested but missing — fall back automatically)
	const radius = Math.max(config.radiusMeters, 100);
	return {
		contextGeoJSON: circlePolygon(config.pinLocation, radius),
		contextBbox: circleBbox(config.pinLocation, radius)
	};
}

// ── Helpers ──

function cleanup(map: maplibregl.Map, container: HTMLDivElement) {
	map.remove();
	container.remove();
}

function waitForIdle(map: maplibregl.Map, timeoutMs = 4000): Promise<void> {
	return new Promise((resolve) => {
		if (map.loaded() && !map.isMoving()) {
			resolve();
			return;
		}
		const timeout = setTimeout(() => resolve(), timeoutMs);
		map.once('idle', () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

// ── Canvas overlay drawing ──

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function canvasRoundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
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

function clipRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	canvasRoundRect(ctx, x, y, w, h, r);
}

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

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.18);
	topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
	topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = topGrad;
	ctx.fillRect(0, 0, width, height * 0.18);

	const botGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
	botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
	botGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.25)');
	botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
	ctx.fillStyle = botGrad;
	ctx.fillRect(0, height * 0.5, width, height * 0.5);
}

function drawNameBanner(
	ctx: CanvasRenderingContext2D,
	name: string,
	width: number,
	height: number,
	accentColor: string,
	ff: string,
	secondaryColor: string
) {
	ctx.save();
	const fontSize = Math.round(width * 0.045);
	ctx.font = `700 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const maxW = width * 0.85;
	let lines = wrapText(ctx, name, maxW);
	if (lines.length > 2) {
		lines.length = 2;
		let last = lines[1];
		while (last.length > 1 && ctx.measureText(last + '...').width > maxW) {
			last = last.slice(0, -1);
		}
		lines[1] = last.trimEnd() + '...';
	}

	const lineH = fontSize * 1.3;
	const padX = Math.round(width * 0.05);
	const padY = Math.round(fontSize * 0.5);
	let maxLineW = 0;
	for (const line of lines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);

	const bgW = maxLineW + padX * 2;
	const bgH = lines.length * lineH + padY * 2;
	const bgX = width / 2 - bgW / 2;
	const topOffset = Math.round(height * 0.04);

	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.fill();

	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = hexToRgba(accentColor, 0.3);
	ctx.lineWidth = 1.5;
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.stroke();

	ctx.fillStyle = hexToRgba(accentColor, 0.5);
	canvasRoundRect(ctx, bgX + 16, topOffset + bgH - 2.5, bgW - 32, 2.5, 1.25);
	ctx.fill();

	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 6;
	ctx.shadowOffsetY = 2;
	ctx.fillStyle = '#FFFFFF';
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], width / 2, topOffset + padY + lineH / 2 + i * lineH);
	}

	ctx.restore();
}

function drawAddressBanner(
	ctx: CanvasRenderingContext2D,
	address: string,
	width: number,
	height: number,
	accentColor: string,
	ff: string,
	secondaryColor: string
) {
	ctx.save();
	const fontSize = Math.round(width * 0.028);
	ctx.font = `500 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const maxW = width * 0.85;
	let lines = wrapText(ctx, address, maxW);
	if (lines.length > 2) {
		lines.length = 2;
		let last = lines[1];
		while (last.length > 1 && ctx.measureText(last + '...').width > maxW) {
			last = last.slice(0, -1);
		}
		lines[1] = last.trimEnd() + '...';
	}

	const lineH = fontSize * 1.4;
	const padX = Math.round(width * 0.04);
	const padY = Math.round(fontSize * 0.5);
	let maxLineW = 0;
	for (const line of lines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);

	const bgW = maxLineW + padX * 2;
	const bgH = lines.length * lineH + padY * 2;
	const bgX = width / 2 - bgW / 2;
	const bottomOffset = Math.round(height * 0.04);
	const bgY = height - bottomOffset - bgH;

	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 14);
	ctx.fill();

	ctx.shadowColor = 'transparent';
	ctx.fillStyle = hexToRgba(accentColor, 0.5);
	canvasRoundRect(ctx, bgX + 14, bgY, bgW - 28, 2.5, 1.25);
	ctx.fill();

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], width / 2, bgY + padY + lineH / 2 + i * lineH);
	}

	ctx.restore();
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, accentColor: string) {
	ctx.save();

	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 4;

	ctx.beginPath();
	ctx.arc(x, y, 22, 0, Math.PI * 2);
	ctx.fillStyle = 'white';
	ctx.fill();
	ctx.shadowColor = 'transparent';

	ctx.beginPath();
	ctx.arc(x, y, 17, 0, Math.PI * 2);
	ctx.fillStyle = accentColor;
	ctx.fill();

	ctx.beginPath();
	ctx.arc(x, y, 6, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.7)';
	ctx.fill();

	ctx.restore();
}
