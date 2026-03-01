import { getSupportedMimeType } from '$lib/utils/browserCompat';

/** Check if the browser supports voice-over recording and merging */
export function canRecordVoiceOver(): boolean {
	if (typeof navigator === 'undefined') return false;
	if (!navigator.mediaDevices) return false;
	if (typeof navigator.mediaDevices.getUserMedia !== 'function') return false;
	if (typeof MediaRecorder === 'undefined') return false;
	if (typeof AudioContext === 'undefined') return false;
	return true;
}

/** Request microphone access */
export async function requestMicAccess(): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({ audio: true });
}

/** Get a supported audio MIME type for MediaRecorder */
function getAudioMimeType(): string {
	if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
	if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
	if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
	return ''; // let browser choose default
}

// ─── Audio Recorder ─────────────────────────────────────────────────

export interface AudioRecorderHandle {
	start: () => void;
	stop: () => Promise<Blob>;
	pause: () => void;
	resume: () => void;
	readonly isPaused: boolean;
	readonly analyserNode: AnalyserNode;
}

/** Create an audio recorder from a mic stream with pause/resume and an analyser tap.
 *  Optionally accepts a shared AudioContext. */
export function createAudioRecorder(
	micStream: MediaStream,
	audioCtx?: AudioContext
): AudioRecorderHandle {
	const mimeType = getAudioMimeType();
	const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
	const recorder = new MediaRecorder(micStream, options);
	const chunks: Blob[] = [];

	// Set up analyser tap (visualization only — MediaRecorder records raw micStream)
	const ctx = audioCtx ?? new AudioContext();
	const source = ctx.createMediaStreamSource(micStream);
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = 0.7;
	source.connect(analyser);
	// Don't connect analyser to destination — tap only

	let paused = false;

	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	return {
		start() {
			chunks.length = 0;
			paused = false;
			recorder.start(100);
		},
		stop() {
			return new Promise<Blob>((resolve) => {
				recorder.onstop = () => {
					resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
				};
				if (recorder.state === 'paused') {
					recorder.resume(); // must resume before stopping
				}
				if (recorder.state !== 'inactive') {
					recorder.stop();
				} else {
					resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
				}
			});
		},
		pause() {
			if (recorder.state === 'recording') {
				recorder.pause();
				paused = true;
			}
		},
		resume() {
			if (recorder.state === 'paused') {
				recorder.resume();
				paused = false;
			}
		},
		get isPaused() {
			return paused;
		},
		get analyserNode() {
			return analyser;
		}
	};
}

// ─── Waveform Renderer ──────────────────────────────────────────────

export interface WaveformRenderer {
	start: () => void;
	stop: () => void;
	setPaused: (paused: boolean) => void;
}

/** Canvas-based frequency bar visualizer driven by an AnalyserNode. */
export function createWaveformRenderer(
	canvas: HTMLCanvasElement,
	analyser: AnalyserNode,
	options?: { barColor?: string; barCount?: number }
): WaveformRenderer {
	const ctx = canvas.getContext('2d')!;
	const barColor = options?.barColor ?? '#F4845F';
	const barCount = options?.barCount ?? 48;
	let animId: number | null = null;
	let paused = false;

	const dataArray = new Uint8Array(analyser.frequencyBinCount);

	function draw() {
		if (paused) {
			animId = requestAnimationFrame(draw);
			return; // freeze last frame
		}

		analyser.getByteFrequencyData(dataArray);

		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);

		const gap = 2;
		const barW = Math.max(1, (w - gap * (barCount - 1)) / barCount);
		const step = Math.max(1, Math.floor(dataArray.length / barCount));

		for (let i = 0; i < barCount; i++) {
			const val = dataArray[i * step] / 255;
			const barH = Math.max(2, val * h);
			const x = i * (barW + gap);
			const y = (h - barH) / 2;
			const radius = Math.min(barW / 2, barH / 2, 3);

			ctx.beginPath();
			ctx.roundRect(x, y, barW, barH, radius);
			ctx.fillStyle = barColor;
			ctx.globalAlpha = 0.5 + val * 0.5;
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		animId = requestAnimationFrame(draw);
	}

	return {
		start() {
			paused = false;
			if (!animId) animId = requestAnimationFrame(draw);
		},
		stop() {
			if (animId) {
				cancelAnimationFrame(animId);
				animId = null;
			}
		},
		setPaused(p: boolean) {
			paused = p;
		}
	};
}

// ─── Preview Mixer ──────────────────────────────────────────────────

