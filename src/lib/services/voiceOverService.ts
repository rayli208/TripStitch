import { getSupportedMimeType } from '$lib/utils/browserCompat';
import { bitrateForResolution } from '$lib/constants/limits';
import { canRemuxAudio, getVideoTrack, remuxVideoWithAudio } from './audioRemux';

interface OfflineMixOpts {
	voiceOverBuffer: AudioBuffer | null;
	originalBuffer: AudioBuffer | null;
	musicBuffer: AudioBuffer | null;
	voiceOverGain: number;
	originalGain: number;
	musicGain: number;
	musicStartOffset: number;
	videoDuration: number;
}

/** Render the mixed audio (voice-over + original + music, with gains/offset/fade) to a
 *  single AudioBuffer offline — faster than real time and deterministic. Mirrors the
 *  live mixing graph used by the MediaRecorder path exactly. */
async function renderMixedAudioOffline(opts: OfflineMixOpts): Promise<AudioBuffer> {
	const { voiceOverBuffer, originalBuffer, musicBuffer, videoDuration } = opts;
	const sampleRate = 48000;
	const length = Math.max(1, Math.ceil(videoDuration * sampleRate));
	const ctx = new OfflineAudioContext(2, length, sampleRate);

	if (voiceOverBuffer) {
		const s = ctx.createBufferSource();
		s.buffer = voiceOverBuffer;
		const g = ctx.createGain();
		g.gain.value = opts.voiceOverGain;
		s.connect(g).connect(ctx.destination);
		s.start();
	}
	if (originalBuffer) {
		const s = ctx.createBufferSource();
		s.buffer = originalBuffer;
		const g = ctx.createGain();
		g.gain.value = opts.originalGain;
		s.connect(g).connect(ctx.destination);
		s.start();
	}
	if (musicBuffer) {
		const s = ctx.createBufferSource();
		s.buffer = musicBuffer;
		const remaining = musicBuffer.duration - opts.musicStartOffset;
		if (remaining < videoDuration) {
			s.loop = true;
			s.loopStart = 0;
			s.loopEnd = musicBuffer.duration;
		}
		const g = ctx.createGain();
		// Hold the chosen music gain from the start — without this initial value the
		// GainNode defaults to 1.0 (full volume) until the fade-out, making music far
		// louder than the preview. Then schedule the 3s fade-out before the end.
		g.gain.value = opts.musicGain;
		const fadeStart = Math.max(0, videoDuration - 3);
		g.gain.setValueAtTime(opts.musicGain, fadeStart);
		g.gain.linearRampToValueAtTime(0, videoDuration);
		s.connect(g).connect(ctx.destination);
		s.start(0, opts.musicStartOffset);
	}

	return await ctx.startRendering();
}

// ─── Original (source-clip) audio ───────────────────────────────────

/** One source video clip whose original audio should appear in the final mix. */
export interface OriginalClipAudio {
	file: Blob;
	/** Seconds into the source file to start (trim-in). */
	trimStartSec: number;
	/** Seconds into the source file to stop, or null for the source's end. */
	trimEndSec: number | null;
}

/** A run of clips at one location, beginning at `startSec` in the final video. Items play
 *  back-to-back; a photo contributes a silent gap of `photoSec` (no audio). */
export interface OriginalAudioGroup {
	startSec: number;
	items: Array<{ clip?: OriginalClipAudio; photoSec?: number }>;
}

/** Realtime fallback: some containers/codecs (notably LPCM-in-.mov, which Chrome plays but
 *  `decodeAudioData` rejects) can't be decoded directly. Play the file through a media element,
 *  capture its audio to a compressed blob via MediaRecorder, then decode that — works for
 *  anything the browser can play. Costs ~clip-duration of wall time, so it's a fallback only. */
