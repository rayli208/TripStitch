<script lang="ts">
	import LocationCardView from './LocationCardView.svelte';
	import RouteBlockView from './RouteBlockView.svelte';
	import { extractYoutubeId } from './extensions/youtubeEmbed';
	import { extractHeadings } from '$lib/utils/blogToc';
	import type { BlogLocation, BlogRoute, RouteStop, PriceTier } from '$lib/types';
	import { X } from 'phosphor-svelte';

	let { content }: { content: Record<string, unknown> } = $props();

	let lightboxSrc = $state<string | null>(null);

	// Anchor ids for h2/h3, keyed by heading occurrence order — must agree
	// with the TOC, which uses the same extractHeadings()
	const headingIds = $derived(extractHeadings(content).map((h) => h.id));

	interface TipTapNode {
		type: string;
		attrs?: Record<string, unknown>;
		content?: TipTapNode[];
		text?: string;
		marks?: { type: string; attrs?: Record<string, unknown> }[];
	}

	function nodeToLocation(node: TipTapNode): BlogLocation {
		const a = node.attrs ?? {};
		let imageUrls: string[] = [];
		try { imageUrls = JSON.parse((a.imageUrls as string) ?? '[]'); } catch { /* empty */ }
		return {
			id: a.id as string ?? '',
			order: 0,
			name: a.name as string ?? '',
			label: a.label as string ?? null,
			description: a.description as string ?? null,
			lat: a.lat as number ?? 0,
			lng: a.lng as number ?? 0,
			city: a.city as string ?? null,
			state: a.state as string ?? null,
			country: a.country as string ?? null,
			rating: a.rating as number ?? null,
			priceTier: (a.priceTier ?? null) as PriceTier | null,
			imageUrls,
			websiteUrl: a.websiteUrl as string ?? null,
			instagramHandle: a.instagramHandle as string ?? null,
			hours: a.hours as string ?? null,
			rank: a.rank as number ?? null,
			category: a.category as string ?? null,
			tips: a.tips as string ?? null
		};
	}

	function nodeToRoute(node: TipTapNode): BlogRoute {
		const a = node.attrs ?? {};
		let stops: RouteStop[] = [];
		try { stops = JSON.parse((a.stops as string) ?? '[]'); } catch { /* empty */ }
		return {
			id: a.id as string ?? '',
			title: a.title as string ?? '',
			stops
		};
	}

	const nodes = $derived((content?.content as TipTapNode[]) ?? []);

	// node index -> anchor id, for headings only
	const headingIdByIndex = $derived.by(() => {
		const map: Record<number, string> = {};
		let h = 0;
		nodes.forEach((node, i) => {
			if (node.type === 'heading') {
				map[i] = headingIds[h] ?? '';
				h++;
			}
		});
		return map;
	});
</script>

