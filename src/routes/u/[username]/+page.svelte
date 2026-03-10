<script lang="ts">
	import { page } from '$app/state';
	import type { UserProfile, SharedTrip } from '$lib/types';
	import profileState from '$lib/state/profile.svelte';
	import { fetchUserTrips, getShareUrl } from '$lib/services/shareService';
	import TravelGlobe from '$lib/components/TravelGlobe.svelte';
	import TravelMap from '$lib/components/TravelMap.svelte';
	import { parseAllVideoLinks } from '$lib/utils/videoEmbed';
	import authState from '$lib/state/auth.svelte';
	import { CaretLeft, YoutubeLogo, InstagramLogo, TiktokLogo, Car, PersonSimpleHike, Buildings, SunHorizon, Backpack, ForkKnife, Mountains, Leaf, Bank, Camera, Globe, MapPin, ArrowRight, Path } from 'phosphor-svelte';
	import type { Component } from 'svelte';

	const TAG_ICONS: Record<string, Component> = {
		'Road Trip': Car, 'Hiking': PersonSimpleHike, 'City Break': Buildings,
		'Beach': SunHorizon, 'Backpacking': Backpack, 'Foodie': ForkKnife,
		'Adventure': Mountains, 'Nature': Leaf, 'Cultural': Bank, 'Photography': Camera
	};

	const SOCIAL_ICON_COMPONENTS: Record<string, Component> = {
		instagram: InstagramLogo,
		youtube: YoutubeLogo,
		tiktok: TiktokLogo
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

	let ready = $state(false);
	$effect(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});

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

	const totalStops = $derived(trips.reduce((sum, t) => sum + t.stats.stops, 0));
	const totalMiles = $derived(Math.round(trips.reduce((sum, t) => sum + t.stats.miles, 0)));
	const totalCountries = $derived([...new Set(trips.flatMap(t => t.countries ?? []))].length);
	const memberSince = $derived(profile?.createdAt ? new Date(profile.createdAt).getFullYear() : null);
</script>

