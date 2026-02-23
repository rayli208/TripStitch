<script lang="ts">
	import type { TransportMode } from '$lib/types';

	let {
		mode = null,
		onchange
	}: {
		mode?: TransportMode | null;
		onchange: (mode: TransportMode) => void;
	} = $props();

	const options: { value: TransportMode; label: string; icon: string }[] = [
		{ value: 'walked', label: 'Walked', icon: '🚶' },
		{ value: 'drove', label: 'Drove', icon: '🚗' },
		{ value: 'biked', label: 'Biked', icon: '🚲' }
	];
</script>

<div class="flex gap-1">
	{#each options as opt}
		<button
			class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer
				{mode === opt.value ? 'bg-accent text-white' : 'bg-card text-text-muted hover:bg-border'}"
			onclick={() => onchange(opt.value)}
		>
			<span>{opt.icon}</span>
			<span>{opt.label}</span>
		</button>
	{/each}
</div>
