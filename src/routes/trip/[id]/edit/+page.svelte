<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';

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
	let youtube = $state('');
	let instagram = $state('');
	let tiktok = $state('');
	let other = $state('');
	let saving = $state(false);
	let populated = $state(false);

	$effect(() => {
		if (trip && !populated) {
			youtube = trip.videoLinks?.youtube ?? '';
			instagram = trip.videoLinks?.instagram ?? '';
			tiktok = trip.videoLinks?.tiktok ?? '';
			other = trip.videoLinks?.other ?? '';
			populated = true;
		}
	});

	async function handleSave() {
		saving = true;
		try {
			await tripsState.updateVideoLinks(tripId, {
				...(youtube.trim() && { youtube: youtube.trim() }),
				...(instagram.trim() && { instagram: instagram.trim() }),
				...(tiktok.trim() && { tiktok: tiktok.trim() }),
				...(other.trim() && { other: other.trim() })
			});
			toast.success('Links saved!');
			goto('/trips');
		} catch {
			toast.error('Failed to save links');
		}
		saving = false;
	}
</script>

<AppShell title="Video Links" showBack onback={() => goto('/trips')}>
	{#if tripsState.loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 w-48 bg-border/50 rounded"></div>
			<div class="h-10 bg-border/50 rounded-lg"></div>
			<div class="h-10 bg-border/50 rounded-lg"></div>
			<div class="h-10 bg-border/50 rounded-lg"></div>
		</div>
	{:else if trip}
		<div class="space-y-6 max-w-lg">
			<div>
				<h2 class="text-xl font-semibold mb-1">{trip.title}</h2>
				<p class="text-sm text-text-muted">Add links to where you've posted this video.</p>
			</div>

			<div class="space-y-4">
				<div>
					<label class="flex items-center gap-2 text-sm font-medium text-text-secondary mb-1.5">
						<svg class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
						</svg>
						YouTube
					</label>
					<Input placeholder="https://youtube.com/shorts/..." bind:value={youtube} />
				</div>

				<div>
					<label class="flex items-center gap-2 text-sm font-medium text-text-secondary mb-1.5">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style="color: #E4405F">
							<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
						</svg>
						Instagram Reel
					</label>
					<Input placeholder="https://instagram.com/reel/..." bind:value={instagram} />
				</div>

				<div>
					<label class="flex items-center gap-2 text-sm font-medium text-text-secondary mb-1.5">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.65a8.35 8.35 0 0 0 4.76 1.49v-3.4a4.85 4.85 0 0 1-1-.05z"/>
						</svg>
						TikTok
					</label>
					<Input placeholder="https://tiktok.com/@user/video/..." bind:value={tiktok} />
				</div>

				<div>
					<label class="flex items-center gap-2 text-sm font-medium text-text-secondary mb-1.5">
						<svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
						</svg>
						Other Link
					</label>
					<Input placeholder="https://..." bind:value={other} />
				</div>
			</div>

			<div class="flex gap-3 pt-2">
				<Button variant="primary" onclick={handleSave} disabled={saving}>
					{saving ? 'Saving...' : 'Save Links'}
				</Button>
				<Button variant="secondary" onclick={() => goto('/trips')}>
					Cancel
				</Button>
			</div>
		</div>
	{/if}
</AppShell>