<div class="blog-content">
	{#each nodes as node, nodeIndex}
		{#if node.type === 'heading'}
			{@const level = node.attrs?.level ?? 2}
			{@const anchorId = headingIdByIndex[nodeIndex]}
			{#if level === 2}
				<h2 id={anchorId} class="text-xl font-bold text-text-primary mt-8 mb-3 scroll-mt-20">
					{#each node.content ?? [] as child}{@render textNode(child)}{/each}
				</h2>
			{:else}
				<h3 id={anchorId} class="text-lg font-bold text-text-primary mt-6 mb-2 scroll-mt-20">
					{#each node.content ?? [] as child}{@render textNode(child)}{/each}
				</h3>
			{/if}
		{:else if node.type === 'paragraph'}
			<p class="text-base text-text-secondary leading-relaxed my-2">
				{#each node.content ?? [] as child}{@render textNode(child)}{/each}
			</p>
		{:else if node.type === 'bulletList'}
			<ul class="list-disc pl-6 my-3 space-y-1">
				{#each node.content ?? [] as li}
					<li class="text-base text-text-secondary">
						{#each li.content ?? [] as p}
							{#each p.content ?? [] as child}{@render textNode(child)}{/each}
						{/each}
					</li>
				{/each}
			</ul>
		{:else if node.type === 'orderedList'}
			<ol class="list-decimal pl-6 my-3 space-y-1">
				{#each node.content ?? [] as li}
					<li class="text-base text-text-secondary">
						{#each li.content ?? [] as p}
							{#each p.content ?? [] as child}{@render textNode(child)}{/each}
						{/each}
					</li>
				{/each}
			</ol>
		{:else if node.type === 'blockquote'}
			<blockquote class="border-l-3 border-border pl-4 my-4 italic text-text-muted">
				{#each node.content ?? [] as p}
					<p class="my-1">
						{#each p.content ?? [] as child}{@render textNode(child)}{/each}
					</p>
				{/each}
			</blockquote>
		{:else if node.type === 'horizontalRule'}
			<hr class="border-t-2 border-border my-6" />
		{:else if node.type === 'image'}
			<figure class="my-4">
				<button
					type="button"
					class="block w-full cursor-zoom-in"
					onclick={() => (lightboxSrc = node.attrs?.src as string)}
					aria-label="View image full size"
				>
					<img src={node.attrs?.src as string} alt={node.attrs?.alt as string ?? ''} class="w-full rounded-xl border-2 border-border shadow-[2px_2px_0_var(--color-border)]" />
				</button>
			</figure>
		{:else if node.type === 'codeBlock'}
			<pre class="bg-primary text-card p-4 rounded-xl my-4 overflow-x-auto text-sm"><code>{#each node.content ?? [] as child}{child.text ?? ''}{/each}</code></pre>
		{:else if node.type === 'locationCard'}
			<LocationCardView location={nodeToLocation(node)} />
		{:else if node.type === 'routeBlock'}
			<RouteBlockView route={nodeToRoute(node)} />
		{:else if node.type === 'youtubeEmbed'}
			{@const youtubeId = extractYoutubeId((node.attrs?.src as string) ?? '')}
			{#if youtubeId}
				<figure class="relative my-6 rounded-xl overflow-hidden border-2 border-border shadow-[3px_3px_0_var(--color-border)] bg-overlay">
					<span class="absolute top-3 left-3 z-10 inline-block px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider text-white" style="background:#FF0000">YouTube</span>
					<div class="relative w-full" style="padding-top: 56.25%;">
						<iframe
							src="https://www.youtube.com/embed/{youtubeId}"
							title={(node.attrs?.title as string) ?? 'YouTube video'}
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
							class="absolute inset-0 w-full h-full border-0"
						></iframe>
					</div>
				</figure>
			{/if}
		{/if}
	{/each}
</div>

{#snippet textNode(node: TipTapNode)}
	{#if node.type === 'text'}
		{@const hasBold = node.marks?.some(m => m.type === 'bold')}
		{@const hasItalic = node.marks?.some(m => m.type === 'italic')}
		{@const hasStrike = node.marks?.some(m => m.type === 'strike')}
		{@const hasCode = node.marks?.some(m => m.type === 'code')}
		{@const linkMark = node.marks?.find(m => m.type === 'link')}
		{#if linkMark}
			<a href={linkMark.attrs?.href as string} target="_blank" rel="noopener" class="text-accent hover:underline {hasBold ? 'font-bold' : ''} {hasItalic ? 'italic' : ''}">{node.text}</a>
		{:else if hasCode}
			<code class="bg-accent-light px-1.5 py-0.5 rounded-lg text-sm">{node.text}</code>
		{:else}
			<span class="{hasBold ? 'font-bold' : ''} {hasItalic ? 'italic' : ''} {hasStrike ? 'line-through' : ''}">{node.text}</span>
		{/if}
	{:else if node.type === 'hardBreak'}
		<br />
	{/if}
{/snippet}

<svelte:window onkeydown={(e) => { if (lightboxSrc && e.key === 'Escape') lightboxSrc = null; }} />

<!-- Image lightbox -->
{#if lightboxSrc}
	<div
		class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		tabindex="-1"
		onclick={() => (lightboxSrc = null)}
		onkeydown={(e) => { if (e.key === 'Escape') lightboxSrc = null; }}
	>
		<img src={lightboxSrc} alt="" class="max-w-full max-h-full object-contain rounded-lg" />
		<button
			type="button"
			class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
			onclick={() => (lightboxSrc = null)}
			aria-label="Close image viewer"
		>
			<X size={20} weight="bold" />
		</button>
	</div>
{/if}
