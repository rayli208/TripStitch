<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import LocationSearch from '$lib/components/editor/LocationSearch.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import { BLOG_LOCATION_CATEGORIES } from '$lib/constants/blog';
	import { uuid } from '$lib/utils/uuid';
	import type { PriceTier } from '$lib/types';

	let {
		open = $bindable(false),
		initialAttrs = null,
		onsave
	}: {
		open?: boolean;
		initialAttrs?: Record<string, unknown> | null;
		onsave: (attrs: Record<string, unknown>) => void;
	} = $props();

	let id = $state(initialAttrs?.id as string ?? uuid());
	let name = $state(initialAttrs?.name as string ?? '');
	let label = $state(initialAttrs?.label as string ?? '');
	let description = $state(initialAttrs?.description as string ?? '');
	let lat = $state(initialAttrs?.lat as number ?? 0);
	let lng = $state(initialAttrs?.lng as number ?? 0);
	let city = $state(initialAttrs?.city as string ?? '');
	let stateName = $state(initialAttrs?.state as string ?? '');
	let country = $state(initialAttrs?.country as string ?? '');
	let rating = $state<number | null>(initialAttrs?.rating as number ?? 0);
	let priceTier = $state<PriceTier | ''>(initialAttrs?.priceTier as PriceTier ?? '');
	let hours = $state(initialAttrs?.hours as string ?? '');
	let websiteUrl = $state(initialAttrs?.websiteUrl as string ?? '');
	let instagramHandle = $state(initialAttrs?.instagramHandle as string ?? '');
	let category = $state(initialAttrs?.category as string ?? '');
	let tips = $state(initialAttrs?.tips as string ?? '');
	let rank = $state(initialAttrs?.rank as number | null ?? null);
	let hasPlace = $state(!!initialAttrs?.name);

	$effect(() => {
		if (open && initialAttrs) {
			id = initialAttrs.id as string ?? uuid();
			name = initialAttrs.name as string ?? '';
			label = initialAttrs.label as string ?? '';
			description = initialAttrs.description as string ?? '';
			lat = initialAttrs.lat as number ?? 0;
			lng = initialAttrs.lng as number ?? 0;
			city = initialAttrs.city as string ?? '';
			stateName = initialAttrs.state as string ?? '';
			country = initialAttrs.country as string ?? '';
			rating = initialAttrs.rating as number ?? 0;
			priceTier = initialAttrs.priceTier as PriceTier ?? '';
			hours = initialAttrs.hours as string ?? '';
			websiteUrl = initialAttrs.websiteUrl as string ?? '';
			instagramHandle = initialAttrs.instagramHandle as string ?? '';
			category = initialAttrs.category as string ?? '';
			tips = initialAttrs.tips as string ?? '';
			rank = initialAttrs.rank as number | null ?? null;
			hasPlace = !!initialAttrs.name;
		} else if (open && !initialAttrs) {
			id = uuid();
			name = '';
			label = '';
			description = '';
			lat = 0;
			lng = 0;
			city = '';
			stateName = '';
			country = '';
			rating = 0;
			priceTier = '';
			hours = '';
			websiteUrl = '';
			instagramHandle = '';
			category = '';
			tips = '';
			rank = null;
			hasPlace = false;
		}
	});

	function handlePlaceSelect(place: { name: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null }) {
		name = place.name;
		label = place.name.split(',')[0];
		lat = place.lat;
		lng = place.lng;
		city = place.city ?? '';
		stateName = place.state ?? '';
		country = place.country ?? '';
		hasPlace = true;
	}

	function handleSave() {
		onsave({
			id,
			name,
			label: label || null,
			description: description || null,
			lat,
			lng,
			city: city || null,
			state: stateName || null,
			country: country || null,
			rating: rating || null,
			priceTier: priceTier || null,
			imageUrls: '[]',
			websiteUrl: websiteUrl || null,
			instagramHandle: instagramHandle || null,
			hours: hours || null,
			rank,
			category: category || null,
			tips: tips || null
		});
		open = false;
	}

	const priceTiers: PriceTier[] = ['$', '$$', '$$$', '$$$$'];
</script>

<Modal bind:open title={initialAttrs ? 'Edit Location' : 'Add Location'}>
	{#if !hasPlace}
		<!-- Search phase: no overflow container so dropdown isn't clipped -->
		<div class="space-y-4">
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Search for a place</label>
				<LocationSearch onselect={handlePlaceSelect} />
			</div>
			<p class="text-xs text-text-muted text-center">Search for a venue, landmark, or address to add it to your blog.</p>
		</div>
	{:else}
		<!-- Details phase: scrollable form -->
		<div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
			<div class="p-3 bg-accent-light rounded-lg border-2 border-border">
				<div class="font-bold text-sm">{label || name}</div>
				<div class="text-xs text-text-muted">{[city, stateName, country].filter(Boolean).join(', ')}</div>
				<button type="button" class="text-xs text-accent hover:text-accent-hover mt-1 cursor-pointer transition-colors" onclick={() => { hasPlace = false; }}>Change place</button>
			</div>

			<!-- Rank -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Rank # (optional)</label>
				<input
					type="number"
					min="1"
					class="w-20 bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={rank}
					placeholder="#"
				/>
			</div>

			<!-- Label -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Display name</label>
				<input
					type="text"
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={label}
					placeholder="Short name"
				/>
			</div>

			<!-- Category -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Category</label>
				<select
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={category}
				>
					<option value="">None</option>
					{#each BLOG_LOCATION_CATEGORIES as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
			</div>

			<!-- Rating -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Rating</label>
				<StarRating rating={rating} onchange={(v) => rating = v} />
			</div>

			<!-- Price tier -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Price tier</label>
				<div class="flex gap-2">
					{#each priceTiers as tier}
						<button
							type="button"
							class="px-3 py-1.5 text-sm font-bold rounded-lg border-2 border-border cursor-pointer transition-all {priceTier === tier ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
							onclick={() => priceTier = priceTier === tier ? '' : tier}
						>
							{tier}
						</button>
					{/each}
				</div>
			</div>

			<!-- Hours -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Hours</label>
				<input
					type="text"
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={hours}
					placeholder="e.g., Open til 2 AM Fri-Sat"
				/>
			</div>

			<!-- Description -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Description</label>
				<textarea
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent resize-none"
					rows="2"
					bind:value={description}
					placeholder="Why this place matters..."
				></textarea>
			</div>

			<!-- Tips -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Pro tip (optional)</label>
				<input
					type="text"
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={tips}
					placeholder="e.g., Get here before 10 PM"
				/>
			</div>

			<!-- Website & Instagram -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs font-bold text-text-muted mb-1">Website</label>
					<input
						type="url"
						class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
						bind:value={websiteUrl}
						placeholder="https://..."
					/>
				</div>
				<div>
					<label class="block text-xs font-bold text-text-muted mb-1">Instagram</label>
					<input
						type="text"
						class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
						bind:value={instagramHandle}
						placeholder="@handle"
					/>
				</div>
			</div>
		</div>
	{/if}

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
			disabled={!hasPlace}
			onclick={handleSave}
		>
			{initialAttrs ? 'Update' : 'Add Location'}
		</button>
	</div>
</Modal>
