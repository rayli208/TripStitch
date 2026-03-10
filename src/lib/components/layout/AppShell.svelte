<script lang="ts">
	import type { Snippet } from 'svelte';
	import BottomNav from './BottomNav.svelte';
	import InstallPWA from '$lib/components/ui/InstallPWA.svelte';
	import { CaretLeft } from 'phosphor-svelte';

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
	<header class="sticky top-0 z-40 bg-page border-b-3 border-border">
		<div class="max-w-lg mx-auto flex items-center h-14 px-4 gap-3">
			{#if showBack}
				<button
					class="text-text-muted hover:text-text-primary transition-colors cursor-pointer flex-shrink-0 -ml-1 p-1"
					onclick={onback}
					aria-label="Go back"
				>
					<CaretLeft size={20} weight="bold" />
				</button>
			{:else if logoUrl}
				<img src={logoUrl} alt="Logo" class="w-7 h-7 rounded-md object-cover flex-shrink-0" />
			{/if}
			<h1 class="text-lg font-bold flex-1 truncate">{title}</h1>
			<div class="flex items-center gap-2 flex-shrink-0">
				<InstallPWA modal={false} />
				{#if actions}
					{@render actions()}
				{/if}
			</div>
		</div>
	</header>
	<main class="max-w-lg mx-auto px-4 py-6 {showBottomNav ? 'pb-28' : ''}">
		{@render children()}
	</main>
	{#if showBottomNav}
		<BottomNav />
	{/if}
</div>
<InstallPWA button={false} />
