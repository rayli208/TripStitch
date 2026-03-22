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

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-semibold mb-1">Export</h2>
		<p class="text-sm text-text-muted">Export your TripStitch.</p>
	</div>

	{#if !browserSupported}
		<!-- Browser not supported -->
		<div class="text-center py-12">
			<div class="mb-4 text-warning"><Warning size={48} weight="fill" /></div>
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
		<div class="text-center py-12">
			<div class="mb-4 text-error"><XCircle size={48} weight="fill" /></div>
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
		<ExportProgress
			{progress}
			{exportSteps}
			{exportElapsed}
			{exportPaused}
			{oncancel}
		/>
	{:else}
		<!-- Idle state -->
		<div class="text-center py-8 space-y-4">
			<p class="text-sm text-text-muted">Ready to stitch your video.</p>
			{#if estimatedDuration}
				<p class="text-xs text-text-muted">Estimated duration: {estimatedDuration}</p>
			{/if}
			<div class="flex justify-center gap-3">
				<Button variant="ghost" onclick={onback}>Review</Button>
				<Button variant="primary" disabled={!canExport} onclick={onexport}>
					Stitch Video
				</Button>
			</div>
		</div>
	{/if}
</div>
