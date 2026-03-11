<script lang="ts">
	import type { Location, TransportMode, MapStyle, TripTag, TripVisibility, AspectRatio } from '$lib/types';
	import { haversineDistance, estimateTravelTime, suggestTransportMode } from '$lib/utils/distance';
	import { TRIP_TAGS } from '$lib/constants/tags';
	import TransportPicker from './TransportPicker.svelte';
	import RoutePreviewMap from './RoutePreviewMap.svelte';
	import VideoPreview from './VideoPreview.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { DotsSixVertical, X, Star, StarHalf, Microphone, Car, PersonSimpleHike, Buildings, SunHorizon, Backpack, ForkKnife, Mountains, Leaf, Bank, Camera } from 'phosphor-svelte';
	import type { Component } from 'svelte';

	const TAG_ICONS: Record<string, Component> = {
		'Road Trip': Car, 'Hiking': PersonSimpleHike, 'City Break': Buildings,
		'Beach': SunHorizon, 'Backpacking': Backpack, 'Foodie': ForkKnife,
		'Adventure': Mountains, 'Nature': Leaf, 'Cultural': Bank, 'Photography': Camera
	};

	let {
		locations,
		mapStyle = 'streets',
		titleColor = '#FFFFFF',
		tags = $bindable<TripTag[]>([]),
		visibility = $bindable<TripVisibility>('public'),
		title = '',
		titleDescription = '',
		fontId = 'inter',
		secondaryColor = '#0a0f1e',
		titleMediaFile = null,
		logoUrl = null,
		showLogoOnTitle = false,
		aspectRatio = '9:16',
		username = '',
		displayName = '',
		socialLinks = {},
		estimatedDuration = '',
		hasOutro = false,
		canShowOutro = false,
		includeOutro = $bindable(false),
		onremove,
		onmove,
		ontransport,
		onlabel,
		onnext,
		onback
	}: {
		locations: Location[];
		mapStyle?: MapStyle;
		titleColor?: string;
		tags?: TripTag[];
		visibility?: TripVisibility;
		title?: string;
		titleDescription?: string;
		fontId?: string;
		secondaryColor?: string;
		titleMediaFile?: File | null;
		logoUrl?: string | null;
		showLogoOnTitle?: boolean;
		aspectRatio?: AspectRatio;
		username?: string;
		displayName?: string;
		socialLinks?: { instagram?: string; youtube?: string; tiktok?: string; website?: string };
		estimatedDuration?: string;
		hasOutro?: boolean;
		canShowOutro?: boolean;
		includeOutro?: boolean;
		onremove: (id: string) => void;
		onmove: (from: number, to: number) => void;
		ontransport: (id: string, mode: TransportMode) => void;
		onlabel: (id: string, label: string) => void;
		onnext: () => void;
		onback: () => void;
	} = $props();

	function toggleTag(tag: TripTag) {
		if (tags.includes(tag)) {
			tags = tags.filter((t) => t !== tag);
		} else {
			tags = [...tags, tag];
		}
	}

	// Stats
	let totalMiles = $derived(() => {
		let total = 0;
		for (let i = 1; i < locations.length; i++) {
			total += haversineDistance(
				locations[i - 1].lat, locations[i - 1].lng,
				locations[i].lat, locations[i].lng
			);
		}
		return total;
	});

	let totalMinutes = $derived(() => {
		let total = 0;
		for (let i = 1; i < locations.length; i++) {
			const dist = haversineDistance(
				locations[i - 1].lat, locations[i - 1].lng,
				locations[i].lat, locations[i].lng
			);
			const mode = locations[i].transportMode ?? 'drove';
			total += estimateTravelTime(dist, mode);
		}
		return total;
	});

	let mediaCount = $derived(locations.reduce((sum, l) => sum + l.clips.filter((c) => c.file).length, 0));

	// Location drag-and-drop state
	let locDragFromIndex: number | null = $state(null);
	let locDragOverIndex: number | null = $state(null);

	function handleLocDragStart(e: DragEvent, index: number) {
		locDragFromIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleLocDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		locDragOverIndex = index;
	}

	function handleLocDrop(e: DragEvent, index: number) {
		e.preventDefault();
		if (locDragFromIndex !== null && locDragFromIndex !== index) {
			onmove(locDragFromIndex, index);
		}
		locDragFromIndex = null;
		locDragOverIndex = null;
	}

	function handleLocDragEnd() {
		locDragFromIndex = null;
		locDragOverIndex = null;
	}
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-xl font-semibold mb-1">Review Your Trip</h2>
		<p class="text-sm text-text-muted">
			Drag to reorder stops, pick how you traveled between them, and review your media.
		</p>
	</div>

	<!-- Stats bar -->
	<div class="flex items-center justify-center gap-4 py-3 px-4 bg-card rounded-xl border border-border">
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">{locations.length}</p>
			<p class="text-xs text-text-muted">stops</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">
				{totalMiles() < 10 ? totalMiles().toFixed(1) : Math.round(totalMiles())}
			</p>
			<p class="text-xs text-text-muted">miles</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">~{Math.round(totalMinutes())}</p>
			<p class="text-xs text-text-muted">min</p>
		</div>
		<div class="w-px h-8 bg-border"></div>
		<div class="text-center">
			<p class="text-lg font-bold text-text-primary">{mediaCount}</p>
			<p class="text-xs text-text-muted">clips</p>
		</div>
	</div>

	<!-- Tags -->
	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Tags</span>
		<div class="flex flex-wrap gap-1.5">
			{#each TRIP_TAGS as tag}
				{@const TagIcon = TAG_ICONS[tag.value]}
				<button
					class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer
						{tags.includes(tag.value) ? 'bg-accent text-white' : 'bg-card border border-border text-text-muted hover:bg-border'}"
					onclick={() => toggleTag(tag.value)}
				>
					{#if TagIcon}<TagIcon size={14} weight="bold" />{/if}
					<span>{tag.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Visibility — segmented control -->
	<div>
		<span class="block text-sm font-medium text-text-secondary mb-2">Visibility</span>
		<div class="flex rounded-lg border border-border bg-card overflow-hidden">
			<button
				class="flex-1 py-2 text-xs font-medium transition-colors cursor-pointer
					{visibility === 'public' ? 'bg-accent text-white' : 'text-text-muted hover:bg-card-hover'}"
				onclick={() => (visibility = 'public')}
			>Public</button>
			<button
				class="flex-1 py-2 text-xs font-medium border-x border-border transition-colors cursor-pointer
					{visibility === 'unlisted' ? 'bg-accent text-white' : 'text-text-muted hover:bg-card-hover'}"
				onclick={() => (visibility = 'unlisted')}
			>Unlisted</button>
			<button
				class="flex-1 py-2 text-xs font-medium transition-colors cursor-pointer
					{visibility === 'private' ? 'bg-accent text-white' : 'text-text-muted hover:bg-card-hover'}"
				onclick={() => (visibility = 'private')}
			>Private</button>
		</div>
	</div>

	<!-- Outro toggle -->
	{#if canShowOutro}
		<div class="flex items-center justify-between py-3 px-4 bg-card rounded-xl border border-border">
			<div>
				<span class="text-sm font-medium text-text-primary">Outro card</span>
				<p class="text-xs text-text-muted">Show your name & socials at the end</p>
			</div>
			<button
				class="relative w-10 h-6 rounded-full transition-colors cursor-pointer {includeOutro ? 'bg-accent' : 'bg-border'}"
				onclick={() => (includeOutro = !includeOutro)}
				title="Toggle outro card"
			>
				<span class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform {includeOutro ? 'translate-x-4' : ''}"></span>
			</button>
		</div>
	{/if}

	<!-- Map preview -->
	{#if locations.length >= 2}
		<RoutePreviewMap {locations} {mapStyle} {titleColor} />
	{/if}

	<!-- Video preview -->
	<VideoPreview
		{title}
		{titleColor}
		{titleDescription}
		{fontId}
		{secondaryColor}
		{titleMediaFile}
		{logoUrl}
		{showLogoOnTitle}
		{locations}
		{aspectRatio}
		{username}
		{displayName}
		{socialLinks}
		{estimatedDuration}
		{hasOutro}
	/>

	<!-- Location list -->
	<div class="space-y-0">
		{#each locations as loc, i (loc.id)}
			<!-- Transport picker between stops -->
			{#if i > 0}
				<div class="flex items-center gap-2 py-2 pl-6">
					<div class="w-px h-4 bg-border"></div>
					<TransportPicker
						mode={loc.transportMode}
						onchange={(mode) => ontransport(loc.id, mode)}
					/>
					{#if !loc.transportMode}
						<span class="text-xs text-text-muted italic">
							suggestion: {suggestTransportMode(locations[i-1].lat, locations[i-1].lng, loc.lat, loc.lng)}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Location row -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex items-center gap-3 p-3 bg-card border rounded-xl transition-colors
					{locDragOverIndex === i && locDragFromIndex !== i
					? 'border-accent bg-accent/5'
					: 'border-border'}"
				draggable="true"
				ondragstart={(e) => handleLocDragStart(e, i)}
				ondragover={(e) => handleLocDragOver(e, i)}
				ondrop={(e) => handleLocDrop(e, i)}
				ondragend={handleLocDragEnd}
			>
				<!-- Drag handle -->
				<div class="cursor-grab text-text-muted flex-shrink-0">
					<DotsSixVertical size={16} weight="bold" />
				</div>

				<!-- Order number -->
				<div class="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
					{i + 1}
				</div>

				<!-- Media thumbnail -->
				<div class="w-10 h-10 rounded-lg overflow-hidden bg-card flex-shrink-0">
					{#if loc.clips[0]?.previewUrl}
						{#if loc.clips[0].type === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={loc.clips[0].previewUrl} class="w-full h-full object-cover" muted></video>
						{:else}
							<img src={loc.clips[0].previewUrl} alt={loc.name} class="w-full h-full object-cover" />
						{/if}
					{:else}
						<div class="w-full h-full flex items-center justify-center text-text-muted text-xs">
							--
						</div>
					{/if}
				</div>

				<!-- Name + clip count + rating -->
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-text-primary truncate">{loc.label || loc.name.split(',')[0]}</p>
					<div class="flex items-center gap-2">
						{#if loc.clips.length > 0}
							<p class="text-xs text-text-muted">{loc.clips.length} clip{loc.clips.length !== 1 ? 's' : ''}</p>
						{:else if i === 0}
							<p class="text-xs text-text-muted">Starting point</p>
						{/if}
						{#if loc.rating}
							<div class="flex items-center gap-0.5">
								{#each Array(5) as _, s}
									{#if loc.rating >= s + 1}
										<span class="text-amber-400"><Star size={12} weight="fill" /></span>
									{:else if loc.rating >= s + 0.5}
										<span class="relative inline-block" style="width:12px;height:12px">
											<span class="absolute inset-0 text-border"><Star size={12} weight="fill" /></span>
											<span class="absolute inset-0 text-amber-400"><StarHalf size={12} weight="fill" /></span>
										</span>
									{:else}
										<span class="text-border"><Star size={12} weight="fill" /></span>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Delete -->
				<button
					class="text-text-muted hover:text-error transition-colors cursor-pointer p-1 flex-shrink-0"
					onclick={() => onremove(loc.id)}
					title="Remove location"
				>
					<X size={16} weight="bold" />
				</button>
			</div>
		{/each}
	</div>

	<!-- Audio reminder -->
	<div class="flex items-start gap-3 p-3.5 rounded-xl bg-accent/5 border border-accent/20">
		<div class="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
			<Microphone size={16} weight="bold" class="text-accent" />
		</div>
		<div>
			<p class="text-sm font-medium text-text-primary">Add voice-over & music</p>
			<p class="text-xs text-text-muted">Record narration and pick a soundtrack after stitching.</p>
		</div>
	</div>

	<!-- Bottom nav -->
	<div class="flex justify-between pt-2">
		<Button variant="ghost" onclick={onback}>Locations</Button>
		<Button variant="primary" onclick={onnext}>
			Stitch Video
		</Button>
	</div>
</div>
