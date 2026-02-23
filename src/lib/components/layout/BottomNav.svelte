<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{ href: '/create', label: 'Create', icon: 'create' },
		{ href: '/trips', label: 'My Trips', icon: 'trips' },
		{ href: '/profile', label: 'Profile', icon: 'profile' }
	] as const;

	const isActive = (href: string) => page.url.pathname === href;
</script>

<nav class="fixed bottom-0 inset-x-0 z-40 bg-page/80 backdrop-blur-sm border-t border-border pb-[env(safe-area-inset-bottom)]">
	<div class="max-w-lg mx-auto flex items-center justify-around h-14">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors {isActive(tab.href) ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}"
			>
				{#if tab.icon === 'create'}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				{:else if tab.icon === 'trips'}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
				{:else}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
				{/if}
				<span class="text-[10px] font-medium leading-tight">{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
