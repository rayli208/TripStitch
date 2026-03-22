<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { Location } from '$lib/types';
	import { generateCaption, type CaptionResult } from '$lib/services/captionService';
	import toast from '$lib/state/toast.svelte';
	import { MusicNote, Sparkle, ShareNetwork } from 'phosphor-svelte';

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
		oneditaudio?: () => void;
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


	async function shareToApp() {
		// Always share as video/mp4 — Instagram/TikTok/iOS reject WebM
		const filename = `${tripTitle || 'tripstitch'}.mp4`;
		try {
			const file = new File([videoBlob], filename, { type: 'video/mp4' });
			await navigator.share({ files: [file] });
		} catch (err: any) {
			if (err?.name !== 'AbortError') {
				toast.error('Sharing failed. Try downloading instead.');
			}
		}
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

		{#if oneditaudio}
			<Button variant="ghost" onclick={oneditaudio}>
				<span class="flex items-center gap-2">
					<MusicNote size={16} weight="bold" />
					Edit Audio
				</span>
			</Button>
		{/if}

		<!-- Caption generation -->
		<div class="bg-card border-2 border-border rounded-lg p-4 w-full space-y-3">
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
					<Sparkle size={16} weight="bold" />
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

		{#if canShareFiles}
			<Button variant="ghost" onclick={shareToApp}>
				<span class="flex items-center gap-2">
					<ShareNetwork size={16} weight="bold" />
					Share
				</span>
			</Button>
		{/if}

		{#if shareUrl}
			<div class="bg-card border-2 border-border rounded-lg p-4 w-full">
				<p class="text-sm text-text-secondary mb-2">Share this trip:</p>
				<div class="flex items-center gap-2">
					<input
						type="text"
						readonly
						value={shareUrl}
						class="flex-1 bg-card border-2 border-border rounded-lg px-3 py-2 text-sm text-text-secondary min-w-0"
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
