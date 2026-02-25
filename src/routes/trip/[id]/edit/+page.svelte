<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { parseVideoUrl, getVideoUrl, videoUrlToLinks } from '$lib/utils/videoEmbed';

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

	// Populate link fields from trip data
	let videoUrl = $state('');
	let saving = $state(false);
	let populated = $state(false);

	$effect(() => {
		if (trip && !populated) {
			videoUrl = getVideoUrl(trip.videoLinks);
			populated = true;
		}
	});

	const detectedPlatform = $derived(videoUrl.trim() ? parseVideoUrl(videoUrl.trim())?.platform ?? null : null);

	const platformLabel: Record<string, string> = {
		youtube: 'YouTube',
		instagram: 'Instagram',
		tiktok: 'TikTok'
	};

	async function handleSave() {
		saving = true;
		try {
			await tripsState.updateVideoLinks(tripId, videoUrlToLinks(videoUrl.trim()));
			toast.success('Link saved!');
			goto('/trips');
		} catch {
			toast.error('Failed to save link');
		}
		saving = false;
	}
</script>

<AppShell title="Video Link" showBack onback={() => goto('/trips')}>
	{#if tripsState.loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 w-48 bg-border/50 rounded"></div>
			<div class="h-10 bg-border/50 rounded-lg"></div>
		</div>
	{:else if trip}
		<div class="space-y-6 max-w-lg">
			<div>
				<h2 class="text-xl font-semibold mb-1">{trip.title}</h2>
				<p class="text-sm text-text-muted">Add a link to where you've posted this video.</p>
			</div>

			<div class="space-y-4">
				<div>
					<label class="flex items-center gap-2 text-sm font-medium text-text-secondary mb-1.5">
						<svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Video Link
					</label>
					<Input placeholder="Paste a YouTube, Instagram, or TikTok link" bind:value={videoUrl} />
					{#if videoUrl.trim()}
						{#if detectedPlatform}
							<p class="text-xs text-green-400 mt-1">Detected: {platformLabel[detectedPlatform]}</p>
						{:else}
							<p class="text-xs text-amber-400 mt-1">Couldn't detect platform — try a full YouTube, Instagram, or TikTok URL</p>
						{/if}
					{/if}
				</div>
			</div>

			<div class="flex gap-3 pt-2">
				<Button variant="primary" onclick={handleSave} disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</Button>
				<Button variant="secondary" onclick={() => goto('/trips')}>
					Cancel
				</Button>
			</div>
		</div>
	{/if}
</AppShell>
