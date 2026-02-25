import type { SharedTrip, SharedLocation } from '$lib/types';
import { db } from '$lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';

/** Fetch a trip by ID */
export async function fetchTrip(tripId: string): Promise<SharedTrip | null> {
	const snap = await getDoc(doc(db, 'trips', tripId));
	if (!snap.exists()) return null;
	const data = snap.data();

	const locations: SharedLocation[] = (data.locations ?? []).map((loc: any) => ({
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
		rating: loc.rating ?? null
	}));

	const miles = totalDistance(locations);
	const minutes = totalTravelTime(locations as any);

	// Fetch the owner's profile for display info
	const profileSnap = await getDoc(doc(db, 'users', data.userId, 'profile', 'main'));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	return {
		id: snap.id,
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
		locations,
		aspectRatio: data.aspectRatio ?? '9:16',
		videoLinks: data.videoLinks ?? undefined,
		tripDate: data.tripDate ?? '',
		stats: {
			stops: locations.length,
			miles: Math.round(miles * 10) / 10,
			minutes: Math.round(minutes)
		},
		cities: [...new Set(locations.map((l) => l.city).filter((v): v is string => !!v))],
		states: [...new Set(locations.map((l) => l.state).filter((v): v is string => !!v))],
		countries: [...new Set(locations.map((l) => l.country).filter((v): v is string => !!v))],
		createdAt: data.createdAt ?? '',
		sharedAt: data.updatedAt ?? data.createdAt ?? ''
	};
}

/** Fetch all trips for a user by their uid */
export async function fetchUserTrips(userId: string): Promise<SharedTrip[]> {
	const snap = await getDocs(
		query(collection(db, 'trips'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
	);

	// Fetch the user's profile once
	const profileSnap = await getDoc(doc(db, 'users', userId, 'profile', 'main'));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	return snap.docs.map((d) => {
		const data = d.data();
		const locations: SharedLocation[] = (data.locations ?? []).map((loc: any) => ({
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
			rating: loc.rating ?? null
		}));
		const miles = totalDistance(locations);
		const minutes = totalTravelTime(locations as any);
		return {
			id: d.id,
			userId,
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
			locations,
			aspectRatio: data.aspectRatio ?? '9:16',
			videoLinks: data.videoLinks ?? undefined,
			tripDate: data.tripDate ?? '',
			stats: {
				stops: locations.length,
				miles: Math.round(miles * 10) / 10,
				minutes: Math.round(minutes)
			},
			cities: [...new Set(locations.map((l) => l.city).filter((v): v is string => !!v))],
			states: [...new Set(locations.map((l) => l.state).filter((v): v is string => !!v))],
			countries: [...new Set(locations.map((l) => l.country).filter((v): v is string => !!v))],
			createdAt: data.createdAt ?? '',
			sharedAt: data.updatedAt ?? data.createdAt ?? ''
		};
	});
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
