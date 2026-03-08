<script lang="ts">
	import type { Location, TransportMode } from '$lib/types';
	import TransportPicker from './TransportPicker.svelte';
	import MediaUpload from './MediaUpload.svelte';
	import { CaretUp, CaretDown, X } from 'phosphor-svelte';

	let {
		location,
		index,
		isFirst,
		isLast,
		onremove,
		onmoveup,
		onmovedown,
		onmedia,
		ontransport
	}: {
		location: Location;
		index: number;
		isFirst: boolean;
		isLast: boolean;
		onremove: () => void;
		onmoveup: () => void;
		onmovedown: () => void;
		onmedia: (file: File) => void;
		ontransport: (mode: TransportMode) => void;
	} = $props();
</script>

<div class="bg-card border border-border rounded-xl p-4">
	<div class="flex items-start gap-3">
		<!-- Order controls -->
		<div class="flex flex-col items-center gap-1 pt-1">
			<button
				class="text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
				disabled={isFirst}
				onclick={onmoveup}
			>
				<CaretUp size={16} weight="bold" />
			</button>
			<span class="text-xs text-text-muted font-mono">{index + 1}</span>
			<button
				class="text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
				disabled={isLast}
				onclick={onmovedown}
			>
				<CaretDown size={16} weight="bold" />
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 min-w-0 space-y-3">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-text-primary">{location.name}</p>
					{#if !isFirst}
						<div class="mt-1">
							<TransportPicker
								mode={location.transportMode}
								onchange={(mode: TransportMode) => ontransport(mode)}
							/>
						</div>
					{:else}
						<p class="text-xs text-text-muted mt-0.5">Starting point</p>
					{/if}
				</div>
				<button
					class="text-text-muted hover:text-error transition-colors cursor-pointer p-1"
					onclick={onremove}
				>
					<X size={16} weight="bold" />
				</button>
			</div>

			<MediaUpload
				previewUrl={location.mediaPreviewUrl}
				mediaType={location.mediaType}
				onfile={onmedia}
			/>
		</div>
	</div>
</div>
