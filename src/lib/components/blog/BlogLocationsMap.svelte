<script lang="ts">
	import type { BlogLocation } from '$lib/types';
	import { STYLE_URLS } from '$lib/constants/map';
	import { onMount, onDestroy } from 'svelte';

	let { locations }: { locations: BlogLocation[] } = $props();

	let container = $state<HTMLDivElement>(undefined!);
	let map: any = null;

	const valid = $derived(locations.filter((l) => l.lat !== 0 || l.lng !== 0));

	onMount(async () => {
		if (!container || valid.length === 0) return;

		const mod = await import('maplibre-gl');
		const maplibregl: any = (mod as any).default ?? mod;
		if (!container) return;

		const bounds = new maplibregl.LngLatBounds();
		for (const loc of valid) bounds.extend([loc.lng, loc.lat]);

		map = new maplibregl.Map({
			container,
			style: STYLE_URLS.streets,
			bounds,
			fitBoundsOptions: { padding: 60, maxZoom: valid.length === 1 ? 13 : 12 },
			attributionControl: false,
			cooperativeGestures: true
		});
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

		for (const [i, loc] of valid.entries()) {
			const el = document.createElement('div');
			el.className = 'blog-map-pin';
			el.textContent = String(loc.rank ?? i + 1);

			const name = loc.label || loc.name;
			const sub = [loc.city, loc.country].filter(Boolean).join(', ');
			const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
				`<div class="blog-map-popup">
					<p class="blog-map-popup-name">${escapeHtml(name)}</p>
					${sub ? `<p class="blog-map-popup-sub">${escapeHtml(sub)}</p>` : ''}
					<a class="blog-map-popup-link" target="_blank" rel="noopener"
						href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}">Get directions →</a>
				</div>`
			);

			new maplibregl.Marker({ element: el }).setLngLat([loc.lng, loc.lat]).setPopup(popup).addTo(map);
		}
	});

	onDestroy(() => {
		map?.remove();
		map = null;
	});

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css" />
</svelte:head>

{#if valid.length > 0}
	<div class="rounded-2xl overflow-hidden border-2 border-border shadow-[3px_3px_0_var(--color-border)] my-6">
		<div bind:this={container} class="w-full h-64 sm:h-80"></div>
	</div>
{/if}

<style>
	:global(.blog-map-pin) {
		width: 28px;
		height: 28px;
		border-radius: 9999px;
		background: var(--color-accent);
		color: white;
		border: 2px solid var(--color-border);
		font-weight: 700;
		font-size: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 2px 2px 0 var(--color-border);
	}
	:global(.blog-map-popup) {
		font-family: inherit;
		min-width: 140px;
	}
	:global(.blog-map-popup-name) {
		font-weight: 700;
		font-size: 13px;
		color: #1a1a1a;
		margin: 0;
	}
	:global(.blog-map-popup-sub) {
		font-size: 11px;
		color: #666;
		margin: 2px 0 0;
	}
	:global(.blog-map-popup-link) {
		display: inline-block;
		margin-top: 6px;
		font-size: 11px;
		font-weight: 700;
		color: var(--color-accent);
	}
</style>
