<script lang="ts">
	import type { ExportStepItem } from '$lib/types';
	import type { AssemblyProgress } from '$lib/services/videoAssembler';

	let {
		progress = null,
		exportSteps = [],
		exportElapsed,
		exportPaused = false,
		oncancel
	}: {
		progress?: AssemblyProgress | null;
		exportSteps?: ExportStepItem[];
		exportElapsed?: number;
		exportPaused?: boolean;
		oncancel?: () => void;
	} = $props();

	let activeStepIndex = $derived.by(() => {
		if (!progress) return -1;
		return exportSteps.findIndex((s) => s.id === progress.step);
	});

	let progressPercent = $derived.by(() => {
		if (activeStepIndex < 0) return 0;
		return Math.round(((activeStepIndex + 0.5) / exportSteps.length) * 100);
	});

	function getStepStatus(stepId: string): 'pending' | 'active' | 'done' {
		if (!progress) return 'pending';
		const thisIdx = exportSteps.findIndex((s) => s.id === stepId);
		if (thisIdx < 0) return 'pending';
		if (thisIdx < activeStepIndex) return 'done';
		if (thisIdx === activeStepIndex) return 'active';
		return 'pending';
	}
</script>

<style>
	@keyframes pulse-glow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	.animate-pulse-glow {
		animation: pulse-glow 1.5s ease-in-out infinite;
	}
</style>

<div class="flex flex-col items-center py-6 gap-5">
	{#if exportPaused}
		<div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/30">
			<svg class="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<p class="text-sm font-medium text-warning">Stitching paused — switch back to continue</p>
		</div>
	{:else}
		<p class="text-base font-medium text-text-primary">
			{progress?.message ?? 'Getting things ready...'}
		</p>
	{/if}

	{#if exportSteps.length > 0}
		<div class="w-full max-w-xs space-y-2">
			{#each exportSteps as step}
				{@const status = getStepStatus(step.id)}
				<div class="flex items-center gap-3 py-1.5">
					<div class="w-7 h-7 flex items-center justify-center flex-shrink-0">
						{#if status === 'done'}
							<svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						{:else if status === 'active'}
							<span class="text-lg animate-pulse-glow">{step.icon}</span>
						{:else}
							<span class="text-lg opacity-30">{step.icon}</span>
						{/if}
					</div>
					<span class="text-sm {status === 'done' ? 'text-text-muted line-through' : status === 'active' ? 'text-text-primary font-medium' : 'text-text-muted'}">
						{step.label}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	<div class="w-full max-w-xs">
		<div class="h-2 bg-border rounded-full overflow-hidden">
			<div
				class="h-full bg-accent rounded-full transition-all duration-500 ease-out"
				style="width: {progressPercent}%"
			></div>
		</div>
		<p class="text-xs text-text-muted text-center mt-1.5">{progressPercent}%</p>
		{#if exportElapsed != null}
			<p class="text-xs text-text-muted text-center mt-1">
				Elapsed: {Math.floor(exportElapsed / 60)}:{String(exportElapsed % 60).padStart(2, '0')}{exportPaused ? ' (paused)' : ''}
			</p>
		{/if}
	</div>

	<p class="text-xs text-text-muted text-center px-4">Keep this tab open and active while your video is being stitched together</p>

	{#if oncancel}
		<button
			class="text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors mt-2"
			onclick={oncancel}
		>
			Cancel export
		</button>
	{/if}
</div>
