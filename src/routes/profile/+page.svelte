<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { FONTS, DEFAULT_FONT_ID, googleFontsUrl } from '$lib/constants/fonts';
	import { preloadFont } from '$lib/utils/fontLoader';
	import SkeletonProfile from '$lib/components/ui/SkeletonProfile.svelte';
	import type { GlobeStyle, MapDisplay } from '$lib/types';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) goto('/signin');
		else profileState.load();
	});

	// ── Form state ──
	let username = $state('');
	let displayName = $state('');
	let bio = $state('');
	let instagram = $state('');
	let youtube = $state('');
	let tiktok = $state('');
	let website = $state('');
	let primaryColor = $state('');
	let secondaryColor = $state('#0a0f1e');
	let preferredFontId = $state(DEFAULT_FONT_ID);
	let globeStyle = $state<GlobeStyle>('dark');
	let mapDisplay = $state<MapDisplay>('globe');

	// ── Section collapse state ──
	let brandingOpen = $state(true);
	let mapSectionOpen = $state(true);
	let socialsOpen = $state(true);

	const GLOBE_STYLES: { id: GlobeStyle; name: string }[] = [
		{ id: 'dark', name: 'Dark' },
		{ id: 'light', name: 'Light' },
		{ id: 'satellite', name: 'Satellite' },
		{ id: 'streets', name: 'Streets' },
		{ id: 'outdoor', name: 'Outdoor' },
		{ id: 'topo', name: 'Topo' },
		{ id: 'custom', name: 'Custom' }
	];

	const MAP_STYLES: { id: GlobeStyle; name: string }[] = [
		{ id: 'dark', name: 'Dark' },
		{ id: 'light', name: 'Light' },
		{ id: 'satellite', name: 'Satellite' },
		{ id: 'streets', name: 'Streets' },
		{ id: 'outdoor', name: 'Outdoor' },
		{ id: 'topo', name: 'Topo' }
	];

	let fontSearch = $state('');
	const selectedFontDef = $derived(FONTS.find(f => f.id === preferredFontId) ?? FONTS[0]);
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let logoUploading = $state(false);

	// ── Username availability ──
	let usernameStatus = $state<'idle' | 'checking' | 'available' | 'taken'>('idle');
	let usernameCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	function checkUsernameAvailability(value: string) {
		clearTimeout(usernameCheckTimeout);
		const cleaned = value.toLowerCase().trim();
		if (cleaned === profileState.profile?.username) {
			usernameStatus = 'idle';
			return;
		}
		if (!cleaned || !/^[a-z0-9_]{3,24}$/.test(cleaned)) {
			usernameStatus = 'idle';
			return;
		}
		usernameStatus = 'checking';
		usernameCheckTimeout = setTimeout(async () => {
			try {
				const uid = await profileState.resolveUsername(cleaned);
				usernameStatus = uid && uid !== authState.user?.id ? 'taken' : 'available';
			} catch {
				usernameStatus = 'idle';
			}
		}, 500);
	}

	// ── Validation ──
	const usernameClean = $derived((username ?? '').toLowerCase().trim());
	const isUsernameUnchanged = $derived(usernameClean === profileState.profile?.username);

	const usernameError = $derived.by(() => {
		if (!usernameClean) return 'Username is required';
		if (usernameClean.length < 3) return 'Must be at least 3 characters';
		if (usernameClean.length > 24) return 'Must be 24 characters or fewer';
		if (!/^[a-z0-9_]+$/.test(usernameClean)) return 'Only lowercase letters, numbers, and underscores';
		if (usernameStatus === 'taken') return 'Username is taken';
		return null;
	});

	const displayNameError = $derived(!(displayName ?? '').trim() ? 'Display name is required' : null);

	const websiteError = $derived.by(() => {
		const w = (website ?? '').trim();
		if (!w) return null;
		if (!/^https?:\/\/.+\..+/.test(w)) return 'Must start with http:// or https://';
		return null;
	});

	const canSave = $derived(
		!usernameError &&
		!displayNameError &&
		!websiteError &&
		usernameStatus !== 'checking' &&
		!saving
	);

	// ── Populate form when profile loads ──
	$effect(() => {
		if (profileState.profile) {
			const p = profileState.profile;
			username = p.username ?? '';
			displayName = p.displayName ?? '';
			bio = p.bio ?? '';
			instagram = p.socialLinks?.instagram ?? '';
			youtube = p.socialLinks?.youtube ?? '';
			tiktok = p.socialLinks?.tiktok ?? '';
			website = p.socialLinks?.website ?? '';
			primaryColor = (p.brandColors ?? [])[0] ?? '';
			secondaryColor = p.secondaryColor ?? '#0a0f1e';
			preferredFontId = p.preferredFontId ?? DEFAULT_FONT_ID;
			globeStyle = p.globeStyle ?? 'dark';
			mapDisplay = p.mapDisplay ?? 'globe';
		} else if (!profileState.loading && authState.user) {
			displayName = authState.user.name;
		}
	});

	async function handleSave() {
		saving = true;
		errorMsg = null;
		const result = await profileState.save({
			username,
			displayName,
			bio,
			socialLinks: {
				...(instagram && { instagram }),
				...(youtube && { youtube }),
				...(tiktok && { tiktok }),
				...(website && { website })
			},
			brandColors: primaryColor ? [primaryColor] : [],
			secondaryColor,
			preferredFontId,
			globeStyle,
			mapDisplay
		});
		saving = false;
		if (result.ok) {
			toast.success('Profile saved!');
			usernameStatus = 'idle';
		} else {
			errorMsg = result.error ?? 'Failed to save';
		}
	}

	let logoInput: HTMLInputElement;

	async function handleLogoUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		logoUploading = true;
		const result = await profileState.uploadLogo(file);
		logoUploading = false;
		if (!result.ok) errorMsg = result.error ?? 'Failed to upload logo';
	}

	async function handleRemoveLogo() {
		logoUploading = true;
		await profileState.removeLogo();
		logoUploading = false;
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={googleFontsUrl()} />
</svelte:head>

<AppShell title="Profile" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	{#if profileState.loading}
		<SkeletonProfile />
	{:else}
		<div class="max-w-lg space-y-2 pb-8">
			{#if errorMsg}
				<div class="bg-error-light border border-error text-error text-sm rounded-lg px-4 py-3">
					{errorMsg}
				</div>
			{/if}

			<!-- ═══════════ SECTION: Account ═══════════ -->
			<section class="bg-card border border-border rounded-xl p-5 space-y-4">
				<h2 class="text-base font-semibold text-text-primary">Account</h2>

				<div>
					<Input label="Username" placeholder="e.g. raytravel" bind:value={username} oninput={(e: Event) => checkUsernameAvailability((e.target as HTMLInputElement).value)} />
					<div class="flex items-center justify-between mt-1.5">
						<p class="text-xs text-text-muted">
							Your public URL: <span class="font-mono">/u/{username || '...'}</span>
						</p>
						{#if usernameStatus === 'checking'}
							<span class="w-3 h-3 border border-border border-t-accent rounded-full animate-spin inline-block flex-shrink-0"></span>
						{:else if usernameStatus === 'available'}
							<span class="text-xs text-success flex-shrink-0">Available</span>
						{:else if usernameStatus === 'taken'}
							<span class="text-xs text-error flex-shrink-0">Taken</span>
						{/if}
					</div>
					{#if usernameError && usernameClean && !isUsernameUnchanged}
						<p class="text-xs text-error mt-1">{usernameError}</p>
					{/if}
				</div>

				<div>
					<Input label="Display Name" placeholder="Your name" bind:value={displayName} />
					{#if displayNameError && displayName !== undefined}
						<p class="text-xs text-error mt-1">{displayNameError}</p>
					{/if}
				</div>

				<div>
					<label class="block text-sm font-medium text-text-secondary mb-1">Bio</label>
					<textarea
						bind:value={bio}
						placeholder="Tell people about your travels..."
						rows="2"
						class="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
					></textarea>
				</div>
			</section>

			<!-- ═══════════ SECTION: Branding ═══════════ -->
			<section class="bg-card border border-border rounded-xl overflow-hidden">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => brandingOpen = !brandingOpen}
				>
					<h2 class="text-base font-semibold text-text-primary">Branding</h2>
					<svg
						class="w-5 h-5 text-text-muted transition-transform {brandingOpen ? 'rotate-180' : ''}"
						fill="none" stroke="currentColor" viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				{#if brandingOpen}
					<div class="px-5 pb-5 space-y-5 border-t border-border pt-4">
						<!-- Logo -->
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Logo / Brand Mark</span>
							<p class="text-xs text-text-muted mb-2">Watermark on your title cards.</p>

							{#if profileState.profile?.logoUrl}
								<div class="flex items-center gap-3">
									<img
										src={profileState.profile.logoUrl}
										alt="Logo"
										class="w-14 h-14 rounded-lg object-contain bg-page border border-border p-1"
									/>
									<div class="flex gap-2">
										<button
											class="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
											onclick={() => logoInput.click()}
											disabled={logoUploading}
										>
											Replace
										</button>
										<button
											class="text-xs text-error hover:text-error transition-colors cursor-pointer"
											onclick={handleRemoveLogo}
											disabled={logoUploading}
										>
											Remove
										</button>
									</div>
									{#if logoUploading}
										<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></div>
									{/if}
								</div>
							{:else}
								<button
									class="w-full h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-text-muted hover:border-primary-light hover:text-text-secondary transition-colors cursor-pointer"
									onclick={() => logoInput.click()}
									disabled={logoUploading}
								>
									{#if logoUploading}
										<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></div>
									{:else}
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
										</svg>
										<span class="text-xs">Upload PNG, SVG, or JPG</span>
									{/if}
								</button>
							{/if}
							<input bind:this={logoInput} type="file" accept="image/*" class="hidden" onchange={handleLogoUpload} />
						</div>

						<!-- Brand Colors -->
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Colors</span>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<span class="block text-xs text-text-muted mb-1">Primary</span>
									<div class="flex items-center gap-2">
										<label class="cursor-pointer">
											<input type="color" bind:value={primaryColor} class="sr-only" />
											<div
												class="w-9 h-9 rounded-lg border-2 border-border hover:border-primary-light transition-colors"
												style="background-color: {primaryColor || '#FFFFFF'}"
											></div>
										</label>
										<span class="text-xs text-text-muted font-mono">{primaryColor || 'none'}</span>
										{#if primaryColor}
											<button
												class="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
												onclick={() => primaryColor = ''}
											>
												Clear
											</button>
										{/if}
									</div>
								</div>
								<div>
									<span class="block text-xs text-text-muted mb-1">Secondary</span>
									<div class="flex items-center gap-2">
										<label class="cursor-pointer">
											<input type="color" bind:value={secondaryColor} class="sr-only" />
											<div
												class="w-9 h-9 rounded-lg border-2 border-border hover:border-primary-light transition-colors"
												style="background-color: {secondaryColor}"
											></div>
										</label>
										<span class="text-xs text-text-muted font-mono">{secondaryColor}</span>
										<button
											class="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
											onclick={() => secondaryColor = '#0a0f1e'}
										>
											Reset
										</button>
									</div>
								</div>
							</div>
						</div>

						<!-- Font -->
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Default Font</span>
							<div
								class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-accent bg-accent-light mb-2"
								style="font-family: {selectedFontDef.family}, system-ui, sans-serif"
							>
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium text-text-primary">{selectedFontDef.name}</span>
									<span class="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-border/60">Selected</span>
								</div>
								<svg class="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<input
								type="text"
								placeholder="Search fonts..."
								bind:value={fontSearch}
								class="w-full rounded-lg border border-border bg-page px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent mb-2"
							/>
							<div class="max-h-40 overflow-y-auto rounded-lg border border-border bg-page">
								{#each FONTS.filter(f => f.id !== preferredFontId && f.name.toLowerCase().includes(fontSearch.toLowerCase())) as font (font.id)}
									<button
										class="w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer border-b border-border last:border-b-0 hover:bg-card-hover"
										style="font-family: {font.family}, system-ui, sans-serif"
										onclick={() => (preferredFontId = font.id)}
										onmouseenter={() => preloadFont(font.id)}
									>
										<span class="text-sm text-text-primary">{font.name}</span>
									</button>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</section>

			<!-- ═══════════ SECTION: Map Display ═══════════ -->
			<section class="bg-card border border-border rounded-xl overflow-hidden">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => mapSectionOpen = !mapSectionOpen}
				>
					<h2 class="text-base font-semibold text-text-primary">Map Display</h2>
					<svg
						class="w-5 h-5 text-text-muted transition-transform {mapSectionOpen ? 'rotate-180' : ''}"
						fill="none" stroke="currentColor" viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				{#if mapSectionOpen}
					<div class="px-5 pb-5 space-y-4 border-t border-border pt-4">
						<p class="text-xs text-text-muted">Choose how your trips are displayed on your profile page.</p>

						<!-- Globe / Map toggle -->
						<div class="grid grid-cols-2 gap-2">
							<button
								class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer {mapDisplay === 'globe' ? 'border-accent bg-accent-light' : 'border-border hover:border-primary-light'}"
								onclick={() => mapDisplay = 'globe'}
							>
								<svg class="w-8 h-8 {mapDisplay === 'globe' ? 'text-accent' : 'text-text-muted'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
									<circle cx="12" cy="12" r="10" />
									<ellipse cx="12" cy="12" rx="4" ry="10" />
									<path d="M2 12h20" />
								</svg>
								<div class="text-center">
									<p class="text-sm font-medium {mapDisplay === 'globe' ? 'text-text-primary' : 'text-text-muted'}">3D Globe</p>
									<p class="text-xs text-text-muted">Interactive rotating globe</p>
								</div>
							</button>

							<button
								class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer {mapDisplay === 'map' ? 'border-accent bg-accent-light' : 'border-border hover:border-primary-light'}"
								onclick={() => mapDisplay = 'map'}
							>
								<svg class="w-8 h-8 {mapDisplay === 'map' ? 'text-accent' : 'text-text-muted'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
								</svg>
								<div class="text-center">
									<p class="text-sm font-medium {mapDisplay === 'map' ? 'text-text-primary' : 'text-text-muted'}">Flat Map</p>
									<p class="text-xs text-text-muted">Zoomable map with routes</p>
								</div>
							</button>
						</div>

						<!-- Style picker -->
						<div>
							<span class="block text-xs text-text-muted mb-1.5">
								{mapDisplay === 'globe' ? 'Globe' : 'Map'} Style
							</span>
							<div class="flex flex-wrap gap-1.5">
								{#each (mapDisplay === 'globe' ? GLOBE_STYLES : MAP_STYLES) as style (style.id)}
									<button
										class="px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer {globeStyle === style.id ? 'bg-accent text-white' : 'bg-page border border-border text-text-secondary hover:border-primary-light'}"
										onclick={() => (globeStyle = style.id)}
									>
										{style.name}
									</button>
								{/each}
							</div>

							{#if mapDisplay === 'globe' && globeStyle === 'custom' && !primaryColor}
								<p class="text-xs text-warning mt-2">Set a primary color in Branding for the custom style to work.</p>
							{/if}
						</div>
					</div>
				{/if}
			</section>

			<!-- ═══════════ SECTION: Social Links ═══════════ -->
			<section class="bg-card border border-border rounded-xl overflow-hidden">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => socialsOpen = !socialsOpen}
				>
					<h2 class="text-base font-semibold text-text-primary">Social Links</h2>
					<svg
						class="w-5 h-5 text-text-muted transition-transform {socialsOpen ? 'rotate-180' : ''}"
						fill="none" stroke="currentColor" viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				{#if socialsOpen}
					<div class="px-5 pb-5 space-y-3 border-t border-border pt-4">
						<Input label="Instagram" placeholder="@username or full URL" bind:value={instagram} />
						<Input label="TikTok" placeholder="@username or full URL" bind:value={tiktok} />
						<Input label="YouTube" placeholder="Channel URL" bind:value={youtube} />
						<div>
							<Input label="Website" placeholder="https://yoursite.com" bind:value={website} />
							{#if websiteError}
								<p class="text-xs text-error mt-1">{websiteError}</p>
							{/if}
						</div>
					</div>
				{/if}
			</section>

			<!-- ═══════════ Actions ═══════════ -->
			<div class="flex gap-3 pt-2">
				<Button variant="primary" onclick={handleSave} disabled={!canSave}>
					{saving ? 'Saving...' : 'Save Profile'}
				</Button>
				<Button variant="secondary" onclick={async () => { await authState.signOut(); goto('/signin'); }}>
					Sign Out
				</Button>
			</div>
		</div>
	{/if}
</AppShell>
