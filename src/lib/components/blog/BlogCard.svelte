<script lang="ts">
	import type { SharedBlog } from '$lib/types';
	import { Clock, MapPin, Eye } from 'phosphor-svelte';

	let {
		blog,
		showAuthor = true
	}: {
		blog: SharedBlog;
		/** Hide on single-author surfaces like the profile page */
		showAuthor?: boolean;
	} = $props();

	const date = blog.publishedAt
		? new Date(blog.publishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
		: new Date(blog.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
</script>

<a href="/blog/{blog.slug}" class="block bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[4px_4px_0_var(--color-border)] hover:shadow-[4px_4px_0_var(--color-accent)] hover:-translate-y-0.5 transition-all">
	<!-- Cover image or gradient -->
	<div class="h-32 relative overflow-hidden">
		{#if blog.coverImageUrl}
			<img src={blog.coverImageUrl} alt={blog.title} class="w-full h-full object-cover" />
		{:else}
			<div class="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
				<span class="text-3xl font-bold text-accent/30">{blog.title.charAt(0)}</span>
			</div>
		{/if}
		<!-- Category badge -->
		<div class="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold bg-card/90 backdrop-blur-sm rounded-lg border border-border capitalize">
			{blog.category}
		</div>
		<!-- Date badge -->
		<div class="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold bg-card/90 backdrop-blur-sm rounded-lg border border-border">
			{date}
		</div>
	</div>

	<!-- Content -->
	<div class="p-4">
		<h3 class="font-bold text-sm text-text-primary line-clamp-2">{blog.title}</h3>
		{#if blog.excerpt}
			<p class="text-xs text-text-muted mt-1 line-clamp-2">{blog.excerpt}</p>
		{/if}

		<!-- Stats -->
		<div class="flex items-center gap-3 mt-2.5 text-[11px] text-text-muted">
			<span class="flex items-center gap-1"><Clock size={11} /> {blog.readingTime} min</span>
			{#if blog.locations.length > 0}
				<span class="flex items-center gap-1"><MapPin size={11} /> {blog.locations.length}</span>
			{/if}
			{#if blog.reads}
				<span class="flex items-center gap-1"><Eye size={11} /> {blog.reads.toLocaleString()}</span>
			{/if}
		</div>

		<!-- Tags -->
		{#if blog.tags.length > 0}
			<div class="flex flex-wrap gap-1 mt-2">
				{#each blog.tags.slice(0, 3) as tag}
					<span class="px-1.5 py-0.5 text-[9px] font-bold bg-accent-light rounded-lg border border-border">{tag}</span>
				{/each}
				{#if blog.tags.length > 3}
					<span class="px-1.5 py-0.5 text-[9px] font-bold text-text-muted">+{blog.tags.length - 3}</span>
				{/if}
			</div>
		{/if}

		<!-- Author -->
		{#if showAuthor && blog.userDisplayName}
			<div class="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
				{#if blog.userAvatarUrl}
					<img src={blog.userAvatarUrl} alt="" referrerpolicy="no-referrer" class="w-5 h-5 rounded-full border border-border object-cover" />
				{:else}
					<div class="w-5 h-5 rounded-full border border-border bg-accent-light flex items-center justify-center text-[8px] font-bold text-accent">
						{blog.userDisplayName.charAt(0).toUpperCase()}
					</div>
				{/if}
				<span class="text-[11px] font-bold text-text-secondary truncate">{blog.userDisplayName}</span>
			</div>
		{/if}
	</div>
</a>
