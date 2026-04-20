/**
 * Pure canvas drawing primitives. No MapLibre dependency.
 * Any function that only needs a 2D context (pills, pins, vignettes, text, stats)
 * lives here so it can be unit-tested and reused across renderers.
 */
import type { TransportMode } from '$lib/types';

export const TRANSPORT_ICONS: Record<TransportMode, { icon: string; label: string }> = {
	walked: { icon: '\u{1F6B6}', label: 'Walked' },
	drove: { icon: '\u{1F697}', label: 'Drove' },
	biked: { icon: '\u{1F6B4}', label: 'Biked' }
};

/** Rounded-rectangle path on the current context. Caller must fill/stroke. */
export function canvasRoundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

export function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function luminance(hex: string): number {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 5-point star path centered at (cx, cy). Caller fills/strokes after. */
export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number) {
	const innerR = outerR * 0.4;
	const spikes = 5;
	ctx.beginPath();
	for (let i = 0; i < spikes * 2; i++) {
		const r = i % 2 === 0 ? outerR : innerR;
		const angle = (Math.PI / 2) * -1 + (Math.PI / spikes) * i;
		const px = cx + Math.cos(angle) * r;
		const py = cy + Math.sin(angle) * r;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';
	for (const word of words) {
		const testLine = currentLine ? `${currentLine} ${word}` : word;
		if (ctx.measureText(testLine).width > maxWidth && currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = testLine;
		}
	}
	if (currentLine) lines.push(currentLine);
	return lines;
}

/** Cinematic top + bottom gradient for lower-third readability. */
export function drawVignette(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	intensity: number = 1
) {
	const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.18);
	topGrad.addColorStop(0, `rgba(0, 0, 0, ${0.3 * intensity})`);
	topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = topGrad;
	ctx.fillRect(0, 0, width, height * 0.18);

	const botGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
	botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
	botGrad.addColorStop(0.45, `rgba(0, 0, 0, ${0.25 * intensity})`);
	botGrad.addColorStop(1, `rgba(0, 0, 0, ${0.65 * intensity})`);
	ctx.fillStyle = botGrad;
	ctx.fillRect(0, height * 0.5, width, height * 0.5);
}

/**
 * Map pin on the canvas at (x, y).
 * When showLabel is true, draws the name pill above the dot (final-route use).
 * When false, draws only the colored dot (fly-to use, where the lower-third owns the name).
 */
export function drawPinOnCanvas(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	label: string,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	rating: number | null = null,
	showLabel: boolean = true,
	bgColor: string = 'rgba(10, 15, 30, 0.88)'
) {
	ctx.save();

	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 4;

	ctx.beginPath();
	ctx.arc(x, y, 22, 0, Math.PI * 2);
	ctx.fillStyle = 'white';
	ctx.fill();
	ctx.shadowColor = 'transparent';

	ctx.beginPath();
	ctx.arc(x, y, 17, 0, Math.PI * 2);
	ctx.fillStyle = accentColor;
	ctx.fill();

	ctx.beginPath();
	ctx.arc(x, y, 6, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.7)';
	ctx.fill();

	if (showLabel) {
		const fontSize = 30;
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const metrics = ctx.measureText(label);
		const padX = 20,
			padY = 12;
		const bgW = metrics.width + padX * 2;
		const bgH = fontSize + padY * 2;
		const bgX = x - bgW / 2;
		const bgY = y - 38 - bgH;

		ctx.shadowColor = 'rgba(0,0,0,0.4)';
		ctx.shadowBlur = 14;
		ctx.shadowOffsetY = 4;
		ctx.fillStyle = bgColor;
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
		ctx.fill();

		ctx.shadowColor = 'transparent';
		ctx.strokeStyle = hexToRgba(accentColor, 0.6);
		ctx.lineWidth = 2;
		canvasRoundRect(ctx, bgX, bgY, bgW, bgH, bgH / 2);
		ctx.stroke();

		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(label, x, bgY + bgH / 2);
	}

	ctx.restore();
}

