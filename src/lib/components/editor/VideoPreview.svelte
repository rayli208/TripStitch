<script lang="ts">
	import type { Location, AspectRatio } from '$lib/types';
	import { fontFamily } from '$lib/constants/fonts';
	import { loadFont } from '$lib/utils/fontLoader';
	import { Play, Pause, SkipBack, SkipForward, Eye, X } from 'phosphor-svelte';

	let {
		title = 'My Trip',
		titleColor = '#FFFFFF',
		titleDescription = '',
		fontId = 'inter',
		secondaryColor = '#0a0f1e',
		titleMediaFile = null,
		logoUrl = null,
		showLogoOnTitle = false,
		locations = [],
		aspectRatio = '9:16',
		username = '',
		displayName = '',
		socialLinks = {},
		estimatedDuration = '',
		hasOutro = false
	}: {
		title?: string;
		titleColor?: string;
		titleDescription?: string;
		fontId?: string;
		secondaryColor?: string;
		titleMediaFile?: File | null;
		logoUrl?: string | null;
		showLogoOnTitle?: boolean;
		locations?: Location[];
		aspectRatio?: AspectRatio;
		username?: string;
		displayName?: string;
		socialLinks?: { instagram?: string; youtube?: string; tiktok?: string; website?: string };
		estimatedDuration?: string;
		hasOutro?: boolean;
	} = $props();

	// Preview state
	let expanded = $state(false);
	let playing = $state(false);
	let currentSegmentIndex = $state(0);
	let segmentProgress = $state(0);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let animFrame: number | null = null;
	let playStartTime = 0;

	// Build segment list from trip data
	interface PreviewSegment {
		id: string;
		label: string;
		type: 'title' | 'map' | 'photo' | 'video' | 'route' | 'outro';
		durationSec: number;
		file?: File | null;
		locationName?: string;
		locationIndex?: number;
	}

	let segments = $derived.by<PreviewSegment[]>(() => {
		const segs: PreviewSegment[] = [];
		segs.push({ id: 'title', label: 'Title Card', type: 'title', durationSec: 2.5 });
		const sorted = [...locations].sort((a, b) => a.order - b.order);
		for (let i = 0; i < sorted.length; i++) {
			const loc = sorted[i];
			const name = loc.label || loc.name.split(',')[0];
			segs.push({
				id: `map-${loc.id}`,
				label: `Map: ${name}`,
				type: 'map',
				durationSec: i === 0 ? 3.2 : 4.1,
				locationName: name,
				locationIndex: i
			});
			const clips = [...loc.clips].filter(c => c.file).sort((a, b) => a.order - b.order);
			for (const clip of clips) {
				if (clip.type === 'video') {
					segs.push({
						id: `clip-${clip.id}`,
						label: `Video: ${name}`,
						type: 'video',
						durationSec: clip.durationSec ?? 5,
						file: clip.file
					});
				} else {
					segs.push({
						id: `clip-${clip.id}`,
						label: `Photo: ${name}`,
						type: 'photo',
						durationSec: clip.durationSec ?? 3,
						file: clip.file
					});
				}
			}
		}
		segs.push({ id: 'route', label: 'Final Route', type: 'route', durationSec: 4.5 });
		if (hasOutro) {
			segs.push({ id: 'outro', label: 'Outro', type: 'outro', durationSec: 3 });
		}
		return segs;
	});

	let totalDuration = $derived(segments.reduce((sum, s) => sum + s.durationSec, 0));

	let currentSegment = $derived(segments[currentSegmentIndex]);

	// Render current segment to canvas
	$effect(() => {
		if (!canvasEl || !expanded) return;
		const seg = segments[currentSegmentIndex];
		if (!seg) return;
		renderSegment(seg);
	});

	function getCanvasSize(): { w: number; h: number } {
		// Small preview — max 240px tall, proportional width
		const maxH = 240;
		if (aspectRatio === '9:16') return { w: Math.round(maxH * 9 / 16), h: maxH };
		if (aspectRatio === '1:1') return { w: maxH, h: maxH };
		return { w: Math.round(maxH * 16 / 9), h: maxH };
	}

	async function renderSegment(seg: PreviewSegment) {
		if (!canvasEl) return;
		const { w, h } = getCanvasSize();
		canvasEl.width = w;
		canvasEl.height = h;
		const ctx = canvasEl.getContext('2d')!;

		const ff = fontFamily(fontId);
		try { await loadFont(fontId); } catch { /* ok */ }

		if (seg.type === 'title') {
			await renderTitleFrame(ctx, w, h, ff);
		} else if (seg.type === 'outro') {
			await renderOutroFrame(ctx, w, h, ff);
		} else if ((seg.type === 'photo' || seg.type === 'video') && seg.file) {
			await renderMediaFrame(ctx, w, h, seg.file, seg.type);
		} else if (seg.type === 'map') {
			renderMapPlaceholder(ctx, w, h, ff, seg.locationName ?? '', seg.locationIndex ?? 0);
		} else if (seg.type === 'route') {
			renderRoutePlaceholder(ctx, w, h, ff);
		}
	}

	async function renderTitleFrame(ctx: CanvasRenderingContext2D, w: number, h: number, ff: string) {
		// Background
		if (titleMediaFile) {
			try {
				const img = await loadImageFile(titleMediaFile);
				drawCover(ctx, img, w, h);
				ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
				ctx.fillRect(0, 0, w, h);
			} catch {
				drawGradient(ctx, w, h);
			}
		} else {
			drawGradient(ctx, w, h);
		}

		const fontSize = Math.round(w * 0.06);
		const descFontSize = Math.round(fontSize * 0.6);

		ctx.font = `700 ${fontSize}px ${ff}`;
		const lines = wrapText(ctx, title, w * 0.8);
		const lineH = fontSize * 1.3;
		const totalTitleH = lines.length * lineH;

		let descLines: string[] = [];
		if (titleDescription) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			descLines = wrapText(ctx, titleDescription, w * 0.8);
		}
		const descLineH = descFontSize * 1.4;
		const descGap = titleDescription ? fontSize * 0.5 : 0;
		const totalDescH = descLines.length * descLineH;
		const totalBlockH = totalTitleH + descGap + totalDescH;
		const startY = (h - totalBlockH) / 2 + lineH / 2;

		// Pill background
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of lines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		if (descLines.length > 0) {
			ctx.font = `400 ${descFontSize}px ${ff}`;
			for (const line of descLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		}
		const padX = w * 0.06;
		const padY = fontSize * 0.6;
		const bgW = maxLineW + padX * 2;
		const bgH = totalBlockH + padY * 2;
		const bgX = w / 2 - bgW / 2;
		const bgY = startY - lineH / 2 - padY;

		ctx.fillStyle = hexToRgba(secondaryColor, 0.75);
		roundRect(ctx, bgX, bgY, bgW, bgH, 8);
		ctx.fill();

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		roundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		// Title text (white)
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], w / 2, startY + i * lineH);
		}

		if (descLines.length > 0) {
			const descStartY = startY + totalTitleH + descGap;
			ctx.font = `400 ${descFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < descLines.length; i++) {
				ctx.fillText(descLines[i], w / 2, descStartY + i * descLineH);
			}
			ctx.globalAlpha = 1;
		} else {
			// Accent-colored separator
			const lineY = startY + totalTitleH + fontSize * 0.4;
			ctx.strokeStyle = titleColor;
			ctx.globalAlpha = 0.6;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(w * 0.35, lineY);
			ctx.lineTo(w * 0.65, lineY);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		// Logo watermark
		if (showLogoOnTitle && logoUrl) {
			try {
				const logoImg = await loadImageUrl(logoUrl);
				const logoSize = Math.round(w * 0.12);
				const margin = Math.round(w * 0.04);
				const scale = Math.min(logoSize / logoImg.naturalWidth, logoSize / logoImg.naturalHeight);
				const drawW = logoImg.naturalWidth * scale;
				const drawH = logoImg.naturalHeight * scale;
				ctx.save();
				ctx.globalAlpha = 0.8;
				ctx.drawImage(logoImg, w - margin - drawW, h - margin - drawH, drawW, drawH);
				ctx.restore();
			} catch { /* skip */ }
		}
	}

	async function renderOutroFrame(ctx: CanvasRenderingContext2D, w: number, h: number, ff: string) {
		if (titleMediaFile) {
			try {
				const img = await loadImageFile(titleMediaFile);
				drawCover(ctx, img, w, h);
				ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
				ctx.fillRect(0, 0, w, h);
			} catch {
				drawGradient(ctx, w, h);
			}
		} else {
			drawGradient(ctx, w, h);
		}

		const fontSize = Math.round(w * 0.05);
		const socialFontSize = Math.round(fontSize * 0.5);

		ctx.font = `700 ${fontSize}px ${ff}`;
		const titleLines = wrapText(ctx, title, w * 0.8);
		const lineH = fontSize * 1.3;
		const totalTitleH = titleLines.length * lineH;

		// Build social lines (each on its own line, matching video pipeline)
		const socialTextLines: string[] = [];
		if (displayName) socialTextLines.push(displayName);
		else if (username) socialTextLines.push(`@${username}`);
		if (socialLinks?.instagram) socialTextLines.push(`@${socialLinks.instagram.replace(/^@/, '')}`);
		if (socialLinks?.tiktok) socialTextLines.push(`@${socialLinks.tiktok.replace(/^@/, '')}`);
		if (socialLinks?.youtube) socialTextLines.push(socialLinks.youtube);
		if (socialLinks?.website) socialTextLines.push(socialLinks.website);

		const socialLineH = socialFontSize * 1.6;
		const totalSocialH = socialTextLines.length * socialLineH;
		const separatorGap = fontSize * 0.6;
		const socialGap = fontSize * 0.5;
		const totalBlockH = totalTitleH + separatorGap + totalSocialH + (socialTextLines.length > 0 ? socialGap : 0);
		const startY = (h - totalBlockH) / 2 + lineH / 2;

		// Measure max width
		ctx.font = `700 ${fontSize}px ${ff}`;
		let maxLineW = 0;
		for (const line of titleLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		ctx.font = `400 ${socialFontSize}px ${ff}`;
		for (const line of socialTextLines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
		const maxContentW = w * 0.85;
		maxLineW = Math.min(maxLineW, maxContentW - w * 0.12);

		const padX = w * 0.06;
		const padY = fontSize * 0.6;
		const bgW = Math.min(maxLineW + padX * 2, maxContentW);
		const bgH = totalBlockH + padY * 2;
		const bgX = w / 2 - bgW / 2;
		const bgY = startY - lineH / 2 - padY;

		ctx.fillStyle = hexToRgba(secondaryColor, 0.75);
		roundRect(ctx, bgX, bgY, bgW, bgH, 8);
		ctx.fill();

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		roundRect(ctx, bgX, bgY, 4, bgH, 2);
		ctx.fill();

		// Title (white)
		ctx.font = `700 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < titleLines.length; i++) {
			ctx.fillText(titleLines[i], w / 2, startY + i * lineH);
		}

		// Accent-colored separator
		const sepY = startY + totalTitleH + separatorGap * 0.5;
		ctx.strokeStyle = titleColor;
		ctx.globalAlpha = 0.6;
		ctx.lineWidth = 2;
		const sepW = Math.min(bgW * 0.5, w * 0.3);
		ctx.beginPath();
		ctx.moveTo(w / 2 - sepW / 2, sepY);
		ctx.lineTo(w / 2 + sepW / 2, sepY);
		ctx.stroke();
		ctx.globalAlpha = 1;

		// Social text (white)
		if (socialTextLines.length > 0) {
			const socialY = startY + totalTitleH + separatorGap + socialGap;
			ctx.font = `400 ${socialFontSize}px ${ff}`;
			ctx.globalAlpha = 0.7;
			ctx.fillStyle = '#FFFFFF';
			for (let i = 0; i < socialTextLines.length; i++) {
				ctx.fillText(socialTextLines[i], w / 2, socialY + i * socialLineH);
			}
			ctx.globalAlpha = 1;
		}

		// Logo watermark
		if (showLogoOnTitle && logoUrl) {
			try {
				const logoImg = await loadImageUrl(logoUrl);
				const logoSize = Math.round(w * 0.12);
				const margin = Math.round(w * 0.04);
				const scale = Math.min(logoSize / logoImg.naturalWidth, logoSize / logoImg.naturalHeight);
				const drawW = logoImg.naturalWidth * scale;
				const drawH = logoImg.naturalHeight * scale;
				ctx.save();
				ctx.globalAlpha = 0.8;
				ctx.drawImage(logoImg, w - margin - drawW, h - margin - drawH, drawW, drawH);
				ctx.restore();
			} catch { /* skip */ }
		}
	}

	async function renderMediaFrame(ctx: CanvasRenderingContext2D, w: number, h: number, file: File, type: string) {
		if (type === 'video') {
			try {
				const video = document.createElement('video');
				video.muted = true;
				video.playsInline = true;
				video.src = URL.createObjectURL(file);
				await new Promise<void>((resolve, reject) => {
					video.onloadeddata = () => resolve();
					video.onerror = () => reject();
				});
				video.currentTime = 0;
				await new Promise(r => setTimeout(r, 100));
				drawCover(ctx, video, w, h);
				URL.revokeObjectURL(video.src);
			} catch {
				ctx.fillStyle = '#111';
				ctx.fillRect(0, 0, w, h);
				ctx.fillStyle = '#666';
				ctx.font = '12px sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText('Video', w / 2, h / 2);
			}
		} else {
			try {
				const img = await loadImageFile(file);
				drawCover(ctx, img, w, h);
			} catch {
				ctx.fillStyle = '#111';
				ctx.fillRect(0, 0, w, h);
			}
		}
	}

	function renderMapPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, ff: string, name: string, index: number) {
		// Dark map-like background
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, '#1a2332');
		grad.addColorStop(0.5, '#0f172a');
		grad.addColorStop(1, '#0a1020');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);

		// Cinematic vignette (top + bottom gradients)
		drawVignette(ctx, w, h);

		// "Map transition" subtle label in center
		ctx.fillStyle = 'rgba(255,255,255,0.15)';
		ctx.font = `400 ${Math.round(w * 0.03)}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('Map Transition', w / 2, h * 0.45);

		// Lower-third overlay (matching video pipeline)
		const sorted = [...locations].sort((a, b) => a.order - b.order);
		const totalLocs = sorted.length;
		const counterText = `${index + 1} of ${totalLocs}`;
		const nameFontSize = Math.round(w * 0.045);
		const counterFontSize = Math.round(nameFontSize * 0.55);
		const counterPillH = counterFontSize * 1.6;

		// Measure name
		ctx.font = `700 ${nameFontSize}px ${ff}`;
		const nameLines = wrapText(ctx, name, w * 0.7);
		const nameLineH = nameFontSize * 1.3;
		const totalNameH = nameLines.length * nameLineH;

		const gapLarge = Math.round(h * 0.008);
		const blockH = counterPillH + gapLarge + totalNameH;
		const centerY = h * 0.80;
		let curY = centerY - blockH / 2;

		// Backdrop pill
		const backdropPadX = Math.round(w * 0.05);
		const backdropPadY = Math.round(h * 0.012);
		ctx.font = `700 ${nameFontSize}px ${ff}`;
		let maxContentW = 0;
		for (const line of nameLines) maxContentW = Math.max(maxContentW, ctx.measureText(line).width);
		ctx.font = `600 ${counterFontSize}px ${ff}`;
		const counterW = ctx.measureText(counterText).width + counterFontSize * 1.2;
		maxContentW = Math.max(maxContentW, counterW);
		const backdropW = maxContentW + backdropPadX * 2;
		const backdropH = blockH + backdropPadY * 2;
		const backdropX = w / 2 - backdropW / 2;
		const backdropY = curY - backdropPadY;

		ctx.shadowColor = 'rgba(0,0,0,0.3)';
		ctx.shadowBlur = 10;
		ctx.shadowOffsetY = 2;
		ctx.fillStyle = hexToRgba(secondaryColor, 0.7);
		roundRect(ctx, backdropX, backdropY, backdropW, backdropH, 8);
		ctx.fill();
		ctx.shadowColor = 'transparent';

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		roundRect(ctx, backdropX, backdropY, 3, backdropH, 1.5);
		ctx.fill();

		// Counter pill (accent-filled)
		const counterCY = curY + counterPillH / 2;
		const counterPillX = w / 2 - counterW / 2;
		ctx.fillStyle = hexToRgba(titleColor, 0.9);
		roundRect(ctx, counterPillX - 4, counterCY - counterPillH / 2, counterW + 8, counterPillH, counterPillH / 2);
		ctx.fill();

		ctx.font = `600 ${counterFontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(counterText, w / 2, counterCY);
		curY += counterPillH + gapLarge;

		// Location name (white)
		ctx.font = `700 ${nameFontSize}px ${ff}`;
		ctx.fillStyle = '#FFFFFF';
		for (let i = 0; i < nameLines.length; i++) {
			ctx.fillText(nameLines[i], w / 2, curY + nameLineH / 2 + i * nameLineH);
		}
	}

	function renderRoutePlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, ff: string) {
		// Dark map-like background
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, '#1a2332');
		grad.addColorStop(0.5, '#0f172a');
		grad.addColorStop(1, '#0a1020');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);

		// Cinematic vignette
		drawVignette(ctx, w, h, 0.7);

		// Route dots in center area
		const cx = w / 2;
		const cy = h * 0.42;
		const dots = Math.min(locations.length, 5);
		const spacing = Math.round(w * 0.06);
		const startX = cx - (dots - 1) * spacing / 2;
		const dotR = Math.round(w * 0.008);

		for (let i = 0; i < dots; i++) {
			const x = startX + i * spacing;
			if (i > 0) {
				ctx.strokeStyle = titleColor;
				ctx.lineWidth = 1.5;
				ctx.globalAlpha = 0.5;
				ctx.beginPath();
				ctx.moveTo(x - spacing + dotR + 2, cy);
				ctx.lineTo(x - dotR - 2, cy);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
			ctx.beginPath();
			ctx.arc(x, cy, dotR, 0, Math.PI * 2);
			ctx.fillStyle = titleColor;
			ctx.fill();
		}

		// "Final Route" subtle label
		ctx.fillStyle = 'rgba(255,255,255,0.15)';
		ctx.font = `400 ${Math.round(w * 0.03)}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('Final Route', cx, h * 0.55);

		// Stats bar at bottom (matching video pipeline style)
		const fontSize = Math.round(w * 0.035);
		const text = `${locations.length} stops`;
		ctx.font = `600 ${fontSize}px ${ff}`;
		const metrics = ctx.measureText(text);
		const padX = Math.round(w * 0.04);
		const padY = Math.round(fontSize * 0.6);
		const bgW = metrics.width + padX * 2;
		const bgH = fontSize + padY * 2;
		const bgX = w / 2 - bgW / 2;
		const bgY = Math.round(h * 0.87 - bgH);

		ctx.shadowColor = 'rgba(0,0,0,0.35)';
		ctx.shadowBlur = 12;
		ctx.shadowOffsetY = 2;
		ctx.fillStyle = hexToRgba(secondaryColor, 0.82);
		roundRect(ctx, bgX, bgY, bgW, bgH, 8);
		ctx.fill();
		ctx.shadowColor = 'transparent';

		// Accent left stripe
		ctx.fillStyle = hexToRgba(titleColor, 0.85);
		roundRect(ctx, bgX, bgY, 3, bgH, 1.5);
		ctx.fill();

		// Accent top line
		ctx.fillStyle = hexToRgba(titleColor, 0.7);
		roundRect(ctx, bgX + 8, bgY, bgW - 16, 2, 1);
		ctx.fill();

		// Stats text (white)
		ctx.fillStyle = '#FFFFFF';
		ctx.font = `600 ${fontSize}px ${ff}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, w / 2, bgY + bgH / 2);
	}

	// Playback controls
	function togglePlay() {
		if (playing) {
			stopPlayback();
		} else {
			startPlayback();
		}
	}

	function startPlayback() {
		playing = true;
		segmentProgress = 0;
		playStartTime = performance.now();
		tick();
	}

	function stopPlayback() {
		playing = false;
		if (animFrame) cancelAnimationFrame(animFrame);
		animFrame = null;
	}

	function tick() {
		if (!playing) return;
		const seg = segments[currentSegmentIndex];
		if (!seg) { stopPlayback(); return; }

		const elapsed = (performance.now() - playStartTime) / 1000;
		segmentProgress = Math.min(elapsed / seg.durationSec, 1);

		if (elapsed >= seg.durationSec) {
			if (currentSegmentIndex < segments.length - 1) {
				currentSegmentIndex++;
				playStartTime = performance.now();
				segmentProgress = 0;
			} else {
				stopPlayback();
				segmentProgress = 1;
				return;
			}
		}
		animFrame = requestAnimationFrame(tick);
	}

	function prevSegment() {
		stopPlayback();
		if (currentSegmentIndex > 0) currentSegmentIndex--;
		segmentProgress = 0;
	}

	function nextSegment() {
		stopPlayback();
		if (currentSegmentIndex < segments.length - 1) currentSegmentIndex++;
		segmentProgress = 0;
	}

	function jumpToSegment(index: number) {
		stopPlayback();
		currentSegmentIndex = index;
		segmentProgress = 0;
	}

	// Elapsed time up to current segment
	let elapsedUpToCurrent = $derived(
		segments.slice(0, currentSegmentIndex).reduce((sum, s) => sum + s.durationSec, 0)
	);

	// Helpers
	function loadImageFile(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
			img.onerror = () => { URL.revokeObjectURL(url); reject(); };
			img.src = url;
		});
	}

	function drawCover(ctx: CanvasRenderingContext2D, source: HTMLImageElement | HTMLVideoElement, tw: number, th: number) {
		const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
		const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
		if (!sw || !sh) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, tw, th); return; }
		const scale = Math.max(tw / sw, th / sh);
		const dw = sw * scale;
		const dh = sh * scale;
		ctx.drawImage(source, (tw - dw) / 2, (th - dh) / 2, dw, dh);
	}

	function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number = 1) {
		// Top gradient
		const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.18);
		topGrad.addColorStop(0, `rgba(0,0,0,${0.3 * intensity})`);
		topGrad.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = topGrad;
		ctx.fillRect(0, 0, w, h * 0.18);
		// Bottom gradient
		const botGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
		botGrad.addColorStop(0, 'rgba(0,0,0,0)');
		botGrad.addColorStop(1, `rgba(0,0,0,${0.65 * intensity})`);
		ctx.fillStyle = botGrad;
		ctx.fillRect(0, h * 0.5, w, h * 0.5);
	}

	function loadImageUrl(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => reject();
			img.src = url;
		});
	}

	function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number) {
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, '#0a0a0a');
		grad.addColorStop(0.5, '#1a1a2e');
		grad.addColorStop(1, '#0a0a0a');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);
	}

	function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
		const words = text.split(' ');
		const lines: string[] = [];
		let line = '';
		for (const word of words) {
			const test = line ? `${line} ${word}` : word;
			if (ctx.measureText(test).width > maxW && line) {
				lines.push(line);
				line = word;
			} else {
				line = test;
			}
		}
		if (line) lines.push(line);
		return lines;
	}

	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

	function formatSec(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.round(sec % 60);
		return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
	}

	const segmentColors: Record<string, string> = {
		title: '#6366f1',
		map: '#0ea5e9',
		photo: '#22c55e',
		video: '#f59e0b',
		route: '#8b5cf6',
		outro: '#6366f1'
	};

	// Cleanup
	$effect(() => {
		return () => {
			if (animFrame) cancelAnimationFrame(animFrame);
		};
	});
