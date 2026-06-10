<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import blogsState from '$lib/state/blogs.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import { getShareUrl } from '$lib/services/shareService';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import TripCard from '$lib/components/dashboard/TripCard.svelte';
	import BlogDashboardCard from '$lib/components/dashboard/BlogDashboardCard.svelte';
	import EmptyState from '$lib/components/dashboard/EmptyState.svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';
	import { MagnifyingGlass, Plus, GlobeHemisphereWest, Crown, ShareNetwork, CaretDown } from 'phosphor-svelte';
	import type { Trip } from '$lib/types';

	type TripFilter = 'all' | 'published' | 'drafts' | 'blogs';
	type SortKey = 'recent' | 'oldest' | 'title';

	let activeFilter = $state<TripFilter>('all');
	let searchQuery = $state('');
	let sortBy = $state<SortKey>('recent');

	let mapContainer: HTMLDivElement | undefined = $state();
	let mapVisible = $state(false);

	$effect(() => {
		if (!mapContainer) return;
		const observer = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting) { mapVisible = true; observer.disconnect(); } },
			{ rootMargin: '200px' }
		);
		observer.observe(mapContainer);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		tripsState.subscribe();
		blogsState.subscribe();
		profileState.load();
		return () => {
			tripsState.unsubscribe();
			blogsState.unsubscribe();
		};
	});

	// Published = made it through every step (not a draft) AND set to public. Everything else —
	// unfinished drafts, or finished-but-unlisted/private trips — lives under "Drafts".
	const isPublishedTrip = (t: Trip) => t.visibility === 'public' && !t.draft;
	const publishedTripCount = $derived(tripsState.trips.filter(isPublishedTrip).length);
	const draftTripCount = $derived(tripsState.trips.filter(t => !isPublishedTrip(t)).length);
	const totalCountries = $derived.by(() => {
		const countries = new Set<string>();
		for (const t of tripsState.trips) {
			for (const c of t.countries ?? []) countries.add(c);
		}
		return countries.size;
	});
	const currentYear = new Date().getFullYear();

	// Filter + sort
	const filteredTrips = $derived.by(() => {
		let trips = [...tripsState.trips];
		if (activeFilter === 'published') trips = trips.filter(isPublishedTrip);
		else if (activeFilter === 'drafts') trips = trips.filter(t => !isPublishedTrip(t));
		const q = searchQuery.trim().toLowerCase();
		if (q) trips = trips.filter(t => t.title.toLowerCase().includes(q));
		if (sortBy === 'recent') trips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		else if (sortBy === 'oldest') trips.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		else trips.sort((a, b) => a.title.localeCompare(b.title));
		return trips;
	});

	const filteredBlogs = $derived.by(() => {
		let blogs = [...blogsState.blogs];
		const q = searchQuery.trim().toLowerCase();
		if (q) blogs = blogs.filter(b => b.title.toLowerCase().includes(q));
		if (sortBy === 'recent') blogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		else if (sortBy === 'oldest') blogs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		else blogs.sort((a, b) => a.title.localeCompare(b.title));
		return blogs;
	});

	const showingBlogs = $derived(activeFilter === 'blogs');

	const filters: { id: TripFilter; label: string; count: () => number }[] = [
		{ id: 'all', label: 'All Trips', count: () => tripsState.count },
		{ id: 'published', label: 'Published', count: () => publishedTripCount },
		{ id: 'drafts', label: 'Drafts', count: () => draftTripCount },
		{ id: 'blogs', label: 'Blog Posts', count: () => blogsState.count }
	];

	function handleNewTrip() {
		goto('/create');
	}

	function handleShareProfile() {
		if (!profileState.profile?.username) return;
		navigator.clipboard.writeText(`${window.location.origin}/u/${profileState.profile.username}`);
		toast.success('Profile link copied!');
	}
</script>

<svelte:head><title>Dashboard | TripStitch</title></svelte:head>

