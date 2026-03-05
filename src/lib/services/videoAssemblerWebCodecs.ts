/**
 * WebCodecs video assembler: fast pipeline using VideoEncoder + mp4-muxer.
 * Offline segments (title, photos, flashes) run in tight for-loops.
 * Video clips play at 4x via requestVideoFrameCallback.
 * Map animations remain real-time (MapLibre dependency).
 * Output: MP4 (H.264).
 */
import type { Trip, AspectRatio, MapStyle } from '$lib/types';
import type { AssemblyResult, ProgressCallback, VideoSegmentInfo } from './videoAssembler';
import {
	getResolution,
	loadImageFromUrl,
	createOffscreenMap,
	destroyMap,
	waitForIdle,
	generateTitleCardFrames,
	drawFlyToWithEncoder,
	drawFinalRouteWithEncoder
} from './mapRenderer';
import {
	generatePhotoAnimationFrames,
	generateWhiteFlashFrames,
	playVideoAccelerated
} from './videoProcessor';
import { createFrameEncoder, type FrameEncoder } from './webCodecsEncoder';
import { createWebCodecsExportGuard, type WebCodecsExportGuard } from './exportGuard';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';
import { suggestTransportMode } from '$lib/utils/distance';
import { fetchAllRouteGeometries } from './routeService';
import maplibregl from 'maplibre-gl';

const TARGET_FPS = 30;

