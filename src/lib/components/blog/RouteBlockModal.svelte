<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { uuid } from '$lib/utils/uuid';
	import { Plus, Trash } from 'phosphor-svelte';

	let {
		open = $bindable(false),
		initialAttrs = null,
		onsave
	}: {
		open?: boolean;
		initialAttrs?: Record<string, unknown> | null;
		onsave: (attrs: Record<string, unknown>) => void;
	} = $props();

	interface Stop {
		id: string;
		order: number;
		name: string;
		description: string;
	}

	let routeId = $state(uuid());
	let title = $state('');
	let stops = $state<Stop[]>([
		{ id: uuid(), order: 0, name: '', description: '' },
		{ id: uuid(), order: 1, name: '', description: '' }
	]);

	$effect(() => {
		if (open && initialAttrs) {
			routeId = initialAttrs.id as string ?? uuid();
			title = initialAttrs.title as string ?? '';
			try {
				const parsed = JSON.parse(initialAttrs.stops as string ?? '[]');
				stops = parsed.length > 0
					? parsed.map((s: Record<string, unknown>, i: number) => ({
						id: s.id as string ?? uuid(),
						order: i,
						name: s.name as string ?? '',
						description: s.description as string ?? ''
					}))
					: [
						{ id: uuid(), order: 0, name: '', description: '' },
						{ id: uuid(), order: 1, name: '', description: '' }
					];
			} catch {
				stops = [
					{ id: uuid(), order: 0, name: '', description: '' },
					{ id: uuid(), order: 1, name: '', description: '' }
				];
			}
		} else if (open && !initialAttrs) {
			routeId = uuid();
			title = '';
			stops = [
				{ id: uuid(), order: 0, name: '', description: '' },
				{ id: uuid(), order: 1, name: '', description: '' }
			];
		}
	});

	function addStop() {
		if (stops.length >= 5) return;
		stops = [...stops, { id: uuid(), order: stops.length, name: '', description: '' }];
	}

	function removeStop(id: string) {
		if (stops.length <= 2) return;
		stops = stops.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
	}

	function handleSave() {
		const serializedStops = stops.map((s) => ({
			id: s.id,
			order: s.order,
			name: s.name || null,
			description: s.description || null
		}));
		onsave({
			id: routeId,
			title: title || 'Route',
			stops: JSON.stringify(serializedStops)
		});
		open = false;
	}

	let hasValidStops = $derived(stops.some((s) => s.name.trim().length > 0));
</script>

<Modal bind:open title={initialAttrs ? 'Edit Route' : 'Add Route'}>
	<div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
		<!-- Route title -->
		<div>
			<label class="block text-xs font-bold text-text-muted mb-1">Route title</label>
			<input
				type="text"
				class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
				bind:value={title}
				placeholder="e.g., Night Out Route"
			/>
		</div>

		<!-- Stops -->
		<div class="space-y-3">
			{#each stops as stop, i}
				<div class="flex gap-3 items-start">
					<div class="flex flex-col items-center flex-shrink-0 pt-2">
						<div class="w-6 h-6 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center border-2 border-border">
							{i + 1}
						</div>
						{#if i < stops.length - 1}
							<div class="w-0.5 h-8 bg-border mt-1"></div>
						{/if}
					</div>
					<div class="flex-1 space-y-1.5">
						<input
							type="text"
							class="w-full bg-page border-2 border-border rounded-lg px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
							bind:value={stop.name}
							placeholder="Stop name"
						/>
						<input
							type="text"
							class="w-full bg-page border-2 border-border rounded-lg px-3 py-1.5 text-xs shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
							bind:value={stop.description}
							placeholder="Description (optional)"
						/>
					</div>
					{#if stops.length > 2}
						<button
							type="button"
							class="mt-2 p-1 text-text-muted hover:text-error cursor-pointer transition-colors"
							onclick={() => removeStop(stop.id)}
						>
							<Trash size={16} />
						</button>
					{/if}
				</div>
			{/each}
		</div>

		{#if stops.length < 5}
			<button
				type="button"
				class="flex items-center gap-2 text-sm font-bold text-accent cursor-pointer hover:text-accent-hover transition-colors"
				onclick={addStop}
			>
				<Plus size={16} weight="bold" />
				Add stop
			</button>
		{/if}
	</div>

	<!-- Actions -->
	<div class="flex gap-3 mt-5">
		<button
			type="button"
			class="flex-1 py-2.5 text-sm font-bold rounded-lg border-2 border-border bg-page hover:bg-accent-light transition-all cursor-pointer"
			onclick={() => (open = false)}
		>
			Cancel
		</button>
		<button
			type="button"
			class="flex-1 py-2.5 text-sm font-bold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer disabled:opacity-50"
			disabled={!hasValidStops}
			onclick={handleSave}
		>
			{initialAttrs ? 'Update' : 'Add Route'}
		</button>
	</div>
</Modal>
