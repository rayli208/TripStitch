import type { Trip, AspectRatio, MapStyle } from '$lib/types';
import { getResolution, renderFlyTo, renderFinalRoute, renderTitleCard, loadImageFromUrl } from './mapRenderer';
import { normalizeVideo, createWhiteFlash, concatenateBlobs, renderPhotoAnimation } from './videoProcessor';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';
import { suggestTransportMode } from '$lib/utils/distance';
import { fetchAllRouteGeometries } from './routeService';

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

/** Get the duration of a video File in seconds */
async function getVideoDuration(file: File): Promise<number> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.onloadedmetadata = () => {
			const dur = video.duration;
			URL.revokeObjectURL(video.src);
			resolve(isFinite(dur) ? dur : 5);
		};
		video.onerror = () => {
			URL.revokeObjectURL(video.src);
			resolve(5); // fallback
		};
		video.src = URL.createObjectURL(file);
	});
}

/** Main pipeline: assembles the full TripStitch video */
export async function assembleVideo(
	trip: Trip,
	aspectRatio: AspectRatio,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	mapStyle: MapStyle = 'streets',
	logoUrl?: string | null,
	secondaryColor: string = '#0a0f1e'
): Promise<AssemblyResult> {
	console.log('[TripStitch] Starting video assembly', { tripId: trip.id, aspectRatio });
	const { width, height } = getResolution(aspectRatio);
	console.log('[TripStitch] Target resolution:', width, 'x', height);

	const locations = [...trip.locations].sort((a, b) => a.order - b.order);
	console.log('[TripStitch] Locations to process:', locations.length, locations.map(l => l.name));

	const tripFontId = trip.fontId ?? 'inter';

	// Calculate total steps — one per export checklist item
	let totalSteps = 1 + 1 + 1; // title + route + finalize
	for (const loc of locations) {
		totalSteps += 1; // map fly-to
		if (loc.clips.some((c) => c.file)) {
			totalSteps += 1; // clip processing
		}
	}
	console.log('[TripStitch] Total steps:', totalSteps);

	let currentStep = 0;
	const segments: Blob[] = [];
	const timeline: VideoSegmentInfo[] = [];
	let timelineCursor = 0; // cumulative seconds

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

	try {
		// 0. Title card intro
		checkAbort();
		emit('title', `Creating title card...`);

		const titleBlob = await renderTitleCard({
			title: trip.title || 'My Trip',
			titleColor: trip.titleColor || '#FFFFFF',
			aspectRatio,
			description: trip.titleDescription || undefined,
			mediaFile: trip.titleMediaFile,
			logoUrl: logoUrl,
			showLogo: trip.showLogoOnTitle,
			fontId: tripFontId,
			secondaryColor
		});
		console.log(`[TripStitch] Title card blob:`, titleBlob.size, 'bytes');
		segments.push(titleBlob);
		addToTimeline('title', trip.title || 'Title', 2.5, 'title');

		// Process each location
		for (let i = 0; i < locations.length; i++) {
			checkAbort();
			const location = locations[i];
			const prevLocation = i > 0 ? locations[i - 1] : null;

			// Auto-suggest transport mode if not set
			let transportMode = location.transportMode;
			if (!transportMode && prevLocation) {
				transportMode = suggestTransportMode(
					prevLocation.lat, prevLocation.lng,
					location.lat, location.lng
				);
			}

			// 1. Map fly-to animation
			emit(`map-${location.id}`, `Rendering map for ${location.name}...`);
			console.log(`[TripStitch] Rendering fly-to for "${location.name}" (${location.lat}, ${location.lng})`);
			const flyToBlob = await renderFlyTo(location, prevLocation, transportMode, aspectRatio, mapStyle, trip.titleColor || '#FFFFFF', tripFontId, secondaryColor);
			console.log(`[TripStitch] Fly-to blob for "${location.name}":`, flyToBlob.size, 'bytes');
			segments.push(flyToBlob);
			const displayName = location.label || location.name.split(',')[0];
			// First fly-to: 4s (fly 2s + hold 2s); subsequent: ~5.9s
			const flyDuration = !prevLocation ? 4.0 : 5.9;
			addToTimeline(`map-${location.id}`, displayName, flyDuration, 'map');

			checkAbort();

			// 2. Multi-clip pre-stitch: process all clips for this location
			const clipsWithFiles = [...location.clips]
				.filter((c) => c.file)
				.sort((a, b) => a.order - b.order);

			if (clipsWithFiles.length > 0) {
				emit(`clip-${location.id}`, `Processing ${clipsWithFiles.length} clip(s) from ${location.name}...`);
				const clipBlobs: Blob[] = [];
				let combinedDuration = 0;

				for (const clip of clipsWithFiles) {
					checkAbort();
					if (clip.type === 'video' && clip.file) {
						console.log(`[TripStitch] Processing video clip for "${location.name}", file size:`, clip.file.size);
						const dur = await getVideoDuration(clip.file);
						const normalized = await normalizeVideo(clip.file, width, height);
						clipBlobs.push(normalized);
						combinedDuration += dur;
					} else if (clip.type === 'photo' && clip.file) {
						console.log(`[TripStitch] Processing photo for "${location.name}" (animation: ${clip.animationStyle})`);
						const photoBlob = await renderPhotoAnimation(clip.file, width, height, clip.animationStyle, 3);
						clipBlobs.push(photoBlob);
						combinedDuration += 3;
					}
				}

				// Flash before
				const flashBefore = await createWhiteFlash(0.2, width, height);
				segments.push(flashBefore);
				timelineCursor += 0.2;

				// Combine clips: if single, use directly; if multiple, concatenate
				let combinedBlob: Blob;
				if (clipBlobs.length === 1) {
					combinedBlob = clipBlobs[0];
				} else {
					console.log(`[TripStitch] Concatenating ${clipBlobs.length} clips for "${location.name}"`);
					combinedBlob = await concatenateBlobs(clipBlobs, width, height);
				}
				segments.push(combinedBlob);
				addToTimeline(`clip-${location.id}`, displayName, combinedDuration, 'clip');

				// Flash after
				const flashAfter = await createWhiteFlash(0.2, width, height);
				segments.push(flashAfter);
				timelineCursor += 0.2;
			} else {
				console.log(`[TripStitch] No media for "${location.name}", skipping clip`);
			}
		}

		checkAbort();

		// 3. Final route map — fetch real road geometries first
		emit('route', 'Fetching road routes...');
		let routeGeometries: Awaited<ReturnType<typeof fetchAllRouteGeometries>> | undefined;
		try {
			routeGeometries = await fetchAllRouteGeometries(locations);
			console.log(`[TripStitch] Fetched ${routeGeometries.filter(Boolean).length}/${locations.length - 1} route geometries`);
		} catch (err) {
			console.warn('[TripStitch] Route geometry fetch failed, falling back to straight lines:', err);
			routeGeometries = undefined;
		}

		const miles = totalDistance(locations);
		const minutes = totalTravelTime(locations);
		console.log(`[TripStitch] Route stats: ${locations.length} stops, ${miles.toFixed(1)} miles, ${Math.round(minutes)} min`);
		const finalRouteBlob = await renderFinalRoute(
			locations,
			{ stops: locations.length, miles, minutes },
			aspectRatio,
			routeGeometries,
			mapStyle,
			trip.titleColor || '#FFFFFF',
			tripFontId,
			secondaryColor
		);
		console.log(`[TripStitch] Final route blob:`, finalRouteBlob.size, 'bytes');
		segments.push(finalRouteBlob);
		addToTimeline('route', 'Final Route', 6, 'route');

		checkAbort();

		// 4. Load logo for watermark overlay if enabled
		let logoOverlay: ((ctx: CanvasRenderingContext2D) => void) | undefined;
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
				logoOverlay = (ctx) => {
					ctx.save();
					ctx.globalAlpha = 0.8;
					ctx.drawImage(logoImage, lx, ly, drawW, drawH);
					ctx.restore();
				};
			} catch {
				console.warn('[TripStitch] Failed to load logo for watermark, skipping');
			}
		}

		// 5. Concatenate all segments
		console.log(`[TripStitch] Concatenating ${segments.length} segments`);
		emit('finalize', `Stitching ${segments.length} segments together...`);
		const finalBlob = await concatenateBlobs(segments, width, height, (segIndex) => {
			// Update message without incrementing currentStep
			onProgress?.({ step: 'finalize', message: `Stitching segment ${segIndex + 2} of ${segments.length}...`, current: currentStep, total: totalSteps });
		}, logoOverlay);
		console.log(`[TripStitch] Final video blob:`, finalBlob.size, 'bytes', `(${(finalBlob.size / 1024 / 1024).toFixed(1)} MB)`);

		const url = URL.createObjectURL(finalBlob);
		console.log('[TripStitch] Video assembly complete! Blob URL:', url);
		console.log('[TripStitch] Timeline segments:', timeline.length, 'total estimated duration:', timelineCursor.toFixed(1) + 's');
		return { blob: finalBlob, url, segments: timeline };
	} catch (err) {
		console.error('[TripStitch] Assembly failed:', err);
		throw err;
	}
}
