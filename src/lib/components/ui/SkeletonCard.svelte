<script lang="ts">
	let { count = 3 }: { count?: number } = $props();
</script>

<div class="space-y-3">
	{#each Array(count) as _}
		<div class="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
			<!-- Title row -->
			<div class="flex items-center justify-between">
				<div class="h-5 w-40 bg-border/50 rounded"></div>
				<div class="h-4 w-16 bg-border/50 rounded"></div>
			</div>
			<!-- Subtitle -->
			<div class="h-3 w-28 bg-border/50 rounded"></div>
			<!-- Location names -->
			<div class="flex gap-2">
				<div class="h-3 w-20 bg-border/50 rounded"></div>
				<div class="h-3 w-24 bg-border/50 rounded"></div>
				<div class="h-3 w-16 bg-border/50 rounded"></div>
			</div>
			<!-- Button row -->
			<div class="flex items-center justify-between pt-1">
				<div class="h-8 w-20 bg-border/50 rounded-lg"></div>
				<div class="h-8 w-8 bg-border/50 rounded-lg"></div>
			</div>
		</div>
	{/each}
</div>
