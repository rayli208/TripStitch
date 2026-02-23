<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label = '',
		placeholder = '',
		value = $bindable(''),
		type = 'text',
		...rest
	}: {
		label?: string;
		placeholder?: string;
		value?: string;
		type?: string;
	} & Omit<HTMLInputAttributes, 'value' | 'placeholder' | 'type'> = $props();
</script>

<label class="block">
	{#if label}
		<span class="block text-sm font-medium text-text-secondary mb-1">{label}</span>
	{/if}
	<input
		{type}
		{placeholder}
		bind:value
		{...rest}
		class="w-full rounded-lg bg-card border border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
	/>
</label>
