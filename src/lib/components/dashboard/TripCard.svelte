<script lang="ts">
	import type { Trip } from '$lib/types';
	import { MapPin, PencilSimple, ShareNetwork, Trash, YoutubeLogo, InstagramLogo, TiktokLogo, Plus } from 'phosphor-svelte';
	import { getVideoUrl, parseVideoUrl } from '$lib/utils/videoEmbed';

	let {
		trip,
		onview,
		onedit,
		onlinks,
		ondelete,
		onshare
	}: {
		trip: Trip;
		onview: () => void;
		onedit: () => void;
		onlinks: () => void;
		ondelete: () => void;
		onshare?: () => void;
	} = $props();

	// ── Social video link status (YouTube / Instagram / TikTok) ──
	const videoUrl = $derived(getVideoUrl(trip.videoLinks));
	const linkPlatform = $derived(videoUrl ? parseVideoUrl(videoUrl)?.platform ?? null : null);
	const platformIcon = $derived(
		linkPlatform === 'youtube' ? YoutubeLogo : linkPlatform === 'instagram' ? InstagramLogo : linkPlatform === 'tiktok' ? TiktokLogo : null
	);
	const platformLabel = $derived(
		linkPlatform === 'youtube' ? 'YouTube' : linkPlatform === 'instagram' ? 'Instagram' : linkPlatform === 'tiktok' ? 'TikTok' : ''
	);

	let confirmingDelete = $state(false);

	const locationCount = $derived(trip.locations.length);
	const dateLabel = $derived(
		new Date(trip.tripDate || trip.createdAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);
	const isPublished = $derived(trip.visibility === 'public' && !trip.draft);
	const statusLabel = $derived(
		trip.draft ? 'Draft' : trip.visibility === 'public' ? 'Published' : trip.visibility === 'unlisted' ? 'Unlisted' : 'Draft'
	);

	const firstCity = $derived(trip.locations[0]?.city ?? trip.locations[0]?.name?.split(',')[0] ?? '');

	const coverUrl = $derived(trip.coverImageUrl ?? trip.titleMediaPreviewUrl);

	// ── "Cartoon route" — project the trip's actual lat/lng onto the cover area
	// so the card silhouette reads like a simplified map of the real trip ──
	const VIEW_W = 100;
	const VIEW_H = 60; // ~16:9.6 — matches the cover aspect closely enough
	const PADDING = 12;

	type Pt = { x: number; y: number };

	const routePoints = $derived.by<Pt[]>(() => {
		const sorted = [...trip.locations].sort((a, b) => a.order - b.order);
		if (sorted.length === 0) return [];
		if (sorted.length === 1) return [{ x: VIEW_W / 2, y: VIEW_H / 2 }];

		const lats = sorted.map((l) => l.lat);
		const lngs = sorted.map((l) => l.lng);
		const minLat = Math.min(...lats);
		const maxLat = Math.max(...lats);
		const minLng = Math.min(...lngs);
		const maxLng = Math.max(...lngs);

		const latRange = maxLat - minLat || 1;
		const lngRange = maxLng - minLng || 1;

		// Normalize to view box, padded so pins don't sit on the edges.
		const innerW = VIEW_W - PADDING * 2;
		const innerH = VIEW_H - PADDING * 2;

		return sorted.map((loc) => {
			const x = PADDING + ((loc.lng - minLng) / lngRange) * innerW;
			// Invert Y because SVG y grows downward but lat grows upward
			const y = PADDING + ((maxLat - loc.lat) / latRange) * innerH;
			return { x, y };
		});
	});

	// Build a smoothed Catmull-Rom-ish path between the route points
	// for a wavy "doodle road" feel.
	const routePath = $derived.by(() => {
		const pts = routePoints;
		if (pts.length < 2) return '';
		if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
		let d = `M ${pts[0].x} ${pts[0].y}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] ?? pts[i];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = pts[i + 2] ?? p2;
			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;
			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;
			d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
		}
		return d;
	});
</script>

<div class="group rounded-2xl border-2 border-border bg-card overflow-hidden shadow-[3px_3px_0_var(--color-border)] hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all">
	<!-- Cover area with title color background and pin pattern -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative w-full h-32 sm:h-36 cursor-pointer overflow-hidden"
		style="background: linear-gradient(135deg, {trip.titleColor}30 0%, {trip.titleColor}60 100%); border-bottom: 2px solid var(--color-border);"
		onclick={onview}
		title="View {trip.title || 'Untitled trip'}"
	>
		<!-- Cover image (if uploaded) -->
		{#if coverUrl}
			<img
				src={coverUrl}
				alt=""
				class="absolute inset-0 w-full h-full object-cover"
			/>
			<div class="absolute inset-0 bg-gradient-to-t from-overlay/40 to-transparent"></div>
		{/if}

		<!-- Cartoony route — pins positioned by real lat/lng with a dashed treasure-map path -->
		{#if !coverUrl && routePoints.length > 0}
			<svg
				class="absolute inset-0 w-full h-full"
				viewBox="0 0 {VIEW_W} {VIEW_H}"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{#if routePath}
					<!-- Outer dark stroke for contrast -->
					<path
						d={routePath}
						fill="none"
						stroke="var(--color-border)"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-dasharray="3 2.5"
						opacity="0.35"
					/>
					<!-- Brand-colored route on top -->
					<path
						d={routePath}
						fill="none"
						stroke={trip.titleColor}
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-dasharray="3 2.5"
					/>
				{/if}
			</svg>

			<!-- Numbered pins (px-sized so they don't get squished by preserveAspectRatio="none") -->
			{#each routePoints.slice(0, 12) as pt, i}
				<span
					class="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-card shadow-[1px_1px_0_var(--color-border)] flex items-center justify-center text-[9px] font-extrabold text-white"
					style="left: {pt.x}%; top: {(pt.y / VIEW_H) * 100}%; background: {trip.titleColor};"
				>
					{i + 1}
				</span>
			{/each}
		{/if}

		<!-- Status pill (top-left) -->
		<span
			class="absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border-2 border-border
				{isPublished ? 'bg-accent text-white' : 'bg-warning text-black'}"
		>
			{statusLabel}
		</span>

		<!-- Video link badge (top-right) — shows linked platform, or prompts to add one -->
		{#if linkPlatform && platformIcon}
			{@const PlatformIcon = platformIcon}
			<button
				type="button"
				class="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border-2 border-border bg-card text-text-primary shadow-[1px_1px_0_var(--color-border)] hover:bg-accent-light transition-colors cursor-pointer"
				onclick={(e) => { e.stopPropagation(); onlinks(); }}
				title="Edit {platformLabel} link"
			>
				<PlatformIcon size={11} weight="fill" class="text-accent" />
				{platformLabel}
			</button>
		{:else}
			<button
				type="button"
				class="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border-2 border-dashed border-border bg-card/80 text-text-muted hover:text-text-primary hover:border-accent transition-colors cursor-pointer"
				onclick={(e) => { e.stopPropagation(); onlinks(); }}
				title="Add a YouTube, Instagram, or TikTok link"
			>
				<Plus size={10} weight="bold" />
				Add link
			</button>
		{/if}
	</div>

	<!-- Body -->
	<div class="p-4">
		<h3 class="font-extrabold text-text-primary text-base leading-tight truncate">{trip.title || 'Untitled trip'}</h3>
		<p class="text-xs text-text-muted mt-0.5 flex items-center gap-1.5 truncate">
			{#if firstCity}
				<MapPin size={11} weight="fill" class="text-accent shrink-0" />
				<span class="truncate">{firstCity}</span>
				<span>·</span>
			{/if}
			<span class="shrink-0">{locationCount} {locationCount === 1 ? 'stop' : 'stops'}</span>
			<span>·</span>
			<span class="shrink-0">{dateLabel}</span>
		</p>

		{#if confirmingDelete}
			<div class="mt-3 flex items-center gap-2">
				<span class="text-xs text-error flex-1">Delete this trip?</span>
				<button
					class="text-xs py-1.5 px-3 rounded-lg bg-error hover:bg-error/80 text-white font-bold transition-colors cursor-pointer"
					onclick={() => { confirmingDelete = false; ondelete(); }}
				>
					Delete
				</button>
				<button
					class="text-xs py-1.5 px-3 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
					onclick={() => { confirmingDelete = false; }}
				>
					Cancel
				</button>
			</div>
		{:else}
			<div class="mt-3 flex gap-2">
				<button
					class="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-card border-2 border-border text-text-primary font-bold shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
					onclick={onedit}
				>
					<PencilSimple size={12} weight="bold" />
					Edit
				</button>
				{#if onshare}
					<button
						class="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-card border-2 border-border text-text-primary font-bold shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
						onclick={onshare}
					>
						<ShareNetwork size={12} weight="bold" />
						Share
					</button>
				{/if}
				<button
					class="inline-flex items-center justify-center w-8 text-text-muted hover:text-error rounded-lg border-2 border-border hover:border-error/40 transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)]"
					onclick={() => { confirmingDelete = true; }}
					title="Delete trip"
					aria-label="Delete trip"
				>
					<Trash size={12} weight="bold" />
				</button>
			</div>
		{/if}
	</div>
</div>
