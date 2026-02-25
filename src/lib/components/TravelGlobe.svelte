<script lang="ts">
	import type { GlobeStyle } from '$lib/types';
	import { onDestroy } from 'svelte';

	interface GlobeTrip {
		id: string;
		title: string;
		titleColor: string;
		locations: { lat: number; lng: number; name: string; label: string | null }[];
	}

	let {
		trips,
		getTripHref,
		globeStyle = 'dark',
		brandColors = []
	}: {
		trips: GlobeTrip[];
		getTripHref: (tripId: string) => string;
		globeStyle?: GlobeStyle;
		brandColors?: string[];
	} = $props();

	let container = $state<HTMLDivElement>(undefined!);
	let globe: any = null;
	let idleTimeout: ReturnType<typeof setTimeout> | null = null;
	let selectedTrip = $state<GlobeTrip | null>(null);
	let initGeneration = 0;
	let resizeObserver: ResizeObserver | null = null;

	const IDLE_TIMEOUT_MS = 10_000;

	const EARTH_TEXTURES: Record<string, string | null> = {
		dark: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
		light: '//unpkg.com/three-globe/example/img/earth-day.jpg',
		satellite: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
		streets: '//unpkg.com/three-globe/example/img/earth-day.jpg',
		outdoor: '//unpkg.com/three-globe/example/img/earth-topology.png',
		topo: '//unpkg.com/three-globe/example/img/earth-topology.png',
		custom: null // handled via material tinting
	};

	function hexToRgb(hex: string): [number, number, number] {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return [r, g, b];
	}

	function centroid(locs: { lat: number; lng: number }[]): { lat: number; lng: number } {
		const lat = locs.reduce((s, l) => s + l.lat, 0) / locs.length;
		const lng = locs.reduce((s, l) => s + l.lng, 0) / locs.length;
		return { lat, lng };
	}

	function dismissSelection() {
		selectedTrip = null;
	}

	function clearIdleTimeout() {
		if (idleTimeout) {
			clearTimeout(idleTimeout);
			idleTimeout = null;
		}
	}

	function startRotation() {
		if (!globe) return;
		const controls = globe.controls();
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.5;
	}

	function stopRotation() {
		if (!globe) return;
		globe.controls().autoRotate = false;
	}

	function scheduleIdleReset() {
		clearIdleTimeout();
		idleTimeout = setTimeout(() => {
			if (!globe) return;
			dismissSelection();
			globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 2000);
			startRotation();
		}, IDLE_TIMEOUT_MS);
	}

	function onUserInteraction() {
		stopRotation();
		clearIdleTimeout();
		scheduleIdleReset();
	}

	async function initGlobe() {
		if (!container || trips.length === 0) return;

		const thisGen = ++initGeneration;

		// Cleanup previous
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (globe) {
			try { globe._destructor(); } catch {}
			globe = null;
		}
		clearIdleTimeout();
		dismissSelection();
		container.innerHTML = '';

		const Globe = (await import('globe.gl')).default;

		if (thisGen !== initGeneration || !container) return;

		// Prepare label data (trip pins with dot + title)
		const labelData = trips
			.filter((t) => t.locations.length > 0)
			.map((t) => {
				const c = centroid(t.locations);
				return { lat: c.lat, lng: c.lng, tripId: t.id, title: t.title, color: t.titleColor };
			});

		// Build arcs between sequential stops within each trip
		const arcsData: any[] = [];
		for (const t of trips) {
			if (t.locations.length < 2) continue;
			for (let i = 0; i < t.locations.length - 1; i++) {
				arcsData.push({
					startLat: t.locations[i].lat,
					startLng: t.locations[i].lng,
					endLat: t.locations[i + 1].lat,
					endLng: t.locations[i + 1].lng,
					color: t.titleColor
				});
			}
		}

		const rect = container.getBoundingClientRect();
		const isCustom = globeStyle === 'custom' && brandColors.length > 0;
		const textureUrl = isCustom ? null : (EARTH_TEXTURES[globeStyle] ?? EARTH_TEXTURES.dark);
		const atmosphereColor = isCustom ? brandColors[0] : '#3a5ba0';

		globe = new Globe(container)
			.width(rect.width)
			.height(rect.height)
			.backgroundColor('#050a18')
			.showAtmosphere(true)
			.atmosphereColor(atmosphereColor)
			.atmosphereAltitude(0.25)
			// Labels layer — colored dot + trip title on globe surface
			.labelsData(labelData)
			.labelLat('lat')
			.labelLng('lng')
			.labelText('title')
			.labelColor('color')
			.labelSize(1.5)
			.labelDotRadius(0.4)
			.labelAltitude(0.015)
			.labelResolution(2)
			.onLabelClick((label: any) => {
				stopRotation();
				clearIdleTimeout();

				const trip = trips.find((t) => t.id === label.tripId);
				if (!trip) return;

				const c = centroid(trip.locations);
				globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 0.8 }, 1500);

				setTimeout(() => {
					selectedTrip = trip;
					scheduleIdleReset();
				}, 1600);
			})
			// Arcs — animated dashed route lines
			.arcsData(arcsData)
			.arcStartLat('startLat')
			.arcStartLng('startLng')
			.arcEndLat('endLat')
			.arcEndLng('endLng')
			.arcColor('color')
			.arcDashLength(0.4)
			.arcDashGap(0.2)
			.arcDashAnimateTime(1500)
			.arcStroke(0.5)
			.arcAltitudeAutoScale(0.3)
			// Click empty globe → dismiss card
			.onGlobeClick(() => {
				if (selectedTrip) {
					dismissSelection();
					scheduleIdleReset();
				}
			})
			.showPointerCursor(true);

		// Apply texture + optional brand-color tinting
		if (isCustom) {
			// Keep the night earth texture for land/ocean detail, tint with brand colors
			globe
				.globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
				.bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png');

			// Material color multiplies with the texture — tint the globe
			try {
				const primary = hexToRgb(brandColors[0]);
				const material = globe.globeMaterial();
				// Tint: use brand color at moderate brightness so texture detail shows through
				material.color.setRGB(primary[0] / 255 * 0.8 + 0.2, primary[1] / 255 * 0.8 + 0.2, primary[2] / 255 * 0.8 + 0.2);
			} catch (e) {
				console.warn('[TravelGlobe] Custom material tint failed:', e);
			}
		} else {
			globe.globeImageUrl(textureUrl);
		}

		// Initial camera
		globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

		// Start rotation after globe settles
		setTimeout(() => {
			if (thisGen !== initGeneration) return;
			startRotation();
		}, 500);

		// Listen for user interaction on the canvas
		const canvas = container.querySelector('canvas');
		if (canvas) {
			for (const evt of ['mousedown', 'touchstart', 'wheel'] as const) {
				canvas.addEventListener(evt, onUserInteraction, { passive: true });
			}
		}

		// Resize handling
		resizeObserver = new ResizeObserver((entries) => {
			if (!globe || !container) return;
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) {
				globe.width(width).height(height);
			}
		});
		resizeObserver.observe(container);
	}

	$effect(() => {
		const _deps = [
			trips.length,
			trips.map((t) => t.id).join(','),
			globeStyle,
			brandColors.join(',')
		];
		void _deps;
		initGlobe();
	});

	onDestroy(() => {
		clearIdleTimeout();
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (globe) {
			try { globe._destructor(); } catch {}
			globe = null;
		}
	});
