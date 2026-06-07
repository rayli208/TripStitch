<script lang="ts">
	import type { BlogPost } from '$lib/types';
	import { PencilSimple, ShareNetwork, Trash, Clock, Article } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import blogsState from '$lib/state/blogs.svelte';
	import { getBlogUrl } from '$lib/services/blogService';
	import toastState from '$lib/state/toast.svelte';

	let { blog }: { blog: BlogPost } = $props();

	let confirmingDelete = $state(false);

	const date = blog.updatedAt
		? new Date(blog.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
		: '';

	const isPublished = $derived(blog.visibility === 'public');
	const statusLabel = $derived(
		blog.visibility === 'public' ? 'Published' : blog.visibility === 'unlisted' ? 'Unlisted' : blog.visibility === 'private' ? 'Private' : 'Draft'
	);

	function handleView() {
		if (blog.slug) {
			goto(`/blog/${blog.slug}`);
		}
	}

	function handleEdit() {
		if (blog.slug) {
			goto(`/blog/${blog.slug}/edit`);
		}
	}

	function handleShare() {
		if (!blog.slug) return;
		const url = getBlogUrl(blog.slug);
		if (navigator.share) {
			navigator.share({ title: blog.title, url });
		} else {
			navigator.clipboard.writeText(url);
			toastState.show('Link copied!');
		}
	}

	async function handleDelete() {
		confirmingDelete = false;
		await blogsState.deleteBlog(blog.id);
		toastState.show('Blog deleted');
	}
</script>

<div class="group rounded-2xl border-2 border-border bg-card overflow-hidden shadow-[3px_3px_0_var(--color-border)] hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all">
	<!-- Cover area -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative w-full h-32 sm:h-36 cursor-pointer overflow-hidden"
		onclick={handleView}
		title="View {blog.title || 'Untitled'}"
	>
		{#if blog.coverImageUrl}
			<img src={blog.coverImageUrl} alt="" class="absolute inset-0 w-full h-full object-cover" />
			<div class="absolute inset-0 bg-gradient-to-t from-overlay/40 to-transparent"></div>
		{:else}
			<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent-light to-warning-light border-b-2 border-border">
				<Article size={36} weight="duotone" class="text-accent/50" />
			</div>
		{/if}

		<!-- Status pill -->
		<span
			class="absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border-2 border-border
				{isPublished ? 'bg-accent text-white' : 'bg-warning text-black'}"
		>
			{statusLabel}
		</span>

		<!-- Category eyebrow -->
		{#if blog.category}
			<span class="absolute top-3 right-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border-2 border-border bg-card/90 text-text-secondary">
				{blog.category}
			</span>
		{/if}
	</div>

	<!-- Body -->
	<div class="p-4">
		<h3 class="font-extrabold text-text-primary text-base leading-tight truncate">{blog.title || 'Untitled'}</h3>
		<div class="flex items-center gap-2 mt-1 text-xs text-text-muted">
			<span class="inline-flex items-center gap-1"><Clock size={11} weight="bold" /> {blog.readingTime} min read</span>
			<span>·</span>
			<span class="truncate">{date}</span>
		</div>
		{#if blog.excerpt}
			<p class="text-xs text-text-muted mt-2 line-clamp-2">{blog.excerpt}</p>
		{/if}

		{#if confirmingDelete}
			<div class="mt-3 flex items-center gap-2">
				<span class="text-xs text-error flex-1">Delete this blog?</span>
				<button
					class="text-xs py-1.5 px-3 rounded-lg bg-error hover:bg-error/80 text-white font-bold transition-colors cursor-pointer"
					onclick={handleDelete}
				>
					Delete
				</button>
				<button
					class="text-xs py-1.5 px-3 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
					onclick={() => { confirmingDelete = false; }}
				>
					Cancel
				</button>
			</div>
		{:else}
			<div class="mt-3 flex gap-2">
				<button
					class="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-card border-2 border-border text-text-primary font-bold shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
					onclick={handleEdit}
				>
					<PencilSimple size={12} weight="bold" />
					Edit
				</button>
				{#if isPublished}
					<button
						class="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-card border-2 border-border text-text-primary font-bold shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
						onclick={handleShare}
						title="Copy share link"
					>
						<ShareNetwork size={12} weight="bold" />
						Share
					</button>
				{/if}
				<button
					class="inline-flex items-center justify-center w-8 text-text-muted hover:text-error rounded-lg border-2 border-border hover:border-error/40 transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)]"
					onclick={() => { confirmingDelete = true; }}
					title="Delete blog post"
					aria-label="Delete blog"
				>
					<Trash size={12} weight="bold" />
				</button>
			</div>
		{/if}
	</div>
</div>
