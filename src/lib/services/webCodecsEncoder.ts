/**
 * WebCodecs encoder wrapper: VideoEncoder (H.264) + mp4-muxer → MP4 Blob.
 * Only loaded on browsers that support WebCodecs (Chrome 94+, Safari 16.4+).
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface FrameEncoder {
	/** Encode the current canvas contents as the next video frame */
	encodeFrame(canvas: HTMLCanvasElement): void;
	/** Number of frames encoded so far */
	readonly frameCount: number;
	/** Flush encoder, finalize muxer, return MP4 blob */
	finalize(): Promise<Blob>;
}

export function createFrameEncoder(config: {
	width: number;
	height: number;
	fps: number;
	bitrate: number;
}): FrameEncoder {
	const { width, height, fps, bitrate } = config;
	const frameDurationMicros = Math.round(1_000_000 / fps);

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
			muxer.addVideoChunkRaw(
				data,
				chunk.type as 'key' | 'delta',
				chunk.timestamp,
				chunk.duration ?? frameDurationMicros,
				meta ?? undefined
			);
		},
		error: (err) => {
			console.error('[WebCodecsEncoder] Encoder error:', err);
			encoderError = err;
		}
	});

	encoder.configure({
		codec: 'avc1.4d0028', // H.264 Main Profile Level 4.0
		width,
		height,
		bitrate,
		bitrateMode: 'constant', // Force CBR — Safari ignores bitrate without this
		framerate: fps,
		hardwareAcceleration: 'prefer-hardware',
		avc: { format: 'avc' } // AVC format (length-prefixed NALUs) required by mp4-muxer
	});

	console.log(`[WebCodecsEncoder] Configured: ${width}x${height} @ ${fps}fps, ${(bitrate / 1_000_000).toFixed(1)}Mbps`);

	return {
		get frameCount() {
			return encodedFrames;
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
