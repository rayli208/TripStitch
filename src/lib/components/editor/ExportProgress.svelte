<script lang="ts">
	import type { ExportStepItem } from '$lib/types';
	import type { AssemblyProgress } from '$lib/services/videoAssembler';
	import { Warning, CheckCircle } from 'phosphor-svelte';

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

	let stepLabel = $derived(
		activeStepIndex >= 0
			? `Step ${activeStepIndex + 1} of ${exportSteps.length}`
			: 'Preparing...'
	);

	function formatTime(sec: number): string {
		return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
	}

	// ── Stable remaining-time estimate ──
	// The raw `(elapsed / pct) * 100 - elapsed` extrapolation jumps around because:
	//  (a) progress advances in big chunks per step, not smoothly
	//  (b) different steps take wildly different times (a clip render is much
	//      longer than a title card), so early steps mislead the projection.
	// We fix this with two changes:
	//  1. Smooth the rate (progress / elapsed) using an exponentially-weighted
	//     moving average so a single fast/slow tick can't dominate.
	//  2. Make the displayed estimate monotonic — it can only decrease (or hold
	//     steady) once it starts showing. Real-world ETAs feel honest when they
	//     count down, jarring when they count back up.
	let smoothedRate = $state<number | null>(null); // percent-per-second
	let lastShownRemain = $state<number | null>(null);
	let lastSampleTime = $state(0);

	$effect(() => {
		if (exportPaused || exportElapsed == null || progressPercent <= 0) return;
		// Sample at most every ~0.5s of elapsed time to avoid noisy jitter
		if (Math.abs(exportElapsed - lastSampleTime) < 0.5) return;
		lastSampleTime = exportElapsed;

		const instantRate = progressPercent / Math.max(exportElapsed, 1);
		// EWMA: weight new sample lighter so the rate doesn't lurch
		smoothedRate = smoothedRate == null ? instantRate : smoothedRate * 0.75 + instantRate * 0.25;

		const remainingPct = Math.max(0, 100 - progressPercent);
		const rawRemain = remainingPct / Math.max(smoothedRate, 0.0001);
		if (!isFinite(rawRemain) || rawRemain > 60 * 60) return;
		const newRemain = Math.round(rawRemain);
		// Monotonic: only update if we've come down (or first sample).
		// Allow a small upward bump (≤ 3s) to avoid getting stuck if we
		// genuinely fall behind.
		if (lastShownRemain == null || newRemain < lastShownRemain || newRemain - lastShownRemain > 3) {
			lastShownRemain = newRemain;
		}
	});

	// Reset when export starts fresh
	$effect(() => {
		if (exportElapsed == null || exportElapsed === 0) {
			smoothedRate = null;
			lastShownRemain = null;
			lastSampleTime = 0;
		}
	});

	let remainingEstimate = $derived.by<string | null>(() => {
		if (lastShownRemain == null || lastShownRemain < 0) return null;
		return `~${formatTime(lastShownRemain)}`;
	});
</script>

<style>
	@keyframes pulse-dot {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(0.85); }
	}
	.dot-pulse {
		animation: pulse-dot 1.2s ease-in-out infinite;
	}
</style>

<div class="space-y-5">
	{#if exportPaused}
		<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30">
			<Warning size={16} weight="bold" class="text-warning shrink-0" />
			<p class="text-sm font-medium text-warning">Stitching paused — switch back to continue</p>
		</div>
	{/if}

	{#if exportSteps.length > 0}
		<ul class="space-y-2">
			{#each exportSteps as step, i}
				<li class="flex items-center gap-3 py-0.5">
					{#if i < activeStepIndex}
						<CheckCircle size={18} weight="fill" class="text-success shrink-0" />
						<span class="text-sm text-text-muted line-through decoration-1">{step.label}</span>
					{:else if i === activeStepIndex}
						<span class="dot-pulse w-[18px] h-[18px] rounded-full border-2 border-accent flex items-center justify-center shrink-0">
							<span class="w-2 h-2 rounded-full bg-accent"></span>
						</span>
						<span class="text-sm font-semibold text-text-primary">{step.label}</span>
					{:else}
						<span class="w-[18px] h-[18px] rounded-full border-2 border-border shrink-0"></span>
						<span class="text-sm text-text-muted">{step.label}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-text-primary font-medium">
			{progress?.message ?? 'Getting things ready...'}
		</p>
	{/if}

	<!-- Progress bar + info -->
	<div>
		<div class="h-2 bg-border/40 rounded-full overflow-hidden">
			<div
				class="h-full bg-accent rounded-full transition-all duration-500 ease-out"
				style="width: {progressPercent}%"
			></div>
		</div>
		<div class="flex items-center justify-between mt-1.5 text-xs text-text-muted">
			<span>{stepLabel}</span>
			<span class="font-mono">
				{progressPercent}%
				{#if exportElapsed != null}
					· {formatTime(exportElapsed)} elapsed{exportPaused ? ' (paused)' : ''}
				{/if}
				{#if remainingEstimate}
					· {remainingEstimate} remaining
				{/if}
			</span>
		</div>
	</div>

	<div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30">
		<Warning size={14} weight="bold" class="text-warning shrink-0 mt-0.5" />
		<p class="text-xs text-warning">Keep this tab open and active. Switching tabs can pause the render.</p>
	</div>

	{#if oncancel}
		<div class="text-center">
			<button
				class="text-sm text-text-muted hover:text-error cursor-pointer transition-colors underline-offset-2 hover:underline"
				onclick={oncancel}
			>
				Cancel export
			</button>
		</div>
	{/if}
</div>
