<script lang="ts">
	import type { BlogRoute } from '$lib/types';

	let { route }: { route: BlogRoute } = $props();
</script>

<div class="border-2 border-border rounded-xl p-4 bg-card shadow-[3px_3px_0_var(--color-border)] my-4">
	<div class="text-xs font-bold text-accent uppercase tracking-wider mb-3">{route.title || 'Route'}</div>

	<div class="space-y-0">
		{#each route.stops as stop, i}
			<div class="flex gap-3">
				<div class="flex flex-col items-center flex-shrink-0">
					<div class="w-6 h-6 rounded-full bg-accent text-white font-bold text-[11px] flex items-center justify-center border-2 border-border">
						{i + 1}
					</div>
					{#if i < route.stops.length - 1}
						<div class="w-0.5 flex-1 bg-border min-h-[20px]"></div>
					{/if}
				</div>
				<div class="pb-3">
					<div class="font-bold text-sm text-text-primary">{stop.name || `Stop ${i + 1}`}</div>
					{#if stop.description}
						<div class="text-xs text-text-secondary mt-0.5">{stop.description}</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
