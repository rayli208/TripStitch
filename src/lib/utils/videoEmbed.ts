import type { VideoLinks } from '$lib/types';

export type VideoPlatform = 'youtube' | 'instagram' | 'tiktok';

export interface ParsedVideo {
	platform: VideoPlatform;
	videoId: string;
	embedUrl: string;
	originalUrl: string;
	isVertical: boolean;
}

export function parseYouTubeUrl(url: string): ParsedVideo | null {
	let videoId: string | null = null;
	let isVertical = false;

	try {
		const u = new URL(url);

		// youtube.com/shorts/ID
		const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
		if (shortsMatch) {
			videoId = shortsMatch[1];
			isVertical = true;
		}

		// youtube.com/watch?v=ID
		if (!videoId && u.searchParams.has('v')) {
			videoId = u.searchParams.get('v');
		}

		// youtu.be/ID
		if (!videoId && u.hostname === 'youtu.be') {
			videoId = u.pathname.slice(1).split('/')[0];
		}

		// youtube.com/embed/ID (already an embed URL)
		if (!videoId) {
			const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
			if (embedMatch) {
				videoId = embedMatch[1];
			}
		}
	} catch {
		return null;
	}

	if (!videoId) return null;

	return {
		platform: 'youtube',
		videoId,
		embedUrl: `https://www.youtube.com/embed/${videoId}`,
		originalUrl: url,
		isVertical
	};
}

export function parseInstagramUrl(url: string): ParsedVideo | null {
	try {
		const u = new URL(url);
		// instagram.com/reel/ID/ or instagram.com/p/ID/
		const match = u.pathname.match(/\/(reel|p)\/([a-zA-Z0-9_-]+)/);
		if (!match) return null;

		return {
			platform: 'instagram',
			videoId: match[2],
			embedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/embed/`,
			originalUrl: url,
			isVertical: true
		};
	} catch {
		return null;
	}
}

export function parseTikTokUrl(url: string): ParsedVideo | null {
	try {
		const u = new URL(url);
		// tiktok.com/@user/video/ID
		const match = u.pathname.match(/\/video\/(\d+)/);
		if (!match) return null;

		return {
			platform: 'tiktok',
			videoId: match[1],
			embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}`,
			originalUrl: url,
			isVertical: true
		};
	} catch {
		return null;
	}
}

const PARSERS: Record<VideoPlatform, (url: string) => ParsedVideo | null> = {
	youtube: parseYouTubeUrl,
	instagram: parseInstagramUrl,
	tiktok: parseTikTokUrl
};

export function parseVideoUrl(url: string, platform?: VideoPlatform): ParsedVideo | null {
	if (platform && PARSERS[platform]) {
		return PARSERS[platform](url);
	}
	// Try all parsers
	for (const parser of Object.values(PARSERS)) {
		const result = parser(url);
		if (result) return result;
	}
	return null;
}

export function parseAllVideoLinks(links: VideoLinks): ParsedVideo[] {
	const results: ParsedVideo[] = [];

	if (links.youtube) {
		const parsed = parseYouTubeUrl(links.youtube);
		if (parsed) results.push(parsed);
	}
	if (links.instagram) {
		const parsed = parseInstagramUrl(links.instagram);
		if (parsed) results.push(parsed);
	}
	if (links.tiktok) {
		const parsed = parseTikTokUrl(links.tiktok);
		if (parsed) results.push(parsed);
	}

	return results;
}

/** Build a VideoLinks object from a single video URL (auto-detect platform). */
export function videoUrlToLinks(url: string): Pick<VideoLinks, 'youtube' | 'instagram' | 'tiktok'> {
	const parsed = parseVideoUrl(url);
	if (!parsed) return {};
	return { [parsed.platform]: url };
}

/** Extract the first non-empty video URL from a VideoLinks object. */
export function getVideoUrl(links?: VideoLinks): string {
	if (!links) return '';
	return links.youtube || links.instagram || links.tiktok || '';
}
