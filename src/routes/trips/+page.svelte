<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import blogsState from '$lib/state/blogs.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import { getShareUrl, getProfileUrl } from '$lib/services/shareService';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import TripCard from '$lib/components/dashboard/TripCard.svelte';
	import BlogDashboardCard from '$lib/components/dashboard/BlogDashboardCard.svelte';
	import EmptyState from '$lib/components/dashboard/EmptyState.svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';
	import { Copy } from 'phosphor-svelte';

	let activeTab = $state<'trips' | 'blogs'>('trips');

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
</script>

<svelte:head><title>Dashboard | TripStitch</title></svelte:head>

<AppShell title="Dashboard" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<div class="space-y-4">
		{#if !profileState.loading && !profileState.hasProfile}
			<div class="bg-accent-light border-2 border-accent text-accent-hover text-sm rounded-lg px-4 py-3 flex items-center justify-between shadow-brutal-sm">
				<span>Set up your profile to share trips publicly.</span>
				<button
					class="text-accent hover:text-accent-hover font-medium text-sm cursor-pointer"
					onclick={() => goto('/profile')}
				>
					Set up
				</button>
			</div>
		{:else if profileState.hasProfile && profileState.profile}
			<div class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-2 min-w-0">
					<span class="text-xs text-text-muted shrink-0">Your profile:</span>
					<a
						href="/u/{profileState.profile.username}"
						class="text-xs text-accent hover:text-accent-hover truncate"
					>
						{getProfileUrl(profileState.profile.username)}
					</a>
					<button
						class="shrink-0 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
						title="Copy profile link"
						onclick={() => {
							navigator.clipboard.writeText(getProfileUrl(profileState.profile!.username));
							toast.success('Profile link copied!');
						}}
					>
						<Copy size={14} weight="bold" />
					</button>
				</div>
				<a
					href="/u/{profileState.profile.username}"
					class="text-sm text-accent hover:text-accent-hover font-medium shrink-0 transition-colors"
				>
					View Profile
				</a>
			</div>
		{/if}

		<!-- Tab toggle -->
		<div class="flex gap-2">
			<button
				class="px-4 py-2 rounded-lg text-sm font-bold border-2 border-border transition-all cursor-pointer {activeTab === 'trips' ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-card text-text-primary hover:bg-accent-light'}"
				onclick={() => activeTab = 'trips'}
			>
				Trips ({tripsState.count})
			</button>
			<button
				class="px-4 py-2 rounded-lg text-sm font-bold border-2 border-border transition-all cursor-pointer {activeTab === 'blogs' ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-card text-text-primary hover:bg-accent-light'}"
				onclick={() => activeTab = 'blogs'}
			>
				Blogs ({blogsState.count})
			</button>
		</div>

		{#if activeTab === 'blogs'}
			{#if blogsState.loading}
				<SkeletonCard count={2} />
			{:else if blogsState.count === 0}
				<div class="text-center py-12">
					<p class="text-text-muted font-medium mb-3">No blog posts yet</p>
					<a href="/create/blog" class="inline-block px-4 py-2 text-sm font-bold border-2 border-border rounded-lg bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all">
						Write your first blog
					</a>
				</div>
			{:else}
				<div class="space-y-3">
					{#each blogsState.blogs as blog (blog.id)}
						<BlogDashboardCard {blog} />
					{/each}
				</div>
			{/if}
		{:else if tripsState.loading}
			<SkeletonCard count={3} />
		{:else if tripsState.count === 0}
			<EmptyState onaction={() => goto('/create')} />
		{:else}
			{@const globeTrips = tripsState.trips
				.filter(t => t.locations.length > 0)
				.map(t => ({
					id: t.id,
					title: t.title,
					titleColor: t.titleColor,
					locations: t.locations.map(l => ({ lat: l.lat, lng: l.lng, name: l.name, label: l.label }))
				}))}
			{#if globeTrips.length > 0}
				<div bind:this={mapContainer}>
					{#if mapVisible}
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
					{/if}
				</div>
			{/if}
			<div class="space-y-3">
				{#each tripsState.trips as trip (trip.id)}
					<TripCard
						{trip}
						onedit={() => goto(`/trip/${trip.id}/edit`)}
						onlinks={() => goto(`/trip/${trip.id}/edit`)}
						onshare={() => {
							navigator.clipboard.writeText(getShareUrl(trip.id));
							toast.success('Link copied!');
						}}
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
	</div>
</AppShell>
