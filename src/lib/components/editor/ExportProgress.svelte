<script lang="ts">
	import type { ExportStepItem } from '$lib/types';
	import type { AssemblyProgress } from '$lib/services/videoAssembler';
	import { Warning, Check } from 'phosphor-svelte';

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

	let rawStepIndex = $derived.by(() => {
		if (!progress) return -1;
		return exportSteps.findIndex((s) => s.id === progress.step);
	});

	// Track highest step index reached so progress never jumps backward
	let highestStepIndex = $state(-1);
	$effect(() => {
		if (rawStepIndex > highestStepIndex) highestStepIndex = rawStepIndex;
	});

	let activeStepIndex = $derived(rawStepIndex >= 0 ? rawStepIndex : highestStepIndex);

	let progressPercent = $derived.by(() => {
		if (activeStepIndex < 0) return 0;
		return Math.round(((activeStepIndex + 0.5) / exportSteps.length) * 100);
	});

	let prevStep = $derived(activeStepIndex > 0 ? exportSteps[activeStepIndex - 1] : null);
	let currentStep = $derived(activeStepIndex >= 0 ? exportSteps[activeStepIndex] : null);
	let nextStep = $derived(activeStepIndex >= 0 && activeStepIndex < exportSteps.length - 1 ? exportSteps[activeStepIndex + 1] : null);

	let stepLabel = $derived(
		activeStepIndex >= 0
			? `Step ${activeStepIndex + 1} of ${exportSteps.length}`
			: 'Preparing...'
	);
</script>

<style>
	@keyframes pulse-dot {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
	.dot-pulse {
		animation: pulse-dot 1.2s ease-in-out infinite;
	}
</style>

<div class="flex flex-col items-center py-6 gap-5">
	{#if exportPaused}
		<div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/30">
			<Warning size={16} weight="bold" class="text-warning shrink-0" />
			<p class="text-sm font-medium text-warning">Stitching paused — switch back to continue</p>
		</div>
	{/if}

	<!-- Step cycling display -->
	{#if exportSteps.length > 0}
		<div class="w-full max-w-xs space-y-1.5">
			{#if prevStep}
				<div class="flex items-center gap-2.5 pl-1">
					<Check size={14} weight="bold" class="text-success shrink-0" />
					<span class="text-xs text-text-muted line-through">{prevStep.label}</span>
				</div>
			{/if}

			{#if currentStep}
				<div class="flex items-center gap-2.5 pl-1 py-1">
					<span class="dot-pulse flex shrink-0">
						<span class="w-2.5 h-2.5 rounded-full bg-accent"></span>
					</span>
					<span class="text-sm text-text-primary font-semibold">{currentStep.label}</span>
				</div>
			{/if}

			{#if nextStep}
				<div class="flex items-center gap-2.5 pl-1">
					<span class="w-2.5 h-2.5 rounded-full bg-border shrink-0"></span>
					<span class="text-xs text-text-muted/50">{nextStep.label}</span>
				</div>
			{/if}
		</div>
	{:else}
		<p class="text-sm text-text-primary font-medium">
			{progress?.message ?? 'Getting things ready...'}
		</p>
	{/if}

	<!-- Progress bar + info -->
	<div class="w-full max-w-xs">
		<div class="h-2 bg-border/40 rounded-full overflow-hidden">
			<div
				class="h-full bg-accent rounded-full transition-all duration-500 ease-out"
				style="width: {progressPercent}%"
			></div>
		</div>
		<div class="flex items-center justify-between mt-1.5">
			<span class="text-xs text-text-muted">{stepLabel}</span>
			<span class="text-xs text-text-muted">
				{progressPercent}%
				{#if exportElapsed != null}
					· {Math.floor(exportElapsed / 60)}:{String(exportElapsed % 60).padStart(2, '0')}{exportPaused ? ' (paused)' : ''}
				{/if}
			</span>
		</div>
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
