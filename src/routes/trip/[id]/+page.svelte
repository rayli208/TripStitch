<script lang="ts">
	import { page } from '$app/state';
	import type { SharedTrip } from '$lib/types';
	import { fetchTrip, getProfileUrl } from '$lib/services/shareService';
	import { getFontById, fontFamily } from '$lib/constants/fonts';
	import { STYLE_URLS } from '$lib/constants/map';
	import { parseAllVideoLinks } from '$lib/utils/videoEmbed';
	import VideoEmbed from '$lib/components/ui/VideoEmbed.svelte';

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
			trip = await fetchTrip(tripId);
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

					const stars = loc.rating
						? `<div style="margin-top:3px">${'★'.repeat(loc.rating)}${'☆'.repeat(5 - loc.rating)}</div>`
						: '';
					const desc = loc.description
						? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;max-width:180px">${loc.description}</div>`
						: '';

					const popup = new maplibregl.Popup({
						offset: 20,
						closeButton: false,
						className: 'ts-popup'
					}).setHTML(
						`<div style="font-weight:600;font-size:13px;color:#f1f5f9">${label}</div>${stars}${desc}`
					);

					new maplibregl.Marker({ element: el })
						.setLngLat([loc.lng, loc.lat])
						.setPopup(popup)
						.addTo(map);
				}

				mapLoaded = true;
			});
		} catch {
			mapError = true;
		}
	}

	const parsedVideos = $derived(trip?.videoLinks ? parseAllVideoLinks(trip.videoLinks) : []);

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

		<!-- Video Embed -->
		{#if parsedVideos.length > 0}
			<div class="px-6 sm:px-8 py-6 border-b border-border">
				<div class="flex flex-wrap justify-center gap-4">
					{#each parsedVideos as video}
						<VideoEmbed {video} />
					{/each}
				</div>
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
							{#if loc.rating}
								<div class="flex items-center gap-0.5 mt-0.5">
									{#each Array(5) as _, s}
										<span class="text-xs {s < loc.rating ? 'text-amber-400' : 'text-border'}"
										>&#9733;</span>
									{/each}
								</div>
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

<style>
	:global(.ts-popup .maplibregl-popup-content) {
		background: rgba(15, 23, 42, 0.95);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 10px;
		padding: 8px 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		color: #f1f5f9;
		font-size: 13px;
		line-height: 1.4;
	}

	:global(.ts-popup .maplibregl-popup-tip) {
		border-top-color: rgba(15, 23, 42, 0.95);
	}

	:global(.ts-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip) {
		border-top-color: rgba(15, 23, 42, 0.95);
	}

	:global(.ts-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip) {
		border-bottom-color: rgba(15, 23, 42, 0.95);
	}

	:global(.ts-popup.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
		border-right-color: rgba(15, 23, 42, 0.95);
	}

	:global(.ts-popup.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
		border-left-color: rgba(15, 23, 42, 0.95);
	}
</style>
