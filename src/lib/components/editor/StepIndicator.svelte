<script lang="ts">
	import { Check } from 'phosphor-svelte';

	let {
		steps,
		current
	}: {
		steps: string[];
		current: number;
	} = $props();

	let container: HTMLDivElement;

	$effect(() => {
		if (!container) return;
		const activeEl = container.querySelector(`[data-step="${current}"]`);
		activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
	});
</script>

<div bind:this={container} class="overflow-x-auto mb-8 scrollbar-hide">
	<div class="flex items-center justify-center gap-1.5 md:gap-2 w-max min-w-full px-4">
		{#each steps as step, i}
			<div data-step={i} class="flex items-center gap-1.5 md:gap-2 shrink-0">
				<div
					class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors
						{i === current ? 'bg-accent text-white' : i < current ? 'bg-primary text-white' : 'bg-card text-text-muted'}"
				>
					{#if i < current}
						<Check size={14} weight="bold" />
					{:else}
						{i + 1}
					{/if}
				</div>
				<span class="text-xs {i === current ? 'text-text-primary font-semibold' : 'text-text-muted'} hidden md:inline">{step}</span>
				{#if i === current}
					<span class="text-xs text-text-primary font-semibold md:hidden">{step}</span>
				{/if}
				{#if i < steps.length - 1}
					<div class="w-5 md:w-8 h-px {i < current ? 'bg-accent' : 'bg-border'}"></div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
