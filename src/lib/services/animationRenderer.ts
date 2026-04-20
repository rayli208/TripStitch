/**
 * Per-location fly-to animation rendering.
 *
 * Two variants with identical visual output:
 *   - drawFlyToToCanvas   → MediaRecorder path; rAF-driven, uses PauseClock
 *   - drawFlyToWithEncoder → WebCodecs path; rAF-gated frame emission
 *
 * The first location fades in from zoom 10 → CLOSE_ZOOM.
 * Subsequent locations zoom out to an overview that fits both pins,
 * pause, then zoom into the new pin. Pin + lower-third fade in once the
 * camera has settled.
 */
import maplibregl from 'maplibre-gl';
import type { Location, TransportMode } from '$lib/types';
import type { PauseClock } from './exportGuard';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import {
	drawVignette,
	drawPinOnCanvas,
	drawLocationLowerThird
} from './canvasDraw';
import {
	TARGET_FPS,
	FLY_TO_DURATION,
	FIRST_TOTAL_MS,
	ZOOM_OUT_MS,
	ZOOM_IN_MS,
	ZOOM_IN_AT,
	OVERLAY_AT,
	SUBSEQUENT_TOTAL_MS,
	CLOSE_ZOOM
} from './timingConfig';

type FrameCallback = (ctx: CanvasRenderingContext2D) => void;

/**
 * Draw fly-to directly to a provided canvas context (MediaRecorder path).
 * For the first location (prevLocation=null): map must already be at zoom 10 on the location.
 * For subsequent locations: map must be at CLOSE_ZOOM on prevLocation.
 */
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

	function drawMapFrame(
		elapsed: number,
		overlayFn: (ctx: CanvasRenderingContext2D, elapsed: number) => void
	) {
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(mapCanvas, 0, 0, width, height);
		overlayFn(ctx, elapsed);
		frameCallback?.(ctx);
	}

	if (!prevLocation) {
		console.log(
			`[AnimationRenderer] drawFlyToToCanvas (first): "${location.name}" — flyTo=${FLY_TO_DURATION}ms`
		);
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
				if (elapsed >= totalMs) {
					resolve();
					return;
				}
				if (document.hidden) {
					requestAnimationFrame(frame);
					return;
				}
				drawMapFrame(elapsed, (ctx2, el) => {
					drawVignette(ctx2, width, height);
					if (el >= FLY_TO_DURATION) {
						const fadeAlpha = Math.min(1, (el - FLY_TO_DURATION) / 400);
						ctx2.globalAlpha = fadeAlpha;
						const point = map.project([location.lng, location.lat]);
						drawPinOnCanvas(
							ctx2,
							point.x,
							point.y,
							displayName,
							titleColor,
							ff,
							location.rating,
							false
						);
						drawLocationLowerThird(
							ctx2,
							width,
							height,
							displayName,
							locationIndex,
							totalLocations,
							titleColor,
							ff,
							location.rating,
							null,
							secondaryColor
						);
						ctx2.globalAlpha = 1;
					}
				});
				frameCount++;
				requestAnimationFrame(frame);
			};
			frame();
		});
		drawMapFrame(totalMs, (ctx2) => {
			drawVignette(ctx2, width, height);
			const point = map.project([location.lng, location.lat]);
			drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
			drawLocationLowerThird(
				ctx2,
				width,
				height,
				displayName,
				locationIndex,
				totalLocations,
				titleColor,
				ff,
				location.rating,
				null,
				secondaryColor
			);
		});
		frameCount++;
		const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
		console.log(
			`[AnimationRenderer] drawFlyToToCanvas (first) done: ${frameCount} frames, wall=${wallTime}s`
		);
		return;
	}

	console.log(
		`[AnimationRenderer] drawFlyToToCanvas (transition): "${prevLocation.name}" → "${location.name}"`
	);

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
	let frameCount = 0;
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= SUBSEQUENT_TOTAL_MS) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}

			if (elapsed >= ZOOM_IN_AT && !phase2Started) {
				phase2Started = true;
				console.log(
					`[AnimationRenderer] phase 2 zoom-in at elapsed=${elapsed.toFixed(0)}ms (target: ${ZOOM_IN_AT}ms)`
				);
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
					if (
						prevPoint.x > -50 &&
						prevPoint.x < width + 50 &&
						prevPoint.y > -50 &&
						prevPoint.y < height + 50
					) {
						drawPinOnCanvas(ctx2, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
					}
					ctx2.globalAlpha = 1;
				}
				if (el >= OVERLAY_AT) {
					const fadeAlpha = Math.min(1, (el - OVERLAY_AT) / 400);
					ctx2.globalAlpha = fadeAlpha;
					const point = map.project([location.lng, location.lat]);
					drawPinOnCanvas(
						ctx2,
						point.x,
						point.y,
						displayName,
						titleColor,
						ff,
						location.rating,
						false
					);
					drawLocationLowerThird(
						ctx2,
						width,
						height,
						displayName,
						locationIndex,
						totalLocations,
						titleColor,
						ff,
						location.rating,
						transportMode,
						secondaryColor
					);
					ctx2.globalAlpha = 1;
				}
			});
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawMapFrame(SUBSEQUENT_TOTAL_MS, (ctx2) => {
		drawVignette(ctx2, width, height);
		const point = map.project([location.lng, location.lat]);
		drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
		drawLocationLowerThird(
			ctx2,
			width,
			height,
			displayName,
			locationIndex,
			totalLocations,
			titleColor,
			ff,
			location.rating,
			transportMode,
			secondaryColor
		);
	});
	frameCount++;
	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(
		`[AnimationRenderer] drawFlyToToCanvas (transition) done: "${prevLocation.name}" → "${location.name}", ${frameCount} frames, wall=${wallTime}s`
	);
}

