<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { Location } from '$lib/types';
	import { generateCaption, type CaptionResult } from '$lib/services/captionService';
	import toast from '$lib/state/toast.svelte';

	let {
		videoUrl,
		videoBlob,
		tripTitle = '',
		shareUrl = null,
		locations = [],
		tripDescription = '',
		tripTags = [],
		tripDate = '',
		ondownload,
		ondashboard,
		oncopylink,
		oneditaudio
	}: {
		videoUrl: string;
		videoBlob: Blob;
		tripTitle?: string;
		shareUrl?: string | null;
		locations?: Location[];
		tripDescription?: string;
		tripTags?: string[];
		tripDate?: string;
		ondownload?: () => void;
		ondashboard?: () => void;
		oncopylink?: () => void;
		oneditaudio: () => void;
	} = $props();

	let canShareFiles = $derived.by(() => {
		if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
		try {
			const testFile = new File([new Blob([''])], 'test.mp4', { type: 'video/mp4' });
			return navigator.canShare({ files: [testFile] });
		} catch {
			return false;
		}
	});

	function shareToApp() {
		const file = new File([videoBlob], `${tripTitle || 'tripstitch'}.mp4`, { type: videoBlob.type });
		navigator.share({ files: [file] }).catch(() => {});
	}

	// Caption generation
	let captionLoading = $state(false);
	let captionResult = $state<CaptionResult | null>(null);
	let captionTab = $state<'full' | 'short'>('full');

	async function handleGenerateCaption() {
		captionLoading = true;
		try {
			captionResult = await generateCaption(tripTitle, locations, {
				titleDescription: tripDescription,
				tags: tripTags,
				tripDate
			});
		} catch (err: any) {
			console.error('[Caption] Generation failed:', err);
			const msg = err?.code === 'functions/resource-exhausted'
				? err.message
				: 'Caption generation failed. Try again.';
			toast.error(msg);
		} finally {
			captionLoading = false;
		}
	}

	function copyText(text: string) {
		navigator.clipboard.writeText(text);
		toast.success('Copied!');
	}
</script>

