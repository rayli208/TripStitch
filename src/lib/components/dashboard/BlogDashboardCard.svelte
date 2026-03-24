<script lang="ts">
	import type { BlogPost } from '$lib/types';
	import { PencilSimple, ShareNetwork, Trash, Clock, Copy } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import blogsState from '$lib/state/blogs.svelte';
	import { getBlogUrl } from '$lib/services/blogService';
	import toastState from '$lib/state/toast.svelte';

	let { blog }: { blog: BlogPost } = $props();

	let confirmingDelete = $state(false);

	const date = blog.updatedAt
		? new Date(blog.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		: '';

	const visibilityColors: Record<string, string> = {
		draft: 'bg-primary-light text-text-secondary',
		public: 'bg-success-light text-success',
		unlisted: 'bg-warning-light text-warning',
		private: 'bg-error-light text-error'
	};

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

<div class="bg-card border-2 border-border rounded-xl p-4 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[4px_4px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all">
	<div class="flex items-start justify-between gap-3 mb-3">
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 mb-1">
				<span class="px-1.5 py-0.5 text-[10px] font-bold rounded {visibilityColors[blog.visibility] ?? ''}">{blog.visibility}</span>
				<span class="text-[10px] text-text-muted capitalize">{blog.category}</span>
			</div>
			<h3 class="font-bold text-sm text-text-primary truncate">{blog.title || 'Untitled'}</h3>
			{#if blog.excerpt}
				<p class="text-xs text-text-muted mt-0.5 line-clamp-1">{blog.excerpt}</p>
			{/if}
			<div class="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
				<span class="flex items-center gap-1"><Clock size={11} /> {blog.readingTime} min</span>
				<span>{date}</span>
			</div>
		</div>
	</div>

	{#if confirmingDelete}
		<div class="flex items-center gap-2">
			<span class="text-sm text-error flex-1">Delete this blog post?</span>
			<button
				class="text-sm py-2 px-4 rounded-lg bg-error hover:bg-error/80 text-white transition-colors cursor-pointer"
				onclick={handleDelete}
			>
				Delete
			</button>
			<button
				class="text-sm py-2 px-4 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
				onclick={() => { confirmingDelete = false; }}
			>
				Cancel
			</button>
		</div>
	{:else}
		<div class="flex gap-2">
			<button
				class="flex-1 text-sm py-2 rounded-lg bg-accent text-white font-bold border-2 border-border shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
				onclick={handleEdit}
			>
				Edit
			</button>
			{#if blog.visibility === 'public'}
				<button
					class="text-sm py-2 px-3 rounded-lg bg-card border-2 border-border text-text-primary shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
					onclick={handleShare}
					title="Copy share link"
				>
					<Copy size={16} weight="bold" />
				</button>
			{/if}
			<button
				class="text-sm py-2 px-3 rounded-lg bg-card border-2 border-border text-text-primary shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
				onclick={() => { confirmingDelete = true; }}
				title="Delete blog post"
			>
				<Trash size={16} weight="bold" />
			</button>
		</div>
	{/if}
</div>
