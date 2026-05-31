<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import type { BlogPost } from '$lib/types';
	import { BLOG_CATEGORIES } from '$lib/constants/blog';
	import TipTapEditor from './TipTapEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import LocationCardModal from './LocationCardModal.svelte';
	import RouteBlockModal from './RouteBlockModal.svelte';
	import { Camera, X, FloppyDisk, PaperPlaneTilt, Spinner, Gear, CaretDown } from 'phosphor-svelte';
	import blogsState from '$lib/state/blogs.svelte';
	import { createBlogEditorState } from '$lib/state/blogEditor.svelte';
	import tripsState from '$lib/state/trips.svelte';

	let {
		blogId = null,
		initial = null,
		onsaved
	}: {
		blogId?: string | null;
		initial?: Partial<BlogPost> | null;
		onsaved?: (id: string, slug: string) => void;
	} = $props();

	const blogEditor = createBlogEditorState(initial ? {
		title: initial.title ?? '',
		subtitle: initial.subtitle ?? '',
		category: initial.category,
		tags: initial.tags,
		visibility: initial.visibility,
		content: initial.content,
		linkedTripIds: initial.linkedTripIds,
		youtubeUrl: initial.youtubeUrl ?? '',
		coverImageUrl: initial.coverImageUrl ?? undefined
	} : undefined);

	let editor: Editor | undefined = $state();
	let tipTapComponent: TipTapEditor | undefined;
	let locationModalOpen = $state(false);
	let routeModalOpen = $state(false);
	let editingLocationAttrs = $state<Record<string, unknown> | null>(null);
	let editingLocationPos = $state<number | null>(null);
	let editingRouteAttrs = $state<Record<string, unknown> | null>(null);
	let editingRoutePos = $state<number | null>(null);
	let coverInputEl: HTMLInputElement;
	let imageInputEl: HTMLInputElement;
	let tagInput = $state('');
	let showMetadata = $state(false);
	let savedBlogId = $state<string | null>(blogId);
	let containerEl: HTMLDivElement | undefined = $state();
	// Increments on every TipTap transaction so toolbar re-renders active states
	let editorVersion = $state(0);

	// Upload progress (image insert)
	let uploadProgress = $state<number | null>(null);
	let uploadError = $state<string | null>(null);

	// Track images that have been persisted to Storage so we can clean up
	// the ones the user removes on the next save.
	let trackedImageUrls = $state<Set<string>>(new Set());

	function extractImageUrls(content: Record<string, unknown> | undefined): string[] {
		if (!content) return [];
		const urls: string[] = [];
		const walk = (node: unknown) => {
			if (!node || typeof node !== 'object') return;
			const n = node as { type?: string; attrs?: { src?: unknown }; content?: unknown[] };
			if (n.type === 'image' && typeof n.attrs?.src === 'string') urls.push(n.attrs.src);
			if (Array.isArray(n.content)) for (const child of n.content) walk(child);
		};
		walk(content);
		return urls;
	}

	// Initial tracked URLs come from the loaded content (when editing an existing blog).
	$effect(() => {
		if (initial?.content && trackedImageUrls.size === 0) {
			trackedImageUrls = new Set(extractImageUrls(initial.content));
		}
	});

	// Get TipTap editor instance reactively
	$effect(() => {
		if (tipTapComponent) {
			const checkEditor = () => {
				const e = tipTapComponent?.getEditor();
				if (e) {
					editor = e;
					e.on('transaction', () => { editorVersion++; });
				}
				else setTimeout(checkEditor, 50);
			};
			checkEditor();
		}
	});

	// Auto-save debounce
	let autoSaveTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		if (!blogEditor.isDirty) return;
		clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(() => {
			saveDraft();
		}, 3000);
		return () => clearTimeout(autoSaveTimer);
	});

	// Listen for custom events from TipTap node views
	function handleEditorEvent(e: Event) {
		const custom = e as CustomEvent;
		if (custom.type === 'edit-location-card') {
			editingLocationAttrs = custom.detail.attrs;
			editingLocationPos = custom.detail.pos;
			locationModalOpen = true;
		} else if (custom.type === 'edit-route-block') {
			editingRouteAttrs = custom.detail.attrs;
			editingRoutePos = custom.detail.pos;
			routeModalOpen = true;
		}
	}

	$effect(() => {
		if (!containerEl) return;
		containerEl.addEventListener('edit-location-card', handleEditorEvent);
		containerEl.addEventListener('edit-route-block', handleEditorEvent);
		return () => {
			containerEl!.removeEventListener('edit-location-card', handleEditorEvent);
			containerEl!.removeEventListener('edit-route-block', handleEditorEvent);
		};
	});

	/** Compare current content's image URLs against the tracked (last-saved) set
	 * and delete any from Storage that the user has removed. */
	async function cleanupRemovedImages() {
		const currentUrls = new Set(extractImageUrls(blogEditor.content));
		const removed: string[] = [];
		for (const url of trackedImageUrls) {
			if (!currentUrls.has(url)) removed.push(url);
		}
		if (removed.length > 0) {
			await Promise.all(removed.map((url) => blogsState.deleteBlogImageByUrl(url)));
		}
		trackedImageUrls = currentUrls;
	}

	async function saveDraft() {
		if (blogEditor.isSaving) return;
		blogEditor.isSaving = true;

		const now = new Date().toISOString();
		const blogData: BlogPost = {
			id: savedBlogId ?? '',
			userId: '',
			title: blogEditor.title,
			subtitle: blogEditor.subtitle || null,
			coverImageUrl: blogEditor.coverImagePreviewUrl,
			coverImageFile: blogEditor.coverImageFile,
			content: blogEditor.content,
			tags: blogEditor.tags,
			category: blogEditor.category,
			visibility: blogEditor.visibility,
			slug: '',
			excerpt: blogEditor.excerpt,
			readingTime: blogEditor.readingTime,
			linkedTripIds: blogEditor.linkedTripIds,
			youtubeUrl: blogEditor.youtubeUrl || null,
			locations: blogEditor.locations,
			routes: blogEditor.routes,
			cities: [],
			states: [],
			countries: [],
			createdAt: now,
			updatedAt: now,
			publishedAt: null
		};

		try {
			if (savedBlogId) {
				await blogsState.updateBlog(savedBlogId, {
					...blogData,
					updatedAt: now
				});
			} else {
				const docId = await blogsState.addBlog(blogData);
				if (docId) savedBlogId = docId;
			}
			// Clean up any images the user removed since the last save
			await cleanupRemovedImages();
			blogEditor.markSaved();
		} catch (err) {
			console.error('[BlogEditor] Save failed:', err);
			blogEditor.isSaving = false;
		}
	}

	async function handlePublish() {
		blogEditor.visibility = 'public';
		blogEditor.isSaving = true;

		const now = new Date().toISOString();
		const blogData: BlogPost = {
			id: savedBlogId ?? '',
			userId: '',
			title: blogEditor.title,
			subtitle: blogEditor.subtitle || null,
			coverImageUrl: blogEditor.coverImagePreviewUrl,
			coverImageFile: blogEditor.coverImageFile,
			content: blogEditor.content,
			tags: blogEditor.tags,
			category: blogEditor.category,
			visibility: 'public',
			slug: '',
			excerpt: blogEditor.excerpt,
			readingTime: blogEditor.readingTime,
			linkedTripIds: blogEditor.linkedTripIds,
			youtubeUrl: blogEditor.youtubeUrl || null,
			locations: blogEditor.locations,
			routes: blogEditor.routes,
			cities: [],
			states: [],
			countries: [],
			createdAt: now,
			updatedAt: now,
			publishedAt: now
		};

		try {
			if (savedBlogId) {
				await blogsState.updateBlog(savedBlogId, {
					...blogData,
					updatedAt: now,
					publishedAt: now
				});
			} else {
				const docId = await blogsState.addBlog({ ...blogData, publishedAt: now });
				if (docId) savedBlogId = docId;
			}
			// Clean up any images the user removed since the last save
			await cleanupRemovedImages();
			blogEditor.markSaved();
			// Find the blog to get the slug
			const saved = blogsState.getBlog(savedBlogId!);
			if (onsaved && savedBlogId) {
				onsaved(savedBlogId, saved?.slug ?? '');
			}
		} catch (err) {
			console.error('[BlogEditor] Publish failed:', err);
			blogEditor.isSaving = false;
		}
	}

	function handleCoverImage(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) blogEditor.updateCoverImage(file);
	}

	function handleImageInsert() {
		imageInputEl?.click();
	}

	async function handleImageFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !editor) return;

		uploadError = null;
		uploadProgress = 0;
		const onProgress = (p: number) => { uploadProgress = p; };

		try {
			// Need a blog ID before we can upload (folder path is `blogs/{id}/images/...`)
			if (!savedBlogId) await saveDraft();
			if (!savedBlogId) {
				uploadError = 'Save the blog first — couldn\'t create a draft.';
				return;
			}
			const url = await blogsState.uploadBlogImage(savedBlogId, file, onProgress);
			if (!url) {
				uploadError = 'Image upload failed. Check your connection and try again.';
				return;
			}
			editor.chain().focus().setImage({ src: url }).run();
			// Track this URL so it gets cleaned up on save if the user removes it later
			trackedImageUrls = new Set([...trackedImageUrls, url]);
		} finally {
			uploadProgress = null;
			input.value = '';
		}
	}

	function handleLocationSave(attrs: Record<string, unknown>) {
		if (!editor) return;
		if (editingLocationPos !== null) {
			// Update existing
			const tr = editor.state.tr;
			tr.setNodeMarkup(editingLocationPos, undefined, attrs);
			editor.view.dispatch(tr);
		} else {
			// Insert new
			editor.commands.insertLocationCard(attrs as any);
		}
		editingLocationAttrs = null;
		editingLocationPos = null;
		// Trigger content update
		blogEditor.updateContent(editor.getJSON() as Record<string, unknown>);
	}

	function handleRouteSave(attrs: Record<string, unknown>) {
		if (!editor) return;
		if (editingRoutePos !== null) {
			const tr = editor.state.tr;
			tr.setNodeMarkup(editingRoutePos, undefined, attrs);
			editor.view.dispatch(tr);
		} else {
			editor.commands.insertRouteBlock(attrs as any);
		}
		editingRouteAttrs = null;
		editingRoutePos = null;
		blogEditor.updateContent(editor.getJSON() as Record<string, unknown>);
	}

	function addTag() {
		const tag = tagInput.trim();
		if (tag && !blogEditor.tags.includes(tag) && blogEditor.tags.length < 10) {
			blogEditor.tags = [...blogEditor.tags, tag];
		}
		tagInput = '';
	}

	function removeTag(tag: string) {
		blogEditor.tags = blogEditor.tags.filter((t) => t !== tag);
	}

	// Linked trips
	const userTrips = $derived(tripsState.trips);
