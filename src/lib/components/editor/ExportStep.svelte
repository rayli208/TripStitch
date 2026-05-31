<script lang="ts">
	import type { ExportStepItem } from '$lib/types';
	import type { AssemblyProgress } from '$lib/services/videoAssembler';
	import ExportProgress from './ExportProgress.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Warning, XCircle } from 'phosphor-svelte';

	let {
		canExport,
		isExporting = false,
		progress = null,
		error = null,
		browserSupported = true,
		browserWarnings = [],
		exportSteps = [],
		estimatedDuration,
		exportElapsed,
		exportPaused = false,
		onexport,
		onback,
		oncancel,
		onretry
	}: {
		canExport: boolean;
		isExporting?: boolean;
		progress?: AssemblyProgress | null;
		error?: string | null;
		browserSupported?: boolean;
		browserWarnings?: string[];
		exportSteps?: ExportStepItem[];
		estimatedDuration?: string;
		exportElapsed?: number;
		exportPaused?: boolean;
		onexport: () => void;
		onback: () => void;
		oncancel?: () => void;
		onretry?: () => void;
	} = $props();
</script>

<div class="md:max-w-2xl md:mx-auto">
	{#if !browserSupported}
		<!-- Browser not supported -->
		<div class="rounded-2xl border-2 border-border bg-card p-8 md:p-10 shadow-[4px_4px_0_var(--color-border)] text-center">
			<div class="mb-4 text-warning flex justify-center"><Warning size={48} weight="fill" /></div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Browser Not Supported</h3>
			<p class="text-sm text-text-muted mb-4">
				Your browser doesn't support video export. Please use Safari 14.5+, Chrome, or Firefox.
			</p>
			{#each browserWarnings as warning}
				<p class="text-xs text-text-muted">{warning}</p>
			{/each}
			<div class="mt-6">
				<Button variant="ghost" onclick={onback}>Back</Button>
			</div>
		</div>
	{:else if error}
		<!-- Error state -->
		<div class="rounded-2xl border-2 border-border bg-card p-8 md:p-10 shadow-[4px_4px_0_var(--color-border)] text-center">
			<div class="mb-4 text-error flex justify-center"><XCircle size={48} weight="fill" /></div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Export Failed</h3>
			<p class="text-sm text-error mb-6">{error}</p>
			<div class="flex justify-center gap-3">
				<Button variant="ghost" onclick={onback}>Back</Button>
				{#if onretry}
					<Button variant="primary" onclick={onretry}>Try Again</Button>
				{/if}
			</div>
		</div>
	{:else if isExporting}
		<div class="rounded-2xl border-2 border-border bg-card p-6 md:p-8 shadow-[4px_4px_0_var(--color-border)]">
			<div class="text-[11px] font-bold uppercase tracking-wider text-accent mb-1">Step 4 of 6 · Stitching</div>
			<h3 class="text-2xl font-bold text-text-primary mb-1">Building your video</h3>
			<p class="text-sm text-text-muted mb-6">Rendering map animations & transitions. Audio comes next.</p>
			<ExportProgress
				{progress}
				{exportSteps}
				{exportElapsed}
				{exportPaused}
				{oncancel}
			/>
		</div>
	{:else}
		<!-- Idle state -->
		<div class="rounded-2xl border-2 border-border bg-card p-6 md:p-10 shadow-[4px_4px_0_var(--color-border)]">
			<div class="text-[11px] font-bold uppercase tracking-wider text-accent mb-1">Step 4 of 6 · Stitch</div>
			<h2 class="text-2xl font-bold text-text-primary mb-1">Ready to stitch your video</h2>
			<p class="text-sm text-text-muted mb-6">
				We'll render map animations and transitions first. Audio gets added in the next step.
			</p>

			{#if exportSteps.length > 0}
				<div class="space-y-2 mb-6">
					{#each exportSteps as step}
						<div class="flex items-center gap-3 py-1">
							<span class="w-4 h-4 rounded-full border-2 border-border shrink-0"></span>
							<span class="text-sm text-text-secondary">{step.label}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if estimatedDuration}
				<p class="text-xs text-text-muted text-center mb-4">
					Estimated video duration: <span class="font-mono text-text-secondary">{estimatedDuration}</span>
				</p>
			{/if}
			<div class="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2">
				<Button variant="ghost" onclick={onback} class="w-full sm:w-auto">Back to Review</Button>
				<Button
					variant="primary"
					disabled={!canExport}
					onclick={onexport}
					class="w-full sm:w-auto"
				>
					Stitch Video
				</Button>
			</div>
		</div>
	{/if}
</div>
