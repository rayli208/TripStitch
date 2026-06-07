/**
 * Lossless audio mux: combine the ALREADY-ENCODED H.264 video track (produced by
 * the WebCodecs pipeline) with a freshly AAC-encoded audio track, without ever
 * re-encoding the video. This replaces the old MediaRecorder merge that re-encoded
 * the whole video (generation loss + a hard 5 Mbps cap that destroyed 4K quality).
 *
 * The WebCodecs encoder retains its raw encoded chunks; we re-add them verbatim to a
 * new mp4-muxer alongside the AAC audio. Falls back gracefully (caller catches) on
 * any browser that lacks AudioEncoder/AudioData (e.g. Safari).
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface RetainedChunk {
	data: Uint8Array;
	type: 'key' | 'delta';
	timestamp: number;
	duration: number;
	meta?: EncodedVideoChunkMetadata;
}

export interface RetainedTrack {
	chunks: RetainedChunk[];
	width: number;
	height: number;
	fps: number;
}

// Keyed by the exact video Blob the assembler returned. WeakMap so it's GC'd with the
// blob — no manual cleanup, no leak. Exports are sequential so one entry is the norm.
const trackStore = new WeakMap<Blob, RetainedTrack>();

export function storeVideoTrack(blob: Blob, track: RetainedTrack | null): void {
	if (track && track.chunks.length > 0) trackStore.set(blob, track);
}

export function getVideoTrack(blob: Blob): RetainedTrack | undefined {
	return trackStore.get(blob);
}

/** True if we can losslessly remux this video with audio on this browser. */
export function canRemuxAudio(blob: Blob): boolean {
	return (
		typeof AudioEncoder !== 'undefined' &&
		typeof AudioData !== 'undefined' &&
		trackStore.has(blob)
	);
}

/** Remux the retained video track + a mixed audio buffer into a new MP4 (no video re-encode). */
export async function remuxVideoWithAudio(videoBlob: Blob, mixed: AudioBuffer): Promise<Blob> {
	const track = trackStore.get(videoBlob);
	if (!track) throw new Error('[AudioRemux] No retained video track for this blob');

	const { chunks, width, height } = track;
	const sampleRate = mixed.sampleRate;
	const numberOfChannels = Math.min(2, mixed.numberOfChannels);
	console.log(`[AudioRemux] Remuxing ${chunks.length} video chunks (${width}x${height}) + AAC audio (${sampleRate}Hz, ${numberOfChannels}ch) — no video re-encode`);

	const target = new ArrayBufferTarget();
	const muxer = new Muxer({
		target,
		video: { codec: 'avc', width, height },
		audio: { codec: 'aac', sampleRate, numberOfChannels },
		fastStart: 'in-memory'
	});

	// Re-add the original encoded video verbatim — this is the lossless part.
	for (const c of chunks) {
		muxer.addVideoChunkRaw(c.data, c.type, c.timestamp, c.duration, c.meta ?? undefined);
	}

	await encodeAudioIntoMuxer(muxer, mixed, sampleRate, numberOfChannels);

	muxer.finalize();
	const blob = new Blob([target.buffer], { type: 'video/mp4' });
	console.log(`[AudioRemux] Remux complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB MP4`);
	return blob;
}

async function encodeAudioIntoMuxer(
	muxer: Muxer<ArrayBufferTarget>,
	buffer: AudioBuffer,
	sampleRate: number,
	channels: number
): Promise<void> {
	let encodeError: Error | null = null;

	const encoder = new AudioEncoder({
		output: (chunk, meta) => {
			const data = new Uint8Array(chunk.byteLength);
			chunk.copyTo(data);
			muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp, chunk.duration ?? 0, meta ?? undefined);
		},
		error: (err) => {
			console.error('[AudioRemux] AudioEncoder error:', err);
			encodeError = err;
		}
	});

	encoder.configure({
		codec: 'mp4a.40.2', // AAC-LC
		sampleRate,
		numberOfChannels: channels,
		bitrate: 192_000
	});

	// Pre-extract channel data, then feed planar float32 AudioData in slices.
	const channelData: Float32Array[] = [];
	for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));

	const total = buffer.length;
	const sliceFrames = 4096;
	for (let offset = 0; offset < total; offset += sliceFrames) {
		if (encodeError) throw encodeError;
		const frames = Math.min(sliceFrames, total - offset);
		const planar = new Float32Array(frames * channels);
		for (let ch = 0; ch < channels; ch++) {
			planar.set(channelData[ch].subarray(offset, offset + frames), ch * frames);
		}
		const audioData = new AudioData({
			format: 'f32-planar',
			sampleRate,
			numberOfFrames: frames,
			numberOfChannels: channels,
			timestamp: Math.round((offset / sampleRate) * 1_000_000),
			data: planar
		});
		encoder.encode(audioData);
		audioData.close();
	}

	await encoder.flush();
	encoder.close();
	if (encodeError) throw encodeError;
}
