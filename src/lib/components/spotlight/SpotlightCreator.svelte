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
	import { Warning, ArrowLeft } from 'phosphor-svelte';
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

	// Combined Export Format selector — collapses exportMode + loopable into 3 friendly options
	type ExportFormat = 'alpha' | 'loop' | 'standard';
	const exportFormat: ExportFormat = $derived(
		exportMode === 'alpha' ? 'alpha' : loopable ? 'loop' : 'standard'
	);
	function setExportFormat(fmt: ExportFormat) {
		if (fmt === 'alpha') {
			exportMode = 'alpha';
		} else if (fmt === 'loop') {
			exportMode = 'opaque';
			loopable = true;
		} else {
			exportMode = 'opaque';
			loopable = false;
		}
	}

	// Estimated file size hint (very rough — based on duration & mode)
	const estSizeMb = $derived.by(() => {
		const baseRate = exportMode === 'alpha' ? 1.6 : 1.1; // MB per second
		return Math.max(1, Math.round(durationSec * baseRate));
	});

	// Resolution label per aspect ratio (matches output)
	const resolutionLabel = $derived(
		aspectRatio === '16:9' ? '1920×1080' : aspectRatio === '1:1' ? '1080×1080' : '1080×1920'
	);

	const formatLabel = $derived(
		exportFormat === 'alpha' ? 'Transparent WebM' : exportFormat === 'loop' ? 'Loop MP4' : 'Standard MP4'
	);

	// ── Selected-state styling: use the user's primary brand color (accentColor)
	// so the spotlight reflects their brand instead of the global app accent. ──
	const selectedSolid = $derived(
		`background: ${accentColor}; border-color: ${accentColor}; color: white;`
	);
	const selectedSoft = $derived(
		`background: color-mix(in srgb, ${accentColor} 14%, transparent); border-color: ${accentColor};`
	);

	// ── Mobile tabs ──
	type MobileTab = 'data' | 'design' | 'export';
	const TAB_ORDER: MobileTab[] = ['data', 'design', 'export'];
	let mobileTab = $state<MobileTab>('data');
	const mobileTabClass = (tab: MobileTab) => mobileTab === tab ? '' : 'hidden md:block';

	const mobileTabIndex = $derived(TAB_ORDER.indexOf(mobileTab));
	const nextMobileTabLabel = $derived(
		mobileTab === 'data' ? 'Next: Design' : mobileTab === 'design' ? 'Next: Export' : ''
	);

	function nextMobileTab() {
		const i = TAB_ORDER.indexOf(mobileTab);
		if (i < TAB_ORDER.length - 1) mobileTab = TAB_ORDER[i + 1];
	}
	function prevMobileTab() {
		const i = TAB_ORDER.indexOf(mobileTab);
		if (i > 0) mobileTab = TAB_ORDER[i - 1];
	}

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

	let locationSearchError = $state<string | null>(null);

	async function callPlacesAutocomplete(input: string, useBias: boolean): Promise<{ placeId: string; text: string }[]> {
		const body: Record<string, unknown> = { input };
		if (useBias && selectedTown) {
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
		if (!res.ok) {
			const msg = data?.error?.message ?? `${res.status} ${res.statusText}`;
			throw new Error(msg);
		}
		return (data.suggestions ?? [])
			.filter((s: Record<string, unknown>) => s.placePrediction)
			.map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
				placeId: s.placePrediction.placeId,
				text: s.placePrediction.text.text
			}));
	}

	async function fetchLocationSuggestions(input: string) {
		locationLoading = true;
		locationSearchError = null;
		try {
			// First try with the town as a soft bias
			let results = await callPlacesAutocomplete(input, true);
			// If the bias filtered too aggressively (no hits) AND we used a town, retry without bias
			if (results.length === 0 && selectedTown) {
				results = await callPlacesAutocomplete(input, false);
			}
			locationSuggestions = results;
		} catch (err) {
			console.warn('[Spotlight] Location search failed:', err);
			locationSuggestions = [];
			locationSearchError = err instanceof Error ? err.message : 'Search failed';
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

		const mod = await import('maplibre-gl');
		const maplibregl: any = (mod as any).default ?? mod;

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
				const data = { type: 'Feature' as const, properties: {}, geometry: geojson };
				// Idempotent: if a previous load already added the source (which can
				// happen when the same map fires `load` twice across a style change),
				// just update its data instead of throwing "Source 'context' already exists".
				if (previewMap.getSource('context')) {
					(previewMap.getSource('context') as any).setData(data);
				} else {
					previewMap.addSource('context', { type: 'geojson', data });
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
		// Cinematic pin: white outer ring + brand-color dot + soft halo, matching the trip view marker style
		const el = document.createElement('div');
		el.style.cssText = `
			position: relative;
			width: 32px; height: 32px;
			cursor: pointer;
		`;
		el.innerHTML = `
			<span style="
				position: absolute; inset: 0;
				border-radius: 50%;
				background: ${accentColor}33;
				animation: ts-pin-pulse 2s ease-out infinite;
			"></span>
			<span style="
				position: absolute; inset: 6px;
				border-radius: 50%;
				background: ${accentColor};
				border: 3px solid white;
				box-shadow: 0 2px 10px rgba(0,0,0,0.45);
			"></span>
		`;
		// Inject keyframes once
		if (!document.getElementById('ts-pin-pulse-style')) {
			const style = document.createElement('style');
			style.id = 'ts-pin-pulse-style';
			style.textContent = `
				@keyframes ts-pin-pulse {
					0% { transform: scale(0.8); opacity: 0.7; }
					70% { transform: scale(1.5); opacity: 0; }
					100% { transform: scale(1.5); opacity: 0; }
				}
			`;
			document.head.appendChild(style);
		}
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

{#if exportDone && videoUrl}
	<!-- Result view (single-column, no two-pane) -->
	<div class="md:max-w-3xl md:mx-auto space-y-5">
		<div>
			<h2 class="text-2xl font-bold">Your overlay is ready</h2>
			<p class="text-sm text-text-muted mt-1">
				Drop the file onto your DaVinci, Premiere, or CapCut timeline.
			</p>
		</div>

		<div class="relative rounded-xl border-2 border-border overflow-hidden">
			{#if videoHasAlpha}
				<div
					class="absolute inset-0"
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
				class="relative w-full"
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

		<div class="flex flex-col-reverse sm:flex-row gap-3">
			<Button variant="ghost" onclick={handleReset} class="w-full sm:w-auto">Make another</Button>
			<Button variant="primary" onclick={handleDownload} class="w-full sm:w-auto">Save video</Button>
		</div>
	</div>
{:else}
<div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-6 md:gap-8 pb-24 md:pb-0">
	<!-- ═══════════ LEFT PANE — TOP: Heading + location selection ═══════════ -->
	<div class="order-2 md:order-none space-y-5 min-w-0 md:col-start-1 md:row-start-1">
		<!-- Desktop heading (mobile uses tab bar instead, sits below the sticky canvas) -->
		<div class="hidden md:block">
			<p class="text-[11px] font-bold uppercase tracking-wider text-accent">Location Spotlight (Pro)</p>
			<h2 class="text-2xl font-bold mt-0.5">Build your overlay</h2>
			<p class="text-sm text-text-muted mt-1">
				Drop into DaVinci, Premiere, or CapCut as a clip or graphic. Export as transparent WebM, seamless loop, or standard MP4.
			</p>
		</div>

		<!-- Mobile tab bar (appears after sticky canvas due to grid order) -->
		<div class="md:hidden sticky z-20 bg-page -mx-4 px-4 border-b-2 border-border" style="top: calc(3.5rem + 1px);">
			<div class="flex gap-0">
				{#each [
					{ id: 'design', label: 'Design' },
					{ id: 'data', label: 'Data' },
					{ id: 'export', label: 'Export' }
				] as t (t.id)}
					<button
						type="button"
						class="flex-1 text-center py-3 text-sm font-bold transition-colors cursor-pointer relative {mobileTab === t.id ? '' : 'text-text-muted hover:text-text-primary'}"
						style={mobileTab === t.id ? `color: ${accentColor};` : ''}
						onclick={() => (mobileTab = t.id as MobileTab)}
					>
						{t.label}
						{#if mobileTab === t.id}
							<span class="absolute left-2 right-2 -bottom-0.5 h-0.5 rounded-full" style="background: {accentColor};"></span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- DATA tab section (Town + Place) — visible on mobile when data tab; always visible on desktop -->
		<div class="space-y-5 {mobileTabClass('data')}">
		<!-- Step 1: Town search (optional in radius mode) -->
		<div class="space-y-1.5">
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
				Town or Region
				{#if contextShape === 'radius'}
					<span class="font-normal normal-case text-text-muted">(optional)</span>
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
								class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-accent-light hover:text-text-primary transition-colors cursor-pointer"
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
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
				Specific place <span class="font-normal normal-case">(optional)</span>
			</label>
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
								class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-accent-light hover:text-text-primary transition-colors cursor-pointer"
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
						{#if locationSearchError}
							<p class="text-sm font-bold text-error">Search failed</p>
							<p class="text-xs text-text-muted mt-0.5">{locationSearchError}</p>
							<p class="text-xs text-text-muted mt-1">Check the Google Places API key and that the Places API (New) is enabled.</p>
						{:else}
							<p class="text-sm text-text-muted">No results found</p>
							{#if selectedTown}
								<p class="text-xs text-text-muted mt-1">Try a more specific name, or search without a town selected.</p>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Editable name & address -->
		{#if selectedLocation}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Display name</label>
					<input
						type="text"
						bind:value={displayName}
						placeholder="Location name..."
						class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
					/>
				</div>
				<div class="space-y-1.5">
					<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Display address</label>
					<input
						type="text"
						bind:value={displayAddress}
						placeholder="Address..."
						class="w-full rounded-lg bg-card border-2 border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
					/>
				</div>
			</div>
		{/if}
		</div><!-- /DATA tab section (top portion) -->
	</div><!-- /LEFT PANE TOP -->

	<!-- ═══════════ LEFT PANE — BOTTOM: Settings + Export (appears below canvas on mobile) ═══════════ -->
	<div class="order-3 md:order-none space-y-5 min-w-0 md:col-start-1 md:row-start-2">
		<!-- Settings -->
		{#if selectedLocation || selectedTown}
			<div class="space-y-4">
				<!-- Boundary (DATA tab on mobile) -->
				<div class="{mobileTabClass('data')} space-y-1.5">
					<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Boundary</label>
					<div class="grid grid-cols-2 gap-2">
						<button
							class="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors cursor-pointer
								{contextShape === 'boundary'
								? 'shadow-[2px_2px_0_var(--color-border)]'
								: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}
								{!selectedTown?.boundaryGeoJSON ? 'opacity-50 cursor-not-allowed' : ''}"
							style={contextShape === 'boundary' ? selectedSolid : ''}
							onclick={() => (contextShape = 'boundary')}
							disabled={!selectedTown?.boundaryGeoJSON}
							title={selectedTown?.boundaryGeoJSON
								? 'Use the official town boundary'
								: 'Select a town with an official boundary to enable this'}
						>
							Official
						</button>
						<button
							class="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors cursor-pointer
								{contextShape === 'radius'
								? 'shadow-[2px_2px_0_var(--color-border)]'
								: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
							style={contextShape === 'radius' ? selectedSolid : ''}
							onclick={() => (contextShape = 'radius')}
						>
							Radius
						</button>
					</div>
					<p class="text-xs text-text-muted">
						{contextShape === 'boundary'
							? 'Off-boundary fade animates from the town shape into the pin.'
							: 'Custom radius around the pin — for landmarks or neighborhoods.'}
					</p>
				</div>

				<!-- Radius controls (only shown in radius mode) -->
				{#if contextShape === 'radius'}
					<div class="{mobileTabClass('data')} space-y-1.5">
						<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Radius</label>
						<div class="flex items-center gap-2 flex-wrap">
							{#each radiusUnit === 'mi' ? RADIUS_PRESETS_MI : RADIUS_PRESETS_KM as preset}
								<button
									class="px-2.5 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusValue === preset
										? ''
										: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
									style={radiusValue === preset ? selectedSolid : ''}
									onclick={() => (radiusValue = preset)}
								>
									{preset}{radiusUnit}
								</button>
							{/each}
							<div class="flex items-center gap-1 ml-2">
								<button
									class="px-2 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusUnit === 'mi'
										? ''
										: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
									style={radiusUnit === 'mi' ? selectedSolid : ''}
									onclick={() => (radiusUnit = 'mi')}>mi</button
								>
								<button
									class="px-2 py-1 rounded-md text-xs font-medium border-2 transition-colors cursor-pointer
										{radiusUnit === 'km'
										? ''
										: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
									style={radiusUnit === 'km' ? selectedSolid : ''}
									onclick={() => (radiusUnit = 'km')}>km</button
								>
							</div>
						</div>
					</div>
				{/if}

				<!-- Map style (DESIGN tab on mobile) -->
				<div class="{mobileTabClass('design')} space-y-1.5">
					<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Map style</label>
					<div class="grid grid-cols-3 gap-2">
						{#each mapStyles as style}
							<button
								class="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors cursor-pointer
									{mapStyle === style.value
									? 'shadow-[2px_2px_0_var(--color-border)]'
									: 'border-border bg-card text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
								style={mapStyle === style.value ? selectedSolid : ''}
								onclick={() => (mapStyle = style.value)}
							>
								{style.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Export Format (EXPORT tab on mobile) -->
				<div class="{mobileTabClass('export')} space-y-1.5">
					<!-- Best on desktop warning (mobile only, only inside Export tab) -->
					<div class="md:hidden mb-3 flex items-start gap-2 rounded-xl border-2 border-warning/40 bg-warning/10 p-3">
						<Warning size={16} weight="fill" class="text-warning shrink-0 mt-0.5" />
						<div class="min-w-0">
							<p class="text-sm font-bold text-text-primary">Best on desktop</p>
							<p class="text-xs text-text-secondary mt-0.5 leading-relaxed">
								Mobile exports take 30–90s and use a lot of battery. For frequent exports, finish on a laptop or desktop.
							</p>
						</div>
					</div>
					<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Format</label>
					<div class="space-y-2">
						<!-- Transparent WebM -->
						<button
							class="w-full text-left px-3 py-2.5 rounded-lg border-2 transition-colors cursor-pointer flex items-start gap-3
								{exportFormat === 'alpha'
								? 'shadow-[2px_2px_0_var(--color-border)]'
								: 'border-border bg-card hover:bg-accent-light hover:text-text-primary'}
								{alphaSupported === false ? 'opacity-50 cursor-not-allowed' : ''}"
							style={exportFormat === 'alpha' ? selectedSoft : ''}
							onclick={() => setExportFormat('alpha')}
							disabled={alphaSupported === false}
						>
							<span class="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center {exportFormat === 'alpha' ? '' : 'border-border'}"
								style={exportFormat === 'alpha' ? `border-color: ${accentColor};` : ''}>
								{#if exportFormat === 'alpha'}
									<span class="w-2 h-2 rounded-full" style="background: {accentColor};"></span>
								{/if}
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-sm font-semibold text-text-primary">Transparent WebM</span>
								<span class="block text-xs text-text-muted mt-0.5">Drop straight on your timeline — no masking</span>
							</span>
						</button>

						<!-- Seamless loop MP4 -->
						<button
							class="w-full text-left px-3 py-2.5 rounded-lg border-2 transition-colors cursor-pointer flex items-start gap-3
								{exportFormat === 'loop'
								? 'shadow-[2px_2px_0_var(--color-border)]'
								: 'border-border bg-card hover:bg-accent-light hover:text-text-primary'}"
							style={exportFormat === 'loop' ? selectedSoft : ''}
							onclick={() => setExportFormat('loop')}
						>
							<span class="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center {exportFormat === 'loop' ? '' : 'border-border'}"
								style={exportFormat === 'loop' ? `border-color: ${accentColor};` : ''}>
								{#if exportFormat === 'loop'}
									<span class="w-2 h-2 rounded-full" style="background: {accentColor};"></span>
								{/if}
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-sm font-semibold text-text-primary">Seamless loop MP4</span>
								<span class="block text-xs text-text-muted mt-0.5">Slow orbit — loops cleanly under long voiceovers</span>
							</span>
						</button>

						<!-- Standard MP4 -->
						<button
							class="w-full text-left px-3 py-2.5 rounded-lg border-2 transition-colors cursor-pointer flex items-start gap-3
								{exportFormat === 'standard'
								? 'shadow-[2px_2px_0_var(--color-border)]'
								: 'border-border bg-card hover:bg-accent-light hover:text-text-primary'}"
							style={exportFormat === 'standard' ? selectedSoft : ''}
							onclick={() => setExportFormat('standard')}
						>
							<span class="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center {exportFormat === 'standard' ? '' : 'border-border'}"
								style={exportFormat === 'standard' ? `border-color: ${accentColor};` : ''}>
								{#if exportFormat === 'standard'}
									<span class="w-2 h-2 rounded-full" style="background: {accentColor};"></span>
								{/if}
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-sm font-semibold text-text-primary">Standard MP4</span>
								<span class="block text-xs text-text-muted mt-0.5">Opaque zoom-in — for rectangle crops</span>
							</span>
						</button>
					</div>
					{#if alphaSupported === false}
						<p class="text-xs text-warning">
							Transparent export isn't available in this browser. Open in Chrome, Edge, or Firefox.
						</p>
					{/if}
				</div>

				<!-- Advanced settings (DESIGN tab on mobile) -->
				<details class="{mobileTabClass('design')} rounded-lg border-2 border-border bg-card overflow-hidden">
					<summary class="cursor-pointer px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-accent-light hover:text-text-primary transition-colors">
						Advanced settings
					</summary>
					<div class="px-4 pb-4 pt-2 space-y-4 border-t border-border">
						<!-- Duration -->
						<div class="space-y-1.5">
							<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Duration</label>
							<div class="flex gap-2">
								{#each durations as d}
									<button
										class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
											{durationSec === d.value
											? ''
											: 'border-border bg-page text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
										style={durationSec === d.value ? selectedSolid : ''}
										onclick={() => (durationSec = d.value)}
									>
										{d.label}
									</button>
								{/each}
							</div>
						</div>

						<!-- Aspect ratio -->
						<div class="space-y-1.5">
							<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Aspect ratio</label>
							<div class="flex gap-2">
								{#each aspectRatios as ar}
									<button
										class="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors cursor-pointer
											{aspectRatio === ar.value
											? ''
											: 'border-border bg-page text-text-secondary hover:bg-accent-light hover:text-text-primary'}"
										style={aspectRatio === ar.value ? selectedSolid : ''}
										onclick={() => (aspectRatio = ar.value)}
									>
										{ar.label}
									</button>
								{/each}
							</div>
						</div>

						<!-- Accent color -->
						<div class="space-y-1.5">
							<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Accent color</label>
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
				</details>
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
			<!-- Desktop progress (mobile shows it inside the canvas overlay) -->
			<div class="hidden md:block space-y-3">
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
			<!-- Desktop CTA (mobile uses sticky bottom bar below) -->
			<div class="hidden md:block pt-2">
				<Button variant="primary" size="lg" disabled={!canExport} onclick={handleExport} class="w-full sm:w-auto">
					Export overlay clip
				</Button>
				{#if !support.canExport}
					<p class="text-xs text-text-muted mt-2">
						{support.warnings.join(' ')}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- ═══════════ RIGHT PANE: Map preview (top on mobile, sticky right column on desktop) ═══════════ -->
	<aside class="order-1 md:order-none md:col-start-2 md:row-start-1 md:row-span-2">
		<div class="md:sticky md:top-20 space-y-2">
			<header class="flex items-center justify-between">
				<span class="text-[11px] font-bold uppercase tracking-wider text-text-muted">Preview</span>
				<span class="text-[11px] font-mono text-text-muted">{resolutionLabel}</span>
			</header>

			<!-- Map preview — framed like the editor's video clip preview -->
			{#if selectedTown || selectedLocation}
				<div class="relative rounded-2xl overflow-hidden border-2 border-border shadow-[4px_4px_0_var(--color-border)] bg-overlay">
					<div
						bind:this={mapContainer}
						class="w-full h-[320px]"
					></div>

					<!-- Top-left "REC" / live preview badge, like a video clip frame -->
					<div class="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-overlay/70 backdrop-blur-sm border border-white/15">
						<span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: {accentColor};"></span>
						<span class="text-[10px] font-bold uppercase tracking-wider text-white/90">Live preview</span>
					</div>

					{#if selectedLocation}
						<!-- Location callout, matches the final exported overlay -->
						<div class="absolute left-3 bottom-3 z-10 bg-overlay/80 backdrop-blur-sm rounded-lg px-3 py-2 max-w-[70%] border border-white/10">
							<p class="text-sm font-bold text-white truncate leading-tight">
								{displayName || selectedLocation.name}
							</p>
							<p class="text-[11px] text-white/70 truncate leading-tight mt-0.5">
								{(displayAddress || selectedLocation.formattedAddress).split(',').slice(0, 2).join(',')}
							</p>
						</div>
					{/if}

					{#if isExporting}
						<div class="absolute inset-0 z-20 bg-overlay/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
							<div class="w-9 h-9 border-3 border-white/20 border-t-accent rounded-full animate-spin"></div>
							<span class="text-xs text-white/80">{progressMsg}</span>
							<button
								class="mt-1 text-xs text-white/60 hover:text-white underline cursor-pointer"
								onclick={handleCancel}
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<div class="w-full h-[320px] rounded-2xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-2 shadow-[4px_4px_0_var(--color-border)]">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted/50"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<p class="text-xs text-text-muted text-center px-6">Pick a town or place to preview the overlay</p>
				</div>
			{/if}

			<!-- Footer info: size, format, duration -->
			<div class="flex items-center justify-between text-[11px] font-mono text-text-muted px-1">
				<span>~{estSizeMb}MB</span>
				<span>·</span>
				<span class="truncate text-center flex-1 mx-2">{formatLabel}</span>
				<span>·</span>
				<span>~{durationSec}s</span>
			</div>
		</div>
	</aside>
</div>

<!-- Mobile sticky bottom CTA bar — Back / Next tab progression -->
<div class="md:hidden fixed left-0 right-0 z-30 border-t-2 border-border bg-page/95 backdrop-blur-sm" style="bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 8px);">
	<div class="max-w-lg mx-auto px-4 pt-3 pb-3 flex items-center gap-2">
		<button
			type="button"
			class="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border-2 border-border bg-card text-text-primary hover:bg-accent-light transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)] disabled:opacity-50"
			onclick={prevMobileTab}
			disabled={isExporting || mobileTabIndex === 0}
			aria-label="Previous tab"
		>
			<ArrowLeft size={18} weight="bold" />
		</button>
		{#if mobileTab === 'export'}
			<Button
				variant="primary"
				size="lg"
				disabled={!canExport || isExporting}
				onclick={handleExport}
				class="flex-1"
			>
				{isExporting ? 'Exporting…' : 'Export overlay →'}
			</Button>
		{:else}
			<Button
				variant="primary"
				size="lg"
				onclick={nextMobileTab}
				class="flex-1"
			>
				{nextMobileTabLabel} →
			</Button>
		{/if}
	</div>
</div>
{/if}
