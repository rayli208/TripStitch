import type { RequestHandler } from './$types';
import { restFetchPublicBlogs } from '$lib/services/blogRest';

// Generated at build time. The scheduled rebuild workflow keeps it fresh as
// posts are published between code deploys.
export const prerender = true;

const SITE = 'https://tripstitch.blog';

const STATIC_PAGES = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/explore', changefreq: 'daily', priority: '0.8' },
	{ path: '/pricing', changefreq: 'monthly', priority: '0.6' },
	{ path: '/signin', changefreq: 'monthly', priority: '0.5' }
];

export const GET: RequestHandler = async ({ fetch }) => {
	const blogs = await restFetchPublicBlogs(fetch);

	const urls: string[] = STATIC_PAGES.map(
		(p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
	);

	for (const blog of blogs) {
		if (!blog.slug) continue;
		const lastmod = (blog.updatedAt || blog.publishedAt || blog.createdAt || '').slice(0, 10);
		urls.push(`  <url>
    <loc>${SITE}/blog/${encodeURI(blog.slug)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml' }
	});
};
