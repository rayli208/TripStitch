<script lang="ts">
	let {
		size = 'md',
		label = ''
	}: {
		size?: 'sm' | 'md' | 'lg';
		label?: string;
	} = $props();

	const sizeClasses = {
		sm: 'w-5 h-5',
		md: 'w-8 h-8',
		lg: 'w-12 h-12'
	};
</script>

<div class="flex flex-col items-center gap-3">
	<div class="{sizeClasses[size]} animate-spin rounded-full border-2 border-border border-t-accent"></div>
	{#if label}
		<p class="text-sm text-text-muted">{label}</p>
	{/if}
</div>
