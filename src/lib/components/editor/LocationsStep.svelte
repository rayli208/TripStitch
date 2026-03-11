<script lang="ts">
	import type { Location, Clip, TransportMode, AnimationStyle, PriceTier } from '$lib/types';
	import { suggestTransportMode } from '$lib/utils/distance';
	import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import LocationSearch from './LocationSearch.svelte';
	import MediaUpload from './MediaUpload.svelte';
	import TransportPicker from './TransportPicker.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { PRICE_TIERS } from '$lib/constants/tags';
	import { CaretLeft, CaretRight, Plus, Trash, X, Play, Pause, Image as ImageIcon, DotsSixVertical } from 'phosphor-svelte';

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
		onpricetier,
		onclipanimation,
		onclipduration,
		oncliptrim,
		onnext,
		onback
	}: {
		locations: Location[];
		canAdd: boolean;
		onadd: (loc: { name: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null }) => void;
		onremove: (id: string) => void;
		onaddclip: (locationId: string, file: File, durationSec?: number) => void;
		onremoveclip: (locationId: string, clipId: string) => void;
		onmoveclip: (locationId: string, fromIndex: number, toIndex: number) => void;
		ontransport: (id: string, mode: TransportMode) => void;
		onlabel: (id: string, label: string) => void;
		ondescription: (id: string, description: string) => void;
		onrating: (id: string, rating: number | null) => void;
		onpricetier: (id: string, tier: PriceTier | null) => void;
		onclipanimation: (locationId: string, clipId: string, style: AnimationStyle) => void;
		onclipduration: (locationId: string, clipId: string, durationSec: number) => void;
		oncliptrim: (locationId: string, clipId: string, start: number, end: number) => void;
		onnext: () => void;
		onback: () => void;
	} = $props();

	const ANIMATION_OPTIONS: { value: AnimationStyle; label: string }[] = [
		{ value: 'kenBurns', label: 'Ken Burns' },
		{ value: 'zoomIn', label: 'Zoom In' },
		{ value: 'panHorizontal', label: 'Pan' },
		{ value: 'static', label: 'Static' }
	];

	const FLIP_DURATION_MS = 200;

	// Wizard state: 'search' | 'card'
	let wizardPhase = $state<'search' | 'card'>(locations.length === 0 ? 'search' : 'card');
	let activeIndex = $state(Math.max(0, locations.length - 1));

	let allLocsHaveClips = $derived(locations.every(l => l.clips.length > 0));
	let canProceed = $derived(locations.length >= 2 && allLocsHaveClips);
	let activeLoc = $derived(locations[activeIndex] as Location | undefined);
	let activeLocHasClips = $derived(activeLoc ? activeLoc.clips.length > 0 : false);

	// Local mutable copy of clips for svelte-dnd-action (it needs to mutate items)
	let dndClips = $state<Clip[]>([]);

	// Sync from parent whenever the active location's clips change
	$effect(() => {
		const clips = activeLoc ? [...activeLoc.clips].sort((a, b) => a.order - b.order) : [];
		dndClips = clips;
	});

	// Video duration validation
	let clipError = $state<string | null>(null);
	let clipErrorTimeout: ReturnType<typeof setTimeout> | undefined;

	function showClipError(msg: string) {
		clipError = msg;
		if (clipErrorTimeout) clearTimeout(clipErrorTimeout);
		clipErrorTimeout = setTimeout(() => { clipError = null; }, 5000);
	}

	async function handleAddClip(locationId: string, file: File) {
		let durationSec: number | undefined;
		if (file.type.startsWith('video/')) {
			try {
				durationSec = await getVideoDuration(file);
				if (durationSec > 30) {
					showClipError(`Video is ${Math.round(durationSec)}s long. Maximum is 30 seconds.`);
					return;
				}
			} catch {
				// Can't read duration — allow it through
			}
		}
		clipError = null;
		onaddclip(locationId, file, durationSec);
	}

	function getVideoDuration(file: File): Promise<number> {
		return new Promise((resolve, reject) => {
			const video = document.createElement('video');
			video.preload = 'metadata';
			video.onloadedmetadata = () => {
				const dur = video.duration;
				URL.revokeObjectURL(video.src);
				if (isFinite(dur)) resolve(dur);
				else reject(new Error('Could not read duration'));
			};
			video.onerror = () => {
				URL.revokeObjectURL(video.src);
				reject(new Error('Could not load video'));
			};
			video.src = URL.createObjectURL(file);
		});
	}

	// ── Drag-and-drop via svelte-dnd-action ──
	let isDragging = $state(false);

	function handleDndConsider(e: CustomEvent<{ items: Clip[] }>) {
		if (!isDragging && playingClipId) {
			// Pause any playing video when drag starts
			const vid = videoElements.get(playingClipId);
			if (vid) vid.pause();
			if (playbackRAF) { cancelAnimationFrame(playbackRAF); playbackRAF = null; }
			playingClipId = null;
		}
		isDragging = true;
		dndClips = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: Clip[] }>) {
		isDragging = false;
		if (!activeLoc) return;
		dndClips = e.detail.items;
		// Find what moved: compare parent's order to new order
		const oldClips = [...activeLoc.clips].sort((a, b) => a.order - b.order);
		const newIds = e.detail.items.map(c => c.id);
		for (let i = 0; i < newIds.length; i++) {
			const oldIndex = oldClips.findIndex(c => c.id === newIds[i]);
			if (oldIndex !== i) {
				onmoveclip(activeLoc.id, oldIndex, i);
				return;
			}
		}
	}

	function formatTime(sec: number): string {
		return sec.toFixed(1) + 's';
	}

	// ── Clip preview state ──
	let playingClipId = $state<string | null>(null);
	let clipCurrentTime = $state<number>(0);
	let videoElements = $state<Map<string, HTMLVideoElement>>(new Map());
	let videoLoaded = $state<Set<string>>(new Set());
	// Thumbnail data URLs for both videos (poster frame) and photos
	let clipThumbnails = $state<Map<string, string>>(new Map());
	let playbackRAF: number | null = null;

	function capturePoster(video: HTMLVideoElement, clipId: string) {
		try {
			const w = video.videoWidth;
			const h = video.videoHeight;
			if (!w || !h) return;
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			const url = canvas.toDataURL('image/jpeg', 0.7);
			clipThumbnails = new Map(clipThumbnails).set(clipId, url);
		} catch {
			// cross-origin or other issue
		}
	}

	// Generate thumbnails for photo clips using createImageBitmap (handles HEIC, WebP, etc.)
	function generatePhotoThumbnail(file: File, clipId: string) {
		if (clipThumbnails.has(clipId)) return;
		createImageBitmap(file)
			.then((bitmap) => {
				const canvas = document.createElement('canvas');
				const maxDim = 200;
				const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
				canvas.width = Math.round(bitmap.width * scale);
				canvas.height = Math.round(bitmap.height * scale);
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
				bitmap.close();
				const url = canvas.toDataURL('image/jpeg', 0.8);
				clipThumbnails = new Map(clipThumbnails).set(clipId, url);
			})
			.catch(() => {
				// Browser can't decode this image format — leave thumbnail empty
			});
	}

	// Generate photo thumbnails whenever clips change
	$effect(() => {
		if (!activeLoc) return;
		for (const clip of activeLoc.clips) {
			if (clip.type === 'photo' && clip.file) {
				generatePhotoThumbnail(clip.file, clip.id);
			}
		}
	});

	function videoRef(el: HTMLVideoElement, clipId: string) {
		videoElements = new Map(videoElements).set(clipId, el);

		function markLoaded() {
			videoLoaded = new Set(videoLoaded).add(clipId);
			if (el.videoWidth > 0) {
				capturePoster(el, clipId);
			} else {
				el.addEventListener('loadedmetadata', () => capturePoster(el, clipId), { once: true });
			}
		}

		if (el.readyState >= 2) {
			markLoaded();
		} else {
			el.addEventListener('loadeddata', () => markLoaded(), { once: true });
			el.addEventListener('canplay', () => {
				if (!videoLoaded.has(clipId)) markLoaded();
			}, { once: true });
		}
		return {
			destroy() {
				const copy = new Map(videoElements);
				copy.delete(clipId);
				videoElements = copy;
			}
		};
	}

	function togglePlay(clipId: string, durationSec: number, trimStart: number, trimEnd: number) {
		const vid = videoElements.get(clipId);
		if (!vid) return;

		if (playingClipId === clipId) {
			vid.pause();
			if (playbackRAF) { cancelAnimationFrame(playbackRAF); playbackRAF = null; }
			playingClipId = null;
			return;
		}

		// Stop any other playing clip
		if (playingClipId) {
			const prev = videoElements.get(playingClipId);
			if (prev) prev.pause();
			if (playbackRAF) { cancelAnimationFrame(playbackRAF); playbackRAF = null; }
		}

		playingClipId = clipId;
		vid.currentTime = trimStart;
		vid.play();

		const tick = () => {
			if (!vid.paused && !vid.ended) {
				clipCurrentTime = vid.currentTime;
				if (vid.currentTime >= trimEnd) {
					vid.pause();
					vid.currentTime = trimStart;
					clipCurrentTime = trimStart;
					playingClipId = null;
					return;
				}
				playbackRAF = requestAnimationFrame(tick);
			} else {
				clipCurrentTime = vid.currentTime;
				playingClipId = null;
			}
		};
		playbackRAF = requestAnimationFrame(tick);
	}

	function handleAdd(loc: { name: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null }) {
		onadd(loc);
		const newIndex = locations.length;
		if (newIndex > 0) {
			const prev = locations[newIndex - 1];
			const suggested = suggestTransportMode(prev.lat, prev.lng, loc.lat, loc.lng);
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
					<span class="text-text-muted flex-shrink-0"><CaretRight size={12} weight="bold" /></span>
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
		<div class="bg-card border-2 border-border rounded-2xl overflow-hidden">
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
						<Trash size={20} weight="bold" />
					</button>
				</div>
			</div>

			<!-- Clips list -->
			<div class="p-4 border-b border-border">
				<span class="text-xs text-text-muted block mb-2">
					Clips ({activeLoc.clips.length})
				</span>

				{#if dndClips.length > 0}
					<div
						class="clip-list mb-3"
						use:dragHandleZone={{ items: dndClips, flipDurationMs: FLIP_DURATION_MS, dropTargetStyle: {} }}
						onconsider={handleDndConsider}
						onfinalize={handleDndFinalize}
					>
						{#each dndClips as clip (clip.id)}
							<div class="rounded-lg border-2 border-border bg-card mb-2" animate:flip={{ duration: FLIP_DURATION_MS }}>
								<div class="flex items-center gap-2 p-2">
									<!-- Drag handle -->
									<div
										class="cursor-grab active:cursor-grabbing text-text-muted flex-shrink-0 touch-none"
										use:dragHandle
										aria-label="drag handle"
									>
										<DotsSixVertical size={16} weight="bold" />
									</div>

									<!-- Thumbnail / Video preview -->
									{#if clip.type === 'video' && clip.previewUrl}
										<button
											class="relative w-28 h-20 rounded overflow-hidden bg-black flex-shrink-0 cursor-pointer group"
											onclick={() => { if (!isDragging) togglePlay(clip.id, clip.durationSec!, clip.trimStartSec ?? 0, clip.trimEndSec ?? clip.durationSec!); }}
										>
												<!-- svelte-ignore a11y_media_has_caption -->
											<video
												src={clip.previewUrl}
												class="absolute inset-0 w-full h-full object-cover {playingClipId === clip.id ? 'z-10' : 'opacity-0'}"
												muted
												playsinline
												preload="auto"
												use:videoRef={clip.id}
											></video>
											<!-- Static poster always covers video when not playing — prevents flicker during DnD -->
											{#if playingClipId !== clip.id}
												{#if clipThumbnails.has(clip.id)}
													<img src={clipThumbnails.get(clip.id)} alt="" class="absolute inset-0 w-full h-full object-cover" />
												{:else}
													<div class="absolute inset-0 flex items-center justify-center bg-black/60">
														<div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
													</div>
												{/if}
											{/if}
											{#if !isDragging}
												<div class="absolute inset-0 flex items-center justify-center {playingClipId === clip.id ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity">
													<div class="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
														{#if playingClipId === clip.id}
															<Pause size={16} weight="fill" class="text-white" />
														{:else}
															<Play size={16} weight="fill" class="text-white ml-0.5" />
														{/if}
													</div>
												</div>
											{/if}
										</button>
									{:else}
										<div class="w-20 h-14 rounded overflow-hidden bg-card flex-shrink-0">
											{#if clipThumbnails.has(clip.id)}
												<img src={clipThumbnails.get(clip.id)} alt="" class="w-full h-full object-cover" />
											{:else}
												<div class="w-full h-full flex items-center justify-center bg-black/10">
													<ImageIcon size={20} weight="bold" class="text-text-muted" />
												</div>
											{/if}
										</div>
									{/if}

									<!-- Middle: type label + trim slider (or animation picker for photos) -->
									<div class="flex-1 min-w-0">
										{#if clip.type === 'video' && clip.durationSec}
											{@const trimStart = clip.trimStartSec ?? 0}
											{@const trimEnd = clip.trimEndSec ?? clip.durationSec}
											<div class="flex items-center gap-1 mb-1">
												<span class="text-xs font-medium text-text-secondary capitalize">Video</span>
												<span class="text-xs text-text-muted">{formatTime(trimEnd - trimStart)}</span>
											</div>
											<!-- Trim slider -->
											<div class="relative h-5">
												<!-- Track background -->
												<div class="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full bg-border"></div>
												<!-- Active range -->
												<div
													class="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-accent pointer-events-none"
													style="left: {(trimStart / clip.durationSec) * 100}%; right: {(1 - trimEnd / clip.durationSec) * 100}%"
												></div>
												<!-- Playhead indicator -->
												{#if playingClipId === clip.id}
													<div
														class="absolute top-0 bottom-0 w-0.5 bg-white rounded-full pointer-events-none"
														style="left: {(clipCurrentTime / clip.durationSec) * 100}%; box-shadow: 0 0 3px rgba(0,0,0,0.5);"
													></div>
												{/if}
												<!-- Start handle -->
												<input
													type="range"
													min="0"
													max={clip.durationSec}
													step="0.1"
													value={trimStart}
													class="trim-range trim-range-start absolute inset-0 w-full"
													style="z-index: {trimStart > trimEnd - 0.5 ? 4 : 2};"
													oninput={(e) => {
														const val = parseFloat((e.target as HTMLInputElement).value);
														const end = clip.trimEndSec ?? clip.durationSec!;
	
														if (val < end) {
															oncliptrim(activeLoc!.id, clip.id, val, end);
															const vid = videoElements.get(clip.id);
															if (vid && playingClipId !== clip.id) vid.currentTime = val;
														}
													}}
												/>
												<!-- End handle -->
												<input
													type="range"
													min="0"
													max={clip.durationSec}
													step="0.1"
													value={trimEnd}
													class="trim-range trim-range-end absolute inset-0 w-full"
													style="z-index: 3;"
													oninput={(e) => {
														const val = parseFloat((e.target as HTMLInputElement).value);
														const start = clip.trimStartSec ?? 0;
	
														if (val > start) {
															oncliptrim(activeLoc!.id, clip.id, start, val);
															const vid = videoElements.get(clip.id);
															if (vid && playingClipId !== clip.id) vid.currentTime = Math.min(val, vid.duration);
														}
													}}
												/>
											</div>
											<div class="flex justify-between text-xs text-text-muted mt-0.5">
												<span>{formatTime(trimStart)}</span>
												<span>{formatTime(trimEnd)}</span>
											</div>
										{:else}
											<div class="flex items-center gap-1.5 flex-wrap">
												<span class="text-xs font-medium text-text-secondary capitalize">{clip.type ?? 'unknown'}</span>
												{#if clip.type === 'photo'}
													<select
														class="text-xs bg-card border border-border rounded px-1 py-0.5 text-text-muted"
														value={clip.animationStyle}
														onchange={(e) => onclipanimation(activeLoc!.id, clip.id, (e.target as HTMLSelectElement).value as AnimationStyle)}
													>
														{#each ANIMATION_OPTIONS as opt}
															<option value={opt.value}>{opt.label}</option>
														{/each}
													</select>
												{/if}
											</div>
											{#if clip.type === 'photo'}
												{@const photoDur = clip.durationSec ?? 3}
												<div class="flex items-center gap-1 mt-1">
													<input
														type="range"
														min="1"
														max="8"
														step="0.5"
														value={photoDur}
														class="photo-duration-range flex-1 h-4"
														oninput={(e) => onclipduration(activeLoc!.id, clip.id, parseFloat((e.target as HTMLInputElement).value))}
													/>
													<span class="text-xs text-text-muted w-6 text-right">{photoDur}s</span>
												</div>
											{/if}
										{/if}
									</div>

									<!-- Remove clip -->
									<button
										class="text-text-muted hover:text-error transition-colors cursor-pointer p-1 flex-shrink-0"
										onclick={() => onremoveclip(activeLoc!.id, clip.id)}
										title="Remove clip"
									>
										<X size={14} weight="bold" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add clip button (always present) -->
				<MediaUpload
					previewUrl={null}
					onfile={(file) => handleAddClip(activeLoc!.id, file)}
				/>
				{#if clipError}
					<div class="mt-2 p-3 bg-error/10 border border-error/30 rounded-lg">
						<p class="text-sm text-error">{clipError}</p>
					</div>
				{/if}
			</div>

			<!-- Optional Details -->
			<div class="p-4">
				<span class="text-xs font-medium text-text-muted block mb-3">Optional Details</span>

				<!-- Rating -->
				<div class="flex items-center gap-2 mb-3">
					<span class="text-xs text-text-muted">Rating <span class="text-text-muted">*</span></span>
					<StarRating rating={activeLoc.rating} onchange={(r) => onrating(activeLoc!.id, r)} size="sm" />
				</div>

				<!-- Price Tier -->
				<div class="flex items-center gap-2 mb-3">
					<span class="text-xs text-text-muted">Price <span class="text-text-muted">*</span></span>
					<div class="flex gap-1">
						{#each PRICE_TIERS as tier}
							<button
								class="text-xs px-2.5 py-1 rounded-lg transition-colors cursor-pointer
									{activeLoc.priceTier === tier.value ? 'bg-accent text-white' : 'bg-card border border-border text-text-muted hover:bg-border'}"
								onclick={() => onpricetier(activeLoc!.id, activeLoc!.priceTier === tier.value ? null : tier.value)}
							>
								{tier.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Description -->
				<div class="mb-3">
					<textarea
						class="w-full bg-transparent text-sm text-text-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-accent transition-colors resize-none"
						placeholder="Add a note about this stop... *"
						rows="2"
						value={activeLoc.description ?? ''}
						oninput={(e) => ondescription(activeLoc!.id, (e.target as HTMLTextAreaElement).value)}
					></textarea>
					<p class="text-xs text-text-muted mt-0.5">Won't appear in the video — shows on your shared trip page.</p>
				</div>

				<!-- Transport mode (not shown for first location) -->
				{#if activeIndex > 0}
					<div>
						<span class="text-xs text-text-muted block mb-1.5">How did you get here? <span class="text-text-muted">*</span></span>
						<TransportPicker
							mode={activeLoc.transportMode}
							onchange={(mode) => ontransport(activeLoc!.id, mode)}
						/>
					</div>
				{/if}
			</div>

			<!-- Prev / Next within locations -->
			{#if locations.length > 1}
				<div class="flex items-center justify-between p-4 pt-0">
					<button
						class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={activeIndex === 0}
						onclick={() => activeIndex--}
					>
						<CaretLeft size={16} weight="bold" />
						Prev stop
					</button>
					<button
						class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={activeIndex === locations.length - 1}
						onclick={() => activeIndex++}
					>
						Next stop
						<CaretRight size={16} weight="bold" />
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
					<Plus size={20} weight="bold" />
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
		<Button variant="ghost" onclick={onback}>Details</Button>
		<Button variant="primary" disabled={!canProceed} onclick={onnext}>
			{#if locations.length < 2}
				Add at least 2 stops
			{:else if !allLocsHaveClips}
				Each stop needs a clip
			{:else}
				Next: Review
			{/if}
		</Button>
	</div>
</div>

<style>
	.trim-range {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		pointer-events: none;
		height: 100%;
		position: absolute;
		inset: 0;
		width: 100%;
		margin: 0;
		padding: 0;
	}
	.trim-range::-webkit-slider-runnable-track {
		background: transparent;
		height: 100%;
	}
	.trim-range::-moz-range-track {
		background: transparent;
		height: 100%;
	}
	.trim-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--color-accent, #3b82f6);
		border: 2px solid white;
		cursor: pointer;
		pointer-events: auto;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
		position: relative;
	}
	.trim-range::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--color-accent, #3b82f6);
		border: 2px solid white;
		cursor: pointer;
		pointer-events: auto;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
	}

	/* Prevent dnd library from adding outlines to the zone */
	.clip-list {
		outline: none;
	}

	.photo-duration-range {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
	}
	.photo-duration-range::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: var(--color-border, #334155);
	}
	.photo-duration-range::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: var(--color-border, #334155);
	}
	.photo-duration-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-accent, #3b82f6);
		border: 1.5px solid white;
		cursor: pointer;
		margin-top: -4px;
		box-shadow: 0 1px 2px rgba(0,0,0,0.3);
	}
	.photo-duration-range::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-accent, #3b82f6);
		border: 1.5px solid white;
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(0,0,0,0.3);
	}
</style>
