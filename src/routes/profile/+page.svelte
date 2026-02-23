<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import toast from '$lib/state/toast.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { FONTS, DEFAULT_FONT_ID, getFontById, googleFontsUrl } from '$lib/constants/fonts';
	import { preloadFont } from '$lib/utils/fontLoader';
	import SkeletonProfile from '$lib/components/ui/SkeletonProfile.svelte';

	$effect(() => {
		if (authState.loading) return;
		if (!authState.isSignedIn) goto('/signin');
		else profileState.load();
	});

	let username = $state('');
	let displayName = $state('');
	let bio = $state('');
	let instagram = $state('');
	let youtube = $state('');
	let tiktok = $state('');
	let website = $state('');
	let brandColors = $state<string[]>([]);
	let preferredFontId = $state(DEFAULT_FONT_ID);

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let logoUploading = $state(false);

	// Username availability check (Task 8)
	let usernameStatus = $state<'idle' | 'checking' | 'available' | 'taken'>('idle');
	let usernameCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	function checkUsernameAvailability(value: string) {
		clearTimeout(usernameCheckTimeout);
		const cleaned = value.toLowerCase().trim();

		// Same as current — no check needed
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
				if (uid && uid !== authState.user?.id) {
					usernameStatus = 'taken';
				} else {
					usernameStatus = 'available';
				}
			} catch {
				usernameStatus = 'idle';
			}
		}, 500);
	}

	// Populate form when profile loads
	$effect(() => {
		if (profileState.profile) {
			const p = profileState.profile;
			username = p.username;
			displayName = p.displayName;
			bio = p.bio;
			instagram = p.socialLinks.instagram ?? '';
			youtube = p.socialLinks.youtube ?? '';
			tiktok = p.socialLinks.tiktok ?? '';
			website = p.socialLinks.website ?? '';
			brandColors = [...(p.brandColors ?? [])];
			preferredFontId = p.preferredFontId ?? DEFAULT_FONT_ID;
		} else if (!profileState.loading && authState.user) {
			displayName = authState.user.name;
		}
	});

	function addColor(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		if (brandColors.length < 10) {
			brandColors = [...brandColors, value];
		}
	}

	function removeColor(index: number) {
		brandColors = brandColors.filter((_, i) => i !== index);
	}

	function updateColor(index: number, e: Event) {
		const value = (e.target as HTMLInputElement).value;
		brandColors = brandColors.map((c, i) => (i === index ? value : c));
	}

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
			brandColors,
			preferredFontId
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
		if (!result.ok) {
			errorMsg = result.error ?? 'Failed to upload logo';
		}
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

