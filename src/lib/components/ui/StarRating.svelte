<script lang="ts">
	import { Star } from 'phosphor-svelte';

	let {
		rating = null,
		onchange,
		size = 'md'
	}: {
		rating?: number | null;
		onchange?: (rating: number | null) => void;
		size?: 'sm' | 'md';
	} = $props();

	const stars = [1, 2, 3, 4, 5];
	const iconSize = size === 'sm' ? 16 : 20;

	function handleClick(star: number) {
		// Clicking the same star again clears the rating
		const newRating = rating === star ? null : star;
		onchange?.(newRating);
	}
</script>

<div class="flex items-center gap-0.5">
	{#each stars as star}
		<button
			class="transition-colors cursor-pointer p-0.5 {star <= (rating ?? 0) ? 'text-amber-400' : 'text-border hover:text-amber-300'}"
			onclick={() => handleClick(star)}
			title={rating === star ? 'Clear rating' : `${star} star${star !== 1 ? 's' : ''}`}
		>
			<Star size={iconSize} weight="fill" />
		</button>
	{/each}
</div>
