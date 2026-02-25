<script lang="ts">
	let {
		selected = $bindable('#FFFFFF'),
		colors = ['#FFFFFF', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'],
		primaryColor = undefined
	}: {
		selected?: string;
		colors?: string[];
		primaryColor?: string;
	} = $props();

	const otherColors = $derived(
		primaryColor ? colors.filter((c) => c !== primaryColor) : colors
	);
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if primaryColor}
		<button
			class="w-8 h-8 rounded-full border-2 transition-all cursor-pointer {selected === primaryColor ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-border hover:border-primary-light'}"
			style="background-color: {primaryColor}"
			onclick={() => (selected = primaryColor)}
			aria-label="Select your brand color"
			title="Your color"
		></button>
		<div class="w-px h-6 bg-border"></div>
	{/if}
	{#each otherColors as color}
		<button
			class="w-8 h-8 rounded-full border-2 transition-all cursor-pointer {selected === color ? 'border-accent scale-110' : 'border-border hover:border-primary-light'}"
			style="background-color: {color}"
			onclick={() => (selected = color)}
			aria-label="Select color {color}"
		></button>
	{/each}
</div>
