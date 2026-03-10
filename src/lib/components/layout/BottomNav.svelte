<script lang="ts">
	import { page } from '$app/state';
	import { Plus, Path, User } from 'phosphor-svelte';

	const tabs = [
		{ href: '/create', label: 'Create', icon: 'create' },
		{ href: '/trips', label: 'My Trips', icon: 'trips' },
		{ href: '/profile', label: 'Profile', icon: 'profile' }
	] as const;

	const isActive = (href: string) => page.url.pathname === href;
</script>

<nav class="fixed bottom-0 inset-x-0 z-40 bg-page border-t-3 border-border" style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);">
	<div class="max-w-lg mx-auto flex items-center justify-around h-16">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="flex flex-col items-center justify-center gap-0.5 px-6 py-2 rounded-xl transition-colors {isActive(tab.href) ? 'text-accent font-bold' : 'text-text-muted hover:text-text-secondary'}"
			>
				{#if tab.icon === 'create'}
					<Plus size={22} weight="bold" />
				{:else if tab.icon === 'trips'}
					<Path size={22} weight="bold" />
				{:else}
					<User size={22} weight="bold" />
				{/if}
				<span class="text-[10px] font-medium leading-tight">{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
