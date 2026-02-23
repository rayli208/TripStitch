<script lang="ts">
	import type { Snippet } from 'svelte';
	import BottomNav from './BottomNav.svelte';

	let {
		title = 'TripStitch',
		showBack = false,
		showBottomNav = false,
		onback,
		logoUrl,
		actions,
		children
	}: {
		title?: string;
		showBack?: boolean;
		showBottomNav?: boolean;
		onback?: () => void;
		logoUrl?: string | null;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="min-h-screen bg-page text-text-primary">
	<header class="sticky top-0 z-40 bg-page/80 backdrop-blur-sm border-b border-border">
		<div class="max-w-lg mx-auto flex items-center h-14 px-4 gap-3">
			{#if showBack}
				<button
					class="text-text-muted hover:text-text-primary transition-colors cursor-pointer flex-shrink-0 -ml-1 p-1"
					onclick={onback}
					aria-label="Go back"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
				</button>
			{:else if logoUrl}
				<img src={logoUrl} alt="Logo" class="w-7 h-7 rounded-md object-cover flex-shrink-0" />
			{/if}
			<h1 class="text-lg font-semibold flex-1 truncate">{title}</h1>
			<div class="flex items-center gap-2 flex-shrink-0">
				{#if actions}
					{@render actions()}
				{/if}
			</div>
		</div>
	</header>
	<main class="max-w-lg mx-auto px-4 py-6 {showBottomNav ? 'pb-20' : ''}">
		{@render children()}
	</main>
	{#if showBottomNav}
		<BottomNav />
	{/if}
</div>
