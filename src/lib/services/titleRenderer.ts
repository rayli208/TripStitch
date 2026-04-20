/**
 * Title + outro card rendering.
 *
 * Contains three variants of each card:
 *   - draw*ToCanvas   → MediaRecorder path; rAF-driven, uses PauseClock
 *   - generate*Frames → WebCodecs path; synchronous per-frame loop
 *
 * Both cards share the same visual structure (bg image or gradient → pill with
 * text → optional logo watermark), so their internal draw helpers are similar
 * but kept distinct to preserve pixel-perfect output.
 */
import type { AspectRatio } from '$lib/types';
import type { PauseClock } from './exportGuard';
import { fontFamily } from '$lib/constants/fonts';
import { loadFont } from '$lib/utils/fontLoader';
import {
	canvasRoundRect,
	hexToRgba,
	wrapText,
	drawCoverFit
} from './canvasDraw';
import { loadImageFromFile, loadImageFromUrl, getResolution } from './mapCore';

export interface TitleCardOpts {
	title: string;
	titleColor: string;
	aspectRatio: AspectRatio;
	description?: string;
	mediaFile?: File | null;
	logoUrl?: string | null;
	showLogo?: boolean;
	durationSec?: number;
	fontId?: string;
	secondaryColor?: string;
}

export interface OutroCardOpts {
	title: string;
	titleColor: string;
	aspectRatio: AspectRatio;
	mediaFile?: File | null;
	logoUrl?: string | null;
	showLogo?: boolean;
	fontId?: string;
	secondaryColor?: string;
	username?: string;
	displayName?: string;
	socialLinks?: { instagram?: string; youtube?: string; tiktok?: string; website?: string };
	durationSec?: number;
}

type FrameCallback = (ctx: CanvasRenderingContext2D) => void;

/** Build the social handles text lines from profile data (outro card). */
function buildSocialLines(opts: OutroCardOpts): string[] {
	const lines: string[] = [];
	if (opts.displayName) lines.push(opts.displayName);
	else if (opts.username) lines.push(`@${opts.username}`);
	const socials: string[] = [];
	if (opts.socialLinks?.instagram) socials.push(`@${opts.socialLinks.instagram.replace(/^@/, '')}`);
	if (opts.socialLinks?.youtube) socials.push(opts.socialLinks.youtube);
	if (opts.socialLinks?.tiktok) socials.push(`@${opts.socialLinks.tiktok.replace(/^@/, '')}`);
	if (opts.socialLinks?.website) socials.push(opts.socialLinks.website.replace(/^https?:\/\//, ''));
	for (const s of socials) lines.push(s);
	return lines;
}

// ─── Title card ──────────────────────────────────────────────────────────

/** Draw a title card directly to a provided canvas context (MediaRecorder path). */
export async function drawTitleCardToCanvas(
	ctx: CanvasRenderingContext2D,
	opts: TitleCardOpts,
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock
): Promise<void> {
	const { title, titleColor, aspectRatio, description, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.06);
	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);

	const descFontSize = Math.round(fontSize * 0.6);
	let descLines: string[] = [];
	if (description) {
		ctx.font = `400 ${descFontSize}px ${ff}`;
		descLines = wrapText(ctx, description, maxWidth);
	}

	const titleLineHeight = fontSize * 1.3;
	const descLineHeight = descFontSize * 1.4;
	const totalTitleHeight = titleLines.length * titleLineHeight;
	const descGap = description ? fontSize * 0.5 : 0;
	const totalDescHeight = descLines.length * descLineHeight;
	const totalBlockHeight = totalTitleHeight + descGap + totalDescHeight;
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) {
		bgImage = await loadImageFromFile(mediaFile);
	}

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			console.warn('[TitleRenderer] Failed to load logo, skipping watermark');
		}
	}

	const durationSec = opts.durationSec ?? 2.5;
	const secColor = opts.secondaryColor ?? '#0a0f1e';

	function drawTextOverlay() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);

		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}

		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = titleColor;
			ctx.globalAlpha = 0.6;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(width * 0.35, lineY);
			ctx.lineTo(width * 0.65, lineY);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
		const margin = Math.round(width * 0.04);
		const scale = Math.min(
			logoSize / logoImage.naturalWidth,
			logoSize / logoImage.naturalHeight
		);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawTextOverlay();
		drawLogo();
		frameCallback?.(ctx);
	}

	const durationMs = durationSec * 1000;
	const startTime = performance.now();
	let frameCount = 0;
	console.log(
		`[TitleRenderer] drawTitleCardToCanvas: starting (${durationSec}s, bg=${bgImage ? 'media' : 'gradient'}, logo=${!!logoImage})`
	);
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= durationMs) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}
			drawFrame();
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame();
	frameCount++;

	const wallTime = ((performance.now() - startTime) / 1000).toFixed(1);
	console.log(
		`[TitleRenderer] drawTitleCardToCanvas done: ${frameCount} frames, wall=${wallTime}s`
	);
}

