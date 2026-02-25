<script lang="ts">
	import type { MapStyle } from '$lib/types';
	import { STYLE_URLS } from '$lib/constants/map';
	import { onDestroy } from 'svelte';

	interface MapTrip {
		id: string;
		title: string;
		titleColor: string;
		locations: { lat: number; lng: number; name: string; label: string | null }[];
	}

	let {
		trips,
		getTripHref,
		mapStyle = 'dark'
	}: {
		trips: MapTrip[];
		getTripHref: (tripId: string) => string;
		mapStyle?: MapStyle;
	} = $props();

	let container = $state<HTMLDivElement>(undefined!);
	let map: any = null;
	let selectedTrip = $state<MapTrip | null>(null);
	let initGeneration = 0;

	// Flag to prevent map click from immediately dismissing a marker selection
	let markerClickedAt = 0;

	function dismissSelection() {
		selectedTrip = null;
	}

	function handleZoomIn() {
		if (map) map.zoomIn({ duration: 300 });
	}

	function handleZoomOut() {
		if (map) map.zoomOut({ duration: 300 });
	}

	function handleFitAll() {
		if (!map || trips.length === 0) return;
		const maplibregl = (globalThis as any).__maplibregl;
		if (!maplibregl) return;
		const bounds = new maplibregl.LngLatBounds();
		for (const trip of trips) {
			for (const loc of trip.locations) {
				bounds.extend([loc.lng, loc.lat]);
			}
		}
		map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 600 });
		dismissSelection();
	}

	async function initMap() {
		if (!container || trips.length === 0) return;

		const thisGen = ++initGeneration;

		// Clean up previous
		if (map) {
			map.remove();
			map = null;
		}
		dismissSelection();

		const maplibregl = (await import('maplibre-gl')).default;
		// Store ref for handleFitAll
		(globalThis as any).__maplibregl = maplibregl;

		if (thisGen !== initGeneration || !container) return;

		// Compute bounds across all trips
		const bounds = new maplibregl.LngLatBounds();
		for (const trip of trips) {
			for (const loc of trip.locations) {
				bounds.extend([loc.lng, loc.lat]);
			}
		}

		map = new maplibregl.Map({
			container,
			style: STYLE_URLS[mapStyle],
			bounds,
			fitBoundsOptions: { padding: 50, maxZoom: 12 },
			attributionControl: false
		});

		map.on('load', () => {
			if (!map || thisGen !== initGeneration) return;

			// Draw route lines for each trip
			for (const trip of trips) {
				if (trip.locations.length < 2) continue;

				const coords: [number, number][] = trip.locations.map((l) => [l.lng, l.lat]);
				const sourceId = `route-${trip.id}`;

				map.addSource(sourceId, {
					type: 'geojson',
					data: {
						type: 'Feature',
						properties: {},
						geometry: { type: 'LineString', coordinates: coords }
					}
				});

				// Dark outline for contrast
				map.addLayer({
					id: `${sourceId}-outline`,
					type: 'line',
					source: sourceId,
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: {
						'line-color': 'rgba(10, 15, 30, 0.5)',
						'line-width': 5
					}
				});

				// Colored route
				map.addLayer({
					id: `${sourceId}-line`,
					type: 'line',
					source: sourceId,
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: {
						'line-color': trip.titleColor,
						'line-width': 3
					}
				});
			}

			// Add markers for each trip's locations
			for (const trip of trips) {
				for (let i = 0; i < trip.locations.length; i++) {
					const loc = trip.locations[i];

					const el = document.createElement('div');
					el.style.cssText = `
						width: 18px; height: 18px; border-radius: 50%;
						background: ${trip.titleColor}; border: 2.5px solid white;
						box-shadow: 0 2px 6px rgba(0,0,0,0.35); cursor: pointer;
						transition: transform 0.15s ease;
					`;

					el.addEventListener('mouseenter', () => {
						el.style.transform = 'scale(1.4)';
					});
					el.addEventListener('mouseleave', () => {
						el.style.transform = 'scale(1)';
					});
					el.addEventListener('click', (e) => {
						e.stopPropagation();
						markerClickedAt = Date.now();
						selectedTrip = trip;

						// Fit map to this trip's bounds
						const tripBounds = new maplibregl.LngLatBounds();
						for (const l of trip.locations) {
							tripBounds.extend([l.lng, l.lat]);
						}
						map.fitBounds(tripBounds, { padding: 60, maxZoom: 14, duration: 800 });
					});

					new maplibregl.Marker({ element: el, anchor: 'center' })
						.setLngLat([loc.lng, loc.lat])
						.addTo(map);
				}
			}

			// Add trip title labels at centroids
			const labelFeatures = trips
				.filter((t) => t.locations.length > 0)
				.map((t) => {
					const lat = t.locations.reduce((s, l) => s + l.lat, 0) / t.locations.length;
					const lng = t.locations.reduce((s, l) => s + l.lng, 0) / t.locations.length;
					return {
						type: 'Feature' as const,
						properties: { title: t.title, color: t.titleColor, tripId: t.id },
						geometry: { type: 'Point' as const, coordinates: [lng, lat] }
					};
				});

			map.addSource('trip-labels', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: labelFeatures }
			});

			map.addLayer({
				id: 'trip-labels',
				type: 'symbol',
				source: 'trip-labels',
				layout: {
					'text-field': ['get', 'title'],
					'text-size': 13,
					'text-font': ['Open Sans Bold'],
					'text-offset': [0, -1.8],
					'text-anchor': 'bottom',
					'text-allow-overlap': false
				},
				paint: {
					'text-color': ['get', 'color'],
					'text-halo-color': 'rgba(10, 15, 30, 0.8)',
					'text-halo-width': 1.5
				}
			});

			// Make labels clickable too
			map.on('click', 'trip-labels', (e: any) => {
				if (!e.features?.length) return;
				const tripId = e.features[0].properties.tripId;
				const trip = trips.find((t) => t.id === tripId);
				if (!trip) return;

				markerClickedAt = Date.now();
				selectedTrip = trip;

				const tripBounds = new maplibregl.LngLatBounds();
				for (const l of trip.locations) {
					tripBounds.extend([l.lng, l.lat]);
				}
				map.fitBounds(tripBounds, { padding: 60, maxZoom: 14, duration: 800 });
			});

			// Pointer cursor on labels
			map.on('mouseenter', 'trip-labels', () => {
				map.getCanvas().style.cursor = 'pointer';
			});
			map.on('mouseleave', 'trip-labels', () => {
				map.getCanvas().style.cursor = '';
			});
		});

		// Click on empty map dismisses selection (with guard for marker clicks)
		map.on('click', () => {
			if (Date.now() - markerClickedAt < 100) return;
			dismissSelection();
		});
	}

	$effect(() => {
		const _deps = [
			trips.length,
			trips.map((t) => t.id).join(','),
			mapStyle
		];
		void _deps;
		initMap();
	});

	onDestroy(() => {
		initGeneration++;
		if (map) {
			map.remove();
			map = null;
		}
		delete (globalThis as any).__maplibregl;
	});
