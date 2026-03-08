<script lang="ts">
	import type { TransportMode } from '$lib/types';
	import { PersonSimpleWalk, Car, Bicycle } from 'phosphor-svelte';

	let {
		mode = null,
		onchange
	}: {
		mode?: TransportMode | null;
		onchange: (mode: TransportMode) => void;
	} = $props();

	const options: { value: TransportMode; label: string }[] = [
		{ value: 'walked', label: 'Walked' },
		{ value: 'drove', label: 'Drove' },
		{ value: 'biked', label: 'Biked' }
	];
</script>

<div class="flex gap-1">
	{#each options as opt}
		<button
			class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer
				{mode === opt.value ? 'bg-accent text-white' : 'bg-card text-text-muted hover:bg-border'}"
			onclick={() => onchange(opt.value)}
		>
			<span>
				{#if opt.value === 'walked'}<PersonSimpleWalk size={16} weight="bold" />
				{:else if opt.value === 'drove'}<Car size={16} weight="bold" />
				{:else}<Bicycle size={16} weight="bold" />
				{/if}
			</span>
			<span>{opt.label}</span>
		</button>
	{/each}
</div>
