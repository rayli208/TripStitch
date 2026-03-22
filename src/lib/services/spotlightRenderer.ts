/**
 * Location Spotlight renderer: generates a ~5-second MP4 video
 * that starts with a town boundary overview and zooms into a pinned location.
 *
 * Uses WebCodecs (fast path) or MediaRecorder (fallback) — same dual-pipeline
 * approach as the main trip video assembler.
 */
import maplibregl from 'maplibre-gl';
import type { MapStyle, AspectRatio } from '$lib/types';
import { STYLE_URLS } from '$lib/constants/map';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import { getResolution } from './mapRenderer';
import { canUseWebCodecs, getSupportedMimeType } from '$lib/utils/browserCompat';

const TARGET_FPS = 30;

// ── Animation timing ──
const HOLD_OVERVIEW_MS = 1500; // show town boundary
const FLY_DURATION_MS = 2500; // fly to pin
const HOLD_PIN_MS = 1000; // hold on pin
const TOTAL_DURATION_MS = HOLD_OVERVIEW_MS + FLY_DURATION_MS + HOLD_PIN_MS; // 5000ms

const PIN_ZOOM = 16;

export interface SpotlightConfig {
	locationName: string;
	address: string;
	boundaryGeoJSON: GeoJSON.Geometry;
	/** [west, south, east, north] */
	boundaryBbox: [number, number, number, number];
	pinLocation: [number, number]; // [lng, lat]
	mapStyle: MapStyle;
	accentColor: string;
	fontId: string;
	aspectRatio: AspectRatio;
	secondaryColor: string;
}

export interface SpotlightResult {
	blob: Blob;
	url: string;
}

