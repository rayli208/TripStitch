<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title = '',
		children
	}: {
		open?: boolean;
		title?: string;
		children: Snippet;
	} = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4"
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="absolute inset-0" onclick={() => (open = false)}></div>
		<div class="relative bg-card border border-border rounded-xl w-full max-w-md p-6">
			{#if title}
				<h2 class="text-lg font-semibold text-text-primary mb-4">{title}</h2>
			{/if}
			{@render children()}
		</div>
	</div>
{/if}
