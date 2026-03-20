<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import type { AspectRatio } from '$lib/types';
	import type { AssemblyProgress } from '$lib/services/videoAssembler';
	import { checkBrowserSupport, getSupportedMimeType, getFileExtension } from '$lib/utils/browserCompat';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import ExportStep from '$lib/components/editor/ExportStep.svelte';

	const tripId = page.params.id!;

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		tripsState.subscribe();
		return () => tripsState.unsubscribe();
	});

	const trip = $derived(tripsState.getTrip(tripId));

	$effect(() => {
		if (!tripsState.loading && !trip && !authState.loading && authState.isSignedIn) {
			goto('/trips');
		}
	});

	let aspectRatio = $state<AspectRatio>(trip?.aspectRatio ?? '9:16');
	let isExporting = $state(false);
	let exportDone = $state(false);
	let progress = $state<AssemblyProgress | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoBlob = $state<Blob | null>(null);
	let error = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	// Check browser support
	const support = checkBrowserSupport();

	async function handleExport() {
		if (!trip) return;

		// Save aspect ratio choice
		await tripsState.updateTrip(tripId, { aspectRatio });

		isExporting = true;
		exportDone = false;
		error = null;
		progress = { step: 'init', message: 'Checking browser compatibility...', current: 0, total: 1 };
		abortController = new AbortController();

		try {
			// Warn about large files
			const totalMediaSize = trip.locations.reduce((sum, loc) => {
				return sum + (loc.mediaFile?.size ?? 0);
			}, 0);
			if (totalMediaSize > 50 * 1024 * 1024) {
				console.warn('Total media size exceeds 50MB. Export may be slow or fail.');
			}

			// Dynamic import to avoid loading heavy deps upfront
			const { assembleVideo } = await import('$lib/services/videoAssembler');

			progress = { step: 'init', message: 'Preparing map animations...', current: 0, total: 1 };

			const result = await assembleVideo(
				trip,
				aspectRatio,
				(p) => { progress = p; },
				abortController.signal
			);

			videoBlob = result.blob;
			videoUrl = result.url;
			isExporting = false;
			exportDone = true;
			progress = { step: 'done', message: 'Your video is ready!', current: 1, total: 1 };
		} catch (err) {
			isExporting = false;
			if ((err as Error).message === 'Export cancelled') {
				// User cancelled — reset state
				progress = null;
				return;
			}
			const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
			if (msg.includes('memory') || msg.includes('Memory')) {
				error = 'Video too large. Try using shorter clips.';
			} else {
				error = msg;
			}
		} finally {
			abortController = null;
		}
	}

	function handleCancel() {
		abortController?.abort();
		isExporting = false;
		progress = null;
		// Clean up any partial blob URL
		if (videoUrl) {
			URL.revokeObjectURL(videoUrl);
			videoUrl = null;
		}
		videoBlob = null;
	}

	function handleRetry() {
		error = null;
		handleExport();
	}

	function handleDownload() {
		if (!videoBlob || !videoUrl) {
			console.warn('[Export] handleDownload called but no blob/url', { hasBlob: !!videoBlob, hasUrl: !!videoUrl });
			return;
		}

		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
		const mimeType = videoBlob.type || getSupportedMimeType();
		const ext = getFileExtension(mimeType);
		const filename = `${trip?.title || 'tripstitch'}-${Date.now()}.${ext}`;

		console.log('[Export] handleDownload', {
			blobType: videoBlob.type,
			detectedMimeType: mimeType,
			ext,
			filename,
			blobSize: `${(videoBlob.size / 1024 / 1024).toFixed(1)} MB`,
			isIOS,
			userAgent: navigator.userAgent,
			hasShareAPI: !!navigator.share,
			hasCanShare: !!(navigator as any).canShare
		});

		// On iOS, <a download> saves to Files app, not Photos.
		// Use Web Share API if available — it lets the user "Save Video" to Camera Roll.
		if (isIOS && navigator.share && (navigator as any).canShare) {
			const shareType = 'video/mp4';
			const file = new File([videoBlob], filename.replace(/\.webm$/, '.mp4'), { type: shareType });
			const canShare = (navigator as any).canShare({ files: [file] });
			console.log('[Export] iOS detected, attempting share for save-to-photos', { shareType, canShare });

			if (canShare) {
				navigator.share({ files: [file] })
					.then(() => console.log('[Export] iOS share-save completed'))
					.catch((err: any) => {
						if (err?.name === 'AbortError') {
							console.log('[Export] iOS share-save cancelled by user');
						} else {
							console.warn('[Export] iOS share-save failed, falling back to <a download>', err);
							downloadViaAnchor(videoUrl!, filename);
						}
					});
				return;
			}
		}

		downloadViaAnchor(videoUrl, filename);
	}

	function downloadViaAnchor(url: string, filename: string) {
		console.log('[Export] Using <a download> fallback', { filename });
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
	}

	function handleDashboard() {
		// Clean up blob URL before navigating
		if (videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		goto('/trips');
	}
</script>

<AppShell title="Export" showBack onback={() => goto(`/trip/${tripId}/edit`)}>
	<ExportStep
		canExport={support.canExport}
		{isExporting}
		{exportDone}
		{progress}
		{videoUrl}
		{error}
		tripTitle={trip?.title ?? ''}
		browserSupported={support.canExport}
		browserWarnings={support.warnings}
		onexport={handleExport}
		onback={() => goto(`/trip/${tripId}/edit`)}
		oncancel={handleCancel}
		onretry={handleRetry}
		ondownload={handleDownload}
		ondashboard={handleDashboard}
	/>
</AppShell>
