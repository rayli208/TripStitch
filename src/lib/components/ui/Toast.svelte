<script lang="ts">
	import toast from '$lib/state/toast.svelte';
</script>

{#if toast.toasts.length > 0}
	<div class="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
		{#each toast.toasts as t (t.id)}
			<div
				class="pointer-events-auto max-w-sm w-full px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-slide-up
					{t.type === 'success' ? 'bg-success text-white' : t.type === 'error' ? 'bg-error text-white' : 'bg-card text-text-primary border border-border'}"
			>
				{#if t.type === 'success'}
					<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				{:else if t.type === 'error'}
					<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				{/if}
				<span class="flex-1">{t.message}</span>
				<button
					class="ml-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
					onclick={() => toast.dismiss(t.id)}
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-slide-up {
		animation: slide-up 0.25s ease-out;
	}
</style>
