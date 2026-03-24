<script lang="ts">
	import type { BlogLocation } from '$lib/types';
	import { Globe, InstagramLogo } from 'phosphor-svelte';

	let { location }: { location: BlogLocation } = $props();

	const locationStr = [location.city, location.state, location.country].filter(Boolean).join(', ');
	const starsArr = $derived(Array.from({ length: 5 }, (_, i) => {
		if (!location.rating) return 'empty';
		if (location.rating >= i + 1) return 'full';
		if (location.rating >= i + 0.5) return 'half';
		return 'empty';
	}));
</script>

<div class="border-2 border-border rounded-xl p-4 bg-card shadow-[3px_3px_0_var(--color-border)] my-4">
	<div class="flex items-start gap-3">
		{#if location.rank}
			<div class="w-8 h-8 rounded-full bg-accent text-white font-bold text-sm flex items-center justify-center flex-shrink-0 border-2 border-border">
				#{location.rank}
			</div>
		{/if}
		<div class="flex-1">
			<h4 class="font-bold text-base text-text-primary">{location.label || location.name}</h4>
			{#if locationStr}
				<p class="text-xs text-text-muted mt-0.5">{locationStr}</p>
			{/if}
		</div>
	</div>

	<!-- Rating + Price + Category -->
	{#if location.rating || location.priceTier || location.category}
		<div class="flex items-center gap-2 mt-2 flex-wrap">
			{#if location.rating}
				<div class="flex gap-0.5">
					{#each starsArr as star}
						<span class="text-xs {star === 'empty' ? 'text-text-muted/30' : 'text-warning'}">&#9679;</span>
					{/each}
				</div>
			{/if}
			{#if location.priceTier}
				<span class="text-xs font-bold text-success">{location.priceTier}</span>
			{/if}
			{#if location.category}
				<span class="px-2 py-0.5 text-[10px] font-bold bg-accent-light rounded-lg border border-border">{location.category}</span>
			{/if}
		</div>
	{/if}

	{#if location.hours}
		<p class="text-xs text-text-muted mt-2">Hours: {location.hours}</p>
	{/if}

	{#if location.description}
		<p class="text-sm text-text-secondary mt-2">{location.description}</p>
	{/if}

	{#if location.tips}
		<p class="text-xs text-accent mt-2 italic">Tip: {location.tips}</p>
	{/if}

	<!-- Links -->
	{#if location.websiteUrl || location.instagramHandle}
		<div class="flex items-center gap-3 mt-3">
			{#if location.websiteUrl}
				<a href={location.websiteUrl} target="_blank" rel="noopener" class="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors">
					<Globe size={14} />
					Website
				</a>
			{/if}
			{#if location.instagramHandle}
				<a href="https://instagram.com/{location.instagramHandle.replace('@', '')}" target="_blank" rel="noopener" class="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors">
					<InstagramLogo size={14} />
					{location.instagramHandle}
				</a>
			{/if}
		</div>
	{/if}

	<!-- Directions link -->
	<a
		href="https://www.google.com/maps/dir/?api=1&destination={location.lat},{location.lng}"
		target="_blank"
		rel="noopener"
		class="inline-block mt-2 text-xs text-accent font-bold hover:text-accent-hover transition-colors"
	>
		Get Directions →
	</a>
</div>
