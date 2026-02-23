<script lang="ts">
	import type { AspectRatio, MapStyle } from '$lib/types';
	import type { AssemblyProgress, VideoSegmentInfo } from '$lib/services/videoAssembler';
	import { canRecordVoiceOver } from '$lib/services/voiceOverService';
	import VoiceOverRecorder from './VoiceOverRecorder.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { getFileExtension, getSupportedMimeType } from '$lib/utils/browserCompat';

	export interface ExportStepItem {
		id: string;
		label: string;
		icon: string;
	}

	let {
		aspectRatio = $bindable<AspectRatio>('9:16'),
		mapStyle = $bindable<MapStyle>('streets'),
		canExport,
		keepOriginalAudio = true,
		videoSegments = [],
		isExporting = false,
		exportDone = false,
		progress = null,
		videoUrl = null,
		videoBlob = null,
		error = null,
		tripTitle = '',
		browserSupported = true,
		browserWarnings = [],
		exportSteps = [],
		shareUrl = null,
		estimatedDuration,
		exportElapsed,
		onexport,
		onback,
		oncancel,
		onretry,
		ondownload,
		ondashboard,
		oncopylink,
		onshare,
		onvoiceovermerged
	}: {
		aspectRatio?: AspectRatio;
		mapStyle?: MapStyle;
		canExport: boolean;
		keepOriginalAudio?: boolean;
		videoSegments?: VideoSegmentInfo[];
		isExporting?: boolean;
		exportDone?: boolean;
		progress?: AssemblyProgress | null;
		videoUrl?: string | null;
		videoBlob?: Blob | null;
		error?: string | null;
		tripTitle?: string;
		browserSupported?: boolean;
		browserWarnings?: string[];
		exportSteps?: ExportStepItem[];
		shareUrl?: string | null;
		estimatedDuration?: string;
		exportElapsed?: number;
		onexport: () => void;
		onback: () => void;
		oncancel?: () => void;
		onretry?: () => void;
		ondownload?: () => void;
		ondashboard?: () => void;
		oncopylink?: () => void;
		onshare?: () => void;
		onvoiceovermerged?: (blob: Blob, url: string) => void;
	} = $props();

	const ratios: { value: AspectRatio; label: string; width: string; height: string }[] = [
		{ value: '9:16', label: 'Vertical', width: 'w-12', height: 'h-20' },
		{ value: '1:1', label: 'Square', width: 'w-16', height: 'h-16' },
		{ value: '16:9', label: 'Horizontal', width: 'w-20', height: 'h-12' }
	];

	const mapStyles: { value: MapStyle; label: string; icon: string }[] = [
		{ value: 'streets', label: 'Streets', icon: '🗺️' },
		{ value: 'satellite', label: 'Satellite', icon: '🛰️' },
		{ value: 'outdoor', label: 'Outdoor', icon: '🏔️' },
		{ value: 'topo', label: 'Topo', icon: '🧭' },
		{ value: 'dark', label: 'Dark', icon: '🌙' },
		{ value: 'light', label: 'Light', icon: '☀️' }
	];

	let voiceOverActive = $state(false);
	let voiceOverSkipped = $state(false);
	const supportsVoiceOver = canRecordVoiceOver();

	let videoEl: HTMLVideoElement | undefined = $state();
	let isMuted = $state(true);

	function toggleMute() {
		isMuted = !isMuted;
		if (videoEl) videoEl.muted = isMuted;
	}

	let progressPercent = $derived(
		progress ? Math.round((progress.current / progress.total) * 100) : 0
	);

	// Determine checklist step statuses based on current progress
	function getStepStatus(stepIndex: number): 'pending' | 'active' | 'done' {
		if (!progress || !isExporting) return 'pending';
		const currentIdx = progress.current - 1;
		if (stepIndex < currentIdx) return 'done';
		if (stepIndex === currentIdx) return 'active';
		return 'pending';
	}
</script>

<style>
	@keyframes pulse-glow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	.animate-pulse-glow {
		animation: pulse-glow 1.5s ease-in-out infinite;
	}
