<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import { FONTS, DEFAULT_FONT_ID, googleFontsUrl } from '$lib/constants/fonts';
	import { preloadFont } from '$lib/utils/fontLoader';
	import SkeletonProfile from '$lib/components/ui/SkeletonProfile.svelte';
	import themeState from '$lib/state/theme.svelte';
	import { CaretDown, Check, Upload, Sun, Moon, Desktop, Globe, MapTrifold, Camera, Trash, Warning, Crown, Lock, CreditCard, CalendarBlank } from 'phosphor-svelte';
	import tripsState from '$lib/state/trips.svelte';
	import { cancelMembership, openBillingPortal } from '$lib/services/subscriptionService';
	import { PUBLIC_STRIPE_MONTHLY_PRICE_ID, PUBLIC_STRIPE_YEARLY_PRICE_ID } from '$env/static/public';
	import type { ThemeMode } from '$lib/state/theme.svelte';
	import type { GlobeStyle, MapDisplay } from '$lib/types';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) goto('/signin');
		else profileState.load();
	});

	// ── Entrance animation ──
	let ready = $state(false);
	$effect(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
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
	let avatarUploading = $state(false);

	// ── Dirty tracking ──
	let initialSnapshot = $state('');

	function currentSnapshot(): string {
		return JSON.stringify({ username, displayName, bio, instagram, youtube, tiktok, website, primaryColor, secondaryColor, preferredFontId, globeStyle, mapDisplay });
	}

	const isDirty = $derived(initialSnapshot !== '' && currentSnapshot() !== initialSnapshot);

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

	const hasValidationErrors = $derived(!!usernameError || !!displayNameError || !!websiteError);
	const canSave = $derived(isDirty && !saving && !hasValidationErrors && usernameStatus !== 'checking');

	// ── Avatar helpers ──
	const avatarUrl = $derived(profileState.profile?.avatarUrl || authState.user?.avatarUrl || '');
	const initials = $derived(
		(displayName || authState.user?.name || 'U')
			.split(' ')
			.map(w => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	let avatarInput: HTMLInputElement | undefined;

	async function handleAvatarUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		avatarUploading = true;
		const result = await profileState.uploadAvatar(file);
		avatarUploading = false;
		if (result.ok) {
			toast.success('Avatar updated!');
		} else {
			errorMsg = result.error ?? 'Failed to upload avatar';
		}
	}

	async function handleRemoveAvatar() {
		avatarUploading = true;
		await profileState.removeAvatar();
		avatarUploading = false;
		toast.success('Avatar removed');
	}

	// ── Populate form when profile loads (once) ──
	let formPopulated = $state(false);
	$effect(() => {
		if (formPopulated) return;
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
			formPopulated = true;
			// Take snapshot after populating (next tick so state has settled)
			setTimeout(() => { initialSnapshot = currentSnapshot(); }, 0);
		} else if (!profileState.loading && authState.user) {
			displayName = authState.user.name;
			formPopulated = true;
			setTimeout(() => { initialSnapshot = currentSnapshot(); }, 0);
		}
	});

	async function handleSave() {
		if (hasValidationErrors) {
			errorMsg = usernameError || displayNameError || websiteError;
			// Scroll to top so the user can see the error banner + field errors
			window.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
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
			formPopulated = false; // Allow re-populate from fresh profile data
		} else {
			errorMsg = result.error ?? 'Failed to save';
		}
	}

	// ── Subscription info ──
	const subPlan = $derived(
		profileState.profile?.subscriptionPriceId === PUBLIC_STRIPE_YEARLY_PRICE_ID ? 'yearly' :
		profileState.profile?.subscriptionPriceId === PUBLIC_STRIPE_MONTHLY_PRICE_ID ? 'monthly' : null
	);
	const subPlanLabel = $derived(subPlan === 'yearly' ? 'Pro Yearly' : subPlan === 'monthly' ? 'Pro Monthly' : 'Pro');
	const subPrice = $derived(subPlan === 'yearly' ? '$59.99/year' : '$5.99/month');
	const subRenewalDate = $derived.by(() => {
		const ts = profileState.profile?.subscriptionCurrentPeriodEnd;
		if (!ts) return null;
		return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
	});

	let billingLoading = $state(false);
	async function handleManageBilling() {
		billingLoading = true;
		try {
			await openBillingPortal();
		} catch (err) {
			console.error('[Profile] Billing portal failed:', err);
			toast.error('Failed to open billing portal.');
			billingLoading = false;
		}
	}

	// ── Cancel membership ──
	let cancelStep = $state<'idle' | 'confirm' | 'canceling'>('idle');

	async function handleCancelMembership() {
		cancelStep = 'canceling';
		try {
			await cancelMembership();
			toast.success('Membership canceled');
			cancelStep = 'idle';
		} catch (err) {
			console.error('[Profile] Cancel membership failed:', err);
			toast.error('Failed to cancel membership. Please try again.');
			cancelStep = 'idle';
		}
	}

	// ── Delete account ──
	let deleteStep = $state<'idle' | 'confirm' | 'deleting'>('idle');

	async function handleDeleteAccount() {
		deleteStep = 'deleting';
		tripsState.unsubscribe();
		// Cancel subscription before deleting account
		if (profileState.isPro && profileState.profile?.subscriptionId) {
			try {
				await cancelMembership();
			} catch { /* proceed with deletion even if cancel fails */ }
		}
		const result = await profileState.deleteAccount();
		if (result.ok) {
			toast.success('Account deleted');
			goto('/signin');
		} else {
			toast.error(result.error ?? 'Failed to delete account');
			deleteStep = 'idle';
		}
	}

	let logoInput: HTMLInputElement;

	async function handleLogoUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		logoUploading = true;
		const result = await profileState.uploadLogo(file);
		logoUploading = false;
		if (result.ok) {
			toast.success('Logo uploaded!');
		} else {
			errorMsg = result.error ?? 'Failed to upload logo';
		}
	}

	async function handleRemoveLogo() {
		logoUploading = true;
		await profileState.removeLogo();
		logoUploading = false;
		toast.success('Logo removed');
	}