<AppShell title="Profile" showBottomNav>
	{#if profileState.loading}
		<SkeletonProfile />
	{:else}
		<div class="space-y-6 max-w-lg">
			<div>
				<h2 class="text-xl font-semibold mb-1">Your Profile</h2>
				<p class="text-sm text-text-muted">Set up your public profile. This is shown on your shared trips.</p>
			</div>

			{#if errorMsg}
				<div class="bg-error-light border border-error text-error text-sm rounded-lg px-4 py-3">
					{errorMsg}
				</div>
			{/if}

			<div>
				<Input label="Username" placeholder="e.g. raytravel" bind:value={username} oninput={(e: Event) => checkUsernameAvailability((e.target as HTMLInputElement).value)} />
				<div class="flex items-center justify-between mt-1.5">
					<p class="text-xs text-text-muted">
						Your public URL: /u/{username || '...'}
					</p>
					{#if usernameStatus === 'checking'}
						<span class="w-3 h-3 border border-border border-t-accent rounded-full animate-spin inline-block flex-shrink-0"></span>
					{:else if usernameStatus === 'available'}
						<span class="text-xs text-success flex-shrink-0">Available</span>
					{:else if usernameStatus === 'taken'}
						<span class="text-xs text-error flex-shrink-0">Taken</span>
					{/if}
				</div>
			</div>

			<Input label="Display Name" placeholder="Your name" bind:value={displayName} />

			<div>
				<label class="block text-sm font-medium text-text-secondary mb-1">Bio</label>
				<textarea
					bind:value={bio}
					placeholder="Tell people about your travels..."
					rows="3"
					class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
				></textarea>
			</div>

			<!-- Logo -->
			<div>
				<span class="block text-sm font-medium text-text-secondary mb-2">Logo / Brand Mark</span>
				<p class="text-xs text-text-muted mb-2">Shown as a watermark on your title cards when enabled.</p>

				{#if profileState.profile?.logoUrl}
					<div class="flex items-center gap-3">
						<img
							src={profileState.profile.logoUrl}
							alt="Logo"
							class="w-16 h-16 rounded-lg object-contain bg-card border border-border p-1"
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
						class="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary-light hover:text-text-secondary transition-colors cursor-pointer"
						onclick={() => logoInput.click()}
						disabled={logoUploading}
					>
						{#if logoUploading}
							<div class="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin"></div>
						{:else}
							<svg class="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
							</svg>
							<span class="text-xs">Upload logo (PNG, SVG, JPG)</span>
						{/if}
					</button>
				{/if}

				<input
					bind:this={logoInput}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={handleLogoUpload}
				/>
			</div>

			<!-- Brand Colors -->
			<div>
				<span class="block text-sm font-medium text-text-secondary mb-2">Brand Colors</span>
				<p class="text-xs text-text-muted mb-2">Custom palette for your trip title colors (up to 10). Leave empty to use defaults.</p>

				<div class="flex flex-wrap items-center gap-2">
					{#each brandColors as color, i}
						<div class="relative group">
							<label class="block cursor-pointer">
								<input
									type="color"
									value={color}
									onchange={(e) => updateColor(i, e)}
									class="sr-only"
								/>
								<div
									class="w-9 h-9 rounded-full border-2 border-border hover:border-primary-light transition-colors"
									style="background-color: {color}"
								></div>
							</label>
							<button
								class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error rounded-full text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
								onclick={() => removeColor(i)}
								title="Remove color"
							>&#10005;</button>
						</div>
					{/each}

					{#if brandColors.length < 10}
						<label class="w-9 h-9 rounded-full border-2 border-dashed border-border hover:border-primary-light flex items-center justify-center text-text-muted cursor-pointer transition-colors">
							<input
								type="color"
								value="#FFFFFF"
								onchange={addColor}
								class="sr-only"
							/>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
						</label>
					{/if}
				</div>
			</div>

			<!-- Preferred Font -->
			<div>
				<span class="block text-sm font-medium text-text-secondary mb-2">Preferred Font</span>
				<p class="text-xs text-text-muted mb-2">Default font for new trips. You can change it per-trip too.</p>

				<div class="grid grid-cols-2 gap-2">
					{#each FONTS as font (font.id)}
						<button
							class="px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer {preferredFontId === font.id ? 'border-accent bg-accent-light' : 'border-border bg-card hover:border-primary-light'}"
							style="font-family: {font.family}, system-ui, sans-serif"
							onclick={() => (preferredFontId = font.id)}
							onmouseenter={() => preloadFont(font.id)}
						>
							<span class="text-sm text-text-primary">{font.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Social Links -->
			<div>
				<span class="block text-sm font-medium text-text-secondary mb-3">Social Links</span>
				<div class="space-y-3">
					<Input label="Instagram" placeholder="@username or full URL" bind:value={instagram} />
					<Input label="TikTok" placeholder="@username or full URL" bind:value={tiktok} />
					<Input label="YouTube" placeholder="Channel URL" bind:value={youtube} />
					<Input label="Website" placeholder="https://yoursite.com" bind:value={website} />
				</div>
			</div>

			<div class="flex gap-3 pt-4">
				<Button variant="primary" onclick={handleSave} disabled={saving}>
					{saving ? 'Saving...' : 'Save Profile'}
				</Button>
				<Button variant="secondary" onclick={async () => { await authState.signOut(); goto('/signin'); }}>
					Sign Out
				</Button>
			</div>
		</div>
	{/if}
</AppShell>
