<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fetchBlogBySlug, getBlogUrl } from '$lib/services/blogService';
	import type { SharedBlog } from '$lib/types';
	import BlogContentRenderer from '$lib/components/blog/BlogContentRenderer.svelte';
	import VideoEmbed from '$lib/components/ui/VideoEmbed.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { ArrowLeft, ShareNetwork, Clock, MapPin, CalendarBlank, Tag } from 'phosphor-svelte';
	import toastState from '$lib/state/toast.svelte';

	const slug = page.params.slug!;
	let blog = $state<SharedBlog | null>(null);
	let loading = $state(true);

	$effect(() => {
		loadBlog();
	});

	async function loadBlog() {
		loading = true;
		blog = await fetchBlogBySlug(slug);
		loading = false;
		if (!blog) {
			goto('/explore');
		}
	}

	function share() {
		if (!blog) return;
		const url = getBlogUrl(blog.slug);
		if (navigator.share) {
			navigator.share({ title: blog.title, url });
		} else {
			navigator.clipboard.writeText(url);
			toastState.show('Link copied!');
		}
	}

	const publishDate = $derived(
		blog?.publishedAt
			? new Date(blog.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
			: blog?.createdAt
				? new Date(blog.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
				: ''
	);

	const youtubeId = $derived.by(() => {
		if (!blog?.youtubeUrl) return null;
		const match = blog.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?#]+)/);
		return match?.[1] ?? null;
	});
</script>

<svelte:head>
	{#if blog}
		<title>{blog.title} | TripStitch</title>
		<meta name="description" content={blog.excerpt} />
	{/if}
</svelte:head>

{#if loading}
	<div class="flex justify-center items-center min-h-screen">
		<Spinner size="lg" />
	</div>
{:else if blog}
	<div class="min-h-screen bg-page">
		<!-- Top bar -->
		<div class="sticky top-0 z-20 bg-page/80 backdrop-blur-md border-b-2 border-border">
			<div class="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
				<button type="button" class="p-2 -ml-2 cursor-pointer" onclick={() => history.back()}>
					<ArrowLeft size={20} weight="bold" />
				</button>
				<span class="text-sm font-bold text-text-muted">TripStitch</span>
				<button
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-2 border-border rounded-lg bg-card shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer"
					onclick={share}
				>
					<ShareNetwork size={14} weight="bold" />
					Share
				</button>
			</div>
		</div>

		<div class="max-w-2xl mx-auto px-4 py-6">
			<!-- Cover image -->
			{#if blog.coverImageUrl}
				<div class="rounded-xl overflow-hidden border-2 border-border shadow-[3px_3px_0_var(--color-border)] mb-6">
					<img src={blog.coverImageUrl} alt={blog.title} class="w-full h-48 sm:h-64 object-cover" />
				</div>
			{/if}

			<!-- Category + meta -->
			<div class="flex flex-wrap items-center gap-3 text-xs text-text-muted mb-3">
				<span class="px-2 py-1 font-bold bg-accent-light rounded-lg border border-border capitalize">{blog.category}</span>
				<span class="flex items-center gap-1"><Clock size={12} /> {blog.readingTime} min read</span>
				{#if publishDate}
					<span class="flex items-center gap-1"><CalendarBlank size={12} /> {publishDate}</span>
				{/if}
				{#if blog.locations.length > 0}
					<span class="flex items-center gap-1"><MapPin size={12} /> {blog.locations.length} locations</span>
				{/if}
			</div>

			<!-- Title -->
			<h1 class="text-2xl sm:text-3xl font-bold text-text-primary mb-2">{blog.title}</h1>
			{#if blog.subtitle}
				<p class="text-base text-text-muted mb-4">{blog.subtitle}</p>
			{/if}

			<!-- Author -->
			<a href="/u/{blog.username}" class="flex items-center gap-3 mb-6">
				<img src={blog.userAvatarUrl} alt={blog.userDisplayName} class="w-10 h-10 rounded-full border-2 border-border" />
				<div>
					<div class="text-sm font-bold text-text-primary">{blog.userDisplayName}</div>
					<div class="text-xs text-text-muted">@{blog.username}</div>
				</div>
			</a>

			<!-- Tags -->
			{#if blog.tags.length > 0}
				<div class="flex flex-wrap gap-2 mb-6">
					{#each blog.tags as tag}
						<span class="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-accent-light rounded-lg border border-border">
							<Tag size={10} />
							{tag}
						</span>
					{/each}
				</div>
			{/if}

			<!-- YouTube video -->
			{#if youtubeId}
				<div class="mb-6 rounded-xl overflow-hidden border-2 border-border shadow-[2px_2px_0_var(--color-border)]">
					<div class="relative w-full" style="padding-top: 56.25%;">
						<iframe
							src="https://www.youtube.com/embed/{youtubeId}"
							title="YouTube video"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
							class="absolute inset-0 w-full h-full"
						></iframe>
					</div>
				</div>
			{/if}

			<!-- Content -->
			<BlogContentRenderer content={blog.content} />

			<!-- Footer -->
			<div class="mt-10 pt-6 border-t-2 border-border">
				<div class="text-center">
					<p class="text-sm text-text-muted mb-3">Made with TripStitch</p>
					<a
						href="/u/{blog.username}"
						class="inline-block px-4 py-2 text-sm font-bold border-2 border-border rounded-lg bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all"
					>
						View {blog.userDisplayName}'s profile
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}
