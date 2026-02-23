<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title = '',
		children
	}: {
		open?: boolean;
		title?: string;
		children: Snippet;
	} = $props();

	let dialogEl: HTMLDivElement | undefined;

	// Trap focus inside the modal
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		if (e.key !== 'Tab' || !dialogEl) return;

		const focusable = dialogEl.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// Auto-focus the dialog when it opens
	$effect(() => {
		if (open && dialogEl) {
			const firstFocusable = dialogEl.querySelector<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			firstFocusable?.focus();
		}
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4"
		role="dialog"
		aria-modal="true"
		aria-label={title || 'Dialog'}
		onkeydown={handleKeydown}
	>
		<div class="absolute inset-0" onclick={() => (open = false)} role="presentation"></div>
		<div class="relative bg-card border border-border rounded-xl w-full max-w-md p-6" bind:this={dialogEl}>
			{#if title}
				<h2 class="text-lg font-semibold text-text-primary mb-4">{title}</h2>
			{/if}
			{@render children()}
		</div>
	</div>
{/if}
