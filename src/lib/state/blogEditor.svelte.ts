import type { BlogCategory, BlogVisibility, BlogLocation, BlogRoute, RouteStop, PriceTier } from '$lib/types';
import { WORDS_PER_MINUTE } from '$lib/constants/blog';

// ── Content extraction helpers ──

/** Walk TipTap JSON tree and count words in text nodes */
export function extractWordCount(content: Record<string, unknown>): number {
	let count = 0;
	function walk(node: Record<string, unknown>) {
		if (node.type === 'text' && typeof node.text === 'string') {
			count += node.text.split(/\s+/).filter(Boolean).length;
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child as Record<string, unknown>);
		}
	}
	walk(content);
	return count;
}

/** Extract first N characters of plain text from TipTap JSON */
export function extractExcerpt(content: Record<string, unknown>, maxLen = 160): string {
	let text = '';
	function walk(node: Record<string, unknown>) {
		if (text.length >= maxLen) return;
		if (node.type === 'text' && typeof node.text === 'string') {
			text += node.text;
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) {
				walk(child as Record<string, unknown>);
				// Add space between block-level elements
				if (text.length > 0 && !text.endsWith(' ')) text += ' ';
			}
		}
	}
	walk(content);
	return text.slice(0, maxLen).trim();
}

/** Extract all locationCard nodes from TipTap JSON content */
export function extractLocationsFromContent(content: Record<string, unknown>): BlogLocation[] {
	const locations: BlogLocation[] = [];
	let order = 0;
	function walk(node: Record<string, unknown>) {
		if (node.type === 'locationCard' && node.attrs) {
			const a = node.attrs as Record<string, unknown>;
			locations.push({
				id: (a.id as string) ?? '',
				order: order++,
				name: (a.name as string) ?? '',
				label: (a.label as string) ?? null,
				description: (a.description as string) ?? null,
				lat: (a.lat as number) ?? 0,
				lng: (a.lng as number) ?? 0,
				city: (a.city as string) ?? null,
				state: (a.state as string) ?? null,
				country: (a.country as string) ?? null,
				rating: (a.rating as number) ?? null,
				priceTier: (a.priceTier as PriceTier | null) ?? null,
				imageUrls: a.imageUrls ? JSON.parse(a.imageUrls as string) : [],
				websiteUrl: (a.websiteUrl as string) ?? null,
				instagramHandle: (a.instagramHandle as string) ?? null,
				hours: (a.hours as string) ?? null,
				rank: (a.rank as number) ?? null,
				category: (a.category as string) ?? null,
				tips: (a.tips as string) ?? null
			});
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child as Record<string, unknown>);
		}
	}
	walk(content);
	return locations;
}

/** Extract all routeBlock nodes from TipTap JSON content */
export function extractRoutesFromContent(content: Record<string, unknown>): BlogRoute[] {
	const routes: BlogRoute[] = [];
	function walk(node: Record<string, unknown>) {
		if (node.type === 'routeBlock' && node.attrs) {
			const a = node.attrs as Record<string, unknown>;
			let stops: RouteStop[] = [];
			try {
				stops = JSON.parse((a.stops as string) ?? '[]');
			} catch { /* empty */ }
			routes.push({
				id: (a.id as string) ?? '',
				title: (a.title as string) ?? '',
				stops
			});
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child as Record<string, unknown>);
		}
	}
	walk(content);
	return routes;
}

// ── Blog Editor Factory ──

export function createBlogEditorState(initial?: {
	title?: string;
	subtitle?: string;
	category?: BlogCategory;
	tags?: string[];
	visibility?: BlogVisibility;
	content?: Record<string, unknown>;
	linkedTripIds?: string[];
	youtubeUrl?: string;
	coverImageUrl?: string;
}) {
	let title = $state(initial?.title ?? '');
	let subtitle = $state(initial?.subtitle ?? '');
	let category = $state<BlogCategory>(initial?.category ?? 'guide');
	let tags = $state<string[]>(initial?.tags ?? []);
	let visibility = $state<BlogVisibility>(initial?.visibility ?? 'draft');
	let content = $state<Record<string, unknown>>(initial?.content ?? {});
	let coverImageFile = $state<File | null>(null);
	let coverImagePreviewUrl = $state<string | null>(initial?.coverImageUrl ?? null);
	let linkedTripIds = $state<string[]>(initial?.linkedTripIds ?? []);
	let youtubeUrl = $state(initial?.youtubeUrl ?? '');
	let isSaving = $state(false);
	let lastSavedAt = $state<string | null>(null);
	let isDirty = $state(false);

	// Derived
	let wordCount = $derived(extractWordCount(content));
	let readingTime = $derived(Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)));
	let excerpt = $derived(extractExcerpt(content, 160));
	let locations = $derived(extractLocationsFromContent(content));
	let routes = $derived(extractRoutesFromContent(content));
	let hasContent = $derived(title.trim().length > 0 || Object.keys(content).length > 1);

	return {
		get title() { return title; },
		set title(v: string) { title = v; isDirty = true; },
		get subtitle() { return subtitle; },
		set subtitle(v: string) { subtitle = v; isDirty = true; },
		get category() { return category; },
		set category(v: BlogCategory) { category = v; isDirty = true; },
		get tags() { return tags; },
		set tags(v: string[]) { tags = v; isDirty = true; },
		get visibility() { return visibility; },
		set visibility(v: BlogVisibility) { visibility = v; isDirty = true; },
		get content() { return content; },
		get coverImageFile() { return coverImageFile; },
		get coverImagePreviewUrl() { return coverImagePreviewUrl; },
		get linkedTripIds() { return linkedTripIds; },
		set linkedTripIds(v: string[]) { linkedTripIds = v; isDirty = true; },
		get youtubeUrl() { return youtubeUrl; },
		set youtubeUrl(v: string) { youtubeUrl = v; isDirty = true; },
		get isSaving() { return isSaving; },
		set isSaving(v: boolean) { isSaving = v; },
		get lastSavedAt() { return lastSavedAt; },
		get isDirty() { return isDirty; },
		set isDirty(v: boolean) { isDirty = v; },
		get wordCount() { return wordCount; },
		get readingTime() { return readingTime; },
		get excerpt() { return excerpt; },
		get locations() { return locations; },
		get routes() { return routes; },
		get hasContent() { return hasContent; },

		updateContent(json: Record<string, unknown>) {
			content = json;
			isDirty = true;
		},

		updateCoverImage(file: File) {
			if (coverImagePreviewUrl && coverImagePreviewUrl.startsWith('blob:')) {
				URL.revokeObjectURL(coverImagePreviewUrl);
			}
			coverImageFile = file;
			coverImagePreviewUrl = URL.createObjectURL(file);
			isDirty = true;
		},

		removeCoverImage() {
			if (coverImagePreviewUrl && coverImagePreviewUrl.startsWith('blob:')) {
				URL.revokeObjectURL(coverImagePreviewUrl);
			}
			coverImageFile = null;
			coverImagePreviewUrl = null;
			isDirty = true;
		},

		markSaved() {
			isDirty = false;
			isSaving = false;
			lastSavedAt = new Date().toISOString();
		}
	};
}
