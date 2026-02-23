<script lang="ts">
	let {
		previewUrl = null,
		mediaType = null,
		onfile
	}: {
		previewUrl?: string | null;
		mediaType?: 'photo' | 'video' | null;
		onfile: (file: File) => void;
	} = $props();

	const SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB
	let fileInput: HTMLInputElement;
	let sizeWarning = $state<string | null>(null);

	function handleFiles(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			if (file.size > SIZE_LIMIT) {
				const sizeMB = (file.size / 1024 / 1024).toFixed(0);
				sizeWarning = `This file is ${sizeMB} MB. Large files may slow down export or cause issues.`;
			} else {
				sizeWarning = null;
			}
			onfile(file);
		}
		target.value = '';
	}
</script>

<div>
	{#if previewUrl}
		<div class="relative rounded-lg overflow-hidden bg-card border border-border">
			{#if mediaType === 'video'}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={previewUrl} class="w-full h-24 object-cover" muted></video>
			{:else}
				<img src={previewUrl} alt="Upload preview" class="w-full h-24 object-cover" />
			{/if}
			<button
				class="absolute top-1 right-1 w-6 h-6 bg-overlay/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-overlay/80 cursor-pointer"
				onclick={() => fileInput.click()}
			>
				↻
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
			<span class="text-xs">Photo or video (max 30s)</span>
		</button>
	{/if}
	{#if sizeWarning}
		<p class="text-xs text-warning mt-1.5">{sizeWarning}</p>
	{/if}
</div>

<input
	bind:this={fileInput}
	type="file"
	accept="image/*,video/*"
	class="hidden"
	onchange={handleFiles}
/>
