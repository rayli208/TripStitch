<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import blogsState from '$lib/state/blogs.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import BlogEditor from '$lib/components/blog/BlogEditor.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { Trip, BlogPost } from '$lib/types';

	const tripId = page.url.searchParams.get('tripId');
	let seeded = $state<Partial<BlogPost> | null>(null);
	let seeding = $state(!!tripId);

	$effect(() => {
		if (authState.loading || profileState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		if (!profileState.isPro) {
			goto('/pricing');
			return;
		}
		tripsState.subscribe();
		blogsState.subscribe();
		return () => {
			tripsState.unsubscribe();
			blogsState.unsubscribe();
		};
	});

	// "Write about this trip": seed the draft from an existing trip —
	// title, cover, a heading + location card per stop, and the trip linked.
	$effect(() => {
		if (!tripId || !seeding) return;
		if (tripsState.loading) return;
		const trip = tripsState.trips.find((t) => t.id === tripId);
		if (trip) seeded = seedFromTrip(trip);
		seeding = false;
	});

	function seedFromTrip(trip: Trip): Partial<BlogPost> {
		const content: Record<string, unknown> = {
			type: 'doc',
			content: [
				{ type: 'paragraph' },
				...trip.locations.flatMap((loc, i) => [
					{
						type: 'heading',
						attrs: { level: 2 },
						content: [{ type: 'text', text: loc.label || loc.name }]
					},
					{
						type: 'locationCard',
						attrs: {
							id: loc.id,
							name: loc.name,
							label: loc.label,
							description: loc.description,
							lat: loc.lat,
							lng: loc.lng,
							city: loc.city,
							state: loc.state,
							country: loc.country,
							rating: loc.rating,
							priceTier: loc.priceTier,
							imageUrls: '[]',
							websiteUrl: null,
							instagramHandle: null,
							hours: null,
							rank: i + 1,
							category: null,
							tips: null
						}
					},
					{ type: 'paragraph' }
				])
			]
		};

		return {
			title: trip.title,
			subtitle: trip.titleDescription || undefined,
			category: 'itinerary',
			tags: trip.tags.map((t) => t.toLowerCase()),
			content,
			linkedTripIds: [trip.id],
			coverImageUrl: trip.coverImageUrl ?? undefined
		};
	}

	function handleSaved(id: string, slug: string) {
		if (slug) {
			goto(`/blog/${slug}`);
		} else {
			goto('/trips');
		}
	}
</script>

<svelte:head><title>Write Blog | TripStitch</title></svelte:head>

<AppShell
	title="Write Blog"
	showBottomNav
	logoUrl={profileState.profile?.logoUrl}
	subtitle={seeded ? `New Blog · from "${seeded.title}"` : 'New Blog · Pro'}
>
	{#if seeding}
		<div class="flex justify-center py-20">
			<Spinner size="lg" />
		</div>
	{:else}
		<BlogEditor initial={seeded} onsaved={handleSaved} />
	{/if}
</AppShell>