</style>

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-semibold mb-1">Export</h2>
		<p class="text-sm text-text-muted">Choose your aspect ratio and export your TripStitch.</p>
	</div>

	{#if !browserSupported}
		<!-- Browser not supported -->
		<div class="text-center py-12">
			<div class="text-5xl mb-4">&#x26A0;&#xFE0F;</div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Browser Not Supported</h3>
			<p class="text-sm text-text-muted mb-4">
				Your browser doesn't support video export. Please use Safari 14.5+, Chrome, or Firefox.
			</p>
			{#each browserWarnings as warning}
				<p class="text-xs text-text-muted">{warning}</p>
			{/each}
			<div class="mt-6">
				<Button variant="ghost" onclick={onback}>Back</Button>
			</div>
		</div>
	{:else if error}
		<!-- Error state -->
		<div class="text-center py-12">
			<div class="text-5xl mb-4">&#x274C;</div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Export Failed</h3>
			<p class="text-sm text-error mb-6">{error}</p>
			<div class="flex justify-center gap-3">
				<Button variant="ghost" onclick={onback}>Back</Button>
				{#if onretry}
					<Button variant="primary" onclick={onretry}>Try Again</Button>
				{/if}
			</div>
		</div>
	{:else if isExporting}
		<!-- Exporting with step checklist -->
		<div class="flex flex-col items-center py-6 gap-5">
			<p class="text-base font-medium text-text-primary">
				{progress?.message ?? 'Getting things ready...'}
			</p>

			<!-- Step checklist -->
			{#if exportSteps.length > 0}
				<div class="w-full max-w-xs space-y-2">
					{#each exportSteps as step, i}
						{@const status = getStepStatus(i)}
						<div class="flex items-center gap-3 py-1.5">
							<!-- Status icon -->
							<div class="w-7 h-7 flex items-center justify-center flex-shrink-0">
								{#if status === 'done'}
									<svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
								{:else if status === 'active'}
									<span class="text-lg animate-pulse-glow">{step.icon}</span>
								{:else}
									<span class="text-lg opacity-30">{step.icon}</span>
								{/if}
							</div>
							<!-- Label -->
							<span class="text-sm {status === 'done' ? 'text-text-muted line-through' : status === 'active' ? 'text-text-primary font-medium' : 'text-text-muted'}">
								{step.label}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Progress bar -->
			<div class="w-full max-w-xs">
				<div class="h-2 bg-border rounded-full overflow-hidden">
					<div
						class="h-full bg-accent rounded-full transition-all duration-500 ease-out"
						style="width: {progressPercent}%"
					></div>
				</div>
				<p class="text-xs text-text-muted text-center mt-1.5">{progressPercent}%</p>
				{#if exportElapsed != null}
					<p class="text-xs text-text-muted text-center mt-1">Elapsed: {Math.floor(exportElapsed / 60)}:{String(exportElapsed % 60).padStart(2, '0')}</p>
				{/if}
			</div>

			<!-- Cancel button -->
			{#if oncancel}
				<button
					class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors mt-2"
					onclick={oncancel}
				>
					Cancel export
				</button>
			{/if}
		</div>
	{:else if exportDone && videoUrl && voiceOverActive && videoBlob}
		<!-- Voice-over recording flow -->
		<VoiceOverRecorder
			{videoUrl}
			{videoBlob}
			{keepOriginalAudio}
			segments={videoSegments}
			onaccept={(blob, url) => {
				voiceOverActive = false;
				voiceOverSkipped = true;
				onvoiceovermerged?.(blob, url);
			}}
			oncancel={() => { voiceOverActive = false; }}
		/>
	{:else if exportDone && videoUrl}
		<!-- Export complete -->
		<div class="flex flex-col items-center py-6 gap-5">
			<h3 class="text-xl font-semibold text-text-primary">Your TripStitch is ready!</h3>

			<!-- Video preview -->
			<div class="w-full rounded-lg overflow-hidden bg-overlay relative">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					src={videoUrl}
					controls
					playsinline
					muted={isMuted}
					class="w-full max-h-80 object-contain"
				></video>
				<!-- Mute toggle overlay -->
				<button
					class="absolute top-2 right-2 w-9 h-9 rounded-full bg-overlay/60 hover:bg-overlay/80 flex items-center justify-center text-white transition-colors cursor-pointer"
					onclick={toggleMute}
					title={isMuted ? 'Unmute' : 'Mute'}
				>
					{#if isMuted}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
						</svg>
					{:else}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
						</svg>
					{/if}
				</button>
			</div>

			{#if !voiceOverSkipped && supportsVoiceOver && videoBlob && onvoiceovermerged}
				<!-- Voice-over prompt card -->
				<div class="w-full bg-card border border-border rounded-xl p-5 text-center space-y-3">
					<div class="flex justify-center">
						<div class="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center">
							<svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
							</svg>
						</div>
					</div>
					<h4 class="text-base font-semibold text-text-primary">Add narration?</h4>
					<p class="text-sm text-text-muted">Record a voice over while watching your video. You can always skip this.</p>
					<div class="flex gap-3 justify-center pt-1">
						<Button variant="ghost" onclick={() => { voiceOverSkipped = true; }}>Skip</Button>
						<Button variant="primary" onclick={() => { voiceOverActive = true; }}>Record</Button>
					</div>
				</div>
			{:else}
				<!-- Download and action buttons -->
				<div class="flex flex-col gap-3 w-full">
					{#if ondownload}
						<Button variant="primary" onclick={ondownload}>
							Download Video
						</Button>
					{/if}

					{#if onshare}
						<Button variant="secondary" onclick={onshare}>
							Share
						</Button>
					{/if}

					{#if shareUrl}
						<div class="bg-card border border-border rounded-lg p-4">
							<p class="text-sm text-text-secondary mb-2">Share this trip:</p>
							<div class="flex items-center gap-2">
								<input
									type="text"
									readonly
									value={shareUrl}
									class="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-secondary min-w-0"
								/>
								{#if oncopylink}
									<button
										class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors cursor-pointer flex-shrink-0"
										onclick={oncopylink}
									>
										Copy
									</button>
								{/if}
							</div>
						</div>
					{/if}

					{#if ondashboard}
						<Button variant="ghost" onclick={ondashboard}>
							View My Trips
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Aspect ratio selection -->
		<div>
			<span class="block text-sm font-medium text-text-secondary mb-3">Aspect Ratio</span>
			<div class="grid grid-cols-3 gap-3">
				{#each ratios as ratio}
					<button
						class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer
							{aspectRatio === ratio.value
							? 'border-accent bg-accent-light'
							: 'border-border bg-card hover:border-primary-light'}"
						onclick={() => (aspectRatio = ratio.value)}
					>
						<div
							class="{ratio.width} {ratio.height} rounded border-2
								{aspectRatio === ratio.value ? 'border-accent' : 'border-border'}"
						></div>
						<div class="text-center">
							<p class="text-xs font-medium {aspectRatio === ratio.value ? 'text-text-primary' : 'text-text-muted'}">
								{ratio.label}
							</p>
							<p class="text-xs text-text-muted">{ratio.value}</p>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Map style selection -->
		<div>
			<span class="block text-sm font-medium text-text-secondary mb-3">Map Style</span>
			<div class="grid grid-cols-3 gap-2">
				{#each mapStyles as style}
					<button
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer
							{mapStyle === style.value
							? 'border-accent bg-accent-light'
							: 'border-border bg-card hover:border-primary-light'}"
						onclick={() => (mapStyle = style.value)}
					>
						<span class="text-xl">{style.icon}</span>
						<span class="text-xs font-medium {mapStyle === style.value ? 'text-text-primary' : 'text-text-muted'}">
							{style.label}
						</span>
					</button>
				{/each}
			</div>
		</div>

		{#if estimatedDuration}
			<p class="text-sm text-text-muted text-center">Estimated duration: {estimatedDuration}</p>
		{/if}

		<div class="flex justify-between pt-4">
			<Button variant="ghost" onclick={onback}>Back</Button>
			<Button variant="primary" disabled={!canExport} onclick={onexport}>
				Export Video
			</Button>
		</div>
	{/if}
</div>
