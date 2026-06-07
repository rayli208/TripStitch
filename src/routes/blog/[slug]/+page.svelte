<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fetchBlogBySlug, getBlogUrl } from '$lib/services/blogService';
	import type { SharedBlog } from '$lib/types';
	import BlogContentRenderer from '$lib/components/blog/BlogContentRenderer.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import ShareFooter from '$lib/components/ShareFooter.svelte';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import { ShareNetwork, Clock, MapPin, CalendarBlank, Plus, Eye, Check } from 'phosphor-svelte';

	const slug = page.params.slug!;
	let blog = $state<SharedBlog | null>(null);
	let loading = $state(true);
	let linkCopied = $state(false);

	$effect(() => {
		loadBlog();
	});

	$effect(() => {
		if (authState.isSignedIn) profileState.load();
	});

	async function loadBlog() {
		loading = true;
		blog = await fetchBlogBySlug(slug);
		loading = false;
		if (!blog) {
			goto('/trips');
		}
	}

	async function share() {
		if (!blog) return;
		const url = getBlogUrl(blog.slug);
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({ title: blog.title, url });
				return;
			} catch {
				/* fall through */
			}
		}
		navigator.clipboard.writeText(url);
		linkCopied = true;
		setTimeout(() => { linkCopied = false; }, 2000);
	}

	const publishDate = $derived(
		blog?.publishedAt
			? new Date(blog.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			: blog?.createdAt
				? new Date(blog.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
				: ''
	);

	const youtubeId = $derived.by(() => {
		if (!blog?.youtubeUrl) return null;
		const match = blog.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?#]+)/);
		return match?.[1] ?? null;
	});

	// Try to derive a reads count if present, otherwise hide
	const readsCount = $derived<number | null>((blog as unknown as { reads?: number })?.reads ?? null);

	// First city/region label for the location pill
	const regionLabel = $derived.by(() => {
		if (!blog) return null;
		const cities = blog.cities ?? [];
		const countries = blog.countries ?? [];
		if (cities.length && countries.length) return `${cities[0]}, ${countries[0]}`;
		if (cities.length) return cities[0];
		if (countries.length) return countries[0];
		return null;
	});
</script>

<svelte:head>
	{#if blog}
		<title>{blog.title} | TripStitch</title>
		<meta name="description" content={blog.excerpt} />
		<meta property="og:title" content={blog.title} />
		<meta property="og:description" content={blog.excerpt} />
		{#if blog.coverImageUrl}
			<meta property="og:image" content={blog.coverImageUrl} />
		{/if}
	{/if}
</svelte:head>

{#if loading}
	<div class="flex justify-center items-center min-h-screen">
		<Spinner size="lg" />
	</div>
{:else if blog}
	{#snippet shareButton()}
		<button
			type="button"
			class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold border-2 border-border rounded-lg bg-page hover:bg-accent-light hover:border-accent transition-all shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
			onclick={share}
		>
			{#if linkCopied}
				<Check size={14} weight="bold" class="text-success" />
				<span class="hidden sm:inline">Copied!</span>
			{:else}
				<ShareNetwork size={14} weight="bold" />
				<span class="hidden sm:inline">Share</span>
			{/if}
		</button>
	{/snippet}

	{#snippet blogBody(blog: SharedBlog)}
		{#if !authState.isSignedIn}
			<!-- Guest top bar -->
			<div class="sticky top-0 z-30 border-b-2 border-border bg-page/95 backdrop-blur-sm">
				<div class="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
					<a href="/" class="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity">
						<img src="/favicon-192.png" alt="" class="h-5" />
						<span class="hidden sm:inline text-sm font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
					</a>
					<div class="flex items-center gap-2 ml-auto">
						{@render shareButton()}
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
			</div>
		{/if}

		<!-- ═══════════ Article ═══════════ -->
		<article class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
			<!-- Cover image -->
			{#if blog.coverImageUrl}
				<div class="rounded-2xl overflow-hidden border-2 border-border shadow-[4px_4px_0_var(--color-border)] mb-6">
					<img src={blog.coverImageUrl} alt={blog.title} class="w-full h-56 sm:h-72 md:h-96 object-cover" />
				</div>
			{/if}

			<!-- Region pill -->
			{#if regionLabel}
				<div class="mb-3">
					<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border-2 border-border text-xs font-bold text-text-secondary">
						<MapPin size={11} weight="fill" class="text-accent" />
						{regionLabel}
					</span>
				</div>
			{/if}

			<!-- Meta row: category · date · locations · reads -->
			<div class="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-text-muted mb-4">
				<span class="inline-flex items-center px-2 py-0.5 rounded font-extrabold uppercase tracking-wider text-[10px] bg-accent-light border border-border text-accent">
					{blog.category}
				</span>
				{#if publishDate}
					<span class="flex items-center gap-1"><CalendarBlank size={12} weight="bold" /> {publishDate}</span>
				{/if}
				{#if blog.locations.length > 0}
					<span class="flex items-center gap-1"><MapPin size={12} weight="bold" /> {blog.locations.length} locations</span>
				{/if}
				<span class="flex items-center gap-1"><Clock size={12} weight="bold" /> {blog.readingTime} min read</span>
				{#if readsCount}
					<span class="flex items-center gap-1"><Eye size={12} weight="bold" /> {readsCount.toLocaleString()} reads</span>
				{/if}
			</div>

			<!-- Title -->
			<h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary leading-tight tracking-tight mb-3">
				{blog.title}
			</h1>
			{#if blog.subtitle}
				<p class="text-lg sm:text-xl text-text-secondary leading-relaxed mb-6">{blog.subtitle}</p>
			{/if}

			<!-- Author card -->
			<div class="flex items-center gap-3 sm:gap-4 mb-6 pb-6 border-b-2 border-border">
				<a href="/u/{blog.username}" class="shrink-0">
					{#if blog.userAvatarUrl}
						<img src={blog.userAvatarUrl} alt={blog.userDisplayName} referrerpolicy="no-referrer" class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-border object-cover" />
					{:else}
						<div class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-border bg-accent-light flex items-center justify-center text-accent font-bold">
							{blog.userDisplayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
						</div>
					{/if}
				</a>
				<div class="flex-1 min-w-0">
					<a href="/u/{blog.username}" class="block">
						<p class="text-sm sm:text-base font-bold text-text-primary hover:text-accent transition-colors truncate">
							{blog.userDisplayName}
						</p>
						<p class="text-xs text-text-muted truncate">@{blog.username}</p>
					</a>
				</div>
				<div class="flex items-center gap-2 shrink-0">
					{#if !authState.isSignedIn || authState.user?.id !== blog.userId}
						<button
							type="button"
							class="px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
							onclick={() => goto(authState.isSignedIn && blog ? `/u/${blog.username}` : '/signin')}
						>
							Follow
						</button>
					{/if}
					<a
						href="/u/{blog.username}"
						class="hidden sm:inline-flex px-3 py-1.5 text-sm font-bold rounded-lg border-2 border-border bg-card hover:bg-accent-light transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)]"
					>
						View profile
					</a>
				</div>
			</div>

			<!-- Tags -->
			{#if blog.tags.length > 0}
				<div class="flex flex-wrap gap-1.5 mb-6">
					{#each blog.tags as tag}
						<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-card border-2 border-border text-xs font-bold text-text-secondary">
							#{tag}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Featured YouTube video (from blog metadata) -->
			{#if youtubeId}
				<figure class="relative mb-8 rounded-2xl overflow-hidden border-2 border-border shadow-[4px_4px_0_var(--color-border)] bg-overlay">
					<span class="absolute top-3 left-3 z-10 inline-block px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider text-white" style="background:#FF0000">YouTube</span>
					<div class="relative w-full" style="padding-top: 56.25%;">
						<iframe
							src="https://www.youtube.com/embed/{youtubeId}"
							title="{blog.title}"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
							class="absolute inset-0 w-full h-full border-0"
						></iframe>
					</div>
				</figure>
			{/if}

			<!-- Body content -->
			<div class="prose-blog">
				<BlogContentRenderer content={blog.content} />
			</div>

			<!-- ═══════════ Footer ═══════════ -->
			<ShareFooter
				username={blog.username}
				userDisplayName={blog.userDisplayName}
				onshare={share}
				shareLabel="Share this post"
				copied={linkCopied}
			/>
		</article>
	{/snippet}

	{#if authState.isSignedIn}
		<AppShell fullWidth showBottomNav logoUrl={profileState.profile?.logoUrl} title={blog.title} actions={shareButton}>
			<div class="bg-page">
				{@render blogBody(blog)}
			</div>
		</AppShell>
	{:else}
		<div class="min-h-screen bg-page">
			{@render blogBody(blog)}
		</div>
	{/if}
{/if}

<style>
	/* Cinematic typography for blog body content */
	.prose-blog :global(h2) {
		font-size: 1.625rem;
		font-weight: 800;
		line-height: 1.2;
		margin: 2.25rem 0 0.75rem;
		color: var(--color-text-primary);
	}
	.prose-blog :global(h3) {
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.25;
		margin: 1.75rem 0 0.5rem;
		color: var(--color-text-primary);
	}
	.prose-blog :global(p) {
		font-size: 1.0625rem;
		line-height: 1.75;
		margin: 0.85rem 0;
		color: var(--color-text-secondary);
	}
	.prose-blog :global(p strong),
	.prose-blog :global(p b) {
		color: var(--color-text-primary);
	}
	.prose-blog :global(ul),
	.prose-blog :global(ol) {
		font-size: 1.0625rem;
		line-height: 1.75;
		color: var(--color-text-secondary);
	}
	/* Cinematic blockquote — orange accent bar */
	.prose-blog :global(blockquote) {
		position: relative;
		margin: 1.5rem 0;
		padding: 0.75rem 1.25rem;
		border-left: 4px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 6%, transparent);
		border-radius: 0 8px 8px 0;
		font-style: italic;
		font-size: 1.0625rem;
		line-height: 1.7;
		color: var(--color-text-primary);
	}
	.prose-blog :global(blockquote p) {
		margin: 0.25rem 0;
		color: inherit;
	}
</style>
