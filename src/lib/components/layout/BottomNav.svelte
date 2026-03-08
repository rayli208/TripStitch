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

<nav class="fixed bottom-0 inset-x-0 z-40 bg-page border-t-3 border-border pb-[env(safe-area-inset-bottom)]">
	<div class="max-w-lg mx-auto flex items-center justify-around h-14">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors {isActive(tab.href) ? 'text-accent font-bold' : 'text-text-muted hover:text-text-secondary'}"
			>
				{#if tab.icon === 'create'}
					<Plus size={20} weight="bold" />
				{:else if tab.icon === 'trips'}
					<Path size={20} weight="bold" />
				{:else}
					<User size={20} weight="bold" />
				{/if}
				<span class="text-[10px] font-medium leading-tight">{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