export async function renderSpotlight(
	config: SpotlightConfig,
	onProgress?: (msg: string) => void,
	abortSignal?: AbortSignal
): Promise<SpotlightResult> {
	const { width, height } = getResolution(config.aspectRatio);
	const ff = fontFamily(config.fontId);
	await loadFont(config.fontId);

	console.log(`[Spotlight] Starting render: ${width}x${height}, style=${config.mapStyle}`);
	onProgress?.('Creating map...');

	// ── Create offscreen map ──
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
		center: [
			(config.boundaryBbox[0] + config.boundaryBbox[2]) / 2,
			(config.boundaryBbox[1] + config.boundaryBbox[3]) / 2
		],
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

	// ── Add boundary polygon layers ──
	map.addSource('town-boundary', {
		type: 'geojson',
		data: { type: 'Feature', properties: {}, geometry: config.boundaryGeoJSON }
	});

	map.addLayer({
		id: 'boundary-fill',
		type: 'fill',
		source: 'town-boundary',
		paint: { 'fill-color': config.accentColor, 'fill-opacity': 0.18 }
	});

	map.addLayer({
		id: 'boundary-outline',
		type: 'line',
		source: 'town-boundary',
		paint: { 'line-color': config.accentColor, 'line-width': 5, 'line-opacity': 0.9 }
	});

	// Fit bounds to boundary
	const bounds = new maplibregl.LngLatBounds(
		[config.boundaryBbox[0], config.boundaryBbox[1]],
		[config.boundaryBbox[2], config.boundaryBbox[3]]
	);
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
	// Jump back to overview
	map.fitBounds(bounds, {
		padding: { top: pad + 60, bottom: pad + 60, left: pad, right: pad },
		duration: 0
	});
	await waitForIdle(map, 3000);

	if (abortSignal?.aborted) {
		cleanup(map, container);
		throw new Error('Export cancelled');
	}

	onProgress?.('Recording animation...');

	// ── Create output canvas ──
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	const mapCanvas = map.getCanvas();

	// ── Overlay drawing ──
	const drawOverlays = (elapsed: number) => {
		drawVignette(ctx, width, height);

		// Name banner at top (always visible)
		drawNameBanner(ctx, config.locationName, width, height, config.accentColor, ff, config.secondaryColor);

		// Pin + address appear after most of the flyTo is done
		const pinAppearAt = HOLD_OVERVIEW_MS + FLY_DURATION_MS * 0.7;
		if (elapsed >= pinAppearAt) {
			const fadeAlpha = Math.min(1, (elapsed - pinAppearAt) / 400);
			ctx.globalAlpha = fadeAlpha;
			const point = map.project(config.pinLocation);
			drawPin(ctx, point.x, point.y, config.accentColor);
			drawAddressBanner(ctx, config.address, width, height, config.accentColor, ff, config.secondaryColor);
			ctx.globalAlpha = 1;
		}
	};

	// ── Start flyTo at the right time ──
	let flyToStarted = false;
	const startFlyTo = (elapsed: number) => {
		if (!flyToStarted && elapsed >= HOLD_OVERVIEW_MS) {
			flyToStarted = true;
			map.flyTo({
				center: config.pinLocation,
				zoom: PIN_ZOOM,
				duration: FLY_DURATION_MS,
				essential: true
			});
		}
	};

	// ── Record: WebCodecs fast path or MediaRecorder fallback ──
	const useWebCodecs = await canUseWebCodecs(width, height);
	let blob: Blob;

	if (useWebCodecs) {
		console.log('[Spotlight] Using WebCodecs pipeline');
		const { createFrameEncoder } = await import('./webCodecsEncoder');
		const encoder = createFrameEncoder({ width, height, fps: TARGET_FPS, bitrate: 5_000_000 });
		const frameIntervalMs = 1000 / TARGET_FPS;
		let lastFrameTime = 0;

		await new Promise<void>((resolve) => {
			const start = performance.now();
			const draw = () => {
				if (abortSignal?.aborted) {
					resolve();
					return;
				}
				const now = performance.now();
				const elapsed = now - start;
				if (elapsed >= TOTAL_DURATION_MS) {
					resolve();
					return;
				}

				startFlyTo(elapsed);

				if (now - lastFrameTime >= frameIntervalMs) {
					ctx.clearRect(0, 0, width, height);
					ctx.drawImage(mapCanvas, 0, 0, width, height);
					drawOverlays(elapsed);
					encoder.encodeFrame(canvas);
					lastFrameTime = now;
				}

				requestAnimationFrame(draw);
			};
			draw();
		});

		// Final frame
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(mapCanvas, 0, 0, width, height);
		drawOverlays(TOTAL_DURATION_MS);
		encoder.encodeFrame(canvas);

		onProgress?.('Finalizing...');
		blob = await encoder.finalize();
	} else {
		console.log('[Spotlight] Using MediaRecorder fallback');
		const mimeType = getSupportedMimeType();
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

		await new Promise<void>((resolve) => {
			const start = performance.now();
			const draw = () => {
				if (abortSignal?.aborted) {
					resolve();
					return;
				}
				const elapsed = performance.now() - start;
				if (elapsed >= TOTAL_DURATION_MS) {
					resolve();
					return;
				}

				startFlyTo(elapsed);

				ctx.clearRect(0, 0, width, height);
				ctx.drawImage(mapCanvas, 0, 0, width, height);
				drawOverlays(elapsed);
				requestAnimationFrame(draw);
			};
			draw();
		});

		// Final frame + small buffer for MediaRecorder
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(mapCanvas, 0, 0, width, height);
		drawOverlays(TOTAL_DURATION_MS);
		await new Promise((r) => setTimeout(r, 100));

		recorder.stop();
		stream.getTracks().forEach((t) => t.stop());

		onProgress?.('Finalizing...');
		blob = await done;
	}

	cleanup(map, container);
	console.log(`[Spotlight] Render complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);

	const url = URL.createObjectURL(blob);
	return { blob, url };
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
	// Top gradient
	const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.18);
	topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
	topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = topGrad;
	ctx.fillRect(0, 0, width, height * 0.18);

	// Bottom gradient
	const botGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
	botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
	botGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.25)');
	botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
	ctx.fillStyle = botGrad;
	ctx.fillRect(0, height * 0.5, width, height * 0.5);
}

/** Draw the location name banner at the top of the frame */
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

	// Frosted glass background
	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.fill();

	// Accent border
	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = hexToRgba(accentColor, 0.3);
	ctx.lineWidth = 1.5;
	canvasRoundRect(ctx, bgX, topOffset, bgW, bgH, 16);
	ctx.stroke();

	// Accent bottom line
	ctx.fillStyle = hexToRgba(accentColor, 0.5);
	canvasRoundRect(ctx, bgX + 16, topOffset + bgH - 2.5, bgW - 32, 2.5, 1.25);
	ctx.fill();

	// Text
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 6;
	ctx.shadowOffsetY = 2;
	ctx.fillStyle = '#FFFFFF';
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], width / 2, topOffset + padY + lineH / 2 + i * lineH);
	}

	ctx.restore();
}

/** Draw the address banner at the bottom of the frame */
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

	// Frosted glass background
	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.78);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 14);
	ctx.fill();

	// Accent top line
	ctx.shadowColor = 'transparent';
	ctx.fillStyle = hexToRgba(accentColor, 0.5);
	canvasRoundRect(ctx, bgX + 14, bgY, bgW - 28, 2.5, 1.25);
	ctx.fill();

	// Text
	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], width / 2, bgY + padY + lineH / 2 + i * lineH);
	}

	ctx.restore();
}

/** Draw a map pin (colored dot with white rings) */
function drawPin(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	accentColor: string
) {
	ctx.save();

	// Shadow
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 4;

	// Outer white ring
	ctx.beginPath();
	ctx.arc(x, y, 22, 0, Math.PI * 2);
	ctx.fillStyle = 'white';
	ctx.fill();
	ctx.shadowColor = 'transparent';

	// Inner colored dot
	ctx.beginPath();
	ctx.arc(x, y, 17, 0, Math.PI * 2);
	ctx.fillStyle = accentColor;
	ctx.fill();

	// Center white dot
	ctx.beginPath();
	ctx.arc(x, y, 6, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.7)';
	ctx.fill();

	ctx.restore();
}