export interface PreviewMixer {
	connectVoiceOver: (audioElement: HTMLAudioElement) => void;
	connectOriginalVideo: (videoElement: HTMLVideoElement) => void;
	connectMusic: (audioElement: HTMLAudioElement) => void;
	setVoiceOverGain: (value: number) => void;
	setOriginalGain: (value: number) => void;
	setMusicGain: (value: number) => void;
	readonly analyserNode: AnalyserNode;
	dispose: () => void;
}

/** Web Audio mixer for preview: taps <audio> (VO), <video> (original),
 *  and <audio> (music) into gain nodes feeding a shared analyser + destination. */
export function createPreviewMixer(audioCtx: AudioContext): PreviewMixer {
	const voGain = audioCtx.createGain();
	const origGain = audioCtx.createGain();
	const mGain = audioCtx.createGain();
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = 0.7;

	voGain.gain.value = 1.0;
	origGain.gain.value = 0.2;
	mGain.gain.value = 0.7;

	voGain.connect(analyser);
	origGain.connect(analyser);
	mGain.connect(analyser);
	analyser.connect(audioCtx.destination);

	let voSource: MediaElementAudioSourceNode | null = null;
	let origSource: MediaElementAudioSourceNode | null = null;
	let musicSource: MediaElementAudioSourceNode | null = null;

	return {
		connectVoiceOver(audioElement: HTMLAudioElement) {
			voSource = audioCtx.createMediaElementSource(audioElement);
			voSource.connect(voGain);
		},
		connectOriginalVideo(videoElement: HTMLVideoElement) {
			origSource = audioCtx.createMediaElementSource(videoElement);
			origSource.connect(origGain);
		},
		connectMusic(audioElement: HTMLAudioElement) {
			musicSource = audioCtx.createMediaElementSource(audioElement);
			musicSource.connect(mGain);
		},
		setVoiceOverGain(value: number) {
			voGain.gain.value = value;
		},
		setOriginalGain(value: number) {
			origGain.gain.value = value;
		},
		setMusicGain(value: number) {
			mGain.gain.value = value;
		},
		get analyserNode() {
			return analyser;
		},
		dispose() {
			try { voSource?.disconnect(); } catch { /* ok */ }
			try { origSource?.disconnect(); } catch { /* ok */ }
			try { musicSource?.disconnect(); } catch { /* ok */ }
			try { voGain.disconnect(); } catch { /* ok */ }
			try { origGain.disconnect(); } catch { /* ok */ }
			try { mGain.disconnect(); } catch { /* ok */ }
			try { analyser.disconnect(); } catch { /* ok */ }
		}
	};
}

// ─── Merge ──────────────────────────────────────────────────────────

/** Merge a voice-over audio blob and/or background music into a video blob.
 *  voiceOverBlob can be null (music-only merge).
 *  If keepOriginalAudio is true, the video's original audio is mixed in.
 *  voiceOverGain/originalGain control the volume levels (default 1.0 / 0.2).
 *  musicBlob/musicGain add looping background music with a 3-second fade-out.
 *  Returns a new video blob with the audio mixed in. */
