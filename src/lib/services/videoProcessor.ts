import type { AnimationStyle } from '$lib/types';
import { getSupportedMimeType } from '$lib/utils/browserCompat';

const TARGET_FPS = 30;

export interface Resolution {
	width: number;
	height: number;
}

/** Normalize a video file to target resolution by redrawing frames via canvas */
export async function normalizeVideo(
	file: File,
	targetWidth: number,
	targetHeight: number,
	maxDurationSec = 30
): Promise<Blob> {
	console.log(`[VideoProcessor] normalizeVideo: ${file.name}, ${(file.size / 1024 / 1024).toFixed(1)}MB, target: ${targetWidth}x${targetHeight}`);
	const mimeType = getSupportedMimeType();
	const video = document.createElement('video');
	video.muted = true;
	video.playsInline = true;
	video.src = URL.createObjectURL(file);

	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error('Failed to load video'));
	});

	const duration = Math.min(video.duration, maxDurationSec);
	console.log(`[VideoProcessor] Video loaded: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration.toFixed(1)}s (using ${duration.toFixed(1)}s)`);
	const canvas = document.createElement('canvas');
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext('2d')!;

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
	video.currentTime = 0;
	await video.play();

	await new Promise<void>((resolve) => {
		const drawFrame = () => {
			if (video.ended || video.currentTime >= duration) {
				resolve();
				return;
			}
			// Draw video centered/covering the canvas (cover fit)
			drawCover(ctx, video, targetWidth, targetHeight);
			requestAnimationFrame(drawFrame);
		};
		drawFrame();
	});

	video.pause();
	recorder.stop();
	URL.revokeObjectURL(video.src);

	return done;
}

/** Create a white flash blob of given duration */
export async function createWhiteFlash(
	duration: number,
	width: number,
	height: number
): Promise<Blob> {
	const mimeType = getSupportedMimeType();
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, width, height);

	const stream = canvas.captureStream(TARGET_FPS);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	recorder.start();
	await sleep(duration * 1000);
	recorder.stop();

	// Stop all tracks
	stream.getTracks().forEach((t) => t.stop());

	return done;
}

/** Concatenate video blobs by playing them sequentially on a canvas and recording */
export async function concatenateBlobs(
	blobs: Blob[],
	width: number,
	height: number,
	onSegmentDone?: (index: number) => void,
	frameOverlay?: (ctx: CanvasRenderingContext2D) => void
): Promise<Blob> {
	console.log(`[VideoProcessor] concatenateBlobs: ${blobs.length} segments, target: ${width}x${height}`);
	if (blobs.length === 0) throw new Error('No blobs to concatenate');
	if (blobs.length === 1) return blobs[0];

	const mimeType = getSupportedMimeType();
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

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

	for (let i = 0; i < blobs.length; i++) {
		await playBlobOnCanvas(blobs[i], ctx, width, height, frameOverlay);
		URL.revokeObjectURL(URL.createObjectURL(blobs[i]));
		onSegmentDone?.(i);
	}

	recorder.stop();
	stream.getTracks().forEach((t) => t.stop());

	return done;
}

/** Play a single video blob on a canvas context and resolve when done */
async function playBlobOnCanvas(
	blob: Blob,
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	frameOverlay?: (ctx: CanvasRenderingContext2D) => void
): Promise<void> {
	const video = document.createElement('video');
	video.muted = true;
	video.playsInline = true;
	const url = URL.createObjectURL(blob);
	video.src = url;

	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error('Failed to load video segment'));
	});

	await video.play();

	await new Promise<void>((resolve) => {
		const drawFrame = () => {
			if (video.ended || video.paused) {
				resolve();
				return;
			}
			drawCover(ctx, video, width, height);
			frameOverlay?.(ctx);
			requestAnimationFrame(drawFrame);
		};
		video.onended = () => resolve();
		drawFrame();
	});

	video.pause();
	URL.revokeObjectURL(url);
}

/** Draw a video/image centered on a canvas using "cover" fitting */
function drawCover(
	ctx: CanvasRenderingContext2D,
	source: HTMLVideoElement | HTMLImageElement,
	targetW: number,
	targetH: number
) {
	const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
	const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

	if (srcW === 0 || srcH === 0) {
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, targetW, targetH);
		return;
	}

	const srcAspect = srcW / srcH;
	const tgtAspect = targetW / targetH;

	let drawW: number, drawH: number, sx: number, sy: number;
	if (srcAspect > tgtAspect) {
		// Source is wider — crop sides
		drawH = srcH;
		drawW = srcH * tgtAspect;
		sx = (srcW - drawW) / 2;
		sy = 0;
	} else {
		// Source is taller — crop top/bottom
		drawW = srcW;
		drawH = srcW / tgtAspect;
		sx = 0;
		sy = (srcH - drawH) / 2;
	}

	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, targetW, targetH);
	ctx.drawImage(source, sx, sy, drawW, drawH, 0, 0, targetW, targetH);
}

