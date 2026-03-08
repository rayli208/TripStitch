<script lang="ts">
	import type { Trip } from '$lib/types';
	import { Link, Trash, CaretRight } from 'phosphor-svelte';

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
	let hasLinks = $derived(
		Object.values(trip.videoLinks ?? {}).some(v => v)
	);
	let dateLabel = $derived(
		new Date(trip.tripDate || trip.createdAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);
</script>

<div class="bg-card border-2 border-border rounded-xl p-4 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[4px_4px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all">
	<div class="flex items-start justify-between mb-3">
		<div>
			<h3 class="font-bold text-text-primary">{trip.title || 'Untitled Trip'}</h3>
			<p class="text-sm text-text-muted mt-0.5">
				{locationCount} {locationCount === 1 ? 'stop' : 'stops'} &middot; {dateLabel}
			</p>
		</div>
		<span
			class="text-xs font-bold px-2 py-1 rounded-full bg-warning text-black border-2 border-border"
		>
			{trip.aspectRatio}
		</span>
	</div>

	{#if trip.locations.length > 0}
		<div class="flex flex-wrap gap-1 mb-3">
			{#each trip.locations as loc, i}
				<span class="text-xs text-text-muted inline-flex items-center gap-0.5">
					{loc.name}{#if i < trip.locations.length - 1}<CaretRight size={10} weight="bold" />{/if}
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
				class="flex-1 text-sm py-2 rounded-lg bg-accent text-white font-bold border-2 border-border shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
				onclick={onlinks}
			>
				{hasLinks ? 'Edit Link' : 'Add Link'}
			</button>
			{#if onshare}
				<button
					class="text-sm py-2 px-3 rounded-lg bg-card border-2 border-border text-text-primary shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
					onclick={onshare}
					title="Copy share link"
				>
					<Link size={16} weight="bold" />
				</button>
			{/if}
			<button
				class="text-sm py-2 px-3 rounded-lg bg-card border-2 border-border text-text-primary shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
				onclick={() => { confirmingDelete = true; }}
				title="Delete trip"
			>
				<Trash size={16} weight="bold" />
			</button>
		</div>
	{/if}
</div>
