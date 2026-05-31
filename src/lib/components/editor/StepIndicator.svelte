<script lang="ts">
	import { Check, Clock } from 'phosphor-svelte';

	let {
		steps,
		current,
		estimatedDuration,
		onstep
	}: {
		steps: string[];
		current: number;
		estimatedDuration?: string;
		onstep?: (index: number) => void;
	} = $props();

	let container: HTMLDivElement;

	$effect(() => {
		if (!container) return;
		const activeEl = container.querySelector(`[data-step="${current}"]`);
		activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
	});

	function handleStep(i: number) {
		if (onstep && i <= current) onstep(i);
	}
</script>

<!-- Desktop: full breadcrumb with Est. duration -->
<div class="hidden md:flex items-center justify-between gap-4 mb-6">
	<div class="flex items-center gap-1 flex-wrap">
		{#each steps as step, i}
			<button
				type="button"
				class="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors {i <= current && onstep ? 'cursor-pointer hover:bg-card' : 'cursor-default'}"
				onclick={() => handleStep(i)}
				disabled={!onstep || i > current}
			>
				<span
					class="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors border-2
						{i === current
							? 'bg-accent text-white border-accent'
							: i < current
								? 'bg-success text-white border-success'
								: 'bg-card text-text-muted border-border'}"
				>
					{#if i < current}
						<Check size={12} weight="bold" />
					{:else}
						{i + 1}
					{/if}
				</span>
				<span class="text-xs font-semibold {i === current ? 'text-text-primary' : i < current ? 'text-text-secondary' : 'text-text-muted'}">{step}</span>
			</button>
			{#if i < steps.length - 1}
				<div class="w-4 h-px {i < current ? 'bg-success' : 'bg-border'}"></div>
			{/if}
		{/each}
	</div>
	{#if estimatedDuration}
		<div class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border-2 border-border text-xs font-medium text-text-secondary">
			<Clock size={12} weight="bold" />
			Est. {estimatedDuration}
		</div>
	{/if}
</div>

<!-- Mobile: scrollable indicator with all labels visible -->
<div class="md:hidden mb-5">
	<div class="flex items-center justify-between mb-2">
		<span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">
			Step {current + 1} of {steps.length}
		</span>
		{#if estimatedDuration}
			<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border-2 border-border text-[10px] font-medium text-text-secondary">
				<Clock size={10} weight="bold" />
				Est. {estimatedDuration}
			</span>
		{/if}
	</div>
	<div bind:this={container} class="overflow-x-auto scrollbar-hide -mx-4 px-4">
		<div class="flex items-center gap-1.5 w-max min-w-full">
			{#each steps as step, i}
				<button
					type="button"
					data-step={i}
					class="flex items-center gap-1.5 px-1.5 py-1 rounded-lg shrink-0 transition-colors {onstep && i <= current ? 'cursor-pointer' : 'cursor-default'}"
					onclick={() => handleStep(i)}
					disabled={!onstep || i > current}
				>
					<span
						class="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border-2 transition-colors shrink-0
							{i === current
								? 'bg-accent text-white border-accent'
								: i < current
									? 'bg-success text-white border-success'
									: 'bg-card text-text-muted border-border'}"
					>
						{#if i < current}
							<Check size={12} weight="bold" />
						{:else}
							{i + 1}
						{/if}
					</span>
					<span class="text-[11px] font-semibold whitespace-nowrap {i === current ? 'text-text-primary' : i < current ? 'text-text-secondary' : 'text-text-muted'}">{step}</span>
					{#if i < steps.length - 1}
						<div class="ml-1 w-3 h-px {i < current ? 'bg-success' : 'bg-border'}"></div>
					{/if}
				</button>
			{/each}
		</div>
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
