/**
 * Shared timing + zoom constants for map animations.
 * Used by animationRenderer, routeRenderer, and any code that needs to align
 * segment durations with the visual pacing of fly-to sequences.
 */

export const TARGET_FPS = 30;

export const FLY_TO_DURATION = 2000; // first-location fly-in duration
export const FIRST_HOLD_MS = 2500; // hold after first fly-in
export const ZOOM_OUT_MS = 1200; // subsequent: zoom out to overview
export const PAUSE_MS = 600; // subsequent: pause at overview
export const ZOOM_IN_MS = 1800; // subsequent: zoom in to new location
export const HOLD_MS = 2200; // subsequent: hold on new location
export const FINAL_MAP_DURATION = 5000;

export const FIRST_TOTAL_MS = FLY_TO_DURATION + FIRST_HOLD_MS; // 4500
export const ZOOM_IN_AT = ZOOM_OUT_MS + PAUSE_MS; // 1800
export const OVERLAY_AT = ZOOM_IN_AT + ZOOM_IN_MS; // 3600
export const SUBSEQUENT_TOTAL_MS = OVERLAY_AT + HOLD_MS; // 5800

export const CLOSE_ZOOM = 18;

export const FIRST_FLY_DURATION_SEC = FIRST_TOTAL_MS / 1000; // 4.5
export const SUBSEQUENT_FLY_DURATION_SEC = SUBSEQUENT_TOTAL_MS / 1000; // 5.8
export const FINAL_MAP_DURATION_SEC = FINAL_MAP_DURATION / 1000; // 5
