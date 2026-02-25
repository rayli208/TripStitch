<script lang="ts">
	import { page } from '$app/state';
	import type { UserProfile, SharedTrip } from '$lib/types';
	import profileState from '$lib/state/profile.svelte';
	import { fetchUserTrips, getShareUrl } from '$lib/services/shareService';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';
	import { parseAllVideoLinks } from '$lib/utils/videoEmbed';

	const username = (page.params as Record<string, string>).username!;

	let profile = $state<UserProfile | null>(null);
	let trips = $state<SharedTrip[]>([]);
	const mapTripData = $derived(trips.map(t => ({
		id: t.id,
		title: t.title,
		titleColor: t.titleColor,
		locations: t.locations.map(l => ({ lat: l.lat, lng: l.lng, name: l.name, label: l.label }))
	})));
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
			trips = await fetchUserTrips(uid);
		} catch (err) {
			console.error('[Profile] Failed to load public profile:', err);
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
	<div class="min-h-screen bg-page animate-pulse">
		<div class="px-6 sm:px-8 pt-12 pb-6 border-b border-border">
			<div class="max-w-2xl mx-auto">
				<div class="flex items-center gap-4 mb-4">
					<div class="w-16 h-16 rounded-full bg-border/50"></div>
					<div>
						<div class="h-6 w-36 bg-border/50 rounded mb-2"></div>
						<div class="h-4 w-24 bg-border/50 rounded"></div>
					</div>
				</div>
				<div class="h-4 w-64 bg-border/50 rounded mb-2"></div>
				<div class="h-3 w-20 bg-border/50 rounded mt-4"></div>
			</div>
		</div>
		<div class="px-6 sm:px-8 py-8">
			<div class="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each Array(4) as _}
					<div class="bg-card border border-border rounded-xl overflow-hidden">
						<div class="h-36 bg-border/50"></div>
						<div class="p-4">
							<div class="h-4 w-32 bg-border/50 rounded mb-2"></div>
							<div class="h-3 w-20 bg-border/50 rounded"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>
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
		<!-- Back button -->
		<div class="px-6 sm:px-8 pt-6">
			<div class="max-w-2xl mx-auto">
				<button
					class="text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1"
					onclick={() => history.back()}
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
					Back
				</button>
			</div>
		</div>

		<!-- Profile header -->
		<div class="px-6 sm:px-8 pt-6 pb-6 border-b border-border">
			<div class="max-w-2xl mx-auto">
				<div class="flex items-center gap-4 mb-4">
					{#if profile.avatarUrl}
						<img
							src={profile.avatarUrl}
							alt={profile.displayName}
							referrerpolicy="no-referrer"
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

				<p class="text-sm text-text-muted mt-4">{trips.length} {trips.length === 1 ? 'trip' : 'trips'}</p>
			</div>
		</div>

		<!-- Travel globe or map -->
		{#if trips.length > 0}
			<div class="px-6 sm:px-8 pt-8">
				<div class="max-w-2xl mx-auto">
					{#if (profile.mapDisplay ?? 'globe') === 'map'}
						<TravelMap
							trips={mapTripData}
							getTripHref={(id) => `/trip/${id}`}
							mapStyle={profile.globeStyle === 'custom' ? 'dark' : (profile.globeStyle ?? 'dark')}
						/>
					{:else}
						<TravelGlobe
							trips={mapTripData}
							getTripHref={(id) => `/trip/${id}`}
							globeStyle={profile.globeStyle ?? 'dark'}
							brandColors={profile.brandColors ?? []}
						/>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Trip grid -->
		<div class="px-6 sm:px-8 py-8">
			<div class="max-w-2xl mx-auto">
				{#if trips.length === 0}
					<p class="text-center text-text-muted py-12">No trips yet.</p>
				{:else}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{#each trips as trip}
							{@const videos = trip.videoLinks ? parseAllVideoLinks(trip.videoLinks) : []}
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
									{#if videos.length > 0}
										<div class="flex items-center gap-1.5 mt-2">
											{#each videos as v}
												{#if v.platform === 'youtube'}
													<svg class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
														<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
													</svg>
												{:else if v.platform === 'instagram'}
													<svg class="w-4 h-4 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
														<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
													</svg>
												{:else if v.platform === 'tiktok'}
													<svg class="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
														<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.65a8.35 8.35 0 0 0 4.76 1.49v-3.4a4.85 4.85 0 0 1-1-.05z"/>
													</svg>
												{/if}
											{/each}
											<span class="text-xs text-text-muted">Watch video</span>
										</div>
									{/if}
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