/** Render a photo with the selected animation style as a video segment */
export async function renderPhotoAnimation(
	file: File,
	width: number,
	height: number,
	style: AnimationStyle = 'kenBurns',
	durationSec = 3
): Promise<Blob> {
	const mimeType = getSupportedMimeType();

	const img = new Image();
	const imgUrl = URL.createObjectURL(file);
	img.src = imgUrl;

	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('Failed to load photo'));
	});

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	const stream = canvas.captureStream(TARGET_FPS);
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	const srcW = img.naturalWidth;
	const srcH = img.naturalHeight;
	const srcAspect = srcW / srcH;
	const tgtAspect = width / height;

	// Calculate base cover crop
	let cropW: number, cropH: number, baseSx: number, baseSy: number;
	if (srcAspect > tgtAspect) {
		cropH = srcH;
		cropW = srcH * tgtAspect;
		baseSx = (srcW - cropW) / 2;
		baseSy = 0;
	} else {
		cropW = srcW;
		cropH = srcW / tgtAspect;
		baseSx = 0;
		baseSy = (srcH - cropH) / 2;
	}

	// Build per-frame draw function based on animation style
	const drawAnimatedFrame = buildAnimationDrawFn(style, {
		ctx, img, width, height,
		cropW, cropH, baseSx, baseSy
	});

	recorder.start();
	const startTime = performance.now();
	const durationMs = durationSec * 1000;

	await new Promise<void>((resolve) => {
		const drawFrame = () => {
			const elapsed = performance.now() - startTime;
			if (elapsed >= durationMs) {
				resolve();
				return;
			}
			const t = elapsed / durationMs; // 0 → 1
			drawAnimatedFrame(t);
			requestAnimationFrame(drawFrame);
		};
		drawFrame();
	});

	recorder.stop();
	stream.getTracks().forEach((t) => t.stop());
	URL.revokeObjectURL(imgUrl);

	console.log(`[VideoProcessor] Photo animation (${style}) rendered`);
	return done;
}

/** Backward-compatible wrapper */
export async function renderKenBurnsPhoto(
	file: File,
	width: number,
	height: number,
	durationSec = 3
): Promise<Blob> {
	return renderPhotoAnimation(file, width, height, 'kenBurns', durationSec);
}

interface AnimationContext {
	ctx: CanvasRenderingContext2D;
	img: HTMLImageElement;
	width: number;
	height: number;
	cropW: number;
	cropH: number;
	baseSx: number;
	baseSy: number;
}

/** Returns a (t: 0→1) => void draw function for the selected animation style */
function buildAnimationDrawFn(
	style: AnimationStyle,
	a: AnimationContext
): (t: number) => void {
	const { ctx, img, width, height, cropW, cropH, baseSx, baseSy } = a;

	function drawCrop(sx: number, sy: number, sw: number, sh: number) {
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
	}

	switch (style) {
		case 'zoomIn': {
			// Zoom from 1.0x to 1.2x centered
			const startScale = 1.0;
			const endScale = 1.2;
			return (t) => {
				const scale = startScale + (endScale - startScale) * t;
				const sw = cropW / scale;
				const sh = cropH / scale;
				const sx = baseSx + (cropW - sw) / 2;
				const sy = baseSy + (cropH - sh) / 2;
				drawCrop(sx, sy, sw, sh);
			};
		}
		case 'panHorizontal': {
			// Pan from left to right with slight zoom
			const scale = 1.15;
			return (t) => {
				const sw = cropW / scale;
				const sh = cropH / scale;
				const maxPanX = cropW - sw;
				const sx = baseSx + maxPanX * t;
				const sy = baseSy + (cropH - sh) / 2;
				drawCrop(sx, sy, sw, sh);
			};
		}
		case 'static': {
			// No motion, just hold
			return (_t) => {
				drawCrop(baseSx, baseSy, cropW, cropH);
			};
		}
		case 'kenBurns':
		default: {
			// Slow zoom out + slight pan (original)
			const startScale = 1.15;
			const endScale = 1.0;
			const startOffsetX = width * 0.03;
			const startOffsetY = height * 0.02;
			return (t) => {
				const scale = startScale + (endScale - startScale) * t;
				const offsetX = startOffsetX * (1 - t);
				const offsetY = startOffsetY * (1 - t);
				const sw = cropW / scale;
				const sh = cropH / scale;
				const sx = baseSx + (cropW - sw) / 2 + (offsetX / width) * sw;
				const sy = baseSy + (cropH - sh) / 2 + (offsetY / height) * sh;
				drawCrop(sx, sy, sw, sh);
			};
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