</script>

<svelte:head>
	<title>Profile | TripStitch</title>
	<link rel="stylesheet" href={googleFontsUrl()} />
</svelte:head>

<style>
	@keyframes fade-up {
		from { opacity: 0; transform: translateY(16px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.animate-fade-up { animation: fade-up 0.5s ease-out forwards; }
	.delay-50 { animation-delay: 0.05s; }
	.delay-100 { animation-delay: 0.1s; }
	.delay-150 { animation-delay: 0.15s; }
	.delay-200 { animation-delay: 0.2s; }
	.delay-250 { animation-delay: 0.25s; }
	.delay-350 { animation-delay: 0.35s; }
	.fill-both { animation-fill-mode: both; }

	@media (prefers-reduced-motion: reduce) {
		.animate-fade-up { animation: none; opacity: 1; transform: none; }
	}
</style>

<AppShell title="Profile" showBottomNav logoUrl={profileState.profile?.logoUrl}>
	{#if profileState.loading}
		<SkeletonProfile />
	{:else}
		<div class="max-w-lg space-y-2 pb-20">
			{#if errorMsg}
				<div class="bg-error-light border border-error text-error text-sm rounded-lg px-4 py-3">
					{errorMsg}
				</div>
			{/if}

			<!-- ═══════════ SECTION: Account ═══════════ -->
			<section class="bg-card border-2 border-border rounded-xl p-5 space-y-4 {ready ? 'animate-fade-up fill-both delay-50' : 'opacity-0'}">
				<h2 class="text-base font-semibold text-text-primary">Account</h2>

				<!-- Avatar -->
				<div class="flex items-center gap-4">
					<div class="relative group">
						{#if avatarUrl}
							<img
								src={avatarUrl}
								alt={displayName || 'Avatar'}
								referrerpolicy="no-referrer"
								class="w-16 h-16 rounded-full border-2 border-border object-cover"
							/>
						{:else}
							<div class="w-16 h-16 rounded-full border-2 border-border bg-accent-light flex items-center justify-center text-accent font-bold text-lg">
								{initials}
							</div>
						{/if}

						<!-- Upload overlay -->
						<button
							class="absolute inset-0 rounded-full bg-overlay/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
							onclick={() => avatarInput?.click()}
							disabled={avatarUploading}
							aria-label="Change avatar"
						>
							{#if avatarUploading}
								<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
							{:else}
								<Camera size={20} weight="bold" class="text-white" />
							{/if}
						</button>
					</div>

					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-text-primary">Profile photo</p>
						<div class="flex items-center gap-2 mt-1">
							<button
								class="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
								onclick={() => avatarInput?.click()}
								disabled={avatarUploading}
							>
								{avatarUrl ? 'Change' : 'Upload'}
							</button>
							{#if avatarUrl && profileState.profile?.avatarUrl}
								<button
									class="text-xs text-error hover:text-error transition-colors cursor-pointer"
									onclick={handleRemoveAvatar}
									disabled={avatarUploading}
								>
									Remove
								</button>
							{/if}
						</div>
					</div>

					<input bind:this={avatarInput} type="file" accept="image/*" class="hidden" onchange={handleAvatarUpload} />
				</div>

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
					{#if usernameError && (usernameClean ? !isUsernameUnchanged : true)}
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
						class="w-full rounded-lg bg-card border-2 border-border text-sm text-text-primary px-3 py-2 placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow resize-none"
					></textarea>
				</div>
			</section>

		<!-- ═══════════ SECTION: Appearance ═══════════ -->
			<section class="bg-card border-2 border-border rounded-xl p-5 space-y-4 {ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
				<h2 class="text-base font-semibold text-text-primary">Appearance</h2>
				<div class="grid grid-cols-3 gap-2">
					{#each [
						{ id: 'system', label: 'System', icon: 'monitor' },
						{ id: 'light', label: 'Light', icon: 'sun' },
						{ id: 'dark', label: 'Dark', icon: 'moon' }
					] as option (option.id)}
						<button
							class="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer {themeState.mode === option.id ? 'border-accent bg-accent-light' : 'border-border hover:border-primary-medium'}"
							onclick={() => themeState.setMode(option.id as ThemeMode)}
						>
							{#if option.icon === 'monitor'}
								<Desktop size={24} weight="bold" class={themeState.mode === option.id ? 'text-accent' : 'text-text-muted'} />
							{:else if option.icon === 'sun'}
								<Sun size={24} weight="bold" class={themeState.mode === option.id ? 'text-accent' : 'text-text-muted'} />
							{:else}
								<Moon size={24} weight="bold" class={themeState.mode === option.id ? 'text-accent' : 'text-text-muted'} />
							{/if}
							<span class="text-xs font-medium {themeState.mode === option.id ? 'text-text-primary' : 'text-text-muted'}">{option.label}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- ═══════════ SECTION: Branding ═══════════ -->
			<section class="bg-card border-2 border-border rounded-xl overflow-hidden {ready ? 'animate-fade-up fill-both delay-150' : 'opacity-0'}">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => brandingOpen = !brandingOpen}
				>
					<div class="flex items-center gap-2">
					<h2 class="text-base font-semibold text-text-primary">Branding</h2>
					{#if !profileState.isPro}
						<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider">
							<Crown size={8} weight="fill" /> Pro
						</span>
					{/if}
				</div>
					<CaretDown size={20} weight="bold" class="transition-transform {brandingOpen ? 'rotate-180' : ''}" />
				</button>

				{#if brandingOpen}
					{#if profileState.isPro}
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
										<Upload size={16} weight="bold" />
										<span class="text-xs">Upload PNG, SVG, or JPG</span>
									{/if}
								</button>
							{/if}
							<input bind:this={logoInput} type="file" accept="image/*" class="hidden" onchange={handleLogoUpload} />
						</div>

						<!-- Brand Colors -->
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Colors</span>
							<div class="space-y-4">
								<div>
									<ColorPicker
										bind:selected={primaryColor}
										label="Primary"
										showInput
										allowClear
									/>
								</div>
								<div>
									<ColorPicker
										bind:selected={secondaryColor}
										label="Secondary"
										showInput
										colors={['#0a0f1e', '#1A1A1A', '#2C3E50', '#1B2A4A', '#0D1B2A', '#2D1B2E', '#1A2F1A', '#3B1C32', '#FFFFFF', '#F5F5F5']}
									/>
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
								<Check size={16} weight="bold" class="text-accent flex-shrink-0" />
							</div>
							<input
								type="text"
								placeholder="Search fonts..."
								bind:value={fontSearch}
								class="w-full rounded-lg bg-card border-2 border-border text-sm text-text-primary px-3 py-1.5 placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow mb-2"
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
					{:else}
					<div class="px-5 pb-5 border-t border-border pt-4">
						<div class="text-center py-4">
							<Lock size={24} weight="bold" class="text-text-muted mx-auto mb-2" />
							<p class="text-sm text-text-muted mb-3">Custom logo, colors, and fonts are available with Pro.</p>
							<a href="/pricing" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors">
								<Crown size={14} weight="fill" /> Upgrade to Pro
							</a>
						</div>
					</div>
					{/if}
				{/if}
			</section>

			<!-- ═══════════ SECTION: Map Display ═══════════ -->
			<section class="bg-card border-2 border-border rounded-xl overflow-hidden {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => mapSectionOpen = !mapSectionOpen}
				>
					<h2 class="text-base font-semibold text-text-primary">Map Display</h2>
					<CaretDown size={20} weight="bold" class="transition-transform {mapSectionOpen ? 'rotate-180' : ''}" />
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
								<Globe size={32} weight="bold" class={mapDisplay === 'globe' ? 'text-accent' : 'text-text-muted'} />
								<div class="text-center">
									<p class="text-sm font-medium {mapDisplay === 'globe' ? 'text-text-primary' : 'text-text-muted'}">3D Globe</p>
									<p class="text-xs text-text-muted">Interactive rotating globe</p>
								</div>
							</button>

							<button
								class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer {mapDisplay === 'map' ? 'border-accent bg-accent-light' : 'border-border hover:border-primary-light'}"
								onclick={() => mapDisplay = 'map'}
							>
								<MapTrifold size={32} weight="bold" class={mapDisplay === 'map' ? 'text-accent' : 'text-text-muted'} />
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
			<section class="bg-card border-2 border-border rounded-xl overflow-hidden {ready ? 'animate-fade-up fill-both delay-250' : 'opacity-0'}">
				<button
					class="w-full flex items-center justify-between p-5 cursor-pointer text-left"
					onclick={() => socialsOpen = !socialsOpen}
				>
					<div class="flex items-center gap-2">
					<h2 class="text-base font-semibold text-text-primary">Social Links</h2>
					{#if !profileState.isPro}
						<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider">
							<Crown size={8} weight="fill" /> Pro
						</span>
					{/if}
				</div>
					<CaretDown size={20} weight="bold" class="transition-transform {socialsOpen ? 'rotate-180' : ''}" />
				</button>

				{#if socialsOpen}
					{#if profileState.isPro}
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
					{:else}
					<div class="px-5 pb-5 border-t border-border pt-4">
						<div class="text-center py-4">
							<Lock size={24} weight="bold" class="text-text-muted mx-auto mb-2" />
							<p class="text-sm text-text-muted mb-3">Social links in your video outro are available with Pro.</p>
							<a href="/pricing" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors">
								<Crown size={14} weight="fill" /> Upgrade to Pro
							</a>
						</div>
					</div>
					{/if}
				{/if}
			</section>

			<!-- ═══════════ SECTION: Subscription ═══════════ -->
		{#if profileState.isPro}
			<section class="bg-card border-2 border-accent/30 rounded-xl p-5 space-y-4 {ready ? 'animate-fade-up fill-both delay-300' : 'opacity-0'}">
				<div class="flex items-center justify-between">
					<h2 class="text-base font-semibold text-text-primary">Subscription</h2>
					<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-bold">
						<Crown size={12} weight="fill" /> Active
					</span>
				</div>

				<div class="space-y-3">
					<div class="flex items-center gap-3">
						<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
							<CreditCard size={18} weight="bold" class="text-accent" />
						</div>
						<div>
							<p class="text-sm font-semibold text-text-primary">{subPlanLabel}</p>
							<p class="text-xs text-text-muted">{subPrice}</p>
						</div>
					</div>

					{#if subRenewalDate}
						<div class="flex items-center gap-3">
							<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
								<CalendarBlank size={18} weight="bold" class="text-accent" />
							</div>
							<div>
								<p class="text-sm font-semibold text-text-primary">Next renewal</p>
								<p class="text-xs text-text-muted">{subRenewalDate}</p>
							</div>
						</div>
					{/if}
				</div>

				<div class="flex gap-2 pt-1">
					<button
						class="flex-1 text-sm py-2.5 rounded-lg border-2 border-border bg-card hover:bg-primary-light text-text-secondary font-medium transition-colors cursor-pointer"
						onclick={handleManageBilling}
						disabled={billingLoading}
					>
						{billingLoading ? 'Loading...' : 'Manage Billing'}
					</button>
					<button
						class="text-sm py-2.5 px-4 rounded-lg text-text-muted hover:text-error transition-colors cursor-pointer"
						onclick={() => cancelStep = 'confirm'}
					>
						Cancel
					</button>
				</div>

				{#if cancelStep === 'confirm'}
					<div class="border-t-2 border-border pt-4 space-y-3">
						<div class="flex items-start gap-3">
							<Warning size={20} weight="fill" class="text-warning flex-shrink-0 mt-0.5" />
							<div>
								<p class="text-sm font-semibold text-warning">Cancel your Pro membership?</p>
								<p class="text-xs text-text-muted mt-1">You'll lose access to blogs, spotlights, custom branding, and other Pro features.</p>
							</div>
						</div>
						<div class="flex gap-2">
							<button
								class="flex-1 text-sm py-2 rounded-lg bg-error hover:bg-error/80 text-white font-bold transition-colors cursor-pointer"
								onclick={handleCancelMembership}
							>
								Yes, cancel membership
							</button>
							<button
								class="flex-1 text-sm py-2 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
								onclick={() => cancelStep = 'idle'}
							>
								Keep Pro
							</button>
						</div>
					</div>
				{:else if cancelStep === 'canceling'}
					<div class="border-t-2 border-border pt-4 flex items-center justify-center gap-3 py-2">
						<div class="w-4 h-4 border-2 border-warning/30 border-t-warning rounded-full animate-spin"></div>
						<span class="text-sm text-text-muted">Canceling membership...</span>
					</div>
				{/if}
			</section>
		{:else}
			<section class="bg-card border-2 border-border rounded-xl p-5 space-y-3 {ready ? 'animate-fade-up fill-both delay-300' : 'opacity-0'}">
				<div class="flex items-center gap-3">
					<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
						<Crown size={18} weight="bold" class="text-accent" />
					</div>
					<div class="flex-1">
						<p class="text-sm font-semibold text-text-primary">Upgrade to Pro</p>
						<p class="text-xs text-text-muted">Unlock blogs, spotlights, custom branding & more</p>
					</div>
					<a href="/pricing" class="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors">
						View Plans
					</a>
				</div>
			</section>
		{/if}

		<!-- ═══════════ SECTION: Delete Account ═══════════ -->
			<section class="bg-card border-2 border-error/30 rounded-xl p-5 {ready ? 'animate-fade-up fill-both delay-350' : 'opacity-0'}">
				{#if deleteStep === 'idle'}
					<button
						class="text-sm font-medium text-error hover:text-error/80 transition-colors cursor-pointer flex items-center gap-2"
						onclick={() => deleteStep = 'confirm'}
					>
						<Trash size={16} weight="bold" />
						Delete Account
					</button>
				{:else if deleteStep === 'confirm'}
					<div class="space-y-3">
						<div class="flex items-start gap-3">
							<Warning size={20} weight="fill" class="text-error flex-shrink-0 mt-0.5" />
							<div>
								<p class="text-sm font-semibold text-error">Are you sure?</p>
								<p class="text-xs text-text-muted mt-1">This will permanently delete your account, all your trips, media, and profile data. This action cannot be undone.</p>
							</div>
						</div>
						<div class="flex gap-2">
							<button
								class="flex-1 text-sm py-2 rounded-lg bg-error hover:bg-error/80 text-white font-bold transition-colors cursor-pointer"
								onclick={handleDeleteAccount}
							>
								Yes, delete everything
							</button>
							<button
								class="flex-1 text-sm py-2 rounded-lg bg-border hover:bg-primary-light text-text-secondary transition-colors cursor-pointer"
								onclick={() => deleteStep = 'idle'}
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<div class="flex items-center justify-center gap-3 py-2">
						<div class="w-4 h-4 border-2 border-error/30 border-t-error rounded-full animate-spin"></div>
						<span class="text-sm text-text-muted">Deleting account...</span>
					</div>
				{/if}
			</section>
		</div>

		<!-- ═══════════ Sticky bottom save bar ═══════════ -->
		<div class="fixed left-0 right-0 z-30 border-t-2 border-border bg-page/95 backdrop-blur-sm {ready ? 'animate-fade-up fill-both delay-350' : 'opacity-0'}" style="bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 8px);">
			<div class="max-w-lg mx-auto px-4 pt-3 pb-4 flex items-center gap-3">
				<Button variant="primary" onclick={handleSave} disabled={!canSave}>
					{#if saving}
						<div class="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
					{/if}
					{saving ? 'Saving...' : 'Save Profile'}
				</Button>
				{#if isDirty}
					<span class="text-xs text-warning font-medium">Unsaved changes</span>
				{/if}
				<div class="flex-1"></div>
				<Button variant="secondary" onclick={async () => { await authState.signOut(); goto('/signin'); }}>
					Sign Out
				</Button>
			</div>
		</div>
	{/if}
</AppShell>
