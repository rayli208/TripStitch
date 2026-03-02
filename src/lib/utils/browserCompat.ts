export interface BrowserSupport {
	canExport: boolean;
	method: 'mediarecorder' | 'webcodecs';
	warnings: string[];
}

export function checkBrowserSupport(): BrowserSupport {
	const warnings: string[] = [];
	let canExport = false;
	let method: BrowserSupport['method'] = 'mediarecorder';

	if (typeof MediaRecorder === 'undefined') {
		return { canExport: false, method: 'mediarecorder', warnings: ['MediaRecorder API not available'] };
	}

	// Check if WebCodecs is available (Chrome, Edge)
	if (typeof VideoEncoder !== 'undefined') {
		method = 'webcodecs';
	}

	// Check for a supported mime type
	try {
		getSupportedMimeType();
		canExport = true;
	} catch {
		warnings.push('No supported video format found');
	}

	if (!canExport) {
		warnings.push('Your browser doesn\'t support video export. Please use Safari 14.5+, Chrome, or Firefox.');
	}

	return { canExport, method, warnings };
}

export function getSupportedMimeType(): string {
	// Prefer WebM for better compression
	if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
		return 'video/webm;codecs=vp9';
	}
	if (MediaRecorder.isTypeSupported('video/webm')) {
		return 'video/webm';
	}
	// Safari only supports mp4
	if (MediaRecorder.isTypeSupported('video/mp4')) {
		return 'video/mp4';
	}
	throw new Error('No supported video format');
}

export function getFileExtension(mimeType: string): string {
	return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

/** Async check: can this browser use WebCodecs (VideoEncoder + H.264) at the given resolution? */
export async function canUseWebCodecs(w: number, h: number): Promise<boolean> {
	if (typeof VideoEncoder === 'undefined') return false;
	if (typeof isSecureContext !== 'undefined' && !isSecureContext) return false;
	// Safari's WebCodecs H.264 encoder ignores bitrate settings, producing
	// 20x oversized files (~500MB instead of ~25MB). Fall back to MediaRecorder.
	if (/^Apple/.test(navigator.vendor)) return false;
	try {
		const { supported } = await VideoEncoder.isConfigSupported({
			codec: 'avc1.4d0028',
			width: w,
			height: h,
			bitrate: 5_000_000,
			framerate: 30,
			avc: { format: 'avc' }
		});
		return supported === true;
	} catch {
		return false;
	}
}
