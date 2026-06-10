<script lang="ts">
	import { fetchPublicBlogs } from '$lib/services/blogService';
	import type { SharedBlog, BlogCategory } from '$lib/types';
	import { BLOG_CATEGORIES } from '$lib/constants/blog';
	import BlogCard from '$lib/components/blog/BlogCard.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import { MagnifyingGlass, Plus, Compass } from 'phosphor-svelte';

	let blogs = $state<SharedBlog[]>([]);
	let loading = $state(true);
	let activeCategory = $state<BlogCategory | 'all'>('all');
	let searchQuery = $state('');

	$effect(() => {
		fetchPublicBlogs().then((b) => {
			blogs = b;
			loading = false;
		});
	});

	$effect(() => {
		if (authState.isSignedIn) profileState.load();
	});

	const filtered = $derived.by(() => {
		let list = blogs;
		if (activeCategory !== 'all') list = list.filter((b) => b.category === activeCategory);
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(b) =>
					b.title.toLowerCase().includes(q) ||
					b.excerpt.toLowerCase().includes(q) ||
					b.tags.some((t) => t.toLowerCase().includes(q)) ||
					b.cities.some((c) => c.toLowerCase().includes(q)) ||
					b.countries.some((c) => c.toLowerCase().includes(q))
			);
		}
		return list;
	});
</script>

<svelte:head>
	<title>Explore Travel Guides & Stories | TripStitch</title>
	<meta name="description" content="Discover travel guides, itineraries, and stories from TripStitch creators — with maps, locations, and tips for your next trip." />
	<link rel="canonical" href="https://tripstitch.blog/explore" />
	<link rel="alternate" type="application/rss+xml" title="TripStitch Blog" href="https://tripstitch.blog/blog/rss.xml" />
</svelte:head>

{#snippet exploreBody()}
	<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
		<div class="mb-6">
			<h1 class="flex items-center gap-2 text-2xl sm:text-3xl font-extrabold text-text-primary">
				<Compass size={28} weight="duotone" class="text-accent" />
				Explore
			</h1>
			<p class="text-sm text-text-muted mt-1">Travel guides, itineraries, and stories from the community</p>
		</div>

		<!-- Search + category filters -->
		<div class="flex flex-col sm:flex-row gap-3 mb-6">
			<div class="relative flex-1 max-w-sm">
				<MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
				<input
					type="search"
					class="w-full bg-card border-2 border-border rounded-lg pl-9 pr-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={searchQuery}
					placeholder="Search by title, tag, or destination…"
				/>
			</div>
			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {activeCategory === 'all' ? 'bg-accent text-white shadow-[1px_1px_0_var(--color-border)]' : 'bg-card hover:bg-accent-light'}"
					onclick={() => (activeCategory = 'all')}
				>
					All
				</button>
				{#each BLOG_CATEGORIES as cat}
					<button
						type="button"
						class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {activeCategory === cat.value ? 'bg-accent text-white shadow-[1px_1px_0_var(--color-border)]' : 'bg-card hover:bg-accent-light'}"
						onclick={() => (activeCategory = cat.value)}
					>
						{cat.label}
					</button>
				{/each}
			</div>
		</div>

		{#if loading}
			<div class="flex justify-center py-20">
				<Spinner size="lg" />
			</div>
		{:else if filtered.length === 0}
			<div class="text-center py-20">
				<p class="text-text-muted font-medium">
					{blogs.length === 0 ? 'No posts published yet — be the first!' : 'Nothing matches your filters.'}
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filtered as blog (blog.id)}
					<BlogCard {blog} />
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#if authState.isSignedIn}
	<AppShell fullWidth showBottomNav logoUrl={profileState.profile?.logoUrl} title="Explore">
		<div class="bg-page min-h-screen">
			{@render exploreBody()}
		</div>
	</AppShell>
{:else}
	<div class="min-h-screen bg-page">
		<!-- Guest top bar -->
		<div class="sticky top-0 z-30 border-b-2 border-border bg-page/95 backdrop-blur-sm">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
				<a href="/" class="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity">
					<img src="/favicon-192.png" alt="" class="h-5" />
					<span class="hidden sm:inline text-sm font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
				</a>
				<a
					href="/create"
					class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold border-2 border-border rounded-lg bg-accent text-white hover:bg-accent-hover transition-all shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
				>
					<span class="hidden sm:inline">Start your own</span>
					<span class="sm:hidden">Start</span>
					<Plus size={14} weight="bold" />
				</a>
			</div>
		</div>
		{@render exploreBody()}
	</div>
{/if}
