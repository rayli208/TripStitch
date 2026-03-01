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
import { createExportGuard, type ExportGuard } from './exportGuard';
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
	const assemblyStart = performance.now();
	console.log('[TripStitch] ═══════════════════════════════════════════════════════');
	console.log('[TripStitch] Starting single-pass video assembly', { tripId: trip.id, aspectRatio, mapStyle });
	const { width, height } = getResolution(aspectRatio);
	const mimeType = getSupportedMimeType();
	console.log(`[TripStitch] Target resolution: ${width}x${height}, MIME: ${mimeType}`);
	console.log(`[TripStitch] Font: ${trip.fontId ?? 'inter'}, titleColor: ${trip.titleColor}, secondaryColor: ${secondaryColor}`);
	console.log(`[TripStitch] Logo: ${logoUrl ? 'yes' : 'no'}, showLogoOnTitle: ${trip.showLogoOnTitle}`);

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
		console.log(`[TripStitch] Timeline: +${durationSec.toFixed(1)}s "${label}" (${type}) → cursor now at ${timelineCursor.toFixed(1)}s`);
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
	console.log('[TripStitch] ── Setting up canvas & MediaRecorder ──');
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	const stream = canvas.captureStream(30);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
	console.log(`[TripStitch] MediaRecorder created: mimeType=${recorder.mimeType}, videoBitsPerSecond=5000000`);
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

	let guard: ExportGuard | null = null;

	try {
		// Load logo overlay function if enabled
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
				console.warn('[TripStitch] Failed to load logo for watermark, skipping');
			}
		}

		// Start recorder + export guard
		recorder.start();
		guard = createExportGuard(recorder);
		const { pauseClock } = guard;
		console.log(`[TripStitch] Single-pass recorder started (state: ${recorder.state})`);

		// ── 1. TITLE CARD ──
		console.log('[TripStitch] ── Phase 1: Title Card ──');
		const titleStart = performance.now();
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
		}, frameOverlay, pauseClock);
		console.log(`[TripStitch] Title card took ${((performance.now() - titleStart) / 1000).toFixed(1)}s wall time`);
		addToTimeline('title', trip.title || 'Title', 2.5, 'title');

		// ── 2. CREATE REUSABLE MAP ──
		console.log('[TripStitch] ── Phase 2: Create Reusable Map ──');
		const mapCreateStart = performance.now();
		recorder.pause();
		console.log(`[TripStitch] Recorder paused for map creation (state: ${recorder.state})`);

		const firstLoc = locations[0];
		const result = await createOffscreenMap(
			width, height,
			[firstLoc.lng, firstLoc.lat], 10,
			mapStyle
		);
		map = result.map;
		mapContainer = result.container;
		console.log(`[TripStitch] Reusable map created in ${((performance.now() - mapCreateStart) / 1000).toFixed(1)}s`);

		recorder.resume();
		console.log(`[TripStitch] Recorder resumed (state: ${recorder.state})`);

		// ── Pre-fetch routes in background while locations render ──
		const routePromise = locations.length >= 2
			? fetchAllRouteGeometries(locations).catch((err) => {
				console.warn('[TripStitch] Background route fetch failed:', err);
				return undefined;
			})
			: Promise.resolve(undefined);
		console.log('[TripStitch] Route pre-fetch started in background');

		// ── 3. PROCESS EACH LOCATION ──
		console.log('[TripStitch] ── Phase 3: Process Locations ──');
		for (let i = 0; i < locations.length; i++) {
			const locStart = performance.now();
			checkAbort();
			const location = locations[i];
			const prevLocation = i > 0 ? locations[i - 1] : null;

			console.log(`[TripStitch] ── Location ${i + 1}/${locations.length}: "${location.name}" ──`);
			console.log(`[TripStitch]   lat=${location.lat}, lng=${location.lng}, clips=${location.clips.length}, rating=${location.rating ?? 'none'}`);

			let transportMode = location.transportMode;
			if (!transportMode && prevLocation) {
				transportMode = suggestTransportMode(
					prevLocation.lat, prevLocation.lng,
					location.lat, location.lng
				);
			}
			if (transportMode) console.log(`[TripStitch]   transport: ${transportMode}`);

			// ── 3a. PREPARE MAP (paused) ──
			if (i > 0) {
				const tileStart = performance.now();
				recorder.pause();
				console.log(`[TripStitch]   Recorder paused for tile loading (state: ${recorder.state})`);
				await waitForIdle(map);
				recorder.resume();
				console.log(`[TripStitch]   Tile loading took ${((performance.now() - tileStart) / 1000).toFixed(1)}s, recorder resumed`);
			}

			// ── 3b. FLY-TO ANIMATION ──
			const flyStart = performance.now();
			emit(`map-${location.id}`, `Rendering map for ${location.name}...`);
			console.log(`[TripStitch]   Fly-to animation starting (${prevLocation ? 'transition' : 'first'})`);

			await drawFlyToToCanvas(
				map, ctx, location, prevLocation, transportMode,
				width, height,
				trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
				frameOverlay, pauseClock
			);

			const displayName = location.label || location.name.split(',')[0];
			const flyDuration = !prevLocation ? 4.0 : 5.9;
			console.log(`[TripStitch]   Fly-to took ${((performance.now() - flyStart) / 1000).toFixed(1)}s wall time`);
			addToTimeline(`map-${location.id}`, displayName, flyDuration, 'map');

			checkAbort();

			// ── 3c. CLIPS ──
			const clipsWithFiles = [...location.clips]
				.filter((c) => c.file)
				.sort((a, b) => a.order - b.order);

			if (clipsWithFiles.length > 0) {
				const clipStart = performance.now();
				emit(`clip-${location.id}`, `Processing ${clipsWithFiles.length} clip(s) from ${location.name}...`);
				console.log(`[TripStitch]   Processing ${clipsWithFiles.length} clip(s): ${clipsWithFiles.map(c => `${c.id}(${c.type})`).join(', ')}`);
				let combinedDuration = 0;

				// White flash before clips
				await drawWhiteFlashToCanvas(ctx, width, height, 200, frameOverlay, pauseClock);
				timelineCursor += 0.2;

				for (let ci = 0; ci < clipsWithFiles.length; ci++) {
					const clip = clipsWithFiles[ci];
					checkAbort();
					if (clip.type === 'video' && clip.file) {
						console.log(`[TripStitch]   Playing video clip ${ci + 1}/${clipsWithFiles.length} (${clip.id}, ${clip.file.name}, ${(clip.file.size / 1024 / 1024).toFixed(1)}MB)`);
						const dur = await playVideoToCanvas(clip.file, ctx, width, height, 30, frameOverlay, pauseClock);
						combinedDuration += dur;
						console.log(`[TripStitch]   Video clip done: ${dur.toFixed(1)}s`);
					} else if (clip.type === 'photo' && clip.file) {
						console.log(`[TripStitch]   Photo animation ${ci + 1}/${clipsWithFiles.length} (${clip.id}, ${clip.animationStyle}, ${clip.file.name})`);
						await drawPhotoAnimationToCanvas(clip.file, ctx, width, height, clip.animationStyle, 3, frameOverlay, pauseClock);
						combinedDuration += 3;
						console.log(`[TripStitch]   Photo clip done: 3.0s`);
					}
				}

				addToTimeline(`clip-${location.id}`, displayName, combinedDuration, 'clip');

				// White flash after clips
				await drawWhiteFlashToCanvas(ctx, width, height, 200, frameOverlay, pauseClock);
				timelineCursor += 0.2;

				console.log(`[TripStitch]   Clips took ${((performance.now() - clipStart) / 1000).toFixed(1)}s wall time, combined duration: ${combinedDuration.toFixed(1)}s`);
			} else {
				console.log(`[TripStitch]   No media clips for this location`);
			}
			console.log(`[TripStitch]   Location "${location.name}" total: ${((performance.now() - locStart) / 1000).toFixed(1)}s wall time`);
		}

		checkAbort();

		// ── 4. FINAL ROUTE MAP ──
		console.log('[TripStitch] ── Phase 4: Final Route Map ──');
		const routePhaseStart = performance.now();
		recorder.pause();
		console.log(`[TripStitch] Recorder paused for route fetch (state: ${recorder.state})`);

		emit('route', 'Drawing final route...');
		const routeGeometries = await routePromise;
		if (routeGeometries) {
			console.log(`[TripStitch] Route geometries ready: ${routeGeometries.filter(Boolean).length}/${locations.length - 1} (pre-fetched + cached)`);
		} else {
			console.log('[TripStitch] No route geometries available, using straight lines');
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
		const routeSetupTime = ((performance.now() - routePhaseStart) / 1000).toFixed(1);
		console.log(`[TripStitch] Route setup took ${routeSetupTime}s (fetch + fitBounds + idle), recorder resumed`);

		const miles = totalDistance(locations);
		const minutes = totalTravelTime(locations);
		console.log(`[TripStitch] Route stats: ${locations.length} stops, ${miles.toFixed(1)} miles, ${Math.round(minutes)} min`);

		await drawFinalRouteToCanvas(
			map, ctx, locations,
			{ stops: locations.length, miles, minutes },
			width, height,
			routeGeometries,
			trip.titleColor || '#FFFFFF', tripFontId, secondaryColor,
			frameOverlay, pauseClock
		);
		addToTimeline('route', 'Final Route', 6, 'route');
		console.log(`[TripStitch] Final route phase took ${((performance.now() - routePhaseStart) / 1000).toFixed(1)}s total wall time`);

		checkAbort();

		// ── 5. FINALIZE ──
		console.log('[TripStitch] ── Phase 5: Finalize ──');
		emit('finalize', 'Finalizing video...');
		// Small delay to ensure final frame is captured
		await sleep(100);
		console.log(`[TripStitch] Destroying export guard (pauseClock total: ${pauseClock.get().toFixed(0)}ms)`);
		guard.destroy();
		guard = null;
		recorder.stop();
		stream.getTracks().forEach((t) => t.stop());
		console.log(`[TripStitch] Recorder stopped (state: ${recorder.state}), waiting for blob...`);

		const finalBlob = await done;
		console.log(`[TripStitch] Recording blob ready: ${finalBlob.size} bytes (${(finalBlob.size / 1024 / 1024).toFixed(1)} MB)`);

		// Clean up map
		if (map && mapContainer) {
			destroyMap(map, mapContainer);
			map = null;
			mapContainer = null;
		}

		const url = URL.createObjectURL(finalBlob);
		const totalTime = ((performance.now() - assemblyStart) / 1000).toFixed(1);
		console.log('[TripStitch] ═══════════════════════════════════════════════════════');
		console.log(`[TripStitch] VIDEO ASSEMBLY COMPLETE`);
		console.log(`[TripStitch]   Total wall time: ${totalTime}s`);
		console.log(`[TripStitch]   Estimated video duration: ${timelineCursor.toFixed(1)}s`);
		console.log(`[TripStitch]   Final blob: ${(finalBlob.size / 1024 / 1024).toFixed(1)} MB`);
		console.log(`[TripStitch]   Timeline: ${timeline.length} segments`);
		for (const seg of timeline) {
			console.log(`[TripStitch]     ${seg.startSec.toFixed(1)}s → ${(seg.startSec + seg.durationSec).toFixed(1)}s  [${seg.type}] ${seg.label}`);
		}
		console.log('[TripStitch] ═══════════════════════════════════════════════════════');
		return { blob: finalBlob, url, segments: timeline };
	} catch (err) {
		console.error('[TripStitch] Assembly failed:', err);
		// Clean up on error
		if (guard) {
			try { guard.destroy(); } catch { /* ignore */ }
		}
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
