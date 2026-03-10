<div class="space-y-2 max-w-lg animate-pulse">
	<!-- Account section -->
	<div class="bg-card border-2 border-border rounded-xl p-5 space-y-4 shadow-brutal-sm">
		<div class="h-5 w-20 bg-border/50 rounded"></div>
		<!-- Avatar + fields -->
		<div class="flex items-center gap-4">
			<div class="w-16 h-16 rounded-full bg-border/50"></div>
			<div>
				<div class="h-4 w-24 bg-border/50 rounded mb-2"></div>
				<div class="h-3 w-16 bg-border/50 rounded"></div>
			</div>
		</div>
		{#each Array(3) as _}
			<div>
				<div class="h-3 w-20 bg-border/50 rounded mb-2"></div>
				<div class="h-10 w-full bg-border/50 rounded-lg"></div>
			</div>
		{/each}
	</div>

	<!-- Appearance section -->
	<div class="bg-card border-2 border-border rounded-xl p-5 space-y-4 shadow-brutal-sm">
		<div class="h-5 w-24 bg-border/50 rounded"></div>
		<div class="grid grid-cols-3 gap-2">
			{#each Array(3) as _}
				<div class="h-16 bg-border/50 rounded-xl"></div>
			{/each}
		</div>
	</div>

	<!-- Branding section -->
	<div class="bg-card border-2 border-border rounded-xl p-5 space-y-4 shadow-brutal-sm">
		<div class="h-5 w-20 bg-border/50 rounded"></div>
		<div class="h-16 w-full bg-border/50 rounded-lg border-2 border-dashed border-border"></div>
		<div class="flex gap-2">
			{#each Array(4) as _}
				<div class="w-8 h-8 bg-border/50 rounded-full"></div>
			{/each}
		</div>
	</div>

	<!-- Collapsible sections -->
	{#each Array(2) as _}
		<div class="bg-card border-2 border-border rounded-xl p-5 shadow-brutal-sm">
			<div class="h-5 w-28 bg-border/50 rounded"></div>
		</div>
	{/each}
</div>
