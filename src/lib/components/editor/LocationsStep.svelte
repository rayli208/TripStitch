<script lang="ts">
	import type { Location, TransportMode, AnimationStyle } from '$lib/types';
	import { suggestTransportMode } from '$lib/utils/distance';
	import LocationSearch from './LocationSearch.svelte';
	import MediaUpload from './MediaUpload.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		locations,
		canAdd,
		onadd,
		onremove,
		onaddclip,
		onremoveclip,
		onmoveclip,
		ontransport,
		onlabel,
		ondescription,
		onrating,
		onclipanimation,
		onnext,
		onback
	}: {
		locations: Location[];
		canAdd: boolean;
		onadd: (loc: { name: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null }) => void;
		onremove: (id: string) => void;
		onaddclip: (locationId: string, file: File) => void;
		onremoveclip: (locationId: string, clipId: string) => void;
		onmoveclip: (locationId: string, fromIndex: number, toIndex: number) => void;
		ontransport: (id: string, mode: TransportMode) => void;
		onlabel: (id: string, label: string) => void;
		ondescription: (id: string, description: string) => void;
		onrating: (id: string, rating: number | null) => void;
		onclipanimation: (locationId: string, clipId: string, style: AnimationStyle) => void;
		onnext: () => void;
		onback: () => void;
	} = $props();

	const ANIMATION_OPTIONS: { value: AnimationStyle; label: string }[] = [
		{ value: 'kenBurns', label: 'Ken Burns' },
		{ value: 'zoomIn', label: 'Zoom In' },
		{ value: 'panHorizontal', label: 'Pan' },
		{ value: 'static', label: 'Static' }
	];

	// Wizard state: 'search' | 'card'
	let wizardPhase = $state<'search' | 'card'>(locations.length === 0 ? 'search' : 'card');
	let activeIndex = $state(Math.max(0, locations.length - 1));

	let canProceed = $derived(locations.length >= 2);
	let activeLoc = $derived(locations[activeIndex] as Location | undefined);
	let activeLocHasClips = $derived(activeLoc ? activeLoc.clips.length > 0 : false);

	// Clip drag-and-drop state
	let clipDragFromIndex: number | null = $state(null);
	let clipDragOverIndex: number | null = $state(null);

	function handleClipDragStart(e: DragEvent, index: number) {
		clipDragFromIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleClipDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		clipDragOverIndex = index;
	}

	function handleClipDrop(e: DragEvent, index: number) {
		e.preventDefault();
		if (clipDragFromIndex !== null && clipDragFromIndex !== index && activeLoc) {
			onmoveclip(activeLoc.id, clipDragFromIndex, index);
		}
		clipDragFromIndex = null;
		clipDragOverIndex = null;
	}

	function handleClipDragEnd() {
		clipDragFromIndex = null;
		clipDragOverIndex = null;
	}

	function handleAdd(loc: { name: string; lat: number; lng: number }) {
		onadd(loc);
		// Auto-suggest transport if there's a previous location
		const newIndex = locations.length; // index after add
		if (newIndex > 0) {
			const prev = locations[newIndex - 1];
			const suggested = suggestTransportMode(prev.lat, prev.lng, loc.lat, loc.lng);
			// We need to wait for the location to be added, then set transport
			// The new location will be at index `newIndex` after the state updates
			setTimeout(() => {
				const newLoc = locations[newIndex];
				if (newLoc && !newLoc.transportMode) {
					ontransport(newLoc.id, suggested);
				}
			}, 0);
		}
		activeIndex = newIndex;
		wizardPhase = 'card';
	}

	function handleRemove() {
		if (!activeLoc) return;
		onremove(activeLoc.id);
		if (locations.length <= 1) {
			activeIndex = 0;
			wizardPhase = 'search';
		} else if (activeIndex >= locations.length - 1 && activeIndex > 0) {
			activeIndex = activeIndex - 1;
		}
	}

	function addAnother() {
		wizardPhase = 'search';
	}

	// Keep activeIndex in bounds when locations change
	$effect(() => {
		if (locations.length === 0) {
			activeIndex = 0;
			wizardPhase = 'search';
		} else if (activeIndex >= locations.length) {
			activeIndex = locations.length - 1;
		}
	});
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-xl font-semibold mb-1">Add Stops</h2>
		<p class="text-sm text-text-muted">
			{#if locations.length === 0}
				Search for your first stop to get started.
			{:else if locations.length < 2}
				Add at least one more stop to create your trip.
			{:else}
				Looking good! Add more stops or continue to review.
			{/if}
		</p>
	</div>

	<!-- Location pills summary -->
	{#if locations.length > 0}
		<div class="flex items-center gap-1.5 flex-wrap">
			{#each locations as loc, i (loc.id)}
				{#if i > 0}
					<svg class="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				{/if}
				<button
					class="px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer
						{i === activeIndex && wizardPhase === 'card'
						? 'bg-accent text-white'
						: 'bg-border text-text-muted hover:bg-primary-light hover:text-white'}"
					onclick={() => { activeIndex = i; wizardPhase = 'card'; }}
				>
					{loc.label || loc.name.split(',')[0]}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Wizard: Search phase -->
	{#if wizardPhase === 'search'}
		<div class="space-y-3">
			{#if locations.length > 0}
				<p class="text-sm text-text-secondary font-medium">
					Where did you go next?
				</p>
			{/if}
			<LocationSearch onselect={handleAdd} />
			{#if locations.length > 0}
				<button
					class="text-xs text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
					onclick={() => (wizardPhase = 'card')}
				>
					Cancel
				</button>
			{/if}
		</div>

	<!-- Wizard: Location card phase -->
	{:else if activeLoc}
		<div class="bg-card border border-border rounded-2xl overflow-hidden">
			<!-- Location header -->
			<div class="p-4 border-b border-border">
				<div class="flex items-center justify-between">
					<div class="min-w-0 flex-1">
						<input
							type="text"
							class="bg-transparent text-base font-semibold text-text-primary w-full outline-none border-b border-transparent focus:border-border transition-colors"
							placeholder={activeLoc.name.split(',')[0]}
							value={activeLoc.label ?? ''}
							oninput={(e) => onlabel(activeLoc!.id, (e.target as HTMLInputElement).value)}
						/>
						<p class="text-xs text-text-muted mt-0.5 truncate">
							{activeLoc.name}
						</p>
					</div>
					<button
						class="text-text-muted hover:text-error transition-colors cursor-pointer p-2 -mr-2"
						onclick={handleRemove}
						title="Remove location"
					>
						<svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
					</button>
				</div>
				<!-- Rating -->
				<div class="flex items-center gap-2 mt-2">
					<span class="text-xs text-text-muted">Rating</span>
					<StarRating rating={activeLoc.rating} onchange={(r) => onrating(activeLoc!.id, r)} size="sm" />
				</div>
				<!-- Description -->
				<div class="mt-2">
					<textarea
						class="w-full bg-transparent text-sm text-text-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-accent transition-colors resize-none"
						placeholder="Add a note about this stop..."
						rows="2"
						value={activeLoc.description ?? ''}
						oninput={(e) => ondescription(activeLoc!.id, (e.target as HTMLTextAreaElement).value)}
					></textarea>
					<p class="text-xs text-text-muted mt-0.5">Won't appear in the video — shows on your shared trip page.</p>
				</div>
			</div>

			<!-- Clips list -->
			<div class="p-4">
				<span class="text-xs text-text-muted block mb-2">
					Clips ({activeLoc.clips.length})
				</span>

				{#if activeLoc.clips.length > 0}
					<div class="space-y-2 mb-3">
						{#each [...activeLoc.clips].sort((a, b) => a.order - b.order) as clip, ci (clip.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="flex items-center gap-2 p-2 rounded-lg border transition-colors
									{clipDragOverIndex === ci && clipDragFromIndex !== ci
									? 'border-accent bg-accent/5'
									: 'border-border bg-card'}"
								draggable="true"
								ondragstart={(e) => handleClipDragStart(e, ci)}
								ondragover={(e) => handleClipDragOver(e, ci)}
								ondrop={(e) => handleClipDrop(e, ci)}
								ondragend={handleClipDragEnd}
							>
								<!-- Drag handle -->
								<div class="cursor-grab text-text-muted flex-shrink-0">
									<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
										<circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
										<circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
										<circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
									</svg>
								</div>

								<!-- Thumbnail -->
								<div class="w-10 h-10 rounded overflow-hidden bg-card flex-shrink-0">
									{#if clip.previewUrl}
										{#if clip.type === 'video'}
											<!-- svelte-ignore a11y_media_has_caption -->
											<video src={clip.previewUrl} class="w-full h-full object-cover" muted></video>
										{:else}
											<img src={clip.previewUrl} alt="Clip" class="w-full h-full object-cover" />
										{/if}
									{:else}
										<div class="w-full h-full flex items-center justify-center text-text-muted text-xs">--</div>
									{/if}
								</div>

								<!-- Type label + animation picker -->
								<div class="flex-1 min-w-0">
									<span class="text-xs font-medium text-text-secondary capitalize">{clip.type ?? 'unknown'}</span>
									{#if clip.type === 'photo'}
										<select
											class="ml-2 text-xs bg-card border border-border rounded px-1 py-0.5 text-text-muted"
											value={clip.animationStyle}
											onchange={(e) => onclipanimation(activeLoc!.id, clip.id, (e.target as HTMLSelectElement).value as AnimationStyle)}
										>
											{#each ANIMATION_OPTIONS as opt}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
									{/if}
								</div>

								<!-- Remove clip -->
								<button
									class="text-text-muted hover:text-error transition-colors cursor-pointer p-1 flex-shrink-0"
									onclick={() => onremoveclip(activeLoc!.id, clip.id)}
									title="Remove clip"
								>
									<svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add clip button (always present) -->
				<MediaUpload
					previewUrl={null}
					onfile={(file) => onaddclip(activeLoc!.id, file)}
				/>
			</div>

			<!-- Prev / Next within locations -->
			{#if locations.length > 1}
				<div class="flex items-center justify-between p-4 pt-0">
					<button
						class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={activeIndex === 0}
						onclick={() => activeIndex--}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
						Prev stop
					</button>
					<button
						class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={activeIndex === locations.length - 1}
						onclick={() => activeIndex++}
					>
						Next stop
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				</div>
			{/if}
		</div>

		<!-- Add another stop button -->
		{#if canAdd}
			{#if activeLocHasClips}
				<button
					class="w-full py-4 border-2 border-dashed border-accent/50 rounded-xl text-sm font-semibold text-accent hover:bg-accent/10 hover:border-accent transition-all cursor-pointer flex items-center justify-center gap-2"
					onclick={addAnother}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Add another stop
				</button>
			{:else}
				<div class="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-muted text-center opacity-60">
					Add a photo or video to this stop first
				</div>
			{/if}
		{:else}
			<p class="text-sm text-warning text-center">Maximum of 10 locations reached.</p>
		{/if}

	{:else}
		<div class="text-center py-8">
			<p class="text-text-muted text-sm">No locations added yet. Search for a place to get started.</p>
		</div>
	{/if}

	<!-- Bottom nav -->
	<div class="flex justify-between pt-2">
		<Button variant="ghost" onclick={onback}>Back</Button>
		<Button variant="primary" disabled={!canProceed} onclick={onnext}>
			{#if !canProceed}
				Add at least 2 stops
			{:else}
				Next: Review
			{/if}
		</Button>
	</div>
</div>
