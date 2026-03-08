<script lang="ts">
	import toast from '$lib/state/toast.svelte';
	import { Check, X } from 'phosphor-svelte';
</script>

<div class="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite" aria-atomic="false" role="status">
	{#each toast.toasts as t (t.id)}
		<div
			class="pointer-events-auto max-w-sm w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-slide-up border-2 border-border shadow-[4px_4px_0_var(--color-border)]
				{t.type === 'success' ? 'bg-success text-white' : t.type === 'error' ? 'bg-error text-white' : 'bg-card text-text-primary'}"
			role={t.type === 'error' ? 'alert' : 'status'}
		>
			{#if t.type === 'success'}
				<span class="flex-shrink-0" aria-hidden="true"><Check size={16} weight="bold" /></span>
			{:else if t.type === 'error'}
				<span class="flex-shrink-0" aria-hidden="true"><X size={16} weight="bold" /></span>
			{/if}
			<span class="flex-1">{t.message}</span>
			<button
				class="ml-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
				onclick={() => toast.dismiss(t.id)}
				aria-label="Dismiss"
			>
				<X size={16} weight="bold" />
			</button>
		</div>
	{/each}
</div>

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
