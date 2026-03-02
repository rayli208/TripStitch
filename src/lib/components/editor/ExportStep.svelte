<script lang="ts">
	import { tick } from 'svelte';
	import type { AspectRatio, MapStyle, MusicSelection, Location } from '$lib/types';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import {
		canRecordVoiceOver,
		mergeVoiceOver,
		createAudioRecorder,
		createWaveformRenderer,
		type AudioRecorderHandle,
		type WaveformRenderer
	} from '$lib/services/voiceOverService';
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
		exportPaused = false,
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
		exportPaused?: boolean;
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

	const supportsVoiceOver = canRecordVoiceOver();
	const hasVideoWithAudio = $derived(locations.some((l) => l.clips.some((c) => c.type === 'video' && c.file)));
	const musicBlob = $derived(musicSelection?.audioBlob ?? null);
	const musicStartOffset = $derived(musicSelection?.startOffsetSec ?? 0);

	// Voice-over state
	let voiceOverBlob = $state<Blob | null>(null);
	let voiceOverUrl = $state<string | null>(null);
	const hasAnyAudio = $derived(!!musicBlob || !!voiceOverBlob);

	// Inline voice recording state
	type RecordingPhase = 'idle' | 'countdown' | 'recording';
	let recordingPhase = $state<RecordingPhase>('idle');
	let countdown = $state(3);
	let isPaused = $state(false);
	let micStream: MediaStream | null = null;
	let audioRecorderHandle: AudioRecorderHandle | null = null;
	let audioCtx: AudioContext | null = null;
	let waveformRenderer: WaveformRenderer | null = null;
	let waveformCanvas: HTMLCanvasElement | undefined = $state();
	let voRecordError = $state<string | null>(null);

	// Flow state: 'done' = clean result, 'audio' = editing audio
	type PostPhase = 'done' | 'audio';
	let postPhase = $state<PostPhase>('done');

	// ─── Segment tracking during voice recording ────────────────
	const SEGMENT_COLORS: Record<string, string> = {
		title: '#F59E0B',
		map: '#3B82F6',
		clip: '#A855F7',
		route: '#22C55E'
	};

	let recCurrentTime = $state(0);
	let recDuration = $state(0);
	let timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

	let segEstimatedDuration = $derived(
		videoSegments.length > 0
			? videoSegments.reduce((sum, s) => Math.max(sum, s.startSec + s.durationSec), 0)
			: 0
	);

	let activeSegment = $derived.by(() => {
		if (!videoSegments.length || !recDuration) return null;
		const scaledTime = (recCurrentTime / recDuration) * segEstimatedDuration;
		return videoSegments.find(s => scaledTime >= s.startSec && scaledTime < s.startSec + s.durationSec) ?? null;
	});

	let recProgressPct = $derived(recDuration > 0 ? (recCurrentTime / recDuration) * 100 : 0);

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

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

	// Keep music volume in sync — mute during voice recording
	$effect(() => {
		if (!musicAudioEl) return;
		if (recordingPhase !== 'idle') {
			musicAudioEl.volume = 0;
			musicAudioEl.pause();
		} else {
			musicAudioEl.volume = musicVolume / 100;
		}
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

	// Keep voice-over preview volume in sync — mute during recording
	$effect(() => {
		if (!voPreviewAudioEl) return;
		if (recordingPhase !== 'idle') {
			voPreviewAudioEl.volume = 0;
			voPreviewAudioEl.pause();
		} else {
			voPreviewAudioEl.volume = voiceOverVolume / 100;
		}
	});

	// Waveform: connect during recording
	$effect(() => {
		if (!waveformCanvas || recordingPhase !== 'recording' || !audioRecorderHandle) return;
		waveformRenderer = createWaveformRenderer(waveformCanvas, audioRecorderHandle.analyserNode, {
			barColor: 'rgba(255,255,255,0.9)',
			barCount: 6
		});
		waveformRenderer.start();
		return () => {
			waveformRenderer?.stop();
			waveformRenderer = null;
		};
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			waveformRenderer?.stop();
			if (audioCtx && audioCtx.state !== 'closed') {
				audioCtx.close().catch(() => {});
			}
		};
	});

	// ─── Inline Voice Recording ─────────────────────────────────

	async function startVoiceRecording() {
		voRecordError = null;
		try {
			micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			voRecordError = 'Microphone access denied. Please allow mic access and try again.';
			return;
		}

		// Countdown
		recordingPhase = 'countdown';
		await tick();
		if (videoEl) videoEl.currentTime = 0;

		for (let i = 3; i > 0; i--) {
			countdown = i;
			await new Promise((r) => setTimeout(r, 1000));
		}

		// Start recording
		recordingPhase = 'recording';
		isPaused = false;
		recCurrentTime = 0;

		audioCtx = new AudioContext();
		audioRecorderHandle = createAudioRecorder(micStream, audioCtx);
		audioRecorderHandle.start();

		// Track video time for segment overlay
		timeUpdateInterval = setInterval(() => {
			if (videoEl) {
				recCurrentTime = videoEl.currentTime;
				if (!recDuration && videoEl.duration && isFinite(videoEl.duration)) {
					recDuration = videoEl.duration;
				}
			}
		}, 50);

		await tick();

		if (videoEl) {
			videoEl.muted = !keepOriginalAudio;
			videoEl.volume = keepOriginalAudio ? 0.15 : 0;
			try {
				await videoEl.play();
			} catch (e) {
				console.warn('[VoiceOver] Video play failed, retrying', e);
				await new Promise((r) => setTimeout(r, 200));
				await videoEl.play();
			}
			if (!recDuration && videoEl.duration && isFinite(videoEl.duration)) {
				recDuration = videoEl.duration;
			}
		}
	}

	function toggleRecordingPause() {
		if (!audioRecorderHandle) return;
		if (isPaused) {
			audioRecorderHandle.resume();
			videoEl?.play();
			waveformRenderer?.setPaused(false);
			isPaused = false;
		} else {
			audioRecorderHandle.pause();
			videoEl?.pause();
			waveformRenderer?.setPaused(true);
			isPaused = true;
		}
	}

	async function stopVoiceRecording() {
		if (!audioRecorderHandle) return;
		if (isPaused) {
			audioRecorderHandle.resume();
			isPaused = false;
		}

		const blob = await audioRecorderHandle.stop();
		voiceOverBlob = blob;
		if (voiceOverUrl) URL.revokeObjectURL(voiceOverUrl);
		voiceOverUrl = URL.createObjectURL(blob);

		if (videoEl) videoEl.pause();
		waveformRenderer?.stop();
		waveformRenderer = null;
		if (timeUpdateInterval) { clearInterval(timeUpdateInterval); timeUpdateInterval = null; }
		micStream?.getTracks().forEach((t) => t.stop());
		micStream = null;
		audioRecorderHandle = null;

		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
		audioCtx = null;

		recordingPhase = 'idle';
	}

	function handleVideoEnded() {
		if (recordingPhase === 'recording' && !isPaused) {
			stopVoiceRecording();
		}
	}

	function removeVoiceOver() {
		if (voiceOverUrl) URL.revokeObjectURL(voiceOverUrl);
		voiceOverBlob = null;
		voiceOverUrl = null;
	}

	// ─── Audio merge + download ─────────────────────────────────

	async function handleApplyAndDownload() {
		if (!videoBlob) return;

		if (!musicBlob && !voiceOverBlob) {
			ondownload?.();
			postPhase = 'done';
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
			postPhase = 'done';
		} catch (err) {
			console.error('[ExportStep] Audio merge failed:', err);
			merging = false;
		}
	}

	// Find which export step is currently active by matching the progress step ID
	let activeStepIndex = $derived.by(() => {
		if (!progress || !isExporting) return -1;
		return exportSteps.findIndex((s) => s.id === progress.step);
	});

	let progressPercent = $derived.by(() => {
		if (!isExporting || activeStepIndex < 0) return 0;
		return Math.round(((activeStepIndex + 0.5) / exportSteps.length) * 100);
	});

	function getStepStatus(stepId: string): 'pending' | 'active' | 'done' {
		if (!progress || !isExporting) return 'pending';
		const thisIdx = exportSteps.findIndex((s) => s.id === stepId);
		if (thisIdx < 0) return 'pending';
		if (thisIdx < activeStepIndex) return 'done';
		if (thisIdx === activeStepIndex) return 'active';
		return 'pending';
	}

	// Platform share helpers
	let canShareFiles = $derived.by(() => {
		if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare || !videoBlob) return false;
		try {
			const testFile = new File([new Blob([''])], 'test.mp4', { type: 'video/mp4' });
			return navigator.canShare({ files: [testFile] });
		} catch {
			return false;
		}
	});

	function shareToApp() {
		if (!videoBlob) return;
		const file = new File([videoBlob], `${tripTitle || 'tripstitch'}.mp4`, { type: videoBlob.type });
		navigator.share({ files: [file] }).catch(() => {});
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

	@keyframes pulse-red {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
	.animate-pulse-red {
		animation: pulse-red 1s ease-in-out infinite;
	}

	@keyframes countPulse {
		0% { transform: scale(0.8); opacity: 0; }
		50% { transform: scale(1.1); }
		100% { transform: scale(1); opacity: 1; }
	}
	.count-pulse {
		animation: countPulse 0.4s ease-out;
	}

	@keyframes fadeSlideIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.fade-slide-in {
		animation: fadeSlideIn 0.25s ease-out;
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
	<audio
		bind:this={musicAudioEl}
		src={musicSelection.previewUrl}
		onloadeddata={() => { if (musicAudioEl) musicAudioEl.volume = musicVolume / 100; }}
	></audio>
{/if}
{#if voiceOverUrl}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio bind:this={voPreviewAudioEl} src={voiceOverUrl}></audio>
{/if}

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-semibold mb-1">Export</h2>
		<p class="text-sm text-text-muted">Export your TripStitch.</p>
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
			{#if exportPaused}
				<div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/30">
					<svg class="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p class="text-sm font-medium text-warning">Stitching paused — switch back to continue</p>
				</div>
			{:else}
				<p class="text-base font-medium text-text-primary">
					{progress?.message ?? 'Getting things ready...'}
				</p>
			{/if}

			{#if exportSteps.length > 0}
				<div class="w-full max-w-xs space-y-2">
					{#each exportSteps as step, i}
						{@const status = getStepStatus(step.id)}
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
					<p class="text-xs text-text-muted text-center mt-1">
						Elapsed: {Math.floor(exportElapsed / 60)}:{String(exportElapsed % 60).padStart(2, '0')}{exportPaused ? ' (paused)' : ''}
					</p>
				{/if}
			</div>

			<p class="text-xs text-text-muted text-center px-4">Keep this tab open and active while your video is being stitched together</p>

			{#if oncancel}
				<button
					class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors mt-2"
					onclick={oncancel}
				>
					Cancel export
				</button>
			{/if}
		</div>
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
	{:else if exportDone && videoUrl && postPhase === 'audio'}
		<!-- Dedicated audio editing view -->
		<div class="flex flex-col items-center py-6 gap-5">
			<div class="flex items-center gap-3 w-full">
				<button
					class="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
					onclick={() => { postPhase = 'done'; }}
					aria-label="Back"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<h3 class="text-xl font-semibold text-text-primary">Edit Audio</h3>
			</div>

			<!-- Segment timeline (during recording) -->
			{#if recordingPhase === 'recording' && videoSegments.length > 0 && recDuration > 0}
				<div class="flex items-center gap-2 w-full px-0.5">
					<span class="text-[10px] text-text-muted font-mono w-7 shrink-0">{formatTime(recCurrentTime)}</span>
					<div class="relative flex-1 h-2 bg-border rounded-full overflow-hidden">
						{#each videoSegments as seg}
							{@const leftPct = (seg.startSec / segEstimatedDuration) * 100}
							{@const widthPct = (seg.durationSec / segEstimatedDuration) * 100}
							<div
								class="absolute top-0 h-full opacity-50"
								style="left: {leftPct}%; width: {widthPct}%; background: {SEGMENT_COLORS[seg.type]}"
							></div>
						{/each}
						<div
							class="absolute top-0 left-0 h-full bg-white/20 rounded-full"
							style="width: {recProgressPct}%"
						></div>
						<div
							class="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-sm z-10"
							style="left: calc({recProgressPct}% - 5px)"
						></div>
						{#each videoSegments as seg, i}
							{#if i > 0}
								{@const leftPct = (seg.startSec / segEstimatedDuration) * 100}
								<div
									class="absolute top-0 h-full w-px bg-text-muted/50"
									style="left: {leftPct}%"
								></div>
							{/if}
						{/each}
					</div>
					<span class="text-[10px] text-text-muted font-mono w-7 shrink-0 text-right">{formatTime(recDuration)}</span>
				</div>
			{/if}

			<!-- Video preview with recording overlays -->
			<div class="w-full rounded-lg overflow-hidden bg-overlay relative">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					src={videoUrl}
					controls={recordingPhase === 'idle'}
					playsinline
					onended={handleVideoEnded}
					class="w-full max-h-80 object-contain"
				></video>

				{#if recordingPhase === 'countdown'}
					<div class="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-20">
						{#key countdown}
							<div class="text-7xl font-bold text-white count-pulse" style="text-shadow: 0 0 40px rgba(244,132,95,0.5);">
								{countdown}
							</div>
						{/key}
						<p class="text-white/60 text-sm mt-3">Get ready to narrate...</p>
					</div>
				{/if}

				{#if recordingPhase === 'recording'}
					<!-- REC / PAUSED badge -->
					<div class="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full z-10 {isPaused ? 'bg-yellow-600/80' : 'bg-red-600/80'} backdrop-blur-sm">
						<div class="w-2 h-2 rounded-full {isPaused ? 'bg-yellow-200' : 'bg-white animate-pulse-red'}"></div>
						<span class="text-[10px] font-bold text-white tracking-wider">
							{isPaused ? 'PAUSED' : 'REC'}
						</span>
					</div>

					<!-- Mini audio level meter -->
					<div class="absolute top-2 right-2 bg-black/40 backdrop-blur-sm rounded-lg px-1.5 py-1 z-10">
						<canvas
							bind:this={waveformCanvas}
							width={48}
							height={20}
							class="w-12 h-5 block"
						></canvas>
					</div>

					<!-- Tap to pause/resume -->
					<button
						class="absolute inset-0 z-10 flex items-center justify-center cursor-pointer focus:outline-none"
						onclick={toggleRecordingPause}
						aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
					>
						{#if isPaused}
							<div class="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
								<svg class="w-7 h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z" />
								</svg>
							</div>
						{/if}
					</button>

					<!-- Now narrating chip -->
					{#if activeSegment}
						{#key activeSegment.id}
							<div class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 max-w-[80%] z-10 fade-slide-in">
								<div class="w-2 h-2 rounded-full shrink-0 animate-pulse-red" style="background: {SEGMENT_COLORS[activeSegment.type]}"></div>
								<span class="text-[11px] text-white/90 font-medium truncate">{activeSegment.label}</span>
							</div>
						{/key}
					{/if}
				{/if}
			</div>

			<!-- Voice-over recording controls -->
			{#if supportsVoiceOver && videoBlob}
				<div class="w-full p-4 bg-card rounded-xl border border-border">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
							<svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
							</svg>
						</div>
						<div class="flex-1 min-w-0">
							{#if recordingPhase === 'recording'}
								<p class="text-sm font-medium text-text-primary">Recording...</p>
								<p class="text-xs text-red-400">Tap video to {isPaused ? 'resume' : 'pause'}</p>
							{:else if recordingPhase === 'countdown'}
								<p class="text-sm font-medium text-text-primary">Starting in {countdown}...</p>
								<p class="text-xs text-text-muted">Get ready to narrate</p>
							{:else if voiceOverBlob}
								<p class="text-sm font-medium text-text-primary">Voice-over recorded</p>
								<p class="text-xs text-text-muted">Adjust in the mixer below</p>
							{:else}
								<p class="text-sm font-medium text-text-primary">Add narration</p>
								<p class="text-xs text-text-muted">Record while watching your video</p>
							{/if}
						</div>
						{#if recordingPhase === 'recording'}
							<button
								class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-colors cursor-pointer"
								onclick={stopVoiceRecording}
							>
								Stop
							</button>
						{:else if recordingPhase === 'countdown'}
							<!-- Countdown in progress -->
						{:else}
							<Button variant={voiceOverBlob ? 'ghost' : 'primary'} onclick={startVoiceRecording}>
								{voiceOverBlob ? 'Re-record' : 'Record'}
							</Button>
						{/if}
					</div>
					{#if voRecordError}
						<p class="text-xs text-error mt-2">{voRecordError}</p>
					{/if}
				</div>
			{/if}

			<!-- Audio controls (disabled during recording) -->
			{#if recordingPhase === 'idle'}
				{#if hasVideoWithAudio || voiceOverBlob}
					<div class="w-full bg-card rounded-xl border border-border overflow-hidden">
						<div class="px-4 pb-4 pt-4 space-y-3">
							<!-- Original Audio -->
							{#if hasVideoWithAudio}
								<div class="flex items-center gap-3">
									<svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
									</svg>
									<span class="text-xs text-text-primary flex-1">Original Audio</span>
									<!-- Mute toggle -->
									<button
										class="relative w-9 h-5 rounded-full transition-colors cursor-pointer {keepOriginalAudio ? 'bg-accent' : 'bg-border'}"
										onclick={() => { keepOriginalAudio = !keepOriginalAudio; }}
										aria-label={keepOriginalAudio ? 'Mute original audio' : 'Unmute original audio'}
									>
										<div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform {keepOriginalAudio ? 'translate-x-4' : ''}"></div>
									</button>
								</div>
							{/if}

							<!-- Voice-over -->
							{#if voiceOverBlob}
								<div class="flex items-center gap-3">
									<svg class="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
									</svg>
									<span class="text-xs text-text-primary w-14 shrink-0">Voice-over</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={voiceOverVolume}
										oninput={() => { if (voPreviewAudioEl) voPreviewAudioEl.volume = voiceOverVolume / 100; }}
										class="flex-1 bg-accent/30 text-accent"
									/>
									<span class="text-xs text-text-muted font-mono w-9 text-right">{voiceOverVolume}%</span>
								</div>
								<button
									class="text-xs text-text-muted hover:text-error transition-colors cursor-pointer ml-7"
									onclick={removeVoiceOver}
								>
									Remove voice-over
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Music picker for selecting/changing tracks -->
				<MusicPicker
					bind:musicSelection
					bind:musicVolume
					{videoDuration}
					onvolumechange={(vol) => { if (musicAudioEl) musicAudioEl.volume = vol / 100; }}
				/>
			{/if}

			<!-- Audio action buttons -->
			{#if recordingPhase === 'idle'}
				<div class="flex flex-col gap-3 w-full">
					{#if hasAnyAudio}
						<Button variant="primary" onclick={handleApplyAndDownload}>
							Apply Audio & Save
						</Button>
					{/if}
					<button
						class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors text-center"
						onclick={() => { postPhase = 'done'; }}
					>
						{hasAnyAudio ? 'Back without applying' : 'Back to video'}
					</button>
				</div>
			{/if}
		</div>
	{:else if exportDone && videoUrl}
		<!-- Clean "done" screen -->
		<div class="flex flex-col items-center py-6 gap-5">
			<h3 class="text-xl font-semibold text-text-primary">Your TripStitch is ready!</h3>

			<!-- Video preview -->
			<div class="w-full rounded-lg overflow-hidden bg-overlay">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					src={videoUrl}
					controls
					playsinline
					class="w-full max-h-80 object-contain"
				></video>
			</div>

			<div class="flex flex-col gap-3 w-full">
				{#if ondownload}
					<Button variant="primary" onclick={ondownload}>
						Save Video
					</Button>
				{/if}

				<Button variant="ghost" onclick={() => { postPhase = 'audio'; }}>
					<span class="flex items-center gap-2">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
						</svg>
						Edit Audio
					</span>
				</Button>

				<!-- Share to platforms -->
				<div class="space-y-2 mt-2">
					<p class="text-sm font-medium text-text-secondary text-center">Share to</p>
					<div class="grid grid-cols-3 gap-2">
						{#if canShareFiles}
							<button
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
								onclick={shareToApp}
							>
								<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
									<rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
									<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
									<circle cx="18" cy="6" r="1.2" fill="currentColor" class="text-pink-500" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">Instagram</span>
							</button>
						{:else}
							<a
								href="https://www.instagram.com"
								target="_blank"
								rel="noopener noreferrer"
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
							>
								<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
									<rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
									<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
									<circle cx="18" cy="6" r="1.2" fill="currentColor" class="text-pink-500" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">Instagram</span>
							</a>
						{/if}

						{#if canShareFiles}
							<button
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
								onclick={shareToApp}
							>
								<svg class="w-6 h-6 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.16 8.16 0 005.58 2.2v-3.46a4.85 4.85 0 01-3.58-1.47V6.69h3.58z" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">TikTok</span>
							</button>
						{:else}
							<a
								href="https://www.tiktok.com/upload"
								target="_blank"
								rel="noopener noreferrer"
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
							>
								<svg class="w-6 h-6 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.16 8.16 0 005.58 2.2v-3.46a4.85 4.85 0 01-3.58-1.47V6.69h3.58z" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">TikTok</span>
							</a>
						{/if}

						{#if canShareFiles}
							<button
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
								onclick={shareToApp}
							>
								<svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
									<path d="M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.56A3.02 3.02 0 00.5 6.2 31.7 31.7 0 000 12a31.7 31.7 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.84.56 9.38.56 9.38.56s7.54 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.7 31.7 0 0024 12a31.7 31.7 0 00-.5-5.8zM9.75 15.56V8.44L15.75 12l-6 3.56z" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">YouTube</span>
							</button>
						{:else}
							<a
								href="https://www.youtube.com/upload"
								target="_blank"
								rel="noopener noreferrer"
								class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
							>
								<svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
									<path d="M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.56A3.02 3.02 0 00.5 6.2 31.7 31.7 0 000 12a31.7 31.7 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.84.56 9.38.56 9.38.56s7.54 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.7 31.7 0 0024 12a31.7 31.7 0 00-.5-5.8zM9.75 15.56V8.44L15.75 12l-6 3.56z" />
								</svg>
								<span class="text-xs font-medium text-text-secondary">YouTube</span>
							</a>
						{/if}
					</div>
					{#if !canShareFiles}
						<p class="text-xs text-text-muted text-center">Download the video first, then upload to your platform</p>
					{/if}
				</div>

				{#if shareUrl}
					<div class="bg-card border border-border rounded-lg p-4 w-full">
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
			</div>
		</div>
	{:else}
		<!-- Cancelled or idle — let user retry or go back -->
		<div class="text-center py-8 space-y-4">
			<p class="text-sm text-text-muted">Ready to stitch your video.</p>
			{#if estimatedDuration}
				<p class="text-xs text-text-muted">Estimated duration: {estimatedDuration}</p>
			{/if}
			<div class="flex justify-center gap-3">
				<Button variant="ghost" onclick={onback}>Review</Button>
				<Button variant="primary" disabled={!canExport} onclick={onexport}>
					Stitch Video
				</Button>
			</div>
		</div>
	{/if}
</div>
