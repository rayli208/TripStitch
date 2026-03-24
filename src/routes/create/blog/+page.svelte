<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import tripsState from '$lib/state/trips.svelte';
	import blogsState from '$lib/state/blogs.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import BlogEditor from '$lib/components/blog/BlogEditor.svelte';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		tripsState.subscribe();
		blogsState.subscribe();
		return () => {
			tripsState.unsubscribe();
			blogsState.unsubscribe();
		};
	});

	function handleSaved(id: string, slug: string) {
		if (slug) {
			goto(`/blog/${slug}`);
		} else {
			goto('/trips');
		}
	}
</script>

<svelte:head><title>Write Blog | TripStitch</title></svelte:head>

<AppShell title="Write Blog" showBack onback={() => goto('/create')}>
	<BlogEditor onsaved={handleSaved} />
</AppShell>
