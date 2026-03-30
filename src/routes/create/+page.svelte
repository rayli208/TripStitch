<script lang="ts">
	import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
	import { createEditorState } from '$lib/state/editor.svelte';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import profileState from '$lib/state/profile.svelte';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import type { ExportStepItem } from '$lib/types';
	import { checkBrowserSupport, getSupportedMimeType, getFileExtension } from '$lib/utils/browserCompat';
	import { getShareUrl } from '$lib/services/shareService';
	import { uuid } from '$lib/utils/uuid';
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
	import { MapTrifold, MapPin, Article, Lock, Crown } from 'phosphor-svelte';

	let showEditor = $state(false);

	// When navigating back to /create (e.g. from spotlight), reset to chooser
	afterNavigate(({ from }) => {
		if (from?.url.pathname && from.url.pathname !== '/create' && !isExporting && !exportDone) {
			showEditor = false;
		}
	});

	// When "Create" tab is tapped while already on /create, reset to chooser
	$effect(() => {
		const handler = () => {
			if (!isExporting && !exportDone) {
				showEditor = false;
			}
		};
		window.addEventListener('tripstitch:create-reset', handler);
		return () => window.removeEventListener('tripstitch:create-reset', handler);
	});

	// If the page reloads after iOS backgrounding during share/download,
	// redirect to the saved trip's edit page instead of showing a blank create form.
	const SAVED_TRIP_KEY = 'tripstitch_export_tripId';
	$effect(() => {
		const savedId = sessionStorage.getItem(SAVED_TRIP_KEY);
		if (savedId && !isExporting && !exportDone) {
			sessionStorage.removeItem(SAVED_TRIP_KEY);
			console.log('[Create] Restoring after page reload — redirecting to saved trip', savedId);
			goto(`/trip/${savedId}/edit`, { replaceState: true });
		}
	});

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			// Don't redirect during export — Firebase auth can briefly flicker on unstable connections
			if (isExporting || exportDone) {
				console.warn('[Create] Auth state flickered to signed-out during export, ignoring redirect');
				return;
			}
			goto('/signin');
		} else {
			profileState.load();
		}
	});

	const editor = createEditorState({
		fontId: profileState.profile?.preferredFontId ?? 'inter'
	});

	// Update font, colors from profile once it loads
	$effect(() => {
		if (profileState.profile?.preferredFontId && editor.fontId === 'inter') {
			editor.fontId = profileState.profile.preferredFontId;
		}
		if (profileState.profile?.secondaryColor && editor.secondaryColor === '#0a0f1e') {
			editor.secondaryColor = profileState.profile.secondaryColor;
		}
		if (profileState.profile?.brandColors?.length && editor.titleColor === '#FFFFFF') {
			editor.titleColor = profileState.profile.brandColors[0];
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

	// Export elapsed timer — pauses when tab is hidden so it only counts active stitching time
	let exportElapsed = $state<number | undefined>(undefined);
	let exportStartTime = 0;
	let exportPausedTotal = 0; // total ms the tab was hidden during export
	let exportHiddenAt = 0; // timestamp when tab was last hidden (0 = not hidden)
	let exportPaused = $state(false); // whether the export is currently paused (tab hidden)
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
		// Guard against double-clicks
		if (isExporting) return;

		isExporting = true;
		exportDone = false;
		error = null;
		shareUrl = null;
		progress = { step: 'init', message: 'Saving trip...', current: 0, total: 1 };
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

		// Save trip to Firestore first
		const tripData = {
			id: uuid(),
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
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		const docId = await tripsState.addTrip(tripData);

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
				profileState.isPro ? editor.secondaryColor : undefined,
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
			shareUrl = docId ? getShareUrl(docId) : null;
			// Persist trip ID so if iOS kills the tab during share, we can redirect back
			if (docId) sessionStorage.setItem(SAVED_TRIP_KEY, docId);
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
		sessionStorage.removeItem(SAVED_TRIP_KEY);
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		goto('/trips');
	}

	function handleCopyLink() {
		if (!shareUrl) return;
		navigator.clipboard.writeText(shareUrl);
		toast.success('Link copied!');
	}

</script>

<svelte:head><title>Create | TripStitch</title></svelte:head>

<AppShell title="Create" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	{#if !showEditor}
		<!-- Tool chooser -->
		<div class="space-y-4">
			<p class="text-sm text-text-muted">What would you like to create?</p>
			<div class="grid grid-cols-1 gap-3">
				<button
					class="group flex items-start gap-4 rounded-xl border-2 border-border bg-card p-5 text-left shadow-[3px_3px_0_var(--color-border)] hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all cursor-pointer"
					onclick={() => (showEditor = true)}
				>
					<div class="w-11 h-11 rounded-xl bg-accent text-white flex items-center justify-center flex-shrink-0 border-2 border-border group-hover:scale-110 transition-transform">
						<MapTrifold size={22} weight="bold" />
					</div>
					<div>
						<h3 class="font-bold text-text-primary text-base">Trip Video</h3>
						<p class="text-sm text-text-muted mt-0.5">
							Stitch your photos and clips into a cinematic video with animated map transitions between stops.
						</p>
					</div>
				</button>

				{#if profileState.isPro}
					<a
						href="/create/spotlight"
						class="group flex items-start gap-4 rounded-xl border-2 border-border bg-card p-5 text-left shadow-[3px_3px_0_var(--color-border)] hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all"
					>
						<div class="w-11 h-11 rounded-xl bg-warning text-black flex items-center justify-center flex-shrink-0 border-2 border-border group-hover:scale-110 transition-transform">
							<MapPin size={22} weight="bold" />
						</div>
						<div>
							<h3 class="font-bold text-text-primary text-base">Location Spotlight</h3>
							<p class="text-sm text-text-muted mt-0.5">
								Generate a short zoom-in animation from a town overview to a specific place — perfect as a video overlay.
							</p>
						</div>
					</a>
				{:else}
					<button
						onclick={() => goto('/pricing')}
						class="group flex items-start gap-4 rounded-xl border-2 border-border bg-card p-5 text-left shadow-[3px_3px_0_var(--color-border)] opacity-60 cursor-pointer transition-all hover:opacity-80"
					>
						<div class="w-11 h-11 rounded-xl bg-warning/50 text-black/50 flex items-center justify-center flex-shrink-0 border-2 border-border">
							<MapPin size={22} weight="bold" />
						</div>
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<h3 class="font-bold text-text-primary text-base">Location Spotlight</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
									<Crown size={10} weight="fill" /> Pro
								</span>
							</div>
							<p class="text-sm text-text-muted mt-0.5">
								Generate a short zoom-in animation from a town overview to a specific place — perfect as a video overlay.
							</p>
						</div>
						<Lock size={18} weight="bold" class="text-text-muted flex-shrink-0 mt-1" />
					</button>
				{/if}

				{#if profileState.isPro}
					<a
						href="/create/blog"
						class="group flex items-start gap-4 rounded-xl border-2 border-border bg-card p-5 text-left shadow-[3px_3px_0_var(--color-border)] hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all"
					>
						<div class="w-11 h-11 rounded-xl bg-success text-white flex items-center justify-center flex-shrink-0 border-2 border-border group-hover:scale-110 transition-transform">
							<Article size={22} weight="bold" />
						</div>
						<div>
							<h3 class="font-bold text-text-primary text-base">Blog Post</h3>
							<p class="text-sm text-text-muted mt-0.5">
								Write a guide, listicle, or review with embedded locations, routes, and photos.
							</p>
						</div>
					</a>
				{:else}
					<button
						onclick={() => goto('/pricing')}
						class="group flex items-start gap-4 rounded-xl border-2 border-border bg-card p-5 text-left shadow-[3px_3px_0_var(--color-border)] opacity-60 cursor-pointer transition-all hover:opacity-80"
					>
						<div class="w-11 h-11 rounded-xl bg-success/50 text-white/50 flex items-center justify-center flex-shrink-0 border-2 border-border">
							<Article size={22} weight="bold" />
						</div>
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<h3 class="font-bold text-text-primary text-base">Blog Post</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
									<Crown size={10} weight="fill" /> Pro
								</span>
							</div>
							<p class="text-sm text-text-muted mt-0.5">
								Write a guide, listicle, or review with embedded locations, routes, and photos.
							</p>
						</div>
						<Lock size={18} weight="bold" class="text-text-muted flex-shrink-0 mt-1" />
					</button>
				{/if}
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
