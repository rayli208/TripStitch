<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import Toast from '$lib/components/ui/Toast.svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<Toast />