/** Generate title card frames offline (WebCodecs path: synchronous loop). */
export async function generateTitleCardFrames(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	opts: TitleCardOpts,
	fps: number,
	onFrame: (canvas: HTMLCanvasElement) => void,
	frameCallback?: FrameCallback
): Promise<void> {
	const { title, titleColor, aspectRatio, description, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.06);
	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);

	const descFontSize = Math.round(fontSize * 0.6);
	let descLines: string[] = [];
	if (description) {
		ctx.font = `400 ${descFontSize}px ${ff}`;
		descLines = wrapText(ctx, description, maxWidth);
	}

	const titleLineHeight = fontSize * 1.3;
	const descLineHeight = descFontSize * 1.4;
	const totalTitleHeight = titleLines.length * titleLineHeight;
	const descGap = description ? fontSize * 0.5 : 0;
	const totalDescHeight = descLines.length * descLineHeight;
	const totalBlockHeight = totalTitleHeight + descGap + totalDescHeight;
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) {
		bgImage = await loadImageFromFile(mediaFile);
	}

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			/* skip */
		}
	}

	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 2.5;
	const totalFrames = Math.round(durationSec * fps);

	function drawTextOverlay() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);

		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}

		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		if (descLines.length > 0) {
			const descStartY = blockStartY + totalTitleHeight + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], width / 2, descStartY + i * descLineHeight);
			}
			ctx.globalAlpha = 1;
		} else {
			const lineY = blockStartY + totalTitleHeight + fontSize * 0.4;
			ctx.strokeStyle = titleColor;
			ctx.globalAlpha = 0.6;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(width * 0.35, lineY);
			ctx.lineTo(width * 0.65, lineY);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
		const margin = Math.round(width * 0.04);
		const scale = Math.min(
			logoSize / logoImage.naturalWidth,
			logoSize / logoImage.naturalHeight
		);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawTextOverlay();
		drawLogo();
		frameCallback?.(ctx);
	}

	console.log(
		`[TitleRenderer] generateTitleCardFrames: ${totalFrames} frames (${durationSec}s @ ${fps}fps)`
	);
	for (let i = 0; i < totalFrames; i++) {
		drawFrame();
		onFrame(canvas);
	}
}

// ─── Outro card ──────────────────────────────────────────────────────────