</script>

{#if trips.length > 0}
	<div class="relative">
		<div
			bind:this={container}
			class="w-full h-[350px] sm:h-[420px] rounded-xl overflow-hidden border border-border"
		></div>

		<!-- Zoom controls -->
		<div class="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
			<button
				class="w-9 h-9 rounded-lg bg-card/90 backdrop-blur-sm border border-border text-text-primary hover:bg-card-hover transition-colors cursor-pointer flex items-center justify-center shadow-sm"
				onclick={handleZoomIn}
				title="Zoom in"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m6-6H6" />
				</svg>
			</button>
			<button
				class="w-9 h-9 rounded-lg bg-card/90 backdrop-blur-sm border border-border text-text-primary hover:bg-card-hover transition-colors cursor-pointer flex items-center justify-center shadow-sm"
				onclick={handleZoomOut}
				title="Zoom out"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M18 12H6" />
				</svg>
			</button>
			<button
				class="w-9 h-9 rounded-lg bg-card/90 backdrop-blur-sm border border-border text-text-primary hover:bg-card-hover transition-colors cursor-pointer flex items-center justify-center shadow-sm"
				onclick={handleFitAll}
				title="Fit all trips"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
				</svg>
			</button>
		</div>

		{#if selectedTrip}
			<div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
				<div class="relative min-w-[200px] rounded-xl border border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-lg">
					<button
						class="absolute top-1 right-2 text-lg leading-none text-text-muted hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0"
						onclick={() => dismissSelection()}
					>
						&times;
					</button>
					<div class="text-sm font-bold text-text-primary pr-4">{selectedTrip.title}</div>
					<div class="text-xs text-text-muted mb-2.5">
						{selectedTrip.locations.length}
						{selectedTrip.locations.length === 1 ? 'stop' : 'stops'}
					</div>
					<a
						href={getTripHref(selectedTrip.id)}
						class="block text-center px-3.5 py-1.5 rounded-lg text-sm font-semibold no-underline bg-accent hover:bg-accent-hover text-white transition-colors"
					>
						View Trip
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
