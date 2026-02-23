import type { UserProfile, SocialLinks } from '$lib/types';
import { DEFAULT_FONT_ID } from '$lib/constants/fonts';
import { db, storage } from '$lib/firebase';
import authState from './auth.svelte';
import { doc, getDoc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
					data.preferredFontId = data.preferredFontId ?? DEFAULT_FONT_ID;
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
			preferredFontId?: string;
		}): Promise<{ ok: boolean; error?: string }> {
			const uid = authState.user?.id;
			if (!uid) return { ok: false, error: 'Not signed in' };

			const newUsername = updates.username.toLowerCase().trim();
			if (!newUsername) return { ok: false, error: 'Username is required' };
			if (!/^[a-z0-9_]{3,24}$/.test(newUsername)) {
				return { ok: false, error: 'Username must be 3-24 chars: letters, numbers, underscores' };
			}

			const oldUsername = profile?.username;
			const usernameChanged = oldUsername !== newUsername;

			try {
				if (usernameChanged) {
					// Atomic transaction: claim new username, release old one
					await runTransaction(db, async (tx) => {
						const newUsernameRef = doc(db, 'usernames', newUsername);
						const existing = await tx.get(newUsernameRef);
						if (existing.exists() && existing.data()?.uid !== uid) {
							throw new Error('Username is already taken');
						}

						// Claim new username
						tx.set(newUsernameRef, { uid });

						// Release old username
						if (oldUsername && oldUsername !== newUsername) {
							tx.delete(doc(db, 'usernames', oldUsername));
						}

						// Update profile
						const profileData: UserProfile = {
							username: newUsername,
							displayName: updates.displayName,
							bio: updates.bio,
							avatarUrl: authState.user?.avatarUrl ?? '',
							logoUrl: profile?.logoUrl ?? null,
							socialLinks: updates.socialLinks,
							brandColors: updates.brandColors ?? profile?.brandColors ?? [],
							preferredFontId: updates.preferredFontId ?? profile?.preferredFontId ?? DEFAULT_FONT_ID,
							createdAt: profile?.createdAt ?? new Date().toISOString()
						};
						tx.set(doc(db, 'users', uid, 'profile', 'main'), profileData);
					});
				} else {
					// No username change, simple update
					const profileData: UserProfile = {
						username: newUsername,
						displayName: updates.displayName,
						bio: updates.bio,
						avatarUrl: authState.user?.avatarUrl ?? '',
						logoUrl: profile?.logoUrl ?? null,
						socialLinks: updates.socialLinks,
						brandColors: updates.brandColors ?? profile?.brandColors ?? [],
						preferredFontId: updates.preferredFontId ?? profile?.preferredFontId ?? DEFAULT_FONT_ID,
						createdAt: profile?.createdAt ?? new Date().toISOString()
					};
					await setDoc(doc(db, 'users', uid, 'profile', 'main'), profileData);
				}

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

		/** Remove the logo */
		async removeLogo(): Promise<void> {
			const uid = authState.user?.id;
			if (!uid) return;

			try {
				// Try to delete from storage (ignore if doesn't exist)
				try {
					await deleteObject(ref(storage, `users/${uid}/logo.webp`));
				} catch { /* ignore */ }
				try {
					await deleteObject(ref(storage, `users/${uid}/logo.jpg`));
				} catch { /* ignore */ }

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
			const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
			if (snap.exists()) return snap.data().uid as string;
			return null;
		},

		/** Load a public profile by uid (for public pages) */
		async loadPublicProfile(uid: string): Promise<UserProfile | null> {
			const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
			if (snap.exists()) return snap.data() as UserProfile;
			return null;
		}
	};
}

const profileState = createProfileState();
export default profileState;