</script>

{#if !expanded}
	<button
		class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer text-sm text-text-muted"
		onclick={() => { expanded = true; }}
	>
		<Eye size={16} weight="bold" />
		<span>Preview Video</span>
		{#if estimatedDuration}
			<span class="text-xs opacity-60">({estimatedDuration})</span>
		{/if}
	</button>
{:else}
	<div class="rounded-xl border border-border bg-card overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between px-3 py-2 border-b border-border">
			<span class="text-xs font-medium text-text-secondary">Video Preview</span>
			<button
				class="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-0.5"
				onclick={() => { expanded = false; stopPlayback(); }}
			>
				<X size={14} weight="bold" />
			</button>
		</div>

		<!-- Canvas -->
		<div class="flex justify-center bg-black/40 p-3">
			<canvas
				bind:this={canvasEl}
				class="rounded-lg"
				style="max-width: 100%; height: auto;"
			></canvas>
		</div>

		<!-- Segment label -->
		<div class="px-3 pt-2 pb-1">
			<p class="text-xs text-text-muted truncate">{currentSegment?.label ?? ''}</p>
		</div>

		<!-- Timeline bar -->
		<div class="px-3 pb-2">
			<div class="flex gap-px h-2 rounded-full overflow-hidden bg-border/50">
				{#each segments as seg, i (seg.id)}
					<button
						class="h-full transition-opacity cursor-pointer"
						style="flex: {seg.durationSec}; background: {segmentColors[seg.type] ?? '#666'}; opacity: {i < currentSegmentIndex ? 0.4 : i === currentSegmentIndex ? 1 : 0.2};"
						onclick={() => jumpToSegment(i)}
						title={seg.label}
					></button>
				{/each}
			</div>
			<div class="flex justify-between text-xs text-text-muted mt-1">
				<span>{formatSec(elapsedUpToCurrent + (currentSegment ? currentSegment.durationSec * segmentProgress : 0))}</span>
				<span>{formatSec(totalDuration)}</span>
			</div>
		</div>

		<!-- Controls -->
		<div class="flex items-center justify-center gap-3 px-3 pb-3">
			<button
				class="text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30"
				disabled={currentSegmentIndex === 0}
				onclick={prevSegment}
			>
				<SkipBack size={18} weight="fill" />
			</button>
			<button
				class="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white cursor-pointer hover:bg-accent/80 transition-colors"
				onclick={togglePlay}
			>
				{#if playing}
					<Pause size={14} weight="fill" />
				{:else}
					<Play size={14} weight="fill" class="ml-0.5" />
				{/if}
			</button>
			<button
				class="text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30"
				disabled={currentSegmentIndex === segments.length - 1}
				onclick={nextSegment}
			>
				<SkipForward size={18} weight="fill" />
			</button>
		</div>
	</div>
{/if}
