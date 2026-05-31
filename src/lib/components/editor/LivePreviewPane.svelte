<script lang="ts">
	import type { Location, MapStyle, AspectRatio } from '$lib/types';
	import { fontFamily } from '$lib/constants/fonts';
	import RoutePreviewMap from './RoutePreviewMap.svelte';

	let {
		step,
		title = '',
		titleColor = '#FFFFFF',
		titleDescription = '',
		fontId = 'inter',
		secondaryColor = '#0a0f1e',
		titleMediaPreviewUrl = null,
		logoUrl = null,
		showLogoOnTitle = false,
		tripDate = '',
		aspectRatio = '9:16' as AspectRatio,
		mapStyle = 'streets' as MapStyle,
		locations = [] as Location[],
		videoUrl = null as string | null,
		estimatedDuration = ''
	}: {
		step: number;
		title?: string;
		titleColor?: string;
		titleDescription?: string;
		fontId?: string;
		secondaryColor?: string;
		titleMediaPreviewUrl?: string | null;
		logoUrl?: string | null;
		showLogoOnTitle?: boolean;
		tripDate?: string;
		aspectRatio?: AspectRatio;
		mapStyle?: MapStyle;
		locations?: Location[];
		videoUrl?: string | null;
		estimatedDuration?: string;
	} = $props();

	const labelMap: Record<number, string> = {
		0: 'LIVE PREVIEW',
		1: 'LIVE ROUTE PREVIEW',
		2: 'ROUTE PREVIEW',
		4: 'VIDEO PREVIEW',
		5: 'FINAL VIDEO'
	};

	const aspectClass = $derived(
		aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
	);

	const formattedDate = $derived(() => {
		if (!tripDate) return '';
		try {
			return new Date(tripDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return '';
		}
	});
</script>

<aside class="relative h-full">
	<header class="flex items-center justify-between mb-3">
		<span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
			{labelMap[step] ?? 'PREVIEW'}
		</span>
		{#if estimatedDuration && (step === 4 || step === 5)}
			<span class="text-[11px] font-mono text-text-muted">{estimatedDuration}</span>
		{/if}
	</header>

	<div class="rounded-2xl border-2 border-border bg-overlay shadow-[4px_4px_0_var(--color-border)] overflow-hidden">
		{#if step === 0}
			<!-- Title card preview — 1:1 with titleRenderer.drawTitleCardToCanvas -->
			<div class="p-6 flex items-center justify-center min-h-[420px]">
				<div class="{aspectClass} w-56 max-w-full rounded-2xl overflow-hidden border-2 border-border/40 relative shadow-[3px_3px_0_var(--color-border)]">
					<!-- Background: cover image w/ 40% black scrim, OR the same 3-stop dark gradient the renderer uses -->
					{#if titleMediaPreviewUrl}
						<img src={titleMediaPreviewUrl} alt="Cover" class="absolute inset-0 w-full h-full object-cover" />
						<div class="absolute inset-0" style="background: rgba(0,0,0,0.4);"></div>
					{:else}
						<div class="absolute inset-0" style="background: linear-gradient(to bottom, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);"></div>
					{/if}

					<div class="relative h-full flex flex-col items-center justify-center px-4 text-center">
						<!-- Pill backdrop: secondaryColor @ 75% alpha (bf), rounded 16px (matches renderer line 138-140) -->
						<div
							class="relative max-w-full inline-block px-4 py-3 rounded-2xl overflow-hidden"
							style="background: {secondaryColor}bf;"
						>
							<!-- Left accent bar: titleColor @ 85% alpha, 4px wide, full pill height
									 (renderer line 142-144). Rendered via the parent's overflow-hidden
									 so the bar clips cleanly to the pill's rounded corners. -->
							<span
								class="absolute left-0 top-0 bottom-0 w-1"
								style="background: {titleColor}; opacity: 0.85;"
							></span>

							<!-- Title: ALWAYS WHITE in the export (line 149), titleColor only colors the bar -->
							<p
								class="text-2xl font-bold leading-tight break-words text-white"
								style="font-family: {fontFamily(fontId)}"
							>
								{title || 'Your Trip Title'}
							</p>

							{#if titleDescription}
								<!-- Description: white @ 70% (line 158, globalAlpha 0.7) -->
								<p
									class="text-xs mt-2 text-white"
									style="font-family: {fontFamily(fontId)}; opacity: 0.7;"
								>
									{titleDescription}
								</p>
							{:else}
								<!-- Decorative underline: titleColor @ 60% alpha, 2px (renderer line 165-172) -->
								<span
									class="block mx-auto mt-2 w-[30%] h-[2px]"
									style="background: {titleColor}; opacity: 0.6;"
								></span>
							{/if}
						</div>
					</div>

					<!-- Logo watermark: 12% of width, 4% margin, 80% opacity (renderer line 178-194) -->
					{#if showLogoOnTitle && logoUrl}
						<img
							src={logoUrl}
							alt=""
							class="absolute object-contain"
							style="width: 12%; height: auto; right: 4%; bottom: 4%; opacity: 0.8;"
						/>
					{/if}
				</div>
			</div>
			<p class="px-4 pb-3 text-[11px] text-text-muted text-center">
				The cover will be the first frame everyone sees when your trip is shared or embedded.
			</p>
		{:else if step === 1 || step === 2}
			<!-- Route map preview -->
			<div class="min-h-[420px] flex items-center justify-center bg-overlay">
				{#if locations.length >= 2}
					<div class="w-full">
						<RoutePreviewMap {locations} {mapStyle} {titleColor} />
					</div>
				{:else}
					<div class="text-center px-6 py-12">
						<p class="text-text-muted text-sm">Add at least 2 stops to see your route.</p>
					</div>
				{/if}
			</div>
			{#if locations.length >= 2}
				<div class="px-4 py-2 border-t-2 border-border flex items-center justify-center gap-3 text-[10px] font-mono text-text-muted">
					<span>{locations.length} stops</span>
					{#if estimatedDuration}
						<span>·</span>
						<span>~{estimatedDuration} video</span>
					{/if}
				</div>
			{/if}
		{:else if step === 4 || step === 5}
			<!-- Video preview -->
			<div class="p-6 flex items-center justify-center min-h-[420px]">
				{#if videoUrl}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={videoUrl}
						controls
						playsinline
						class="{aspectClass} w-56 max-w-full rounded-2xl border-2 border-border/40 bg-overlay object-contain shadow-[3px_3px_0_var(--color-border)]"
					></video>
				{:else}
					<div class="text-center">
						<p class="text-text-muted text-sm">Video will appear here once stitched.</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</aside>
