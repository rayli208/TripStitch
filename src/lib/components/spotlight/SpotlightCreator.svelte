<script lang="ts">
	import { PUBLIC_GOOGLE_PLACES_API_KEY } from '$env/static/public';
	import type { MapStyle, AspectRatio } from '$lib/types';
	import type { SpotlightResult } from '$lib/services/spotlightRenderer';
	import type { TownResult } from '$lib/services/boundaryService';
	import { STYLE_URLS } from '$lib/constants/map';
	import { checkBrowserSupport, getSupportedMimeType, getFileExtension } from '$lib/utils/browserCompat';
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
	let selectedLocation = $state<{ name: string; lat: number; lng: number; formattedAddress: string } | null>(null);
	let locationDebounce: ReturnType<typeof setTimeout>;

	// ── Editable fields ──
	let displayName = $state('');
	let displayAddress = $state('');

	// ── Settings ──
	let mapStyle = $state<MapStyle>('streets');
	let aspectRatio = $state<AspectRatio>('16:9');

	// ── Export state ──
	let isExporting = $state(false);
	let exportDone = $state(false);
	let progressMsg = $state('');
	let videoUrl = $state<string | null>(null);
	let videoBlob = $state<Blob | null>(null);
	let error = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	// ── Map preview state ──
	let mapContainer = $state<HTMLDivElement>(undefined!);
	let previewMap: any = null;
	let previewMarker: any = null;

	const canExport = $derived(
		selectedTown?.boundaryGeoJSON != null && selectedLocation != null && support.canExport
	);

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
		// Reset location when town changes
		selectedLocation = null;
		displayName = '';
		displayAddress = '';
		locationQuery = '';
		updatePreviewMap();
	}

	// ── Location search (Google Places, biased to town) ──
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
			// Bias to town bounding box if available
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
			const res = await fetch(
				`https://places.googleapis.com/v1/places/${suggestion.placeId}`,
				{
					headers: {
						'X-Goog-Api-Key': PLACES_API_KEY,
						'X-Goog-FieldMask': 'location,displayName,formattedAddress'
					}
				}
			);
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

		// Clean up previous
		if (previewMap) {
			previewMap.remove();
			previewMap = null;
			previewMarker = null;
		}

		if (!selectedTown) return;

		const maplibregl = (await import('maplibre-gl')).default;

		const bb = selectedTown.boundingBox;
		const bounds = new maplibregl.LngLatBounds([bb[0], bb[1]], [bb[2], bb[3]]);

		previewMap = new maplibregl.Map({
			container: mapContainer,
			style: STYLE_URLS[mapStyle],
			bounds,
			fitBoundsOptions: { padding: 30 },
			interactive: true,
			attributionControl: false
		});

		previewMap.on('load', () => {
			if (!previewMap || !selectedTown?.boundaryGeoJSON) return;

			// Add boundary
			previewMap.addSource('boundary', {
				type: 'geojson',
				data: { type: 'Feature', properties: {}, geometry: selectedTown.boundaryGeoJSON }
			});
			previewMap.addLayer({
				id: 'boundary-fill',
				type: 'fill',
				source: 'boundary',
				paint: { 'fill-color': accentColor, 'fill-opacity': 0.18 }
			});
			previewMap.addLayer({
				id: 'boundary-outline',
				type: 'line',
				source: 'boundary',
				paint: { 'line-color': accentColor, 'line-width': 4, 'line-opacity': 0.9 }
			});

			// Add pin if location is selected
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

	// Re-init preview when map style or accent color changes
	$effect(() => {
		const _deps = [mapStyle, accentColor, selectedTown?.displayName, selectedLocation?.lat];
		void _deps;
		if (mapContainer && selectedTown) {
			updatePreviewMap();
		}
	});

	// ── Export ──
	async function handleExport() {
		if (isExporting || !selectedTown?.boundaryGeoJSON || !selectedLocation) return;

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
					boundaryGeoJSON: selectedTown.boundaryGeoJSON,
					boundaryBbox: selectedTown.boundingBox,
					pinLocation: [selectedLocation.lng, selectedLocation.lat],
					mapStyle,
					accentColor,
					fontId,
					aspectRatio,
					secondaryColor
				},
				(msg) => { progressMsg = msg; },
				abortController.signal
			);

			videoBlob = result.blob;
			videoUrl = result.url;
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
		const ext = getFileExtension(mimeType);
		const filename = `spotlight-${(displayName || 'location').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${ext}`;

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
		<h2 class="text-lg font-bold">Location Spotlight</h2>
		<p class="text-sm text-text-muted mt-1">
			Generate a short video that zooms from a town overview into a specific location.
		</p>
	</div>

	{#if exportDone && videoUrl}
		<!-- Result -->
		<div class="space-y-4">
			<video
				src={videoUrl}
				controls
				playsinline
				class="w-full rounded-xl border-2 border-border"
			></video>

			<div class="flex gap-3">
				<Button variant="primary" onclick={handleDownload}>
					Save Video
				</Button>
				<Button variant="ghost" onclick={handleReset}>
					Make Another
				</Button>
			</div>
		</div>
	{:else}
		<!-- Step 1: Town search -->
		<div class="space-y-1.5">
			<label class="block text-sm font-semibold">Town / City</label>
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
						<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></div>
					</div>
				{/if}
				{#if townOpen && townResults.length > 0}
					<div class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] overflow-hidden max-h-60 overflow-y-auto">
						{#each townResults as town}
							<button
								class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-border transition-colors cursor-pointer"
								onclick={() => selectTown(town)}
							>
								<span class="font-medium">{town.displayName.split(',')[0]}</span>
								<span class="text-text-muted text-xs ml-1">{town.displayName.split(',').slice(1).join(',').trim()}</span>
								{#if !town.boundaryGeoJSON}
									<span class="text-xs text-warning ml-1">(no boundary)</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
				{#if townOpen && !townLoading && townQuery.length >= 2 && townResults.length === 0}
					<div class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] p-3">
						<p class="text-sm text-text-muted">No results found</p>
					</div>
				{/if}
			</div>
			{#if selectedTown}
				<p class="text-xs text-text-muted">
					Selected: {selectedTown.displayName.split(',').slice(0, 2).join(', ')}
					{#if selectedTown.boundaryGeoJSON}
						<span class="text-accent"> — boundary found</span>
					{/if}
				</p>
			{/if}
		</div>

		<!-- Step 2: Location search -->
		{#if selectedTown}
			<div class="space-y-1.5">
				<label class="block text-sm font-semibold">Location</label>
				<div class="relative location-search">
					<input
						type="text"
						placeholder="Search for a place within the town..."
						bind:value={locationQuery}
						oninput={handleLocationInput}
						onfocus={() => (locationOpen = true)}
						class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
					/>
					{#if locationLoading}
						<div class="absolute right-3 top-2.5">
							<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></div>
						</div>
					{/if}
					{#if locationOpen && locationSuggestions.length > 0}
						<div class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] overflow-hidden max-h-60 overflow-y-auto">
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
						<div class="absolute z-20 mt-1 w-full bg-card border-2 border-border rounded-lg shadow-[4px_4px_0_var(--color-border)] p-3">
							<p class="text-sm text-text-muted">No results found</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Map preview -->
		{#if selectedTown}
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
		{#if selectedTown}
			<div class="space-y-3">
				<!-- Map style -->
				<div class="space-y-1.5">
					<label class="block text-sm font-semibold">Map Style</label>
					<div class="flex flex-wrap gap-2">
						{#each mapStyles as style}
							<button
								class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
									{mapStyle === style.value ? 'border-accent bg-accent text-white' : 'border-border bg-card text-text-secondary hover:bg-border'}"
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
									{aspectRatio === ar.value ? 'border-accent bg-accent text-white' : 'border-border bg-card text-text-secondary hover:bg-border'}"
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
					<ColorPicker bind:selected={accentColor} colors={brandColors.length > 0 ? brandColors : (profileState.profile?.brandColors?.length ? profileState.profile.brandColors : DEFAULT_BRAND_COLORS)} />
				</div>
			</div>
		{/if}

		<!-- Export button -->
		{#if error}
			<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
				<p class="text-sm text-red-400">{error}</p>
				<button
					class="text-sm text-accent underline mt-1 cursor-pointer"
					onclick={() => { error = null; handleExport(); }}
				>
					Retry
				</button>
			</div>
		{/if}

		{#if isExporting}
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<div class="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin"></div>
					<span class="text-sm text-text-secondary">{progressMsg}</span>
				</div>
				<button
					class="text-sm text-text-muted underline cursor-pointer"
					onclick={handleCancel}
				>
					Cancel
				</button>
			</div>
		{:else if !exportDone}
			<div class="pt-2">
				<Button variant="primary" size="lg" disabled={!canExport} onclick={handleExport}>
					Export Spotlight Video
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