<div class="flex flex-col items-center py-6 gap-5">
	<h3 class="text-xl font-semibold text-text-primary">Your TripStitch is ready!</h3>

	<!-- Video preview -->
	<div class="w-full rounded-lg overflow-hidden bg-overlay">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={videoUrl}
			controls
			playsinline
			class="w-full max-h-80 object-contain"
		></video>
	</div>

	<div class="flex flex-col gap-3 w-full">
		{#if ondownload}
			<Button variant="primary" onclick={ondownload}>
				Save Video
			</Button>
		{/if}

		<Button variant="ghost" onclick={oneditaudio}>
			<span class="flex items-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
				</svg>
				Edit Audio
			</span>
		</Button>

		<!-- Caption generation -->
		<div class="bg-card border border-border rounded-lg p-4 w-full space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-text-primary">AI Caption</p>
				{#if captionResult}
					<button
						class="text-xs text-accent hover:underline cursor-pointer"
						onclick={handleGenerateCaption}
						disabled={captionLoading}
					>
						Regenerate
					</button>
				{/if}
			</div>

			{#if !captionResult && !captionLoading}
				<button
					class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border text-sm font-medium text-text-secondary hover:border-accent hover:text-accent transition-colors cursor-pointer"
					onclick={handleGenerateCaption}
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
					</svg>
					Generate Caption
				</button>
			{:else if captionLoading}
				<div class="flex items-center justify-center gap-2 py-4">
					<div class="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></div>
					<span class="text-sm text-text-muted">Writing your caption...</span>
				</div>
			{:else if captionResult}
				<!-- Tab toggle -->
				<div class="flex gap-1 bg-page rounded-lg p-0.5">
					<button
						class="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors cursor-pointer {captionTab === 'full' ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted'}"
						onclick={() => captionTab = 'full'}
					>
						Full Caption
					</button>
					<button
						class="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors cursor-pointer {captionTab === 'short' ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted'}"
						onclick={() => captionTab = 'short'}
					>
						Short (Reels/TikTok)
					</button>
				</div>

				<!-- Caption text -->
				<div>
					<p class="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
						{captionTab === 'full' ? captionResult.caption : captionResult.shortCaption}
					</p>
					<button
						class="text-xs text-accent hover:underline cursor-pointer mt-1.5"
						onclick={() => copyText(captionTab === 'full' ? captionResult!.caption : captionResult!.shortCaption)}
					>
						Copy
					</button>
				</div>

				<!-- Hashtags -->
				{#if captionResult.hashtags}
					<div class="pt-2 border-t border-border">
						<div class="flex items-center justify-between mb-1.5">
							<p class="text-xs font-medium text-text-muted">Hashtags</p>
							<button
								class="text-xs text-accent hover:underline cursor-pointer"
								onclick={() => copyText(captionResult!.hashtags)}
							>
								Copy
							</button>
						</div>
						<p class="text-xs text-accent/80 leading-relaxed break-all">{captionResult.hashtags}</p>
					</div>
				{/if}

				<!-- Copy all button -->
				<button
					class="w-full py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors cursor-pointer"
					onclick={() => {
						const text = captionTab === 'full' ? captionResult!.caption : captionResult!.shortCaption;
						copyText(text + '\n\n' + captionResult!.hashtags);
					}}
				>
					Copy Caption + Hashtags
				</button>
			{/if}
		</div>

		<!-- Share to platforms -->
		<div class="space-y-2 mt-2">
			<p class="text-sm font-medium text-text-secondary text-center">Share to</p>
			<div class="grid grid-cols-3 gap-2">
				{#if canShareFiles}
					<button
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
						onclick={shareToApp}
					>
						<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
							<rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
							<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
							<circle cx="18" cy="6" r="1.2" fill="currentColor" class="text-pink-500" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">Instagram</span>
					</button>
				{:else}
					<a
						href="https://www.instagram.com"
						target="_blank"
						rel="noopener noreferrer"
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
					>
						<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
							<rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
							<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" class="text-pink-500" />
							<circle cx="18" cy="6" r="1.2" fill="currentColor" class="text-pink-500" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">Instagram</span>
					</a>
				{/if}

				{#if canShareFiles}
					<button
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
						onclick={shareToApp}
					>
						<svg class="w-6 h-6 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.16 8.16 0 005.58 2.2v-3.46a4.85 4.85 0 01-3.58-1.47V6.69h3.58z" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">TikTok</span>
					</button>
				{:else}
					<a
						href="https://www.tiktok.com/upload"
						target="_blank"
						rel="noopener noreferrer"
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
					>
						<svg class="w-6 h-6 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.16 8.16 0 005.58 2.2v-3.46a4.85 4.85 0 01-3.58-1.47V6.69h3.58z" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">TikTok</span>
					</a>
				{/if}

				{#if canShareFiles}
					<button
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors cursor-pointer"
						onclick={shareToApp}
					>
						<svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.56A3.02 3.02 0 00.5 6.2 31.7 31.7 0 000 12a31.7 31.7 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.84.56 9.38.56 9.38.56s7.54 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.7 31.7 0 0024 12a31.7 31.7 0 00-.5-5.8zM9.75 15.56V8.44L15.75 12l-6 3.56z" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">YouTube</span>
					</button>
				{:else}
					<a
						href="https://www.youtube.com/upload"
						target="_blank"
						rel="noopener noreferrer"
						class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors"
					>
						<svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.56A3.02 3.02 0 00.5 6.2 31.7 31.7 0 000 12a31.7 31.7 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.84.56 9.38.56 9.38.56s7.54 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.7 31.7 0 0024 12a31.7 31.7 0 00-.5-5.8zM9.75 15.56V8.44L15.75 12l-6 3.56z" />
						</svg>
						<span class="text-xs font-medium text-text-secondary">YouTube</span>
					</a>
				{/if}
			</div>
			{#if !canShareFiles}
				<p class="text-xs text-text-muted text-center">Download the video first, then upload to your platform</p>
			{/if}
		</div>

		{#if shareUrl}
			<div class="bg-card border border-border rounded-lg p-4 w-full">
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
</div>
