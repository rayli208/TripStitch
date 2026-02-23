<script lang="ts">
	import { tick } from 'svelte';
	import {
		createAudioRecorder,
		createWaveformRenderer,
		mergeVoiceOver,
		type AudioRecorderHandle,
		type WaveformRenderer
	} from '$lib/services/voiceOverService';
	import type { VideoSegmentInfo } from '$lib/services/videoAssembler';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		videoUrl,
		videoBlob,
		keepOriginalAudio = true,
		segments = [],
		onaccept,
		oncancel
	}: {
		videoUrl: string;
		videoBlob: Blob;
		keepOriginalAudio?: boolean;
		segments?: VideoSegmentInfo[];
		onaccept: (blob: Blob, url: string) => void;
		oncancel: () => void;
	} = $props();

	type Phase = 'setup' | 'countdown' | 'recording' | 'preview' | 'merging';
	let phase = $state<Phase>('setup');
	let countdown = $state(3);
	let voiceOverBlob = $state<Blob | null>(null);
	let voiceOverUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let mergePercent = $state(0);
	let mergeMsg = $state('');

	// Video playback tracking
	let videoEl: HTMLVideoElement | undefined = $state();
	let voAudioEl: HTMLAudioElement | undefined = $state();
	let currentTime = $state(0);
	let duration = $state(0);

	let micStream: MediaStream | null = null;
	let audioRecorderHandle: AudioRecorderHandle | null = null;
	let timeUpdateRaf: ReturnType<typeof setInterval> | null = null;

	let isPaused = $state(false);
	let audioCtx: AudioContext | null = null;
	let waveformRenderer: WaveformRenderer | null = null;
	let voiceOverVolume = $state(100);
	let waveformCanvas: HTMLCanvasElement | undefined = $state();

	// Segment colors by type
	const SEGMENT_COLORS: Record<string, string> = {
		title: '#F59E0B',
		map: '#3B82F6',
		clip: '#A855F7',
		route: '#22C55E'
	};

	// Total estimated duration from segments
	let estimatedDuration = $derived(
		segments.length > 0
			? segments.reduce((sum, s) => Math.max(sum, s.startSec + s.durationSec), 0)
			: 0
	);

	// Active segment at current time
	let activeSegment = $derived.by(() => {
		if (!segments.length || !duration) return null;
		const scaledTime = (currentTime / duration) * estimatedDuration;
		return segments.find(s => scaledTime >= s.startSec && scaledTime < s.startSec + s.durationSec) ?? null;
	});

	// Progress percentage through video
	let progressPct = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

	// Mini waveform: connect during recording only
	$effect(() => {
		if (!waveformCanvas || phase !== 'recording' || !audioRecorderHandle) return;
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

	// Sync voice-over audio with video during preview
	$effect(() => {
		if (phase !== 'preview' || !videoEl || !voAudioEl) return;
		const vid = videoEl;
		const vo = voAudioEl;
		function handlePlay() { vo.play().catch(() => {}); }
		function handlePause() { vo.pause(); }
		function handleSeeked() { vo.currentTime = vid.currentTime; }
		vid.addEventListener('play', handlePlay);
		vid.addEventListener('pause', handlePause);
		vid.addEventListener('seeked', handleSeeked);
		return () => {
			vid.removeEventListener('play', handlePlay);
			vid.removeEventListener('pause', handlePause);
			vid.removeEventListener('seeked', handleSeeked);
		};
	});

	// Update voice-over audio volume when slider changes
	$effect(() => {
		if (voAudioEl) voAudioEl.volume = voiceOverVolume / 100;
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

	async function startRecording() {
		error = null;
		try {
			micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			error = 'Microphone access denied. Please allow mic access and try again.';
			return;
		}

		// Show video with countdown overlay
		phase = 'countdown';
		await tick();
		if (videoEl) videoEl.currentTime = 0;

		for (let i = 3; i > 0; i--) {
			countdown = i;
			await new Promise((r) => setTimeout(r, 1000));
		}

		// Start recording
		phase = 'recording';
		currentTime = 0;
		isPaused = false;

		audioCtx = new AudioContext();
		audioRecorderHandle = createAudioRecorder(micStream, audioCtx);
		audioRecorderHandle.start();

		timeUpdateRaf = setInterval(() => {
			if (videoEl) {
				currentTime = videoEl.currentTime;
				if (!duration && videoEl.duration && isFinite(videoEl.duration)) {
					duration = videoEl.duration;
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
			if (!duration && videoEl.duration && isFinite(videoEl.duration)) {
				duration = videoEl.duration;
			}
		}
	}

	function togglePause() {
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

	async function stopRecording() {
		if (!audioRecorderHandle) return;
		if (isPaused) {
			audioRecorderHandle.resume();
			isPaused = false;
		}

		const blob = await audioRecorderHandle.stop();
		voiceOverBlob = blob;
		voiceOverUrl = URL.createObjectURL(blob);

		if (videoEl) videoEl.pause();
		waveformRenderer?.stop();
		waveformRenderer = null;
		if (timeUpdateRaf) { clearInterval(timeUpdateRaf); timeUpdateRaf = null; }
		micStream?.getTracks().forEach((t) => t.stop());
		micStream = null;
		audioRecorderHandle = null;

		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
		audioCtx = null;

		phase = 'preview';
	}

	function handleVideoEnded() {
		if (phase === 'recording' && !isPaused) {
			stopRecording();
		}
	}

	function playPreview() {
		if (!videoEl || !voAudioEl) return;
		videoEl.currentTime = 0;
		voAudioEl.currentTime = 0;
		videoEl.muted = !keepOriginalAudio;
		videoEl.volume = keepOriginalAudio ? 0.15 : 0;
		voAudioEl.volume = voiceOverVolume / 100;
		videoEl.play();
		voAudioEl.play();
	}

	function tryAgain() {
		waveformRenderer?.stop();
		waveformRenderer = null;
		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
		audioCtx = null;
		if (voiceOverUrl) URL.revokeObjectURL(voiceOverUrl);
		voiceOverBlob = null;
		voiceOverUrl = null;
		error = null;
		currentTime = 0;
		isPaused = false;
		voiceOverVolume = 100;
		phase = 'setup';
	}

	async function acceptVoiceOver() {
		if (!voiceOverBlob) return;
		phase = 'merging';
		mergePercent = 0;
		mergeMsg = 'Preparing...';

		try {
			const result = await mergeVoiceOver(
				videoBlob,
				voiceOverBlob,
				keepOriginalAudio,
				(pct, msg) => { mergePercent = pct; mergeMsg = msg; },
				voiceOverVolume / 100,
				0.2
			);
			if (voiceOverUrl) URL.revokeObjectURL(voiceOverUrl);
			onaccept(result.blob, result.url);
		} catch (err) {
			console.error('[VoiceOver] Merge failed:', err);
			error = err instanceof Error ? err.message : 'Failed to merge voice-over';
			phase = 'preview';
		}
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
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

	@keyframes fadeSlideIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.fade-slide-in {
		animation: fadeSlideIn 0.25s ease-out;
	}

	@keyframes countPulse {
		0% { transform: scale(0.8); opacity: 0; }
		50% { transform: scale(1.1); }
		100% { transform: scale(1); opacity: 1; }
	}
	.count-pulse {
		animation: countPulse 0.4s ease-out;
	}

	/* Range input thumb styling */
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		height: 6px;
		border-radius: 3px;
		outline: none;
	}
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		border: 2px solid currentColor;
		cursor: pointer;
		margin-top: -5px;
	}
	input[type="range"]::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		border: 2px solid currentColor;
		cursor: pointer;
	}
</style>

<!-- Hidden audio for voice-over preview playback -->
{#if voiceOverUrl}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio bind:this={voAudioEl} src={voiceOverUrl}></audio>
{/if}

<div class="space-y-4">
	{#if phase === 'setup'}
		<!-- Setup: request mic and start -->
		<div class="text-center space-y-4">
			<h3 class="text-lg font-semibold text-text-primary">Record Voice Over</h3>
			<p class="text-sm text-text-muted">
				Your video will play while you narrate. Tap the video to pause or resume.
			</p>

			{#if error}
				<p class="text-sm text-error">{error}</p>
			{/if}

			<div class="flex justify-center gap-3 pt-2">
				<Button variant="ghost" onclick={oncancel}>Cancel</Button>
				<Button variant="primary" onclick={startRecording}>Start Recording</Button>
			</div>
		</div>

	{:else if phase === 'merging'}
		<!-- Merging progress -->
		<div class="flex flex-col items-center py-10 gap-5">
			<p class="text-base font-medium text-text-primary">Merging voice-over...</p>

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
		<!-- Video phases: countdown, recording, preview -->

		<!-- Segment timeline above video (recording only) -->
		{#if phase === 'recording' && segments.length > 0 && duration > 0}
			<div class="flex items-center gap-2 px-0.5">
				<span class="text-[10px] text-text-muted font-mono w-7 shrink-0">{formatTime(currentTime)}</span>
				<div class="relative flex-1 h-2 bg-border rounded-full overflow-hidden">
					<!-- Colored segment sections -->
					{#each segments as seg}
						{@const leftPct = (seg.startSec / estimatedDuration) * 100}
						{@const widthPct = (seg.durationSec / estimatedDuration) * 100}
						<div
							class="absolute top-0 h-full opacity-50"
							style="left: {leftPct}%; width: {widthPct}%; background: {SEGMENT_COLORS[seg.type]}"
						></div>
					{/each}

					<!-- Elapsed fill -->
					<div
						class="absolute top-0 left-0 h-full bg-white/20 rounded-full"
						style="width: {progressPct}%"
					></div>

					<!-- Playhead dot -->
					<div
						class="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-sm z-10"
						style="left: calc({progressPct}% - 5px)"
					></div>

					<!-- Segment boundary lines -->
					{#each segments as seg, i}
						{#if i > 0}
							{@const leftPct = (seg.startSec / estimatedDuration) * 100}
							<div
								class="absolute top-0 h-full w-px bg-text-muted/50"
								style="left: {leftPct}%"
							></div>
						{/if}
					{/each}
				</div>
				<span class="text-[10px] text-text-muted font-mono w-7 shrink-0 text-right">{formatTime(duration)}</span>
			</div>
		{/if}

		<!-- Video container with overlays -->
		<div class="w-full rounded-lg overflow-hidden bg-overlay relative">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoEl}
				src={videoUrl}
				playsinline
				preload="auto"
				controls={phase === 'preview'}
				onended={handleVideoEnded}
				class="w-full max-h-80 object-contain"
			></video>

			{#if phase === 'countdown'}
				<!-- Countdown overlay on video -->
				<div class="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-20">
					{#key countdown}
						<div class="text-7xl font-bold text-white count-pulse" style="text-shadow: 0 0 40px rgba(244,132,95,0.5);">
							{countdown}
						</div>
					{/key}
					<p class="text-white/60 text-sm mt-3">Get ready to narrate...</p>
				</div>
			{/if}

			{#if phase === 'recording'}
				<!-- REC / PAUSED badge — top left -->
				<div class="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full z-10 {isPaused ? 'bg-yellow-600/80' : 'bg-red-600/80'} backdrop-blur-sm">
					<div class="w-2 h-2 rounded-full {isPaused ? 'bg-yellow-200' : 'bg-white animate-pulse-red'}"></div>
					<span class="text-[10px] font-bold text-white tracking-wider">
						{isPaused ? 'PAUSED' : 'REC'}
					</span>
				</div>

				<!-- Mini audio level meter — top right -->
				<div class="absolute top-2 right-2 bg-black/40 backdrop-blur-sm rounded-lg px-1.5 py-1 z-10">
					<canvas
						bind:this={waveformCanvas}
						width={48}
						height={20}
						class="w-12 h-5 block"
					></canvas>
				</div>

				<!-- Tap to pause/resume — center overlay -->
				<button
					class="absolute inset-0 z-10 flex items-center justify-center cursor-pointer focus:outline-none"
					onclick={togglePause}
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

				<!-- Now narrating chip — bottom center -->
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

		<!-- Recording controls below video -->
		{#if phase === 'recording'}
			<div class="flex flex-col items-center gap-2">
				<p class="text-xs text-text-muted">
					{isPaused ? 'Paused — tap video to resume' : 'Tap video to pause'}
				</p>
				<button
					class="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium text-sm transition-colors cursor-pointer"
					onclick={stopRecording}
				>
					Stop Recording
				</button>
			</div>
		{/if}

		<!-- Preview controls -->
		{#if phase === 'preview'}
			<div class="space-y-4">
				<h3 class="text-base font-semibold text-text-primary text-center">Preview Voice Over</h3>

				{#if error}
					<p class="text-sm text-error text-center">{error}</p>
				{/if}

				<!-- Voice over volume slider -->
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

				<div class="flex justify-center">
					<Button variant="ghost" onclick={playPreview}>Play Preview</Button>
				</div>

				<div class="flex justify-between pt-2">
					<Button variant="ghost" onclick={tryAgain}>Try Again</Button>
					<Button variant="primary" onclick={acceptVoiceOver}>Accept</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