/** Lower-third card used during fly-to: counter pill, name, stars, transport. */
export function drawLocationLowerThird(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	name: string,
	locationIndex: number,
	totalLocations: number,
	accentColor: string,
	ff: string,
	rating: number | null,
	transportMode: TransportMode | null | undefined,
	secondaryColor: string
) {
	ctx.save();

	const nameFontSize = Math.round(width * 0.044);
	const counterFontSize = Math.round(width * 0.02);
	const transportFontSize = Math.round(width * 0.022);
	const starRadius = Math.round(width * 0.011);
	const maxTextW = width * 0.82;

	ctx.font = `700 ${nameFontSize}px ${ff}`;
	const nameLines = wrapText(ctx, name, maxTextW);
	if (nameLines.length > 2) {
		nameLines.length = 2;
		let last = nameLines[1];
		while (last.length > 1 && ctx.measureText(last + '...').width > maxTextW) {
			last = last.slice(0, -1);
		}
		nameLines[1] = last.trimEnd() + '...';
	}
	const nameLineH = nameFontSize * 1.2;
	const totalNameH = nameLines.length * nameLineH;

	ctx.font = `600 ${counterFontSize}px ${ff}`;
	const counterText = `${locationIndex + 1} of ${totalLocations}`;
	const counterMetrics = ctx.measureText(counterText);
	const counterPadX = Math.round(counterFontSize * 0.8);
	const counterPadY = Math.round(counterFontSize * 0.3);
	const counterPillW = counterMetrics.width + counterPadX * 2;
	const counterPillH = counterFontSize + counterPadY * 2;

	const hasRating = rating !== null && rating > 0;
	const starGap = Math.round(starRadius * 0.4);
	const starsRowH = hasRating ? starRadius * 2 : 0;

	const hasTransport = !!transportMode;

	const gap = Math.round(height * 0.007);
	const gapLarge = Math.round(height * 0.01);

	let blockH = counterPillH + gapLarge + totalNameH;
	if (hasRating) blockH += gap + starsRowH;
	if (hasTransport) blockH += gap + transportFontSize;

	const centerY = height * 0.8;
	let curY = centerY - blockH / 2;

	const backdropPadX = Math.round(width * 0.05);
	const backdropPadY = Math.round(height * 0.012);
	ctx.font = `700 ${nameFontSize}px ${ff}`;
	let maxContentW = 0;
	for (const line of nameLines) maxContentW = Math.max(maxContentW, ctx.measureText(line).width);
	maxContentW = Math.max(maxContentW, counterPillW);
	const backdropW = maxContentW + backdropPadX * 2;
	const backdropH = blockH + backdropPadY * 2;
	const backdropX = width / 2 - backdropW / 2;
	const backdropY = curY - backdropPadY;

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 20;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.7);
	canvasRoundRect(ctx, backdropX, backdropY, backdropW, backdropH, 18);
	ctx.fill();
	ctx.shadowColor = 'transparent';

	ctx.fillStyle = hexToRgba(accentColor, 0.85);
	canvasRoundRect(ctx, backdropX, backdropY, 4, backdropH, 2);
	ctx.fill();

	const counterCY = curY + counterPillH / 2;
	const counterPillX = width / 2 - counterPillW / 2;

	ctx.fillStyle = hexToRgba(accentColor, 0.9);
	canvasRoundRect(
		ctx,
		counterPillX - 8,
		counterCY - counterPillH / 2,
		counterPillW + 16,
		counterPillH,
		counterPillH / 2
	);
	ctx.fill();

	ctx.font = `600 ${counterFontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#FFFFFF';
	ctx.fillText(counterText, width / 2, counterCY);
	curY += counterPillH + gapLarge;

	ctx.font = `700 ${nameFontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#FFFFFF';
	for (let i = 0; i < nameLines.length; i++) {
		ctx.fillText(nameLines[i], width / 2, curY + nameLineH / 2 + i * nameLineH);
	}
	curY += totalNameH;

	if (hasRating) {
		curY += gap;
		const starsCY = curY + starRadius;
		const totalStarsW = 5 * (starRadius * 2) + 4 * starGap;
		const starsX = width / 2 - totalStarsW / 2;

		for (let i = 0; i < 5; i++) {
			const cx = starsX + starRadius + i * (starRadius * 2 + starGap);
			if (rating! >= i + 1) {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
			} else if (rating! >= i + 0.5) {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
				ctx.save();
				ctx.beginPath();
				ctx.rect(cx - starRadius, starsCY - starRadius, starRadius, starRadius * 2);
				ctx.clip();
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = '#FBBF24';
				ctx.fill();
				ctx.restore();
			} else {
				drawStar(ctx, cx, starsCY, starRadius);
				ctx.fillStyle = 'rgba(255,255,255,0.15)';
				ctx.fill();
			}
		}
		curY += starsRowH;
	}

	if (hasTransport) {
		curY += gap;
		const info = TRANSPORT_ICONS[transportMode!];
		const tText = `${info.icon}  ${info.label}`;
		ctx.font = `500 ${transportFontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
		ctx.fillText(tText, width / 2, curY + transportFontSize / 2);
	}

	ctx.restore();
}

/** Stats bar drawn near the bottom of the final route frame. */
export function drawStatsOnCanvas(
	ctx: CanvasRenderingContext2D,
	stats: { stops: number; miles: number; minutes: number },
	width: number,
	height: number,
	accentColor: string = '#FFFFFF',
	ff: string = 'Inter, system-ui, sans-serif',
	secondaryColor: string = '#0a0f1e'
) {
	const milesStr = stats.miles < 10 ? stats.miles.toFixed(1) : Math.round(stats.miles).toString();
	const minsStr = Math.round(stats.minutes).toString();
	const text = `${stats.stops} stops \u00B7 ${milesStr} mi \u00B7 ~${minsStr} min`;

	ctx.save();
	const fontSize = width > 1200 ? 40 : 34;
	ctx.font = `600 ${fontSize}px ${ff}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const metrics = ctx.measureText(text);
	const padX = 44,
		padY = 22;
	const bgW = metrics.width + padX * 2;
	const bgH = fontSize + padY * 2;
	const bgX = width / 2 - bgW / 2;
	const bgY = Math.round(height * 0.87 - bgH);

	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = hexToRgba(secondaryColor, 0.82);
	canvasRoundRect(ctx, bgX, bgY, bgW, bgH, 16);
	ctx.fill();

	ctx.shadowColor = 'transparent';
	ctx.fillStyle = hexToRgba(accentColor, 0.85);
	canvasRoundRect(ctx, bgX, bgY, 4, bgH, 2);
	ctx.fill();

	ctx.fillStyle = hexToRgba(accentColor, 0.7);
	canvasRoundRect(ctx, bgX + 16, bgY, bgW - 32, 3, 1.5);
	ctx.fill();

	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = '#FFFFFF';
	ctx.fillText(text, width / 2, bgY + bgH / 2);

	ctx.restore();
}

/** Cover-fit an image onto a canvas context (like CSS object-fit: cover). */
export function drawCoverFit(
	ctx: CanvasRenderingContext2D,
	source: HTMLImageElement,
	width: number,
	height: number
) {
	const srcW = source.naturalWidth;
	const srcH = source.naturalHeight;
	const scale = Math.max(width / srcW, height / srcH);
	const drawW = srcW * scale;
	const drawH = srcH * scale;
	const dx = (width - drawW) / 2;
	const dy = (height - drawH) / 2;
	ctx.drawImage(source, dx, dy, drawW, drawH);
}
