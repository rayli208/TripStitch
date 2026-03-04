<script lang="ts" module>
	// Shared state across both instances (button in header, modal outside)
	let showModal = $state(false);
	let autoShown = $state(false);
</script>

<script lang="ts">
	import Button from './Button.svelte';
	import pwaState from '$lib/state/pwa.svelte';
	import authState from '$lib/state/auth.svelte';

	let {
		button = true,
		modal = true
	}: {
		button?: boolean;
		modal?: boolean;
	} = $props();

	let dialogEl: HTMLDivElement | undefined;

	// Auto-show modal once after sign-in (if not dismissed and not standalone)
	$effect(() => {
		if (
			authState.isSignedIn &&
			!pwaState.isStandalone &&
			!pwaState.dismissed &&
			!autoShown
		) {
			showModal = true;
			autoShown = true;
		}
	});

	$effect(() => {
		if (showModal && modal && dialogEl) {
			const firstBtn = dialogEl.querySelector<HTMLElement>('button');
			firstBtn?.focus();
		}
	});

	function handleInstall() {
		pwaState.install();
		showModal = false;
		pwaState.dismiss();
	}

	function handleDismiss() {
		showModal = false;
		pwaState.dismiss();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showModal = false;
		}
	}
</script>

{#if !pwaState.isStandalone && button}
	<button
		class="text-text-muted hover:text-text-primary transition-colors p-1 cursor-pointer"
		onclick={() => (showModal = true)}
		aria-label="Install app"
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
			<path d="M12 8v6" />
			<path d="M9 13l3 3 3-3" />
		</svg>
	</button>
{/if}

{#if !pwaState.isStandalone && modal && showModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Install TripStitch"
		onkeydown={handleKeydown}
	>
		<div class="absolute inset-0" onclick={handleDismiss} role="presentation"></div>

		<div class="relative bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-xl border border-border" bind:this={dialogEl}>
			<!-- Gradient hero banner -->
			<div class="relative bg-gradient-to-br from-primary via-primary-medium to-accent px-6 pt-8 pb-10 text-center">
				<img src="/logo.png" alt="TripStitch" class="mx-auto w-16 h-16 rounded-2xl shadow-lg mb-4" />
				<h2 class="text-xl font-bold text-white mb-1">Get the TripStitch App</h2>
				<p class="text-white/80 text-sm">Your trips, one tap away</p>
			</div>

			<!-- Content -->
			<div class="px-6 pt-5 pb-6">
				{#if pwaState.canInstall}
					<!-- Feature benefits -->
					<div class="space-y-3 mb-6">
						<div class="flex items-start gap-3">
							<div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
								</svg>
							</div>
							<div>
								<p class="text-sm font-medium text-text-primary">Instant access</p>
								<p class="text-xs text-text-muted">Launch from your home screen — no browser needed</p>
							</div>
						</div>
						<div class="flex items-start gap-3">
							<div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
									<line x1="8" y1="21" x2="16" y2="21" />
									<line x1="12" y1="17" x2="12" y2="21" />
								</svg>
							</div>
							<div>
								<p class="text-sm font-medium text-text-primary">Fullscreen experience</p>
								<p class="text-xs text-text-muted">Immersive editing without browser toolbars</p>
							</div>
						</div>
						<div class="flex items-start gap-3">
							<div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
							</div>
							<div>
								<p class="text-sm font-medium text-text-primary">Works offline</p>
								<p class="text-xs text-text-muted">View your trips even without a connection</p>
							</div>
						</div>
					</div>

					<div class="flex flex-col gap-2 [&>*]:w-full [&_button]:w-full">
						<Button onclick={handleInstall}>Install TripStitch</Button>
						<Button variant="ghost" onclick={handleDismiss}>Maybe later</Button>
					</div>

				{:else if pwaState.isIOS}
					<p class="text-sm text-text-secondary mb-4">
						Add TripStitch to your home screen for instant, fullscreen access:
					</p>
					<div class="space-y-3 mb-6">
						<div class="flex items-center gap-3">
							<div class="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
							<p class="text-sm text-text-primary">
								Tap
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 inline -mt-0.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
									<polyline points="16 6 12 2 8 6" />
									<line x1="12" y1="2" x2="12" y2="15" />
								</svg>
								<strong>Share</strong> in the toolbar
							</p>
						</div>
						<div class="flex items-center gap-3">
							<div class="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
							<p class="text-sm text-text-primary">Scroll down, tap <strong>"Add to Home Screen"</strong></p>
						</div>
						<div class="flex items-center gap-3">
							<div class="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
							<p class="text-sm text-text-primary">Tap <strong>"Add"</strong> to confirm</p>
						</div>
					</div>
					<div class="[&_button]:w-full"><Button variant="secondary" onclick={handleDismiss}>Got it</Button></div>

				{:else}
					<p class="text-sm text-text-secondary mb-4">
						Add TripStitch to your home screen for instant, fullscreen access:
					</p>
					<div class="space-y-3 mb-6">
						<div class="flex items-center gap-3">
							<div class="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
							<p class="text-sm text-text-primary">Open your browser menu <strong class="text-lg leading-none">&#8942;</strong></p>
						</div>
						<div class="flex items-center gap-3">
							<div class="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
							<p class="text-sm text-text-primary">Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></p>
						</div>
					</div>
					<div class="[&_button]:w-full"><Button variant="secondary" onclick={handleDismiss}>Got it</Button></div>
				{/if}
			</div>
		</div>
	</div>
{/if}
