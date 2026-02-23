<script lang="ts">
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
	const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

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
			<svg class={sizeClass} viewBox="0 0 20 20" fill="currentColor">
				<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
			</svg>
		</button>
	{/each}
</div>
