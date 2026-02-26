import type { Trip, AspectRatio, MapStyle } from '$lib/types';
import {
	getResolution,
	loadImageFromUrl,
	createOffscreenMap,
	destroyMap,
	waitForIdle,
	drawTitleCardToCanvas,
	drawFlyToToCanvas,
	drawFinalRouteToCanvas
} from './mapRenderer';
import {
	playVideoToCanvas,
	drawPhotoAnimationToCanvas,
	drawWhiteFlashToCanvas
} from './videoProcessor';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';
import { suggestTransportMode } from '$lib/utils/distance';
import { fetchAllRouteGeometries } from './routeService';
import { getSupportedMimeType } from '$lib/utils/browserCompat';
import maplibregl from 'maplibre-gl';

export interface AssemblyProgress {
	step: string;
	message: string;
	current: number;
	total: number;
}

export interface VideoSegmentInfo {
	id: string;
	label: string;
	startSec: number;
	durationSec: number;
	type: 'title' | 'map' | 'clip' | 'route';
}

export interface AssemblyResult {
	blob: Blob;
	url: string;
	segments: VideoSegmentInfo[];
}

export type ProgressCallback = (progress: AssemblyProgress) => void;

/** Main pipeline: assembles the full TripStitch video using single-pass recording */
export async function assembleVideo(
	trip: Trip,
	aspectRatio: AspectRatio,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	mapStyle: MapStyle = 'streets',
	logoUrl?: string | null,
	secondaryColor: string = '#0a0f1e'
): Promise<AssemblyResult> {
	console.log('[TripStitch] Starting single-pass video assembly', { tripId: trip.id, aspectRatio });
	const { width, height } = getResolution(aspectRatio);
	console.log('[TripStitch] Target resolution:', width, 'x', height);

	const locations = [...trip.locations].sort((a, b) => a.order - b.order);
	console.log('[TripStitch] Locations to process:', locations.length, locations.map(l => l.name));

	const tripFontId = trip.fontId ?? 'inter';

	// Calculate total steps
	let totalSteps = 1 + 1 + 1; // title + route + finalize
	for (const loc of locations) {
		totalSteps += 1; // map fly-to
		if (loc.clips.some((c) => c.file)) {
			totalSteps += 1; // clip processing
		}
	}
	console.log('[TripStitch] Total steps:', totalSteps);

	let currentStep = 0;
	const timeline: VideoSegmentInfo[] = [];
	let timelineCursor = 0;

	function addToTimeline(id: string, label: string, durationSec: number, type: VideoSegmentInfo['type']) {
		timeline.push({ id, label, startSec: timelineCursor, durationSec, type });
		timelineCursor += durationSec;
	}

	function emit(step: string, message: string) {
		currentStep++;
		console.log(`[TripStitch] Step ${currentStep}/${totalSteps}: ${message}`);
		onProgress?.({ step, message, current: currentStep, total: totalSteps });
	}

	function checkAbort() {
		if (abortSignal?.aborted) {
			console.log('[TripStitch] Export cancelled by user');
			throw new Error('Export cancelled');
		}
	}

	// --- Single-pass setup ---
	const mimeType = getSupportedMimeType();
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	const stream = canvas.captureStream(30);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	// Create reusable map + load logo upfront
	let map: maplibregl.Map | null = null;
	let mapContainer: HTMLDivElement | null = null;

	try {
		// Load logo overlay function if enabled
		let frameOverlay: ((ctx: CanvasRenderingContext2D) => void) | undefined;
		if (trip.showLogoOnTitle && logoUrl) {
			try {
				const logoImage = await loadImageFromUrl(logoUrl);
				const logoSize = Math.round(width * 0.07);
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
				console.warn('[TripStitch] Failed to load logo for watermark, skipping');
			}
		}

		// Start recorder
		recorder.start();
		console.log('[TripStitch] Single-pass recorder started');

		// ── 1. TITLE CARD ──
		checkAbort();
		emit('title', 'Creating title card...');
		await drawTitleCardToCanvas(ctx, {
			title: trip.title || 'My Trip',
			titleColor: trip.titleColor || '#FFFFFF',
			aspectRatio,
			description: trip.titleDescription || undefined,
			mediaFile: trip.titleMediaFile,
			logoUrl: logoUrl,
			showLogo: trip.showLogoOnTitle,
			fontId: tripFontId,
			secondaryColor
		}, frameOverlay);
		addToTimeline('title', trip.title || 'Title', 2.5, 'title');

		// ── 2. CREATE REUSABLE MAP ──
		// Pause recorder while we set up the map
		recorder.pause();
		console.log('[TripStitch] Recorder paused for map creation');

		const firstLoc = locations[0];
		const result = await createOffscreenMap(
			width, height,
			[firstLoc.lng, firstLoc.lat], 10,
			mapStyle
		);
		map = result.map;
		mapContainer = result.container;
		console.log('[TripStitch] Reusable map created');

		recorder.resume();
		console.log('[TripStitch] Recorder resumed');

		// ── 3. PROCESS EACH LOCATION ──
		for (let i = 0; i < locations.length; i++) {
			checkAbort();
			const location = locations[i];
			const prevLocation = i > 0 ? locations[i - 1] : null;

			let transportMode = location.transportMode;
			if (!transportMode && prevLocation) {
				transportMode = suggestTransportMode(
					prevLocation.lat, prevLocation.lng,
					location.lat, location.lng
				);
			}

			// ── 3a. PREPARE MAP (paused) ──
			if (i > 0) {
				// For subsequent locations, pause to let the map transition to starting position
				recorder.pause();
				// Map is already at CLOSE_ZOOM on prev location from the last fly-to,
				// so no extra setup needed — drawFlyToToCanvas handles the zoom-out animation.
				// But we do want tiles loaded. Give map a moment to settle.
				await waitForIdle(map);
				recorder.resume();
			}

			// ── 3b. FLY-TO ANIMATION ──
			emit(`map-${location.id}`, `Rendering map for ${location.name}...`);
			console.log(`[TripStitch] Fly-to for "${location.name}"`);

			await drawFlyToToCanvas(
				map, ctx, location, prevLocation, transportMode,
				width, height,
				trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
				frameOverlay
			);

			const displayName = location.label || location.name.split(',')[0];
			const flyDuration = !prevLocation ? 4.0 : 5.9;
			addToTimeline(`map-${location.id}`, displayName, flyDuration, 'map');

			checkAbort();

			// ── 3c. CLIPS ──
			const clipsWithFiles = [...location.clips]
				.filter((c) => c.file)
				.sort((a, b) => a.order - b.order);

			if (clipsWithFiles.length > 0) {
				emit(`clip-${location.id}`, `Processing ${clipsWithFiles.length} clip(s) from ${location.name}...`);
				let combinedDuration = 0;

				// White flash before clips
				await drawWhiteFlashToCanvas(ctx, width, height, 200, frameOverlay);
				timelineCursor += 0.2;

				for (const clip of clipsWithFiles) {
					checkAbort();
					if (clip.type === 'video' && clip.file) {
						console.log(`[TripStitch] Playing video clip for "${location.name}"`);
						const dur = await playVideoToCanvas(clip.file, ctx, width, height, 30, frameOverlay);
						combinedDuration += dur;
					} else if (clip.type === 'photo' && clip.file) {
						console.log(`[TripStitch] Photo animation for "${location.name}" (${clip.animationStyle})`);
						await drawPhotoAnimationToCanvas(clip.file, ctx, width, height, clip.animationStyle, 3, frameOverlay);
						combinedDuration += 3;
					}
				}

				addToTimeline(`clip-${location.id}`, displayName, combinedDuration, 'clip');

				// White flash after clips
				await drawWhiteFlashToCanvas(ctx, width, height, 200, frameOverlay);
				timelineCursor += 0.2;
			} else {
				console.log(`[TripStitch] No media for "${location.name}", skipping clip`);
			}
		}

		checkAbort();

		// ── 4. FINAL ROUTE MAP ──
		// Pause recorder before network fetch + map setup to avoid frozen frames
		recorder.pause();
		console.log('[TripStitch] Paused for route fetch + final route setup');

		emit('route', 'Fetching road routes...');
		let routeGeometries: Awaited<ReturnType<typeof fetchAllRouteGeometries>> | undefined;
		try {
			routeGeometries = await fetchAllRouteGeometries(locations);
			console.log(`[TripStitch] Fetched ${routeGeometries.filter(Boolean).length}/${locations.length - 1} route geometries`);
		} catch (err) {
			console.warn('[TripStitch] Route geometry fetch failed, falling back to straight lines:', err);
			routeGeometries = undefined;
		}

		// Remove any existing route sources/layers from fly-to usage
		// Set up bounds and fit
		const bounds = new maplibregl.LngLatBounds();
		for (const loc of locations) {
			bounds.extend([loc.lng, loc.lat]);
		}
		if (routeGeometries) {
			for (const geom of routeGeometries) {
				if (geom) {
					for (const coord of geom.coordinates) {
						bounds.extend(coord);
					}
				}
			}
		}

		const pad = Math.min(width, height) * 0.14;
		const topPad = pad + 100;
		const bottomPad = pad + Math.round(height * 0.20);
		map.fitBounds(bounds, { padding: { top: topPad, bottom: bottomPad, left: pad, right: pad }, duration: 0 });
		await sleep(500);
		await waitForIdle(map);

		recorder.resume();
		console.log('[TripStitch] Resumed for final route');

		const miles = totalDistance(locations);
		const minutes = totalTravelTime(locations);
		console.log(`[TripStitch] Route stats: ${locations.length} stops, ${miles.toFixed(1)} miles, ${Math.round(minutes)} min`);

		await drawFinalRouteToCanvas(
			map, ctx, locations,
			{ stops: locations.length, miles, minutes },
			width, height,
			routeGeometries,
			trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
			frameOverlay
		);
		addToTimeline('route', 'Final Route', 6, 'route');

		checkAbort();

		// ── 5. FINALIZE ──
		emit('finalize', 'Finalizing video...');
		// Small delay to ensure final frame is captured
		await sleep(100);
		recorder.stop();
		stream.getTracks().forEach((t) => t.stop());
		console.log('[TripStitch] Single-pass recorder stopped');

		const finalBlob = await done;
		console.log(`[TripStitch] Final video blob:`, finalBlob.size, 'bytes', `(${(finalBlob.size / 1024 / 1024).toFixed(1)} MB)`);

		// Clean up map
		if (map && mapContainer) {
			destroyMap(map, mapContainer);
			map = null;
			mapContainer = null;
		}

		const url = URL.createObjectURL(finalBlob);
		console.log('[TripStitch] Video assembly complete! Blob URL:', url);
		console.log('[TripStitch] Timeline segments:', timeline.length, 'total estimated duration:', timelineCursor.toFixed(1) + 's');
		return { blob: finalBlob, url, segments: timeline };
	} catch (err) {
		console.error('[TripStitch] Assembly failed:', err);
		// Clean up on error
		try {
			if (recorder.state !== 'inactive') {
				recorder.stop();
			}
			stream.getTracks().forEach((t) => t.stop());
		} catch { /* ignore cleanup errors */ }
		if (map && mapContainer) {
			try { destroyMap(map, mapContainer); } catch { /* ignore */ }
		}
		throw err;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
