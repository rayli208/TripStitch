import type { Trip, SharedTrip, SharedLocation, UserProfile } from '$lib/types';
import { db, storage } from '$lib/firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage, imageExtension } from '$lib/utils/imageUtils';
import { totalDistance, totalTravelTime } from '$lib/utils/distance';

const CACHE_CONTROL = 'public, max-age=31536000';

/** Publish a trip to the public `trips` collection.
 *  Uploads cover image if present, writes metadata. */
export async function publishTrip(
	trip: Trip,
	userId: string,
	profile: UserProfile
): Promise<string> {
	const tripId = trip.id;

	// Upload cover image if present
	let coverImageUrl: string | null = null;
	if (trip.titleMediaFile) {
		try {
			const compressed = await compressImage(trip.titleMediaFile, 1200, 0.8);
			const ext = imageExtension(compressed);
			const storageRef = ref(storage, `trips/${tripId}/cover.${ext}`);
			await uploadBytes(storageRef, compressed, {
				contentType: compressed.type,
				cacheControl: CACHE_CONTROL
			});
			coverImageUrl = await getDownloadURL(storageRef);
		} catch (err) {
			console.warn('[Share] Cover image upload failed, continuing without:', err);
		}
	}

	// Build shared locations
	const locations: SharedLocation[] = trip.locations.map((loc) => ({
		id: loc.id,
		order: loc.order,
		name: loc.name,
		label: loc.label,
		description: loc.description ?? null,
		lat: loc.lat,
		lng: loc.lng,
		city: loc.city ?? null,
		state: loc.state ?? null,
		country: loc.country ?? null,
		transportMode: loc.transportMode,
		rating: loc.rating ?? null
	}));

	// Aggregate unique cities, states, countries for geographic querying
	const cities = [...new Set(trip.locations.map((l) => l.city).filter((v): v is string => !!v))];
	const states = [...new Set(trip.locations.map((l) => l.state).filter((v): v is string => !!v))];
	const countries = [...new Set(trip.locations.map((l) => l.country).filter((v): v is string => !!v))];

	// Compute stats
	const miles = totalDistance(trip.locations);
	const minutes = totalTravelTime(trip.locations);

	const sharedTrip: Omit<SharedTrip, 'id'> = {
		userId,
		username: profile.username,
		userDisplayName: profile.displayName,
		userAvatarUrl: profile.avatarUrl,
		userLogoUrl: profile.logoUrl,
		title: trip.title || 'Untitled Trip',
		titleDescription: trip.titleDescription || '',
		titleColor: trip.titleColor || '#FFFFFF',
		fontId: trip.fontId ?? 'inter',
		mapStyle: trip.mapStyle ?? 'streets',
		coverImageUrl,
		locations,
		aspectRatio: trip.aspectRatio,
		stats: {
			stops: locations.length,
			miles: Math.round(miles * 10) / 10,
			minutes: Math.round(minutes)
		},
		tripDate: trip.tripDate ?? '',
		videoLinks: trip.videoLinks ?? undefined,
		cities,
		states,
		countries,
		createdAt: trip.createdAt,
		sharedAt: new Date().toISOString()
	};

	await setDoc(doc(db, 'trips', tripId), sharedTrip);
	console.log(`[Share] Trip published: trips/${tripId}`);
	return tripId;
}

/** Fetch a shared trip by ID (for public page) */
export async function fetchSharedTrip(tripId: string): Promise<SharedTrip | null> {
	const snap = await getDoc(doc(db, 'trips', tripId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as SharedTrip;
}

/** Fetch all shared trips for a user by their uid */
export async function fetchUserSharedTrips(userId: string): Promise<SharedTrip[]> {
	const q = query(
		collection(db, 'trips'),
		where('userId', '==', userId),
		orderBy('sharedAt', 'desc')
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedTrip);
}

/** Get the public URL for a shared trip */
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