export async function mergeVoiceOver(
	videoBlob: Blob,
	voiceOverBlob: Blob | null,
	keepOriginalAudio: boolean,
	onProgress?: (percent: number, msg: string) => void,
	voiceOverGain?: number,
	originalGain?: number,
	musicBlob?: Blob | null,
	musicGain?: number,
	musicStartOffset?: number
): Promise<{ blob: Blob; url: string }> {
	const mergeStart = performance.now();
	console.log('[AudioMerge] ═══════════════════════════════════════════════════════');
	console.log(`[AudioMerge] Starting audio merge:`);
	console.log(`[AudioMerge]   Video: ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB`);
	console.log(`[AudioMerge]   Voice-over: ${voiceOverBlob ? (voiceOverBlob.size / 1024 / 1024).toFixed(1) + 'MB' : 'none'}`);
	console.log(`[AudioMerge]   Music: ${musicBlob ? (musicBlob.size / 1024 / 1024).toFixed(1) + 'MB' : 'none'}`);
	console.log(`[AudioMerge]   Keep original audio: ${keepOriginalAudio}`);
	console.log(`[AudioMerge]   Gains: voiceOver=${voiceOverGain ?? 1.0}, original=${originalGain ?? 0.2}, music=${musicGain ?? 0.7}`);
	console.log(`[AudioMerge]   Music start offset: ${musicStartOffset ?? 0}s`);

	const audioCtx = new AudioContext();
	console.log(`[AudioMerge] AudioContext created (sampleRate: ${audioCtx.sampleRate}Hz)`);

	// Decode voice-over if provided
	let voiceOverBuffer: AudioBuffer | null = null;
	if (voiceOverBlob) {
		onProgress?.(5, 'Decoding voice-over audio...');
		const decStart = performance.now();
		voiceOverBuffer = await audioCtx.decodeAudioData(await voiceOverBlob.arrayBuffer());
		console.log(`[AudioMerge] Voice-over decoded: ${voiceOverBuffer.duration.toFixed(1)}s, ${voiceOverBuffer.numberOfChannels}ch, ${voiceOverBuffer.sampleRate}Hz (took ${((performance.now() - decStart) / 1000).toFixed(1)}s)`);
	}

	// Decode music if provided
	let musicBuffer: AudioBuffer | null = null;
	if (musicBlob) {
		onProgress?.(voiceOverBuffer ? 8 : 5, 'Decoding music...');
		const decStart = performance.now();
		musicBuffer = await audioCtx.decodeAudioData(await musicBlob.arrayBuffer());
		console.log(`[AudioMerge] Music decoded: ${musicBuffer.duration.toFixed(1)}s, ${musicBuffer.numberOfChannels}ch, ${musicBuffer.sampleRate}Hz (took ${((performance.now() - decStart) / 1000).toFixed(1)}s)`);
	}

	// Try to decode original audio from the video
	let originalBuffer: AudioBuffer | null = null;
	if (keepOriginalAudio) {
		try {
			onProgress?.(10, 'Decoding original audio...');
			const decStart = performance.now();
			originalBuffer = await audioCtx.decodeAudioData(await videoBlob.arrayBuffer());
			console.log(`[AudioMerge] Original audio decoded: ${originalBuffer.duration.toFixed(1)}s, ${originalBuffer.numberOfChannels}ch, ${originalBuffer.sampleRate}Hz (took ${((performance.now() - decStart) / 1000).toFixed(1)}s)`);
		} catch {
			// Video has no audio track or can't decode — that's fine
			console.log('[AudioMerge] No decodable audio in original video');
		}
	}

	onProgress?.(15, 'Setting up video playback...');
	const video = document.createElement('video');
	const videoUrl = URL.createObjectURL(videoBlob);
	video.src = videoUrl;
	video.muted = true; // audio handled via AudioContext
	video.playsInline = true;

	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error('Failed to load video for merge'));
		setTimeout(() => reject(new Error('Video load timeout')), 10000);
	});

	onProgress?.(20, 'Mixing audio tracks...');

	const videoDuration = video.duration || 1;
	console.log(`[AudioMerge] Video loaded: ${video.videoWidth}x${video.videoHeight}, duration=${videoDuration.toFixed(1)}s`);

	// Set up audio mixing destination
	const dest = audioCtx.createMediaStreamDestination();

	// Voice-over
	let voSource: AudioBufferSourceNode | null = null;
	if (voiceOverBuffer) {
		voSource = audioCtx.createBufferSource();
		voSource.buffer = voiceOverBuffer;
		const voGain = audioCtx.createGain();
		voGain.gain.value = voiceOverGain ?? 1.0;
		voSource.connect(voGain).connect(dest);
	}

	// Original audio (if available and requested)
	let origSource: AudioBufferSourceNode | null = null;
	if (originalBuffer) {
		origSource = audioCtx.createBufferSource();
		origSource.buffer = originalBuffer;
		const origGainNode = audioCtx.createGain();
		origGainNode.gain.value = originalGain ?? 0.2;
		origSource.connect(origGainNode).connect(dest);
	}

	// Background music (starts at offset, loops full song if needed, with 3s fade-out)
	let musicSource: AudioBufferSourceNode | null = null;
	const offset = musicStartOffset ?? 0;
	if (musicBuffer) {
		musicSource = audioCtx.createBufferSource();
		musicSource.buffer = musicBuffer;
		// If the remaining audio from offset to end isn't enough, loop the full song
		const remaining = musicBuffer.duration - offset;
		const willLoop = remaining < videoDuration;
		if (willLoop) {
			musicSource.loop = true;
			musicSource.loopStart = 0;
			musicSource.loopEnd = musicBuffer.duration;
		}
		const musicGainNode = audioCtx.createGain();
		const gain = musicGain ?? 0.7;
		musicGainNode.gain.value = gain;
		// Schedule 3-second fade-out before video ends
		const fadeStart = Math.max(0, videoDuration - 3);
		musicGainNode.gain.setValueAtTime(gain, fadeStart);
		musicGainNode.gain.linearRampToValueAtTime(0, videoDuration);
		musicSource.connect(musicGainNode).connect(dest);
		console.log(`[AudioMerge] Music source: offset=${offset.toFixed(1)}s, remaining=${remaining.toFixed(1)}s, loop=${willLoop}, fadeStart=${fadeStart.toFixed(1)}s, gain=${gain}`);
	}

	// Get video track from captureStream (no audio since video is muted)
	const videoStream = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
	const videoTrack = videoStream.getVideoTracks()[0];
	const audioTrack = dest.stream.getAudioTracks()[0];

	// Combine video + mixed audio into one stream
	const combinedStream = new MediaStream([videoTrack, audioTrack]);

	const mimeType = getSupportedMimeType();
	console.log(`[AudioMerge] Combined stream: ${combinedStream.getTracks().length} tracks (video: ${videoTrack?.readyState ?? 'none'}, audio: ${audioTrack?.readyState ?? 'none'})`);
	const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5_000_000 });
	console.log(`[AudioMerge] Merge recorder created: mimeType=${recorder.mimeType}`);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const done = new Promise<Blob>((resolve) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
	});

	// Track playback progress during merge
	let progressInterval: ReturnType<typeof setInterval> | null = null;
	progressInterval = setInterval(() => {
		const pct = Math.min(95, 20 + Math.round((video.currentTime / videoDuration) * 75));
		onProgress?.(pct, `Merging... ${Math.round(video.currentTime)}s / ${Math.round(videoDuration)}s`);
	}, 250);

	recorder.start();
	voSource?.start();
	origSource?.start();
	musicSource?.start(0, offset);
	await video.play();
	console.log(`[AudioMerge] Merge playback started (videoDuration: ${videoDuration.toFixed(1)}s)`);

	// Wait for video to finish
	await new Promise<void>((resolve) => {
		video.onended = () => resolve();
	});

	if (progressInterval) clearInterval(progressInterval);
	onProgress?.(97, 'Finalizing...');

	// Small delay for final frames
	await new Promise((r) => setTimeout(r, 200));

	recorder.stop();
	try { voSource?.stop(); } catch { /* already stopped */ }
	try { origSource?.stop(); } catch { /* already stopped */ }
	try { musicSource?.stop(); } catch { /* already stopped */ }
	videoStream.getTracks().forEach((t) => t.stop());
	await audioCtx.close();
	URL.revokeObjectURL(videoUrl);

	const mergedBlob = await done;
	const mergedUrl = URL.createObjectURL(mergedBlob);

	const totalTime = ((performance.now() - mergeStart) / 1000).toFixed(1);
	onProgress?.(100, 'Done!');
	console.log('[AudioMerge] ═══════════════════════════════════════════════════════');
	console.log(`[AudioMerge] MERGE COMPLETE`);
	console.log(`[AudioMerge]   Total wall time: ${totalTime}s`);
	console.log(`[AudioMerge]   Input video: ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB`);
	console.log(`[AudioMerge]   Output: ${(mergedBlob.size / 1024 / 1024).toFixed(1)}MB`);
	console.log(`[AudioMerge]   Tracks mixed: ${[voiceOverBuffer && 'voiceover', originalBuffer && 'original', musicBuffer && 'music'].filter(Boolean).join(', ') || 'none'}`);
	console.log('[AudioMerge] ═══════════════════════════════════════════════════════');
	return { blob: mergedBlob, url: mergedUrl };
}

/** Convenience: merge only background music into a video (no voice-over). */
export async function mergeMusic(
	videoBlob: Blob,
	musicBlob: Blob,
	keepOriginalAudio: boolean,
	onProgress?: (percent: number, msg: string) => void,
	musicGain?: number,
	originalGain?: number,
	musicStartOffset?: number
): Promise<{ blob: Blob; url: string }> {
	console.log(`[AudioMerge] mergeMusic called: video=${(videoBlob.size / 1024 / 1024).toFixed(1)}MB, music=${(musicBlob.size / 1024 / 1024).toFixed(1)}MB, keepOriginal=${keepOriginalAudio}, musicGain=${musicGain ?? 0.7}, offset=${musicStartOffset ?? 0}s`);
	return mergeVoiceOver(
		videoBlob,
		null,
		keepOriginalAudio,
		onProgress,
		undefined,
		originalGain,
		musicBlob,
		musicGain,
		musicStartOffset
	);
}