async function captureElementAudio(file: Blob, decodeCtx: BaseAudioContext): Promise<AudioBuffer | null> {
	if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return null;
	const url = URL.createObjectURL(file);
	let capCtx: AudioContext | null = null;
	const el = document.createElement('video');
	try {
		el.src = url;
		el.muted = false; // routed through the graph, not the speakers
		el.preload = 'auto';
		(el as HTMLVideoElement).playsInline = true;
		await new Promise<void>((resolve, reject) => {
			el.onloadedmetadata = () => resolve();
			el.onerror = () => reject(new Error('media element load failed'));
			setTimeout(() => reject(new Error('media element load timeout')), 15000);
		});

		capCtx = new AudioContext();
		if (capCtx.state === 'suspended') await capCtx.resume().catch(() => {});
		const srcNode = capCtx.createMediaElementSource(el);
		const dest = capCtx.createMediaStreamDestination();
		srcNode.connect(dest); // NOT connected to capCtx.destination → no speaker output
		if (dest.stream.getAudioTracks().length === 0) { return null; }

		const mimeType = getAudioMimeType();
		const rec = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
		const chunks: Blob[] = [];
		rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
		const recorded = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks)); });

		rec.start();
		await el.play();
		await new Promise<void>((resolve) => {
			el.onended = () => resolve();
			// Safety net in case 'ended' never fires.
			setTimeout(() => resolve(), ((el.duration || 60) + 2) * 1000);
		});
		rec.stop();
		const blob = await recorded;
		if (blob.size === 0) return null;
		return await decodeCtx.decodeAudioData(await blob.arrayBuffer());
	} catch (err) {
		console.warn('[OrigAudio] realtime capture fallback failed:', err);
		return null;
	} finally {
		try { el.pause(); } catch { /* ok */ }
		el.src = '';
		if (capCtx) capCtx.close().catch(() => {});
		URL.revokeObjectURL(url);
	}
}

/** Decode a clip's audio to an AudioBuffer. Fast path is `decodeAudioData`; if that throws
 *  (e.g. PCM-in-.mov), fall back to realtime media-element capture. Returns null if the clip
 *  genuinely has no usable audio. */
async function decodeClipAudioBuffer(file: Blob, decodeCtx: BaseAudioContext): Promise<AudioBuffer | null> {
	try {
		return await decodeCtx.decodeAudioData(await file.arrayBuffer());
	} catch (err) {
		console.warn('[OrigAudio] decodeAudioData rejected — trying realtime capture fallback:', err);
		return await captureElementAudio(file, decodeCtx);
	}
}

/** Decode the original audio from each source video clip and lay each one down at its exact
 *  position in the final-video timeline, returning a single full-length AudioBuffer (or null
 *  if none of the clips had a decodable audio track). The assembled video itself carries no
 *  audio — it is canvas-encoded — so the only place the real sound exists is the source files. */
