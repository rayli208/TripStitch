import type { Trip, VideoLinks } from '$lib/types';
import { db, storage } from '$lib/firebase';
import authState from './auth.svelte';
import {
	collection,
	doc,
	addDoc,
	updateDoc,
	deleteDoc,
	onSnapshot,
	query,
	where,
	orderBy,
	type Unsubscribe
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { compressImage, imageExtension } from '$lib/utils/imageUtils';

const tripsRef = collection(db, 'trips');

/** Strip non-serializable fields (File objects, blob URLs) before saving to Firestore */
function serializeTrip(trip: Trip, userId: string) {
	const locations = trip.locations.map((loc) => ({
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
		clips: loc.clips.map((c) => ({
			id: c.id,
			order: c.order,
			type: c.type,
			animationStyle: c.animationStyle
		})),
		transportMode: loc.transportMode,
		rating: loc.rating ?? null,
		priceTier: loc.priceTier ?? null
	}));

	return {
		userId,
		title: trip.title,
		titleColor: trip.titleColor,
		titleDescription: trip.titleDescription ?? '',
		showLogoOnTitle: trip.showLogoOnTitle ?? false,
		fontId: trip.fontId ?? 'inter',
		mapStyle: trip.mapStyle ?? 'streets',
		tripDate: trip.tripDate ?? '',
		tags: trip.tags ?? [],
		visibility: trip.visibility ?? 'public',
		aspectRatio: trip.aspectRatio,
		createdAt: trip.createdAt,
		updatedAt: trip.updatedAt,
		locations,
		cities: [...new Set(locations.map((l) => l.city).filter((v): v is string => !!v))],
		states: [...new Set(locations.map((l) => l.state).filter((v): v is string => !!v))],
		countries: [...new Set(locations.map((l) => l.country).filter((v): v is string => !!v))]
	};
}

function createTripsState() {
	let trips = $state<Trip[]>([]);
	let loading = $state(true);
	let unsubscribe: Unsubscribe | null = null;

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
			const uid = authState.user?.id;
			if (!uid) {
				trips = [];
				loading = false;
				return;
			}
			loading = true;
			const q = query(tripsRef, where('userId', '==', uid), orderBy('createdAt', 'desc'));
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
						mapStyle: data.mapStyle ?? 'streets',
						tripDate: data.tripDate ?? '',
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
								description: loc.description ?? null,
								lat: loc.lat,
								lng: loc.lng,
								city: loc.city ?? null,
								state: loc.state ?? null,
								country: loc.country ?? null,
								clips,
								transportMode: loc.transportMode,
								rating: (loc.rating as number) ?? null,
								priceTier: (loc.priceTier as string) ?? null
							};
						}),
						tags: data.tags ?? [],
						visibility: data.visibility ?? 'public',
						aspectRatio: data.aspectRatio,
						videoLinks: data.videoLinks ?? undefined,
						cities: data.cities ?? [],
						states: data.states ?? [],
						countries: data.countries ?? [],
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
			const uid = authState.user?.id;
			if (!uid) return;

			const data = serializeTrip(trip, uid);

			// Create Firestore doc first so storage rules can verify it
			const docRef = await addDoc(tripsRef, data);
			const docId = docRef.id;

			// Upload cover image using the Firestore doc ID
			if (trip.titleMediaFile) {
				try {
					const compressed = await compressImage(trip.titleMediaFile, 1600, 0.82);
					const ext = imageExtension(compressed);
					const imgRef = storageRef(storage, `trips/${docId}/cover.${ext}`);
					await uploadBytes(imgRef, compressed, {
						contentType: compressed.type,
						cacheControl: 'public, max-age=31536000'
					});
					const coverImageUrl = await getDownloadURL(imgRef);
					await updateDoc(docRef, { coverImageUrl });
				} catch (err) {
					console.warn('[Trips] Cover image upload failed:', err);
				}
			}

			return docId;
		},

		getTrip(id: string): Trip | undefined {
			return trips.find((t) => t.id === id);
		},

		async updateTrip(id: string, updates: Partial<Trip>) {
			const uid = authState.user?.id;
			if (!uid) return;
			const docRef = doc(db, 'trips', id);
			const data: Record<string, unknown> = {};
			if (updates.title !== undefined) data.title = updates.title;
			if (updates.titleColor !== undefined) data.titleColor = updates.titleColor;
			if (updates.titleDescription !== undefined) data.titleDescription = updates.titleDescription;
			if (updates.showLogoOnTitle !== undefined) data.showLogoOnTitle = updates.showLogoOnTitle;
			if (updates.fontId !== undefined) data.fontId = updates.fontId;
			if (updates.mapStyle !== undefined) data.mapStyle = updates.mapStyle;
			if (updates.tripDate !== undefined) data.tripDate = updates.tripDate;
			if (updates.aspectRatio !== undefined) data.aspectRatio = updates.aspectRatio;
			if (updates.updatedAt !== undefined) data.updatedAt = updates.updatedAt;
			if (updates.tags !== undefined) data.tags = updates.tags;
			if (updates.visibility !== undefined) data.visibility = updates.visibility;

			// Upload cover image if a new file is present
			if (updates.titleMediaFile) {
				try {
					const compressed = await compressImage(updates.titleMediaFile, 1600, 0.82);
					const ext = imageExtension(compressed);
					const imgRef = storageRef(storage, `trips/${id}/cover.${ext}`);
					await uploadBytes(imgRef, compressed, {
						contentType: compressed.type,
						cacheControl: 'public, max-age=31536000'
					});
					data.coverImageUrl = await getDownloadURL(imgRef);
				} catch (err) {
					console.warn('[Trips] Cover image upload failed:', err);
				}
			}

			if (updates.locations !== undefined) {
				const locs = updates.locations.map((loc) => ({
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
					clips: loc.clips.map((c) => ({
						id: c.id,
						order: c.order,
						type: c.type,
						animationStyle: c.animationStyle
					})),
					transportMode: loc.transportMode,
					rating: loc.rating ?? null,
					priceTier: loc.priceTier ?? null
				}));
				data.locations = locs;
				data.cities = [...new Set(locs.map((l) => l.city).filter((v): v is string => !!v))];
				data.states = [...new Set(locs.map((l) => l.state).filter((v): v is string => !!v))];
				data.countries = [...new Set(locs.map((l) => l.country).filter((v): v is string => !!v))];
			}
			await updateDoc(docRef, data);
		},

		async updateVideoLinks(id: string, videoLinks: VideoLinks) {
			const uid = authState.user?.id;
			if (!uid) return;
			const docRef = doc(db, 'trips', id);
			await updateDoc(docRef, { videoLinks });
		},

		async deleteTrip(id: string) {
			const uid = authState.user?.id;
			if (!uid) return;

			// Delete all files under trips/{id}/ in Storage
			try {
				const folderRef = storageRef(storage, `trips/${id}`);
				const list = await listAll(folderRef);
				await Promise.all(list.items.map((item) => deleteObject(item)));
			} catch (err) {
				// Folder may not exist if no images were uploaded — that's fine
				console.warn('[Trips] Storage cleanup:', err);
			}

			await deleteDoc(doc(db, 'trips', id));
		}
	};
}

const tripsState = createTripsState();
export default tripsState;
