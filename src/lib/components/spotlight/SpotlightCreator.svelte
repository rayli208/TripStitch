<script lang="ts">
	import { PUBLIC_GOOGLE_PLACES_API_KEY } from '$env/static/public';
	import type { MapStyle, AspectRatio } from '$lib/types';
	import type {
		SpotlightResult,
		SpotlightDuration,
		SpotlightContextShape,
		SpotlightExportMode
	} from '$lib/services/spotlightRenderer';
	import type { TownResult } from '$lib/services/boundaryService';
	import { STYLE_URLS } from '$lib/constants/map';
	import {
		checkBrowserSupport,
		canUseAlphaExport,
		getSupportedMimeType
	} from '$lib/utils/browserCompat';
	import { MILES_TO_METERS, KM_TO_METERS } from '$lib/services/geoUtils';
	import { onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import { DEFAULT_BRAND_COLORS } from '$lib/constants/fonts';
	import profileState from '$lib/state/profile.svelte';

	let {
		accentColor = '#FFFFFF',
		secondaryColor = '#0a0f1e',
		fontId = 'inter',
		brandColors = [] as string[],
		logoUrl = null as string | null,
		onexportchange
	}: {
		accentColor?: string;
		secondaryColor?: string;
		fontId?: string;
		brandColors?: string[];
		logoUrl?: string | null;
		onexportchange?: (exporting: boolean) => void;
	} = $props();

	const PLACES_API_KEY = PUBLIC_GOOGLE_PLACES_API_KEY;
	const support = checkBrowserSupport();

	// Update colors/font from profile once it loads (matching create page pattern)
	$effect(() => {
		if (profileState.profile?.brandColors?.length && accentColor === '#FFFFFF') {
			accentColor = profileState.profile.brandColors[0];
		}
		if (profileState.profile?.secondaryColor && secondaryColor === '#0a0f1e') {
			secondaryColor = profileState.profile.secondaryColor;
		}
		if (profileState.profile?.preferredFontId && fontId === 'inter') {
			fontId = profileState.profile.preferredFontId;
		}
	});

	// ── Town search state ──
	let townQuery = $state('');
	let townResults = $state<TownResult[]>([]);
	let townLoading = $state(false);
	let townOpen = $state(false);
	let selectedTown = $state<TownResult | null>(null);
	let townDebounce: ReturnType<typeof setTimeout>;

	// ── Location search state ──
	let locationQuery = $state('');
	let locationSuggestions = $state<{ placeId: string; text: string }[]>([]);
	let locationLoading = $state(false);
	let locationOpen = $state(false);
	let selectedLocation = $state<{
		name: string;
		lat: number;
		lng: number;
		formattedAddress: string;
	} | null>(null);
	let locationDebounce: ReturnType<typeof setTimeout>;

	// ── Editable fields ──
	let displayName = $state('');
	let displayAddress = $state('');

	// ── Settings ──
	let mapStyle = $state<MapStyle>('streets');
	let aspectRatio = $state<AspectRatio>('16:9');
	let durationSec = $state<SpotlightDuration>(5);
	let loopable = $state(false);
	let contextShape = $state<SpotlightContextShape>('boundary');
	let exportMode = $state<SpotlightExportMode>('opaque');

	// Radius settings
	let radiusUnit = $state<'mi' | 'km'>('mi');
	let radiusValue = $state(1); // in selected unit
	const radiusMeters = $derived(
		radiusValue * (radiusUnit === 'mi' ? MILES_TO_METERS : KM_TO_METERS)
	);
	const RADIUS_PRESETS_MI = [0.25, 0.5, 1, 2, 5];
	const RADIUS_PRESETS_KM = [0.5, 1, 2, 5, 10];

	// Alpha support is purely a mime-type check — no encoder probe needed.
	const alphaSupported = canUseAlphaExport();

	// Auto-switch to radius when the selected town has no boundary polygon
	$effect(() => {
		if (selectedTown && !selectedTown.boundaryGeoJSON && contextShape === 'boundary') {
			contextShape = 'radius';
		}
	});

	// ── Export state ──
	let isExporting = $state(false);
	let exportDone = $state(false);
	let progressMsg = $state('');
	let videoUrl = $state<string | null>(null);
	let videoBlob = $state<Blob | null>(null);
	let videoExt = $state<'mp4' | 'webm'>('mp4');
	let videoHasAlpha = $state(false);
	let error = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	// ── Map preview state ──
	let mapContainer = $state<HTMLDivElement>(undefined!);
	let previewMap: any = null;
	let previewMarker: any = null;

	const canExport = $derived.by(() => {
		if (!selectedLocation || !support.canExport) return false;
		if (contextShape === 'boundary') return selectedTown?.boundaryGeoJSON != null;
		return radiusMeters > 0;
	});

	const mapStyles: { value: MapStyle; label: string }[] = [
		{ value: 'streets', label: 'Streets' },
		{ value: 'satellite', label: 'Satellite' },
		{ value: 'outdoor', label: 'Outdoor' },
		{ value: 'topo', label: 'Topo' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' }
	];

	const aspectRatios: { value: AspectRatio; label: string }[] = [
		{ value: '16:9', label: '16:9' },
		{ value: '1:1', label: '1:1' },
		{ value: '9:16', label: '9:16' }
	];

	const durations: { value: SpotlightDuration; label: string }[] = [
		{ value: 3, label: '3s' },
		{ value: 5, label: '5s' },
		{ value: 8, label: '8s' }
	];

	// ── Town search ──
	function handleTownInput() {
		clearTimeout(townDebounce);
		if (townQuery.length < 2) {
			townResults = [];
			return;
		}
		townDebounce = setTimeout(() => fetchTowns(townQuery), 400);
	}

	async function fetchTowns(query: string) {
		townLoading = true;
		try {
			const { searchTowns } = await import('$lib/services/boundaryService');
			townResults = await searchTowns(query);
		} catch (err) {
			console.warn('[Spotlight] Town search failed:', err);
			townResults = [];
		}
		townLoading = false;
	}

	function selectTown(town: TownResult) {
		selectedTown = town;
		townQuery = town.displayName.split(',')[0];
		townOpen = false;
		selectedLocation = null;
		displayName = '';
		displayAddress = '';
		locationQuery = '';
		updatePreviewMap();
	}

	// ── Location search (Google Places, biased to town if one is selected) ──
	function handleLocationInput() {
		clearTimeout(locationDebounce);
		if (locationQuery.length < 2) {
			locationSuggestions = [];
			return;
		}
		locationDebounce = setTimeout(() => fetchLocationSuggestions(locationQuery), 300);
	}

	async function fetchLocationSuggestions(input: string) {
		locationLoading = true;
		try {
			const body: Record<string, unknown> = { input };
			if (selectedTown) {
				const bb = selectedTown.boundingBox;
				body.locationBias = {
					rectangle: {
						low: { latitude: bb[1], longitude: bb[0] },
						high: { latitude: bb[3], longitude: bb[2] }
					}
				};
			}
			const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_API_KEY },
				body: JSON.stringify(body)
			});
			const data = await res.json();
			locationSuggestions = (data.suggestions ?? [])
				.filter((s: Record<string, unknown>) => s.placePrediction)
				.map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
					placeId: s.placePrediction.placeId,
					text: s.placePrediction.text.text
				}));
		} catch (err) {
			console.warn('[Spotlight] Location search failed:', err);
			locationSuggestions = [];
		}
		locationLoading = false;
	}

	async function selectLocation(suggestion: { placeId: string; text: string }) {
		locationOpen = false;
		locationQuery = suggestion.text;
		try {
			const res = await fetch(`https://places.googleapis.com/v1/places/${suggestion.placeId}`, {
				headers: {
					'X-Goog-Api-Key': PLACES_API_KEY,
					'X-Goog-FieldMask': 'location,displayName,formattedAddress'
				}
			});
			const data = await res.json();
			selectedLocation = {
				name: data.displayName?.text ?? suggestion.text,
				lat: data.location.latitude,
				lng: data.location.longitude,
				formattedAddress: data.formattedAddress ?? suggestion.text
			};
			displayName = selectedLocation.name;
			displayAddress = selectedLocation.formattedAddress;
			updatePreviewMap();
		} catch (err) {
			console.warn('[Spotlight] Place detail fetch failed:', err);
		}
	}

	// ── Map preview ──
	async function updatePreviewMap() {
		if (!mapContainer) return;

		if (previewMap) {
			previewMap.remove();
			previewMap = null;
			previewMarker = null;
		}

		const maplibregl = (await import('maplibre-gl')).default;

		// Decide bounds: town boundary bbox if using boundary, otherwise radius bbox
		// around the location. Always extend to include the pin so a location
		// outside the town shape stays visible.
		let bounds: any;
		if (contextShape === 'boundary' && selectedTown) {
			const bb = selectedTown.boundingBox;
			bounds = new maplibregl.LngLatBounds([bb[0], bb[1]], [bb[2], bb[3]]);
		} else if (selectedLocation) {
			const { circleBbox } = await import('$lib/services/geoUtils');
			const bb = circleBbox([selectedLocation.lng, selectedLocation.lat], radiusMeters);
			bounds = new maplibregl.LngLatBounds([bb[0], bb[1]], [bb[2], bb[3]]);
		} else {
			return; // nothing to show yet
		}
		if (selectedLocation) {
			bounds.extend([selectedLocation.lng, selectedLocation.lat]);
		}

		previewMap = new maplibregl.Map({
			container: mapContainer,
			style: STYLE_URLS[mapStyle],
			bounds,
			fitBoundsOptions: { padding: 30 },
			interactive: true,
			attributionControl: false
		});

		previewMap.on('load', async () => {
			if (!previewMap) return;

			let geojson: GeoJSON.Geometry | null = null;
			if (contextShape === 'boundary' && selectedTown?.boundaryGeoJSON) {
				geojson = selectedTown.boundaryGeoJSON;
			} else if (selectedLocation) {
				const { circlePolygon } = await import('$lib/services/geoUtils');
				geojson = circlePolygon([selectedLocation.lng, selectedLocation.lat], radiusMeters);
			}

			if (geojson) {
				previewMap.addSource('context', {
					type: 'geojson',
					data: { type: 'Feature', properties: {}, geometry: geojson }
				});
				previewMap.addLayer({
					id: 'context-fill',
					type: 'fill',
					source: 'context',
					paint: { 'fill-color': accentColor, 'fill-opacity': 0.18 }
				});
				previewMap.addLayer({
					id: 'context-outline',
					type: 'line',
					source: 'context',
					paint: { 'line-color': accentColor, 'line-width': 4, 'line-opacity': 0.9 }
				});
			}

			if (selectedLocation) {
				addPreviewPin(maplibregl);
			}
		});
	}

	function addPreviewPin(maplibregl: any) {
		if (!previewMap || !selectedLocation) return;
		if (previewMarker) {
			previewMarker.remove();
			previewMarker = null;
		}
		const el = document.createElement('div');
		el.style.cssText = `
			width: 28px; height: 28px; border-radius: 50%;
			background: ${accentColor}; border: 3px solid white;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		`;
		previewMarker = new maplibregl.Marker({ element: el })
			.setLngLat([selectedLocation.lng, selectedLocation.lat])
			.addTo(previewMap);
	}

	// Re-init preview when inputs change
	$effect(() => {
		const _deps = [
			mapStyle,
			accentColor,
			selectedTown?.displayName,
			selectedLocation?.lat,
			contextShape,
			radiusMeters
		];
		void _deps;
		if (mapContainer && (selectedTown || selectedLocation)) {
			updatePreviewMap();
		}
	});

	// ── Export ──
	async function handleExport() {
		if (isExporting || !selectedLocation) return;
		if (contextShape === 'boundary' && !selectedTown?.boundaryGeoJSON) return;

		isExporting = true;
		onexportchange?.(true);
		exportDone = false;
		error = null;
		progressMsg = 'Starting...';
		abortController = new AbortController();

		try {
			const { renderSpotlight } = await import('$lib/services/spotlightRenderer');

			const result: SpotlightResult = await renderSpotlight(
				{
					locationName: displayName || selectedLocation.name,
					address: displayAddress || selectedLocation.formattedAddress,
					boundaryGeoJSON: selectedTown?.boundaryGeoJSON ?? null,
					boundaryBbox: selectedTown?.boundingBox ?? null,
					pinLocation: [selectedLocation.lng, selectedLocation.lat],
					mapStyle,
					accentColor,
					fontId,
					aspectRatio,
					secondaryColor,
					durationSec,
					loopable,
					contextShape,
					radiusMeters,
					exportMode
				},
				(msg) => {
					progressMsg = msg;
				},
				abortController.signal
			);

			videoBlob = result.blob;
			videoUrl = result.url;
			videoExt = result.ext;
			videoHasAlpha = result.hasAlpha;
			isExporting = false;
			exportDone = true;
			progressMsg = '';
		} catch (err) {
			isExporting = false;
			if ((err as Error).message === 'Export cancelled') {
				progressMsg = '';
				return;
			}
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
			console.error('[Spotlight] Export error:', err);
		} finally {
			abortController = null;
			onexportchange?.(false);
		}
	}

	function handleCancel() {
		abortController?.abort();
		isExporting = false;
		progressMsg = '';
	}

	function handleDownload() {
		if (!videoBlob || !videoUrl) return;
		const mimeType = videoBlob.type || getSupportedMimeType();
		const filename = `spotlight-${(displayName || 'location').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${videoExt}`;

		const url = URL.createObjectURL(new Blob([videoBlob], { type: mimeType }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}

	function handleReset() {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoUrl = null;
		videoBlob = null;
		exportDone = false;
		error = null;
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.town-search')) townOpen = false;
		if (!target.closest('.location-search')) locationOpen = false;
	}

	onDestroy(() => {
		if (previewMap) {
			previewMap.remove();
			previewMap = null;
		}
		if (videoUrl) URL.revokeObjectURL(videoUrl);
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css" />
</svelte:head>

<svelte:window onclick={handleClickOutside} />

<div class="space-y-5">
	<!-- Header -->
	<div>
		<h2 class="text-lg font-bold">YouTube Map Overlay Studio</h2>
		<p class="text-sm text-text-muted mt-1">
			Generate a short map clip — transparent, looping, or standard — to drop into your travel
			edits. Pick a spot in a town, around a landmark, or across a region.
		</p>
	</div>

	{#if exportDone && videoUrl}
		<!-- Result -->
		<div class="space-y-4">
			<div class="relative">
				{#if videoHasAlpha}
					<!-- Transparent-checkerboard background so users can see the alpha -->
					<div
						class="absolute inset-0 rounded-xl"
						style="background-image: linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, 10px 0;"
					></div>
				{/if}
				<video
					src={videoUrl}
					controls
					playsinline
					autoplay
					loop={loopable}
					muted
					class="relative w-full rounded-xl border-2 border-border"
				></video>
			</div>

			{#if videoHasAlpha}
				<div class="bg-accent/10 border border-accent/30 rounded-lg p-3 text-xs text-text-secondary">
					<p class="font-semibold mb-1">Transparent WebM exported.</p>
					<p>
						Imports cleanly in DaVinci Resolve 18+, Premiere Pro CC 2022+, and CapCut. Final Cut
						requires transcoding to ProRes 4444 first (use Shutter Encoder or FFmpeg).
					</p>
				</div>
			{/if}

			<div class="flex gap-3">
				<Button variant="primary" onclick={handleDownload}>Save Video</Button>
				<Button variant="ghost" onclick={handleReset}>Make Another</Button>
			</div>
		</div>
	{:else}
		<!-- Step 1: Town search (optional in radius mode) -->
		<div class="space-y-1.5">
			<label class="block text-sm font-semibold">
				Town / City
				{#if contextShape === 'radius'}
					<span class="text-xs font-normal text-text-muted">(optional)</span>
				{/if}
			</label>
			<div class="relative town-search">
				<input
					type="text"
					placeholder="Search for a town or city..."
					bind:value={townQuery}
					oninput={handleTownInput}
					onfocus={() => (townOpen = true)}
					class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
				/>
				{#if townLoading}
					<div class="absolute right-3 top-2.5">
						<div
							class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"
						></div>
					</div>
				{/if}
				{#if townOpen && townResults.length > 0}
					<div
						class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] overflow-hidden max-h-60 overflow-y-auto"
					>
						{#each townResults as town}
							<button
								class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-border transition-colors cursor-pointer"
								onclick={() => selectTown(town)}
							>
								<span class="font-medium">{town.displayName.split(',')[0]}</span>
								<span class="text-text-muted text-xs ml-1"
									>{town.displayName.split(',').slice(1).join(',').trim()}</span
								>
								{#if !town.boundaryGeoJSON}
									<span class="text-xs text-warning ml-1">(no boundary — will use radius)</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
				{#if townOpen && !townLoading && townQuery.length >= 2 && townResults.length === 0}
					<div
						class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] p-3"
					>
						<p class="text-sm text-text-muted">No results found</p>
					</div>
				{/if}
			</div>
			{#if selectedTown}
				<p class="text-xs text-text-muted">
					Selected: {selectedTown.displayName.split(',').slice(0, 2).join(', ')}
					{#if selectedTown.boundaryGeoJSON}
						<span class="text-accent"> — boundary found</span>
					{:else}
						<span class="text-warning"> — no official boundary, using radius instead</span>
					{/if}
				</p>
			{/if}
		</div>

		<!-- Step 2: Location search -->
		<div class="space-y-1.5">
			<label class="block text-sm font-semibold">Location</label>
			<div class="relative location-search">
				<input
					type="text"
					placeholder={selectedTown
						? 'Search for a place within the town...'
						: 'Search for a landmark, restaurant, or address...'}
					bind:value={locationQuery}
					oninput={handleLocationInput}
					onfocus={() => (locationOpen = true)}
					class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
				/>
				{#if locationLoading}
					<div class="absolute right-3 top-2.5">
						<div
							class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"
						></div>
					</div>
				{/if}
				{#if locationOpen && locationSuggestions.length > 0}
					<div
						class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] overflow-hidden max-h-60 overflow-y-auto"
					>
						{#each locationSuggestions as suggestion}
							<button
								class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-border transition-colors cursor-pointer"
								onclick={() => selectLocation(suggestion)}
							>
								{suggestion.text}
							</button>
						{/each}
					</div>
				{/if}
				{#if locationOpen && !locationLoading && locationQuery.length >= 2 && locationSuggestions.length === 0}
					<div
						class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] p-3"
					>
						<p class="text-sm text-text-muted">No results found</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Map preview -->
		{#if selectedTown || selectedLocation}
			<div
				bind:this={mapContainer}
				class="w-full h-[250px] rounded-xl overflow-hidden border-2 border-border"
			></div>
		{/if}

		<!-- Editable name & address -->
		{#if selectedLocation}
			<div class="space-y-3">
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Display Name</label>
					<input
						type="text"
						bind:value={displayName}
						placeholder="Location name..."
						class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
					/>
				</div>
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Display Address</label>
					<input
						type="text"
						bind:value={displayAddress}
						placeholder="Address..."
						class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
					/>
				</div>
			</div>
		{/if}

		<!-- Settings -->
		{#if selectedLocation || selectedTown}
			<div class="space-y-4 pt-1">
				<!-- Context shape -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Context Shape</label>
					<div class="flex gap-2">
						<button
							class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
								{contextShape === 'boundary'
								? 'border-accent bg-accent text-white'
								: 'border-border bg-card text-text-secondary hover:bg-border'}
								{!selectedTown?.boundaryGeoJSON ? 'opacity-50 cursor-not-allowed' : ''}"
							onclick={() => (contextShape = 'boundary')}
							disabled={!selectedTown?.boundaryGeoJSON}
							title={selectedTown?.boundaryGeoJSON
								? 'Use the official town boundary'
								: 'Select a town with an official boundary to enable this'}
						>
							Town Boundary
						</button>
						<button
							class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
								{contextShape === 'radius'
								? 'border-accent bg-accent text-white'
								: 'border-border bg-card text-text-secondary hover:bg-border'}"
							onclick={() => (contextShape = 'radius')}
						>
							Radius Around Pin
						</button>
					</div>
					<p class="text-xs text-text-muted mt-1">
						{contextShape === 'boundary'
							? 'Animates from the whole town area into the specific location.'
							: 'Animates from a custom-sized circle around the location. Use for neighborhoods, landmarks, or anywhere without an official boundary.'}
					</p>
				</div>

				<!-- Radius controls (only shown in radius mode) -->
				{#if contextShape === 'radius'}
					<div class="space-y-1.5">
						<label class="block text-sm font-semibold">Radius</label>
						<div class="flex items-center gap-2 flex-wrap">
							{#each radiusUnit === 'mi' ? RADIUS_PRESETS_MI : RADIUS_PRESETS_KM as preset}
								<button
									class="px-2.5 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusValue === preset
										? 'border-accent bg-accent text-white'
										: 'border-border bg-card text-text-secondary hover:bg-border'}"
									onclick={() => (radiusValue = preset)}
								>
									{preset}{radiusUnit}
								</button>
							{/each}
							<div class="flex items-center gap-1 ml-2">
								<button
									class="px-2 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusUnit === 'mi'
										? 'border-accent bg-accent text-white'
										: 'border-border bg-card text-text-secondary hover:bg-border'}"
									onclick={() => (radiusUnit = 'mi')}>mi</button
								>
								<button
									class="px-2 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusUnit === 'km'
										? 'border-accent bg-accent text-white'
										: 'border-border bg-card text-text-secondary hover:bg-border'}"
									onclick={() => (radiusUnit = 'km')}>km</button
								>
							</div>
						</div>
					</div>
				{/if}

				<!-- Duration -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Duration</label>
					<div class="flex gap-2">
						{#each durations as d}
							<button
								class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
									{durationSec === d.value
									? 'border-accent bg-accent text-white'
									: 'border-border bg-card text-text-secondary hover:bg-border'}"
								onclick={() => (durationSec = d.value)}
							>
								{d.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Loop -->
				<div class="space-y-1.5">
					<label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
						<input
							type="checkbox"
							bind:checked={loopable}
							class="w-4 h-4 accent-accent cursor-pointer"
						/>
						Loopable (seamless orbit)
					</label>
					<p class="text-xs text-text-muted">
						{loopable
							? 'Camera slowly orbits the pin at close zoom — loops cleanly for long voiceovers.'
							: 'Standard zoom-in animation from overview to pin.'}
					</p>
				</div>

				<!-- Export mode -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Export Mode</label>
					<div class="flex gap-2">
						<button
							class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
								{exportMode === 'opaque'
								? 'border-accent bg-accent text-white'
								: 'border-border bg-card text-text-secondary hover:bg-border'}"
							onclick={() => (exportMode = 'opaque')}
						>
							Standard (MP4)
						</button>
						<button
							class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
								{exportMode === 'alpha'
								? 'border-accent bg-accent text-white'
								: 'border-border bg-card text-text-secondary hover:bg-border'}
								{alphaSupported === false ? 'opacity-50 cursor-not-allowed' : ''}"
							onclick={() => (exportMode = 'alpha')}
							disabled={alphaSupported === false}
							title={alphaSupported === false
								? 'Transparent export requires Chrome, Edge, or Firefox'
								: 'Transparent-background WebM for compositing in your editor'}
						>
							Transparent (WebM)
						</button>
					</div>
					<p class="text-xs text-text-muted">
						{exportMode === 'alpha'
							? 'Rounded-rectangle cutout with transparent corners. Drop it straight onto your timeline — no masking needed.'
							: 'Opaque map with vignette. Use if you want to rectangle-crop it yourself or place it on a solid background.'}
					</p>
					{#if alphaSupported === false}
						<p class="text-xs text-warning">
							Transparent export isn't available in this browser. Open the page in Chrome,
							Edge, or Firefox to enable it.
						</p>
					{/if}
				</div>

				<!-- Map style -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Map Style</label>
					<div class="flex flex-wrap gap-2">
						{#each mapStyles as style}
							<button
								class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
									{mapStyle === style.value
									? 'border-accent bg-accent text-white'
									: 'border-border bg-card text-text-secondary hover:bg-border'}"
								onclick={() => (mapStyle = style.value)}
							>
								{style.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Aspect ratio -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Aspect Ratio</label>
					<div class="flex gap-2">
						{#each aspectRatios as ar}
							<button
								class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
									{aspectRatio === ar.value
									? 'border-accent bg-accent text-white'
									: 'border-border bg-card text-text-secondary hover:bg-border'}"
								onclick={() => (aspectRatio = ar.value)}
							>
								{ar.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Accent color -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Accent Color</label>
					<ColorPicker
						bind:selected={accentColor}
						colors={brandColors.length > 0
							? brandColors
							: profileState.profile?.brandColors?.length
								? profileState.profile.brandColors
								: DEFAULT_BRAND_COLORS}
					/>
				</div>
			</div>
		{/if}

		<!-- Export button -->
		{#if error}
			<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
				<p class="text-sm text-red-400">{error}</p>
				<button
					class="text-sm text-accent underline mt-1 cursor-pointer"
					onclick={() => {
						error = null;
						handleExport();
					}}
				>
					Retry
				</button>
			</div>
		{/if}

		{#if isExporting}
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<div
						class="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin"
					></div>
					<span class="text-sm text-text-secondary">{progressMsg}</span>
				</div>
				<button class="text-sm text-text-muted underline cursor-pointer" onclick={handleCancel}>
					Cancel
				</button>
			</div>
		{:else if !exportDone}
			<div class="pt-2">
				<Button variant="primary" size="lg" disabled={!canExport} onclick={handleExport}>
					Export Overlay Clip
				</Button>
				{#if !support.canExport}
					<p class="text-xs text-text-muted mt-2">
						{support.warnings.join(' ')}
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
