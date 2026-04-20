/**
 * Final route map rendering.
 *
 * Both variants animate route segments drawing in sequentially over 2s,
 * then hold the full route with pins + stats bar:
 *   - drawFinalRouteToCanvas   → MediaRecorder path; rAF-driven, uses PauseClock
 *   - drawFinalRouteWithEncoder → WebCodecs path; rAF-gated frame emission
 *
 * Callers are expected to have already run `fitBounds` + `waitForIdle` on the
 * supplied map — this renderer does not reposition the camera.
 */
import maplibregl from 'maplibre-gl';
import type { Location } from '$lib/types';
import type { PauseClock } from './exportGuard';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import {
	drawVignette,
	drawPinOnCanvas,
	drawStatsOnCanvas,
	hexToRgba
} from './canvasDraw';
import { addRouteLine } from './mapCore';
import { TARGET_FPS, FINAL_MAP_DURATION } from './timingConfig';

type FrameCallback = (ctx: CanvasRenderingContext2D) => void;

/** Draw the final route animation to a provided canvas context (MediaRecorder path). */
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

	console.log(
		`[RouteRenderer] drawFinalRouteToCanvas: ${locations.length} locations, ${totalSegments} segments, segmentDur=${segmentDuration.toFixed(0)}ms, totalDur=${FINAL_MAP_DURATION}ms`
	);

	let segmentsAdded = 0;

	const startTime = performance.now();
	let frameCount = 0;
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= FINAL_MAP_DURATION) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}

			while (segmentsAdded < totalSegments && elapsed >= segmentsAdded * segmentDuration) {
				const from = locations[segmentsAdded];
				const to = locations[segmentsAdded + 1];
				const mode = to.transportMode ?? 'drove';
				const geom = routeGeometries?.[segmentsAdded];
				addRouteLine(map, from, to, mode, `route-${segmentsAdded}`, geom?.coordinates, titleColor);
				console.log(
					`[RouteRenderer] added segment ${segmentsAdded + 1}/${totalSegments} at elapsed=${elapsed.toFixed(0)}ms`
				);
				segmentsAdded++;
			}

			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(mapCanvas, 0, 0, width, height);
			drawVignette(ctx, width, height, 0.7);
			for (const loc of locations) {
				const point = map.project([loc.lng, loc.lat]);
				const label = loc.label || loc.name.split(',')[0];
				drawPinOnCanvas(
					ctx,
					point.x,
					point.y,
					label,
					titleColor,
					ff,
					loc.rating,
					true,
					hexToRgba(secondaryColor, 0.88)
				);
			}
			drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
			frameCallback?.(ctx);
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	drawVignette(ctx, width, height, 0.7);
	for (const loc of locations) {
		const point = map.project([loc.lng, loc.lat]);
		const label = loc.label || loc.name.split(',')[0];
		drawPinOnCanvas(
			ctx,
			point.x,
			point.y,
			label,
			titleColor,
			ff,
			loc.rating,
			true,
			hexToRgba(secondaryColor, 0.88)
		);
	}
	drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
	frameCallback?.(ctx);
	frameCount++;

	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(
		`[RouteRenderer] drawFinalRouteToCanvas done: ${frameCount} frames, ${segmentsAdded}/${totalSegments} segments, wall=${wallTime}s`
	);
}

/** Draw the final route animation to a frame encoder (WebCodecs path). */
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

	console.log(
		`[RouteRenderer] drawFinalRouteWithEncoder: ${locations.length} locations, ${totalSegments} segments`
	);

	await new Promise<void>((resolve) => {
		const frame = () => {
			const now = performance.now();
			const elapsed = now - startTime;
			if (elapsed >= FINAL_MAP_DURATION) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}

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
					drawPinOnCanvas(
						ctx,
						point.x,
						point.y,
						label,
						titleColor,
						ff,
						loc.rating,
						true,
						hexToRgba(secondaryColor, 0.88)
					);
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
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(mapCanvas, 0, 0, width, height);
	drawVignette(ctx, width, height, 0.7);
	for (const loc of locations) {
		const point = map.project([loc.lng, loc.lat]);
		const label = loc.label || loc.name.split(',')[0];
		drawPinOnCanvas(
			ctx,
			point.x,
			point.y,
			label,
			titleColor,
			ff,
			loc.rating,
			true,
			hexToRgba(secondaryColor, 0.88)
		);
	}
	drawStatsOnCanvas(ctx, stats, width, height, titleColor, ff, secondaryColor);
	frameCallback?.(ctx);
	onFrame(canvas);
	frameCount++;

	console.log(
		`[RouteRenderer] drawFinalRouteWithEncoder done: ${frameCount} frames, ${segmentsAdded}/${totalSegments} segments`
	);
}
