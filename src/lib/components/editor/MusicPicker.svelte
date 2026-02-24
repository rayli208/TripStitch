<script lang="ts">
	import type { MusicMood, MusicSelection } from '$lib/types';
	import type { MusicTrackDef } from '$lib/constants/music';
	import { MUSIC_MOODS, MUSIC_TRACKS, getTracksByMood } from '$lib/constants/music';
	import { getTrackUrl, fetchTrackBlob, createTrackPreview } from '$lib/services/musicService';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		musicSelection = $bindable<MusicSelection | null>(null),
		musicVolume = $bindable(70),
		videoDuration = 0
	}: {
		musicSelection?: MusicSelection | null;
		musicVolume?: number;
		videoDuration?: number;
	} = $props();

	let expanded = $state(false);
	let activeMood = $state<MusicMood | null>(null);
	let loadingTrackId = $state<string | null>(null);
	let previewingTrackId = $state<string | null>(null);
	let previewHandle: { play: () => void; stop: () => void } | null = null;
	let fileInput: HTMLInputElement | undefined = $state();

	// Offset preview audio
	let offsetAudio: HTMLAudioElement | null = null;
	let offsetPlaying = $state(false);

	// Segment scrubber
	let scrubberEl: HTMLDivElement | undefined = $state();
	let isDragging = $state(false);

	let displayedTracks = $derived(
		activeMood ? getTracksByMood(activeMood) : MUSIC_TRACKS
	);

	let selectedLabel = $derived.by(() => {
		if (!musicSelection) return 'No music';
		const offset = musicSelection.startOffsetSec;
		if (offset > 0) return `${musicSelection.title} (from ${formatDuration(offset)})`;
		return musicSelection.title;
	});

	// Segment visualization derivations
	let songDur = $derived(musicSelection?.durationSec ?? 0);
	let startOffset = $derived(musicSelection?.startOffsetSec ?? 0);
	let segmentLength = $derived(
		videoDuration > 0 && songDur > 0
			? Math.min(videoDuration, songDur - startOffset)
			: 0
	);
	let endOffset = $derived(startOffset + segmentLength);
	let segLeftPct = $derived(songDur > 0 ? (startOffset / songDur) * 100 : 0);
	let segWidthPct = $derived(songDur > 0 && segmentLength > 0 ? (segmentLength / songDur) * 100 : 0);
	let loops = $derived(
		videoDuration > 0 && songDur > 0 && videoDuration > (songDur - startOffset)
	);
	// How much of the video is covered by the first pass (offset → end)
	let firstPassDur = $derived(songDur - startOffset);
	// Remaining video time after the first pass that needs looping
	let loopRemaining = $derived(loops ? videoDuration - firstPassDur : 0);
	let loopCount = $derived(loops && songDur > 0 ? Math.ceil(loopRemaining / songDur) : 0);
	let maxOffset = $derived(Math.max(0, songDur - 5));

	function stopPreview() {
		previewHandle?.stop();
		previewHandle = null;
		previewingTrackId = null;
	}

	function stopOffsetPreview() {
		if (offsetAudio) {
			offsetAudio.pause();
			offsetAudio.currentTime = 0;
			offsetPlaying = false;
		}
	}

	async function togglePreview(track: MusicTrackDef) {
		if (previewingTrackId === track.id) {
			stopPreview();
			return;
		}
		stopPreview();
		previewingTrackId = track.id;
		try {
			const url = await getTrackUrl(track);
			previewHandle = createTrackPreview(url);
			previewHandle.play();
		} catch (err) {
			console.warn('[Music] Preview failed:', err);
			previewingTrackId = null;
		}
	}

	async function selectTrack(track: MusicTrackDef) {
		stopPreview();
		stopOffsetPreview();
		loadingTrackId = track.id;
		try {
			const blob = await fetchTrackBlob(track);
			const url = URL.createObjectURL(blob);
			if (musicSelection?.previewUrl) URL.revokeObjectURL(musicSelection.previewUrl);

			const realDuration = await new Promise<number>((resolve) => {
				const audio = new Audio(url);
				audio.onloadedmetadata = () => resolve(isFinite(audio.duration) ? audio.duration : track.durationSec);
				audio.onerror = () => resolve(track.durationSec);
			});

			musicSelection = {
				trackId: track.id,
				title: track.title,
				mood: track.mood,
				audioBlob: blob,
				previewUrl: url,
				durationSec: Math.round(realDuration),
				startOffsetSec: 0
			};
			expanded = false;
		} catch (err) {
			console.warn('[Music] Failed to load track:', err);
		} finally {
			loadingTrackId = null;
		}
	}

	function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		stopPreview();
		stopOffsetPreview();
		if (musicSelection?.previewUrl) URL.revokeObjectURL(musicSelection.previewUrl);
		const url = URL.createObjectURL(file);

		const audio = new Audio();
		audio.src = url;
		audio.onloadedmetadata = () => {
			const dur = audio.duration;
			musicSelection = {
				trackId: 'custom-' + crypto.randomUUID().slice(0, 8),
				title: file.name.replace(/\.[^.]+$/, ''),
				mood: 'custom',
				audioBlob: file,
				previewUrl: url,
				durationSec: isFinite(dur) ? Math.round(dur) : 180,
				startOffsetSec: 0
			};
		};
		audio.onerror = () => {
			musicSelection = {
				trackId: 'custom-' + crypto.randomUUID().slice(0, 8),
				title: file.name.replace(/\.[^.]+$/, ''),
				mood: 'custom',
				audioBlob: file,
				previewUrl: url,
				durationSec: 180,
				startOffsetSec: 0
			};
		};
		expanded = false;
		input.value = '';
	}

	function clearSelection() {
		stopPreview();
		stopOffsetPreview();
		if (musicSelection?.previewUrl) URL.revokeObjectURL(musicSelection.previewUrl);
		musicSelection = null;
		musicVolume = 70;
	}

	// Scrubber drag handlers
	function handleScrubDown(e: PointerEvent) {
		if (!scrubberEl || !musicSelection) return;
		scrubberEl.setPointerCapture(e.pointerId);
		isDragging = true;
		updateOffsetFromPointer(e);
	}

	function handleScrubMove(e: PointerEvent) {
		if (!isDragging) return;
		updateOffsetFromPointer(e);
	}

	function handleScrubUp() {
		isDragging = false;
	}

	function updateOffsetFromPointer(e: PointerEvent) {
		if (!scrubberEl || !musicSelection) return;
		const rect = scrubberEl.getBoundingClientRect();
		const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const clickedTime = fraction * musicSelection.durationSec;
		// Center the segment on the clicked position
		const halfSeg = (videoDuration > 0 ? Math.min(videoDuration, musicSelection.durationSec) : 0) / 2;
		let newOffset = Math.round(clickedTime - halfSeg);
		newOffset = Math.max(0, Math.min(newOffset, maxOffset));
		musicSelection = { ...musicSelection, startOffsetSec: newOffset };
	}

	function playFromOffset() {
		if (!musicSelection?.previewUrl) return;
		stopOffsetPreview();
		offsetAudio = new Audio(musicSelection.previewUrl);
		offsetAudio.currentTime = musicSelection.startOffsetSec;
		offsetAudio.volume = musicVolume / 100;
		offsetAudio.play().catch(() => {});
		offsetPlaying = true;

		const timeout = setTimeout(() => stopOffsetPreview(), 8000);
		offsetAudio.onended = () => { offsetPlaying = false; clearTimeout(timeout); };
		offsetAudio.onpause = () => { offsetPlaying = false; clearTimeout(timeout); };
	}

	function formatDuration(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.round(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<style>
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		height: 6px;
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}
	input[type="range"]::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
		background: color-mix(in srgb, currentColor 30%, transparent);
	}
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid currentColor;
		cursor: pointer;
		margin-top: -6px;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
	}
	input[type="range"]::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: color-mix(in srgb, currentColor 30%, transparent);
	}
	input[type="range"]::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid currentColor;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
	}
