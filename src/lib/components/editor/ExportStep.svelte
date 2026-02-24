<script lang="ts">
	import type { AspectRatio, MapStyle, MusicSelection, Location } from '$lib/types';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import { canRecordVoiceOver, mergeVoiceOver } from '$lib/services/voiceOverService';
	import VoiceOverRecorder from './VoiceOverRecorder.svelte';
	import MusicPicker from './MusicPicker.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export interface ExportStepItem {
		id: string;
		label: string;
		icon: string;
	}

	let {
		aspectRatio = $bindable<AspectRatio>('9:16'),
		mapStyle = $bindable<MapStyle>('streets'),
		musicSelection = $bindable<MusicSelection | null>(null),
		musicVolume = $bindable(70),
		keepOriginalAudio = $bindable(true),
		voiceOverVolume = $bindable(100),
		canExport,
		locations = [],
		videoSegments = [],
		isExporting = false,
		exportDone = false,
		progress = null,
		videoUrl = null,
		videoBlob = null,
		error = null,
		tripTitle = '',
		browserSupported = true,
		browserWarnings = [],
		exportSteps = [],
		shareUrl = null,
		estimatedDuration,
		exportElapsed,
		onexport,
		onback,
		oncancel,
		onretry,
		ondownload,
		ondashboard,
		oncopylink,
		onshare,
		onmusicmerged
	}: {
		aspectRatio?: AspectRatio;
		mapStyle?: MapStyle;
		musicSelection?: MusicSelection | null;
		musicVolume?: number;
		keepOriginalAudio?: boolean;
		voiceOverVolume?: number;
		canExport: boolean;
		locations?: Location[];
		videoSegments?: VideoSegmentInfo[];
		isExporting?: boolean;
		exportDone?: boolean;
		progress?: AssemblyProgress | null;
		videoUrl?: string | null;
		videoBlob?: Blob | null;
		error?: string | null;
		tripTitle?: string;
		browserSupported?: boolean;
		browserWarnings?: string[];
		exportSteps?: ExportStepItem[];
		shareUrl?: string | null;
		estimatedDuration?: string;
		exportElapsed?: number;
		onexport: () => void;
		onback: () => void;
		oncancel?: () => void;
		onretry?: () => void;
		ondownload?: () => void;
		ondashboard?: () => void;
		oncopylink?: () => void;
		onshare?: () => void;
		onmusicmerged?: (blob: Blob, url: string) => void;
	} = $props();

	const ratios: { value: AspectRatio; label: string; width: string; height: string }[] = [
		{ value: '9:16', label: 'Vertical', width: 'w-12', height: 'h-20' },
		{ value: '1:1', label: 'Square', width: 'w-16', height: 'h-16' },
		{ value: '16:9', label: 'Horizontal', width: 'w-20', height: 'h-12' }
	];

	const mapStyles: { value: MapStyle; label: string; icon: string }[] = [
		{ value: 'streets', label: 'Streets', icon: '🗺️' },
		{ value: 'satellite', label: 'Satellite', icon: '🛰️' },
		{ value: 'outdoor', label: 'Outdoor', icon: '🏔️' },
		{ value: 'topo', label: 'Topo', icon: '🧭' },
		{ value: 'dark', label: 'Dark', icon: '🌙' },
		{ value: 'light', label: 'Light', icon: '☀️' }
	];

	const supportsVoiceOver = canRecordVoiceOver();
	const hasVideoWithAudio = $derived(locations.some((l) => l.clips.some((c) => c.type === 'video' && c.file)));
	const musicBlob = $derived(musicSelection?.audioBlob ?? null);
	const musicStartOffset = $derived(musicSelection?.startOffsetSec ?? 0);
	const hasAnyAudio = $derived(!!musicBlob || !!voiceOverBlob);

	// Voice-over state
	let voiceOverRecording = $state(false);
	let voiceOverBlob = $state<Blob | null>(null);
	let voiceOverUrl = $state<string | null>(null);

	// Flow state
	let audioFinalized = $state(false);

	// Merge state
	let merging = $state(false);
	let mergePercent = $state(0);
	let mergeMsg = $state('');

	// Video + music playback
	let videoEl: HTMLVideoElement | undefined = $state();
	let musicAudioEl: HTMLAudioElement | undefined = $state();
	let voPreviewAudioEl: HTMLAudioElement | undefined = $state();
	let videoDuration = $state(0);

	// Get video duration from element
	$effect(() => {
		if (!videoEl) return;
		const vid = videoEl;
		function handleMeta() {
			if (vid.duration && isFinite(vid.duration)) videoDuration = vid.duration;
		}
		if (vid.duration && isFinite(vid.duration)) videoDuration = vid.duration;
		vid.addEventListener('loadedmetadata', handleMeta);
		return () => vid.removeEventListener('loadedmetadata', handleMeta);
	});

	// Sync music playback with video
	$effect(() => {
		if (!videoEl || !musicAudioEl || !musicBlob) return;
		const vid = videoEl;
		const mus = musicAudioEl;
		const offset = musicStartOffset;

		function syncTime() {
			mus.currentTime = offset + vid.currentTime;
		}
		function handlePlay() {
			syncTime();
			mus.play().catch(() => {});
		}
		function handlePause() { mus.pause(); }
		function handleSeeked() { syncTime(); }
		function handleTimeUpdate() {
			if (mus.ended || mus.currentTime >= mus.duration) {
				// Loop back to the beginning of the song (not the offset)
				mus.currentTime = 0;
				if (!vid.paused) mus.play().catch(() => {});
			}
		}

		vid.addEventListener('play', handlePlay);
		vid.addEventListener('pause', handlePause);
		vid.addEventListener('seeked', handleSeeked);
		mus.addEventListener('timeupdate', handleTimeUpdate);
		return () => {
			vid.removeEventListener('play', handlePlay);
			vid.removeEventListener('pause', handlePause);
			vid.removeEventListener('seeked', handleSeeked);
			mus.removeEventListener('timeupdate', handleTimeUpdate);
			mus.pause();
		};
	});

	// Keep music volume in sync
	$effect(() => {
		if (musicAudioEl) musicAudioEl.volume = musicVolume / 100;
	});

	// Sync voice-over preview audio with video
	$effect(() => {
		if (!videoEl || !voPreviewAudioEl || !voiceOverUrl) return;
		const vid = videoEl;
		const vo = voPreviewAudioEl;
		function handlePlay() { vo.currentTime = vid.currentTime; vo.play().catch(() => {}); }
		function handlePause() { vo.pause(); }
		function handleSeeked() { vo.currentTime = vid.currentTime; }

		vid.addEventListener('play', handlePlay);
		vid.addEventListener('pause', handlePause);
		vid.addEventListener('seeked', handleSeeked);
		return () => {
			vid.removeEventListener('play', handlePlay);
			vid.removeEventListener('pause', handlePause);
			vid.removeEventListener('seeked', handleSeeked);
			vo.pause();
		};
	});

	// Keep voice-over preview volume in sync
	$effect(() => {
		if (voPreviewAudioEl) voPreviewAudioEl.volume = voiceOverVolume / 100;
	});

	async function handleApplyAndDownload() {
		if (!videoBlob) return;

		if (!musicBlob && !voiceOverBlob) {
			ondownload?.();
			audioFinalized = true;
			return;
		}

		merging = true;
		mergePercent = 0;
		mergeMsg = 'Preparing...';

		// Pause playback
		videoEl?.pause();
		musicAudioEl?.pause();
		voPreviewAudioEl?.pause();

		try {
			const result = await mergeVoiceOver(
				videoBlob,
				voiceOverBlob,
				keepOriginalAudio,
				(pct, msg) => { mergePercent = pct; mergeMsg = msg; },
				voiceOverVolume / 100,
				0.2,
				musicBlob,
				musicVolume / 100,
				musicStartOffset
			);
			merging = false;
			onmusicmerged?.(result.blob, result.url);
			ondownload?.();
			audioFinalized = true;
		} catch (err) {
			console.error('[ExportStep] Audio merge failed:', err);
			merging = false;
		}
	}

	let progressPercent = $derived(
		progress ? Math.round((progress.current / progress.total) * 100) : 0
	);

	function getStepStatus(stepIndex: number): 'pending' | 'active' | 'done' {
		if (!progress || !isExporting) return 'pending';
		const currentIdx = progress.current - 1;
		if (stepIndex < currentIdx) return 'done';
		if (stepIndex === currentIdx) return 'active';
		return 'pending';
	}
