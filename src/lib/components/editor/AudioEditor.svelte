<script lang="ts">
	import { tick } from 'svelte';
	import type { MusicSelection, Location } from '$lib/types';
	import type { VideoSegmentInfo } from '$lib/services/videoAssembler';
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
	import { CaretLeft, Microphone, SpeakerHigh, Play } from 'phosphor-svelte';

	let {
		videoUrl,
		videoBlob,
		videoSegments = [],
		locations = [],
		musicSelection = $bindable<MusicSelection | null>(null),
		musicVolume = $bindable(70),
		keepOriginalAudio = $bindable(true),
		voiceOverVolume = $bindable(100),
		title = 'Edit Audio',
		applyLabel = 'Apply Audio & Save',
		skipLabel,
		showBackArrow = true,
		onback,
		onapply
	}: {
		videoUrl: string;
		videoBlob: Blob;
		videoSegments?: VideoSegmentInfo[];
		locations?: Location[];
		musicSelection?: MusicSelection | null;
		musicVolume?: number;
		keepOriginalAudio?: boolean;
		voiceOverVolume?: number;
		title?: string;
		applyLabel?: string;
		skipLabel?: string;
		showBackArrow?: boolean;
		onback: () => void;
		onapply: (mergedBlob: Blob | null, mergedUrl: string | null) => void;
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

	// Segment tracking during voice recording
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

	// Video + music playback elements
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
			// Expected: autoplay restrictions may prevent playback
			mus.play().catch(() => {});
		}
		function handlePause() { mus.pause(); }
		function handleSeeked() { syncTime(); }
		function handleTimeUpdate() {
			if (mus.ended || mus.currentTime >= mus.duration) {
				mus.currentTime = 0;
				// Expected: autoplay restrictions may prevent playback
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
		function handlePlay() {
			vo.currentTime = vid.currentTime;
			// Expected: autoplay restrictions may prevent playback
			vo.play().catch(() => {});
		}
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
				// Expected: closing an already-closed context throws
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

		// Auto-lower music volume so voice-over is prominent
		if (musicVolume > 20) musicVolume = 20;

		if (videoEl) videoEl.pause();
		waveformRenderer?.stop();
		waveformRenderer = null;
		if (timeUpdateInterval) { clearInterval(timeUpdateInterval); timeUpdateInterval = null; }
		micStream?.getTracks().forEach((t) => t.stop());
		micStream = null;
		audioRecorderHandle = null;

		if (audioCtx && audioCtx.state !== 'closed') {
			// Expected: closing an already-closed context throws
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

	// ─── Audio merge ─────────────────────────────────────────────

	async function handleApplyAndSave() {
		if (!musicBlob && !voiceOverBlob) {
			onapply(null, null);
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
			onapply(result.blob, result.url);
		} catch (err) {
			console.error('[AudioEditor] Audio merge failed:', err);
			merging = false;
		}
	}
</script>

<style>
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

{#if merging}
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
{:else}
	<!-- Audio editor -->
	<div class="flex flex-col items-center py-6 gap-5">
		<div class="flex items-center gap-3 w-full">
			{#if showBackArrow}
				<button
					class="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
					onclick={onback}
					aria-label="Back"
				>
					<CaretLeft size={20} weight="bold" />
				</button>
			{/if}
			<h3 class="text-xl font-semibold text-text-primary">{title}</h3>
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
							<Play size={28} weight="fill" />
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

		<!-- Unified audio card -->
		<div class="w-full bg-card rounded-xl border border-border overflow-hidden">
			<!-- Voice-over recording controls -->
			{#if supportsVoiceOver}
				<div class="p-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
							<Microphone size={20} weight="bold" class="text-accent" />
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
								<p class="text-xs text-text-muted">Adjust volume below</p>
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

			<!-- Mixer & music sections (hidden during active recording) -->
			{#if recordingPhase === 'idle'}
				<!-- Voice-over volume + remove -->
				{#if voiceOverBlob}
					<div class="border-t border-border px-4 py-3 space-y-2">
						<div class="flex items-center gap-3">
							<Microphone size={16} weight="bold" class="text-purple-400 shrink-0" />
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
					</div>
				{/if}

				<!-- Original Audio toggle -->
				{#if hasVideoWithAudio}
					<div class="border-t border-border px-4 py-3">
						<div class="flex items-center gap-3">
							<SpeakerHigh size={16} weight="bold" class="text-amber-400 shrink-0" />
							<span class="text-xs text-text-primary flex-1">Original Audio</span>
							<button
								class="relative w-9 h-5 rounded-full transition-colors cursor-pointer {keepOriginalAudio ? 'bg-accent' : 'bg-border'}"
								onclick={() => { keepOriginalAudio = !keepOriginalAudio; }}
								aria-label={keepOriginalAudio ? 'Mute original audio' : 'Unmute original audio'}
							>
								<div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform {keepOriginalAudio ? 'translate-x-4' : ''}"></div>
							</button>
						</div>
					</div>
				{/if}

				<!-- Background Music (inline, compact) -->
				<div class="border-t border-border">
					<MusicPicker
						bind:musicSelection
						bind:musicVolume
						{videoDuration}
						compact
						onvolumechange={(vol) => { if (musicAudioEl) musicAudioEl.volume = vol / 100; }}
					/>
				</div>
			{/if}
		</div>

		<!-- Audio action buttons -->
		{#if recordingPhase === 'idle'}
			<div class="flex flex-col gap-3 w-full">
				{#if hasAnyAudio}
					<Button variant="primary" onclick={handleApplyAndSave}>
						{applyLabel}
					</Button>
				{/if}
				<button
					class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors text-center"
					onclick={onback}
				>
					{skipLabel ?? (hasAnyAudio ? 'Back without applying' : 'Back to video')}
				</button>
			</div>
		{/if}
	</div>
{/if}
