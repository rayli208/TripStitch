import type { SharedBlog } from '$lib/types';

/**
 * Normalize a raw blog document (from the Firestore SDK or REST API) plus its
 * author profile into a SharedBlog. Pure — safe to use in build-time loads.
 */
export function buildSharedBlog(
	id: string,
	data: Record<string, any>,
	profile: Record<string, any> | null
): SharedBlog {
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
		reads: typeof data.reads === 'number' ? data.reads : undefined,
		createdAt: data.createdAt ?? '',
		updatedAt: data.updatedAt ?? '',
		publishedAt: data.publishedAt ?? null
	};
}
