<script lang="ts">
	import { page } from '$app/state';
	import type { UserProfile, SharedTrip } from '$lib/types';
	import profileState from '$lib/state/profile.svelte';
	import { fetchUserTrips, getShareUrl } from '$lib/services/shareService';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';
	import { parseAllVideoLinks } from '$lib/utils/videoEmbed';
	import { CaretLeft, YoutubeLogo, InstagramLogo, TiktokLogo, Car, PersonSimpleHike, Buildings, SunHorizon, Backpack, ForkKnife, Mountains, Leaf, Bank, Camera } from 'phosphor-svelte';
	import type { Component } from 'svelte';

	const TAG_ICONS: Record<string, Component> = {
		'Road Trip': Car, 'Hiking': PersonSimpleHike, 'City Break': Buildings,
		'Beach': SunHorizon, 'Backpacking': Backpack, 'Foodie': ForkKnife,
		'Adventure': Mountains, 'Nature': Leaf, 'Cultural': Bank, 'Photography': Camera
	};

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
					<CaretLeft size={16} weight="bold" />
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
									{#if trip.tags && trip.tags.length > 0}
										<div class="flex flex-wrap gap-1 mt-1.5">
											{#each trip.tags.slice(0, 3) as tag}
												{@const TagIcon = TAG_ICONS[tag]}
												<span class="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
													{#if TagIcon}<TagIcon size={12} weight="bold" />{/if}
													{tag}
												</span>
											{/each}
											{#if trip.tags.length > 3}
												<span class="text-[10px] text-text-muted px-1 py-0.5">+{trip.tags.length - 3}</span>
											{/if}
										</div>
									{/if}
									{#if videos.length > 0}
										<div class="flex items-center gap-1.5 mt-2">
											{#each videos as v}
												{#if v.platform === 'youtube'}
													<YoutubeLogo size={16} weight="fill" class="text-red-500" />
												{:else if v.platform === 'instagram'}
													<InstagramLogo size={16} weight="fill" class="text-pink-500" />
												{:else if v.platform === 'tiktok'}
													<TiktokLogo size={16} weight="fill" />
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
