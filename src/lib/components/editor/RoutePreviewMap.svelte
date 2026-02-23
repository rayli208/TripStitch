<script lang="ts">
	import type { Location, MapStyle } from '$lib/types';
	import { STYLE_URLS } from '$lib/constants/map';
	import { fetchAllRouteGeometries } from '$lib/services/routeService';
	import { onDestroy } from 'svelte';

	let {
		locations,
		mapStyle,
		titleColor
	}: {
		locations: Location[];
		mapStyle: MapStyle;
		titleColor: string;
	} = $props();

	let container = $state<HTMLDivElement>(undefined!);
	let map: any = null;

	async function initMap() {
		if (!container || locations.length < 2) return;

		// Clean up previous instance
		if (map) {
			map.remove();
			map = null;
		}

		const maplibregl = (await import('maplibre-gl')).default;

		// Fetch real road geometries
		const routeGeometries = await fetchAllRouteGeometries(locations);

		const bounds = new maplibregl.LngLatBounds();
		for (const loc of locations) {
			bounds.extend([loc.lng, loc.lat]);
		}
		// Extend bounds to include route geometry points
		for (const geom of routeGeometries) {
			if (geom) {
				for (const coord of geom.coordinates) {
					bounds.extend(coord);
				}
			}
		}

		map = new maplibregl.Map({
			container,
			style: STYLE_URLS[mapStyle],
			bounds,
			fitBoundsOptions: { padding: 40 },
			interactive: false,
			attributionControl: false
		});

		map.on('load', () => {
			if (!map) return;

			// Build route coordinates: use road geometry when available, fall back to straight lines
			const allCoords: [number, number][] = [];
			for (let i = 0; i < locations.length - 1; i++) {
				const geom = routeGeometries[i];
				if (geom && geom.coordinates.length > 0) {
					allCoords.push(...geom.coordinates);
				} else {
					// Straight-line fallback
					if (allCoords.length === 0) {
						allCoords.push([locations[i].lng, locations[i].lat]);
					}
					allCoords.push([locations[i + 1].lng, locations[i + 1].lat]);
				}
			}

			// Dark outline
			map.addSource('route', {
				type: 'geojson',
				data: {
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: allCoords }
				}
			});

			map.addLayer({
				id: 'route-outline',
				type: 'line',
				source: 'route',
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: {
					'line-color': 'rgba(10, 15, 30, 0.6)',
					'line-width': 5
				}
			});

			// Accent-colored route
			map.addLayer({
				id: 'route-line',
				type: 'line',
				source: 'route',
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: {
					'line-color': titleColor,
					'line-width': 3
				}
			});

			// Numbered markers
			for (let i = 0; i < locations.length; i++) {
				const loc = locations[i];
				const el = document.createElement('div');
				el.className = 'flex items-center justify-center w-6 h-6 rounded-full bg-accent text-white text-xs font-bold shadow-md';
				el.textContent = String(i + 1);
				new maplibregl.Marker({ element: el })
					.setLngLat([loc.lng, loc.lat])
					.addTo(map);
			}
		});
	}

	$effect(() => {
		// Re-init whenever locations, style, or color change
		const _deps = [locations.length, mapStyle, titleColor, locations.map(l => `${l.lat},${l.lng},${l.transportMode}`).join('|')];
		void _deps;
		initMap();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

{#if locations.length >= 2}
	<div
		bind:this={container}
		class="w-full h-[200px] rounded-xl overflow-hidden border border-border"
	></div>
{/if}
