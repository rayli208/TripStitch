<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { FONTS, DEFAULT_BRAND_COLORS, getFontById, googleFontsUrl, fontFamily } from '$lib/constants/fonts';
	import { preloadFont } from '$lib/utils/fontLoader';

	let {
		title = $bindable(''),
		titleColor = $bindable('#FFFFFF'),
		titleDescription = $bindable(''),
		fontId = $bindable('inter'),
		showLogoOnTitle = $bindable(false),
		brandColors = [],
		titleMediaPreviewUrl = null,
		logoUrl = null,
		onmedia,
		onremovemedia,
		onnext
	}: {
		title?: string;
		titleColor?: string;
		titleDescription?: string;
		fontId?: string;
		showLogoOnTitle?: boolean;
		brandColors?: string[];
		titleMediaPreviewUrl?: string | null;
		logoUrl?: string | null;
		onmedia?: (file: File) => void;
		onremovemedia?: () => void;
		onnext: () => void;
	} = $props();

	let fileInput: HTMLInputElement;

	function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) return;
		onmedia?.(file);
	}

	const pickerColors = $derived(brandColors.length > 0 ? brandColors : DEFAULT_BRAND_COLORS);
	const selectedFont = $derived(getFontById(fontId));
</script>

<svelte:head>
	<link rel="stylesheet" href={googleFontsUrl()} />
</svelte:head>

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-semibold mb-1">Trip Details</h2>
		<p class="text-sm text-text-muted">Give your trip a name and pick a title color.</p>
	</div>

	<Input label="Trip Title" placeholder="e.g. Weekend in Paris" bind:value={title} />

	<div>
		<label class="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
		<textarea
			bind:value={titleDescription}
			placeholder="Optional subtitle or description"
			rows="2"
			class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
		></textarea>
	</div>

	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Title Color</span>
		<ColorPicker bind:selected={titleColor} colors={pickerColors} />
	</div>

	<!-- Font Picker -->
	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Font</span>
		<div class="grid grid-cols-2 gap-2">
			{#each FONTS as font (font.id)}
				<button
					class="px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer {fontId === font.id ? 'border-accent bg-accent-light' : 'border-border bg-card hover:border-primary-light'}"
					style="font-family: {font.family}, system-ui, sans-serif"
					onclick={() => (fontId = font.id)}
					onmouseenter={() => preloadFont(font.id)}
				>
					<span class="text-sm text-text-primary">{font.name}</span>
				</button>
			{/each}
		</div>
	</div>

	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Cover Photo (optional)</span>
		{#if titleMediaPreviewUrl}
			<div class="relative rounded-lg overflow-hidden bg-card border border-border">
				<img src={titleMediaPreviewUrl} alt="Cover preview" class="w-full h-32 object-cover" />
				<button
					class="absolute top-1.5 right-1.5 w-7 h-7 bg-overlay/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600/80 transition-colors cursor-pointer"
					onclick={() => onremovemedia?.()}
					title="Remove cover photo"
				>
					&#10005;
				</button>
			</div>
		{:else}
			<button
				class="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary-light hover:text-text-secondary transition-colors cursor-pointer"
				onclick={() => fileInput.click()}
			>
				<svg class="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
				</svg>
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

	<!-- Logo toggle (only if user has a logo) -->
	{#if logoUrl}
		<label class="flex items-center gap-3 cursor-pointer">
			<input
				type="checkbox"
				bind:checked={showLogoOnTitle}
				class="w-4 h-4 rounded border-border bg-card text-accent focus:ring-accent accent-accent"
			/>
			<div class="flex items-center gap-2">
				<img src={logoUrl} alt="Your logo" class="w-6 h-6 rounded object-contain" />
				<span class="text-sm text-text-secondary">Show logo on title card</span>
			</div>
		</label>
	{/if}

	{#if title}
		<div class="mt-4 rounded-lg border border-border overflow-hidden">
			<p class="text-xs text-text-muted px-4 pt-3 pb-1">Preview</p>
			{#if titleMediaPreviewUrl}
				<div class="relative h-40 flex items-center justify-center">
					<img src={titleMediaPreviewUrl} alt="Cover" class="absolute inset-0 w-full h-full object-cover" />
					<div class="absolute inset-0 bg-overlay/40"></div>
					<div class="relative text-center px-4">
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
					<div class="relative text-center px-4">
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

	<div class="flex justify-end pt-4">
		<Button variant="primary" onclick={onnext}>
			Next: Add Locations
		</Button>
	</div>
</div>
