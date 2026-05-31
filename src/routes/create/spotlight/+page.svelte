<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import SpotlightCreator from '$lib/components/spotlight/SpotlightCreator.svelte';
	import { SignOut } from 'phosphor-svelte';

	let isExporting = $state(false);

	function handleExit() {
		if (isExporting && !confirm('Export in progress. Leave this page?')) return;
		goto('/create');
	}

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

<svelte:head><title>YouTube Map Overlay Studio | TripStitch</title></svelte:head>

<AppShell
	title="Map Overlay Studio"
	showBottomNav
	logoUrl={profileState.profile?.logoUrl}
	subtitle="Map Overlay Studio · Pro"
>
	{#snippet desktopActions()}
		<button
			class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-card text-text-primary text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)] disabled:opacity-50"
			onclick={handleExit}
			disabled={isExporting}
		>
			<SignOut size={14} weight="bold" />
			Exit
		</button>
	{/snippet}

	<SpotlightCreator
		accentColor={profileState.profile?.brandColors?.[0] ?? '#FFFFFF'}
		secondaryColor={profileState.profile?.secondaryColor ?? '#0a0f1e'}
		fontId={profileState.profile?.preferredFontId ?? 'inter'}
		brandColors={profileState.profile?.brandColors ?? []}
		logoUrl={profileState.profile?.logoUrl ?? null}
		onexportchange={(v) => isExporting = v}
	/>
</AppShell>
