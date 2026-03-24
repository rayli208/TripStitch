import type { UserProfile, SocialLinks, GlobeStyle, MapDisplay } from '$lib/types';
import { DEFAULT_FONT_ID } from '$lib/constants/fonts';
import { db, storage } from '$lib/firebase';
import authState from './auth.svelte';
import { doc, getDoc, setDoc, deleteDoc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { deleteUser } from 'firebase/auth';
import { auth } from '$lib/firebase';
import { compressImage, imageExtension } from '$lib/utils/imageUtils';

const CACHE_CONTROL = 'public, max-age=31536000';

function createProfileState() {
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let hasProfile = $derived(profile !== null);

	return {
		get profile() {
			return profile;
		},
		get loading() {
			return loading;
		},
		get hasProfile() {
			return hasProfile;
		},

		/** Load the current user's profile from Firestore */
		async load() {
			const uid = authState.user?.id;
			if (!uid) {
				profile = null;
				loading = false;
				return;
			}
			loading = true;
			try {
				const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
				if (snap.exists()) {
					const data = snap.data() as UserProfile;
					// Apply defaults for fields that may not exist on older profiles
					data.brandColors = data.brandColors ?? [];
					data.secondaryColor = data.secondaryColor ?? '#0a0f1e';
					data.preferredFontId = data.preferredFontId ?? DEFAULT_FONT_ID;
					data.globeStyle = data.globeStyle ?? 'dark';
					data.mapDisplay = data.mapDisplay ?? 'globe';
					profile = data;
				} else {
					profile = null;
				}
			} catch (err) {
				console.error('[Profile] Failed to load profile:', err);
				profile = null;
			}
			loading = false;
		},

		/** Save or update the profile. Handles username uniqueness atomically. */
		async save(updates: {
			username: string;
			displayName: string;
			bio: string;
			socialLinks: SocialLinks;
			brandColors?: string[];
			secondaryColor?: string;
			preferredFontId?: string;
			globeStyle?: GlobeStyle;
			mapDisplay?: MapDisplay;
		}): Promise<{ ok: boolean; error?: string }> {
			const uid = authState.user?.id;
			if (!uid) return { ok: false, error: 'Not signed in' };

			const newUsername = (updates.username ?? '').toLowerCase().trim();
			if (!newUsername) return { ok: false, error: 'Username is required' };
			if (!/^[a-z0-9_]{3,24}$/.test(newUsername)) {
				return { ok: false, error: 'Username must be 3-24 chars: letters, numbers, underscores' };
			}

			const oldUsername = profile?.username;

			const profileData: UserProfile = {
				username: newUsername,
				displayName: updates.displayName,
				bio: updates.bio,
				avatarUrl: profile?.avatarUrl || authState.user?.avatarUrl || '',
				logoUrl: profile?.logoUrl ?? null,
				socialLinks: updates.socialLinks,
				brandColors: updates.brandColors ?? profile?.brandColors ?? [],
				secondaryColor: updates.secondaryColor ?? profile?.secondaryColor ?? '#0a0f1e',
				preferredFontId: updates.preferredFontId ?? profile?.preferredFontId ?? DEFAULT_FONT_ID,
				globeStyle: updates.globeStyle ?? profile?.globeStyle ?? 'dark',
				mapDisplay: updates.mapDisplay ?? profile?.mapDisplay ?? 'globe',
				createdAt: profile?.createdAt ?? new Date().toISOString()
			};

			try {
				// Always use a transaction to guarantee username uniqueness
				await runTransaction(db, async (tx) => {
					const newUsernameRef = doc(db, 'usernames', newUsername);
					const existing = await tx.get(newUsernameRef);

					// Check if username is taken by someone else
					if (existing.exists() && existing.data()?.uid !== uid) {
						throw new Error('Username is already taken');
					}

					// Claim the username (idempotent if already ours)
					tx.set(newUsernameRef, { uid });

					// Release old username if it changed
					if (oldUsername && oldUsername !== newUsername) {
						tx.delete(doc(db, 'usernames', oldUsername));
					}

					// Write profile
					tx.set(doc(db, 'users', uid, 'profile', 'main'), profileData);
				});

				// Reload
				await this.load();
				return { ok: true };
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Failed to save profile';
				return { ok: false, error: msg };
			}
		},

		/** Upload a logo image. Compresses to WebP, stores in Firebase Storage. */
		async uploadLogo(file: File): Promise<{ ok: boolean; error?: string }> {
			const uid = authState.user?.id;
			if (!uid) return { ok: false, error: 'Not signed in' };

			try {
				const compressed = await compressImage(file, 512, 0.85);
				const ext = imageExtension(compressed);
				const storageRef = ref(storage, `users/${uid}/logo.${ext}`);
				await uploadBytes(storageRef, compressed, {
					contentType: compressed.type,
					cacheControl: CACHE_CONTROL
				});
				const url = await getDownloadURL(storageRef);

				// Update profile doc with logo URL
				await setDoc(
					doc(db, 'users', uid, 'profile', 'main'),
					{ logoUrl: url },
					{ merge: true }
				);

				await this.load();
				return { ok: true };
			} catch (err) {
				console.error('[Profile] Logo upload failed:', err);
				return { ok: false, error: 'Failed to upload logo' };
			}
		},

		/** Upload a custom avatar image. Compresses to WebP, stores in Firebase Storage. */
		async uploadAvatar(file: File): Promise<{ ok: boolean; error?: string }> {
			const uid = authState.user?.id;
			if (!uid) return { ok: false, error: 'Not signed in' };

			try {
				const compressed = await compressImage(file, 256, 0.85);
				const ext = imageExtension(compressed);
				const storageRef = ref(storage, `users/${uid}/avatar.${ext}`);
				await uploadBytes(storageRef, compressed, {
					contentType: compressed.type,
					cacheControl: CACHE_CONTROL
				});
				const url = await getDownloadURL(storageRef);

				await setDoc(
					doc(db, 'users', uid, 'profile', 'main'),
					{ avatarUrl: url },
					{ merge: true }
				);

				await this.load();
				return { ok: true };
			} catch (err) {
				console.error('[Profile] Avatar upload failed:', err);
				return { ok: false, error: 'Failed to upload avatar' };
			}
		},

		/** Remove the custom avatar (reverts to Google avatar or empty) */
		async removeAvatar(): Promise<void> {
			const uid = authState.user?.id;
			if (!uid) return;

			try {
				try { await deleteObject(ref(storage, `users/${uid}/avatar.webp`)); } catch { /* may not exist */ }
				try { await deleteObject(ref(storage, `users/${uid}/avatar.jpg`)); } catch { /* may not exist */ }

				const fallbackUrl = authState.user?.avatarUrl ?? '';
				await setDoc(
					doc(db, 'users', uid, 'profile', 'main'),
					{ avatarUrl: fallbackUrl },
					{ merge: true }
				);
				await this.load();
			} catch (err) {
				console.error('[Profile] Failed to remove avatar:', err);
			}
		},

		/** Remove the logo */
		async removeLogo(): Promise<void> {
			const uid = authState.user?.id;
			if (!uid) return;

			try {
				// Try to delete from storage — file extension is unknown, so one delete will fail
				try {
					await deleteObject(ref(storage, `users/${uid}/logo.webp`));
				} catch {
					// Expected: file may not exist as .webp
				}
				try {
					await deleteObject(ref(storage, `users/${uid}/logo.jpg`));
				} catch {
					// Expected: file may not exist as .jpg
				}

				await setDoc(
					doc(db, 'users', uid, 'profile', 'main'),
					{ logoUrl: null },
					{ merge: true }
				);
				await this.load();
			} catch (err) {
				console.error('[Profile] Failed to remove logo:', err);
			}
		},

		/** Look up a username and return the uid */
		async resolveUsername(username: string): Promise<string | null> {
			const lower = username.toLowerCase();
			try {
				const snap = await getDoc(doc(db, 'usernames', lower));
				if (snap.exists()) return snap.data().uid as string;
			} catch (err) {
				console.warn('[Profile] username lookup failed:', err);
			}
			return null;
		},

		/** Load a public profile by uid (for public pages) */
		async loadPublicProfile(uid: string): Promise<UserProfile | null> {
			const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
			if (snap.exists()) return snap.data() as UserProfile;
			return null;
		},

		/** Delete the entire account and all associated data */
		async deleteAccount(): Promise<{ ok: boolean; error?: string }> {
			const currentUser = auth.currentUser;
			if (!currentUser) return { ok: false, error: 'Not signed in' };
			const uid = currentUser.uid;

			try {
				// 1. Find and delete all user's trips (storage + Firestore)
				const tripsQuery = query(collection(db, 'trips'), where('userId', '==', uid));
				const tripsSnap = await getDocs(tripsQuery);

				for (const tripDoc of tripsSnap.docs) {
					// Delete trip storage files
					try {
						const folderRef = ref(storage, `trips/${tripDoc.id}`);
						const list = await listAll(folderRef);
						await Promise.all(list.items.map((item) => deleteObject(item)));
					} catch { /* folder may not exist */ }

					// Delete trip document
					await deleteDoc(doc(db, 'trips', tripDoc.id));
				}

				// 2. Find and delete all user's blogs (storage + Firestore + slug index)
				const blogsQuery = query(collection(db, 'blogs'), where('userId', '==', uid));
				const blogsSnap = await getDocs(blogsQuery);

				for (const blogDoc of blogsSnap.docs) {
					const blogData = blogDoc.data();

					// Delete blog storage files (images, cover)
					try {
						const folderRef = ref(storage, `blogs/${blogDoc.id}`);
						const list = await listAll(folderRef);
						for (const prefix of list.prefixes) {
							const subList = await listAll(prefix);
							await Promise.all(subList.items.map((item) => deleteObject(item)));
						}
						await Promise.all(list.items.map((item) => deleteObject(item)));
					} catch { /* folder may not exist */ }

					// Delete slug index entry
					if (blogData.slug) {
						try {
							await deleteDoc(doc(db, 'blogSlugs', blogData.slug));
						} catch { /* may not exist */ }
					}

					// Delete blog document
					await deleteDoc(doc(db, 'blogs', blogDoc.id));
				}

				// 3. Delete user storage files (avatar, logo)
				try {
					const userFolder = ref(storage, `users/${uid}`);
					const userFiles = await listAll(userFolder);
					await Promise.all(userFiles.items.map((item) => deleteObject(item)));
				} catch { /* folder may not exist */ }

				// 4. Delete username entry
				const username = profile?.username;
				if (username) {
					try {
						await deleteDoc(doc(db, 'usernames', username));
					} catch { /* may not exist */ }
				}

				// 5. Delete profile document
				try {
					await deleteDoc(doc(db, 'users', uid, 'profile', 'main'));
				} catch { /* may not exist */ }

				// 6. Delete Firebase Auth user (must be last — can't access data after this)
				await deleteUser(currentUser);

				profile = null;
				return { ok: true };
			} catch (err: unknown) {
				const firebaseErr = err as { code?: string };
				if (firebaseErr.code === 'auth/requires-recent-login') {
					return { ok: false, error: 'Please sign out and sign back in before deleting your account' };
				}
				const msg = err instanceof Error ? err.message : 'Failed to delete account';
				return { ok: false, error: msg };
			}
		}
	};
}

const profileState = createProfileState();
export default profileState;
