import type { RequestHandler } from './$types';
import { restFetchPublicBlogs } from '$lib/services/blogRest';

// RSS feed of public blog posts, generated at build time.
export const prerender = true;

const SITE = 'https://tripstitch.blog';

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export const GET: RequestHandler = async ({ fetch }) => {
	const blogs = (await restFetchPublicBlogs(fetch, { withProfiles: true })).slice(0, 50);

	const items = blogs
		.filter((b) => b.slug)
		.map((b) => {
			const url = `${SITE}/blog/${encodeURI(b.slug)}`;
			const pubDate = new Date(b.publishedAt ?? b.createdAt).toUTCString();
			return `    <item>
      <title>${escapeXml(b.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>${b.userDisplayName ? `
      <dc:creator>${escapeXml(b.userDisplayName)}</dc:creator>` : ''}
      <description>${escapeXml(b.excerpt)}</description>${b.coverImageUrl ? `
      <enclosure url="${escapeXml(b.coverImageUrl)}" type="image/jpeg" length="0" />` : ''}
    </item>`;
		})
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TripStitch Blog</title>
    <link>${SITE}/explore</link>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Travel guides, itineraries, and stories from TripStitch creators</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/rss+xml' }
	});
};
