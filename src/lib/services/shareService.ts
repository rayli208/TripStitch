import type { SharedTrip, SharedLocation, TripVisibility } from '$lib/types';
import { db } from '$lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';

function mapLocation(loc: any): SharedLocation {
	return {
		id: loc.id,
		order: loc.order ?? 0,
		name: loc.name ?? '',
		label: loc.label ?? null,
		description: loc.description ?? null,
		lat: loc.lat,
		lng: loc.lng,
		city: loc.city ?? null,
		state: loc.state ?? null,
		country: loc.country ?? null,
		transportMode: loc.transportMode ?? null,
		rating: loc.rating ?? null,
		priceTier: loc.priceTier ?? null
	};
}

function buildSharedTrip(
	id: string,
	data: any,
	locations: SharedLocation[],
	profile: any
): SharedTrip {
	const miles = totalDistance(locations);
	const minutes = totalTravelTime(locations as any);

	return {
		id,
		userId: data.userId,
		username: profile?.username ?? '',
		userDisplayName: profile?.displayName ?? '',
		userAvatarUrl: profile?.avatarUrl ?? '',
		userLogoUrl: profile?.logoUrl ?? null,
		title: data.title ?? 'Untitled Trip',
		titleDescription: data.titleDescription ?? '',
		titleColor: data.titleColor ?? '#FFFFFF',
		fontId: data.fontId ?? 'inter',
		mapStyle: data.mapStyle ?? 'streets',
		coverImageUrl: data.coverImageUrl ?? null,
		tags: data.tags ?? [],
		visibility: data.visibility ?? 'public',
		locations,
		aspectRatio: data.aspectRatio ?? '9:16',
		videoLinks: data.videoLinks ?? undefined,
		tripDate: data.tripDate ?? '',
		stats: {
			stops: locations.length,
			miles: Math.round(miles * 10) / 10,
			minutes: Math.round(minutes)
		},
		cities: data.cities ?? [],
		states: data.states ?? [],
		countries: data.countries ?? [],
		createdAt: data.createdAt ?? '',
		sharedAt: data.updatedAt ?? data.createdAt ?? ''
	};
}

/** Fetch a trip by ID */
export async function fetchTrip(tripId: string): Promise<SharedTrip | null> {
	const snap = await getDoc(doc(db, 'trips', tripId));
	if (!snap.exists()) return null;
	const data = snap.data();

	const locations = (data.locations ?? []).map(mapLocation);
	const profileSnap = await getDoc(doc(db, 'users', data.userId, 'profile', 'main'));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	return buildSharedTrip(snap.id, data, locations, profile);
}

/** Fetch all trips for a user by their uid */
export async function fetchUserTrips(userId: string, includeAll = false): Promise<SharedTrip[]> {
	const snap = await getDocs(
		query(collection(db, 'trips'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
	);

	const profileSnap = await getDoc(doc(db, 'users', userId, 'profile', 'main'));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	const results: SharedTrip[] = [];
	for (const d of snap.docs) {
		const data = d.data();
		const visibility: TripVisibility = data.visibility ?? 'public';
		if (!includeAll && visibility !== 'public') continue;

		const locations = (data.locations ?? []).map(mapLocation);
		results.push(buildSharedTrip(d.id, data, locations, profile));
	}
	return results;
}

/** Get the public URL for a trip */
export function getShareUrl(tripId: string): string {
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/trip/${tripId}`;
	}
	return `/trip/${tripId}`;
}

/** Get the public URL for a user profile */
export function getProfileUrl(username: string): string {
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/u/${username}`;
	}
	return `/u/${username}`;
}
