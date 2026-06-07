<script lang="ts">
	import { ShareNetwork, ArrowRight, Check } from 'phosphor-svelte';

	let {
		username,
		userDisplayName,
		onshare,
		shareLabel = 'Share',
		copied = false
	}: {
		username: string;
		userDisplayName: string;
		onshare: () => void;
		shareLabel?: string;
		copied?: boolean;
	} = $props();
</script>

<footer class="mt-12 pt-6 border-t-2 border-border space-y-4">
	<p class="text-center text-sm text-text-muted">
		Made with <a href="/" class="font-extrabold text-accent hover:underline">TripStitch</a>
	</p>
	<div class="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-center">
		<button
			type="button"
			class="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border-2 border-border bg-card hover:bg-accent-light transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)]"
			onclick={onshare}
		>
			{#if copied}
				<Check size={14} weight="bold" class="text-success" />
				Copied!
			{:else}
				<ShareNetwork size={14} weight="bold" />
				{shareLabel}
			{/if}
		</button>
		<a
			href="/u/{username}"
			class="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
		>
			View {userDisplayName}'s profile
			<ArrowRight size={14} weight="bold" />
		</a>
	</div>
</footer>
