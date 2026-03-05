<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import themeState from '$lib/state/theme.svelte';
	import { onMount } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		themeState.init();
	});
</script>

{@render children()}
<Toast />
