import type { PageLoad, EntryGenerator } from './$types';
import { restFetchBlogBySlug, restFetchPublicBlogs } from '$lib/services/blogRest';

// Blog posts are prerendered at build time so crawlers (and social-card
// scrapers, which don't run JS) see real HTML with per-post meta tags.
// Posts published after the last deploy aren't prerendered but still work:
// hosting falls back to the SPA shell and this load re-runs in the browser.
export const prerender = true;
export const ssr = true;

/** Enumerate all public blog slugs so the prerenderer knows what to build */
export const entries: EntryGenerator = async () => {
	try {
		const blogs = await restFetchPublicBlogs(fetch);
		return blogs.filter((b) => b.slug).map((b) => ({ slug: b.slug }));
	} catch (err) {
		// Never fail the whole build over this — worst case no posts are
		// prerendered and everything falls back to SPA behavior.
		console.warn('[blog] Could not enumerate slugs for prerender:', err);
		return [];
	}
};

export const load: PageLoad = async ({ params, fetch }) => {
	// Returns null for unknown slugs and for non-public posts; the page then
	// falls back to an authenticated SDK fetch so owners can preview drafts.
	const blog = await restFetchBlogBySlug(params.slug, fetch);
	return { blog, slug: params.slug };
};
