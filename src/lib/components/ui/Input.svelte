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
		<span class="block text-sm font-bold text-text-primary mb-1">{label}</span>
	{/if}
	<input
		{type}
		{placeholder}
		bind:value
		{...rest}
		class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
	/>
</label>
