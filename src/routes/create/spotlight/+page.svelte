<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import SpotlightCreator from '$lib/components/spotlight/SpotlightCreator.svelte';

	let isExporting = $state(false);

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
		profileState.load();
	});

	// Navigation guard during export
	$effect(() => {
		if (isExporting) {
			const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	beforeNavigate(({ cancel }) => {
		if (isExporting) {
			if (!confirm('Export in progress. Leave this page?')) {
				cancel();
			}
		}
	});
</script>

<svelte:head><title>Location Spotlight | TripStitch</title></svelte:head>

<AppShell title="Location Spotlight" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	<SpotlightCreator
		accentColor={profileState.profile?.brandColors?.[0] ?? '#FFFFFF'}
		secondaryColor={profileState.profile?.secondaryColor ?? '#0a0f1e'}
		fontId={profileState.profile?.preferredFontId ?? 'inter'}
		brandColors={profileState.profile?.brandColors ?? []}
		logoUrl={profileState.profile?.logoUrl ?? null}
		onexportchange={(v) => isExporting = v}
	/>
</AppShell>
