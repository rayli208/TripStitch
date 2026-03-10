<script lang="ts">
	let {
		selected = $bindable('#FFFFFF'),
		colors = ['#FFFFFF', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'],
		primaryColor = undefined,
		showInput = false,
		allowClear = false,
		label = ''
	}: {
		selected?: string;
		colors?: string[];
		primaryColor?: string;
		showInput?: boolean;
		allowClear?: boolean;
		label?: string;
	} = $props();

	const otherColors = $derived(
		primaryColor ? colors.filter((c) => c !== primaryColor) : colors
	);

	let hexInput = $state(selected);

	// Sync external changes into the input
	$effect(() => {
		hexInput = selected;
	});

	function handleHexInput(value: string) {
		hexInput = value;
		const cleaned = value.startsWith('#') ? value : '#' + value;
		if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
			selected = cleaned.toUpperCase();
		}
	}
</script>

{#if label}
	<span class="block text-xs text-text-muted mb-1">{label}</span>
{/if}

<div class="flex flex-wrap items-center gap-2">
	{#if primaryColor}
		<button
			class="w-8 h-8 rounded-full border-2 transition-all cursor-pointer {selected === primaryColor ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-border hover:border-primary-medium'}"
			style="background-color: {primaryColor}"
			onclick={() => (selected = primaryColor)}
			aria-label="Select your brand color"
			title="Your color"
		></button>
		<div class="w-px h-6 bg-border"></div>
	{/if}
	{#each otherColors as color}
		<button
			class="w-8 h-8 rounded-full border-2 transition-all cursor-pointer {selected === color ? 'border-accent scale-110' : 'border-border hover:border-primary-medium'}"
			style="background-color: {color}"
			onclick={() => (selected = color)}
			aria-label="Select color {color}"
		></button>
	{/each}

	<!-- Native color picker as fallback -->
	<label class="cursor-pointer" title="Pick custom color">
		<input
			type="color"
			value={selected || '#FFFFFF'}
			oninput={(e) => { selected = (e.target as HTMLInputElement).value.toUpperCase(); }}
			class="sr-only"
		/>
		<div class="w-8 h-8 rounded-full border-2 border-dashed border-border hover:border-primary-medium transition-colors flex items-center justify-center text-text-muted text-xs font-bold">
			+
		</div>
	</label>
</div>

{#if showInput}
	<div class="flex items-center gap-2 mt-2">
		<div
			class="w-7 h-7 rounded-md border-2 border-border flex-shrink-0"
			style="background-color: {selected || '#FFFFFF'}"
		></div>
		<input
			type="text"
			value={hexInput}
			oninput={(e) => handleHexInput((e.target as HTMLInputElement).value)}
			placeholder="#FFFFFF"
			class="w-24 rounded-md border border-border bg-page px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
		/>
		{#if allowClear && selected}
			<button
				class="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
				onclick={() => { selected = ''; hexInput = ''; }}
			>
				Clear
			</button>
		{/if}
	</div>
{/if}
