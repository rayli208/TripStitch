/**
 * WebCodecs encoder wrapper: VideoEncoder (H.264) + mp4-muxer → MP4 Blob.
 * Only loaded on browsers that support WebCodecs (Chrome 94+, Safari 16.4+).
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { avcCodecForResolution, bitrateForResolution } from '$lib/constants/limits';
import type { RetainedTrack } from './audioRemux';

export interface FrameEncoder {
	/** Encode the current canvas contents as the next video frame */
	encodeFrame(canvas: HTMLCanvasElement): void;
	/** Number of frames encoded so far */
	readonly frameCount: number;
	/** Flush encoder, finalize muxer, return MP4 blob */
	finalize(): Promise<Blob>;
	/** Raw encoded video chunks (only when `retainChunks` was set) — for lossless audio remux. */
	getRetainedTrack(): RetainedTrack | null;
}

export function createFrameEncoder(config: {
	width: number;
	height: number;
	fps: number;
	/** Optional; when omitted, scales with resolution (5/16/40 Mbps for 1080p/1440p/4K). */
	bitrate?: number;
	/** Retain raw encoded chunks so audio can later be muxed in without re-encoding video. */
	retainChunks?: boolean;
}): FrameEncoder {
	const { width, height, fps, retainChunks } = config;
	const bitrate = config.bitrate ?? bitrateForResolution(width, height);
	const codec = avcCodecForResolution(width, height);
	const frameDurationMicros = Math.round(1_000_000 / fps);
	const retained: RetainedTrack['chunks'] = [];

	const target = new ArrayBufferTarget();
	const muxer = new Muxer({
		target,
		video: {
			codec: 'avc',
			width,
			height
		},
		fastStart: 'in-memory'
	});

	let encodedFrames = 0;
	let encoderError: Error | null = null;

	const encoder = new VideoEncoder({
		output: (chunk, meta) => {
			// Use addVideoChunkRaw with explicit duration — Safari's EncodedVideoChunk
			// has null duration which mp4-muxer's addVideoChunk rejects.
			const data = new Uint8Array(chunk.byteLength);
			chunk.copyTo(data);
			const type = chunk.type as 'key' | 'delta';
			const duration = chunk.duration ?? frameDurationMicros;
			muxer.addVideoChunkRaw(data, type, chunk.timestamp, duration, meta ?? undefined);
			if (retainChunks) {
				retained.push({ data, type, timestamp: chunk.timestamp, duration, meta: meta ?? undefined });
			}
		},
		error: (err) => {
			console.error('[WebCodecsEncoder] Encoder error:', err);
			encoderError = err;
		}
	});

	encoder.configure({
		codec, // H.264 Main Profile; level scales with resolution (L4.0 → L5.1)
		width,
		height,
		bitrate,
		bitrateMode: 'constant', // Force CBR — Safari ignores bitrate without this
		framerate: fps,
		hardwareAcceleration: 'prefer-hardware',
		avc: { format: 'avc' } // AVC format (length-prefixed NALUs) required by mp4-muxer
	});

	console.log(`[WebCodecsEncoder] Configured: ${width}x${height} @ ${fps}fps, ${(bitrate / 1_000_000).toFixed(1)}Mbps, codec=${codec}`);

	return {
		get frameCount() {
			return encodedFrames;
		},

		getRetainedTrack(): RetainedTrack | null {
			return retainChunks ? { chunks: retained, width, height, fps } : null;
		},

		encodeFrame(canvas: HTMLCanvasElement) {
			if (encoderError) throw encoderError;
			const timestamp = encodedFrames * frameDurationMicros;
			const keyFrame = encodedFrames % 60 === 0; // keyframe every 2s at 30fps
			const frame = new VideoFrame(canvas, { timestamp });
			encoder.encode(frame, { keyFrame });
			frame.close();
			encodedFrames++;
		},

		async finalize(): Promise<Blob> {
			if (encoderError) throw encoderError;
			await encoder.flush();
			encoder.close();
			muxer.finalize();
			const buf = target.buffer;
			console.log(`[WebCodecsEncoder] Finalized: ${encodedFrames} frames, ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`);
			return new Blob([buf], { type: 'video/mp4' });
		}
	};
}
