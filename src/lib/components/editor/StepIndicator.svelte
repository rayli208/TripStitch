<script lang="ts">
	let {
		steps,
		current
	}: {
		steps: string[];
		current: number;
	} = $props();
</script>

<div class="flex items-center justify-center gap-2 mb-8">
	{#each steps as step, i}
		<div class="flex items-center gap-2">
			<div
				class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors
					{i === current ? 'bg-accent text-white' : i < current ? 'bg-primary text-white' : 'bg-card text-text-muted'}"
			>
				{#if i < current}
					<svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
				{:else}
					{i + 1}
				{/if}
			</div>
			<span class="text-xs {i === current ? 'text-text-primary' : 'text-text-muted'}">{step}</span>
			{#if i < steps.length - 1}
				<div class="w-8 h-px {i < current ? 'bg-accent' : 'bg-border'}"></div>
			{/if}
		</div>
	{/each}
</div>
