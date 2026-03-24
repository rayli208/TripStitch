import type { SharedBlog } from '$lib/types';
import { db } from '$lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

function buildSharedBlog(id: string, data: any, profile: any): SharedBlog {
	return {
		id,
		userId: data.userId,
		username: profile?.username ?? '',
		userDisplayName: profile?.displayName ?? '',
		userAvatarUrl: profile?.avatarUrl ?? '',
		title: data.title ?? 'Untitled',
		subtitle: data.subtitle ?? null,
		coverImageUrl: data.coverImageUrl ?? null,
		content: data.content ?? {},
		tags: data.tags ?? [],
		category: data.category ?? 'guide',
		visibility: data.visibility ?? 'draft',
		slug: data.slug ?? '',
		excerpt: data.excerpt ?? '',
		readingTime: data.readingTime ?? 1,
		linkedTripIds: data.linkedTripIds ?? [],
		youtubeUrl: data.youtubeUrl ?? null,
		locations: data.locations ?? [],
		routes: data.routes ?? [],
		cities: data.cities ?? [],
		states: data.states ?? [],
		countries: data.countries ?? [],
		createdAt: data.createdAt ?? '',
		updatedAt: data.updatedAt ?? '',
		publishedAt: data.publishedAt ?? null
	};
}

/** Resolve a blog slug to a blog ID */
export async function resolveBlogSlug(slug: string): Promise<string | null> {
	const snap = await getDoc(doc(db, 'blogSlugs', slug));
	if (snap.exists()) return snap.data().blogId;
	return null;
}

/** Fetch a blog by ID with author profile */
export async function fetchBlog(blogId: string): Promise<SharedBlog | null> {
	const blogSnap = await getDoc(doc(db, 'blogs', blogId));
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

	const q = query(
		collection(db, 'blogs'),
		where('userId', '==', userId),
		orderBy('createdAt', 'desc')
	);
	const snapshot = await getDocs(q);

	return snapshot.docs
		.map((d) => buildSharedBlog(d.id, d.data(), profile))
		.filter((b) => b.visibility === 'public');
}

/** Get the public URL for a blog */
export function getBlogUrl(slug: string): string {
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/blog/${slug}`;
	}
	return `/blog/${slug}`;
}