/**
 * Same visual behavior as drawFlyToToCanvas, but emits discrete frames to an
 * encoder (WebCodecs path) instead of relying on captureStream. Drops the
 * PauseClock dependency because the WebCodecs pipeline handles pause elsewhere.
 */
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

	function drawMapFrame(
		elapsed: number,
		overlayFn: (ctx: CanvasRenderingContext2D, elapsed: number) => void
	) {
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
				if (elapsed >= FIRST_TOTAL_MS) {
					resolve();
					return;
				}
				if (document.hidden) {
					requestAnimationFrame(frame);
					return;
				}
				if (now - lastFrameTime >= frameIntervalMs) {
					drawMapFrame(elapsed, (ctx2, el) => {
						drawVignette(ctx2, width, height);
						if (el >= FLY_TO_DURATION) {
							const fadeAlpha = Math.min(1, (el - FLY_TO_DURATION) / 400);
							ctx2.globalAlpha = fadeAlpha;
							const point = map.project([location.lng, location.lat]);
							drawPinOnCanvas(
								ctx2,
								point.x,
								point.y,
								displayName,
								titleColor,
								ff,
								location.rating,
								false
							);
							drawLocationLowerThird(
								ctx2,
								width,
								height,
								displayName,
								locationIndex,
								totalLocations,
								titleColor,
								ff,
								location.rating,
								null,
								secondaryColor
							);
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
		drawMapFrame(FIRST_TOTAL_MS, (ctx2) => {
			drawVignette(ctx2, width, height);
			const point = map.project([location.lng, location.lat]);
			drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
			drawLocationLowerThird(
				ctx2,
				width,
				height,
				displayName,
				locationIndex,
				totalLocations,
				titleColor,
				ff,
				location.rating,
				null,
				secondaryColor
			);
		});
		onFrame(canvas);
		frameCount++;
		console.log(`[AnimationRenderer] drawFlyToWithEncoder (first) done: ${frameCount} frames`);
		return;
	}

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
			if (elapsed >= SUBSEQUENT_TOTAL_MS) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}

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
						if (
							prevPoint.x > -50 &&
							prevPoint.x < width + 50 &&
							prevPoint.y > -50 &&
							prevPoint.y < height + 50
						) {
							drawPinOnCanvas(ctx2, prevPoint.x, prevPoint.y, '', titleColor, ff, null, false);
						}
						ctx2.globalAlpha = 1;
					}
					if (el >= OVERLAY_AT) {
						const fadeAlpha = Math.min(1, (el - OVERLAY_AT) / 400);
						ctx2.globalAlpha = fadeAlpha;
						const point = map.project([location.lng, location.lat]);
						drawPinOnCanvas(
							ctx2,
							point.x,
							point.y,
							displayName,
							titleColor,
							ff,
							location.rating,
							false
						);
						drawLocationLowerThird(
							ctx2,
							width,
							height,
							displayName,
							locationIndex,
							totalLocations,
							titleColor,
							ff,
							location.rating,
							transportMode,
							secondaryColor
						);
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
	drawMapFrame(SUBSEQUENT_TOTAL_MS, (ctx2) => {
		drawVignette(ctx2, width, height);
		const point = map.project([location.lng, location.lat]);
		drawPinOnCanvas(ctx2, point.x, point.y, displayName, titleColor, ff, location.rating, false);
		drawLocationLowerThird(
			ctx2,
			width,
			height,
			displayName,
			locationIndex,
			totalLocations,
			titleColor,
			ff,
			location.rating,
			transportMode,
			secondaryColor
		);
	});
	onFrame(canvas);
	frameCount++;
	console.log(
		`[AnimationRenderer] drawFlyToWithEncoder (transition) done: ${frameCount} frames`
	);
}
