<script lang="ts">
	import { page } from '$app/state';
	import type { SharedTrip } from '$lib/types';
	import { fetchSharedTrip, getProfileUrl } from '$lib/services/shareService';
	import { getFontById, fontFamily } from '$lib/constants/fonts';
	import { STYLE_URLS } from '$lib/constants/map';

	const tripId = page.params.id!;

	let trip = $state<SharedTrip | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	$effect(() => {
		loadTrip();
	});

	async function loadTrip() {
		loading = true;
		try {
			trip = await fetchSharedTrip(tripId);
			notFound = !trip;
		} catch {
			notFound = true;
		}
		loading = false;
	}

	const tripFont = $derived(trip ? getFontById(trip.fontId ?? 'inter') : null);
	const tripFontFamily = $derived(trip ? fontFamily(trip.fontId ?? 'inter') : '');
	const tripFontUrl = $derived(() => {
		if (!tripFont) return '';
		const wgts = tripFont.weights.join(';');
		return `https://fonts.googleapis.com/css2?family=${tripFont.family.replace(/ /g, '+')}:wght@${wgts}&display=swap`;
	});

	let mapContainer: HTMLDivElement;
	let mapLoaded = $state(false);
	let mapError = $state(false);

	$effect(() => {
		if (!trip || !mapContainer || mapLoaded || mapError) return;
		initMap();
	});

	async function initMap() {
		if (!trip) return;
		let maplibregl: typeof import('maplibre-gl').default;
		try {
			maplibregl = (await import('maplibre-gl')).default;
		} catch {
			mapError = true;
			return;
		}

		try {
			const bounds = new maplibregl.LngLatBounds();
			for (const loc of trip.locations) {
				bounds.extend([loc.lng, loc.lat]);
			}

			const styleUrl = STYLE_URLS[trip.mapStyle] ?? STYLE_URLS.streets;

			const map = new maplibregl.Map({
				container: mapContainer,
				style: styleUrl,
				bounds,
				fitBoundsOptions: { padding: 60 },
				interactive: true,
				attributionControl: false
			});

			map.addControl(new maplibregl.NavigationControl(), 'top-right');

			map.on('error', () => { mapError = true; });

			map.on('load', () => {
				const sorted = [...trip!.locations].sort((a, b) => a.order - b.order);
				for (let i = 0; i < sorted.length - 1; i++) {
					const from = sorted[i];
					const to = sorted[i + 1];
					map.addSource(`route-${i}`, {
						type: 'geojson',
						data: {
							type: 'Feature',
							properties: {},
							geometry: {
								type: 'LineString',
								coordinates: [
									[from.lng, from.lat],
									[to.lng, to.lat]
								]
							}
						}
					});
					map.addLayer({
						id: `route-${i}`,
						type: 'line',
						source: `route-${i}`,
						layout: { 'line-cap': 'round', 'line-join': 'round' },
						paint: {
							'line-color': trip!.titleColor,
							'line-width': 3,
							'line-opacity': 0.7
						}
					});
				}

				for (const loc of sorted) {
					const label = loc.label || loc.name.split(',')[0];
					const el = document.createElement('div');
					el.className = 'trip-marker';
					el.style.cssText = `
						width: 28px; height: 28px; border-radius: 50%;
						background: ${trip!.titleColor}; border: 3px solid white;
						box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
					`;
					new maplibregl.Marker({ element: el })
						.setLngLat([loc.lng, loc.lat])
						.setPopup(new maplibregl.Popup({ offset: 20 }).setText(label))
						.addTo(map);
				}

				mapLoaded = true;
			});
		} catch {
			mapError = true;
		}
	}

	const TRANSPORT_LABELS: Record<string, string> = {
		walked: 'Walked',
		drove: 'Drove',
		biked: 'Biked'
	};
</script>

