import type { Trip } from '$lib/types';
import { db } from '$lib/firebase';
import authState from './auth.svelte';
import {
	collection,
	doc,
	addDoc,
	updateDoc,
	deleteDoc,
	onSnapshot,
	query,
	orderBy,
	type Unsubscribe
} from 'firebase/firestore';

/** Strip non-serializable fields (File objects, blob URLs) before saving to Firestore */
function serializeTrip(trip: Trip) {
	return {
		title: trip.title,
		titleColor: trip.titleColor,
		titleDescription: trip.titleDescription ?? '',
		showLogoOnTitle: trip.showLogoOnTitle ?? false,
		fontId: trip.fontId ?? 'inter',
		aspectRatio: trip.aspectRatio,
		createdAt: trip.createdAt,
		updatedAt: trip.updatedAt,
		locations: trip.locations.map((loc) => ({
			id: loc.id,
			order: loc.order,
			name: loc.name,
			label: loc.label,
			lat: loc.lat,
			lng: loc.lng,
			clips: loc.clips.map((c) => ({
				id: c.id,
				order: c.order,
				type: c.type,
				animationStyle: c.animationStyle
			})),
			transportMode: loc.transportMode,
			rating: loc.rating ?? null
		}))
	};
}

function createTripsState() {
	let trips = $state<Trip[]>([]);
	let loading = $state(true);
	let unsubscribe: Unsubscribe | null = null;

	function getUserTripsRef() {
		const uid = authState.user?.id;
		if (!uid) return null;
		return collection(db, 'users', uid, 'trips');
	}

	return {
		get trips() {
			return trips;
		},
		get count() {
			return trips.length;
		},
		get loading() {
			return loading;
		},

		/** Subscribe to real-time updates for the current user's trips */
		subscribe() {
			this.unsubscribe();
			const ref = getUserTripsRef();
			if (!ref) {
				trips = [];
				loading = false;
				return;
			}
			loading = true;
			const q = query(ref, orderBy('createdAt', 'desc'));
			unsubscribe = onSnapshot(q, (snapshot) => {
				trips = snapshot.docs.map((d) => {
					const data = d.data();
					return {
						id: d.id,
						title: data.title,
						titleColor: data.titleColor,
						titleDescription: data.titleDescription ?? '',
						titleMediaFile: null,
						titleMediaPreviewUrl: null,
						titleMediaType: null,
						showLogoOnTitle: data.showLogoOnTitle ?? false,
						fontId: data.fontId ?? 'inter',
						locations: (data.locations ?? []).map((loc: Record<string, unknown>) => {
							// Backward compat: migrate old single-media to clips array
							let clips: Record<string, unknown>[];
							if (Array.isArray(loc.clips)) {
								clips = (loc.clips as Record<string, unknown>[]).map((c) => ({
									...c,
									file: null,
									previewUrl: null,
									animationStyle: c.animationStyle ?? 'kenBurns'
								}));
							} else if (loc.mediaType) {
								clips = [{
									id: crypto.randomUUID(),
									order: 0,
									type: loc.mediaType,
									animationStyle: loc.animationStyle ?? 'kenBurns',
									file: null,
									previewUrl: null
								}];
							} else {
								clips = [];
							}
							return {
								id: loc.id,
								order: loc.order,
								name: loc.name,
								label: loc.label,
								lat: loc.lat,
								lng: loc.lng,
								clips,
								transportMode: loc.transportMode,
								rating: (loc.rating as number) ?? null
							};
						}),
						aspectRatio: data.aspectRatio,
						createdAt: data.createdAt,
						updatedAt: data.updatedAt
					} as Trip;
				});
				loading = false;
			});
		},

		unsubscribe() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		async addTrip(trip: Trip) {
			const ref = getUserTripsRef();
			if (!ref) return;
			const docRef = await addDoc(ref, serializeTrip(trip));
			return docRef.id;
		},

		getTrip(id: string): Trip | undefined {
			return trips.find((t) => t.id === id);
		},

		async updateTrip(id: string, updates: Partial<Trip>) {
			const uid = authState.user?.id;
			if (!uid) return;
			const docRef = doc(db, 'users', uid, 'trips', id);
			const data: Record<string, unknown> = {};
			if (updates.title !== undefined) data.title = updates.title;
			if (updates.titleColor !== undefined) data.titleColor = updates.titleColor;
			if (updates.titleDescription !== undefined) data.titleDescription = updates.titleDescription;
			if (updates.showLogoOnTitle !== undefined) data.showLogoOnTitle = updates.showLogoOnTitle;
			if (updates.fontId !== undefined) data.fontId = updates.fontId;
			if (updates.aspectRatio !== undefined) data.aspectRatio = updates.aspectRatio;
			if (updates.updatedAt !== undefined) data.updatedAt = updates.updatedAt;
			if (updates.locations !== undefined) {
				data.locations = updates.locations.map((loc) => ({
					id: loc.id,
					order: loc.order,
					name: loc.name,
					label: loc.label,
					lat: loc.lat,
					lng: loc.lng,
					clips: loc.clips.map((c) => ({
						id: c.id,
						order: c.order,
						type: c.type,
						animationStyle: c.animationStyle
					})),
					transportMode: loc.transportMode,
					rating: loc.rating ?? null
				}));
			}
			await updateDoc(docRef, data);
		},

		async deleteTrip(id: string) {
			const uid = authState.user?.id;
			if (!uid) return;
			const docRef = doc(db, 'users', uid, 'trips', id);
			await deleteDoc(docRef);
		}
	};
}

const tripsState = createTripsState();
export default tripsState;
