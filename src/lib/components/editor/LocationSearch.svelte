<script lang="ts">
	const PLACES_API_KEY = 'AIzaSyBHM5my2_fF9oy6SBnP_nXP-bWC__0X6lc';

	let {
		onselect
	}: {
		onselect: (place: { name: string; lat: number; lng: number }) => void;
	} = $props();

	let query = $state('');
	let isOpen = $state(false);
	let loading = $state(false);
	let suggestions = $state<{ placeId: string; text: string }[]>([]);
	let debounceTimer: ReturnType<typeof setTimeout>;

	function handleInput() {
		clearTimeout(debounceTimer);
		if (query.length < 2) {
			suggestions = [];
			return;
		}
		debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
	}

	async function fetchSuggestions(input: string) {
		loading = true;
		try {
			const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': PLACES_API_KEY
				},
				body: JSON.stringify({ input })
			});
			const data = await res.json();
			suggestions = (data.suggestions ?? [])
				.filter((s: Record<string, unknown>) => s.placePrediction)
				.map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
					placeId: s.placePrediction.placeId,
					text: s.placePrediction.text.text
				}));
		} catch {
			suggestions = [];
		}
		loading = false;
	}

	async function select(suggestion: { placeId: string; text: string }) {
		isOpen = false;
		query = suggestion.text;
		try {
			const res = await fetch(
				`https://places.googleapis.com/v1/places/${suggestion.placeId}`,
				{
					headers: {
						'X-Goog-Api-Key': PLACES_API_KEY,
						'X-Goog-FieldMask': 'location,displayName'
					}
				}
			);
			const data = await res.json();
			onselect({
				name: suggestion.text,
				lat: data.location.latitude,
				lng: data.location.longitude
			});
			query = '';
		} catch {
			// If detail fetch fails, reset
			query = '';
		}
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.location-search')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative location-search">
	<input
		type="text"
		placeholder="Search for a place..."
		bind:value={query}
		oninput={handleInput}
		onfocus={() => (isOpen = true)}
		class="w-full rounded-lg bg-card border border-border text-text-primary px-3 py-2 text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
	/>

	{#if loading}
		<div class="absolute right-3 top-2.5">
			<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></div>
		</div>
	{/if}

	{#if isOpen && suggestions.length > 0}
		<div class="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
			{#each suggestions as suggestion}
				<button
					class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-border transition-colors cursor-pointer"
					onclick={() => select(suggestion)}
				>
					{suggestion.text}
				</button>
			{/each}
		</div>
	{/if}

	{#if isOpen && !loading && query.length >= 2 && suggestions.length === 0}
		<div class="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-xl p-3">
			<p class="text-sm text-text-muted">No results found</p>
		</div>
	{/if}
</div>
