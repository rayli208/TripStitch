<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';

	// Redirect authenticated users straight to dashboard
	$effect(() => {
		if (authState.loading) return;
		if (authState.isSignedIn) {
			goto('/create');
		}
	});

	let ready = $state(false);
	$effect(() => {
		// Small delay so the entrance animations feel intentional
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});
</script>

<svelte:head>
	<title>TripStitch - Turn Your Trips into Cinematic Videos</title>
</svelte:head>

<style>
	@keyframes fade-up {
		from { opacity: 0; transform: translateY(30px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	.animate-fade-up { animation: fade-up 0.8s ease-out forwards; }
	.animate-fade-in { animation: fade-in 1s ease-out forwards; }
	.delay-100 { animation-delay: 0.1s; }
	.delay-200 { animation-delay: 0.2s; }
	.delay-300 { animation-delay: 0.3s; }
	.delay-400 { animation-delay: 0.4s; }
	.fill-both { animation-fill-mode: both; }
</style>

<div class="min-h-screen bg-page">
	<!-- Hero -->
	<section class="relative overflow-hidden">
		<nav class="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
			<img src="/logo.png" alt="TripStitch" class="h-8 {ready ? 'animate-fade-in fill-both' : 'opacity-0'}" />
			<a
				href="/signin"
				class="text-sm font-bold border-2 border-border px-4 py-2 rounded-lg shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all {ready ? 'animate-fade-in fill-both delay-200' : 'opacity-0'}"
			>
				Sign in
			</a>
		</nav>

		<div class="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 sm:pt-24 sm:pb-32 text-center">
			<div class="{ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
				<span class="inline-block px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase bg-warning text-black border-2 border-border shadow-[2px_2px_0_var(--color-border)] mb-6">
					Free & open — no watermarks
				</span>
			</div>

			<h1 class="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-text-primary leading-[1.1] {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
				Turn your trips into
				<span class="text-accent">
					cinematic videos
				</span>
			</h1>

			<p class="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed {ready ? 'animate-fade-up fill-both delay-300' : 'opacity-0'}">
				Drop your photos, pick your stops on a map, and TripStitch stitches together
				a polished travel video with animated map transitions — all in your browser.
			</p>

			<div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 {ready ? 'animate-fade-up fill-both delay-400' : 'opacity-0'}">
				<a
					href="/signin"
					class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-accent text-white font-bold text-base border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
				>
					Get Started
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</a>
				<a
					href="#features"
					class="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
				>
					See how it works
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</a>
			</div>
		</div>
	</section>

	<!-- Features -->
	<section id="features" class="max-w-6xl mx-auto px-6 py-20 sm:py-28">
		<div class="text-center mb-16">
			<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">Everything happens in your browser</h2>
			<p class="mt-4 text-text-secondary text-lg max-w-xl mx-auto">No uploads, no waiting for servers, no accounts required to try. Your media stays on your device.</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<!-- Feature 1 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-warning border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					🗺️
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Animated Map Transitions</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Watch the map fly between your stops with smooth cinematic transitions. Choose from 6 map styles including satellite, outdoor, and dark.
				</p>
			</div>

			<!-- Feature 2 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-sky-300 border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					🎨
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Your Brand, Your Colors</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Pick custom colors that paint your route lines, pins, and overlays. Upload your logo as a watermark. Choose from premium fonts.
				</p>
			</div>

			<!-- Feature 3 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-accent-light border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					📸
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Photos & Video Clips</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Drop in your travel photos and video clips. They get stitched between map transitions with Ken Burns, zoom, and pan animations.
				</p>
			</div>

			<!-- Feature 4 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-success-light border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					🎙️
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Voice Over Recording</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Record narration directly over your video with a segmented timeline showing exactly what's on screen. Merge it in one click.
				</p>
			</div>

			<!-- Feature 5 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-warning border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					📐
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Any Aspect Ratio</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Export in 9:16 for Reels and TikTok, 1:1 for Instagram posts, or 16:9 for YouTube. One trip, every platform.
				</p>
			</div>

			<!-- Feature 6 -->
			<div class="group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] hover:-translate-y-1 transition-all duration-300">
				<div class="w-12 h-12 rounded-xl bg-sky-300 border-2 border-border flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform">
					🔗
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Share & Public Profile</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Share individual trips via link with an interactive map, or build a public profile showcasing all your adventures.
				</p>
			</div>
		</div>
	</section>

	<!-- How it works -->
	<section class="bg-warning/20 border-y-3 border-border">
		<div class="max-w-5xl mx-auto px-6 py-20 sm:py-28">
			<div class="text-center mb-16">
				<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">Three steps to your travel video</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-10">
				<div class="text-center">
					<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center text-2xl font-bold mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
						1
					</div>
					<h3 class="text-lg font-bold text-text-primary mb-2">Add your stops</h3>
					<p class="text-sm text-text-secondary">Search for each place you visited. Add photos or short video clips at each stop.</p>
				</div>

				<div class="text-center">
					<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center text-2xl font-bold mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
						2
					</div>
					<h3 class="text-lg font-bold text-text-primary mb-2">Customize & preview</h3>
					<p class="text-sm text-text-secondary">Pick your map style, colors, and font. Reorder stops and choose transport modes.</p>
				</div>

				<div class="text-center">
					<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center text-2xl font-bold mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
						3
					</div>
					<h3 class="text-lg font-bold text-text-primary mb-2">Export & share</h3>
					<p class="text-sm text-text-secondary">Download your polished video or share it with an interactive map link.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="max-w-4xl mx-auto px-6 py-24 sm:py-32 text-center">
		<h2 class="text-3xl sm:text-5xl font-bold text-text-primary mb-6">
			Ready to stitch your next trip?
		</h2>
		<p class="text-lg text-text-secondary mb-10 max-w-lg mx-auto">
			Sign in with Google and create your first video in minutes. It's completely free.
		</p>
		<a
			href="/signin"
			class="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-accent text-white font-bold text-lg border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
		>
			Start Creating
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
			</svg>
		</a>
	</section>

	<!-- Footer -->
	<footer class="border-t-3 border-border">
		<div class="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<img src="/logo.png" alt="TripStitch" class="h-6 opacity-60" />
			</div>
			<p class="text-sm text-text-muted">
				Built for travelers. No server-side processing — your media never leaves your device.
			</p>
		</div>
	</footer>
</div>
