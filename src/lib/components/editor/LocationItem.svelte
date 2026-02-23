<script lang="ts">
	import type { Location, TransportMode } from '$lib/types';
	import TransportPicker from './TransportPicker.svelte';
	import MediaUpload from './MediaUpload.svelte';

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
				<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
				</svg>
			</button>
			<span class="text-xs text-text-muted font-mono">{index + 1}</span>
			<button
				class="text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
				disabled={isLast}
				onclick={onmovedown}
			>
				<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
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
					<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
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
