/**
 * Barrel re-export for the video-rendering service modules.
 *
 * The original mapRenderer.ts was 2474 lines covering five responsibilities.
 * It has been split into focused modules:
 *
 *   timingConfig       → shared animation timing constants
 *   canvasDraw         → pure 2D-context primitives (pills, pins, stats, ...)
 *   mapCore            → MapLibre lifecycle + image/route helpers
 *   titleRenderer      → title & outro cards (MediaRecorder + WebCodecs variants)
 *   animationRenderer  → per-location fly-to
 *   routeRenderer      → final route map
 *
 * Importing `./mapRenderer` remains valid for callers that want the combined
 * surface. New code should import the specific module it needs.
 */

export {
	TARGET_FPS,
	FLY_TO_DURATION,
	FIRST_HOLD_MS,
	ZOOM_OUT_MS,
	PAUSE_MS,
	ZOOM_IN_MS,
	HOLD_MS,
	FINAL_MAP_DURATION,
	FIRST_TOTAL_MS,
	ZOOM_IN_AT,
	OVERLAY_AT,
	SUBSEQUENT_TOTAL_MS,
	CLOSE_ZOOM,
	FIRST_FLY_DURATION_SEC,
	SUBSEQUENT_FLY_DURATION_SEC,
	FINAL_MAP_DURATION_SEC
} from './timingConfig';

export {
	TRANSPORT_ICONS,
	canvasRoundRect,
	hexToRgba,
	luminance,
	drawStar,
	wrapText,
	drawVignette,
	drawPinOnCanvas,
	drawLocationLowerThird,
	drawStatsOnCanvas,
	drawCoverFit
} from './canvasDraw';

export {
	getResolution,
	createOffscreenMap,
	destroyMap,
	waitForIdle,
	preWarmTileCache,
	addRouteLine,
	loadImageFromFile,
	loadImageFromUrl
} from './mapCore';

export type { TitleCardOpts, OutroCardOpts } from './titleRenderer';

export {
	drawTitleCardToCanvas,
	generateTitleCardFrames,
	drawOutroCardToCanvas,
	generateOutroCardFrames
} from './titleRenderer';

export { drawFlyToToCanvas, drawFlyToWithEncoder } from './animationRenderer';

export { drawFinalRouteToCanvas, drawFinalRouteWithEncoder } from './routeRenderer';
