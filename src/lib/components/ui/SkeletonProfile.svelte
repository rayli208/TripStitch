<div class="space-y-6 max-w-lg animate-pulse">
	<!-- Heading -->
	<div>
		<div class="h-6 w-36 bg-border/50 rounded mb-2"></div>
		<div class="h-3 w-64 bg-border/50 rounded"></div>
	</div>

	<!-- Input fields -->
	{#each Array(3) as _}
		<div>
			<div class="h-3 w-20 bg-border/50 rounded mb-2"></div>
			<div class="h-10 w-full bg-border/50 rounded-lg"></div>
		</div>
	{/each}

	<!-- Logo upload area -->
	<div>
		<div class="h-3 w-32 bg-border/50 rounded mb-2"></div>
		<div class="h-20 w-full bg-border/50 rounded-lg border-2 border-dashed border-border"></div>
	</div>

	<!-- Color swatches -->
	<div>
		<div class="h-3 w-24 bg-border/50 rounded mb-3"></div>
		<div class="flex gap-2">
			{#each Array(4) as _}
				<div class="w-9 h-9 bg-border/50 rounded-full"></div>
			{/each}
		</div>
	</div>

	<!-- Buttons -->
	<div class="flex gap-3 pt-4">
		<div class="h-10 w-28 bg-border/50 rounded-lg"></div>
		<div class="h-10 w-24 bg-border/50 rounded-lg"></div>
	</div>
</div>
