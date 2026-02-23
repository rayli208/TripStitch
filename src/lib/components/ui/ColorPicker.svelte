<script lang="ts">
	let {
		selected = $bindable('#FFFFFF'),
		colors = ['#FFFFFF', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
	}: {
		selected?: string;
		colors?: string[];
	} = $props();
</script>

<div class="flex flex-wrap gap-2">
	{#each colors as color}
		<button
			class="w-8 h-8 rounded-full border-2 transition-all cursor-pointer {selected === color ? 'border-accent scale-110' : 'border-border hover:border-primary-light'}"
			style="background-color: {color}"
			onclick={() => (selected = color)}
			aria-label="Select color {color}"
		></button>
	{/each}
</div>
