<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		onclick,
		children
	}: {
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	} = $props();

	const baseClasses = 'inline-flex items-center justify-center font-bold rounded-lg border-2 border-border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

	const variantClasses = {
		primary: 'bg-accent text-white shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]',
		secondary: 'bg-warning text-black shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]',
		ghost: 'bg-transparent border-2 border-border hover:bg-primary-light active:bg-primary-light'
	};

	const sizeClasses = {
		sm: 'text-sm px-3 py-1.5',
		md: 'text-sm px-4 py-2',
		lg: 'text-base px-6 py-3'
	};
</script>

<button
	type="button"
	class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]}"
	{disabled}
	{onclick}
>
	{@render children()}
</button>