</style>

<div class="bg-card rounded-xl border border-border overflow-hidden">
	<!-- Header / collapsed view -->
	<button
		class="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-card/80 transition-colors"
		onclick={() => { expanded = !expanded; if (!expanded) { stopPreview(); stopOffsetPreview(); } }}
	>
		<div class="flex items-center gap-2">
			<svg class="w-5 h-5 {musicSelection ? 'text-accent' : 'text-text-muted'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
			</svg>
			<div class="text-left">
				<p class="text-sm font-medium text-text-primary">Background Music</p>
				<p class="text-xs {musicSelection ? 'text-accent' : 'text-text-muted'}">{selectedLabel}</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if musicSelection && !expanded}
				<span class="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 rounded-full px-2 py-0.5">Active</span>
			{/if}
			<svg
				class="w-4 h-4 text-text-muted transition-transform {expanded ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</div>
	</button>

	{#if expanded}
		<div class="px-4 pb-4 space-y-3">
			<!-- Mood filter chips -->
			<div class="flex flex-wrap gap-2">
				<button
					class="px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer
						{activeMood === null ? 'bg-accent text-white' : 'bg-border text-text-muted hover:text-text-primary'}"
					onclick={() => { activeMood = null; }}
				>
					All
				</button>
				{#each MUSIC_MOODS as mood}
					<button
						class="px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer
							{activeMood === mood.id ? 'bg-accent text-white' : 'bg-border text-text-muted hover:text-text-primary'}"
						onclick={() => { activeMood = activeMood === mood.id ? null : mood.id; }}
					>
						{mood.icon} {mood.label}
					</button>
				{/each}
			</div>

			<!-- Track list -->
			<div class="max-h-52 overflow-y-auto space-y-1 -mx-1 px-1">
				{#each displayedTracks as track (track.id)}
					{@const isSelected = musicSelection?.trackId === track.id}
					{@const isPreviewing = previewingTrackId === track.id}
					{@const isLoading = loadingTrackId === track.id}
					<div
						class="flex items-center gap-2 p-2 rounded-lg transition-colors
							{isSelected ? 'bg-accent/10 border border-accent/30' : 'hover:bg-border/50'}"
					>
						<!-- Preview button -->
						<button
							class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer
								{isPreviewing ? 'bg-accent text-white' : 'bg-border text-text-muted hover:text-text-primary'}"
							onclick={() => togglePreview(track)}
							title={isPreviewing ? 'Stop preview' : 'Preview track'}
						>
							{#if isPreviewing}
								<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
									<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
								</svg>
							{:else}
								<svg class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z" />
								</svg>
							{/if}
						</button>

						<!-- Track info -->
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-text-primary truncate">{track.title}</p>
							<p class="text-xs text-text-muted">{formatDuration(track.durationSec)}</p>
						</div>

						<!-- Select button -->
						{#if isSelected}
							<span class="text-xs text-accent font-medium px-2">Selected</span>
						{:else}
							<button
								class="px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer
									bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
								disabled={isLoading}
								onclick={() => selectTrack(track)}
							>
								{isLoading ? 'Loading...' : 'Select'}
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Upload your own -->
			<button
				class="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-border
					text-sm text-text-muted hover:text-text-primary hover:border-text-muted transition-colors cursor-pointer"
				onclick={() => fileInput?.click()}
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
				</svg>
				Upload your own
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="audio/*"
				class="hidden"
				onchange={handleFileUpload}
			/>

			<!-- Clear selection -->
			{#if musicSelection}
				<button
					class="text-xs text-text-muted hover:text-error transition-colors cursor-pointer"
					onclick={clearSelection}
				>
					Remove music
				</button>
			{/if}
		</div>
	{/if}

	<!-- Controls when a track is selected -->
	{#if musicSelection}
		<div class="px-4 pb-4 space-y-3 {expanded ? '' : 'pt-0'}">
			<!-- Song segment scrubber -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<span class="text-xs text-text-secondary font-medium">
						{videoDuration > 0 ? 'Song selection' : 'Start position'}
					</span>
					<div class="flex items-center gap-2">
						<span class="text-xs text-text-muted font-mono">
							{#if videoDuration > 0 && segmentLength > 0}
								{formatDuration(startOffset)} &ndash; {formatDuration(endOffset)}
							{:else}
								{formatDuration(startOffset)} / {formatDuration(songDur)}
							{/if}
						</span>
						<!-- Play from offset button -->
						<button
							class="w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer
								{offsetPlaying ? 'bg-accent text-white' : 'bg-border text-text-muted hover:text-text-primary'}"
							onclick={() => { if (offsetPlaying) stopOffsetPreview(); else playFromOffset(); }}
							title={offsetPlaying ? 'Stop' : 'Preview from this position'}
						>
							{#if offsetPlaying}
								<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
									<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
								</svg>
							{:else}
								<svg class="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>

				{#if videoDuration > 0 && songDur > 0}
					<!-- Visual segment bar -->
					<div
						bind:this={scrubberEl}
						class="relative h-10 bg-border/30 rounded-lg cursor-pointer overflow-hidden select-none touch-none"
						role="slider"
						aria-valuemin={0}
						aria-valuemax={maxOffset}
						aria-valuenow={startOffset}
						tabindex="0"
						onpointerdown={handleScrubDown}
						onpointermove={handleScrubMove}
						onpointerup={handleScrubUp}
						onkeydown={(e) => {
							if (!musicSelection) return;
							let delta = 0;
							if (e.key === 'ArrowRight') delta = 1;
							else if (e.key === 'ArrowLeft') delta = -1;
							else return;
							e.preventDefault();
							const newOff = Math.max(0, Math.min(musicSelection.startOffsetSec + delta, maxOffset));
							musicSelection = { ...musicSelection, startOffsetSec: newOff };
						}}
					>
						<!-- Song waveform placeholder: subtle tick marks every 15s -->
						{#each Array(Math.floor(songDur / 15)) as _, i}
							{@const pct = ((i + 1) * 15 / songDur) * 100}
							<div
								class="absolute top-0 h-full w-px bg-text-muted/15"
								style="left: {pct}%"
							></div>
						{/each}

						<!-- Highlighted segment -->
						<div
							class="absolute top-0 h-full bg-accent/30 border-x-2 border-accent transition-[left,width] {isDragging ? 'duration-0' : 'duration-150'}"
							style="left: {segLeftPct}%; width: {segWidthPct}%"
						>
							<!-- Drag grip lines -->
							<div class="absolute inset-0 flex items-center justify-center gap-0.5 opacity-60">
								<div class="w-0.5 h-4 bg-accent rounded-full"></div>
								<div class="w-0.5 h-4 bg-accent rounded-full"></div>
								<div class="w-0.5 h-4 bg-accent rounded-full"></div>
							</div>
						</div>

						<!-- Time labels at edges -->
						<span class="absolute bottom-0.5 left-1.5 text-[9px] text-text-muted/60 font-mono pointer-events-none">0:00</span>
						<span class="absolute bottom-0.5 right-1.5 text-[9px] text-text-muted/60 font-mono pointer-events-none">{formatDuration(songDur)}</span>
					</div>

					{#if loops}
						<div class="bg-accent/5 border border-accent/20 rounded-lg p-2.5 space-y-1">
							<p class="text-[11px] text-text-primary font-medium flex items-center gap-1.5">
								<svg class="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
								Song will loop {loopCount === 1 ? 'once' : `${loopCount} times`} to fill the video
							</p>
							<p class="text-[11px] text-text-muted leading-relaxed">
								Plays from {formatDuration(startOffset)} to the end ({formatDuration(songDur)}), then restarts from the beginning. Fades out at the end of the video.
							</p>
						</div>
					{:else if startOffset > 0}
						<p class="text-[11px] text-text-muted">
							Drag to choose which part of the song plays during your video.
						</p>
					{/if}
				{:else}
					<!-- Fallback: simple range slider when no video duration known -->
					<input
						type="range"
						min="0"
						max={Math.max(0, songDur - 5)}
						value={startOffset}
						oninput={(e) => {
							if (!musicSelection) return;
							const val = parseInt((e.target as HTMLInputElement).value);
							musicSelection = { ...musicSelection, startOffsetSec: val };
						}}
						class="w-full bg-accent/30 text-accent"
					/>
				{/if}
			</div>

			<!-- Volume slider -->
			<div class="flex items-center gap-3">
				<svg class="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
				</svg>
				<span class="text-xs text-text-primary w-12 shrink-0">Music</span>
				<input
					type="range"
					min="0"
					max="100"
					bind:value={musicVolume}
					class="flex-1 bg-accent/30 text-accent"
				/>
				<span class="text-xs text-text-muted font-mono w-9 text-right">{musicVolume}%</span>
			</div>
		</div>
	{/if}
</div>
