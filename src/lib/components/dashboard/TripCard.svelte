<script lang="ts">
	import type { Trip } from '$lib/types';

	let {
		trip,
		onedit,
		ondelete
	}: {
		trip: Trip;
		onedit: () => void;
		ondelete: () => void;
	} = $props();

	let confirmingDelete = $state(false);

	let locationCount = $derived(trip.locations.length);
	let dateLabel = $derived(
		new Date(trip.createdAt).toLocaleDateString('en-US', {
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
				onclick={onedit}
			>
				Edit
			</button>
			<button
				class="text-sm py-2 px-4 rounded-lg bg-border hover:bg-primary-light text-text-secondary hover:text-white transition-colors cursor-pointer"
				onclick={() => { confirmingDelete = true; }}
			>
				Delete
			</button>
		</div>
	{/if}
</div>
