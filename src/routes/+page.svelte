<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import { ArrowRight, CaretDown, MapTrifold, Palette, Camera, Sparkle, FrameCorners, ShareNetwork, ShieldCheck, DeviceMobile, Timer, Download, Check, X, Crown, CloudArrowUp, PaintBrush, MapPin, Article, PencilLine } from 'phosphor-svelte';

	// Redirect authenticated users straight to dashboard
	$effect(() => {
		if (authState.loading) return;
		if (authState.isSignedIn) {
			goto('/create');
		}
	});

	let ready = $state(false);
	$effect(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});

	// Scroll-reveal: observe .reveal elements and add .revealed when in view
	$effect(() => {
		const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const elements = document.querySelectorAll('.reveal');
		if (prefersReduced) {
			elements.forEach(el => el.classList.add('revealed'));
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(e => {
				if (e.isIntersecting) {
					e.target.classList.add('revealed');
					observer.unobserve(e.target);
				}
			});
		}, { threshold: 0.1 });
		elements.forEach(el => observer.observe(el));
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>TripStitch - Turn Your Trips into Videos & Travel Blogs</title>
	<meta property="og:title" content="TripStitch - Turn Your Trips into Videos & Travel Blogs" />
	<meta property="og:description" content="Create cinematic travel videos with animated map transitions and write rich travel blogs with embedded locations, ratings, and routes — all in your browser." />
	<meta property="og:url" content="https://tripstitch.blog" />
	<meta name="twitter:title" content="TripStitch - Turn Your Trips into Videos & Travel Blogs" />
	<meta name="twitter:description" content="Create cinematic travel videos with animated map transitions and write rich travel blogs with embedded locations, ratings, and routes — all in your browser." />
	{@html `<script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"name": "TripStitch",
		"url": "https://tripstitch.blog",
		"description": "Turn your travel photos into cinematic videos with animated map transitions, and write rich travel blogs with embedded locations and routes — all in your browser.",
		"applicationCategory": "MultimediaApplication",
		"operatingSystem": "Any",
		"offers": [
			{ "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
			{ "@type": "Offer", "name": "Pro", "price": "0", "priceCurrency": "USD", "description": "Coming soon" }
		],
		"featureList": [
			"Animated map transitions",
			"Ken Burns photo animations",
			"Voice-over recording",
			"Custom branding and fonts",
			"9:16, 1:1, and 16:9 export",
			"Client-side video processing",
			"AI-powered captions and hashtags",
			"Map Overlay Studio for YouTube edits",
			"Travel blog editor with rich text",
			"Embedded location cards and routes"
		]
	})}</script>`}
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
	.delay-500 { animation-delay: 0.5s; }
	.fill-both { animation-fill-mode: both; }

	/* Scroll reveal — .revealed is added via JS, so use :global */
	:global(.reveal) {
		opacity: 0;
		transform: translateY(24px);
		transition: opacity 0.6s ease-out, transform 0.6s ease-out;
	}
	:global(.reveal.revealed) {
		opacity: 1;
		transform: translateY(0);
	}

	/* Route line */
	@keyframes route-draw {
		to { stroke-dashoffset: -200; }
	}
	.animate-route {
		stroke-dashoffset: 0;
		animation: route-draw 8s linear infinite;
	}

	/* Marquee */
	@keyframes marquee {
		from { transform: translateX(0); }
		to { transform: translateX(-50%); }
	}
	.animate-marquee {
		animation: marquee 30s linear infinite;
	}

	/* Grain overlay */
	.grain::after {
		content: '';
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
		opacity: 0.04;
		filter: url(#grain-filter);
		width: 100%;
		height: 100%;
	}

	/* Rotated feature cards */
	.feature-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
	.feature-card:nth-child(1) { transform: rotate(-1.5deg); }
	.feature-card:nth-child(2) { transform: rotate(1deg); }
	.feature-card:nth-child(3) { transform: rotate(-0.5deg); }
	.feature-card:nth-child(4) { transform: rotate(1.5deg); }
	.feature-card:nth-child(5) { transform: rotate(-1deg); }
	.feature-card:nth-child(6) { transform: rotate(0.5deg); }
	.feature-card:hover { transform: rotate(0) translateY(-4px); }

	/* Showcase cards */
	.showcase-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
	.showcase-card:nth-child(1) { transform: rotate(-1deg); }
	.showcase-card:nth-child(2) { transform: rotate(0.5deg); }
	.showcase-card:nth-child(3) { transform: rotate(-0.8deg); }
	.showcase-card:nth-child(4) { transform: rotate(1deg); }
	.showcase-card:hover { transform: rotate(0) translateY(-4px); }

	/* Phone mockup */
	.phone-mockup {
		transform: rotate(-2deg);
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.animate-marquee { animation: none; }
		.animate-route { animation: none; }
		:global(.reveal) { opacity: 1; transform: none; transition: none; }
		.feature-card,
		.feature-card:nth-child(n) { transform: none; }
		.feature-card:hover { transform: translateY(-4px); }
		.showcase-card,
		.showcase-card:nth-child(n),
		.showcase-card:nth-child(4) { transform: none; }
		.showcase-card:hover { transform: translateY(-4px); }
		.phone-mockup { transform: none; }
	}
</style>

<div class="grain min-h-screen bg-page">
	<!-- Noise filter for grain overlay -->
	<svg class="hidden">
		<filter id="grain-filter">
			<feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
		</filter>
	</svg>

	<!-- Hero -->
	<section class="relative overflow-hidden">
		<nav class="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
			<a href="/" aria-label="TripStitch home" class="flex items-center gap-2 {ready ? 'animate-fade-in fill-both' : 'opacity-0'}">
				<img src="/favicon-192.png" alt="" class="h-7" />
				<span class="text-xl font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
			</a>
			<a
				href="/signin"
				class="text-sm font-bold border-2 border-border px-4 py-2 rounded-lg shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all {ready ? 'animate-fade-in fill-both delay-200' : 'opacity-0'}"
			>
				Sign in
			</a>
		</nav>

		<!-- Animated route line -->
		<svg class="absolute inset-0 w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="none" aria-hidden="true">
			<path
				d="M-50,300 C200,100 400,500 600,250 S900,400 1250,200"
				fill="none"
				stroke="var(--color-accent)"
				stroke-width="3"
				stroke-dasharray="12 8"
				stroke-linecap="round"
				opacity="0.15"
				class="animate-route"
			/>
			<circle cx="200" cy="220" r="6" fill="var(--color-accent)" opacity="0.2" />
			<circle cx="600" cy="250" r="6" fill="var(--color-accent)" opacity="0.2" />
			<circle cx="950" cy="280" r="6" fill="var(--color-accent)" opacity="0.2" />
		</svg>

		<div class="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
			<div class="{ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
				<span class="inline-block px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase bg-warning text-black border-2 border-border shadow-[2px_2px_0_var(--color-border)] mb-6">
					Free to start — sign up in seconds
				</span>
			</div>

			<h1 class="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-text-primary leading-[1.1] {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
				Turn your trips into
				<span class="text-accent">
					videos & blogs
				</span>
			</h1>

			<p class="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed {ready ? 'animate-fade-up fill-both delay-300' : 'opacity-0'}">
				Create cinematic travel videos with animated map transitions, or write rich travel blogs
				with embedded locations and routes — all in your browser.
			</p>

			<div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 {ready ? 'animate-fade-up fill-both delay-400' : 'opacity-0'}">
				<a
					href="/signin"
					class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-accent text-white font-bold text-base border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
				>
					Get Started
					<ArrowRight size={20} weight="bold" />
				</a>
				<a
					href="#features"
					class="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
				>
					See how it works
					<CaretDown size={16} weight="bold" />
				</a>
			</div>

			<!-- Product preview mockup -->
			<div class="relative max-w-sm mx-auto mt-14 {ready ? 'animate-fade-up fill-both delay-500' : 'opacity-0'}">
				<div class="phone-mockup bg-card border-3 border-border rounded-2xl shadow-brutal-lg overflow-hidden">
					<!-- Phone notch -->
					<div class="bg-border h-6 flex items-center justify-center">
						<div class="w-16 h-3 bg-card rounded-b-lg"></div>
					</div>
					<!-- Mini map area -->
					<div class="relative bg-accent-light m-3 rounded-xl h-40 overflow-hidden">
						<svg class="w-full h-full" viewBox="0 0 300 160" aria-hidden="true">
							<!-- Route line -->
							<path d="M40,120 C80,40 150,100 200,50 S260,80 280,30" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-dasharray="8 5" stroke-linecap="round" />
							<!-- Pin dots -->
							<circle cx="40" cy="120" r="5" fill="var(--color-accent)" />
							<circle cx="150" cy="75" r="5" fill="var(--color-accent)" />
							<circle cx="280" cy="30" r="5" fill="var(--color-accent)" />
							<!-- Location labels -->
							<text x="40" y="138" font-size="8" fill="var(--color-text-secondary)" font-weight="bold">Paris</text>
							<text x="140" y="95" font-size="8" fill="var(--color-text-secondary)" font-weight="bold">Zurich</text>
							<text x="260" y="22" font-size="8" fill="var(--color-text-secondary)" font-weight="bold">Rome</text>
						</svg>
					</div>
					<!-- Photo placeholders -->
					<div class="flex gap-2 mx-3 mb-3">
						<div class="flex-1 h-16 rounded-lg bg-gradient-to-br from-sky-200 to-sky-300 border-2 border-border"></div>
						<div class="flex-1 h-16 rounded-lg bg-gradient-to-br from-amber-200 to-amber-300 border-2 border-border"></div>
						<div class="flex-1 h-16 rounded-lg bg-gradient-to-br from-rose-200 to-rose-300 border-2 border-border"></div>
					</div>
					<!-- Export bar -->
					<div class="mx-3 mb-3 bg-accent text-white text-xs font-bold py-2 px-4 rounded-lg border-2 border-border text-center">
						Export Video
					</div>
				</div>

				<!-- Floating badge -->
				<div class="absolute -top-3 -right-3 sm:-right-6 bg-warning text-black text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-border shadow-[2px_2px_0_var(--color-border)] rotate-3">
					100% in-browser
				</div>
			</div>
		</div>
	</section>

	<!-- Marquee ticker -->
	<div class="border-y-3 border-border bg-accent text-white overflow-hidden">
		<div class="flex animate-marquee whitespace-nowrap py-3">
			<span class="mx-4 text-sm font-bold tracking-widest uppercase">
				ANIMATED MAPS &bull; TRAVEL BLOGS &bull; VOICE-OVER &bull; AI CAPTIONS &bull; CUSTOM BRANDING &bull; LOCATION CARDS &bull; 100% IN-BROWSER &bull; KEN BURNS EFFECTS &bull; MULTIPLE ASPECT RATIOS &bull; MUSIC TRACKS &bull; PUBLIC PROFILES &bull;&nbsp;
			</span>
			<span class="mx-4 text-sm font-bold tracking-widest uppercase" aria-hidden="true">
				ANIMATED MAPS &bull; TRAVEL BLOGS &bull; VOICE-OVER &bull; AI CAPTIONS &bull; CUSTOM BRANDING &bull; LOCATION CARDS &bull; 100% IN-BROWSER &bull; KEN BURNS EFFECTS &bull; MULTIPLE ASPECT RATIOS &bull; MUSIC TRACKS &bull; PUBLIC PROFILES &bull;&nbsp;
			</span>
		</div>
	</div>

	<!-- Features -->
	<section id="features" class="max-w-6xl mx-auto px-6 py-20 sm:py-28">
		<div class="text-center mb-16 reveal">
			<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">Everything happens in your browser</h2>
			<p class="mt-4 text-text-secondary text-lg max-w-xl mx-auto">No uploads to external servers, no waiting, no subscriptions. Your media stays on your device.</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 reveal">
			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-warning border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<MapTrifold size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Animated Map Transitions</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Watch the map fly between your stops with smooth cinematic transitions. Choose from 6 map styles including satellite, outdoor, and dark.
				</p>
			</div>

			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-sky-300 border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<Palette size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Your Brand, Your Colors</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Pick custom colors that paint your route lines, pins, and overlays. Upload your logo as a watermark. Choose from premium fonts.
				</p>
			</div>

			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-accent-light border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<Camera size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Photos & Video Clips</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Drop in your travel photos and video clips. They get stitched between map transitions with Ken Burns, zoom, and pan animations.
				</p>
			</div>

			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-success-light border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<Sparkle size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">AI-Powered Captions</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					One tap and AI writes you a scroll-stopping caption with hashtags — optimized for Instagram, TikTok, YouTube, and Facebook. Post faster, get more eyes.
				</p>
			</div>

			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-warning border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<FrameCorners size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Any Aspect Ratio</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Export in 9:16 for Reels and TikTok, 1:1 for Instagram posts, or 16:9 for YouTube. One trip, every platform.
				</p>
			</div>

			<div class="feature-card group relative bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="icon-bounce w-12 h-12 rounded-xl bg-sky-300 border-2 border-border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
					<ShareNetwork size={24} weight="bold" />
				</div>
				<h3 class="text-lg font-bold text-text-primary mb-2">Share & Public Profile</h3>
				<p class="text-sm text-text-secondary leading-relaxed">
					Share trips and blogs via link, or build a public profile showcasing all your adventures — videos and articles side by side.
				</p>
			</div>
		</div>
	</section>

	<!-- Map Overlay Studio callout -->
	<section class="border-y-3 border-border bg-card">
		<div class="max-w-5xl mx-auto px-6 py-16 sm:py-20 reveal">
			<div class="flex flex-col md:flex-row items-center gap-10">
				<div class="flex-1">
					<div class="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-warning text-black text-xs font-bold border-2 border-border shadow-[2px_2px_0_var(--color-border)] mb-5">
						<MapPin size={14} weight="bold" />
						For YouTube Creators
					</div>
					<h2 class="text-2xl sm:text-3xl font-bold text-text-primary mb-4">Map Overlay Studio</h2>
					<p class="text-text-secondary leading-relaxed mb-6">
						Export a short map clip — with your brand colors — to drop straight into your travel edits as a corner overlay. Transparent WebM for instant compositing, seamless loops for long voiceovers, and a radius mode for neighborhoods and landmarks that don't have official boundaries. Works in DaVinci, Premiere, and CapCut.
					</p>
					<a
						href="/signin"
						class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-bold border-2 border-border shadow-[3px_3px_0_var(--color-border)] hover:shadow-[1px_1px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
					>
						Try It Free
						<ArrowRight size={18} weight="bold" />
					</a>
				</div>
				<div class="flex-shrink-0 w-64 sm:w-72">
					<!-- Spotlight mini-illustration -->
					<div class="bg-page border-3 border-border rounded-2xl shadow-brutal-lg overflow-hidden p-4">
						<div class="relative bg-accent-light rounded-xl h-36 flex items-center justify-center overflow-hidden">
							<svg class="w-full h-full" viewBox="0 0 240 144" aria-hidden="true">
								<!-- Town boundary shape -->
								<path d="M40,80 C50,30 90,20 130,35 S190,25 210,60 C220,90 200,120 160,115 S80,130 50,110 C35,100 30,90 40,80Z" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-dasharray="6 3" opacity="0.5" />
								<path d="M40,80 C50,30 90,20 130,35 S190,25 210,60 C220,90 200,120 160,115 S80,130 50,110 C35,100 30,90 40,80Z" fill="var(--color-accent)" fill-opacity="0.08" />
								<!-- Pin -->
								<circle cx="140" cy="72" r="8" fill="var(--color-accent)" />
								<circle cx="140" cy="72" r="4" fill="white" />
								<!-- Zoom indicator lines -->
								<line x1="148" y1="64" x2="170" y2="42" stroke="var(--color-accent)" stroke-width="1.5" opacity="0.3" />
								<line x1="132" y1="64" x2="110" y2="42" stroke="var(--color-accent)" stroke-width="1.5" opacity="0.3" />
							</svg>
						</div>
						<div class="mt-3 text-center">
							<p class="text-xs font-bold text-text-primary">The Sink</p>
							<p class="text-[10px] text-text-muted">1165 13th St, Boulder, CO</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Travel Blog callout -->
	<section class="border-y-3 border-border bg-page">
		<div class="max-w-5xl mx-auto px-6 py-16 sm:py-20 reveal">
			<div class="flex flex-col md:flex-row items-center gap-10">
				<div class="flex-1 md:order-2">
					<div class="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-success text-white text-xs font-bold border-2 border-border shadow-[2px_2px_0_var(--color-border)] mb-5">
						<Article size={14} weight="bold" />
						New
					</div>
					<h2 class="text-2xl sm:text-3xl font-bold text-text-primary mb-4">Travel Blogs</h2>
					<p class="text-text-secondary leading-relaxed mb-6">
						Write rich travel guides, listicles, and reviews with a full-featured editor. Embed location cards with ratings, prices, and tips — plus route timelines to map out your itineraries. Publish to your profile and share with anyone.
					</p>
					<a
						href="/signin"
						class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-bold border-2 border-border shadow-[3px_3px_0_var(--color-border)] hover:shadow-[1px_1px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
					>
						Start Writing
						<PencilLine size={18} weight="bold" />
					</a>
				</div>
				<div class="flex-shrink-0 w-64 sm:w-72 md:order-1">
					<!-- Blog mini-illustration -->
					<div class="bg-card border-3 border-border rounded-2xl shadow-brutal-lg overflow-hidden p-4">
						<!-- Title area -->
						<div class="mb-3">
							<div class="h-3 w-3/4 bg-text-primary/20 rounded mb-2"></div>
							<div class="h-2 w-1/2 bg-text-muted/20 rounded"></div>
						</div>
						<!-- Text lines -->
						<div class="space-y-1.5 mb-4">
							<div class="h-1.5 w-full bg-text-muted/10 rounded"></div>
							<div class="h-1.5 w-full bg-text-muted/10 rounded"></div>
							<div class="h-1.5 w-4/5 bg-text-muted/10 rounded"></div>
						</div>
						<!-- Location card mock -->
						<div class="bg-page border-2 border-border rounded-xl p-3 mb-3">
							<div class="flex items-center gap-2 mb-2">
								<div class="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center">
									<MapPin size={12} weight="bold" class="text-accent" />
								</div>
								<div>
									<div class="h-2 w-20 bg-text-primary/20 rounded"></div>
									<div class="flex gap-0.5 mt-1">
										<div class="w-2 h-2 rounded-full bg-warning"></div>
										<div class="w-2 h-2 rounded-full bg-warning"></div>
										<div class="w-2 h-2 rounded-full bg-warning"></div>
										<div class="w-2 h-2 rounded-full bg-warning"></div>
										<div class="w-2 h-2 rounded-full bg-text-muted/20"></div>
									</div>
								</div>
							</div>
							<div class="h-1.5 w-full bg-text-muted/10 rounded"></div>
						</div>
						<!-- More text -->
						<div class="space-y-1.5">
							<div class="h-1.5 w-full bg-text-muted/10 rounded"></div>
							<div class="h-1.5 w-3/5 bg-text-muted/10 rounded"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- How it works -->
	<section class="bg-warning/20 border-y-3 border-border">
		<div class="max-w-5xl mx-auto px-6 py-20 sm:py-28">
			<div class="text-center mb-16 reveal">
				<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">Three steps to your travel video</h2>
			</div>

			<div class="relative reveal">
				<!-- Connecting route line (desktop: horizontal, mobile: vertical) -->
				<svg class="hidden md:block absolute top-8 left-1/6 right-1/6 h-4 pointer-events-none" preserveAspectRatio="none" aria-hidden="true">
					<line x1="0" y1="50%" x2="100%" y2="50%" stroke="var(--color-accent)" stroke-width="2" stroke-dasharray="8 5" opacity="0.2" />
				</svg>
				<svg class="md:hidden absolute left-1/2 -translate-x-1/2 top-16 bottom-16 w-4 pointer-events-none" preserveAspectRatio="none" aria-hidden="true">
					<line x1="50%" y1="0" x2="50%" y2="100%" stroke="var(--color-accent)" stroke-width="2" stroke-dasharray="8 5" opacity="0.2" />
				</svg>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
					<div class="text-center">
						<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
							<Camera size={28} weight="bold" />
						</div>
						<h3 class="text-lg font-bold text-text-primary mb-2">Add your stops</h3>
						<p class="text-sm text-text-secondary">Search for each place you visited. Add photos or short video clips at each stop.</p>
					</div>

					<div class="text-center">
						<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
							<MapTrifold size={28} weight="bold" />
						</div>
						<h3 class="text-lg font-bold text-text-primary mb-2">Customize & preview</h3>
						<p class="text-sm text-text-secondary">Pick your map style, colors, and font. Reorder stops and choose transport modes.</p>
					</div>

					<div class="text-center">
						<div class="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center mx-auto mb-5 border-3 border-border shadow-[4px_4px_0_var(--color-border)]">
							<Download size={28} weight="bold" />
						</div>
						<h3 class="text-lg font-bold text-text-primary mb-2">Export & share</h3>
						<p class="text-sm text-text-secondary">Download your polished video or share it with an interactive map link.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Trust / Value strip -->
	<section class="border-y-3 border-border bg-card">
		<div class="max-w-5xl mx-auto px-6 py-12">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-8 reveal">
				<div class="text-center">
					<div class="w-10 h-10 rounded-lg bg-success-light border-2 border-border flex items-center justify-center mx-auto mb-3">
						<ShieldCheck size={20} weight="bold" />
					</div>
					<p class="font-bold text-text-primary text-sm">Free to Start</p>
					<p class="text-xs text-text-muted mt-1">No credit card required</p>
				</div>
				<div class="text-center">
					<div class="w-10 h-10 rounded-lg bg-accent-light border-2 border-border flex items-center justify-center mx-auto mb-3">
						<ShieldCheck size={20} weight="bold" />
					</div>
					<p class="font-bold text-text-primary text-sm">No Server Uploads</p>
					<p class="text-xs text-text-muted mt-1">Media stays on your device</p>
				</div>
				<div class="text-center">
					<div class="w-10 h-10 rounded-lg bg-warning-light border-2 border-border flex items-center justify-center mx-auto mb-3">
						<DeviceMobile size={20} weight="bold" />
					</div>
					<p class="font-bold text-text-primary text-sm">Works on Any Device</p>
					<p class="text-xs text-text-muted mt-1">Desktop, tablet, or phone</p>
				</div>
				<div class="text-center">
					<div class="w-10 h-10 rounded-lg bg-sky-100 border-2 border-border flex items-center justify-center mx-auto mb-3">
						<Timer size={20} weight="bold" />
					</div>
					<p class="font-bold text-text-primary text-sm">Ready in Minutes</p>
					<p class="text-xs text-text-muted mt-1">From photos to video, fast</p>
				</div>
			</div>
		</div>
	</section>

	<!-- What You Can Create showcase -->
	<section class="max-w-5xl mx-auto px-6 py-20 sm:py-28">
		<div class="text-center mb-16 reveal">
			<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">What you can create</h2>
			<p class="mt-4 text-text-secondary text-lg max-w-xl mx-auto">From trip videos to travel blogs — TripStitch handles it all.</p>
		</div>

		<div class="relative">
		<div class="flex md:grid md:grid-cols-4 gap-6 overflow-x-auto md:overflow-visible pb-4 md:pb-0 snap-x snap-mandatory reveal scrollbar-hide">
			<!-- Card 1 -->
			<div class="showcase-card flex-shrink-0 w-72 md:w-auto snap-start bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="h-3 bg-accent"></div>
				<div class="p-5">
					<h3 class="font-bold text-text-primary mb-3">Weekend in Paris</h3>
					<!-- Route visualization -->
					<div class="flex items-center gap-1 mb-4">
						<div class="w-3 h-3 rounded-full bg-accent border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-accent/40"></div>
						<div class="w-3 h-3 rounded-full bg-accent border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-accent/40"></div>
						<div class="w-3 h-3 rounded-full bg-accent border-2 border-border"></div>
					</div>
					<div class="flex flex-wrap gap-1.5">
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-warning-light border border-border">3 stops</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-light border border-border">Dark map</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success-light border border-border">Music</span>
					</div>
				</div>
			</div>

			<!-- Card 2 -->
			<div class="showcase-card flex-shrink-0 w-72 md:w-auto snap-start bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="h-3 bg-warning"></div>
				<div class="p-5">
					<h3 class="font-bold text-text-primary mb-3">Pacific Coast Highway</h3>
					<div class="flex items-center gap-1 mb-4">
						<div class="w-3 h-3 rounded-full bg-warning border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-warning/40"></div>
						<div class="w-3 h-3 rounded-full bg-warning border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-warning/40"></div>
						<div class="w-3 h-3 rounded-full bg-warning border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-warning/40"></div>
						<div class="w-3 h-3 rounded-full bg-warning border-2 border-border"></div>
					</div>
					<div class="flex flex-wrap gap-1.5">
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-warning-light border border-border">6 stops</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-light border border-border">Satellite map</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success-light border border-border">Voice-over</span>
					</div>
				</div>
			</div>

			<!-- Card 3 -->
			<div class="showcase-card flex-shrink-0 w-72 md:w-auto snap-start bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="h-3 bg-success"></div>
				<div class="p-5">
					<h3 class="font-bold text-text-primary mb-3">Backpacking Southeast Asia</h3>
					<div class="flex items-center gap-1 mb-4">
						<div class="w-3 h-3 rounded-full bg-success border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-success/40"></div>
						<div class="w-3 h-3 rounded-full bg-success border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-success/40"></div>
						<div class="w-3 h-3 rounded-full bg-success border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-success/40"></div>
						<div class="w-3 h-3 rounded-full bg-success border-2 border-border"></div>
						<div class="flex-1 border-t-2 border-dashed border-success/40"></div>
						<div class="w-3 h-3 rounded-full bg-success border-2 border-border"></div>
					</div>
					<div class="flex flex-wrap gap-1.5">
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-warning-light border border-border">8 stops</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-light border border-border">Outdoor map</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success-light border border-border">AI captions</span>
					</div>
				</div>
			</div>

			<!-- Card 4 — Blog -->
			<div class="showcase-card flex-shrink-0 w-72 md:w-auto snap-start bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[4px_4px_0_var(--color-border)] hover:shadow-[6px_6px_0_var(--color-accent)] transition-all duration-300">
				<div class="h-3 bg-sky-400"></div>
				<div class="p-5">
					<h3 class="font-bold text-text-primary mb-3">Top 10 Bars in Lisbon</h3>
					<!-- Blog visualization -->
					<div class="space-y-2 mb-4">
						<div class="h-1.5 w-full bg-text-muted/15 rounded"></div>
						<div class="h-1.5 w-full bg-text-muted/15 rounded"></div>
						<div class="flex items-center gap-2 py-1.5 px-2 bg-page rounded-lg border border-border">
							<MapPin size={10} weight="bold" class="text-accent flex-shrink-0" />
							<div class="h-1.5 w-16 bg-text-primary/20 rounded"></div>
							<div class="flex gap-0.5 ml-auto">
								<div class="w-1.5 h-1.5 rounded-full bg-warning"></div>
								<div class="w-1.5 h-1.5 rounded-full bg-warning"></div>
								<div class="w-1.5 h-1.5 rounded-full bg-warning"></div>
								<div class="w-1.5 h-1.5 rounded-full bg-warning"></div>
								<div class="w-1.5 h-1.5 rounded-full bg-text-muted/20"></div>
							</div>
						</div>
						<div class="h-1.5 w-4/5 bg-text-muted/15 rounded"></div>
					</div>
					<div class="flex flex-wrap gap-1.5">
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-warning-light border border-border">Listicle</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-light border border-border">10 locations</span>
						<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success-light border border-border">5 min read</span>
					</div>
				</div>
			</div>
		</div>
		<!-- Scroll indicators (mobile only) -->
		<div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-page to-transparent md:hidden"></div>
		<div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-page to-transparent md:hidden"></div>
	</div>
	</section>

	<!-- Pricing -->
	<section id="pricing" class="bg-warning/20 border-y-3 border-border">
		<div class="max-w-5xl mx-auto px-6 py-20 sm:py-28">
			<div class="text-center mb-16 reveal">
				<h2 class="text-3xl sm:text-4xl font-bold text-text-primary">Simple pricing, powerful results</h2>
				<p class="mt-4 text-text-secondary text-lg max-w-xl mx-auto">Start free, upgrade when you're ready to go bigger.</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto reveal">
				<!-- Free Tier -->
				<div class="bg-card border-2 border-border rounded-2xl p-7 shadow-[4px_4px_0_var(--color-border)] flex flex-col">
					<div class="mb-6">
						<h3 class="text-xl font-bold text-text-primary mb-1">Free</h3>
						<p class="text-3xl font-extrabold text-text-primary">$0<span class="text-base font-normal text-text-muted">/forever</span></p>
						<p class="text-sm text-text-secondary mt-2">Everything you need for quick trip videos.</p>
					</div>

					<ul class="space-y-3 mb-8 flex-1">
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span>Up to <strong>8 locations</strong> per trip (5 on mobile)</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span>Up to <strong>5 clips</strong> per location (3 on mobile)</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span><strong>1080p</strong> export (720p on mobile)</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span>All 6 map styles</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span>AI-powered captions</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
							<span>Music library</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-muted">
							<X size={18} weight="bold" class="text-text-muted flex-shrink-0 mt-0.5" />
							<span>TripStitch watermark included</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-muted">
							<X size={18} weight="bold" class="text-text-muted flex-shrink-0 mt-0.5" />
							<span>No custom logo or branding</span>
						</li>
					</ul>

					<a
						href="/signin"
						class="block text-center px-6 py-3 rounded-xl font-bold border-2 border-border shadow-[3px_3px_0_var(--color-border)] hover:shadow-[1px_1px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
					>
						Get Started Free
					</a>
				</div>

				<!-- Pro Tier -->
				<div class="relative bg-card border-3 border-accent rounded-2xl p-7 shadow-[4px_4px_0_var(--color-accent)] flex flex-col">
					<div class="absolute -top-3 right-6 bg-accent text-white text-xs font-bold px-3 py-1 rounded-lg border-2 border-border shadow-[2px_2px_0_var(--color-border)] flex items-center gap-1">
						<Crown size={14} weight="fill" />
						Popular
					</div>

					<div class="mb-6">
						<h3 class="text-xl font-bold text-text-primary mb-1">Pro</h3>
						<p class="text-3xl font-extrabold text-accent">$5.99<span class="text-base font-normal text-text-muted">/month</span></p>
						<p class="text-sm text-text-secondary mt-2">For creators who want the full experience.</p>
					</div>

					<ul class="space-y-3 mb-8 flex-1">
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span><strong>Unlimited locations</strong> per trip</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span><strong>Unlimited clips</strong> per location</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span>Up to <strong>4K</strong> export resolution</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<PaintBrush size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span><strong>Custom branding</strong> — your logo, your colors, no watermark</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<CloudArrowUp size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span><strong>Cloud export</strong> — process videos on our servers, faster and more reliable</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<CloudArrowUp size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span><strong>Video hosting</strong> — we host your exported videos so you can share them anywhere</span>
						</li>
						<li class="flex items-start gap-2.5 text-sm text-text-secondary">
							<Check size={18} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
							<span>Everything in Free</span>
						</li>
					</ul>

					<a
						href="/pricing"
						class="block w-full text-center px-6 py-3 rounded-xl bg-accent text-white font-bold border-2 border-border shadow-[3px_3px_0_var(--color-border)] hover:shadow-[1px_1px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
					>
						Upgrade to Pro
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="max-w-4xl mx-auto px-6 py-24 sm:py-32 text-center reveal">
		<h2 class="text-3xl sm:text-5xl font-bold text-text-primary mb-6">
			Ready to stitch your next trip?
		</h2>
		<p class="text-lg text-text-secondary mb-10 max-w-lg mx-auto">
			Start for free — no credit card, no commitment. Create your first travel video or blog in minutes.
		</p>
		<a
			href="/signin"
			class="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-accent text-white font-bold text-lg border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
		>
			Start Creating Free
			<ArrowRight size={20} weight="bold" />
		</a>
	</section>

	<!-- Footer -->
	<footer class="border-t-3 border-border">
		<div class="max-w-6xl mx-auto px-6 py-12">
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
				<!-- Logo + description -->
				<div>
					<a href="/" aria-label="TripStitch home" class="flex items-center gap-1.5 mb-3">
						<img src="/favicon-192.png" alt="" class="h-5" />
						<span class="text-base font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
					</a>
					<p class="text-sm text-text-muted leading-relaxed">
						Turn your travel photos into cinematic videos and write rich travel blogs — all in your browser.
					</p>
				</div>

				<!-- Product links -->
				<div>
					<h4 class="font-bold text-text-primary text-sm mb-3">Product</h4>
					<ul class="space-y-2 text-sm text-text-secondary">
						<li><a href="/signin" class="hover:text-accent transition-colors">Get Started</a></li>
						<li><a href="#features" class="hover:text-accent transition-colors">Features</a></li>
						<li><a href="#pricing" class="hover:text-accent transition-colors">Pricing</a></li>
						<li><a href="/explore" class="hover:text-accent transition-colors">Explore Trips</a></li>
						<li><a href="/signin" class="hover:text-accent transition-colors">Write a Blog</a></li>
					</ul>
				</div>

				<!-- Info links -->
				<div>
					<h4 class="font-bold text-text-primary text-sm mb-3">Info</h4>
					<ul class="space-y-2 text-sm text-text-secondary">
						<li><a href="/signin" class="hover:text-accent transition-colors">Sign In</a></li>
						<li><a href="/signin" class="hover:text-accent transition-colors">Create Account</a></li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Bottom bar -->
		<div class="border-t-2 border-border">
			<div class="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
				<p class="text-xs text-text-muted">&copy; {new Date().getFullYear()} TripStitch. All rights reserved.</p>
				<p class="text-xs text-text-muted">Free tier processes everything on your device. Pro tier adds optional cloud export.</p>
			</div>
		</div>
	</footer>
</div>
