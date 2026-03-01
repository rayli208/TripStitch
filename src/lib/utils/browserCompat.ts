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
