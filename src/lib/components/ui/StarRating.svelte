<script lang="ts">
	import { Star, StarHalf } from 'phosphor-svelte';

	let {
		rating = null,
		onchange,
		size = 'md',
		readonly = false
	}: {
		rating?: number | null;
		onchange?: (rating: number | null) => void;
		size?: 'sm' | 'md';
		readonly?: boolean;
	} = $props();

	const stars = [1, 2, 3, 4, 5];
	const iconSize = size === 'sm' ? 16 : 20;

	function handleClick(star: number, e: MouseEvent) {
		if (readonly) return;
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const isLeftHalf = clickX < rect.width / 2;
		const value = isLeftHalf ? star - 0.5 : star;
		// Clicking the same value again clears the rating
		const newRating = rating === value ? null : value;
		onchange?.(newRating);
	}
</script>

<div class="flex items-center gap-0.5">
	{#each stars as star}
		{@const filled = (rating ?? 0) >= star}
		{@const halfFilled = !filled && (rating ?? 0) >= star - 0.5}
		<button
			class="relative transition-colors p-0.5 {readonly ? '' : 'cursor-pointer'} {filled || halfFilled ? 'text-amber-400' : readonly ? 'text-border' : 'text-border hover:text-amber-300'}"
			onclick={(e) => handleClick(star, e)}
			title={readonly ? `${rating} stars` : rating === star ? 'Clear rating' : `${star} star${star !== 1 ? 's' : ''}`}
			disabled={readonly}
		>
			{#if halfFilled}
				<span class="relative inline-block" style="width: {iconSize}px; height: {iconSize}px;">
					<span class="absolute inset-0 text-border"><Star size={iconSize} weight="fill" /></span>
					<span class="absolute inset-0 text-amber-400"><StarHalf size={iconSize} weight="fill" /></span>
				</span>
			{:else}
				<Star size={iconSize} weight="fill" />
			{/if}
		</button>
	{/each}
</div>
