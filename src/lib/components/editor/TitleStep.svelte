<script lang="ts">
	import type { AspectRatio, MapStyle } from '$lib/types';
	import Input from '$lib/components/ui/Input.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { FONTS, DEFAULT_BRAND_COLORS, getFontById, googleFontsUrl, fontFamily } from '$lib/constants/fonts';
	import { preloadFont } from '$lib/utils/fontLoader';
	import { Upload, X, CaretDown, Check, MapTrifold, Broadcast, Mountains, Compass, Moon, Sun, Lock, Crown } from 'phosphor-svelte';

	let {
		title = $bindable(''),
		titleColor = $bindable('#FFFFFF'),
		titleDescription = $bindable(''),
		fontId = $bindable('inter'),
		tripDate = $bindable(''),
		showLogoOnTitle = $bindable(false),
		brandColors = [],
		secondaryColor = $bindable('#0a0f1e'),
		profileSecondaryColor = '#0a0f1e',
		preferredFontId = undefined,
		titleMediaPreviewUrl = null,
		logoUrl = null,
		aspectRatio = $bindable<AspectRatio>('9:16'),
		mapStyle = $bindable<MapStyle>('streets'),
		isPro = false,
		onmedia,
		onremovemedia,
		onnext
	}: {
		title?: string;
		titleColor?: string;
		titleDescription?: string;
		fontId?: string;
		tripDate?: string;
		showLogoOnTitle?: boolean;
		brandColors?: string[];
		secondaryColor?: string;
		profileSecondaryColor?: string;
		preferredFontId?: string;
		titleMediaPreviewUrl?: string | null;
		logoUrl?: string | null;
		aspectRatio?: AspectRatio;
		mapStyle?: MapStyle;
		isPro?: boolean;
		onmedia?: (file: File) => void;
		onremovemedia?: () => void;
		onnext: () => void;
	} = $props();

	const ratios: { value: AspectRatio; label: string }[] = [
		{ value: '9:16', label: 'Vertical' },
		{ value: '1:1', label: 'Square' },
		{ value: '16:9', label: 'Wide' }
	];

	const mapStyles: { value: MapStyle; label: string }[] = [
		{ value: 'streets', label: 'Streets' },
		{ value: 'satellite', label: 'Satellite' },
		{ value: 'outdoor', label: 'Outdoor' },
		{ value: 'topo', label: 'Topo' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' }
	];

	let customizeOpen = $state(false);
	let fontDropdownOpen = $state(false);
	let fileInput: HTMLInputElement;

	function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) return;
		onmedia?.(file);
	}

	const primaryBrandColor = $derived(brandColors.length > 0 ? brandColors[0] : undefined);
	const pickerColors = $derived(
		brandColors.length > 0
			? [...brandColors, ...DEFAULT_BRAND_COLORS.filter((c) => !brandColors.includes(c))]
			: DEFAULT_BRAND_COLORS
	);
	const SECONDARY_COLORS = ['#0a0f1e', '#1a1a2e', '#0f172a', '#1e293b', '#18181b', '#27272a', '#1c1917', '#172554', '#14532d', '#4c0519'];
	const secondaryPickerColors = $derived(
		profileSecondaryColor && !SECONDARY_COLORS.includes(profileSecondaryColor)
			? [profileSecondaryColor, ...SECONDARY_COLORS]
			: SECONDARY_COLORS
	);
	const primarySecondaryColor = $derived(profileSecondaryColor !== '#0a0f1e' ? profileSecondaryColor : undefined);

	const selectedFont = $derived(getFontById(fontId));
	const preferredFont = $derived(preferredFontId ? getFontById(preferredFontId) : null);
	const otherFonts = $derived(
		preferredFontId ? FONTS.filter((f) => f.id !== preferredFontId) : FONTS
	);

	// Close font dropdown on outside click
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.font-dropdown')) {
			fontDropdownOpen = false;
		}
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={googleFontsUrl()} />
</svelte:head>
<svelte:window onclick={handleClickOutside} />

