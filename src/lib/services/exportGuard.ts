/**
 * Export Guard: prevents mobile backgrounding from corrupting exports.
 * - Wake Lock keeps screen on
 * - Silent audio keeps Android tabs alive
 * - Visibility handler pauses/resumes MediaRecorder
 * - PauseClock tracks total paused time for rAF elapsed correction
 */

export interface PauseClock {
	/** Returns total milliseconds spent paused */
	get(): number;
}

export interface ExportGuard {
	pauseClock: PauseClock;
	destroy: () => void;
}

export function createExportGuard(
	recorder: MediaRecorder,
	onPause?: () => void,
	onResume?: () => void
): ExportGuard {
	let totalPausedMs = 0;
	let pauseStartTime = 0;
	let isPaused = false;
	let visibilityEventCount = 0;

	console.log('[ExportGuard] Creating export guard...');

	// --- Wake Lock ---
	let wakeLock: WakeLockSentinel | null = null;
	if ('wakeLock' in navigator) {
		navigator.wakeLock.request('screen').then(
			(lock) => { wakeLock = lock; console.log('[ExportGuard] Wake lock acquired'); },
			(err) => { console.warn('[ExportGuard] Wake lock unavailable:', err); }
		);
	} else {
		console.log('[ExportGuard] Wake Lock API not supported');
	}

	// --- Silent Audio (keeps Android tab alive) ---
	let audioCtx: AudioContext | null = null;
	let oscillator: OscillatorNode | null = null;
	try {
		audioCtx = new AudioContext();
		oscillator = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		gain.gain.value = 0.00001; // inaudible but keeps tab alive
		oscillator.connect(gain);
		gain.connect(audioCtx.destination);
		oscillator.start();
		console.log(`[ExportGuard] Silent audio started (sampleRate: ${audioCtx.sampleRate}Hz, state: ${audioCtx.state})`);
	} catch (err) {
		console.warn('[ExportGuard] Silent audio unavailable:', err);
	}

	// --- Visibility Handler ---
	function handleVisibility() {
		visibilityEventCount++;
		const recState = recorder.state;
		console.log(`[ExportGuard] Visibility change #${visibilityEventCount}: hidden=${document.hidden}, recorder=${recState}, isPaused=${isPaused}`);

		if (document.hidden) {
			if (!isPaused && recState === 'recording') {
				isPaused = true;
				pauseStartTime = performance.now();
				try { recorder.pause(); } catch { /* may already be paused */ }
				console.log('[ExportGuard] Paused recorder (tab hidden)');
				onPause?.();
			} else {
				console.log(`[ExportGuard] Tab hidden but no action needed (isPaused=${isPaused}, recorder=${recState})`);
			}
		} else {
			if (isPaused && recState === 'paused') {
				const pauseDuration = performance.now() - pauseStartTime;
				totalPausedMs += pauseDuration;
				isPaused = false;
				try { recorder.resume(); } catch { /* may already be recording */ }
				console.log(`[ExportGuard] Resumed recorder (paused for ${pauseDuration.toFixed(0)}ms, total paused: ${totalPausedMs.toFixed(0)}ms)`);
				onResume?.();
			} else {
				console.log(`[ExportGuard] Tab visible but no action needed (isPaused=${isPaused}, recorder=${recState})`);
			}
		}
	}

	document.addEventListener('visibilitychange', handleVisibility);

	const pauseClock: PauseClock = {
		get() {
			if (isPaused) {
				return totalPausedMs + (performance.now() - pauseStartTime);
			}
			return totalPausedMs;
		}
	};

	function destroy() {
		console.log(`[ExportGuard] Destroying guard (total visibility events: ${visibilityEventCount}, total paused: ${totalPausedMs.toFixed(0)}ms)`);
		document.removeEventListener('visibilitychange', handleVisibility);
		try { wakeLock?.release(); console.log('[ExportGuard] Wake lock released'); } catch { /* ignore */ }
		try { oscillator?.stop(); } catch { /* ignore */ }
		try { audioCtx?.close(); console.log('[ExportGuard] Audio context closed'); } catch { /* ignore */ }
		wakeLock = null;
		oscillator = null;
		audioCtx = null;
	}

	console.log('[ExportGuard] Export guard created successfully');
	return { pauseClock, destroy };
}

// ─── WebCodecs Export Guard ───
// Simpler guard for WebCodecs path: no MediaRecorder to pause/resume.
// rAF loops naturally pause when the tab is hidden, and frame-index-based
// timestamps mean no gaps appear in the output.

export interface WebCodecsExportGuard {
	readonly isHidden: boolean;
	destroy: () => void;
}

export function createWebCodecsExportGuard(
	onHidden?: () => void,
	onVisible?: () => void
): WebCodecsExportGuard {
	let hidden = false;
	let visibilityEventCount = 0;

	console.log('[WebCodecsExportGuard] Creating guard...');

	// --- Wake Lock ---
	let wakeLock: WakeLockSentinel | null = null;
	if ('wakeLock' in navigator) {
		navigator.wakeLock.request('screen').then(
			(lock) => { wakeLock = lock; console.log('[WebCodecsExportGuard] Wake lock acquired'); },
			(err) => { console.warn('[WebCodecsExportGuard] Wake lock unavailable:', err); }
		);
	}

	// --- Silent Audio (keeps Android tab alive) ---
	let audioCtx: AudioContext | null = null;
	let oscillator: OscillatorNode | null = null;
	try {
		audioCtx = new AudioContext();
		oscillator = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		gain.gain.value = 0.00001; // inaudible but keeps tab alive
		oscillator.connect(gain);
		gain.connect(audioCtx.destination);
		oscillator.start();
	} catch (err) {
		console.warn('[WebCodecsExportGuard] Silent audio unavailable:', err);
	}

	// --- Visibility Handler ---
	function handleVisibility() {
		visibilityEventCount++;
		if (document.hidden) {
			hidden = true;
			console.log(`[WebCodecsExportGuard] Tab hidden (#${visibilityEventCount})`);
			onHidden?.();
		} else {
			hidden = false;
			console.log(`[WebCodecsExportGuard] Tab visible (#${visibilityEventCount})`);
			onVisible?.();
		}
	}

	document.addEventListener('visibilitychange', handleVisibility);

	function destroy() {
		console.log(`[WebCodecsExportGuard] Destroying (visibility events: ${visibilityEventCount})`);
		document.removeEventListener('visibilitychange', handleVisibility);
		try { wakeLock?.release(); } catch { /* ignore */ }
		try { oscillator?.stop(); } catch { /* ignore */ }
		try { audioCtx?.close(); } catch { /* ignore */ }
		wakeLock = null;
		oscillator = null;
		audioCtx = null;
	}

	return {
		get isHidden() { return hidden; },
		destroy
	};
}
