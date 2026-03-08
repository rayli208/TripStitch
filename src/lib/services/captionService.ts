import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '$lib/firebase';
import type { Location } from '$lib/types';

interface CaptionRequest {
	title: string;
	titleDescription?: string;
	locations: {
		name: string;
		label?: string | null;
		description?: string | null;
		city?: string | null;
		state?: string | null;
		country?: string | null;
		transportMode?: string | null;
		rating?: number | null;
		priceTier?: string | null;
	}[];
	tags?: string[];
	tripDate?: string;
	stats?: { stops: number; miles: number; minutes: number };
}

export interface CaptionResult {
	caption: string;
	hashtags: string;
	shortCaption: string;
}

export async function generateCaption(
	title: string,
	locations: Location[],
	opts?: {
		titleDescription?: string;
		tags?: string[];
		tripDate?: string;
	}
): Promise<CaptionResult> {
	const functions = getFunctions(app);
	const fn = httpsCallable<CaptionRequest, CaptionResult>(functions, 'generateCaption');

	const miles = totalDistanceApprox(locations);
	const payload: CaptionRequest = {
		title,
		titleDescription: opts?.titleDescription,
		locations: locations.map((loc) => ({
			name: loc.name,
			label: loc.label,
			description: loc.description,
			city: loc.city,
			state: loc.state,
			country: loc.country,
			transportMode: loc.transportMode,
			rating: loc.rating,
			priceTier: loc.priceTier
		})),
		tags: opts?.tags,
		tripDate: opts?.tripDate,
		stats: {
			stops: locations.length,
			miles: Math.round(miles),
			minutes: Math.round(miles * 1.5) // rough estimate
		}
	};

	const result = await fn(payload);
	return result.data;
}

/** Quick haversine distance sum in miles */
function totalDistanceApprox(locations: Location[]): number {
	let total = 0;
	for (let i = 1; i < locations.length; i++) {
		const a = locations[i - 1];
		const b = locations[i];
		const R = 3959;
		const dLat = ((b.lat - a.lat) * Math.PI) / 180;
		const dLng = ((b.lng - a.lng) * Math.PI) / 180;
		const sinLat = Math.sin(dLat / 2);
		const sinLng = Math.sin(dLng / 2);
		const h =
			sinLat * sinLat +
			Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
		total += R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
	}
	return total;
}