async function renderOriginalAudioOffline(
	groups: OriginalAudioGroup[],
	videoDuration: number
): Promise<AudioBuffer | null> {
	const sampleRate = 48000;
	const length = Math.max(1, Math.ceil(videoDuration * sampleRate));
	const offline = new OfflineAudioContext(2, length, sampleRate);
	let scheduled = 0;
	let videoItemCount = 0;

	console.log(`[OrigAudio] renderOriginalAudioOffline: ${groups.length} group(s), videoDuration=${videoDuration.toFixed(1)}s`);

	for (let gi = 0; gi < groups.length; gi++) {
		const group = groups[gi];
		let cursor = group.startSec;
		console.log(`[OrigAudio] Group ${gi}: startSec=${group.startSec.toFixed(2)}s, ${group.items.length} item(s)`);
		for (let ii = 0; ii < group.items.length; ii++) {
			const item = group.items[ii];
			if (item.photoSec != null) {
				console.log(`[OrigAudio]   item ${ii}: photo gap ${item.photoSec}s → cursor ${cursor.toFixed(2)}→${(cursor + item.photoSec).toFixed(2)}`);
				cursor += item.photoSec;
				continue;
			}
			const clip = item.clip;
			if (!clip) { console.log(`[OrigAudio]   item ${ii}: empty item, skipping`); continue; }
			videoItemCount++;

			const fileInfo = `type=${(clip.file as File).type || 'unknown'}, size=${(clip.file.size / 1024 / 1024).toFixed(2)}MB`;
			const t0 = performance.now();
			const buffer = await decodeClipAudioBuffer(clip.file, offline);
			if (!buffer) {
				// No audio track (silent video) or undecodable even via fallback — still advance
				// the cursor by the clip's played length so later clips in this group stay aligned.
				console.warn(`[OrigAudio]   item ${ii}: NO AUDIO (${fileInfo}) — skipping`);
				if (clip.trimEndSec != null) cursor += Math.max(0, clip.trimEndSec - clip.trimStartSec);
				continue;
			}
			console.log(`[OrigAudio]   item ${ii}: DECODED ${fileInfo} → ${buffer.duration.toFixed(2)}s, ${buffer.numberOfChannels}ch, ${buffer.sampleRate}Hz (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

			const trimStart = Math.max(0, clip.trimStartSec);
			const trimEnd = clip.trimEndSec != null ? Math.min(clip.trimEndSec, buffer.duration) : buffer.duration;
			const playDur = Math.max(0, trimEnd - trimStart);
			if (playDur > 0 && cursor < videoDuration) {
				const src = offline.createBufferSource();
				src.buffer = buffer;
				src.connect(offline.destination);
				// Clamp so a clip near the end can't run past the video.
				const clamped = Math.min(playDur, videoDuration - cursor);
				src.start(cursor, trimStart, clamped);
				console.log(`[OrigAudio]   item ${ii}: SCHEDULED at ${cursor.toFixed(2)}s (sourceOffset=${trimStart.toFixed(2)}s, playDur=${clamped.toFixed(2)}s)`);
				scheduled++;
			} else {
				console.warn(`[OrigAudio]   item ${ii}: NOT scheduled (playDur=${playDur.toFixed(2)}s, cursor=${cursor.toFixed(2)}s ≥ videoDuration=${videoDuration.toFixed(1)}s?)`);
			}
			cursor += playDur;
		}
	}

	if (scheduled === 0) {
		console.warn(`[OrigAudio] Nothing scheduled (${videoItemCount} video item(s) seen) → returning null (no original audio in output)`);
		return null;
	}
	console.log(`[OrigAudio] Laid down ${scheduled}/${videoItemCount} source clip(s) across ${videoDuration.toFixed(1)}s — rendering…`);
	const rendered = await offline.startRendering();
	// Quick non-silence check on the rendered buffer.
	const ch0 = rendered.getChannelData(0);
	let peak = 0;
	for (let i = 0; i < ch0.length; i += Math.max(1, Math.floor(ch0.length / 5000))) {
		const a = Math.abs(ch0[i]);
		if (a > peak) peak = a;
	}
	console.log(`[OrigAudio] Rendered original-audio buffer: ${rendered.duration.toFixed(1)}s, peak≈${peak.toFixed(4)} ${peak < 0.001 ? '(⚠ effectively silent!)' : ''}`);
	return rendered;
}

/** A live, video-synced preview of the clips' original audio. The assembled preview video is
 *  silent (canvas-encoded), so the only way to *hear* the original sound in the editor is to
 *  play the decoded source clips through Web Audio, timed to the video's playhead. */
export interface OriginalAudioPreview {
	/** Start playback as if the video is at `fromSec`. */
	play(fromSec: number): void;
	/** Stop all sound (e.g. on video pause). */
	pause(): void;
	/** Re-align to a new video time; pass whether the video is currently playing. */
	seek(toSec: number, playing: boolean): void;
	/** Set master volume (0–1). */
	setVolume(v01: number): void;
	/** Tear down the audio graph and context. */
	dispose(): void;
}

interface PreviewEntry { startSec: number; offset: number; duration: number; buffer: AudioBuffer; }

/** Decode every source clip up front and return a player that schedules them at their timeline
 *  positions, synced to the video. Returns null if no clip had decodable audio. */
export async function createOriginalAudioPreview(
	groups: OriginalAudioGroup[],
	volume01: number
): Promise<OriginalAudioPreview | null> {
	const ctx = new AudioContext();
	const master = ctx.createGain();
	master.gain.value = volume01;
	master.connect(ctx.destination);

	const entries: PreviewEntry[] = [];
	for (const group of groups) {
		let cursor = group.startSec;
		for (const item of group.items) {
			if (item.photoSec != null) { cursor += item.photoSec; continue; }
			const clip = item.clip;
			if (!clip) continue;
			const buffer = await decodeClipAudioBuffer(clip.file, ctx);
			if (!buffer) {
				console.warn('[OrigAudio/preview] no audio for clip — skipping');
				if (clip.trimEndSec != null) cursor += Math.max(0, clip.trimEndSec - clip.trimStartSec);
				continue;
			}
			const trimStart = Math.max(0, clip.trimStartSec);
			const trimEnd = clip.trimEndSec != null ? Math.min(clip.trimEndSec, buffer.duration) : buffer.duration;
			const duration = Math.max(0, trimEnd - trimStart);
			if (duration > 0) {
				entries.push({ startSec: cursor, offset: trimStart, duration, buffer });
				console.log(`[OrigAudio/preview] entry @ ${cursor.toFixed(2)}s, dur ${duration.toFixed(2)}s`);
			}
			cursor += duration;
		}
	}

	if (entries.length === 0) {
		console.warn('[OrigAudio/preview] no decodable clip audio — preview unavailable');
		await ctx.close();
		return null;
	}
	console.log(`[OrigAudio/preview] ready: ${entries.length} clip(s)`);

	let active: AudioBufferSourceNode[] = [];
	function stopActive() {
		for (const s of active) {
			try { s.stop(); } catch { /* already stopped */ }
			try { s.disconnect(); } catch { /* ok */ }
		}
		active = [];
	}
	function schedule(fromSec: number) {
		stopActive();
		const base = ctx.currentTime + 0.02; // tiny lead so starts aren't in the past
		for (const e of entries) {
			const clipEnd = e.startSec + e.duration;
			if (clipEnd <= fromSec) continue; // already elapsed
			const src = ctx.createBufferSource();
			src.buffer = e.buffer;
			src.connect(master);
			if (e.startSec >= fromSec) {
				src.start(base + (e.startSec - fromSec), e.offset, e.duration);
			} else {
				const into = fromSec - e.startSec; // we're partway through this clip
				src.start(base, e.offset + into, e.duration - into);
			}
			active.push(src);
		}
	}

	return {
		play(fromSec: number) {
			if (ctx.state === 'suspended') ctx.resume().catch(() => {});
			schedule(fromSec);
		},
		pause() { stopActive(); },
		seek(toSec: number, playing: boolean) { if (playing) schedule(toSec); else stopActive(); },
		setVolume(v01: number) { master.gain.value = Math.max(0, Math.min(1, v01)); },
		dispose() { stopActive(); ctx.close().catch(() => {}); }
	};
}

/** A live, video-synced music preview that mirrors the export mixer: a real gain node (so
 *  volume changes apply instantly, even mid-playback) and a natively-looping buffer source (so
 *  a song shorter than the video seamlessly fills the whole thing — no `<audio>`-element loop
 *  hack). `startOffsetSec` is where in the song playback begins at video time 0. */
export interface MusicPreview {
	play(fromSec: number): void;
	pause(): void;
	seek(toSec: number, playing: boolean): void;
	setVolume(v01: number): void;
	/** Change where in the song playback begins (cheap — reschedules, no re-decode). */
	setOffset(startOffsetSec: number, currentVideoSec: number, playing: boolean): void;
	dispose(): void;
}

export async function createMusicPreview(
	blob: Blob,
	startOffsetSec: number,
	volume01: number
): Promise<MusicPreview | null> {
	const ctx = new AudioContext();
	const gain = ctx.createGain();
	gain.gain.value = Math.max(0, Math.min(1, volume01));
	gain.connect(ctx.destination);

	let buffer: AudioBuffer;
	try {
		buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
	} catch (err) {
		console.warn('[MusicPreview] decode failed:', err);
		await ctx.close();
		return null;
	}
	const dur = buffer.duration;
	const clampOffset = (o: number) => Math.max(0, Math.min(o, Math.max(0, dur - 0.1)));
	let offset = clampOffset(startOffsetSec);
	console.log(`[MusicPreview] ready: ${dur.toFixed(1)}s song, offset ${offset.toFixed(1)}s (loops to fill)`);

	let src: AudioBufferSourceNode | null = null;
	function stop() {
		if (src) {
			try { src.stop(); } catch { /* already stopped */ }
			try { src.disconnect(); } catch { /* ok */ }
			src = null;
		}
	}
	function schedule(fromSec: number) {
		stop();
		src = ctx.createBufferSource();
		src.buffer = buffer;
		// Loop the whole song so any video length is covered (export does the same).
		src.loop = true;
		src.loopStart = 0;
		src.loopEnd = dur;
		src.connect(gain);
		// Where the song sits at video time `fromSec`: it begins at `offset` at t=0 and runs on.
		const firstPass = Math.max(0.0001, dur - offset);
		const pos = fromSec < firstPass ? offset + fromSec : (fromSec - firstPass) % dur;
		src.start(ctx.currentTime + 0.02, pos);
	}

	return {
		play(fromSec: number) {
			if (ctx.state === 'suspended') ctx.resume().catch(() => {});
			schedule(fromSec);
		},
		pause() { stop(); },
		seek(toSec: number, playing: boolean) { if (playing) schedule(toSec); else stop(); },
		setVolume(v01: number) { gain.gain.value = Math.max(0, Math.min(1, v01)); },
		setOffset(startOffsetSec: number, currentVideoSec: number, playing: boolean) {
			offset = clampOffset(startOffsetSec);
			if (playing) schedule(currentVideoSec);
		},
		dispose() { stop(); ctx.close().catch(() => {}); }
	};
}

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
			// Don't use timeslice — Safari's MP4 MediaRecorder produces
			// fragmented chunks that create an invalid file when concatenated.
			recorder.start();
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
 *  If keepOriginalAudio is true and originalGroups is provided, the original audio of each
 *  source video clip is decoded and mixed in at its position in the final-video timeline.
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
	musicStartOffset?: number,
	originalGroups?: OriginalAudioGroup[]
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

	// Build the original audio from the source video clips. The assembled `videoBlob` is
	// canvas-encoded and has no audio track, so the real sound only exists in the source
	// files — we decode each and lay it down at its timeline position. Built lazily per
	// path below, once the final video duration is known.
	let originalBuffer: AudioBuffer | null = null;
	const buildOriginal = async (videoDuration: number): Promise<AudioBuffer | null> => {
		if (!keepOriginalAudio || !originalGroups?.length) return null;
		try {
			onProgress?.(10, 'Decoding original audio...');
			const decStart = performance.now();
			const buf = await renderOriginalAudioOffline(originalGroups, videoDuration);
			if (buf) {
				console.log(`[AudioMerge] Original audio built from source clips: ${buf.duration.toFixed(1)}s (took ${((performance.now() - decStart) / 1000).toFixed(1)}s)`);
			} else {
				console.log('[AudioMerge] No decodable audio in any source clip');
			}
			return buf;
		} catch (err) {
			console.warn('[AudioMerge] Failed to build original audio from source clips:', err);
			return null;
		}
	};

	// ── Fast path: lossless remux (no video re-encode) ──
	// If the WebCodecs pipeline retained this video's raw track and the browser can
	// AAC-encode, mux the mixed audio in without re-encoding the video — preserves full
	// quality (critical for 4K). Any failure falls through to the MediaRecorder path.
	if (canRemuxAudio(videoBlob)) {
		try {
			const track = getVideoTrack(videoBlob)!;
			const remuxDuration = track.chunks.length / track.fps;
			console.log(`[AudioMerge] ▶ Lossless remux path (video ${track.width}x${track.height}, ${remuxDuration.toFixed(1)}s)`);
			originalBuffer = await buildOriginal(remuxDuration);
			onProgress?.(25, 'Mixing audio (lossless)...');
			const mixed = await renderMixedAudioOffline({
				voiceOverBuffer,
				originalBuffer,
				musicBuffer,
				voiceOverGain: voiceOverGain ?? 1.0,
				originalGain: originalGain ?? 0.2,
				musicGain: musicGain ?? 0.7,
				musicStartOffset: musicStartOffset ?? 0,
				videoDuration: remuxDuration
			});
			onProgress?.(70, 'Writing MP4...');
			const blob = await remuxVideoWithAudio(videoBlob, mixed);
			await audioCtx.close();
			const url = URL.createObjectURL(blob);
			const totalTime = ((performance.now() - mergeStart) / 1000).toFixed(1);
			onProgress?.(100, 'Done!');
			console.log('[AudioMerge] ═══════════════════════════════════════════════════════');
			console.log('[AudioMerge] MERGE COMPLETE (lossless remux — video NOT re-encoded)');
			console.log(`[AudioMerge]   Total wall time: ${totalTime}s`);
			console.log(`[AudioMerge]   Input video: ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB`);
			console.log(`[AudioMerge]   Output: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
			console.log(`[AudioMerge]   Tracks mixed: ${[voiceOverBuffer && 'voiceover', originalBuffer && 'original', musicBuffer && 'music'].filter(Boolean).join(', ') || 'none'}`);
			console.log('[AudioMerge] ═══════════════════════════════════════════════════════');
			return { blob, url };
		} catch (err) {
			console.warn('[AudioMerge] Lossless remux failed — falling back to re-encode merge:', err);
			// fall through to the MediaRecorder path below
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

	// Build the timeline-aligned original audio now that we know the final duration.
	originalBuffer = await buildOriginal(videoDuration);

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

	// Get video stream — Safari doesn't support video.captureStream(),
	// so fall back to drawing frames to a canvas and capturing that.
	let videoStream: MediaStream;
	let canvas: HTMLCanvasElement | null = null;
	let drawRaf: number | null = null;

	const hasVideoCaptureStream = typeof (video as any).captureStream === 'function';
	if (hasVideoCaptureStream) {
		videoStream = (video as any).captureStream();
		console.log('[AudioMerge] Using video.captureStream()');
	} else {
		// Safari fallback: draw video to canvas, capture canvas stream
		canvas = document.createElement('canvas');
		canvas.width = video.videoWidth || 1920;
		canvas.height = video.videoHeight || 1080;
		const canvasCtx = canvas.getContext('2d')!;
		videoStream = canvas.captureStream(30);
		console.log(`[AudioMerge] Using canvas fallback (${canvas.width}x${canvas.height})`);

		// Continuously draw video frames to canvas
		function drawFrame() {
			if (video.paused || video.ended) return;
			canvasCtx.drawImage(video, 0, 0, canvas!.width, canvas!.height);
			drawRaf = requestAnimationFrame(drawFrame);
		}
		// Start drawing once video plays (set up below)
		video.addEventListener('play', () => { drawFrame(); }, { once: false });
	}

	const videoTrack = videoStream.getVideoTracks()[0];
	const audioTrack = dest.stream.getAudioTracks()[0];

	// Combine video + mixed audio into one stream
	const combinedStream = new MediaStream([videoTrack, audioTrack]);

	const mimeType = getSupportedMimeType();
	console.log(`[AudioMerge] Combined stream: ${combinedStream.getTracks().length} tracks (video: ${videoTrack?.readyState ?? 'none'}, audio: ${audioTrack?.readyState ?? 'none'})`);
	// This step re-encodes the video to mux in audio. Scale the bitrate to the actual
	// resolution — otherwise a 4K export would be re-compressed down to 5 Mbps here,
	// throwing away all the quality the high-res encode produced.
	const mergeBitrate = bitrateForResolution(video.videoWidth || 1920, video.videoHeight || 1080);
	const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: mergeBitrate });
	console.log(`[AudioMerge] Merge recorder created: mimeType=${recorder.mimeType}, videoBitrate=${(mergeBitrate / 1_000_000).toFixed(1)}Mbps (for ${video.videoWidth}x${video.videoHeight})`);
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
	if (drawRaf !== null) cancelAnimationFrame(drawRaf);
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