export async function assembleVideoWebCodecs(
	trip: Trip,
	aspectRatio: AspectRatio,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	mapStyle: MapStyle = 'streets',
	logoUrl?: string | null,
	secondaryColor: string = '#0a0f1e'
): Promise<AssemblyResult> {
	const assemblyStart = performance.now();
	console.log('[TripStitch/WebCodecs] ═══════════════════════════════════════════════════════');
	console.log('[TripStitch/WebCodecs] Starting WebCodecs video assembly', { tripId: trip.id, aspectRatio, mapStyle });
	const { width, height } = getResolution(aspectRatio);
	console.log(`[TripStitch/WebCodecs] Target resolution: ${width}x${height}, codec: H.264 (MP4)`);

	const locations = [...trip.locations].sort((a, b) => a.order - b.order);
	console.log('[TripStitch/WebCodecs] Locations:', locations.length, locations.map(l => l.name));

	const tripFontId = trip.fontId ?? 'inter';

	// Calculate total steps
	let totalSteps = 1 + 1 + 1; // title + route + finalize
	for (const loc of locations) {
		totalSteps += 1; // map fly-to
		if (loc.clips.some((c) => c.file)) {
			totalSteps += 1; // clip processing
		}
	}

	let currentStep = 0;
	const timeline: VideoSegmentInfo[] = [];
	let timelineCursor = 0;

	function addToTimeline(id: string, label: string, durationSec: number, type: VideoSegmentInfo['type']) {
		timeline.push({ id, label, startSec: timelineCursor, durationSec, type });
		timelineCursor += durationSec;
	}

	function emit(step: string, message: string) {
		currentStep++;
		console.log(`[TripStitch/WebCodecs] Step ${currentStep}/${totalSteps}: ${message}`);
		onProgress?.({ step, message, current: currentStep, total: totalSteps });
	}

	function checkAbort() {
		if (abortSignal?.aborted) {
			console.log('[TripStitch/WebCodecs] Export cancelled by user');
			throw new Error('Export cancelled');
		}
	}

	// --- Setup ---
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	const encoder = createFrameEncoder({
		width, height, fps: TARGET_FPS, bitrate: 5_000_000
	});

	let map: maplibregl.Map | null = null;
	let mapContainer: HTMLDivElement | null = null;
	let guard: WebCodecsExportGuard | null = null;

	try {
		// Load logo overlay
		let frameOverlay: ((ctx: CanvasRenderingContext2D) => void) | undefined;
		if (trip.showLogoOnTitle && logoUrl) {
			try {
				const logoImage = await loadImageFromUrl(logoUrl);
				const logoSize = Math.round(width * 0.12);
				const margin = Math.round(width * 0.04);
				const scale = Math.min(logoSize / logoImage.naturalWidth, logoSize / logoImage.naturalHeight);
				const drawW = logoImage.naturalWidth * scale;
				const drawH = logoImage.naturalHeight * scale;
				const lx = width - margin - drawW;
				const ly = height - margin - drawH;
				frameOverlay = (ctx) => {
					ctx.save();
					ctx.globalAlpha = 0.8;
					ctx.drawImage(logoImage, lx, ly, drawW, drawH);
					ctx.restore();
				};
			} catch {
				console.warn('[TripStitch/WebCodecs] Failed to load logo, skipping');
			}
		}

		guard = createWebCodecsExportGuard();

		const onFrame = (canvas: HTMLCanvasElement) => {
			encoder.encodeFrame(canvas);
		};

		// ── 1. TITLE CARD (OFFLINE) ──
		console.log('[TripStitch/WebCodecs] ── Phase 1: Title Card (offline) ──');
		const titleStart = performance.now();
		checkAbort();
		emit('title', 'Creating title card...');
		await generateTitleCardFrames(canvas, ctx, {
			title: trip.title || 'My Trip',
			titleColor: trip.titleColor || '#FFFFFF',
			aspectRatio,
			description: trip.titleDescription || undefined,
			mediaFile: trip.titleMediaFile,
			logoUrl: logoUrl,
			showLogo: trip.showLogoOnTitle,
			fontId: tripFontId,
			secondaryColor
		}, TARGET_FPS, onFrame, frameOverlay);
		console.log(`[TripStitch/WebCodecs] Title card: ${((performance.now() - titleStart) / 1000).toFixed(1)}s wall, ${encoder.frameCount} frames total`);
		addToTimeline('title', trip.title || 'Title', 2.5, 'title');

		// ── 2. CREATE REUSABLE MAP ──
		console.log('[TripStitch/WebCodecs] ── Phase 2: Create Reusable Map ──');
		const firstLoc = locations[0];
		const result = await createOffscreenMap(
			width, height,
			[firstLoc.lng, firstLoc.lat], 10,
			mapStyle
		);
		map = result.map;
		mapContainer = result.container;

		// Pre-fetch routes in background
		const routePromise = locations.length >= 2
			? fetchAllRouteGeometries(locations).catch((err) => {
				console.warn('[TripStitch/WebCodecs] Route fetch failed:', err);
				return undefined;
			})
			: Promise.resolve(undefined);

		// ── 3. PROCESS EACH LOCATION ──
		console.log('[TripStitch/WebCodecs] ── Phase 3: Process Locations ──');
		for (let i = 0; i < locations.length; i++) {
			checkAbort();
			const location = locations[i];
			const prevLocation = i > 0 ? locations[i - 1] : null;

			console.log(`[TripStitch/WebCodecs] ── Location ${i + 1}/${locations.length}: "${location.name}" ──`);

			let transportMode = location.transportMode;
			if (!transportMode && prevLocation) {
				transportMode = suggestTransportMode(
					prevLocation.lat, prevLocation.lng,
					location.lat, location.lng
				);
			}

			// Wait for tiles (no encoding)
			if (i > 0) {
				await waitForIdle(map);
			}

			// ── FLY-TO (REAL-TIME) ──
			const flyStart = performance.now();
			emit(`map-${location.id}`, `Rendering map for ${location.name}...`);

			await drawFlyToWithEncoder(
				map, canvas, ctx, location, prevLocation, transportMode,
				width, height,
				trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
				onFrame, frameOverlay
			);

			const displayName = location.label || location.name.split(',')[0];
			const flyDuration = !prevLocation ? 4.0 : 5.9;
			console.log(`[TripStitch/WebCodecs] Fly-to: ${((performance.now() - flyStart) / 1000).toFixed(1)}s wall`);
			addToTimeline(`map-${location.id}`, displayName, flyDuration, 'map');

			checkAbort();

			// ── CLIPS ──
			const clipsWithFiles = [...location.clips]
				.filter((c) => c.file)
				.sort((a, b) => a.order - b.order);

			if (clipsWithFiles.length > 0) {
				const clipStart = performance.now();
				emit(`clip-${location.id}`, `Processing ${clipsWithFiles.length} clip(s) from ${location.name}...`);
				let combinedDuration = 0;

				// White flash before clips (OFFLINE)
				generateWhiteFlashFrames(canvas, width, height, 0.1, TARGET_FPS, onFrame, frameOverlay);
				timelineCursor += 0.1;

				for (let ci = 0; ci < clipsWithFiles.length; ci++) {
					const clip = clipsWithFiles[ci];
					checkAbort();
					if (clip.type === 'video' && clip.file) {
						console.log(`[TripStitch/WebCodecs] Video clip ${ci + 1}/${clipsWithFiles.length} (4x accelerated)`);
						const dur = await playVideoAccelerated(
							clip.file, canvas, width, height,
							30, TARGET_FPS, 4,
							onFrame, frameOverlay,
							clip.trimStartSec ?? 0, clip.trimEndSec
						);
						combinedDuration += dur;
					} else if (clip.type === 'photo' && clip.file) {
						console.log(`[TripStitch/WebCodecs] Photo animation ${ci + 1}/${clipsWithFiles.length} (offline)`);
						await generatePhotoAnimationFrames(
							clip.file, canvas, width, height,
							clip.animationStyle, 3, TARGET_FPS,
							onFrame, frameOverlay
						);
						combinedDuration += 3;
					}
				}

				addToTimeline(`clip-${location.id}`, displayName, combinedDuration, 'clip');

				// White flash after clips (OFFLINE)
				generateWhiteFlashFrames(canvas, width, height, 0.1, TARGET_FPS, onFrame, frameOverlay);
				timelineCursor += 0.1;

				console.log(`[TripStitch/WebCodecs] Clips: ${((performance.now() - clipStart) / 1000).toFixed(1)}s wall, ${combinedDuration.toFixed(1)}s video`);
			}
		}

		checkAbort();

		// ── 4. FINAL ROUTE (REAL-TIME) ──
		console.log('[TripStitch/WebCodecs] ── Phase 4: Final Route Map ──');
		emit('route', 'Drawing final route...');
		const routeGeometries = await routePromise;

		const bounds = new maplibregl.LngLatBounds();
		for (const loc of locations) bounds.extend([loc.lng, loc.lat]);
		if (routeGeometries) {
			for (const geom of routeGeometries) {
				if (geom) {
					for (const coord of geom.coordinates) bounds.extend(coord);
				}
			}
		}

		const pad = Math.min(width, height) * 0.14;
		const topPad = pad + 100;
		const bottomPad = pad + Math.round(height * 0.20);
		map.fitBounds(bounds, { padding: { top: topPad, bottom: bottomPad, left: pad, right: pad }, duration: 0 });
		await sleep(500);
		await waitForIdle(map);

		const miles = totalDistance(locations);
		const minutes = totalTravelTime(locations);

		await drawFinalRouteWithEncoder(
			map, canvas, ctx, locations,
			{ stops: locations.length, miles, minutes },
			width, height,
			routeGeometries,
			trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
			onFrame, frameOverlay
		);
		addToTimeline('route', 'Final Route', 6, 'route');

		checkAbort();

		// ── 5. FINALIZE ──
		console.log('[TripStitch/WebCodecs] ── Phase 5: Finalize ──');
		emit('finalize', 'Finalizing video...');

		guard.destroy();
		guard = null;

		const finalBlob = await encoder.finalize();
		console.log(`[TripStitch/WebCodecs] MP4 blob: ${(finalBlob.size / 1024 / 1024).toFixed(1)} MB`);

		if (map && mapContainer) {
			destroyMap(map, mapContainer);
			map = null;
			mapContainer = null;
		}

		const url = URL.createObjectURL(finalBlob);
		const totalTime = ((performance.now() - assemblyStart) / 1000).toFixed(1);
		console.log('[TripStitch/WebCodecs] ═══════════════════════════════════════════════════════');
		console.log(`[TripStitch/WebCodecs] VIDEO ASSEMBLY COMPLETE`);
		console.log(`[TripStitch/WebCodecs]   Total wall time: ${totalTime}s`);
		console.log(`[TripStitch/WebCodecs]   Estimated video duration: ${timelineCursor.toFixed(1)}s`);
		console.log(`[TripStitch/WebCodecs]   Final blob: ${(finalBlob.size / 1024 / 1024).toFixed(1)} MB`);
		console.log(`[TripStitch/WebCodecs]   Total frames encoded: ${encoder.frameCount}`);
		console.log('[TripStitch/WebCodecs] ═══════════════════════════════════════════════════════');
		return { blob: finalBlob, url, segments: timeline };
	} catch (err) {
		console.error('[TripStitch/WebCodecs] Assembly failed:', err);
		if (guard) {
			try { guard.destroy(); } catch { /* ignore */ }
		}
		if (map && mapContainer) {
			try { destroyMap(map, mapContainer); } catch { /* ignore */ }
		}
		throw err;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
