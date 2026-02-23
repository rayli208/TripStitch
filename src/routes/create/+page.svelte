<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { createEditorState } from '$lib/state/editor.svelte';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import profileState from '$lib/state/profile.svelte';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import type { ExportStepItem } from '$lib/components/editor/ExportStep.svelte';
	import { checkBrowserSupport, getSupportedMimeType, getFileExtension } from '$lib/utils/browserCompat';
	import { publishTrip, getShareUrl } from '$lib/services/shareService';
	import { estimateVideoDuration } from '$lib/utils/durationEstimate';
	import toast from '$lib/state/toast.svelte';
	import { DEFAULT_BRAND_COLORS } from '$lib/constants/fonts';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import StepIndicator from '$lib/components/editor/StepIndicator.svelte';
	import TitleStep from '$lib/components/editor/TitleStep.svelte';
	import LocationsStep from '$lib/components/editor/LocationsStep.svelte';
	import ReviewStep from '$lib/components/editor/ReviewStep.svelte';
	import ExportStep from '$lib/components/editor/ExportStep.svelte';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) goto('/signin');
		else profileState.load();
	});

	const editor = createEditorState({
		fontId: profileState.profile?.preferredFontId ?? 'inter'
	});

	// Update font from profile once it loads
	$effect(() => {
		if (profileState.profile?.preferredFontId && editor.fontId === 'inter') {
			editor.fontId = profileState.profile.preferredFontId;
		}
	});

	const brandColors = $derived(profileState.profile?.brandColors ?? []);

	// Duration estimate
	let videoDurations = $state(new Map<string, number>());

	$effect(() => {
		for (const loc of editor.locations) {
			for (const clip of loc.clips) {
				if (clip.type === 'video' && clip.file && !videoDurations.has(clip.id)) {
					const file = clip.file;
					const clipId = clip.id;
					const video = document.createElement('video');
					video.preload = 'metadata';
					video.onloadedmetadata = () => {
						const dur = video.duration;
						URL.revokeObjectURL(video.src);
						if (isFinite(dur)) {
							videoDurations = new Map(videoDurations).set(clipId, dur);
						}
					};
					video.onerror = () => URL.revokeObjectURL(video.src);
					video.src = URL.createObjectURL(file);
				}
			}
		}
	});

	const durationEstimate = $derived(estimateVideoDuration(editor.locations, videoDurations));

	// Export elapsed timer
	let exportElapsed = $state<number | undefined>(undefined);
	let elapsedInterval: ReturnType<typeof setInterval> | undefined;

	// Navigation guards
	$effect(() => {
		if (editor.hasContent && !exportDone) {
			const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	beforeNavigate(({ cancel }) => {
		if (editor.hasContent && !exportDone) {
			if (!confirm('You have unsaved work. Leave this page?')) {
				cancel();
			}
		}
	});

	// Export state
	let isExporting = $state(false);
	let exportDone = $state(false);
	let progress = $state<AssemblyProgress | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoBlob = $state<Blob | null>(null);
	let videoSegments = $state<VideoSegmentInfo[]>([]);
	let error = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);
	let shareUrl = $state<string | null>(null);

	const support = checkBrowserSupport();

	// Build export steps checklist based on current locations
	let exportSteps = $derived.by<ExportStepItem[]>(() => {
		const steps: ExportStepItem[] = [];
		steps.push({ id: 'title', label: 'Creating title card', icon: '🎬' });
		for (const loc of editor.locations) {
			const displayName = loc.label || loc.name.split(',')[0];
			steps.push({ id: `map-${loc.id}`, label: `Map: ${displayName}`, icon: '🗺️' });
			if (loc.clips.length > 0) {
				steps.push({
					id: `clip-${loc.id}`,
					label: `${loc.clips.length} clip${loc.clips.length !== 1 ? 's' : ''}: ${displayName}`,
					icon: '🎬'
				});
			}
		}
		steps.push({ id: 'route', label: 'Drawing final route', icon: '📍' });
		steps.push({ id: 'finalize', label: 'Stitching together', icon: '✂️' });
		return steps;
	});

	async function handleExport() {
		// Save trip to Firestore first
		const tripId = crypto.randomUUID();
		const tripData = {
			id: tripId,
			title: editor.title || 'Untitled Trip',
			titleColor: editor.titleColor,
			titleDescription: editor.titleDescription,
			titleMediaFile: editor.titleMediaFile,
			titleMediaPreviewUrl: editor.titleMediaPreviewUrl,
			titleMediaType: editor.titleMediaType,
			showLogoOnTitle: editor.showLogoOnTitle,
			fontId: editor.fontId,
			mapStyle: editor.mapStyle,
			locations: editor.locations,
			aspectRatio: editor.aspectRatio,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await tripsState.addTrip(tripData);

		isExporting = true;
		exportDone = false;
		error = null;
		shareUrl = null;
		progress = { step: 'init', message: 'Getting things ready...', current: 0, total: 1 };
		abortController = new AbortController();
		exportElapsed = 0;
		elapsedInterval = setInterval(() => { exportElapsed = (exportElapsed ?? 0) + 1; }, 1000);

		try {
			const { assembleVideo } = await import('$lib/services/videoAssembler');

			progress = { step: 'init', message: 'Preparing map animations...', current: 0, total: 1 };

			const result = await assembleVideo(
				tripData,
				editor.aspectRatio,
				(p) => { progress = p; },
				abortController.signal,
				editor.mapStyle,
				profileState.profile?.logoUrl
			);

			videoBlob = result.blob;
			videoUrl = result.url;
			videoSegments = result.segments;
			isExporting = false;
			exportDone = true;
			progress = { step: 'done', message: 'Your video is ready!', current: 1, total: 1 };

			// Publish to public collection if user has a profile
			if (profileState.hasProfile && authState.user) {
				try {
					await publishTrip(tripData, authState.user.id, profileState.profile!);
					shareUrl = getShareUrl(tripId);
				} catch (err) {
					console.warn('[TripStitch] Failed to publish trip:', err);
				}
			}
		} catch (err) {
			isExporting = false;
			if ((err as Error).message === 'Export cancelled') {
				progress = null;
				return;
			}
			const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
			error = msg.includes('memory') || msg.includes('Memory')
				? 'Video too large. Try using shorter clips.'
				: msg;
			console.error('[TripStitch] Export error:', err);
		} finally {
			abortController = null;
			clearInterval(elapsedInterval);
		}
	}

	function handleCancel() {
		abortController?.abort();
		isExporting = false;
		progress = null;
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
		if (!videoBlob || !videoUrl) return;
		const mimeType = getSupportedMimeType();
		const ext = getFileExtension(mimeType);
		const filename = `${editor.title || 'tripstitch'}-${Date.now()}.${ext}`;
		const a = document.createElement('a');
		a.href = videoUrl;
		a.download = filename;
		a.click();
	}

	function handleVoiceOverMerged(blob: Blob, url: string) {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoBlob = blob;
		videoUrl = url;
	}

	function handleDashboard() {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		goto('/trips');
	}

	function handleCopyLink() {
		if (!shareUrl) return;
		navigator.clipboard.writeText(shareUrl);
		toast.success('Link copied!');
	}

	async function handleShare() {
		if (!navigator.share) return;
		try {
			if (videoBlob) {
				const mimeType = getSupportedMimeType();
				const ext = getFileExtension(mimeType);
				const file = new File([videoBlob], `${editor.title || 'tripstitch'}.${ext}`, { type: mimeType });
				await navigator.share({ files: [file] });
			} else if (shareUrl) {
				await navigator.share({ title: editor.title || 'TripStitch', url: shareUrl });
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				console.warn('[TripStitch] Share failed:', err);
			}
		}
	}
</script>

<AppShell title="Create Trip" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<StepIndicator steps={editor.stepLabels} current={editor.currentStep} />

	{#if editor.currentStep === 0}
		<TitleStep
			bind:title={editor.title}
			bind:titleColor={editor.titleColor}
			bind:titleDescription={editor.titleDescription}
			bind:fontId={editor.fontId}
			bind:showLogoOnTitle={editor.showLogoOnTitle}
			{brandColors}
			titleMediaPreviewUrl={editor.titleMediaPreviewUrl}
			logoUrl={profileState.profile?.logoUrl ?? null}
			onmedia={(file) => editor.updateTitleMedia(file)}
			onremovemedia={() => editor.removeTitleMedia()}
			onnext={() => editor.nextStep()}
		/>
	{:else if editor.currentStep === 1}
		<LocationsStep
			locations={editor.locations}
			canAdd={editor.canAddLocation}
			onadd={(loc) => editor.addLocation(loc)}
			onremove={(id) => editor.removeLocation(id)}
			onaddclip={(locId, file) => editor.addClipToLocation(locId, file)}
			onremoveclip={(locId, clipId) => editor.removeClip(locId, clipId)}
			onmoveclip={(locId, from, to) => editor.moveClip(locId, from, to)}
			ontransport={(id, mode) => editor.updateLocationTransport(id, mode)}
			onlabel={(id, label) => editor.updateLocationLabel(id, label)}
			onrating={(id, rating) => editor.updateLocationRating(id, rating)}
			onclipanimation={(locId, clipId, style) => editor.updateClipAnimation(locId, clipId, style)}
			onnext={() => editor.nextStep()}
			onback={() => editor.prevStep()}
		/>
	{:else if editor.currentStep === 2}
		<ReviewStep
			locations={editor.locations}
			bind:keepOriginalAudio={editor.keepOriginalAudio}
			mapStyle={editor.mapStyle}
			titleColor={editor.titleColor}
			onremove={(id) => editor.removeLocation(id)}
			onmove={(from, to) => editor.moveLocation(from, to)}
			ontransport={(id, mode) => editor.updateLocationTransport(id, mode)}
			onlabel={(id, label) => editor.updateLocationLabel(id, label)}
			onnext={() => editor.nextStep()}
			onback={() => editor.prevStep()}
		/>
	{:else}
		<ExportStep
			bind:aspectRatio={editor.aspectRatio}
			bind:mapStyle={editor.mapStyle}
			canExport={editor.canExport && support.canExport}
			keepOriginalAudio={editor.keepOriginalAudio}
			{videoSegments}
			{isExporting}
			{exportDone}
			{progress}
			{videoUrl}
			{videoBlob}
			{error}
			tripTitle={editor.title}
			browserSupported={support.canExport}
			browserWarnings={support.warnings}
			exportSteps={exportSteps}
			estimatedDuration={durationEstimate.formatted}
			{exportElapsed}
			onexport={handleExport}
			onback={() => editor.prevStep()}
			oncancel={handleCancel}
			onretry={handleRetry}
			ondownload={handleDownload}
			ondashboard={handleDashboard}
			onvoiceovermerged={handleVoiceOverMerged}
			onshare={typeof navigator !== 'undefined' && navigator.share ? handleShare : undefined}
			{shareUrl}
			oncopylink={handleCopyLink}
		/>
	{/if}
</AppShell>
