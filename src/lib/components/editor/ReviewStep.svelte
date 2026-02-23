<script lang="ts">
	import type { Location, TransportMode, MapStyle } from '$lib/types';
	import { haversineDistance, estimateTravelTime, suggestTransportMode } from '$lib/utils/distance';
	import TransportPicker from './TransportPicker.svelte';
	import RoutePreviewMap from './RoutePreviewMap.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		locations,
		keepOriginalAudio = $bindable(true),
		mapStyle = 'streets',
		titleColor = '#FFFFFF',
		onremove,
		onmove,
		ontransport,
		onlabel,
		onnext,
		onback
	}: {
		locations: Location[];
		keepOriginalAudio?: boolean;
		mapStyle?: MapStyle;
		titleColor?: string;
		onremove: (id: string) => void;
		onmove: (from: number, to: number) => void;
		ontransport: (id: string, mode: TransportMode) => void;
		onlabel: (id: string, label: string) => void;
		onnext: () => void;
		onback: () => void;
	} = $props();

	const hasVideoWithAudio = $derived(locations.some((l) => l.clips.some((c) => c.type === 'video' && c.file)));

	// Stats
	let totalMiles = $derived(() => {
		let total = 0;
		for (let i = 1; i < locations.length; i++) {
			total += haversineDistance(
				locations[i - 1].lat, locations[i - 1].lng,
				locations[i].lat, locations[i].lng
			);
		}
		return total;
	});

	let totalMinutes = $derived(() => {
		let total = 0;
		for (let i = 1; i < locations.length; i++) {
			const dist = haversineDistance(
				locations[i - 1].lat, locations[i - 1].lng,
				locations[i].lat, locations[i].lng
			);
			const mode = locations[i].transportMode ?? 'drove';
			total += estimateTravelTime(dist, mode);
		}
		return total;
	});

	let mediaCount = $derived(locations.reduce((sum, l) => sum + l.clips.filter((c) => c.file).length, 0));

	// Location drag-and-drop state
	let locDragFromIndex: number | null = $state(null);
	let locDragOverIndex: number | null = $state(null);

	function handleLocDragStart(e: DragEvent, index: number) {
		locDragFromIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleLocDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		locDragOverIndex = index;
	}

	function handleLocDrop(e: DragEvent, index: number) {
		e.preventDefault();
		if (locDragFromIndex !== null && locDragFromIndex !== index) {
			onmove(locDragFromIndex, index);
		}
		locDragFromIndex = null;
		locDragOverIndex = null;
	}

	function handleLocDragEnd() {
		locDragFromIndex = null;
		locDragOverIndex = null;
	}
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-xl font-semibold mb-1">Review Your Trip</h2>
		<p class="text-sm text-text-muted">
			Drag to reorder stops, pick how you traveled between them, and review your media.
		</p>
	</div>

	<!-- Stats bar -->
	<div class="flex items-center justify-center gap-4 py-3 px-4 bg-card rounded-xl border border-border">
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">{locations.length}</p>
			<p class="text-xs text-text-muted">stops</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">
				{totalMiles() < 10 ? totalMiles().toFixed(1) : Math.round(totalMiles())}
			</p>
			<p class="text-xs text-text-muted">miles</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">~{Math.round(totalMinutes())}</p>
			<p class="text-xs text-text-muted">min</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">{mediaCount}</p>
			<p class="text-xs text-text-muted">clips</p>
		</div>
	</div>

	<!-- Map preview -->
	{#if locations.length >= 2}
		<RoutePreviewMap {locations} {mapStyle} {titleColor} />
	{/if}

	<!-- Location list -->
	<div class="space-y-0">
		{#each locations as loc, i (loc.id)}
			<!-- Transport picker between stops -->
			{#if i > 0}
				<div class="flex items-center gap-2 py-2 pl-6">
					<div class="w-px h-4 bg-border"></div>
					<TransportPicker
						mode={loc.transportMode}
						onchange={(mode) => ontransport(loc.id, mode)}
					/>
					{#if !loc.transportMode}
						<span class="text-xs text-text-muted italic">
							suggestion: {suggestTransportMode(locations[i-1].lat, locations[i-1].lng, loc.lat, loc.lng)}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Location row -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex items-center gap-3 p-3 bg-card border rounded-xl transition-colors
					{locDragOverIndex === i && locDragFromIndex !== i
					? 'border-accent bg-accent/5'
					: 'border-border'}"
				draggable="true"
				ondragstart={(e) => handleLocDragStart(e, i)}
				ondragover={(e) => handleLocDragOver(e, i)}
				ondrop={(e) => handleLocDrop(e, i)}
				ondragend={handleLocDragEnd}
			>
				<!-- Drag handle -->
				<div class="cursor-grab text-text-muted flex-shrink-0">
					<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
						<circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
						<circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
						<circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
					</svg>
				</div>

				<!-- Order number -->
				<div class="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
					{i + 1}
				</div>

				<!-- Media thumbnail -->
				<div class="w-10 h-10 rounded-lg overflow-hidden bg-card flex-shrink-0">
					{#if loc.clips[0]?.previewUrl}
						{#if loc.clips[0].type === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={loc.clips[0].previewUrl} class="w-full h-full object-cover" muted></video>
						{:else}
							<img src={loc.clips[0].previewUrl} alt={loc.name} class="w-full h-full object-cover" />
						{/if}
					{:else}
						<div class="w-full h-full flex items-center justify-center text-text-muted text-xs">
							--
						</div>
					{/if}
				</div>

				<!-- Name + clip count + rating -->
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-text-primary truncate">{loc.label || loc.name.split(',')[0]}</p>
					<div class="flex items-center gap-2">
						{#if loc.clips.length > 0}
							<p class="text-xs text-text-muted">{loc.clips.length} clip{loc.clips.length !== 1 ? 's' : ''}</p>
						{:else if i === 0}
							<p class="text-xs text-text-muted">Starting point</p>
						{/if}
						{#if loc.rating}
							<div class="flex items-center gap-0.5">
								{#each Array(5) as _, s}
									<svg class="w-3 h-3 {s < loc.rating ? 'text-amber-400' : 'text-border'}" viewBox="0 0 20 20" fill="currentColor">
										<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
									</svg>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Delete -->
				<button
					class="text-text-muted hover:text-error transition-colors cursor-pointer p-1 flex-shrink-0"
					onclick={() => onremove(loc.id)}
					title="Remove location"
				>
					<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		{/each}
	</div>

	<!-- Audio settings -->
	{#if hasVideoWithAudio}
		<div class="p-4 bg-card rounded-xl border border-border">
			<label class="flex items-center justify-between cursor-pointer select-none">
				<div>
					<p class="text-sm font-medium text-text-primary">Keep original audio</p>
					<p class="text-xs text-text-muted">Video audio will be dimmed during voice-over</p>
				</div>
				<div class="relative flex-shrink-0 ml-3">
					<input
						type="checkbox"
						bind:checked={keepOriginalAudio}
						class="sr-only"
					/>
					<div class="w-11 h-6 rounded-full transition-colors {keepOriginalAudio ? 'bg-accent' : 'bg-border'}"></div>
					<div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform {keepOriginalAudio ? 'translate-x-5' : ''}"></div>
				</div>
			</label>
		</div>
	{/if}

	<!-- Bottom nav -->
	<div class="flex justify-between pt-2">
		<Button variant="ghost" onclick={onback}>Back</Button>
		<Button variant="primary" onclick={onnext}>
			Next: Export
		</Button>
	</div>
</div>
