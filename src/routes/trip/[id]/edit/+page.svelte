<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { createEditorState } from '$lib/state/editor.svelte';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import profileState from '$lib/state/profile.svelte';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import type { ExportStepItem } from '$lib/types';
	import { checkBrowserSupport, getSupportedMimeType, getFileExtension } from '$lib/utils/browserCompat';
	import { getShareUrl } from '$lib/services/shareService';
	import { estimateVideoDuration } from '$lib/utils/durationEstimate';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import StepIndicator from '$lib/components/editor/StepIndicator.svelte';
	import TitleStep from '$lib/components/editor/TitleStep.svelte';
	import LocationsStep from '$lib/components/editor/LocationsStep.svelte';
	import ReviewStep from '$lib/components/editor/ReviewStep.svelte';
	import ExportStep from '$lib/components/editor/ExportStep.svelte';
	import AudioEditor from '$lib/components/editor/AudioEditor.svelte';
	import ExportResult from '$lib/components/editor/ExportResult.svelte';

	const tripId = page.params.id!;

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			if (isExporting || exportDone) return;
			goto('/signin');
			return;
		}
		tripsState.subscribe();
		profileState.load();
		return () => tripsState.unsubscribe();
	});

	const trip = $derived(tripsState.getTrip(tripId));

	$effect(() => {
		if (!tripsState.loading && !trip && !authState.loading && authState.isSignedIn) {
			goto('/trips');
		}
	});

	// Create editor and populate from saved trip once loaded
	const editor = createEditorState();
	let populated = $state(false);

	$effect(() => {
		if (trip && !populated) {
			editor.title = trip.title;
			editor.titleColor = trip.titleColor;
			editor.titleDescription = trip.titleDescription;
			editor.fontId = trip.fontId;
			editor.mapStyle = trip.mapStyle;
			editor.tripDate = trip.tripDate;
			editor.aspectRatio = trip.aspectRatio;
			editor.tags = [...trip.tags];
			editor.visibility = trip.visibility;
			editor.showLogoOnTitle = trip.showLogoOnTitle;

			// Load locations with empty media — user will re-attach
			for (const loc of trip.locations) {
				editor.addLocation({
					name: loc.name,
					lat: loc.lat,
					lng: loc.lng,
					city: loc.city,
					state: loc.state,
					country: loc.country
				});
				// Restore saved metadata
				const editorLoc = editor.locations[editor.locations.length - 1];
				if (loc.label) editor.updateLocationLabel(editorLoc.id, loc.label);
				if (loc.description) editor.updateLocationDescription(editorLoc.id, loc.description);
				if (loc.transportMode) editor.updateLocationTransport(editorLoc.id, loc.transportMode);
				if (loc.rating !== null) editor.updateLocationRating(editorLoc.id, loc.rating);
				if (loc.priceTier !== null) editor.updateLocationPriceTier(editorLoc.id, loc.priceTier);
			}

			// Start on locations step so user can re-attach media
			editor.currentStep = 1;
			populated = true;
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

	const canShowOutro = $derived(
		!!(profileState.profile?.username || profileState.profile?.displayName ||
			profileState.profile?.socialLinks?.instagram || profileState.profile?.socialLinks?.youtube ||
			profileState.profile?.socialLinks?.tiktok || profileState.profile?.socialLinks?.website)
	);
	const hasOutro = $derived(canShowOutro && editor.includeOutro);
	const durationEstimate = $derived(estimateVideoDuration(editor.locations, videoDurations, hasOutro));

	// Export elapsed timer
	let exportElapsed = $state<number | undefined>(undefined);
	let exportStartTime = 0;
	let exportPausedTotal = 0;
	let exportHiddenAt = 0;
	let exportPaused = $state(false);
	let elapsedInterval: ReturnType<typeof setInterval> | undefined;
	let visibilityHandler: (() => void) | undefined;

	// Navigation guards
	$effect(() => {
		if (editor.hasContent && !exportDone) {
			const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	beforeNavigate(({ cancel }) => {
		if (isExporting) {
			if (!confirm('Export is in progress. Leave this page?')) {
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

	let exportSteps = $derived.by<ExportStepItem[]>(() => {
		const steps: ExportStepItem[] = [];
		steps.push({ id: 'title', label: 'Creating title card', icon: 'title' });
		for (const loc of editor.locations) {
			const displayName = loc.label || loc.name.split(',')[0];
			steps.push({ id: `map-${loc.id}`, label: `Map: ${displayName}`, icon: 'map' });
			if (loc.clips.length > 0) {
				steps.push({
					id: `clip-${loc.id}`,
					label: `${loc.clips.length} clip${loc.clips.length !== 1 ? 's' : ''}: ${displayName}`,
					icon: 'clips'
				});
			}
		}
		steps.push({ id: 'route', label: 'Drawing final route', icon: 'route' });
		if (hasOutro) steps.push({ id: 'outro', label: 'Creating outro card', icon: 'title' });
		steps.push({ id: 'finalize', label: 'Stitching together', icon: 'finalize' });
		return steps;
	});

	async function handleExport() {
		if (isExporting) return;

		isExporting = true;
		exportDone = false;
		error = null;
		shareUrl = null;
		progress = { step: 'init', message: 'Updating trip...', current: 0, total: 1 };
		abortController = new AbortController();
		exportElapsed = 0;
		exportStartTime = Date.now();
		exportPausedTotal = 0;
		exportHiddenAt = 0;
		exportPaused = false;
		visibilityHandler = () => {
			if (document.hidden) {
				exportHiddenAt = Date.now();
				exportPaused = true;
			} else if (exportHiddenAt > 0) {
				exportPausedTotal += Date.now() - exportHiddenAt;
				exportHiddenAt = 0;
				exportPaused = false;
			}
		};
		document.addEventListener('visibilitychange', visibilityHandler);
		elapsedInterval = setInterval(() => {
			const paused = exportHiddenAt > 0 ? Date.now() - exportHiddenAt : 0;
			exportElapsed = Math.floor((Date.now() - exportStartTime - exportPausedTotal - paused) / 1000);
		}, 500);

		// Update existing trip in Firestore
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
			tripDate: editor.tripDate,
			tags: editor.tags,
			visibility: editor.visibility,
			locations: editor.locations,
			aspectRatio: editor.aspectRatio,
			cities: [] as string[],
			states: [] as string[],
			countries: [] as string[],
			createdAt: trip?.createdAt ?? new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await tripsState.updateTrip(tripId, tripData);

		progress = { step: 'init', message: 'Getting things ready...', current: 0, total: 1 };

		try {
			const { assembleVideo } = await import('$lib/services/videoAssembler');

			progress = { step: 'init', message: 'Preparing map animations...', current: 0, total: 1 };

			const result = await assembleVideo(
				tripData,
				editor.aspectRatio,
				(p) => { progress = p; },
				abortController.signal,
				editor.mapStyle,
				profileState.isPro ? profileState.profile?.logoUrl : undefined,
				editor.secondaryColor,
				{
					username: profileState.profile?.username,
					displayName: profileState.profile?.displayName,
					socialLinks: profileState.isPro ? profileState.profile?.socialLinks : undefined
				}
			);

			videoBlob = result.blob;
			videoUrl = result.url;
			videoSegments = result.segments;
			isExporting = false;
			exportDone = true;
			progress = { step: 'done', message: 'Your video is ready!', current: 1, total: 1 };
			shareUrl = getShareUrl(tripId);
			// Auto-advance to Audio step
			editor.currentStep = 4;
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
			if (visibilityHandler) {
				document.removeEventListener('visibilitychange', visibilityHandler);
				visibilityHandler = undefined;
			}
			exportPaused = false;
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
		const mimeType = videoBlob.type || getSupportedMimeType();
		const ext = getFileExtension(mimeType);
		const filename = `${editor.title || 'tripstitch'}-${Date.now()}.${ext}`;

		const url = URL.createObjectURL(new Blob([videoBlob], { type: mimeType }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	}

	function handleAudioApply(mergedBlob: Blob | null, mergedUrl: string | null) {
		if (mergedBlob && mergedUrl) {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			videoBlob = mergedBlob;
			videoUrl = mergedUrl;
		}
		editor.currentStep = 5;
	}

	function handleAudioSkip() {
		editor.currentStep = 5;
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
</script>

<AppShell title="Edit Trip" showBack onback={() => goto('/trips')} logoUrl={profileState.profile?.logoUrl}>
	{#if tripsState.loading || !populated}
		<!-- Skeleton while trip loads -->
		<div class="space-y-4 animate-pulse">
			<div class="flex gap-2">
				{#each Array(6) as _}
					<div class="flex-1 h-8 bg-border/50 rounded-lg"></div>
				{/each}
			</div>
			<div class="h-6 w-48 bg-border/50 rounded mt-4"></div>
			<div class="h-4 w-64 bg-border/50 rounded"></div>
			<div class="bg-border/30 rounded-2xl p-4 space-y-3">
				<div class="h-5 w-32 bg-border/50 rounded"></div>
				<div class="h-10 bg-border/50 rounded-lg"></div>
				<div class="h-10 bg-border/50 rounded-lg"></div>
			</div>
			<div class="bg-border/30 rounded-2xl p-4 space-y-3">
				<div class="h-5 w-32 bg-border/50 rounded"></div>
				<div class="h-10 bg-border/50 rounded-lg"></div>
			</div>
		</div>
	{:else}
		<StepIndicator steps={editor.stepLabels} current={editor.currentStep} />

		{#if editor.currentStep === 0}
			<TitleStep
				bind:title={editor.title}
				bind:titleColor={editor.titleColor}
				bind:titleDescription={editor.titleDescription}
				bind:fontId={editor.fontId}
				bind:tripDate={editor.tripDate}
				bind:showLogoOnTitle={editor.showLogoOnTitle}
				{brandColors}
				bind:secondaryColor={editor.secondaryColor}
				profileSecondaryColor={profileState.profile?.secondaryColor ?? '#0a0f1e'}
				preferredFontId={profileState.profile?.preferredFontId}
				titleMediaPreviewUrl={editor.titleMediaPreviewUrl}
				logoUrl={profileState.profile?.logoUrl ?? null}
			isPro={profileState.isPro}
				bind:aspectRatio={editor.aspectRatio}
				bind:mapStyle={editor.mapStyle}
				onmedia={(file) => editor.updateTitleMedia(file)}
				onremovemedia={() => editor.removeTitleMedia()}
				onnext={() => editor.nextStep()}
			/>
		{:else if editor.currentStep === 1}
			{#if editor.locations.length > 0 && editor.locations.every(l => l.clips.length === 0)}
				<div class="bg-warning/10 border-2 border-warning/30 rounded-xl p-4 mb-4">
					<p class="text-sm font-medium text-warning">Your photos & videos need to be re-added</p>
					<p class="text-xs text-text-muted mt-1">Media files are stored on your device, not in the cloud, so they can't be loaded from a previous session. Your trip title, locations, and settings are all still here — just tap each stop below and add your photos/videos back.</p>
				</div>
			{/if}
			<LocationsStep
				locations={editor.locations}
				canAdd={editor.canAddLocation}
				maxClipsPerLocation={editor.limits.maxClipsPerLocation}
				maxLocations={editor.limits.maxLocations}
				onadd={(loc) => editor.addLocation({ name: loc.name, lat: loc.lat, lng: loc.lng, city: loc.city, state: loc.state, country: loc.country })}
				onremove={(id) => editor.removeLocation(id)}
				onaddclip={(locId, file, dur) => editor.addClipToLocation(locId, file, dur)}
				onremoveclip={(locId, clipId) => editor.removeClip(locId, clipId)}
				onmoveclip={(locId, from, to) => editor.moveClip(locId, from, to)}
				ontransport={(id, mode) => editor.updateLocationTransport(id, mode)}
				onlabel={(id, label) => editor.updateLocationLabel(id, label)}
				ondescription={(id, desc) => editor.updateLocationDescription(id, desc)}
				onrating={(id, rating) => editor.updateLocationRating(id, rating)}
				onpricetier={(id, tier) => editor.updateLocationPriceTier(id, tier)}
				onclipanimation={(locId, clipId, style) => editor.updateClipAnimation(locId, clipId, style)}
				onclipduration={(locId, clipId, dur) => editor.updateClipDuration(locId, clipId, dur)}
				oncliptrim={(locId, clipId, start, end) => editor.updateClipTrim(locId, clipId, start, end)}
				onnext={() => editor.nextStep()}
				onback={() => editor.prevStep()}
			/>
		{:else if editor.currentStep === 2}
			<ReviewStep
				locations={editor.locations}
				mapStyle={editor.mapStyle}
				titleColor={editor.titleColor}
				bind:tags={editor.tags}
				bind:visibility={editor.visibility}
				title={editor.title}
				titleDescription={editor.titleDescription}
				fontId={editor.fontId}
				secondaryColor={editor.secondaryColor}
				titleMediaFile={editor.titleMediaFile}
				logoUrl={profileState.profile?.logoUrl}
				showLogoOnTitle={editor.showLogoOnTitle}
				aspectRatio={editor.aspectRatio}
				username={profileState.profile?.username ?? ''}
				displayName={profileState.profile?.displayName ?? ''}
				socialLinks={profileState.isPro ? (profileState.profile?.socialLinks ?? {}) : {}}
				estimatedDuration={durationEstimate.formatted}
				{hasOutro}
				{canShowOutro}
				bind:includeOutro={editor.includeOutro}
				onremove={(id) => editor.removeLocation(id)}
				onmove={(from, to) => editor.moveLocation(from, to)}
				ontransport={(id, mode) => editor.updateLocationTransport(id, mode)}
				onlabel={(id, label) => editor.updateLocationLabel(id, label)}
				onnext={() => editor.nextStep()}
				onback={() => editor.prevStep()}
			/>
		{:else if editor.currentStep === 3}
			<ExportStep
				canExport={editor.canExport && support.canExport}
				{isExporting}
				{progress}
				{error}
				browserSupported={support.canExport}
				browserWarnings={support.warnings}
				exportSteps={exportSteps}
				estimatedDuration={durationEstimate.formatted}
				{exportElapsed}
				{exportPaused}
				onexport={handleExport}
				onback={() => editor.prevStep()}
				oncancel={handleCancel}
				onretry={handleRetry}
			/>
		{:else if editor.currentStep === 4 && videoUrl && videoBlob}
			<AudioEditor
				{videoUrl}
				videoBlob={videoBlob}
				{videoSegments}
				locations={editor.locations}
				bind:musicSelection={editor.musicSelection}
				bind:musicVolume={editor.musicVolume}
				bind:keepOriginalAudio={editor.keepOriginalAudio}
				bind:voiceOverVolume={editor.voiceOverVolume}
				title="Add Audio"
				applyLabel="Apply & Continue"
				skipLabel="Skip"
				showBackArrow={false}
				onback={handleAudioSkip}
				onapply={handleAudioApply}
			/>
		{:else if editor.currentStep === 5 && videoUrl && videoBlob}
			<ExportResult
				{videoUrl}
				videoBlob={videoBlob}
				tripTitle={editor.title}
				tripDescription={editor.titleDescription}
				tripTags={editor.tags}
				tripDate={editor.tripDate}
				locations={editor.locations}
				{shareUrl}
				ondownload={handleDownload}
				ondashboard={handleDashboard}
				oncopylink={handleCopyLink}
			/>
		{/if}
	{/if}
</AppShell>