<div class="space-y-4">
	<Input label="Trip Title" placeholder="e.g. Weekend in Paris" bind:value={title} />

	<!-- Cover Photo -->
	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Cover Photo <span class="text-text-muted">*</span></span>
		{#if titleMediaPreviewUrl}
			<div class="relative rounded-lg overflow-hidden bg-card border-2 border-border">
				<img src={titleMediaPreviewUrl} alt="Cover preview" class="w-full h-32 object-cover" />
				<button
					class="absolute top-1.5 right-1.5 w-7 h-7 bg-overlay/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600/80 transition-colors cursor-pointer"
					onclick={() => onremovemedia?.()}
					title="Remove cover photo"
				>
					<X size={12} weight="bold" />
				</button>
			</div>
		{:else}
			<button
				class="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary-light hover:text-text-secondary transition-colors cursor-pointer"
				onclick={() => fileInput.click()}
			>
				<Upload size={20} weight="bold" class="mb-1" />
				<span class="text-xs">Upload cover image</span>
			</button>
		{/if}
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			class="hidden"
			onchange={handleFile}
		/>
	</div>

	<!-- Preview -->
	{#if title}
		<div class="rounded-lg border-2 border-border overflow-hidden">
			<p class="text-xs text-text-muted px-4 pt-3 pb-1">Preview</p>
			{#if titleMediaPreviewUrl}
				<div class="relative h-40 flex items-center justify-center">
					<img src={titleMediaPreviewUrl} alt="Cover" class="absolute inset-0 w-full h-full object-cover" />
					<div class="absolute inset-0 bg-overlay/40"></div>
					<div class="relative text-center px-6 py-4 rounded-xl" style="background: {secondaryColor}bf">
						<p class="text-2xl font-bold" style="color: {titleColor}; font-family: {fontFamily(fontId)}">{title}</p>
						{#if titleDescription}
							<p class="text-sm mt-1 opacity-70" style="color: {titleColor}; font-family: {fontFamily(fontId)}">{titleDescription}</p>
						{/if}
					</div>
					{#if showLogoOnTitle && logoUrl}
						<img
							src={logoUrl}
							alt="Logo"
							class="absolute bottom-2 right-3 w-8 h-8 object-contain opacity-80"
						/>
					{/if}
				</div>
			{:else}
				<div class="relative h-40 flex items-center justify-center" style="background: linear-gradient(to bottom, #0a0a0a, #1a1a2e, #0a0a0a)">
					<div class="relative text-center px-6 py-4 rounded-xl" style="background: {secondaryColor}bf">
						<p class="text-2xl font-bold" style="color: {titleColor}; font-family: {fontFamily(fontId)}">{title}</p>
						{#if titleDescription}
							<p class="text-sm mt-1 opacity-70" style="color: {titleColor}; font-family: {fontFamily(fontId)}">{titleDescription}</p>
						{/if}
					</div>
					{#if showLogoOnTitle && logoUrl}
						<img
							src={logoUrl}
							alt="Logo"
							class="absolute bottom-2 right-3 w-8 h-8 object-contain opacity-80"
						/>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Customize toggle -->
	<button
		class="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-card border-2 border-border text-sm text-text-secondary hover:bg-card-hover transition-colors cursor-pointer"
		onclick={() => (customizeOpen = !customizeOpen)}
	>
		<span class="font-medium">Customize Style</span>
		<CaretDown size={16} weight="bold" class="transition-transform {customizeOpen ? 'rotate-180' : ''}" />
	</button>

	{#if customizeOpen}
		<div class="space-y-4 pl-1 border-l-2 border-border ml-1">
			<!-- Date + Description -->
			<div class="pl-3">
				<span class="block text-sm font-bold text-text-primary mb-1">Trip Date</span>
				<input
					type="date"
					bind:value={tripDate}
					class="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-sm text-text-primary shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow"
				/>
			</div>

			<div class="pl-3">
				<span class="block text-sm font-bold text-text-primary mb-1">Description</span>
				<textarea
					bind:value={titleDescription}
					placeholder="Optional subtitle or description"
					rows="2"
					class="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-sm text-text-primary placeholder-text-muted shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:shadow-[4px_4px_0_var(--color-accent)] focus:border-border transition-shadow resize-none"
				></textarea>
			</div>

			<!-- Colors -->
			{#if isPro}
				<div class="pl-3 grid grid-cols-2 gap-4">
					<div>
						<span class="block text-sm font-medium text-text-secondary mb-1.5">Title Color</span>
						<ColorPicker bind:selected={titleColor} colors={pickerColors} primaryColor={primaryBrandColor} />
					</div>
					<div>
						<span class="block text-sm font-medium text-text-secondary mb-1.5">Background</span>
						<ColorPicker bind:selected={secondaryColor} colors={secondaryPickerColors} primaryColor={primarySecondaryColor} />
					</div>
				</div>
			{:else}
				<div class="pl-3 relative">
					<div class="flex items-center gap-2 mb-1.5">
						<span class="block text-sm font-medium text-text-secondary">Colors</span>
						<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider">
							<Crown size={8} weight="fill" /> Pro
						</span>
					</div>
					<div class="grid grid-cols-2 gap-4 opacity-40 pointer-events-none select-none">
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Title Color</span>
							<div class="h-8 rounded-lg border-2 border-border bg-card"></div>
						</div>
						<div>
							<span class="block text-sm font-medium text-text-secondary mb-1.5">Background</span>
							<div class="h-8 rounded-lg border-2 border-border bg-card"></div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Font -->
			{#if isPro}
				<div class="pl-3 relative font-dropdown">
					<span class="block text-sm font-medium text-text-secondary mb-1.5">Font</span>
					<button
						class="w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 border-border bg-card text-sm text-text-primary hover:bg-card-hover transition-colors cursor-pointer"
						style="font-family: {selectedFont.family}, system-ui, sans-serif"
						onclick={() => (fontDropdownOpen = !fontDropdownOpen)}
					>
						<span>{selectedFont.name}</span>
						<CaretDown size={16} weight="bold" class="text-text-muted transition-transform {fontDropdownOpen ? 'rotate-180' : ''}" />
					</button>
					{#if fontDropdownOpen}
						<div class="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border-2 border-border bg-card shadow-brutal">
							{#if preferredFont}
								<button
									class="w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-b border-border {fontId === preferredFont.id ? 'bg-accent-light' : 'hover:bg-card-hover'}"
									style="font-family: {preferredFont.family}, system-ui, sans-serif"
									onclick={() => { fontId = preferredFont.id; fontDropdownOpen = false; }}
								>
									<div class="flex items-center gap-2">
										<span class="text-sm text-text-primary">{preferredFont.name}</span>
										<span class="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-border/60">Your font</span>
									</div>
									{#if fontId === preferredFont.id}
										<Check size={16} weight="bold" class="text-accent flex-shrink-0" />
									{/if}
								</button>
							{/if}
							{#each otherFonts as font (font.id)}
								<button
									class="w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-b border-border last:border-b-0 {fontId === font.id ? 'bg-accent-light' : 'hover:bg-card-hover'}"
									style="font-family: {font.family}, system-ui, sans-serif"
									onclick={() => { fontId = font.id; fontDropdownOpen = false; }}
									onmouseenter={() => preloadFont(font.id)}
								>
									<span class="text-sm text-text-primary">{font.name}</span>
									{#if fontId === font.id}
										<Check size={16} weight="bold" class="text-accent flex-shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="pl-3">
					<div class="flex items-center gap-2 mb-1.5">
						<span class="block text-sm font-medium text-text-secondary">Font</span>
						<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider">
							<Crown size={8} weight="fill" /> Pro
						</span>
					</div>
					<div class="w-full px-3 py-2 rounded-lg border-2 border-border bg-card text-sm text-text-muted opacity-40">
						Inter (default)
					</div>
				</div>
			{/if}

			<!-- Aspect Ratio — inline row -->
			<div class="pl-3">
				<span class="block text-sm font-medium text-text-secondary mb-1.5">Aspect Ratio</span>
				<div class="flex gap-1.5">
					{#each ratios as ratio}
						<button
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer
								{aspectRatio === ratio.value
								? 'border-accent bg-accent-light text-text-primary'
								: 'border-border bg-card text-text-muted hover:border-primary-light'}"
							onclick={() => (aspectRatio = ratio.value)}
						>
							<div
								class="rounded border {aspectRatio === ratio.value ? 'border-accent' : 'border-current'}
									{ratio.value === '9:16' ? 'w-3 h-5' : ratio.value === '1:1' ? 'w-4 h-4' : 'w-5 h-3'}"
							></div>
							<span class="text-xs font-medium">{ratio.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Map Style — icon row -->
			<div class="pl-3">
				<span class="block text-sm font-bold text-text-primary mb-1.5">Map Style</span>
				<div class="grid grid-cols-3 gap-1.5">
					{#each mapStyles as style}
						<button
							class="flex flex-col items-center gap-0.5 py-2 rounded-lg border-2 transition-all cursor-pointer
								{mapStyle === style.value
								? 'border-accent bg-accent-light'
								: 'border-border bg-card hover:border-primary-medium'}"
							onclick={() => (mapStyle = style.value)}
							title={style.label}
						>
							<span class="text-base">
							{#if style.value === 'streets'}
								<MapTrifold size={20} weight="bold" />
							{:else if style.value === 'satellite'}
								<Broadcast size={20} weight="bold" />
							{:else if style.value === 'outdoor'}
								<Mountains size={20} weight="bold" />
							{:else if style.value === 'topo'}
								<Compass size={20} weight="bold" />
							{:else if style.value === 'dark'}
								<Moon size={20} weight="bold" />
							{:else if style.value === 'light'}
								<Sun size={20} weight="bold" />
							{/if}
						</span>
							<span class="text-[10px] font-bold {mapStyle === style.value ? 'text-text-primary' : 'text-text-muted'}">{style.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Logo toggle -->
			{#if isPro && logoUrl}
				<div class="pl-3">
					<label class="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={showLogoOnTitle}
							class="w-4 h-4 rounded border-border bg-card text-accent focus:ring-accent accent-accent"
						/>
						<div class="flex items-center gap-2">
							<img src={logoUrl} alt="Your logo" class="w-6 h-6 rounded object-contain" />
							<span class="text-sm text-text-secondary">Show logo watermark</span>
						</div>
					</label>
				</div>
			{:else if logoUrl}
				<div class="pl-3 opacity-40">
					<div class="flex items-center gap-3">
						<Lock size={14} weight="bold" class="text-text-muted" />
						<div class="flex items-center gap-2">
							<img src={logoUrl} alt="Your logo" class="w-6 h-6 rounded object-contain" />
							<span class="text-sm text-text-secondary">Logo watermark</span>
							<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider">
								<Crown size={8} weight="fill" /> Pro
							</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex justify-end pt-4">
		<Button variant="primary" disabled={!title.trim()} onclick={onnext}>
			{#if !title.trim()}
				Enter a title to continue
			{:else}
				Next: Add Locations
			{/if}
		</Button>
	</div>
</div>
