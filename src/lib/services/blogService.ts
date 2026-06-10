import type { SharedBlog } from '$lib/types';
import { db } from '$lib/firebase';
import { buildSharedBlog } from '$lib/utils/blogShape';
import {
	doc,
	getDoc,
	updateDoc,
	increment,
	collection,
	query,
	where,
	getDocs,
	orderBy,
	limit as limitTo
} from 'firebase/firestore';

/** Resolve a blog slug to a blog ID */
export async function resolveBlogSlug(slug: string): Promise<string | null> {
	const snap = await getDoc(doc(db, 'blogSlugs', slug));
	if (snap.exists()) return snap.data().blogId;
	return null;
}

/** Fetch a blog by ID with author profile */
export async function fetchBlog(blogId: string): Promise<SharedBlog | null> {
	let blogSnap;
	try {
		blogSnap = await getDoc(doc(db, 'blogs', blogId));
	} catch {
		// Permission denied — draft/private blog read by a non-owner
		return null;
	}
	if (!blogSnap.exists()) return null;

	const data = blogSnap.data();
	const profileSnap = await getDoc(doc(db, `users/${data.userId}/profile/main`));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	return buildSharedBlog(blogId, data, profile);
}

/** Fetch a blog by slug */
export async function fetchBlogBySlug(slug: string): Promise<SharedBlog | null> {
	const blogId = await resolveBlogSlug(slug);
	if (!blogId) return null;
	return fetchBlog(blogId);
}

/** Fetch all public blogs for a user */
export async function fetchUserBlogs(userId: string): Promise<SharedBlog[]> {
	const profileSnap = await getDoc(doc(db, `users/${userId}/profile/main`));
	const profile = profileSnap.exists() ? profileSnap.data() : null;

	let snapshot;
	try {
		snapshot = await getDocs(
			query(
				collection(db, 'blogs'),
				where('userId', '==', userId),
				where('visibility', '==', 'public'),
				orderBy('createdAt', 'desc')
			)
		);
	} catch {
		// Composite index not deployed yet — fall back to the old query and
		// filter client-side
		snapshot = await getDocs(
			query(collection(db, 'blogs'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
		);
		return snapshot.docs
			.map((d) => buildSharedBlog(d.id, d.data(), profile))
			.filter((b) => b.visibility === 'public');
	}

	return snapshot.docs.map((d) => buildSharedBlog(d.id, d.data(), profile));
}

/** Fetch recent public blogs across all users (explore page) */
export async function fetchPublicBlogs(max = 60): Promise<SharedBlog[]> {
	let snapshot;
	try {
		snapshot = await getDocs(
			query(
				collection(db, 'blogs'),
				where('visibility', '==', 'public'),
				orderBy('publishedAt', 'desc'),
				limitTo(max)
			)
		);
	} catch {
		// Composite index not deployed yet — fall back to unordered fetch
		snapshot = await getDocs(
			query(collection(db, 'blogs'), where('visibility', '==', 'public'), limitTo(max))
		);
	}

	const blogs = snapshot.docs.map((d) => buildSharedBlog(d.id, d.data(), null));
	blogs.sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));

	// Attach author profiles (deduped per user)
	const userIds = [...new Set(blogs.map((b) => b.userId))];
	const profiles = new Map<string, Record<string, any> | null>();
	await Promise.all(
		userIds.map(async (uid) => {
			const snap = await getDoc(doc(db, `users/${uid}/profile/main`));
			profiles.set(uid, snap.exists() ? snap.data() : null);
		})
	);
	return blogs.map((b) => {
		const p = profiles.get(b.userId);
		return {
			...b,
			username: p?.username ?? '',
			userDisplayName: p?.displayName ?? '',
			userAvatarUrl: p?.avatarUrl ?? ''
		};
	});
}

/**
 * Fetch posts related to a blog: same country first, then more from the
 * same author. Never throws — returns [] on any failure (e.g. missing index).
 */
export async function fetchRelatedBlogs(blog: SharedBlog, max = 3): Promise<SharedBlog[]> {
	const results = new Map<string, SharedBlog>();

	if (blog.countries.length > 0) {
		try {
			const snapshot = await getDocs(
				query(
					collection(db, 'blogs'),
					where('countries', 'array-contains', blog.countries[0]),
					where('visibility', '==', 'public'),
					limitTo(max + 1)
				)
			);
			for (const d of snapshot.docs) {
				if (d.id !== blog.id) results.set(d.id, buildSharedBlog(d.id, d.data(), null));
			}
		} catch {
			/* index not deployed yet — author fallback below still runs */
		}
	}

	if (results.size < max) {
		try {
			const authorBlogs = await fetchUserBlogs(blog.userId);
			for (const b of authorBlogs) {
				if (b.id !== blog.id && !results.has(b.id)) results.set(b.id, b);
				if (results.size >= max) break;
			}
		} catch {
			/* ignore */
		}
	}

	const related = [...results.values()].slice(0, max);

	// Attach author profiles for display
	const userIds = [...new Set(related.map((b) => b.userId))];
	const profiles = new Map<string, Record<string, any> | null>();
	await Promise.all(
		userIds.map(async (uid) => {
			const snap = await getDoc(doc(db, `users/${uid}/profile/main`));
			profiles.set(uid, snap.exists() ? snap.data() : null);
		})
	);
	return related.map((b) => {
		const p = profiles.get(b.userId);
		return {
			...b,
			username: p?.username ?? b.username,
			userDisplayName: p?.displayName ?? b.userDisplayName,
			userAvatarUrl: p?.avatarUrl ?? b.userAvatarUrl
		};
	});
}

/**
 * Increment the read counter for a published blog. Fire-and-forget — guarded
 * by Firestore rules (only `reads` may change, by exactly +1).
 */
export async function incrementReads(blogId: string): Promise<void> {
	try {
		await updateDoc(doc(db, 'blogs', blogId), { reads: increment(1) });
	} catch {
		/* non-critical */
	}
}

/** Get the public URL for a blog */
export function getBlogUrl(slug: string): string {
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/blog/${slug}`;
	}
	return `/blog/${slug}`;
}