<svelte:head>
	{#if trip}
		<title>{trip.title} - TripStitch</title>
		<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css" />
		{#if tripFont}
			<link rel="stylesheet" href={tripFontUrl()} />
		{/if}
	{/if}
</svelte:head>

{#if loading}
	<div class="min-h-screen bg-page animate-pulse">
		<div class="h-72 sm:h-96 bg-border/50"></div>
		<div class="px-6 sm:px-8 py-4 flex items-center gap-3 border-b border-border">
			<div class="w-8 h-8 rounded-full bg-border/50"></div>
			<div class="h-4 w-32 bg-border/50 rounded"></div>
		</div>
		<div class="px-6 sm:px-8 py-4 flex gap-6 border-b border-border">
			<div class="h-4 w-16 bg-border/50 rounded"></div>
			<div class="h-4 w-16 bg-border/50 rounded"></div>
			<div class="h-4 w-16 bg-border/50 rounded"></div>
		</div>
		<div class="px-4 sm:px-8 py-6">
			<div class="w-full h-72 sm:h-96 rounded-xl bg-border/50"></div>
		</div>
		<div class="px-6 sm:px-8 pb-8">
			<div class="h-5 w-16 bg-border/50 rounded mb-4"></div>
			<div class="space-y-3">
				{#each Array(4) as _}
					<div class="flex items-center gap-3">
						<div class="w-6 h-6 rounded-full bg-border/50"></div>
						<div class="h-4 w-40 bg-border/50 rounded"></div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else if notFound}
	<div class="min-h-screen bg-page flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-text-primary mb-2">Trip Not Found</h1>
			<p class="text-text-muted mb-6">This trip may not have been shared yet.</p>
			<a href="/" class="text-accent hover:text-accent-hover">Go to TripStitch</a>
		</div>
	</div>
{:else if trip}
	<div class="min-h-screen bg-page">
		<!-- Hero -->
		{#if trip.coverImageUrl}
			<div class="relative h-72 sm:h-96 overflow-hidden">
				<img
					src={trip.coverImageUrl}
					alt={trip.title}
					class="absolute inset-0 w-full h-full object-cover"
				/>
				<div class="absolute inset-0 bg-gradient-to-t from-page via-page/40 to-transparent"></div>
				<div class="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
					<h1 class="text-3xl sm:text-4xl font-bold text-text-primary mb-1" style="color: {trip.titleColor}; font-family: {tripFontFamily}">
						{trip.title}
					</h1>
					{#if trip.titleDescription}
						<p class="text-base sm:text-lg text-text-secondary mt-1" style="font-family: {tripFontFamily}">{trip.titleDescription}</p>
					{/if}
				</div>
			</div>
		{:else}
			<div class="px-6 sm:px-8 pt-12 pb-6">
				<h1 class="text-3xl sm:text-4xl font-bold" style="color: {trip.titleColor}; font-family: {tripFontFamily}">
					{trip.title}
				</h1>
				{#if trip.titleDescription}
					<p class="text-base sm:text-lg text-text-secondary mt-2" style="font-family: {tripFontFamily}">{trip.titleDescription}</p>
				{/if}
			</div>
		{/if}

		<!-- Author bar -->
		<div class="px-6 sm:px-8 py-4 flex items-center gap-3 border-b border-border">
			{#if trip.userAvatarUrl}
				<img src={trip.userAvatarUrl} alt={trip.userDisplayName} referrerpolicy="no-referrer" class="w-8 h-8 rounded-full" />
			{/if}
			<div class="text-sm">
				<a
					href={getProfileUrl(trip.username)}
					class="text-text-primary font-medium hover:text-accent transition-colors"
				>
					{trip.userDisplayName}
				</a>
				<span class="text-text-muted ml-1">@{trip.username}</span>
			</div>
		</div>

		<!-- Stats -->
		<div class="px-6 sm:px-8 py-4 flex gap-6 text-sm border-b border-border">
			{#if trip.tripDate}
				<div>
					<span class="text-text-primary font-semibold">
						{new Date(trip.tripDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
					</span>
				</div>
			{/if}
			<div>
				<span class="text-text-primary font-semibold">{trip.stats.stops}</span>
				<span class="text-text-muted ml-1">stops</span>
			</div>
			<div>
				<span class="text-text-primary font-semibold">
					{trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)}
				</span>
				<span class="text-text-muted ml-1">miles</span>
			</div>
			<div>
				<span class="text-text-primary font-semibold">~{trip.stats.minutes}</span>
				<span class="text-text-muted ml-1">min</span>
			</div>
		</div>

		<!-- Video Links -->
		{#if trip.videoLinks && (trip.videoLinks.youtube || trip.videoLinks.instagram || trip.videoLinks.tiktok || trip.videoLinks.other)}
			<div class="px-6 sm:px-8 py-4 flex flex-wrap gap-3 border-b border-border">
				{#if trip.videoLinks.youtube}
					<a href={trip.videoLinks.youtube} target="_blank" rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
						</svg>
						YouTube
					</a>
				{/if}
				{#if trip.videoLinks.instagram}
					<a href={trip.videoLinks.instagram} target="_blank" rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/10 text-pink-500 text-sm font-medium hover:bg-pink-500/20 transition-colors">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
						</svg>
						Instagram
					</a>
				{/if}
				{#if trip.videoLinks.tiktok}
					<a href={trip.videoLinks.tiktok} target="_blank" rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-text-primary text-sm font-medium hover:bg-white/20 transition-colors">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.65a8.35 8.35 0 0 0 4.76 1.49v-3.4a4.85 4.85 0 0 1-1-.05z"/>
						</svg>
						TikTok
					</a>
				{/if}
				{#if trip.videoLinks.other}
					<a href={trip.videoLinks.other} target="_blank" rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
						</svg>
						Watch
					</a>
				{/if}
			</div>
		{/if}

		<!-- Map -->
		<div class="px-4 sm:px-8 py-6">
			{#if mapError}
				<div class="w-full h-72 sm:h-96 rounded-xl border border-border flex items-center justify-center bg-card">
					<p class="text-sm text-text-muted">Map could not be loaded</p>
				</div>
			{:else}
				<div
					bind:this={mapContainer}
					class="w-full h-72 sm:h-96 rounded-xl overflow-hidden border border-border"
				></div>
			{/if}
		</div>

		<!-- Locations list -->
		<div class="px-6 sm:px-8 pb-8">
			<h2 class="text-lg font-semibold text-text-primary mb-4">Route</h2>
			<div class="space-y-1">
				{#each [...trip.locations].sort((a, b) => a.order - b.order) as loc, i}
					<div class="flex items-start gap-3">
						<div class="flex flex-col items-center">
							<div
								class="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white shrink-0"
								style="border-color: {trip.titleColor}; background: {trip.titleColor}20"
							>
								{i + 1}
							</div>
							{#if i < trip.locations.length - 1}
								<div class="w-0.5 h-8 bg-border"></div>
							{/if}
						</div>
						<div class="pt-0.5 flex-1">
							<p class="text-sm font-medium text-text-primary">{loc.label || loc.name.split(',')[0]}</p>
							{#if loc.label && loc.name !== loc.label}
								<p class="text-xs text-text-muted">{loc.name}</p>
							{/if}
							{#if loc.description}
								<p class="text-sm text-text-muted mt-1">{loc.description}</p>
							{/if}
							{#if loc.transportMode && i > 0}
								<p class="text-xs text-text-muted mt-0.5">
									{TRANSPORT_LABELS[loc.transportMode] || loc.transportMode}
								</p>
							{/if}
						</div>
						<a
							href="https://www.google.com/maps/dir/?api=1&destination={loc.lat},{loc.lng}"
							target="_blank"
							rel="noopener noreferrer"
							class="shrink-0 mt-0.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors"
							title="Navigate to {loc.label || loc.name.split(',')[0]}"
						>
							Navigate
						</a>
					</div>
				{/each}
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
