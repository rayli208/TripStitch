<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import TripCard from '$lib/components/dashboard/TripCard.svelte';
	import EmptyState from '$lib/components/dashboard/EmptyState.svelte';
	import SkeletonCard from '$lib/components/ui/SkeletonCard.svelte';

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
		{/if}

		{#if tripsState.loading}
			<SkeletonCard count={3} />
		{:else if tripsState.count === 0}
			<EmptyState onaction={() => goto('/create')} />
		{:else}
			<div class="space-y-3">
				{#each tripsState.trips as trip (trip.id)}
					<TripCard
						{trip}
						onedit={() => goto(`/trip/${trip.id}/edit`)}
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
