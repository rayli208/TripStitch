<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import type { BlogPost } from '$lib/types';
	import { BLOG_CATEGORIES } from '$lib/constants/blog';
	import TipTapEditor from './TipTapEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import LocationCardModal from './LocationCardModal.svelte';
	import RouteBlockModal from './RouteBlockModal.svelte';
	import { Camera, X, FloppyDisk, PaperPlaneTilt, Spinner } from 'phosphor-svelte';
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

		// If we have a saved blog, upload to storage. Otherwise use blob URL
		if (savedBlogId) {
			const url = await blogsState.uploadBlogImage(savedBlogId, file);
			if (url) editor.chain().focus().setImage({ src: url }).run();
		} else {
			// Save draft first to get a blogId
			await saveDraft();
			if (savedBlogId) {
				const url = await blogsState.uploadBlogImage(savedBlogId, file);
				if (url) editor.chain().focus().setImage({ src: url }).run();
			} else {
				// Fallback: use blob URL
				const blobUrl = URL.createObjectURL(file);
				editor.chain().focus().setImage({ src: blobUrl }).run();
			}
		}
		input.value = '';
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

<div
	class="space-y-5"
	bind:this={containerEl}
>
	<!-- Save status -->
	<div class="flex items-center justify-between text-xs text-text-muted">
		<div>
			{#if blogEditor.isSaving}
				<span class="flex items-center gap-1"><Spinner size={12} class="animate-spin" /> Saving...</span>
			{:else if blogEditor.lastSavedAt}
				Saved {new Date(blogEditor.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
			{:else}
				Draft
			{/if}
		</div>
		<div>{blogEditor.wordCount} words · {blogEditor.readingTime} min read</div>
	</div>

	<!-- Cover image -->
	<div class="relative">
		{#if blogEditor.coverImagePreviewUrl}
			<div class="relative rounded-xl overflow-hidden border-2 border-border shadow-[2px_2px_0_var(--color-border)]">
				<img src={blogEditor.coverImagePreviewUrl} alt="Cover" class="w-full h-40 object-cover" />
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
				class="w-full h-28 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-text-muted hover:bg-accent-light transition-colors cursor-pointer"
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
		class="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder:text-text-muted/40"
		bind:value={blogEditor.title}
		placeholder="Blog title..."
	/>

	<!-- Subtitle -->
	<input
		type="text"
		class="w-full text-base bg-transparent border-none outline-none placeholder:text-text-muted/40 text-text-muted"
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
	<div class="border-2 border-border rounded-xl p-4 bg-card shadow-[2px_2px_0_var(--color-border)] min-h-[300px]">
		<TipTapEditor
			bind:this={tipTapComponent}
			content={blogEditor.content}
			onupdate={(json) => blogEditor.updateContent(json)}
		/>
	</div>

	<input type="file" accept="image/*" class="hidden" bind:this={imageInputEl} onchange={handleImageFile} />

	<!-- Metadata toggle -->
	<button
		type="button"
		class="w-full py-2 text-sm font-bold text-accent border-2 border-border rounded-lg bg-card shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer"
		onclick={() => showMetadata = !showMetadata}
	>
		{showMetadata ? 'Hide' : 'Show'} Post Settings
	</button>

	{#if showMetadata}
		<div class="space-y-4 p-4 border-2 border-border rounded-xl bg-card shadow-[2px_2px_0_var(--color-border)]">
			<!-- Category -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Category</label>
				<div class="flex flex-wrap gap-2">
					{#each BLOG_CATEGORIES as cat}
						<button
							type="button"
							class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {blogEditor.category === cat.value ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
							onclick={() => blogEditor.category = cat.value}
						>
							{cat.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Tags -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">Tags</label>
				<div class="flex flex-wrap gap-1.5 mb-2">
					{#each blogEditor.tags as tag}
						<span class="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-accent-light rounded-lg border border-border">
							{tag}
							<button type="button" class="cursor-pointer hover:text-error transition-colors" onclick={() => removeTag(tag)}>
								<X size={10} weight="bold" />
							</button>
						</span>
					{/each}
				</div>
				<div class="flex gap-2">
					<input
						type="text"
						class="flex-1 bg-page border-2 border-border rounded-lg px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
						bind:value={tagInput}
						placeholder="Add a tag..."
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
					/>
					<button
						type="button"
						class="px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-lg border-2 border-border cursor-pointer"
						onclick={addTag}
					>
						Add
					</button>
				</div>
			</div>

			<!-- YouTube URL -->
			<div>
				<label class="block text-xs font-bold text-text-muted mb-1">YouTube Video URL (optional)</label>
				<input
					type="url"
					class="w-full bg-page border-2 border-border rounded-lg px-3 py-2 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={blogEditor.youtubeUrl}
					placeholder="https://youtube.com/watch?v=..."
				/>
			</div>

			<!-- Linked Trips -->
			{#if userTrips.length > 0}
				<div>
					<label class="block text-xs font-bold text-text-muted mb-1">Link to trips (optional)</label>
					<div class="flex flex-wrap gap-2">
						{#each userTrips as trip}
							{@const isLinked = blogEditor.linkedTripIds.includes(trip.id)}
							<button
								type="button"
								class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {isLinked ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
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
				<label class="block text-xs font-bold text-text-muted mb-1">Visibility</label>
				<div class="flex gap-2">
					{#each [{ value: 'draft', label: 'Draft' }, { value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }] as opt}
						<button
							type="button"
							class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-border cursor-pointer transition-all {blogEditor.visibility === opt.value ? 'bg-accent text-white shadow-[2px_2px_0_var(--color-border)]' : 'bg-page hover:bg-accent-light'}"
							onclick={() => blogEditor.visibility = opt.value as any}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Action buttons -->
	<div class="flex gap-3">
		<button
			type="button"
			class="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl border-2 border-border bg-card shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer"
			onclick={saveDraft}
			disabled={blogEditor.isSaving}
		>
			<FloppyDisk size={18} weight="bold" />
			Save Draft
		</button>
		<button
			type="button"
			class="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl border-2 border-border bg-accent text-white shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all cursor-pointer disabled:opacity-50"
			onclick={handlePublish}
			disabled={blogEditor.isSaving || !blogEditor.title.trim()}
		>
			<PaperPlaneTilt size={18} weight="bold" />
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
