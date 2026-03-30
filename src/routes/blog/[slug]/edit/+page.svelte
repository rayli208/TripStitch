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
	import { fetchBlogBySlug } from '$lib/services/blogService';
	import type { SharedBlog } from '$lib/types';

	const slug = page.params.slug!;
	let blog = $state<SharedBlog | null>(null);
	let loading = $state(true);

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
		loadBlog();
		return () => {
			tripsState.unsubscribe();
			blogsState.unsubscribe();
		};
	});

	async function loadBlog() {
		loading = true;
		blog = await fetchBlogBySlug(slug);
		loading = false;
		if (!blog || blog.userId !== authState.user?.id) {
			goto('/trips');
		}
	}

	function handleSaved(id: string, savedSlug: string) {
		if (savedSlug) {
			goto(`/blog/${savedSlug}`);
		} else {
			goto('/trips');
		}
	}
</script>

<svelte:head><title>Edit Blog | TripStitch</title></svelte:head>

<AppShell title="Edit Blog" showBack onback={() => goto('/trips')}>
	{#if loading}
		<div class="flex justify-center py-20">
			<Spinner size="lg" />
		</div>
	{:else if blog}
		<BlogEditor
			blogId={blog.id}
			initial={{
				title: blog.title,
				subtitle: blog.subtitle,
				category: blog.category,
				tags: blog.tags,
				visibility: blog.visibility,
				content: blog.content,
				linkedTripIds: blog.linkedTripIds,
				youtubeUrl: blog.youtubeUrl,
				coverImageUrl: blog.coverImageUrl
			}}
			onsaved={handleSaved}
		/>
	{/if}
</AppShell>
