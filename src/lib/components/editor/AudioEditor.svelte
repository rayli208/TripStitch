<script lang="ts">
	import { tick } from 'svelte';
	import type { MusicSelection, Location } from '$lib/types';
	import type { VideoSegmentInfo } from '$lib/services/videoAssembler';
	import {
		canRecordVoiceOver,
		mergeVoiceOver,
		createAudioRecorder,
		createWaveformRenderer,
		createOriginalAudioPreview,
		createMusicPreview,
		type AudioRecorderHandle,
		type WaveformRenderer,
		type OriginalAudioGroup,
		type OriginalAudioPreview,
		type MusicPreview
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
		originalVolume = $bindable(100),
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
		originalVolume?: number;
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
	// Whether there's anything to bake into the video: music, voice-over, or the clips' own
	// original sound. Without this, an "original audio only" export would have no Apply button.
	const hasApplicableAudio = $derived(hasAnyAudio || (keepOriginalAudio && hasVideoWithAudio));

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
	// Short human labels for the segment "kind" (the segment's own label is the place name).
	const SEGMENT_KIND: Record<string, string> = {
		title: 'Intro',
		map: 'Map transition',
		clip: 'Your clip',
		route: 'Route recap'
	};

	let recCurrentTime = $state(0);
	let recDuration = $state(0);
	let timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

	let segEstimatedDuration = $derived(
		videoSegments.length > 0
			? videoSegments.reduce((sum, s) => Math.max(sum, s.startSec + s.durationSec), 0)
			: 0
	);

	// Map real recording time → assembly-timeline seconds (the two are ~equal but not exact).
	let recScale = $derived(segEstimatedDuration > 0 && recDuration > 0 ? recDuration / segEstimatedDuration : 1);

	let activeIndex = $derived.by(() => {
		if (!videoSegments.length || !recDuration) return -1;
		const scaledTime = (recCurrentTime / recDuration) * segEstimatedDuration;
		return videoSegments.findIndex(s => scaledTime >= s.startSec && scaledTime < s.startSec + s.durationSec);
	});
	let activeSegment = $derived(activeIndex >= 0 ? videoSegments[activeIndex] : null);
	let nextSegment = $derived(activeIndex >= 0 && activeIndex < videoSegments.length - 1 ? videoSegments[activeIndex + 1] : null);

	// Real seconds until the next segment begins (for the countdown / "get ready" cue).
	let secondsUntilNext = $derived.by(() => {
		if (!nextSegment) return null;
		return Math.max(0, nextSegment.startSec * recScale - recCurrentTime);
	});
	// True in the final moments before a transition — drives the urgent countdown UI.
	let transitionImminent = $derived(secondsUntilNext != null && secondsUntilNext <= 3);

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

	// Video + voice-over playback elements (music is handled via Web Audio, below)
	let videoEl: HTMLVideoElement | undefined = $state();
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

	// ─── Music live preview (Web Audio) ─────────────────────────
	// Music plays through a real gain node (instant, reliable volume) and a natively-looping
	// buffer source (a short song seamlessly fills a long video) — mirroring the export mixer.
	// Rebuilt only when the track or its start offset changes; volume is a cheap gain tweak.
	let musicPreview = $state<MusicPreview | null>(null);

	// Rebuild only when the track changes (NOT on offset/volume — those are cheap live tweaks,
	// handled by the effects below, so dragging the scrubber/slider doesn't re-decode the song).
	$effect(() => {
		if (!musicBlob) return;
		let disposed = false;
		let preview: MusicPreview | null = null;
		// Start muted; the volume effect sets the real level.
		createMusicPreview(musicBlob, 0, 0).then((p) => {
			if (disposed || !p) { p?.dispose(); return; }
			preview = p;
			musicPreview = p;
			if (videoEl && !videoEl.paused) p.play(videoEl.currentTime);
		});
		return () => {
			disposed = true;
			preview?.dispose();
			if (musicPreview === preview) musicPreview = null;
		};
	});

	// Apply the song start offset live (cheap reschedule, no re-decode).
	$effect(() => {
		if (!musicPreview) return;
		musicPreview.setOffset(musicStartOffset, videoEl?.currentTime ?? 0, !!videoEl && !videoEl.paused);
	});

	// Sync music to the video's play/pause/seek.
	$effect(() => {
		if (!videoEl || !musicPreview) return;
		const vid = videoEl;
		const p = musicPreview;
		const onPlay = () => p.play(vid.currentTime);
		const onPause = () => p.pause();
		const onSeeked = () => p.seek(vid.currentTime, !vid.paused);
		const onEnded = () => p.pause();
		vid.addEventListener('play', onPlay);
		vid.addEventListener('pause', onPause);
		vid.addEventListener('seeked', onSeeked);
		vid.addEventListener('ended', onEnded);
		return () => {
			vid.removeEventListener('play', onPlay);
			vid.removeEventListener('pause', onPause);
			vid.removeEventListener('seeked', onSeeked);
			vid.removeEventListener('ended', onEnded);
			p.pause();
		};
	});

	// Keep music volume in sync — muted while recording a voice-over.
	$effect(() => {
		if (!musicPreview) return;
		musicPreview.setVolume(recordingPhase !== 'idle' ? 0 : musicVolume / 100);
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

	// ─── Original-audio live preview ─────────────────────────────
	// The assembled preview video has no audio track, so to actually *hear* the clips' original
	// sound (in preview and as a monitor while narrating) we decode the source clips and play
	// them through Web Audio, synced to the video playhead.
	let originalPreview = $state<OriginalAudioPreview | null>(null);

	// Build/decode the preview graph once we have clips with audio. Intentionally does NOT depend
	// on keepOriginalAudio/originalVolume (those are handled by the volume effect) so toggling
	// them doesn't force an expensive re-decode.
	$effect(() => {
		if (!hasVideoWithAudio || videoSegments.length === 0) return;
		const groups = buildOriginalGroups();
		if (groups.length === 0) return;
		let disposed = false;
		let preview: OriginalAudioPreview | null = null;
		// Start muted; the volume effect sets the real level (avoids re-decoding on toggle/slider).
		createOriginalAudioPreview(groups, 0).then((p) => {
			if (disposed || !p) { p?.dispose(); return; }
			preview = p;
			originalPreview = p;
			// If the video is already playing, fall into sync immediately.
			if (videoEl && !videoEl.paused) p.play(videoEl.currentTime);
		});
		return () => {
			disposed = true;
			preview?.dispose();
			if (originalPreview === preview) originalPreview = null;
		};
	});

	// Sync the preview to the video element's play/pause/seek.
	$effect(() => {
		if (!videoEl || !originalPreview) return;
		const vid = videoEl;
		const p = originalPreview;
		const onPlay = () => p.play(vid.currentTime);
		const onPause = () => p.pause();
		const onSeeked = () => p.seek(vid.currentTime, !vid.paused);
		const onEnded = () => p.pause();
		vid.addEventListener('play', onPlay);
		vid.addEventListener('pause', onPause);
		vid.addEventListener('seeked', onSeeked);
		vid.addEventListener('ended', onEnded);
		return () => {
			vid.removeEventListener('play', onPlay);
			vid.removeEventListener('pause', onPause);
			vid.removeEventListener('seeked', onSeeked);
			vid.removeEventListener('ended', onEnded);
			p.pause();
		};
	});

	// Keep the preview volume in sync with the toggle/slider; cap while recording to limit mic bleed.
	$effect(() => {
		if (!originalPreview) return;
		const base = keepOriginalAudio ? originalVolume / 100 : 0;
		originalPreview.setVolume(recordingPhase !== 'idle' ? Math.min(0.4, base) : base);
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
			// Monitor the clips' own sound while narrating, capped low to limit mic bleed.
			videoEl.volume = keepOriginalAudio ? Math.min(0.4, originalVolume / 100) : 0;
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

		// Auto-lower music + original audio so the voice-over stays prominent
		if (musicVolume > 20) musicVolume = 20;
		if (originalVolume > 30) originalVolume = 30;

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

	// Build the original-audio timeline from the source clips. Each location's `clip-*`
	// timeline segment gives the start offset; clips within it play back-to-back (photos are
	// silent gaps). The renderer decodes each source file and lays its audio at the right spot.
	function buildOriginalGroups(): OriginalAudioGroup[] {
		const groups: OriginalAudioGroup[] = [];
		const clipSegs = videoSegments.filter((s) => s.type === 'clip');
		console.log(`[OrigAudio] buildOriginalGroups: ${videoSegments.length} segment(s), ${clipSegs.length} clip-segment(s), ${locations.length} location(s)`);
		console.log('[OrigAudio] segments:', videoSegments.map((s) => `${s.id}[${s.type}]@${s.startSec.toFixed(1)}s`).join(', '));
		for (const seg of videoSegments) {
			if (seg.type !== 'clip') continue;
			const locId = seg.id.startsWith('clip-') ? seg.id.slice(5) : seg.id;
			const loc = locations.find((l) => l.id === locId);
			if (!loc) {
				console.warn(`[OrigAudio] segment ${seg.id}: no matching location for id "${locId}" — skipping`);
				continue;
			}
			const clips = [...loc.clips].filter((c) => c.file).sort((a, b) => a.order - b.order);
			console.log(`[OrigAudio] segment ${seg.id} → location "${loc.name}": ${loc.clips.length} clip(s), ${clips.length} with files [${loc.clips.map((c) => `${c.type ?? '?'}:${c.file ? 'file' : 'NO-FILE'}`).join(', ')}]`);
			const items: OriginalAudioGroup['items'] = [];
			for (const clip of clips) {
				if (clip.type === 'video' && clip.file) {
					items.push({ clip: { file: clip.file, trimStartSec: clip.trimStartSec ?? 0, trimEndSec: clip.trimEndSec ?? null } });
				} else if (clip.type === 'photo') {
					items.push({ photoSec: clip.durationSec ?? 3 });
				}
			}
			if (items.length) groups.push({ startSec: seg.startSec, items });
		}
		const videoItems = groups.reduce((n, g) => n + g.items.filter((i) => i.clip).length, 0);
		console.log(`[OrigAudio] buildOriginalGroups result: ${groups.length} group(s), ${videoItems} video item(s)`);
		return groups;
	}

	async function handleApplyAndSave() {
		const wantsOriginal = keepOriginalAudio && hasVideoWithAudio;
		console.log('[OrigAudio] ═══ handleApplyAndSave ═══');
		console.log(`[OrigAudio] keepOriginalAudio=${keepOriginalAudio}, hasVideoWithAudio=${hasVideoWithAudio}, wantsOriginal=${wantsOriginal}`);
		console.log(`[OrigAudio] musicBlob=${!!musicBlob}, voiceOverBlob=${!!voiceOverBlob}`);

		// Nothing to mix in → keep the assembled video as-is.
		if (!musicBlob && !voiceOverBlob && !wantsOriginal) {
			console.warn('[OrigAudio] Nothing to apply (no music, no VO, no original) → keeping silent assembled video');
			onapply(null, null);
			return;
		}

		const originalGroups = wantsOriginal ? buildOriginalGroups() : [];
		console.log(`[OrigAudio] originalGroups passed to merge: ${originalGroups.length}`);
		const originalGain = originalVolume / 100;

		merging = true;
		mergePercent = 0;
		mergeMsg = 'Preparing...';

		// Pause playback
		videoEl?.pause();
		musicPreview?.pause();
		originalPreview?.pause();
		voPreviewAudioEl?.pause();

		try {
			const result = await mergeVoiceOver(
				videoBlob,
				voiceOverBlob,
				keepOriginalAudio,
				(pct, msg) => { mergePercent = pct; mergeMsg = msg; },
				voiceOverVolume / 100,
				originalGain,
				musicBlob,
				musicVolume / 100,
				musicStartOffset,
				originalGroups
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

		<!-- Segment timeline + pacing HUD (during recording) -->
		{#if recordingPhase === 'recording' && videoSegments.length > 0 && recDuration > 0}
			<div class="w-full space-y-2">
				<!-- Now / Next pacing row -->
				<div class="flex items-stretch gap-2">
					<!-- NOW -->
					<div
						class="flex-1 min-w-0 rounded-lg px-3 py-2 border-2 transition-colors"
						style="border-color: {activeSegment ? SEGMENT_COLORS[activeSegment.type] : 'var(--color-border)'}; background: {activeSegment ? SEGMENT_COLORS[activeSegment.type] + '1a' : 'transparent'}"
					>
						<p class="text-[9px] font-bold uppercase tracking-wider text-text-muted">Now narrating</p>
						{#if activeSegment}
							{#key activeSegment.id}
								<div class="flex items-center gap-1.5 fade-slide-in">
									<span class="w-2 h-2 rounded-full shrink-0" style="background: {SEGMENT_COLORS[activeSegment.type]}"></span>
									<span class="text-sm font-bold text-text-primary truncate">{activeSegment.label}</span>
								</div>
								<p class="text-[10px] text-text-muted truncate">{SEGMENT_KIND[activeSegment.type] ?? ''}</p>
							{/key}
						{:else}
							<p class="text-sm font-bold text-text-primary">—</p>
						{/if}
					</div>
					<!-- NEXT / countdown -->
					<div
						class="flex-1 min-w-0 rounded-lg px-3 py-2 border-2 transition-all duration-200 {transitionImminent ? 'animate-pulse-red' : ''}"
						style="border-color: {nextSegment && transitionImminent ? SEGMENT_COLORS[nextSegment.type] : 'var(--color-border)'}; background: {nextSegment && transitionImminent ? SEGMENT_COLORS[nextSegment.type] + '26' : 'transparent'}"
					>
						<p class="text-[9px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
							<span>Coming up</span>
							{#if nextSegment && secondsUntilNext != null}
								<span class="font-mono {transitionImminent ? 'text-red-400' : 'text-text-muted'}">in {Math.ceil(secondsUntilNext)}s</span>
							{/if}
						</p>
						{#if nextSegment}
							<div class="flex items-center gap-1.5">
								<span class="w-2 h-2 rounded-full shrink-0" style="background: {SEGMENT_COLORS[nextSegment.type]}"></span>
								<span class="text-sm font-bold text-text-primary truncate">{nextSegment.label}</span>
							</div>
							<p class="text-[10px] truncate {nextSegment.type === 'clip' ? 'text-purple-400 font-semibold' : 'text-text-muted'}">{SEGMENT_KIND[nextSegment.type] ?? ''}</p>
						{:else}
							<p class="text-sm font-bold text-text-primary">Finishing up</p>
						{/if}
					</div>
				</div>

				<!-- Timeline bar with clip markers -->
				<div class="flex items-center gap-2 w-full px-0.5">
					<span class="text-[10px] text-text-muted font-mono w-7 shrink-0">{formatTime(recCurrentTime)}</span>
					<div class="relative flex-1 h-3.5 bg-border rounded-full overflow-hidden">
						{#each videoSegments as seg}
							{@const leftPct = (seg.startSec / segEstimatedDuration) * 100}
							{@const widthPct = (seg.durationSec / segEstimatedDuration) * 100}
							<div
								class="absolute top-0 h-full transition-opacity {activeSegment?.id === seg.id ? 'opacity-90' : 'opacity-40'}"
								style="left: {leftPct}%; width: {widthPct}%; background: {SEGMENT_COLORS[seg.type]}"
							></div>
						{/each}
						<!-- played overlay -->
						<div
							class="absolute top-0 left-0 h-full bg-black/25"
							style="width: {recProgressPct}%"
						></div>
						<!-- segment dividers -->
						{#each videoSegments as seg, i}
							{#if i > 0}
								{@const leftPct = (seg.startSec / segEstimatedDuration) * 100}
								<div class="absolute top-0 h-full w-px bg-white/40" style="left: {leftPct}%"></div>
							{/if}
						{/each}
						<!-- playhead -->
						<div
							class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md ring-2 ring-black/20 z-10"
							style="left: calc({recProgressPct}% - 7px)"
						></div>
					</div>
					<span class="text-[10px] text-text-muted font-mono w-7 shrink-0 text-right">{formatTime(recDuration)}</span>
				</div>

				<!-- Clip flags: where your own clips fall, so you can plan your narration -->
				<div class="relative h-4 mx-9">
					{#each videoSegments.filter((s) => s.type === 'clip') as seg}
						{@const centerPct = ((seg.startSec + seg.durationSec / 2) / segEstimatedDuration) * 100}
						<div
							class="absolute -translate-x-1/2 flex items-center gap-0.5"
							style="left: {centerPct}%"
						>
							<span class="w-1.5 h-1.5 rounded-full" style="background: {SEGMENT_COLORS.clip}"></span>
							<span class="text-[8px] font-semibold text-purple-400 whitespace-nowrap max-w-16 truncate">{seg.label}</span>
						</div>
					{/each}
				</div>
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

				<!-- Transition cue: big, hard-to-miss "coming up" countdown before the next segment -->
				{#if nextSegment && transitionImminent && !isPaused}
					<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none">
						<div
							class="rounded-2xl px-5 py-3 backdrop-blur-sm border-2 flex flex-col items-center gap-1 count-pulse"
							style="background: rgba(0,0,0,0.55); border-color: {SEGMENT_COLORS[nextSegment.type]}; box-shadow: 0 0 32px {SEGMENT_COLORS[nextSegment.type]}66"
						>
							<span class="text-[10px] font-bold uppercase tracking-widest text-white/70">
								{nextSegment.type === 'clip' ? '🎬 Your clip next' : 'Coming up'}
							</span>
							<span class="text-4xl font-extrabold text-white leading-none tabular-nums" style="text-shadow: 0 0 24px {SEGMENT_COLORS[nextSegment.type]}">
								{Math.max(1, Math.ceil(secondsUntilNext ?? 0))}
							</span>
							<span class="text-xs font-semibold text-white/90 max-w-[60vw] truncate">{nextSegment.label}</span>
						</div>
					</div>
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

				<!-- Original Audio toggle + volume -->
				{#if hasVideoWithAudio}
					<div class="border-t border-border px-4 py-3 space-y-2">
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
						{#if keepOriginalAudio}
							<div class="flex items-center gap-3 fade-slide-in">
								<SpeakerHigh size={16} weight="bold" class="text-amber-400 shrink-0 opacity-0" />
								<span class="text-xs text-text-primary w-14 shrink-0">Volume</span>
								<input
									type="range"
									min="0"
									max="100"
									bind:value={originalVolume}
									class="flex-1 bg-amber-400/30 text-amber-400"
								/>
								<span class="text-xs text-text-muted font-mono w-9 text-right">{originalVolume}%</span>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Background Music (inline, compact) -->
				<div class="border-t border-border">
					<MusicPicker
						bind:musicSelection
						bind:musicVolume
						{videoDuration}
						compact
						onvolumechange={(vol) => musicPreview?.setVolume(vol / 100)}
					/>
				</div>
			{/if}
		</div>

		<!-- Audio action buttons -->
		{#if recordingPhase === 'idle'}
			<div class="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 w-full">
				<button
					class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors text-center px-4 py-2"
					onclick={onback}
				>
					{skipLabel ?? (hasApplicableAudio ? 'Back without applying' : 'Back to video')}
				</button>
				{#if hasApplicableAudio}
					<Button
						variant="primary"
						onclick={handleApplyAndSave}
						class="w-full sm:w-auto"
					>
						{applyLabel}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
