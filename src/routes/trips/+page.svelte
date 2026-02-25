<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import { getShareUrl, getProfileUrl } from '$lib/services/shareService';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import TripCard from '$lib/components/dashboard/TripCard.svelte';
	import EmptyState from '$lib/components/dashboard/EmptyState.svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		tripsState.subscribe();
		profileState.load();
		return () => tripsState.unsubscribe();
	});
</script>

<AppShell title="My Trips" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<div class="space-y-4">
		{#if !profileState.loading && !profileState.hasProfile}
			<div class="bg-accent-light border border-accent text-accent-hover text-sm rounded-lg px-4 py-3 flex items-center justify-between">
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
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
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

		{#if tripsState.loading}
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
			<div class="space-y-3">
				{#each tripsState.trips as trip (trip.id)}
					<TripCard
						{trip}
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
