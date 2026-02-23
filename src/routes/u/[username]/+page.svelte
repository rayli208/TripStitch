<script lang="ts">
	import { page } from '$app/state';
	import type { UserProfile, SharedTrip } from '$lib/types';
	import profileState from '$lib/state/profile.svelte';
	import { fetchUserSharedTrips, getShareUrl } from '$lib/services/shareService';

	const username = (page.params as Record<string, string>).username!;

	let profile = $state<UserProfile | null>(null);
	let trips = $state<SharedTrip[]>([]);
	let loading = $state(true);
	let notFound = $state(false);

	$effect(() => {
		loadProfile();
	});

	async function loadProfile() {
		loading = true;
		try {
			const uid = await profileState.resolveUsername(username);
			if (!uid) {
				notFound = true;
				loading = false;
				return;
			}
			profile = await profileState.loadPublicProfile(uid);
			if (!profile) {
				notFound = true;
				loading = false;
				return;
			}
			trips = await fetchUserSharedTrips(uid);
		} catch {
			notFound = true;
		}
		loading = false;
	}

	const SOCIAL_ICONS: Record<string, { label: string; prefix: string }> = {
		instagram: { label: 'Instagram', prefix: 'https://instagram.com/' },
		tiktok: { label: 'TikTok', prefix: 'https://tiktok.com/@' },
		youtube: { label: 'YouTube', prefix: '' },
		website: { label: 'Website', prefix: '' }
	};

	function socialUrl(key: string, value: string): string {
		if (value.startsWith('http')) return value;
		const info = SOCIAL_ICONS[key];
		if (info?.prefix && !value.startsWith('http')) {
			return info.prefix + value.replace(/^@/, '');
		}
		return value;
	}
</script>

<svelte:head>
	{#if profile}
		<title>{profile.displayName} (@{profile.username}) - TripStitch</title>
	{/if}
</svelte:head>

{#if loading}
	<div class="min-h-screen bg-page flex items-center justify-center">
		<div class="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin"></div>
	</div>
{:else if notFound}
	<div class="min-h-screen bg-page flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-text-primary mb-2">User Not Found</h1>
			<p class="text-text-muted mb-6">No user with that username exists.</p>
			<a href="/" class="text-accent hover:text-accent-hover">Go to TripStitch</a>
		</div>
	</div>
{:else if profile}
	<div class="min-h-screen bg-page">
		<!-- Profile header -->
		<div class="px-6 sm:px-8 pt-12 pb-6 border-b border-border">
			<div class="max-w-2xl mx-auto">
				<div class="flex items-center gap-4 mb-4">
					{#if profile.avatarUrl}
						<img
							src={profile.avatarUrl}
							alt={profile.displayName}
							class="w-16 h-16 rounded-full border-2 border-border"
						/>
					{/if}
					<div>
						<h1 class="text-2xl font-bold text-text-primary">{profile.displayName}</h1>
						<p class="text-text-muted">@{profile.username}</p>
					</div>
					{#if profile.logoUrl}
						<img
							src={profile.logoUrl}
							alt="Logo"
							class="w-10 h-10 rounded-lg object-contain ml-auto"
						/>
					{/if}
				</div>

				{#if profile.bio}
					<p class="text-text-secondary text-sm mb-4">{profile.bio}</p>
				{/if}

				<!-- Social links -->
				{#each Object.entries(profile.socialLinks).filter(([, v]) => v) as [key, value]}
					{#if key}
						<a
							href={socialUrl(key, value ?? '')}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-block text-sm text-accent hover:text-accent-hover transition-colors mr-3"
						>
							{SOCIAL_ICONS[key]?.label ?? key}
						</a>
					{/if}
				{/each}

				<p class="text-sm text-text-muted mt-4">{trips.length} shared {trips.length === 1 ? 'trip' : 'trips'}</p>
			</div>
		</div>

		<!-- Trip grid -->
		<div class="px-6 sm:px-8 py-8">
			<div class="max-w-2xl mx-auto">
				{#if trips.length === 0}
					<p class="text-center text-text-muted py-12">No shared trips yet.</p>
				{:else}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{#each trips as trip}
							<a
								href={getShareUrl(trip.id)}
								class="block bg-card border border-border rounded-xl overflow-hidden hover:border-primary-light transition-colors"
							>
								{#if trip.coverImageUrl}
									<div class="h-36 overflow-hidden">
										<img
											src={trip.coverImageUrl}
											alt={trip.title}
											class="w-full h-full object-cover"
										/>
									</div>
								{:else}
									<div class="h-36 bg-gradient-to-br from-border to-card flex items-center justify-center">
										<span class="text-2xl font-bold opacity-30" style="color: {trip.titleColor}">
											{trip.title}
										</span>
									</div>
								{/if}
								<div class="p-4">
									<h3 class="font-semibold text-text-primary text-sm">{trip.title}</h3>
									<p class="text-xs text-text-muted mt-1">
										{trip.stats.stops} stops &middot;
										{trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi
									</p>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="px-6 sm:px-8 py-8 border-t border-border text-center">
			<p class="text-sm text-text-muted">
				Made with <a href="/" class="text-accent hover:text-accent-hover font-medium">TripStitch</a>
			</p>
		</div>
	</div>
{/if}
