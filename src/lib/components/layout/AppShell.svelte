<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BottomNav from './BottomNav.svelte';
	import InstallPWA from '$lib/components/ui/InstallPWA.svelte';
	import { CaretLeft, Plus, SquaresFour, User, CheckCircle } from 'phosphor-svelte';

	let {
		title = 'TripStitch',
		subtitle,
		statusBadge,
		showBack = false,
		showBottomNav = false,
		onback,
		logoUrl,
		actions,
		desktopActions,
		children
	}: {
		title?: string;
		subtitle?: string;
		statusBadge?: string;
		showBack?: boolean;
		showBottomNav?: boolean;
		onback?: () => void;
		logoUrl?: string | null;
		actions?: Snippet;
		desktopActions?: Snippet;
		children: Snippet;
	} = $props();

	const desktopTabs = [
		{ href: '/create', label: 'Create', icon: 'create' as const },
		{ href: '/trips', label: 'Dashboard', icon: 'trips' as const },
		{ href: '/profile', label: 'Profile', icon: 'profile' as const }
	];

	const isActive = (href: string) =>
		href === '/create'
			? page.url.pathname.startsWith('/create')
			: page.url.pathname === href;

	function handleDesktopTabClick(e: MouseEvent, href: string) {
		if (href === '/create' && page.url.pathname.startsWith('/create')) {
			e.preventDefault();
			if (page.url.pathname === '/create') {
				window.dispatchEvent(new CustomEvent('tripstitch:create-reset'));
			} else {
				goto('/create');
			}
		}
	}
</script>

<div class="min-h-screen bg-page text-text-primary">
	<!-- Desktop top nav -->
	{#if showBottomNav}
		<header class="hidden md:block sticky top-0 z-40 bg-page border-b-3 border-border">
			<div class="max-w-7xl mx-auto flex items-center h-14 px-6 gap-5">
				<a href="/trips" class="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity">
					{#if logoUrl}
						<img src={logoUrl} alt="" class="h-7 w-7 rounded-md object-contain border-2 border-border bg-page p-0.5" />
					{:else}
						<img src="/favicon-192.png" alt="" class="h-6" />
					{/if}
					<span class="text-base font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
				</a>
				{#if subtitle}
					<span class="text-text-muted text-sm shrink-0">{subtitle}</span>
				{/if}
				<nav class="flex items-center gap-1 ml-2">
					{#each desktopTabs as tab}
						<a
							href={tab.href}
							onclick={(e) => handleDesktopTabClick(e, tab.href)}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {isActive(tab.href) ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary hover:bg-card'}"
						>
							{#if tab.icon === 'create'}
								<Plus size={16} weight="bold" />
							{:else if tab.icon === 'trips'}
								<SquaresFour size={16} weight="bold" />
							{:else}
								<User size={16} weight="bold" />
							{/if}
							<span>{tab.label}</span>
						</a>
					{/each}
				</nav>
				<div class="flex-1"></div>
				<div class="flex items-center gap-3">
					{#if statusBadge}
						<span class="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success border border-success/30 text-xs font-medium">
							<CheckCircle size={12} weight="fill" />
							{statusBadge}
						</span>
					{/if}
					<InstallPWA modal={false} />
					{#if desktopActions}
						{@render desktopActions()}
					{:else if actions}
						{@render actions()}
					{/if}
				</div>
			</div>
		</header>
	{/if}

	<!-- Mobile header (and desktop header for non-tabbed pages like edit/back-flows) -->
	<header class="sticky top-0 z-40 bg-page border-b-3 border-border {showBottomNav ? 'md:hidden' : ''}">
		<div class="max-w-lg mx-auto flex items-center h-14 px-4 gap-3">
			{#if showBack}
				<button
					class="text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0 -ml-1 p-1"
					onclick={onback}
					aria-label="Go back"
				>
					<CaretLeft size={20} weight="bold" />
				</button>
			{:else if logoUrl}
				<img src={logoUrl} alt="Logo" class="w-7 h-7 rounded-md object-cover shrink-0" />
			{/if}
			<h1 class="text-lg font-bold flex-1 truncate">{title}</h1>
			<div class="flex items-center gap-2 shrink-0">
				<InstallPWA modal={false} />
				{#if actions}
					{@render actions()}
				{/if}
			</div>
		</div>
	</header>

	<main class="max-w-lg md:max-w-7xl mx-auto px-4 md:px-6 py-6 {showBottomNav ? 'pb-28 md:pb-6' : ''}">
		{@render children()}
	</main>
	{#if showBottomNav}
		<BottomNav />
	{/if}
</div>
<InstallPWA button={false} />