</script>

<style>
	@keyframes pulse-glow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	.animate-pulse-glow {
		animation: pulse-glow 1.5s ease-in-out infinite;
	}

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

<!-- Hidden audio elements for real-time preview -->
{#if musicSelection?.previewUrl}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio bind:this={musicAudioEl} src={musicSelection.previewUrl}></audio>
{/if}
{#if voiceOverUrl}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio bind:this={voPreviewAudioEl} src={voiceOverUrl}></audio>
{/if}

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-semibold mb-1">Export</h2>
		<p class="text-sm text-text-muted">Choose your aspect ratio and export your TripStitch.</p>
	</div>

	{#if !browserSupported}
		<!-- Browser not supported -->
		<div class="text-center py-12">
			<div class="text-5xl mb-4">&#x26A0;&#xFE0F;</div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Browser Not Supported</h3>
			<p class="text-sm text-text-muted mb-4">
				Your browser doesn't support video export. Please use Safari 14.5+, Chrome, or Firefox.
			</p>
			{#each browserWarnings as warning}
				<p class="text-xs text-text-muted">{warning}</p>
			{/each}
			<div class="mt-6">
				<Button variant="ghost" onclick={onback}>Back</Button>
			</div>
		</div>
	{:else if error}
		<!-- Error state -->
		<div class="text-center py-12">
			<div class="text-5xl mb-4">&#x274C;</div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Export Failed</h3>
			<p class="text-sm text-error mb-6">{error}</p>
			<div class="flex justify-center gap-3">
				<Button variant="ghost" onclick={onback}>Back</Button>
				{#if onretry}
					<Button variant="primary" onclick={onretry}>Try Again</Button>
				{/if}
			</div>
		</div>
	{:else if isExporting}
		<!-- Exporting with step checklist -->
		<div class="flex flex-col items-center py-6 gap-5">
			<p class="text-base font-medium text-text-primary">
				{progress?.message ?? 'Getting things ready...'}
			</p>

			{#if exportSteps.length > 0}
				<div class="w-full max-w-xs space-y-2">
					{#each exportSteps as step, i}
						{@const status = getStepStatus(i)}
						<div class="flex items-center gap-3 py-1.5">
							<div class="w-7 h-7 flex items-center justify-center flex-shrink-0">
								{#if status === 'done'}
									<svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
								{:else if status === 'active'}
									<span class="text-lg animate-pulse-glow">{step.icon}</span>
								{:else}
									<span class="text-lg opacity-30">{step.icon}</span>
								{/if}
							</div>
							<span class="text-sm {status === 'done' ? 'text-text-muted line-through' : status === 'active' ? 'text-text-primary font-medium' : 'text-text-muted'}">
								{step.label}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="w-full max-w-xs">
				<div class="h-2 bg-border rounded-full overflow-hidden">
					<div
						class="h-full bg-accent rounded-full transition-all duration-500 ease-out"
						style="width: {progressPercent}%"
					></div>
				</div>
				<p class="text-xs text-text-muted text-center mt-1.5">{progressPercent}%</p>
				{#if exportElapsed != null}
					<p class="text-xs text-text-muted text-center mt-1">Elapsed: {Math.floor(exportElapsed / 60)}:{String(exportElapsed % 60).padStart(2, '0')}</p>
				{/if}
			</div>

			{#if oncancel}
				<button
					class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors mt-2"
					onclick={oncancel}
				>
					Cancel export
				</button>
			{/if}
		</div>
	{:else if exportDone && videoUrl && voiceOverRecording && videoBlob}
		<!-- Voice-over recording sub-flow -->
		<VoiceOverRecorder
			{videoUrl}
			{videoBlob}
			{keepOriginalAudio}
			skipMerge={true}
			segments={videoSegments}
			onaccept={(blob, url) => {
				voiceOverRecording = false;
				voiceOverBlob = blob;
				voiceOverUrl = url;
			}}
			oncancel={() => { voiceOverRecording = false; }}
		/>
	{:else if exportDone && videoUrl && merging}
		<!-- Merge progress -->
		<div class="flex flex-col items-center py-10 gap-5">
			<p class="text-base font-medium text-text-primary">Applying audio...</p>
			<div class="w-full max-w-xs">
				<div class="h-2.5 bg-border rounded-full overflow-hidden">
					<div
						class="h-full bg-accent rounded-full transition-all duration-300 ease-out"
						style="width: {mergePercent}%"
					></div>
				</div>
				<div class="flex justify-between mt-1.5">
					<p class="text-xs text-text-muted">{mergeMsg}</p>
					<p class="text-xs text-text-muted font-mono">{mergePercent}%</p>
				</div>
			</div>
		</div>
	{:else if exportDone && videoUrl}
		<!-- Post-assembly -->
		<div class="flex flex-col items-center py-6 gap-5">
			<h3 class="text-xl font-semibold text-text-primary">Your TripStitch is ready!</h3>

			<!-- Video preview -->
			<div class="w-full rounded-lg overflow-hidden bg-overlay relative">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					src={videoUrl}
					controls
					playsinline
					class="w-full max-h-80 object-contain"
				></video>
			</div>

			{#if !audioFinalized}
				<!-- Phase 1: Audio editing -->
				<div class="w-full space-y-4">
					<h4 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Audio</h4>

					<!-- Music picker -->
					<MusicPicker bind:musicSelection bind:musicVolume {videoDuration} />

					<!-- Keep original audio toggle -->
					{#if hasVideoWithAudio}
						<div class="p-4 bg-card rounded-xl border border-border">
							<label class="flex items-center justify-between cursor-pointer select-none">
								<div>
									<p class="text-sm font-medium text-text-primary">Keep original audio</p>
									<p class="text-xs text-text-muted">Preserve audio from your video clips</p>
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

					<!-- Voice-over volume slider (if recorded) -->
					{#if voiceOverBlob}
						<div class="flex items-center gap-3 px-1">
							<svg class="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
							</svg>
							<span class="text-xs text-text-primary w-16 shrink-0">Voice Over</span>
							<input
								type="range"
								min="0"
								max="100"
								bind:value={voiceOverVolume}
								class="flex-1 bg-accent/30 text-accent"
							/>
							<span class="text-xs text-text-muted font-mono w-9 text-right">{voiceOverVolume}%</span>
						</div>
					{/if}

					<!-- Voice-over record / re-record -->
					{#if supportsVoiceOver && videoBlob}
						<div class="p-4 bg-card rounded-xl border border-border">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
									<svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
									</svg>
								</div>
								<div class="flex-1 min-w-0">
									{#if voiceOverBlob}
										<p class="text-sm font-medium text-text-primary">Voice-over recorded</p>
										<p class="text-xs text-accent">Adjust volume above or re-record</p>
									{:else}
										<p class="text-sm font-medium text-text-primary">Add narration</p>
										<p class="text-xs text-text-muted">Record while watching your video</p>
									{/if}
								</div>
								<Button variant={voiceOverBlob ? 'ghost' : 'primary'} onclick={() => { voiceOverRecording = true; }}>
									{voiceOverBlob ? 'Re-record' : 'Record'}
								</Button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Audio action buttons -->
				<div class="flex flex-col gap-3 w-full">
					{#if ondownload}
						{#if hasAnyAudio}
							<Button variant="primary" onclick={handleApplyAndDownload}>
								Apply Audio & Download
							</Button>
						{:else}
							<Button variant="primary" onclick={() => { ondownload?.(); audioFinalized = true; }}>
								Download Video
							</Button>
						{/if}
					{/if}
					<button
						class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors text-center"
						onclick={() => { audioFinalized = true; }}
					>
						Skip to sharing
					</button>
				</div>
			{:else}
				<!-- Phase 2: Finalized — download + share -->
				<div class="flex flex-col gap-3 w-full">
					{#if ondownload}
						<Button variant="primary" onclick={ondownload}>
							Download Video
						</Button>
					{/if}

					{#if onshare}
						<Button variant="secondary" onclick={onshare}>
							Share
						</Button>
					{/if}

					{#if shareUrl}
						<div class="bg-card border border-border rounded-lg p-4">
							<p class="text-sm text-text-secondary mb-2">Share this trip:</p>
							<div class="flex items-center gap-2">
								<input
									type="text"
									readonly
									value={shareUrl}
									class="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-secondary min-w-0"
								/>
								{#if oncopylink}
									<button
										class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors cursor-pointer flex-shrink-0"
										onclick={oncopylink}
									>
										Copy
									</button>
								{/if}
							</div>
						</div>
					{/if}

					{#if ondashboard}
						<Button variant="ghost" onclick={ondashboard}>
							View My Trips
						</Button>
					{/if}

					<button
						class="text-xs text-text-muted hover:text-text-secondary cursor-pointer transition-colors text-center mt-1"
						onclick={() => { audioFinalized = false; }}
					>
						Edit audio
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Pre-export: aspect ratio + map style selection -->
		<div>
			<span class="block text-sm font-medium text-text-secondary mb-3">Aspect Ratio</span>
			<div class="grid grid-cols-3 gap-3">
				{#each ratios as ratio}
					<button
						class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer
							{aspectRatio === ratio.value
							? 'border-accent bg-accent-light'
							: 'border-border bg-card hover:border-primary-light'}"
						onclick={() => (aspectRatio = ratio.value)}
					>
						<div
							class="{ratio.width} {ratio.height} rounded border-2
								{aspectRatio === ratio.value ? 'border-accent' : 'border-border'}"
						></div>
						<div class="text-center">
							<p class="text-xs font-medium {aspectRatio === ratio.value ? 'text-text-primary' : 'text-text-muted'}">
								{ratio.label}
							</p>
							<p class="text-xs text-text-muted">{ratio.value}</p>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<div>
			<span class="block text-sm font-medium text-text-secondary mb-3">Map Style</span>
			<div class="grid grid-cols-3 gap-2">
				{#each mapStyles as style}
					<button
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer
							{mapStyle === style.value
							? 'border-accent bg-accent-light'
							: 'border-border bg-card hover:border-primary-light'}"
						onclick={() => (mapStyle = style.value)}
					>
						<span class="text-xl">{style.icon}</span>
						<span class="text-xs font-medium {mapStyle === style.value ? 'text-text-primary' : 'text-text-muted'}">
							{style.label}
						</span>
					</button>
				{/each}
			</div>
		</div>

		{#if estimatedDuration}
			<p class="text-sm text-text-muted text-center">Estimated duration: {estimatedDuration}</p>
		{/if}

		<div class="flex justify-between pt-4">
			<Button variant="ghost" onclick={onback}>Back</Button>
			<Button variant="primary" disabled={!canExport} onclick={onexport}>
				Export Video
			</Button>
		</div>
	{/if}
</div>
