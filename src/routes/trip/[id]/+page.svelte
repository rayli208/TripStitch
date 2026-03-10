<script lang="ts">
	import { page } from '$app/state';
	import type { SharedTrip } from '$lib/types';
	import { fetchTrip, getShareUrl, getProfileUrl } from '$lib/services/shareService';
	import { getFontById, fontFamily } from '$lib/constants/fonts';
	import { STYLE_URLS } from '$lib/constants/map';
	import { parseAllVideoLinks } from '$lib/utils/videoEmbed';
	import VideoEmbed from '$lib/components/ui/VideoEmbed.svelte';
	import authState from '$lib/state/auth.svelte';
	import { Star, StarHalf, Car, PersonSimpleHike, Buildings, SunHorizon, Backpack, ForkKnife, Mountains, Leaf, Bank, Camera, CaretLeft, MapPin, ArrowRight, NavigationArrow, ShareNetwork, Check, Bicycle } from 'phosphor-svelte';
	import type { Component } from 'svelte';

	const TAG_ICONS: Record<string, Component> = {
		'Road Trip': Car, 'Hiking': PersonSimpleHike, 'City Break': Buildings,
		'Beach': SunHorizon, 'Backpacking': Backpack, 'Foodie': ForkKnife,
		'Adventure': Mountains, 'Nature': Leaf, 'Cultural': Bank, 'Photography': Camera
	};

	const TRANSPORT_ICONS: Record<string, { icon: Component; label: string }> = {
		walked: { icon: PersonSimpleHike, label: 'Walked' },
		drove: { icon: Car, label: 'Drove' },
		biked: { icon: Bicycle, label: 'Biked' }
	};

	const tripId = page.params.id!;

	let trip = $state<SharedTrip | null>(null);
	let loading = $state(true);
	let notFound = $state(false);
	let linkCopied = $state(false);

	let ready = $state(false);
	$effect(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});

	$effect(() => {
		loadTrip();
	});

	async function loadTrip() {
		loading = true;
		try {
			trip = await fetchTrip(tripId);
			if (trip && trip.visibility === 'private' && trip.userId !== authState.user?.id) {
				trip = null;
			}
			notFound = !trip;
		} catch {
			notFound = true;
		}
		loading = false;
	}

	// Native share with Web Share API fallback to clipboard
	async function shareTrip() {
		const url = getShareUrl(tripId);
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({
					title: trip?.title ?? 'TripStitch',
					text: trip?.titleDescription || `Check out this trip on TripStitch`,
					url
				});
				return;
			} catch {
				// User cancelled or API unavailable — fall through to clipboard
			}
		}
		navigator.clipboard.writeText(url);
		linkCopied = true;
		setTimeout(() => { linkCopied = false; }, 2000);
	}

	const tripFont = $derived(trip ? getFontById(trip.fontId ?? 'inter') : null);
	const tripFontFamily = $derived(trip ? fontFamily(trip.fontId ?? 'inter') : '');
	const tripFontUrl = $derived(() => {
		if (!tripFont) return '';
		const wgts = tripFont.weights.join(';');
		return `https://fonts.googleapis.com/css2?family=${tripFont.family.replace(/ /g, '+')}:wght@${wgts}&display=swap`;
	});

	let mapContainer: HTMLDivElement;
	let mapInstance: any = $state(null);
	let mapMarkers: Map<string, any> = new Map();
	let mapLoaded = $state(false);
	let mapError = $state(false);
	let highlightedLocationId = $state<string | null>(null);

	$effect(() => {
		if (!trip || !mapContainer || mapLoaded || mapError) return;
		initMap();
	});

	function scrollToLocation(locId: string) {
		const el = document.getElementById(`loc-${locId}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			highlightedLocationId = locId;
			highlightMarker(locId);
			setTimeout(() => { highlightedLocationId = null; unhighlightMarker(); }, 2000);
		}
	}

	let activeMarkerId = $state<string | null>(null);

	function highlightMarker(locId: string) {
		// Reset previous
		if (activeMarkerId && activeMarkerId !== locId) {
			const prev = mapMarkers.get(activeMarkerId);
			if (prev) {
				const dot = prev.getElement().querySelector('.marker-dot') as HTMLElement;
				if (dot) {
					dot.style.transform = 'scale(1)';
					dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
				}
				prev.getElement().style.zIndex = '';
			}
		}
		activeMarkerId = locId;
		const marker = mapMarkers.get(locId);
		if (marker) {
			const dot = marker.getElement().querySelector('.marker-dot') as HTMLElement;
			if (dot) {
				dot.style.transform = 'scale(1.5)';
				dot.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.4)';
			}
			marker.getElement().style.zIndex = '10';
		}
	}

	function unhighlightMarker() {
		if (activeMarkerId) {
			const marker = mapMarkers.get(activeMarkerId);
			if (marker) {
				const dot = marker.getElement().querySelector('.marker-dot') as HTMLElement;
				if (dot) {
					dot.style.transform = 'scale(1)';
					dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
				}
				marker.getElement().style.zIndex = '';
			}
			activeMarkerId = null;
		}
	}

	function flyToLocation(loc: { lng: number; lat: number; id: string }) {
		if (!mapInstance) return;
		mapInstance.flyTo({ center: [loc.lng, loc.lat], zoom: 13, duration: 800 });
		highlightMarker(loc.id);
	}

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
			mapInstance = map;

			map.addControl(new maplibregl.NavigationControl(), 'top-right');

			map.on('error', () => { mapError = true; });

			map.on('load', () => {
				const sorted = [...trip!.locations].sort((a, b) => a.order - b.order);
				const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

				// Animate route by progressively adding coordinates
				const allCoords: [number, number][] = [];
				for (let i = 0; i < sorted.length; i++) {
					allCoords.push([sorted[i].lng, sorted[i].lat]);
				}

				const routeSource: any = {
					type: 'geojson',
					data: {
						type: 'Feature',
						properties: {},
						geometry: { type: 'LineString', coordinates: reducedMotion ? allCoords : [allCoords[0], allCoords[0]] }
					}
				};

				map.addSource('route-full', routeSource);

				map.addLayer({
					id: 'route-outline',
					type: 'line',
					source: 'route-full',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: {
						'line-color': 'rgba(10, 15, 30, 0.4)',
						'line-width': 5,
						'line-opacity': 0.6
					}
				});

				map.addLayer({
					id: 'route-line',
					type: 'line',
					source: 'route-full',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: {
						'line-color': trip!.titleColor,
						'line-width': 3,
						'line-opacity': 0.8
					}
				});

				// Animate route: interpolate extra points between waypoints for smooth drawing
				if (!reducedMotion && allCoords.length >= 2) {
					// Build a dense set of interpolated points along the route
					const denseCoords: [number, number][] = [];
					const pointsPerSegment = 20;
					for (let i = 0; i < allCoords.length - 1; i++) {
						const from = allCoords[i];
						const to = allCoords[i + 1];
						for (let j = 0; j < pointsPerSegment; j++) {
							const t = j / pointsPerSegment;
							denseCoords.push([
								from[0] + (to[0] - from[0]) * t,
								from[1] + (to[1] - from[1]) * t
							]);
						}
					}
					denseCoords.push(allCoords[allCoords.length - 1]);

					const totalFrames = denseCoords.length;
					let frame = 2; // start with at least 2 points
					function animateRoute() {
						frame = Math.min(frame + 1, totalFrames);
						const src = map.getSource('route-full') as any;
						if (!src) return;
						src.setData({
							type: 'Feature',
							properties: {},
							geometry: { type: 'LineString', coordinates: denseCoords.slice(0, frame) }
						});
						if (frame < totalFrames) {
							requestAnimationFrame(animateRoute);
						}
					}
					requestAnimationFrame(animateRoute);
				}

				// Markers with staggered pop-in
				for (let i = 0; i < sorted.length; i++) {
					const loc = sorted[i];
					const label = loc.label || loc.name.split(',')[0];
					// Outer wrapper — MapLibre controls its transform for positioning, so leave it alone
					const el = document.createElement('div');
					el.className = 'trip-marker';
					el.style.cssText = 'width: 28px; height: 28px; cursor: pointer;';
					// Inner dot — all visual styling and animation goes here
					const dot = document.createElement('div');
					dot.className = 'marker-dot';
					dot.style.cssText = `
						width: 100%; height: 100%; border-radius: 50%;
						background: ${trip!.titleColor}; border: 3px solid white;
						box-shadow: 0 2px 8px rgba(0,0,0,0.3);
						opacity: 0; transform: scale(0);
						transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, box-shadow 0.3s ease;
					`;
					el.appendChild(dot);

					// Pop in with stagger
					if (reducedMotion) {
						dot.style.opacity = '1';
						dot.style.transform = 'scale(1)';
					} else {
						setTimeout(() => {
							dot.style.opacity = '1';
							dot.style.transform = 'scale(1)';
						}, 200 + i * 150);
					}

					const starsHtml = (() => {
						if (!loc.rating) return '';
						let s = '';
						for (let si = 1; si <= 5; si++) {
							if (loc.rating >= si) s += '<span style="color:#fbbf24">★</span>';
							else if (loc.rating >= si - 0.5) s += '<span style="color:#fbbf24;opacity:0.5">★</span>';
							else s += '<span style="color:rgba(255,255,255,0.2)">☆</span>';
						}
						return `<div style="margin-top:3px;font-size:12px">${s}</div>`;
					})();
					const price = loc.priceTier
						? `<span style="font-size:11px;color:#4ade80;margin-left:${starsHtml ? '6px' : '0'}">${loc.priceTier}</span>`
						: '';
					const ratingLine = (starsHtml || price)
						? `<div style="margin-top:3px;display:flex;align-items:center">${starsHtml}${price}</div>`
						: '';
					const desc = loc.description
						? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;max-width:180px">${loc.description}</div>`
						: '';

					const popup = new maplibregl.Popup({
						offset: 20,
						closeButton: false,
						className: 'ts-popup'
					}).setHTML(
						`<div style="font-weight:600;font-size:13px;color:#f1f5f9">${label}</div>${ratingLine}${desc}`
					);

					// Click marker -> scroll to location in list
					el.addEventListener('click', () => {
						scrollToLocation(loc.id);
					});

					const marker = new maplibregl.Marker({ element: el })
						.setLngLat([loc.lng, loc.lat])
						.setPopup(popup)
						.addTo(map);

					mapMarkers.set(loc.id, marker);
				}

				mapLoaded = true;
			});
		} catch {
			mapError = true;
		}
	}

	const parsedVideos = $derived(trip?.videoLinks ? parseAllVideoLinks(trip.videoLinks) : []);
	const sortedLocations = $derived(trip ? [...trip.locations].sort((a, b) => a.order - b.order) : []);
	const formattedDate = $derived(trip?.tripDate ? new Date(trip.tripDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');
	const overallRating = $derived.by(() => {
		if (!trip) return null;
		const rated = trip.locations.filter(l => l.rating && l.rating > 0);
		if (rated.length === 0) return null;
		const avg = rated.reduce((sum, l) => sum + l.rating!, 0) / rated.length;
		return Math.round(avg * 2) / 2; // round to nearest 0.5
	});
</script>

<svelte:head>
	{#if trip}
		<title>{trip.title} - TripStitch</title>
		<meta property="og:title" content="{trip.title} - TripStitch" />
		<meta property="og:description" content="{trip.stats.stops} stops · {trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi{trip.titleDescription ? ' — ' + trip.titleDescription : ''}" />
		<meta property="og:type" content="article" />
		<meta property="og:url" content="{getShareUrl(tripId)}" />
		{#if trip.coverImageUrl}
			<meta property="og:image" content="{trip.coverImageUrl}" />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:image" content="{trip.coverImageUrl}" />
		{/if}
		<meta name="twitter:title" content="{trip.title} - TripStitch" />
		<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css" />
		{#if tripFont}
			<link rel="stylesheet" href={tripFontUrl()} />
		{/if}
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
		filter: url(#grain-filter-trip);
		width: 100%;
		height: 100%;
	}

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

	@media (prefers-reduced-motion: reduce) {
		.animate-fade-up { animation: none; opacity: 1; transform: none; }
	}
</style>

{#if loading}
	<div class="min-h-screen bg-page animate-pulse">
		<div class="border-b-3 border-border py-4 px-6"><div class="h-5 w-16 bg-border/50 rounded"></div></div>
		<div class="h-72 sm:h-96 bg-border/50"></div>
		<div class="max-w-3xl mx-auto px-6 sm:px-8 py-6">
			<div class="bg-card border-2 border-border rounded-2xl p-6 shadow-brutal space-y-4">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-full bg-border/50"></div>
					<div class="h-4 w-32 bg-border/50 rounded"></div>
				</div>
				<div class="flex gap-4">
					<div class="h-8 w-20 bg-border/50 rounded-lg"></div>
					<div class="h-8 w-20 bg-border/50 rounded-lg"></div>
					<div class="h-8 w-20 bg-border/50 rounded-lg"></div>
				</div>
			</div>
			<div class="mt-6 h-72 sm:h-[28rem] rounded-2xl bg-border/50 border-2 border-border"></div>
		</div>
	</div>
{:else if notFound}
	<div class="min-h-screen bg-page flex items-center justify-center">
		<div class="text-center bg-card border-2 border-border rounded-2xl shadow-brutal-lg p-10">
			<h1 class="text-2xl font-bold text-text-primary mb-2">Trip Not Found</h1>
			<p class="text-text-muted mb-6">This trip may not have been shared yet.</p>
			<a
				href="/"
				class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-white font-bold text-sm border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
			>
				Go to TripStitch
				<ArrowRight size={16} weight="bold" />
			</a>
		</div>
	</div>
{:else if trip}
	<div class="grain min-h-screen bg-page">
		<!-- Grain filter -->
		<svg class="hidden">
			<filter id="grain-filter-trip">
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
				<div class="flex items-center gap-3">
					<!-- Share button -->
					<button
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border text-xs font-bold bg-page hover:bg-accent-light hover:border-accent transition-all shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
						onclick={shareTrip}
					>
						{#if linkCopied}
							<Check size={14} weight="bold" class="text-success" />
							Copied!
						{:else}
							<ShareNetwork size={14} weight="bold" class="text-accent" />
							Share
						{/if}
					</button>
					{#if trip.userLogoUrl}
						<img src={trip.userLogoUrl} alt="Logo" class="h-7 w-7 rounded-md object-contain border-2 border-border bg-page p-0.5" />
					{/if}
					<a href="/" class="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
						<img src="/favicon-192.png" alt="" class="h-5" />
						<span class="text-sm font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
					</a>
				</div>
			</div>
		</div>

		<!-- Hero -->
		{#if trip.coverImageUrl}
			<div class="relative h-72 sm:h-96 overflow-hidden {ready ? 'animate-fade-up fill-both' : 'opacity-0'}">
				<img
					src={trip.coverImageUrl}
					alt={trip.title}
					class="absolute inset-0 w-full h-full object-cover"
				/>
				<div class="absolute inset-0 bg-gradient-to-t from-page via-page/40 to-transparent"></div>
				<div class="absolute bottom-0 left-0 right-0 p-6 sm:p-8 max-w-3xl mx-auto">
					{#if formattedDate}
						<p class="text-sm text-white/70 font-medium mb-2">{formattedDate}</p>
					{/if}
					<h1 class="text-3xl sm:text-4xl font-extrabold text-text-primary" style="color: {trip.titleColor}; font-family: {tripFontFamily}">
						{trip.title}
					</h1>
					{#if trip.titleDescription}
						<p class="text-base sm:text-lg text-text-secondary mt-1" style="font-family: {tripFontFamily}">{trip.titleDescription}</p>
					{/if}
				</div>
			</div>
		{:else}
			<div class="max-w-3xl mx-auto px-6 sm:px-8 pt-10 pb-4 {ready ? 'animate-fade-up fill-both' : 'opacity-0'}">
				{#if formattedDate}
					<p class="text-sm text-text-muted font-medium mb-2">{formattedDate}</p>
				{/if}
				<h1 class="text-3xl sm:text-4xl font-extrabold" style="color: {trip.titleColor}; font-family: {tripFontFamily}">
					{trip.title}
				</h1>
				{#if trip.titleDescription}
					<p class="text-base sm:text-lg text-text-secondary mt-2" style="font-family: {tripFontFamily}">{trip.titleDescription}</p>
				{/if}
			</div>
		{/if}

		<!-- Info card: author + stats + tags + video -->
		<div class="max-w-3xl mx-auto px-6 sm:px-8 py-6 {ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
			<div class="bg-card border-2 border-border rounded-2xl shadow-brutal-lg p-5 sm:p-6">
				<div class="{parsedVideos.length > 0 ? 'lg:flex lg:gap-6' : ''}">
					<!-- Left: trip info -->
					<div class="flex-1 min-w-0 space-y-4">
						<!-- Author -->
						<div class="flex items-center gap-3">
							{#if trip.userAvatarUrl}
								<img src={trip.userAvatarUrl} alt={trip.userDisplayName} referrerpolicy="no-referrer" class="w-10 h-10 rounded-full border-2 border-border object-cover shadow-brutal-sm" />
							{:else}
								<div class="w-10 h-10 rounded-full border-2 border-border bg-accent-light flex items-center justify-center text-accent font-bold text-sm shadow-brutal-sm">
									{trip.userDisplayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<a
									href={getProfileUrl(trip.username)}
									class="text-sm text-text-primary font-bold hover:text-accent transition-colors"
								>
									{trip.userDisplayName}
								</a>
								<p class="text-xs text-text-muted">@{trip.username}</p>
							</div>
						</div>

						<!-- Caption (Instagram-style) -->
						{#if trip.titleDescription}
							<p class="text-sm sm:text-base text-text-secondary leading-relaxed">{trip.titleDescription}</p>
						{/if}

						<!-- Stats -->
						<div class="flex flex-wrap gap-2">
							{#if trip.tripDate}
								<span class="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-page border-2 border-border">
									{new Date(trip.tripDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</span>
							{/if}
							<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-accent-light border-2 border-border">
								<MapPin size={14} weight="bold" class="text-accent" />
								{trip.stats.stops} stops
							</span>
							<span class="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-warning-light border-2 border-border">
								{trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi
							</span>
							<span class="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-success-light border-2 border-border">
								~{trip.stats.minutes} min
							</span>
							{#if overallRating}
								<span class="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-400/10 border-2 border-border text-amber-400">
									<Star size={12} weight="fill" />
									{overallRating % 1 === 0 ? overallRating : overallRating.toFixed(1)}
								</span>
							{/if}
						</div>

						<!-- Tags -->
						{#if trip.tags && trip.tags.length > 0}
							<div class="flex flex-wrap gap-1.5 pt-2 border-t-2 border-border">
								{#each trip.tags as tag}
									{@const TagIcon = TAG_ICONS[tag]}
									<span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-accent-light border border-border text-text-primary">
										{#if TagIcon}<TagIcon size={12} weight="bold" class="text-accent" />{/if}
										{tag}
									</span>
								{/each}
							</div>
						{/if}

						<!-- Route visualization -->
						{#if sortedLocations.length >= 2}
							<div class="pt-3 border-t-2 border-border">
								<div class="flex flex-col gap-0">
									{#each sortedLocations as loc, i}
										<div class="flex items-start gap-3">
											<div class="flex flex-col items-center">
												<div
													class="w-2.5 h-2.5 rounded-full flex-shrink-0"
													style="background: {trip.titleColor}"
												></div>
												{#if i < sortedLocations.length - 1}
													<div class="w-0.5 h-4" style="background: {trip.titleColor}30"></div>
												{/if}
											</div>
											<span class="text-xs text-text-secondary font-medium -mt-1">{loc.label || loc.name.split(',')[0]}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Right: video embed (desktop only, inside card) -->
					{#if parsedVideos.length > 0}
						<div class="hidden lg:flex flex-col items-center gap-3 flex-shrink-0 w-64 pt-1">
							{#each parsedVideos as video}
								<div class="w-full rounded-xl overflow-hidden border-2 border-border bg-page">
									<iframe
										src={video.embedUrl}
										title="Video on {video.platform}"
										loading="lazy"
										sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
										allowfullscreen
										class="w-full border-0 {video.isVertical ? 'aspect-[9/16] max-h-[360px]' : 'aspect-video'}"
									></iframe>
								</div>
								<a
									href={video.originalUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="text-xs font-medium text-text-muted hover:text-accent transition-colors"
								>
									Watch on {video.platform === 'youtube' ? 'YouTube' : video.platform === 'instagram' ? 'Instagram' : 'TikTok'}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Video Embed (mobile only, outside card) -->
		{#if parsedVideos.length > 0}
			<div class="lg:hidden max-w-3xl mx-auto px-6 sm:px-8 pb-6 {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
				<div class="bg-card border-2 border-border rounded-2xl shadow-brutal overflow-hidden">
					<div class="px-4 py-3 border-b-2 border-border flex items-center gap-2">
						<span class="text-xs font-bold text-text-primary">Trip Video</span>
					</div>
					<div class="flex flex-col items-center gap-4 p-4">
						{#each parsedVideos as video}
							<div class="w-full max-w-[280px] rounded-xl overflow-hidden border-2 border-border bg-page">
								<iframe
									src={video.embedUrl}
									title="Video on {video.platform}"
									loading="lazy"
									sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
									class="w-full border-0 {video.isVertical ? 'aspect-[9/16] max-h-[400px]' : 'aspect-video'}"
								></iframe>
							</div>
							<a
								href={video.originalUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs font-medium text-text-muted hover:text-accent transition-colors"
							>
								Watch on {video.platform === 'youtube' ? 'YouTube' : video.platform === 'instagram' ? 'Instagram' : 'TikTok'}
							</a>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Map + Route -->
		<div class="max-w-3xl mx-auto px-6 sm:px-8 pb-8 {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
			<div class="bg-card border-2 border-border rounded-2xl shadow-brutal overflow-hidden">
				<!-- Map -->
				{#if mapError}
					<div class="w-full h-64 sm:h-80 flex items-center justify-center bg-page">
						<p class="text-sm text-text-muted">Map could not be loaded</p>
					</div>
				{:else}
					<div
						bind:this={mapContainer}
						class="w-full h-64 sm:h-80"
					></div>
				{/if}

				<!-- Locations list -->
				<div class="p-4 sm:p-5">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-sm font-bold text-text-primary">{sortedLocations.length} Stops</h2>
						<p class="text-xs text-text-muted">{trip.stats.miles < 10 ? trip.stats.miles.toFixed(1) : Math.round(trip.stats.miles)} mi</p>
					</div>
					<div class="space-y-0">
						{#each sortedLocations as loc, i}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								id="loc-{loc.id}"
								class="flex items-start gap-3 rounded-xl py-1.5 px-2 -mx-2 transition-colors duration-500 cursor-pointer {highlightedLocationId === loc.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-page/50'}"
								onmouseenter={() => flyToLocation(loc)}
							onmouseleave={() => unhighlightMarker()}
							>
								<div class="flex flex-col items-center">
									<div
										class="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white shrink-0"
										style="border-color: {trip.titleColor}; background: {trip.titleColor}"
									>
										{i + 1}
									</div>
									{#if i < sortedLocations.length - 1}
										{@const nextLoc = sortedLocations[i + 1]}
										<div class="flex flex-col items-center">
											<div class="w-0.5 h-2.5" style="background: {trip.titleColor}40"></div>
											{#if nextLoc.transportMode}
												{@const transport = TRANSPORT_ICONS[nextLoc.transportMode]}
												{#if transport}
													{@const TransportIcon = transport.icon}
													<div class="w-4 h-4 rounded-full flex items-center justify-center my-0.5" style="background: {trip.titleColor}15">
														<TransportIcon size={8} weight="bold" style="color: {trip.titleColor}" />
													</div>
												{/if}
											{/if}
											<div class="w-0.5 h-2.5" style="background: {trip.titleColor}40"></div>
										</div>
									{/if}
								</div>
								<div class="pt-0.5 flex-1 min-w-0 pb-1">
									<div class="flex items-center gap-1.5">
										<p class="text-sm font-bold text-text-primary truncate">{loc.label || loc.name.split(',')[0]}</p>
										{#if loc.rating && loc.rating >= 5}
											<span class="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-px rounded bg-amber-400/15 text-amber-400">
												<Star size={8} weight="fill" />
												Top
											</span>
										{/if}
									</div>
									{#if loc.rating || loc.priceTier}
										<div class="flex items-center gap-1.5 mt-0.5">
											{#if loc.rating}
												<div class="flex items-center">
													{#each Array(5) as _, s}
														{#if loc.rating >= s + 1}
															<span class="text-amber-400"><Star size={10} weight="fill" /></span>
														{:else if loc.rating >= s + 0.5}
															<span class="relative inline-block" style="width:10px;height:10px">
																<span class="absolute inset-0 text-border"><Star size={10} weight="fill" /></span>
																<span class="absolute inset-0 text-amber-400"><StarHalf size={10} weight="fill" /></span>
															</span>
														{:else}
															<span class="text-border"><Star size={10} weight="fill" /></span>
														{/if}
													{/each}
												</div>
											{/if}
											{#if loc.priceTier}
												<span class="text-[11px] text-green-400 font-bold">{loc.priceTier}</span>
											{/if}
										</div>
									{/if}
									{#if loc.description}
										<p class="text-xs text-text-muted mt-0.5 line-clamp-2">{loc.description}</p>
									{/if}
								</div>
								<a
									href="https://www.google.com/maps/dir/?api=1&destination={loc.lat},{loc.lng}"
									target="_blank"
									rel="noopener noreferrer"
									class="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-accent hover:border-accent transition-colors"
									title="Navigate to {loc.label || loc.name.split(',')[0]}"
									onclick={(e: MouseEvent) => e.stopPropagation()}
								>
									<NavigationArrow size={12} weight="bold" />
								</a>
							</div>
						{/each}
					</div>
				</div>
			</div>
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
