<script lang="ts">
	import { Upload } from 'phosphor-svelte';

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
	let dragOver = $state(false);

	function processFile(file: File) {
		if (file.size > SIZE_LIMIT) {
			const sizeMB = (file.size / 1024 / 1024).toFixed(0);
			sizeWarning = `This file is ${sizeMB} MB. Large files may slow down export or cause issues.`;
		} else {
			sizeWarning = null;
		}
		onfile(file);
	}

	function handleFiles(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (files) {
			for (const file of files) {
				processFile(file);
			}
		}
		target.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (files) {
			for (const file of files) {
				if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
					processFile(file);
				}
			}
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
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
				<Upload size={12} weight="bold" />
			</button>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<button
			class="w-full h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary-light hover:text-text-secondary transition-colors cursor-pointer {dragOver ? 'border-accent bg-accent/5' : 'border-border'}"
			onclick={() => fileInput.click()}
			ondragover={handleDragOver}
			ondragenter={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			<Upload size={20} weight="bold" />
			<span class="text-xs mt-1">{dragOver ? 'Drop files here' : 'Photos or videos (max 30s each)'}</span>
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
	multiple
	class="hidden"
	onchange={handleFiles}
/>
