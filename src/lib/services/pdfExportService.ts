import type { SharedTrip } from '$lib/types';
import type { jsPDF as JsPDFType } from 'jspdf';

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
}

function luminance(hex: string): number {
	const [r, g, b] = hexToRgb(hex);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Draw star rating as filled/empty circles since Helvetica lacks star glyphs */
function drawStars(doc: JsPDFType, rating: number, x: number, y: number): number {
	const starR = 1.3;
	const gap = 3.2;
	for (let s = 1; s <= 5; s++) {
		const cx = x + (s - 1) * gap;
		if (rating >= s) {
			doc.setFillColor(251, 191, 36);
			doc.circle(cx, y - 1, starR, 'F');
		} else if (rating >= s - 0.5) {
			// Half: filled left half via arc approximation — just use a lighter fill
			doc.setFillColor(251, 191, 36);
			doc.circle(cx, y - 1, starR, 'F');
			doc.setFillColor(255, 255, 255);
			doc.setGState(doc.GState({ opacity: 0.5 }));
			doc.circle(cx, y - 1, starR, 'F');
			doc.setGState(doc.GState({ opacity: 1 }));
		} else {
			doc.setDrawColor(220, 220, 220);
			doc.setLineWidth(0.3);
			doc.circle(cx, y - 1, starR, 'S');
		}
	}
	return x + 5 * gap;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
	try {
		const res = await fetch(url);
		const blob = await res.blob();
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

export async function exportTripToPdf(trip: SharedTrip, overallRating: number | null): Promise<void> {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

	const pageW = 210;
	const pageH = 297;
	const margin = 16;
	const contentW = pageW - margin * 2;
	let y = 0;

	const sortedLocations = [...trip.locations].sort((a, b) => a.order - b.order);
	const [tr, tg, tb] = hexToRgb(trip.titleColor);
	const titleLum = luminance(trip.titleColor);
	const accentR = titleLum > 0.85 ? Math.floor(tr * 0.6) : tr;
	const accentG = titleLum > 0.85 ? Math.floor(tg * 0.6) : tg;
	const accentB = titleLum > 0.85 ? Math.floor(tb * 0.6) : tb;

	function checkPageBreak(needed: number) {
		if (y + needed > pageH - 20) {
			doc.addPage();
			y = margin;
		}
	}

	// ── Header accent bar ──
	doc.setFillColor(accentR, accentG, accentB);
	doc.rect(0, 0, pageW, 6, 'F');
	y = 6;

	// Branding
	doc.setFontSize(8);
	doc.setTextColor(255, 255, 255);
	doc.text('TripStitch', pageW - margin, 4, { align: 'right' });

	// ── Cover image ──
	if (trip.coverImageUrl) {
		const imgData = await fetchImageAsBase64(trip.coverImageUrl);
		if (imgData) {
			const imgH = 55;
			doc.addImage(imgData, 'JPEG', margin, y + 4, contentW, imgH);
			y += imgH + 8;
		} else {
			y += 8;
		}
	} else {
		y += 8;
	}

	// ── Title block ──
	const titleBlockY = y;
	doc.setFillColor(accentR, accentG, accentB);
	doc.rect(margin, titleBlockY, 3, 18, 'F');

	// Date
	if (trip.tripDate) {
		doc.setFontSize(9);
		doc.setTextColor(140, 140, 140);
		const dateStr = new Date(trip.tripDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		doc.text(dateStr, margin + 7, y + 4);
		y += 6;
	}

	// Title
	doc.setFontSize(22);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(accentR, accentG, accentB);
	const titleLines = doc.splitTextToSize(trip.title, contentW - 10);
	doc.text(titleLines, margin + 7, y + 5);
	y += titleLines.length * 8 + 2;

	// Subtitle
	if (trip.titleDescription) {
		doc.setFontSize(10);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(100, 100, 100);
		const descLines = doc.splitTextToSize(trip.titleDescription, contentW - 10);
		doc.text(descLines, margin + 7, y + 3);
		y += descLines.length * 5 + 2;
	}

	y += 6;

	// ── Author ──
	doc.setFontSize(9);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(60, 60, 60);
	doc.text(trip.userDisplayName, margin, y);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(140, 140, 140);
	doc.text(` @${trip.username}`, margin + doc.getTextWidth(trip.userDisplayName) + 1, y);
	y += 6;

	// ── Stats row ──
	const ratingText = overallRating
		? `${overallRating % 1 === 0 ? overallRating : overallRating.toFixed(1)}/5`
		: null;
	const stats: { text: string; bg: [number, number, number] }[] = [
		{ text: `${trip.stats.stops} stops`, bg: [255, 224, 224] },
		{ text: `${trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi`, bg: [254, 243, 199] },
		{ text: `~${trip.stats.minutes} min`, bg: [209, 250, 229] }
	];
	if (ratingText) {
		stats.push({ text: ratingText, bg: [255, 243, 207] });
	}

	let sx = margin;
	doc.setFontSize(8);
	doc.setFont('helvetica', 'bold');
	for (const stat of stats) {
		const tw = doc.getTextWidth(stat.text) + 6;
		doc.setFillColor(...stat.bg);
		doc.roundedRect(sx, y - 3, tw, 5.5, 1.5, 1.5, 'F');
		doc.setTextColor(50, 50, 50);
		doc.text(stat.text, sx + 3, y);
		sx += tw + 3;
	}
	y += 8;

	// ── Tags ──
	if (trip.tags && trip.tags.length > 0) {
		let tx = margin;
		doc.setFontSize(7);
		doc.setFont('helvetica', 'bold');
		for (const tag of trip.tags) {
			const tw = doc.getTextWidth(tag) + 6;
			if (tx + tw > pageW - margin) {
				tx = margin;
				y += 6;
			}
			doc.setFillColor(accentR, accentG, accentB);
			doc.setGState(doc.GState({ opacity: 0.12 }));
			doc.roundedRect(tx, y - 3, tw, 5, 1.5, 1.5, 'F');
			doc.setGState(doc.GState({ opacity: 1 }));
			doc.setTextColor(accentR, accentG, accentB);
			doc.text(tag, tx + 3, y);
			tx += tw + 2;
		}
		y += 8;
	}

	// ── Divider ──
	doc.setDrawColor(220, 220, 220);
	doc.setLineWidth(0.4);
	doc.line(margin, y, pageW - margin, y);
	y += 8;

	// ── Section header ──
	doc.setFontSize(12);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(40, 40, 40);
	doc.text('Itinerary', margin, y);
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(140, 140, 140);
	doc.text(`${sortedLocations.length} stops`, pageW - margin, y, { align: 'right' });
	y += 8;

	// ── Locations ──
	for (let i = 0; i < sortedLocations.length; i++) {
		const loc = sortedLocations[i];
		const label = loc.label || loc.name.split(',')[0];
		const isLast = i === sortedLocations.length - 1;

		// Estimate height needed
		let estH = 18;
		if (loc.rating || loc.priceTier) estH += 5;
		if (loc.description) {
			const dLines = doc.splitTextToSize(loc.description, contentW - 22);
			estH += dLines.length * 4 + 2;
		}
		if (!isLast && sortedLocations[i + 1]?.transportMode) estH += 6;
		estH += 4;

		checkPageBreak(estH);

		// Number circle
		const circleX = margin + 4;
		const circleY = y + 1;
		doc.setFillColor(accentR, accentG, accentB);
		doc.circle(circleX, circleY, 3.5, 'F');
		doc.setFontSize(8);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(255, 255, 255);
		doc.text(`${i + 1}`, circleX, circleY + 1, { align: 'center' });

		// Location name
		doc.setFontSize(11);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(30, 30, 30);
		const nameLines = doc.splitTextToSize(label, contentW - 22);
		doc.text(nameLines, margin + 12, y + 2);
		y += nameLines.length * 5 + 2;

		// Rating + price
		if (loc.rating || loc.priceTier) {
			let rx = margin + 12;
			if (loc.rating) {
				rx = drawStars(doc, loc.rating, rx, y);
				rx += 1;
			}
			if (loc.priceTier) {
				doc.setFontSize(9);
				doc.setTextColor(74, 222, 128);
				doc.setFont('helvetica', 'bold');
				doc.text(loc.priceTier, rx, y);
			}
			y += 5;
		}

		// Description
		if (loc.description) {
			doc.setFontSize(8.5);
			doc.setFont('helvetica', 'normal');
			doc.setTextColor(100, 100, 100);
			const dLines = doc.splitTextToSize(loc.description, contentW - 22);
			doc.text(dLines, margin + 12, y);
			y += dLines.length * 4 + 2;
		}

		// Address (full place name)
		doc.setFontSize(7.5);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(130, 130, 130);
		const addrLines = doc.splitTextToSize(loc.name, contentW - 22);
		doc.text(addrLines, margin + 12, y);
		y += addrLines.length * 3.5 + 1;

		// Clickable "Get Directions" link
		const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
		doc.setFontSize(7);
		doc.setTextColor(accentR, accentG, accentB);
		doc.textWithLink('Get Directions', margin + 12, y, { url: dirUrl });
		// Underline
		const linkW = doc.getTextWidth('Get Directions');
		doc.setDrawColor(accentR, accentG, accentB);
		doc.setLineWidth(0.2);
		doc.line(margin + 12, y + 0.5, margin + 12 + linkW, y + 0.5);
		y += 5;

		// Connector line + transport to next
		if (!isLast) {
			doc.setDrawColor(accentR, accentG, accentB);
			doc.setLineWidth(0.3);
			const lineTop = y - 2;
			const lineBot = y + 3;
			for (let dy = lineTop; dy < lineBot; dy += 1.2) {
				doc.line(circleX, dy, circleX, dy + 0.5);
			}

			const nextLoc = sortedLocations[i + 1];
			if (nextLoc?.transportMode) {
				const transportLabels: Record<string, string> = {
					walked: 'Walked', drove: 'Drove', biked: 'Biked'
				};
				doc.setFontSize(7);
				doc.setFont('helvetica', 'italic');
				doc.setTextColor(accentR, accentG, accentB);
				doc.text(transportLabels[nextLoc.transportMode] ?? '', margin + 12, y + 1);
			}
			y += 6;
		} else {
			y += 4;
		}
	}

	// ── Footer ──
	checkPageBreak(20);
	y += 4;
	doc.setDrawColor(220, 220, 220);
	doc.setLineWidth(0.4);
	doc.line(margin, y, pageW - margin, y);
	y += 8;

	doc.setFontSize(8);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(160, 160, 160);
	doc.text('Made with TripStitch', pageW / 2, y, { align: 'center' });

	const footerLinkY = y + 5;
	doc.setFontSize(7);
	doc.setTextColor(accentR, accentG, accentB);
	const tripUrl = `https://tripstitch.blog/trip/${trip.id}`;
	doc.textWithLink(tripUrl, pageW / 2 - doc.getTextWidth(tripUrl) / 2, footerLinkY, { url: tripUrl });

	// Bottom accent bar
	doc.setFillColor(accentR, accentG, accentB);
	doc.rect(0, pageH - 4, pageW, 4, 'F');

	const safeTitle = trip.title.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'trip';
	doc.save(`${safeTitle}.pdf`);
}