<svelte:head>
	{#if profile}
		<title>{profile.displayName} (@{profile.username}) - TripStitch</title>
	{/if}
</svelte:head>

<style>
	@keyframes fade-up {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.animate-fade-up { animation: fade-up 0.6s ease-out forwards; }
	.delay-100 { animation-delay: 0.1s; }
	.delay-200 { animation-delay: 0.2s; }
	.delay-300 { animation-delay: 0.3s; }
	.delay-400 { animation-delay: 0.4s; }
	.fill-both { animation-fill-mode: both; }

	/* Grain overlay */
	.grain::after {
		content: '';
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
		opacity: 0.04;
		filter: url(#grain-filter-profile);
		width: 100%;
		height: 100%;
	}

	/* Trip card hover */
	.trip-card {
		transition: transform 0.3s ease, box-shadow 0.3s ease;
	}
	.trip-card:hover {
		transform: translateY(-4px);
		box-shadow: 6px 6px 0 var(--color-accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-fade-up { animation: none; opacity: 1; transform: none; }
		.trip-card:hover { transform: none; }
	}
</style>

{#if loading}
	<div class="min-h-screen bg-page animate-pulse">
		<div class="px-6 sm:px-8 pt-12 pb-6">
			<div class="max-w-2xl mx-auto">
				<div class="bg-card border-2 border-border rounded-2xl p-6 shadow-brutal">
					<div class="flex items-center gap-4 mb-4">
						<div class="w-20 h-20 rounded-full bg-border/50"></div>
						<div>
							<div class="h-6 w-36 bg-border/50 rounded mb-2"></div>
							<div class="h-4 w-24 bg-border/50 rounded"></div>
						</div>
					</div>
					<div class="h-4 w-64 bg-border/50 rounded mb-2"></div>
					<div class="flex gap-2 mt-4">
						<div class="h-8 w-24 bg-border/50 rounded-lg"></div>
						<div class="h-8 w-24 bg-border/50 rounded-lg"></div>
					</div>
				</div>
			</div>
		</div>
		<div class="px-6 sm:px-8 py-8">
			<div class="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5">
				{#each Array(4) as _}
					<div class="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-brutal">
						<div class="h-40 bg-border/50"></div>
						<div class="p-5">
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
		<div class="text-center bg-card border-2 border-border rounded-2xl shadow-brutal-lg p-10">
			<h1 class="text-2xl font-bold text-text-primary mb-2">User Not Found</h1>
			<p class="text-text-muted mb-6">No user with that username exists.</p>
			<a
				href="/"
				class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-white font-bold text-sm border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
			>
				Go to TripStitch
				<ArrowRight size={16} weight="bold" />
			</a>
		</div>
	</div>
{:else if profile}
	<div class="grain min-h-screen bg-page">
		<!-- Grain filter -->
		<svg class="hidden">
			<filter id="grain-filter-profile">
				<feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
			</filter>
		</svg>

		<!-- Top bar -->
		<div class="border-b-3 border-border bg-page">
			<div class="max-w-3xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
				<button
					class="text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1 font-medium"
					onclick={() => history.back()}
				>
					<CaretLeft size={16} weight="bold" />
					Back
				</button>
				<a href="/" class="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
					<img src="/favicon-192.png" alt="" class="h-5" />
					<span class="text-sm font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
				</a>
			</div>
		</div>

		<!-- Profile header card -->
		<div class="max-w-3xl mx-auto px-6 sm:px-8 pt-8 {ready ? 'animate-fade-up fill-both' : 'opacity-0'}">
			<div class="bg-card border-2 border-border rounded-2xl shadow-brutal-lg overflow-hidden">
				<div class="p-5 sm:p-6">
					<!-- Top row: avatar + name -->
					<div class="flex items-center gap-4">
						{#if profile.avatarUrl}
							<img
								src={profile.avatarUrl}
								alt={profile.displayName}
								referrerpolicy="no-referrer"
								class="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 border-border object-cover shadow-brutal-sm shrink-0"
							/>
						{:else}
							<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 border-border bg-accent-light flex items-center justify-center text-accent font-bold text-xl sm:text-2xl shadow-brutal-sm shrink-0">
								{profile.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
							</div>
						{/if}
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<h1 class="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight">{profile.displayName}</h1>
								{#if profile.logoUrl}
									<img src={profile.logoUrl} alt="Logo" class="w-7 h-7 rounded-md object-contain border border-border bg-page p-0.5 shrink-0" />
								{/if}
							</div>
							<p class="text-sm text-text-muted font-medium">@{profile.username}{#if memberSince} &middot; Since {memberSince}{/if}</p>
						</div>
					</div>

					<!-- Bio -->
					{#if profile.bio}
						<p class="text-sm text-text-secondary mt-3 leading-relaxed">{profile.bio}</p>
					{/if}

					<!-- Social links -->
					{#if Object.values(profile.socialLinks).some(v => v)}
						<div class="flex flex-wrap gap-2 mt-3">
							{#each Object.entries(profile.socialLinks).filter(([, v]) => v) as [key, value]}
								{@const SocialIcon = SOCIAL_ICON_COMPONENTS[key]}
								<a
									href={socialUrl(key, value ?? '')}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-primary bg-page hover:text-accent hover:border-accent transition-colors"
								>
									{#if SocialIcon}
										<SocialIcon size={14} weight="bold" class="text-accent" />
									{:else}
										<Globe size={14} weight="bold" class="text-accent" />
									{/if}
									{SOCIAL_ICONS[key]?.label ?? key}
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Stats strip -->
				{#if trips.length > 0}
					<div class="border-t border-border bg-page/50 px-4 sm:px-6 py-3 grid grid-cols-3 sm:flex sm:justify-around text-center gap-y-2">
						<div>
							<p class="text-base font-extrabold text-text-primary">{trips.length}</p>
							<p class="text-[10px] text-text-muted font-medium uppercase tracking-wide">{trips.length === 1 ? 'Trip' : 'Trips'}</p>
						</div>
						<div>
							<p class="text-base font-extrabold text-text-primary">{totalStops}</p>
							<p class="text-[10px] text-text-muted font-medium uppercase tracking-wide">Stops</p>
						</div>
						{#if totalMiles > 0}
							<div>
								<p class="text-base font-extrabold text-text-primary">{totalMiles.toLocaleString()}</p>
								<p class="text-[10px] text-text-muted font-medium uppercase tracking-wide">Miles</p>
							</div>
						{/if}
						{#if totalCountries > 0}
							<div>
								<p class="text-base font-extrabold text-text-primary">{totalCountries}</p>
								<p class="text-[10px] text-text-muted font-medium uppercase tracking-wide">{totalCountries === 1 ? 'Country' : 'Countries'}</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Travel globe or map -->
		{#if trips.length > 0}
			<div class="max-w-3xl mx-auto px-6 sm:px-8 pt-8 {ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
				<div class="border-2 border-border rounded-2xl overflow-hidden shadow-brutal">
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
		<div class="max-w-3xl mx-auto px-6 sm:px-8 py-8">
			{#if trips.length === 0}
				<div class="text-center py-16 {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
					<div class="w-16 h-16 rounded-2xl bg-accent-light border-2 border-border flex items-center justify-center mx-auto mb-4 shadow-brutal-sm">
						<MapPin size={28} weight="bold" class="text-accent" />
					</div>
					<p class="text-text-muted font-medium">No trips yet</p>
				</div>
			{:else}
				<h2 class="text-lg font-bold text-text-primary mb-5 {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">Trips</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-5 {ready ? 'animate-fade-up fill-both delay-300' : 'opacity-0'}">
					{#each trips as trip}
						{@const videos = trip.videoLinks ? parseAllVideoLinks(trip.videoLinks) : []}
						<a
							href={getShareUrl(trip.id)}
							class="trip-card block bg-card border-2 border-border rounded-2xl overflow-hidden shadow-brutal"
						>
							<div class="relative">
								{#if trip.coverImageUrl}
									<div class="h-40 overflow-hidden">
										<img
											src={trip.coverImageUrl}
											alt={trip.title}
											class="w-full h-full object-cover"
										/>
									</div>
								{:else}
									<div class="h-40 bg-gradient-to-br from-accent-light to-card flex items-center justify-center">
										<span class="text-2xl font-extrabold opacity-20" style="color: {trip.titleColor}">
											{trip.title}
										</span>
									</div>
								{/if}
								{#if trip.tripDate}
									<span class="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-page/90 border border-border text-text-primary backdrop-blur-sm">
										{new Date(trip.tripDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
									</span>
								{/if}
							</div>
							<div class="p-5">
								<h3 class="font-bold text-text-primary">{trip.title}</h3>
								{#if trip.titleDescription}
									<p class="text-xs text-text-secondary mt-1 line-clamp-1">{trip.titleDescription}</p>
								{/if}
								<p class="text-xs text-text-muted mt-1.5 font-medium">
									{trip.stats.stops} stops &middot;
									{trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi
								</p>
								{#if trip.tags && trip.tags.length > 0}
									<div class="flex flex-wrap gap-1.5 mt-3">
										{#each trip.tags.slice(0, 3) as tag}
											{@const TagIcon = TAG_ICONS[tag]}
											<span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-light border border-border text-text-primary">
												{#if TagIcon}<TagIcon size={12} weight="bold" class="text-accent" />{/if}
												{tag}
											</span>
										{/each}
										{#if trip.tags.length > 3}
											<span class="text-[10px] text-text-muted px-1 py-0.5">+{trip.tags.length - 3}</span>
										{/if}
									</div>
								{/if}
								{#if videos.length > 0}
									<div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
										{#each videos as v}
											{#if v.platform === 'youtube'}
												<YoutubeLogo size={16} weight="fill" class="text-red-500" />
											{:else if v.platform === 'instagram'}
												<InstagramLogo size={16} weight="fill" class="text-pink-500" />
											{:else if v.platform === 'tiktok'}
												<TiktokLogo size={16} weight="fill" />
											{/if}
										{/each}
										<span class="text-xs text-text-muted font-medium">Watch video</span>
									</div>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<!-- CTA for non-users -->
		{#if !authState.isSignedIn}
			<div class="max-w-3xl mx-auto px-6 sm:px-8 pb-8 {ready ? 'animate-fade-up fill-both delay-400' : 'opacity-0'}">
				<div class="bg-accent-light border-2 border-border rounded-2xl shadow-brutal p-6 sm:p-8 text-center">
					<h3 class="text-lg font-extrabold text-text-primary mb-2">Create your own trip video</h3>
					<p class="text-sm text-text-secondary mb-5 max-w-md mx-auto">Drop your photos, pick your stops, and TripStitch stitches together a cinematic travel video — free, in your browser.</p>
					<a
						href="/signin"
						class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-bold text-sm border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
					>
						Get Started Free
						<ArrowRight size={16} weight="bold" />
					</a>
				</div>
			</div>
		{/if}

		<!-- Footer -->
		<footer class="border-t-3 border-border">
			<div class="max-w-3xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
				<a href="/" class="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
					<img src="/favicon-192.png" alt="" class="h-4" />
					<span class="text-xs font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
				</a>
				<p class="text-xs text-text-muted">
					Made with <a href="/" class="text-accent hover:text-accent-hover font-bold">TripStitch</a>
				</p>
			</div>
		</footer>
	</div>
{/if}
