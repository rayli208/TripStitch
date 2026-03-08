<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { MapTrifold } from 'phosphor-svelte';

	let {
		message = 'No trips yet',
		actionLabel = 'Create Trip',
		onaction
	}: {
		message?: string;
		actionLabel?: string;
		onaction: () => void;
	} = $props();
</script>

<div class="text-center py-16">
	<div class="mb-4 opacity-40"><MapTrifold size={40} weight="bold" /></div>
	<p class="text-text-muted mb-6">{message}</p>
	<Button variant="primary" onclick={onaction}>
		{actionLabel}
	</Button>
</div>
