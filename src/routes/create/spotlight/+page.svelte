<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import SpotlightCreator from '$lib/components/spotlight/SpotlightCreator.svelte';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) {
			goto('/signin');
		} else {
			profileState.load();
		}
	});
</script>

<AppShell title="Location Spotlight" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<SpotlightCreator
		accentColor={profileState.profile?.brandColors?.[0] ?? '#FFFFFF'}
		secondaryColor={profileState.profile?.secondaryColor ?? '#0a0f1e'}
		fontId={profileState.profile?.preferredFontId ?? 'inter'}
		brandColors={profileState.profile?.brandColors ?? []}
		logoUrl={profileState.profile?.logoUrl ?? null}
	/>
</AppShell>