</script>

{#if trips.length > 0}
	<div class="relative">
		<div
			bind:this={container}
			class="w-full h-[350px] sm:h-[420px] rounded-xl overflow-hidden border border-border"
		></div>

		{#if selectedTrip}
			<div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
				<div
					class="relative min-w-[180px] rounded-xl border px-4 py-3"
					style="background: rgba(15, 23, 42, 0.95); border-color: rgba(148, 163, 184, 0.2); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);"
				>
					<button
						class="absolute top-1 right-2 text-lg leading-none bg-transparent border-none cursor-pointer p-0"
						style="color: #94a3b8"
						onmouseenter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
						onmouseleave={(e) => (e.currentTarget.style.color = '#94a3b8')}
						onclick={() => {
							dismissSelection();
							scheduleIdleReset();
						}}
					>
						&times;
					</button>
					<div class="text-sm font-bold pr-4" style="color: #f1f5f9">{selectedTrip.title}</div>
					<div class="text-xs mb-2.5" style="color: #94a3b8">
						{selectedTrip.locations.length}
						{selectedTrip.locations.length === 1 ? 'stop' : 'stops'}
					</div>
					<a
						href={getTripHref(selectedTrip.id)}
						class="block text-center px-3.5 py-1.5 rounded-md text-[13px] font-semibold no-underline transition-opacity hover:opacity-85"
						style="background: #3b82f6; color: #ffffff"
					>
						View Trip
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
