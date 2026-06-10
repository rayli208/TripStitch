import type { SharedBlog } from '$lib/types';
import { buildSharedBlog } from '$lib/utils/blogShape';
import { PUBLIC_FIREBASE_PROJECT_ID, PUBLIC_FIREBASE_API_KEY } from '$env/static/public';

/**
 * Firestore REST access for blog data. Used by universal load functions so
 * blog pages can be fetched both at build time (prerendering, Node) and in
 * the browser without pulling in the Firebase SDK. All requests run
 * unauthenticated and are subject to Firestore security rules, which allow
 * reading public/unlisted blogs only.
 */

const DOCS_BASE = `https://firestore.googleapis.com/v1/projects/${PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const KEY_PARAM = `key=${PUBLIC_FIREBASE_API_KEY}`;

type FetchFn = typeof globalThis.fetch;

/** Decode a Firestore REST typed value into a plain JS value */
function decodeValue(v: Record<string, unknown>): unknown {
	if (v === null || typeof v !== 'object') return null;
	if ('stringValue' in v) return v.stringValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('nullValue' in v) return null;
	if ('timestampValue' in v) return v.timestampValue;
	if ('arrayValue' in v) {
		const arr = (v.arrayValue as { values?: Record<string, unknown>[] })?.values ?? [];
		return arr.map(decodeValue);
	}
	if ('mapValue' in v) {
		return decodeFields((v.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields ?? {});
	}
	return null;
}

function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
	return out;
}

async function fetchDoc(path: string, fetchFn: FetchFn): Promise<Record<string, unknown> | null> {
	try {
		const res = await fetchFn(`${DOCS_BASE}/${path}?${KEY_PARAM}`);
		if (!res.ok) return null;
		const json = await res.json();
		return decodeFields(json.fields ?? {});
	} catch {
		return null;
	}
}

/** Resolve a blog slug to a blog ID via the blogSlugs index */
export async function restResolveBlogSlug(slug: string, fetchFn: FetchFn = fetch): Promise<string | null> {
	const data = await fetchDoc(`blogSlugs/${encodeURIComponent(slug)}`, fetchFn);
	return (data?.blogId as string) ?? null;
}

/** Fetch a publicly visible blog by ID, with the author's profile attached */
export async function restFetchBlog(blogId: string, fetchFn: FetchFn = fetch): Promise<SharedBlog | null> {
	const data = await fetchDoc(`blogs/${encodeURIComponent(blogId)}`, fetchFn);
	if (!data) return null;
	// Defense in depth: even if rules still permit reading drafts, never
	// surface them through the public data path.
	if (data.visibility !== 'public' && data.visibility !== 'unlisted') return null;

	const profile = await fetchDoc(`users/${data.userId}/profile/main`, fetchFn);
	return buildSharedBlog(blogId, data, profile);
}

/** Fetch a publicly visible blog by slug */
export async function restFetchBlogBySlug(slug: string, fetchFn: FetchFn = fetch): Promise<SharedBlog | null> {
	const blogId = await restResolveBlogSlug(slug, fetchFn);
	if (!blogId) return null;
	return restFetchBlog(blogId, fetchFn);
}

/**
 * Fetch all public blogs (newest first). Avoids orderBy in the query so no
 * composite index is required; sorts client-side instead.
 */
export async function restFetchPublicBlogs(
	fetchFn: FetchFn = fetch,
	{ withProfiles = false, max = 500 }: { withProfiles?: boolean; max?: number } = {}
): Promise<SharedBlog[]> {
	try {
		const res = await fetchFn(`${DOCS_BASE}:runQuery?${KEY_PARAM}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				structuredQuery: {
					from: [{ collectionId: 'blogs' }],
					where: {
						fieldFilter: {
							field: { fieldPath: 'visibility' },
							op: 'EQUAL',
							value: { stringValue: 'public' }
						}
					},
					limit: max
				}
			})
		});
		if (!res.ok) return [];
		const rows: { document?: { name: string; fields?: Record<string, Record<string, unknown>> } }[] =
			await res.json();

		const blogs: SharedBlog[] = [];
		const profileCache = new Map<string, Record<string, unknown> | null>();
		for (const row of rows) {
			if (!row.document) continue;
			const id = row.document.name.split('/').pop()!;
			const data = decodeFields(row.document.fields ?? {});
			let profile: Record<string, unknown> | null = null;
			if (withProfiles) {
				const uid = data.userId as string;
				if (!profileCache.has(uid)) {
					profileCache.set(uid, await fetchDoc(`users/${uid}/profile/main`, fetchFn));
				}
				profile = profileCache.get(uid) ?? null;
			}
			blogs.push(buildSharedBlog(id, data, profile));
		}
		blogs.sort((a, b) =>
			(b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)
		);
		return blogs;
	} catch {
		return [];
	}
}
