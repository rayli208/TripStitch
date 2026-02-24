<script lang="ts">
	import type { Trip } from '$lib/types';

	let {
		trip,
		onlinks,
		ondelete,
		onshare
	}: {
		trip: Trip;
		onlinks: () => void;
		ondelete: () => void;
		onshare?: () => void;
	} = $props();

	let confirmingDelete = $state(false);

	let locationCount = $derived(trip.locations.length);
	let linkCount = $derived(
		Object.values(trip.videoLinks ?? {}).filter(v => v).length
	);
	let dateLabel = $derived(
		new Date(trip.tripDate || trip.createdAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);
</script>

<div class="bg-card border border-border rounded-xl p-4 hover:border-primary-light transition-colors">
	<div class="flex items-start justify-between mb-3">
		<div>
			<h3 class="font-semibold text-text-primary">{trip.title || 'Untitled Trip'}</h3>
			<p class="text-sm text-text-muted mt-0.5">
				{locationCount} {locationCount === 1 ? 'stop' : 'stops'} &middot; {dateLabel}
			</p>
		</div>
		<span
			class="text-xs px-2 py-1 rounded-full bg-border text-text-muted"
		>
			{trip.aspectRatio}
		</span>
	</div>

	{#if trip.locations.length > 0}
		<div class="flex flex-wrap gap-1 mb-3">
			{#each trip.locations as loc, i}
				<span class="text-xs text-text-muted">
					{loc.name}{i < trip.locations.length - 1 ? ' →' : ''}
				</span>
			{/each}
		</div>
	{/if}

	{#if confirmingDelete}
		<div class="flex items-center gap-2">
			<span class="text-sm text-error flex-1">Delete this trip?</span>
			<button
				class="text-sm py-2 px-4 rounded-lg bg-error hover:bg-error/80 text-white transition-colors cursor-pointer"
				onclick={() => { confirmingDelete = false; ondelete(); }}
			>
				Delete
			</button>
			<button
				class="text-sm py-2 px-4 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
				onclick={() => { confirmingDelete = false; }}
			>
				Cancel
			</button>
		</div>
	{:else}
		<div class="flex gap-2">
			<button
				class="flex-1 text-sm py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer"
				onclick={onlinks}
			>
				{linkCount > 0 ? `Links (${linkCount})` : 'Add Links'}
			</button>
			{#if onshare}
				<button
					class="text-sm py-2 px-3 rounded-lg bg-border hover:bg-primary-light text-text-secondary hover:text-white transition-colors cursor-pointer"
					onclick={onshare}
					title="Copy share link"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
					</svg>
				</button>
			{/if}
			<button
				class="text-sm py-2 px-3 rounded-lg bg-border hover:bg-primary-light text-text-secondary hover:text-white transition-colors cursor-pointer"
				onclick={() => { confirmingDelete = true; }}
				title="Delete trip"
			>
				<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>
	{/if}
</div>