<AppShell title="Dashboard" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<div class="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
		<!-- ═══════════ LEFT SIDEBAR (desktop only) ═══════════ -->
		<aside class="hidden md:block">
			<nav class="sticky top-20 space-y-1">
				{#each filters as f}
					<button
						type="button"
						class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer border-2 {activeFilter === f.id ? 'bg-accent-light border-accent text-text-primary shadow-[2px_2px_0_var(--color-border)]' : 'border-transparent text-text-muted hover:text-text-primary hover:bg-card'}"
						onclick={() => activeFilter = f.id}
					>
						<span class="flex items-center gap-2">
							{#if activeFilter === f.id}
								<span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
							{/if}
							{f.label}
						</span>
						<span class="text-xs font-mono {activeFilter === f.id ? 'text-accent' : 'text-text-muted'}">{f.count()}</span>
					</button>
				{/each}

				<!-- Upgrade card (Pro upsell) -->
				{#if !profileState.isPro}
					<div class="mt-6 rounded-xl border-2 border-border bg-warning-light p-4 shadow-[2px_2px_0_var(--color-border)]">
						<div class="flex items-center gap-1.5 mb-2">
							<Crown size={14} weight="fill" class="text-accent" />
							<p class="text-xs font-extrabold uppercase tracking-wider text-accent">Go Pro</p>
						</div>
						<p class="text-sm font-bold text-text-primary leading-tight mb-1">Unlimited stops, no watermark</p>
						<p class="text-xs text-text-secondary mb-3">$5.99/mo · cloud playback · custom branding</p>
						<button
							type="button"
							class="w-full py-2 text-xs font-extrabold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
							onclick={() => goto('/pricing')}
						>
							Upgrade
						</button>
					</div>
				{/if}
			</nav>
		</aside>

		<!-- ═══════════ MAIN CONTENT ═══════════ -->
		<div class="space-y-5">
			<!-- Profile setup banner -->
			{#if !profileState.loading && !profileState.hasProfile}
				<div class="bg-accent-light border-2 border-accent text-accent-hover text-sm rounded-xl px-4 py-3 flex items-center justify-between shadow-[2px_2px_0_var(--color-border)]">
					<span class="font-medium">Set up your profile to share trips publicly.</span>
					<button
						class="text-accent hover:text-accent-hover font-bold text-sm cursor-pointer"
						onclick={() => goto('/profile')}
					>
						Set up
					</button>
				</div>
			{/if}

			<!-- ═══ Hero stats card with globe ═══ -->
			{#if tripsState.count > 0 || profileState.hasProfile}
				{@const globeTrips = tripsState.trips
					.filter(t => t.locations.length > 0)
					.map(t => ({
						id: t.id,
						title: t.title,
						titleColor: t.titleColor,
						locations: t.locations.map(l => ({ lat: l.lat, lng: l.lng, name: l.name, label: l.label }))
					}))}
				<div bind:this={mapContainer} class="relative rounded-2xl overflow-hidden border-2 border-border bg-overlay shadow-[4px_4px_0_var(--color-border)]">
					<div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)] items-center">
						<div class="p-5 sm:p-6 md:p-7 text-white">
							<p class="text-[11px] font-extrabold uppercase tracking-wider text-white/60">Your map · {currentYear}</p>
							<h2 class="text-2xl sm:text-3xl font-extrabold mt-1 leading-tight">
								{tripsState.count} trip{tripsState.count === 1 ? '' : 's'} across {totalCountries} countr{totalCountries === 1 ? 'y' : 'ies'}{totalCountries > 0 ? ' this year' : ''}
							</h2>
							{#if profileState.profile?.username}
								<div class="flex flex-wrap items-center gap-2 mt-4">
									<a
										href="/u/{profileState.profile.username}"
										class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border-2 border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-colors"
									>
										<GlobeHemisphereWest size={12} weight="bold" />
										Open globe
									</a>
									<button
										type="button"
										class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border-2 border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-colors cursor-pointer"
										onclick={handleShareProfile}
									>
										<ShareNetwork size={12} weight="bold" />
										Share profile
									</button>
								</div>
							{/if}
						</div>
						<div class="h-48 md:h-56 relative">
							{#if mapVisible && globeTrips.length > 0}
								{#if (profileState.profile?.mapDisplay ?? 'globe') === 'map'}
									<TravelMap
										trips={globeTrips}
										getTripHref={(id) => `/trip/${id}`}
										mapStyle={profileState.profile?.globeStyle === 'custom' ? 'dark' : (profileState.profile?.globeStyle ?? 'dark')}
									/>
								{:else}
									<TravelGlobe
										trips={globeTrips}
										getTripHref={(id) => `/trip/${id}`}
										globeStyle={profileState.profile?.globeStyle ?? 'dark'}
										brandColors={profileState.profile?.brandColors ?? []}
									/>
								{/if}
							{:else}
								<div class="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
									<GlobeHemisphereWest size={48} weight="thin" />
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- ═══ Mobile filter chips (desktop uses sidebar) ═══ -->
			<div class="md:hidden flex items-center gap-2 overflow-x-auto -mx-4 px-4 scrollbar-hide">
				{#each filters as f}
					<button
						type="button"
						class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 border-border transition-colors cursor-pointer {activeFilter === f.id ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-card text-text-secondary'}"
						onclick={() => activeFilter = f.id}
					>
						{f.label}
						<span class="text-[10px] {activeFilter === f.id ? 'text-white/80' : 'text-text-muted'}">{f.count()}</span>
					</button>
				{/each}
			</div>

			<!-- ═══ Toolbar: search + New Trip + sort ═══ -->
			<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
				<div class="relative flex-1 min-w-0">
					<MagnifyingGlass size={14} weight="bold" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
					<input
						type="text"
						placeholder={showingBlogs ? 'Search blogs…' : 'Search trips…'}
						bind:value={searchQuery}
						class="w-full pl-9 pr-3 py-2 rounded-lg bg-card border-2 border-border text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent transition-colors"
					/>
				</div>
				<div class="flex items-center gap-2">
					<div class="relative">
						<select
							bind:value={sortBy}
							class="appearance-none pl-3 pr-8 py-2 rounded-lg bg-card border-2 border-border text-sm font-medium shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent cursor-pointer"
						>
							<option value="recent">Most recent</option>
							<option value="oldest">Oldest</option>
							<option value="title">Title (A–Z)</option>
						</select>
						<CaretDown size={12} weight="bold" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
					</div>
					<button
						type="button"
						class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-border bg-accent text-white text-sm font-bold shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
						onclick={handleNewTrip}
					>
						<Plus size={14} weight="bold" />
						<span class="hidden sm:inline">New trip</span>
						<span class="sm:hidden">New</span>
					</button>
				</div>
			</div>

			<!-- ═══ Content list ═══ -->
			{#if showingBlogs}
				{#if blogsState.loading}
					<SkeletonCard count={2} />
				{:else if filteredBlogs.length === 0}
					<div class="text-center py-12 rounded-xl border-2 border-dashed border-border bg-card">
						<p class="text-text-muted font-medium mb-3">{searchQuery ? 'No blogs match your search.' : 'No blog posts yet.'}</p>
						<a href="/create/blog" class="inline-block px-4 py-2 text-sm font-bold border-2 border-border rounded-lg bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all">
							Write your first blog
						</a>
					</div>
				{:else}
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each filteredBlogs as blog (blog.id)}
							<BlogDashboardCard {blog} />
						{/each}
					</div>
				{/if}
			{:else if tripsState.loading}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					<SkeletonCard count={3} />
				</div>
			{:else if filteredTrips.length === 0}
				{#if searchQuery || activeFilter !== 'all'}
					<div class="text-center py-12 rounded-xl border-2 border-dashed border-border bg-card">
						<p class="text-text-muted font-medium mb-3">No trips match your search.</p>
						<button
							class="text-sm text-accent hover:underline cursor-pointer"
							onclick={() => { searchQuery = ''; activeFilter = 'all'; }}
						>
							Clear filters
						</button>
					</div>
				{:else}
					<EmptyState onaction={() => goto('/create')} />
				{/if}
			{:else}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each filteredTrips as trip (trip.id)}
						<TripCard
							{trip}
							onview={() => goto(`/trip/${trip.id}`)}
							onedit={() => goto(`/trip/${trip.id}/edit`)}
							onlinks={() => goto(`/trip/${trip.id}/links`)}
							onshare={() => {
								navigator.clipboard.writeText(getShareUrl(trip.id));
								toast.success('Link copied!');
							}}
							onwriteblog={() => goto(`/create/blog?tripId=${trip.id}`)}
							ondelete={async () => {
								try {
									await tripsState.deleteTrip(trip.id);
									toast.success('Trip deleted');
								} catch {
									toast.error('Failed to delete trip');
								}
							}}
						/>
					{/each}
				</div>
			{/if}

			<!-- Mobile-only Pro upsell (sidebar shows it on desktop) -->
			{#if !profileState.isPro}
				<div class="md:hidden rounded-xl border-2 border-border bg-warning-light p-4 shadow-[2px_2px_0_var(--color-border)] flex items-center gap-3">
					<Crown size={20} weight="fill" class="text-accent shrink-0" />
					<div class="flex-1 min-w-0">
						<p class="text-sm font-bold text-text-primary leading-tight">Unlimited stops, no watermark</p>
						<p class="text-[11px] text-text-secondary mt-0.5">$5.99/mo · cloud playback · custom branding</p>
					</div>
					<button
						type="button"
						class="shrink-0 px-3 py-1.5 text-xs font-extrabold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] cursor-pointer"
						onclick={() => goto('/pricing')}
					>
						Upgrade
					</button>
				</div>
			{/if}
		</div>
	</div>
</AppShell>

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