/** Draw an outro card directly to a provided canvas context (MediaRecorder path). */
export async function drawOutroCardToCanvas(
	ctx: CanvasRenderingContext2D,
	opts: OutroCardOpts,
	frameCallback?: FrameCallback,
	pauseClock?: PauseClock
): Promise<void> {
	const { title, titleColor, aspectRatio, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.05);
	const socialFontSize = Math.round(fontSize * 0.5);
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 3;

	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);
	const titleLineHeight = fontSize * 1.3;
	const totalTitleHeight = titleLines.length * titleLineHeight;

	const socialLines = buildSocialLines(opts);
	ctx.font = `400 ${socialFontSize}px ${ff}`;
	const socialLineHeight = socialFontSize * 1.6;
	const totalSocialHeight = socialLines.length * socialLineHeight;

	const separatorGap = fontSize * 0.6;
	const socialGap = fontSize * 0.5;
	const totalBlockHeight =
		totalTitleHeight +
		separatorGap +
		totalSocialHeight +
		(socialLines.length > 0 ? socialGap : 0);
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) bgImage = await loadImageFromFile(mediaFile);

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			/* skip */
		}
	}

	function drawContent() {
		ctx.save();

		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);
		const maxContentW = width * 0.85;
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		ctx.font = `400 ${socialFontSize}px ${ff}`;
		for (const line of socialLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		maxLineW = Math.min(maxLineW, maxContentW - padX * 2);

		const bgW = Math.min(maxLineW + padX * 2, maxContentW);
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		const lineY = blockStartY + totalTitleHeight + separatorGap * 0.5;
		ctx.strokeStyle = titleColor;
		ctx.globalAlpha = 0.6;
		ctx.lineWidth = 2;
		const sepW = Math.min(bgW * 0.5, width * 0.3);
		ctx.beginPath();
		ctx.moveTo(width / 2 - sepW / 2, lineY);
		ctx.lineTo(width / 2 + sepW / 2, lineY);
		ctx.stroke();
		ctx.globalAlpha = 1;

		if (socialLines.length > 0) {
			const socialStartY = blockStartY + totalTitleHeight + separatorGap + socialGap;
			ctx.font = `400 ${socialFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			const maxTextW = bgW - padX * 2;
			for (let i = 0; i < socialLines.length; i++) {
				let line = socialLines[i];
				if (ctx.measureText(line).width > maxTextW) {
					while (line.length > 1 && ctx.measureText(line + '...').width > maxTextW) {
						line = line.slice(0, -1);
					}
					line = line.trimEnd() + '...';
				}
				ctx.fillText(line, width / 2, socialStartY + i * socialLineHeight);
			}
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
		const margin = Math.round(width * 0.04);
		const scale = Math.min(
			logoSize / logoImage.naturalWidth,
			logoSize / logoImage.naturalHeight
		);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawContent();
		drawLogo();
		frameCallback?.(ctx);
	}

	const durationMs = durationSec * 1000;
	const startTime = performance.now();
	let frameCount = 0;
	console.log(`[TitleRenderer] drawOutroCardToCanvas: starting (${durationSec}s)`);
	await new Promise<void>((resolve) => {
		const frame = () => {
			const elapsed = performance.now() - startTime - (pauseClock?.get() ?? 0);
			if (elapsed >= durationMs) {
				resolve();
				return;
			}
			if (document.hidden) {
				requestAnimationFrame(frame);
				return;
			}
			drawFrame();
			frameCount++;
			requestAnimationFrame(frame);
		};
		frame();
	});
	drawFrame();
	frameCount++;
	console.log(`[TitleRenderer] drawOutroCardToCanvas done: ${frameCount} frames`);
}

/** Generate outro card frames offline (WebCodecs path). */
export async function generateOutroCardFrames(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	opts: OutroCardOpts,
	fps: number,
	onFrame: (canvas: HTMLCanvasElement) => void,
	frameCallback?: FrameCallback
): Promise<void> {
	const { title, titleColor, aspectRatio, mediaFile } = opts;
	const { width, height } = getResolution(aspectRatio);
	const fId = opts.fontId ?? 'inter';
	const ff = fontFamily(fId);
	await loadFont(fId);

	const fontSize = Math.round(width * 0.05);
	const socialFontSize = Math.round(fontSize * 0.5);
	const secColor = opts.secondaryColor ?? '#0a0f1e';
	const durationSec = opts.durationSec ?? 3;

	ctx.font = `700 ${fontSize}px ${ff}`;
	const maxWidth = width * 0.8;
	const titleLines = wrapText(ctx, title, maxWidth);
	const titleLineHeight = fontSize * 1.3;
	const totalTitleHeight = titleLines.length * titleLineHeight;

	const socialLines = buildSocialLines(opts);
	ctx.font = `400 ${socialFontSize}px ${ff}`;
	const socialLineHeight = socialFontSize * 1.6;
	const totalSocialHeight = socialLines.length * socialLineHeight;

	const separatorGap = fontSize * 0.6;
	const socialGap = fontSize * 0.5;
	const totalBlockHeight =
		totalTitleHeight +
		separatorGap +
		totalSocialHeight +
		(socialLines.length > 0 ? socialGap : 0);
	const blockStartY = (height - totalBlockHeight) / 2 + titleLineHeight / 2;

	let bgImage: HTMLImageElement | null = null;
	if (mediaFile) bgImage = await loadImageFromFile(mediaFile);

	let logoImage: HTMLImageElement | null = null;
	if (opts.showLogo && opts.logoUrl) {
		try {
			logoImage = await loadImageFromUrl(opts.logoUrl);
		} catch {
			/* skip */
		}
	}

	function drawContent() {
		ctx.save();
		const padX = Math.round(width * 0.06);
		const padY = Math.round(fontSize * 0.6);
		const maxContentW = width * 0.85;
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		ctx.font = `400 ${socialFontSize}px ${ff}`;
		for (const line of socialLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		maxLineW = Math.min(maxLineW, maxContentW - padX * 2);

		const bgW = Math.min(maxLineW + padX * 2, maxContentW);
		const bgH = totalBlockHeight + padY * 2;
		const bgX = width / 2 - bgW / 2;
		const bgY = blockStartY - titleLineHeight / 2 - padY;

		ctx.fillStyle = hexToRgba(secColor, 0.75);
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
		ctx.fill();

		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], width / 2, blockStartY + i * titleLineHeight);
		}

		const lineY = blockStartY + totalTitleHeight + separatorGap * 0.5;
		ctx.strokeStyle = titleColor;
		ctx.globalAlpha = 0.6;
		ctx.lineWidth = 2;
		const sepW = Math.min(bgW * 0.5, width * 0.3);
		ctx.beginPath();
		ctx.moveTo(width / 2 - sepW / 2, lineY);
		ctx.lineTo(width / 2 + sepW / 2, lineY);
		ctx.stroke();
		ctx.globalAlpha = 1;

		if (socialLines.length > 0) {
			const socialStartY = blockStartY + totalTitleHeight + separatorGap + socialGap;
			ctx.font = `400 ${socialFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			const maxTextW = bgW - padX * 2;
			for (let i = 0; i < socialLines.length; i++) {
				let line = socialLines[i];
				if (ctx.measureText(line).width > maxTextW) {
					while (line.length > 1 && ctx.measureText(line + '...').width > maxTextW) {
						line = line.slice(0, -1);
					}
					line = line.trimEnd() + '...';
				}
				ctx.fillText(line, width / 2, socialStartY + i * socialLineHeight);
			}
			ctx.globalAlpha = 1;
		}

		ctx.restore();
	}

	function drawLogo() {
		if (!logoImage) return;
		const logoSize = Math.round(width * 0.12);
		const margin = Math.round(width * 0.04);
		const scale = Math.min(
			logoSize / logoImage.naturalWidth,
			logoSize / logoImage.naturalHeight
		);
		const drawW = logoImage.naturalWidth * scale;
		const drawH = logoImage.naturalHeight * scale;
		const x = width - margin - drawW;
		const y = height - margin - drawH;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.drawImage(logoImage, x, y, drawW, drawH);
		ctx.restore();
	}

	function drawFrame() {
		ctx.clearRect(0, 0, width, height);
		if (bgImage) {
			drawCoverFit(ctx, bgImage, width, height);
			ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const gradient = ctx.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, '#0a0a0a');
			gradient.addColorStop(0.5, '#1a1a2e');
			gradient.addColorStop(1, '#0a0a0a');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		drawContent();
		drawLogo();
		frameCallback?.(ctx);
	}

	const totalFrames = Math.round(durationSec * fps);
	console.log(
		`[TitleRenderer] generateOutroCardFrames: ${totalFrames} frames (${durationSec}s @ ${fps}fps)`
	);
	for (let i = 0; i < totalFrames; i++) {
		drawFrame();
		onFrame(canvas);
	}
}