</script>

<div bind:this={containerEl} class="pb-24 md:pb-0">
	<!-- Top bar: status + actions (Save Draft + Publish) -->
	<div class="hidden md:flex items-center justify-between gap-3 mb-5">
		<div class="text-xs text-text-muted flex items-center gap-2">
			{#if blogEditor.isSaving}
				<span class="flex items-center gap-1"><Spinner size={12} class="animate-spin" /> Saving…</span>
			{:else if blogEditor.lastSavedAt}
				<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30 font-medium">
					Saved {new Date(blogEditor.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
				</span>
			{:else}
				<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card border-2 border-border font-medium">Draft</span>
			{/if}
			<span>·</span>
			<span>{blogEditor.wordCount} words · {blogEditor.readingTime} min read</span>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-card text-text-primary text-sm font-bold hover:bg-accent-light transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)] disabled:opacity-50"
				onclick={saveDraft}
				disabled={blogEditor.isSaving}
			>
				<FloppyDisk size={14} weight="bold" />
				Save Draft
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer shadow-[2px_2px_0_var(--color-border)] disabled:opacity-50"
				onclick={handlePublish}
				disabled={blogEditor.isSaving || !blogEditor.title.trim()}
			>
				<PaperPlaneTilt size={14} weight="bold" />
				Publish
			</button>
		</div>
	</div>

	<!-- Mobile: status only (action buttons live in sticky bottom bar) -->
	<div class="md:hidden flex items-center justify-between text-xs text-text-muted mb-4">
		<div>
			{#if blogEditor.isSaving}
				<span class="flex items-center gap-1"><Spinner size={12} class="animate-spin" /> Saving…</span>
			{:else if blogEditor.lastSavedAt}
				Saved {new Date(blogEditor.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
			{:else}
				Draft
			{/if}
		</div>
		<div>{blogEditor.wordCount} words · {blogEditor.readingTime} min read</div>
	</div>

	<!-- Two-pane layout: editor (main) + settings sidebar (desktop only) -->
	<div class="md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-6">
		<!-- ═══════════ MAIN EDITOR COLUMN ═══════════ -->
		<div class="space-y-5 min-w-0">
			<!-- Cover image -->
			<div class="relative">
				{#if blogEditor.coverImagePreviewUrl}
					<div class="relative rounded-xl overflow-hidden border-2 border-border shadow-[2px_2px_0_var(--color-border)]">
						<img src={blogEditor.coverImagePreviewUrl} alt="Cover" class="w-full h-40 md:h-56 object-cover" />
						<button
							type="button"
							class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80"
							onclick={() => blogEditor.removeCoverImage()}
						>
							<X size={14} weight="bold" />
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="w-full h-28 md:h-40 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-text-muted hover:bg-accent-light transition-colors cursor-pointer"
						onclick={() => coverInputEl?.click()}
					>
						<Camera size={24} />
						<span class="text-xs font-bold">Add cover image</span>
					</button>
				{/if}
				<input type="file" accept="image/*" class="hidden" bind:this={coverInputEl} onchange={handleCoverImage} />
			</div>

			<!-- Title -->
			<input
				type="text"
				class="w-full text-2xl md:text-3xl font-bold bg-transparent border-none outline-none placeholder:text-text-muted/40"
				bind:value={blogEditor.title}
				placeholder="Blog title..."
			/>

			<!-- Subtitle -->
			<input
				type="text"
				class="w-full text-base md:text-lg bg-transparent border-none outline-none placeholder:text-text-muted/40 text-text-muted"
				bind:value={blogEditor.subtitle}
				placeholder="Subtitle (optional)..."
			/>

			<!-- Toolbar -->
			<EditorToolbar
				{editor}
				{editorVersion}
				oninsertlocation={() => { editingLocationAttrs = null; editingLocationPos = null; locationModalOpen = true; }}
				oninsertroute={() => { editingRouteAttrs = null; editingRoutePos = null; routeModalOpen = true; }}
				oninsertimage={handleImageInsert}
			/>

			<!-- Editor -->
			<div class="relative border-2 border-border rounded-xl p-4 md:p-6 bg-card shadow-[2px_2px_0_var(--color-border)] min-h-[300px] md:min-h-[480px]">
				<TipTapEditor
					bind:this={tipTapComponent}
					content={blogEditor.content}
					onupdate={(json) => blogEditor.updateContent(json)}
				/>

				<!-- Image upload progress overlay -->
				{#if uploadProgress !== null}
					<div class="absolute inset-x-4 bottom-4 z-10 rounded-lg border-2 border-border bg-card shadow-[2px_2px_0_var(--color-border)] p-3 flex items-center gap-3">
						<div class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin shrink-0"></div>
						<div class="flex-1 min-w-0">
							<p class="text-xs font-bold text-text-primary">Uploading image…</p>
							<div class="mt-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
								<div class="h-full bg-accent transition-all duration-200" style="width: {uploadProgress}%"></div>
							</div>
						</div>
						<span class="text-[11px] font-mono text-text-muted shrink-0">{uploadProgress}%</span>
					</div>
				{/if}
			</div>

			<!-- Image upload error -->
			{#if uploadError}
				<div class="flex items-start gap-2 rounded-lg border-2 border-error/40 bg-error/10 p-3">
					<X size={14} weight="bold" class="text-error shrink-0 mt-0.5" />
					<div class="flex-1 min-w-0">
						<p class="text-xs font-bold text-error">{uploadError}</p>
					</div>
					<button
						type="button"
						class="text-[11px] font-bold text-error hover:underline cursor-pointer"
						onclick={() => (uploadError = null)}
					>
						Dismiss
					</button>
				</div>
			{/if}

			<input type="file" accept="image/*" class="hidden" bind:this={imageInputEl} onchange={handleImageFile} />

			<!-- Mobile-only metadata toggle -->
			<button
				type="button"
				class="md:hidden w-full flex items-center justify-between py-2 px-3 text-sm font-bold text-text-primary border-2 border-border rounded-lg bg-card shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer"
				onclick={() => showMetadata = !showMetadata}
			>
				<span class="inline-flex items-center gap-2">
					<Gear size={16} weight="bold" />
					Post settings
				</span>
				<CaretDown size={14} weight="bold" class="transition-transform {showMetadata ? 'rotate-180' : ''}" />
			</button>

			<!-- Mobile-only inline settings (drawer-style disclosure) -->
			{#if showMetadata}
				<div class="md:hidden">
					{@render settingsPanel()}
				</div>
			{/if}
		</div>

		<!-- ═══════════ SETTINGS SIDEBAR (desktop) ═══════════ -->
		<aside class="hidden md:block">
			<div class="sticky top-20">
				{@render settingsPanel()}
			</div>
		</aside>
	</div>
</div>

{#snippet settingsPanel()}
	<div class="space-y-5 p-4 md:p-5 border-2 border-border rounded-xl bg-card shadow-[2px_2px_0_var(--color-border)]">
		<div class="hidden md:flex items-center justify-between">
			<h3 class="text-sm font-bold text-text-primary">Post settings</h3>
		</div>

		<!-- Category -->
		<div>
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Category</label>
			<div class="flex flex-wrap gap-1.5">
				{#each BLOG_CATEGORIES as cat}
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {blogEditor.category === cat.value ? 'bg-accent text-white shadow-[1px_1px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
						onclick={() => blogEditor.category = cat.value}
					>
						{cat.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Tags -->
		<div>
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Tags</label>
			{#if blogEditor.tags.length > 0}
				<div class="flex flex-wrap gap-1.5 mb-2">
					{#each blogEditor.tags as tag}
						<span class="flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-accent-light rounded-lg border border-border">
							{tag}
							<button type="button" class="cursor-pointer hover:text-error transition-colors" onclick={() => removeTag(tag)}>
								<X size={10} weight="bold" />
							</button>
						</span>
					{/each}
				</div>
			{/if}
			<div class="flex gap-2">
				<input
					type="text"
					class="flex-1 min-w-0 bg-page border-2 border-border rounded-lg px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={tagInput}
					placeholder="Add tag…"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
				/>
				<button
					type="button"
					class="shrink-0 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-lg border-2 border-border cursor-pointer shadow-[2px_2px_0_var(--color-border)]"
					onclick={addTag}
				>
					Add
				</button>
			</div>
		</div>

		<!-- Featured / YouTube URL -->
		<div>
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Featured video <span class="font-normal normal-case">(optional)</span></label>
			<input
				type="url"
				class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
				bind:value={blogEditor.youtubeUrl}
				placeholder="https://youtube.com/watch?v=…"
			/>
		</div>

		<!-- Linked Trips -->
		{#if userTrips.length > 0}
			<div>
				<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Linked trips</label>
				<div class="flex flex-wrap gap-1.5">
					{#each userTrips as trip}
						{@const isLinked = blogEditor.linkedTripIds.includes(trip.id)}
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all max-w-full truncate {isLinked ? 'bg-accent text-white shadow-[1px_1px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
							onclick={() => {
								if (isLinked) {
									blogEditor.linkedTripIds = blogEditor.linkedTripIds.filter((id) => id !== trip.id);
								} else {
									blogEditor.linkedTripIds = [...blogEditor.linkedTripIds, trip.id];
								}
							}}
						>
							{trip.title}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Visibility -->
		<div>
			<label class="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Visibility</label>
			<div class="grid grid-cols-3 gap-1.5">
				{#each [{ value: 'draft', label: 'Draft' }, { value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }] as opt}
					<button
						type="button"
						class="px-2 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {blogEditor.visibility === opt.value ? 'bg-accent text-white shadow-[1px_1px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
						onclick={() => blogEditor.visibility = opt.value as any}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/snippet}

<!-- Mobile sticky bottom action bar (sits above the tab nav) -->
<div class="md:hidden fixed left-0 right-0 z-30 border-t-2 border-border bg-page/95 backdrop-blur-sm" style="bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 8px);">
	<div class="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
		<button
			type="button"
			class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg border-2 border-border bg-card shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer disabled:opacity-50"
			onclick={saveDraft}
			disabled={blogEditor.isSaving}
		>
			<FloppyDisk size={14} weight="bold" />
			Save Draft
		</button>
		<button
			type="button"
			class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer disabled:opacity-50"
			onclick={handlePublish}
			disabled={blogEditor.isSaving || !blogEditor.title.trim()}
		>
			<PaperPlaneTilt size={14} weight="bold" />
			Publish
		</button>
	</div>
</div>

<!-- Modals -->
<LocationCardModal
	bind:open={locationModalOpen}
	initialAttrs={editingLocationAttrs}
	onsave={handleLocationSave}
/>
<RouteBlockModal
	bind:open={routeModalOpen}
	initialAttrs={editingRouteAttrs}
	onsave={handleRouteSave}
/>
