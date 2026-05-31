<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import {
		TextB,
		TextItalic,
		TextStrikethrough,
		TextHTwo,
		TextHThree,
		ListBullets,
		ListNumbers,
		Quotes,
		Minus,
		Link,
		LinkBreak,
		Image,
		MapPin,
		Path,
		YoutubeLogo
	} from 'phosphor-svelte';
	import { extractYoutubeId } from './extensions/youtubeEmbed';

	let {
		editor,
		editorVersion = 0,
		oninsertlocation,
		oninsertroute,
		oninsertimage
	}: {
		editor: Editor | undefined;
		editorVersion?: number;
		oninsertlocation: () => void;
		oninsertroute: () => void;
		oninsertimage: () => void;
	} = $props();

	let showLinkInput = $state(false);
	let linkUrl = $state('');
	let linkInputEl: HTMLInputElement | undefined;

	let showYoutubeInput = $state(false);
	let youtubeUrl = $state('');
	let youtubeError = $state('');
	let youtubeInputEl: HTMLInputElement | undefined;

	function openYoutubeInput() {
		youtubeUrl = '';
		youtubeError = '';
		showYoutubeInput = true;
		setTimeout(() => youtubeInputEl?.focus(), 0);
	}

	function applyYoutube() {
		const url = youtubeUrl.trim();
		const id = extractYoutubeId(url);
		if (!id) {
			youtubeError = 'Could not parse a YouTube URL. Try a youtube.com/watch or youtu.be link.';
			return;
		}
		editor?.chain().focus().insertYoutubeEmbed({ src: url }).run();
		showYoutubeInput = false;
		youtubeUrl = '';
		youtubeError = '';
	}

	function cancelYoutube() {
		showYoutubeInput = false;
		youtubeUrl = '';
		youtubeError = '';
		editor?.chain().focus().run();
	}

	function openLinkInput() {
		if (editor?.isActive('link')) {
			editor?.chain().focus().unsetLink().run();
		} else {
			linkUrl = '';
			showLinkInput = true;
			// Focus the input after it renders
			setTimeout(() => linkInputEl?.focus(), 0);
		}
	}

	function applyLink() {
		if (linkUrl.trim()) {
			let url = linkUrl.trim();
			if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
			editor?.chain().focus().setLink({ href: url }).run();
		}
		showLinkInput = false;
		linkUrl = '';
	}

	function cancelLink() {
		showLinkInput = false;
		linkUrl = '';
		editor?.chain().focus().run();
	}

	// Reference editorVersion to trigger Svelte re-render on editor state changes
	function isActive(name: string, attrs?: Record<string, unknown>): boolean {
		void editorVersion;
		return editor?.isActive(name, attrs) ?? false;
	}
</script>

{#if editor}
	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-0.5 p-2 border-2 border-border rounded-xl bg-card shadow-[2px_2px_0_var(--color-border)]">
			<!-- Text formatting -->
			<button
				type="button"
				class="toolbar-btn {isActive('bold') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleBold().run()}
				title="Bold"
			>
				<TextB size={18} weight="bold" />
			</button>
			<button
				type="button"
				class="toolbar-btn {isActive('italic') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleItalic().run()}
				title="Italic"
			>
				<TextItalic size={18} weight="bold" />
			</button>
			<button
				type="button"
				class="toolbar-btn {isActive('strike') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleStrike().run()}
				title="Strikethrough"
			>
				<TextStrikethrough size={18} weight="bold" />
			</button>

			<div class="w-px h-5 bg-border mx-1"></div>

			<!-- Headings -->
			<button
				type="button"
				class="toolbar-btn {isActive('heading', { level: 2 }) ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				title="Heading 2"
			>
				<TextHTwo size={18} weight="bold" />
			</button>
			<button
				type="button"
				class="toolbar-btn {isActive('heading', { level: 3 }) ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				title="Heading 3"
			>
				<TextHThree size={18} weight="bold" />
			</button>

			<div class="w-px h-5 bg-border mx-1"></div>

			<!-- Lists -->
			<button
				type="button"
				class="toolbar-btn {isActive('bulletList') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleBulletList().run()}
				title="Bullet List"
			>
				<ListBullets size={18} weight="bold" />
			</button>
			<button
				type="button"
				class="toolbar-btn {isActive('orderedList') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleOrderedList().run()}
				title="Numbered List"
			>
				<ListNumbers size={18} weight="bold" />
			</button>

			<!-- Blockquote -->
			<button
				type="button"
				class="toolbar-btn {isActive('blockquote') ? 'active' : ''}"
				onclick={() => editor?.chain().focus().toggleBlockquote().run()}
				title="Blockquote"
			>
				<Quotes size={18} weight="bold" />
			</button>

			<!-- Divider -->
			<button
				type="button"
				class="toolbar-btn"
				onclick={() => editor?.chain().focus().setHorizontalRule().run()}
				title="Divider"
			>
				<Minus size={18} weight="bold" />
			</button>

			<div class="w-px h-5 bg-border mx-1"></div>

			<!-- Link -->
			<button
				type="button"
				class="toolbar-btn {isActive('link') ? 'active' : ''}"
				onclick={openLinkInput}
				title={isActive('link') ? 'Remove Link' : 'Insert Link'}
			>
				{#if isActive('link')}
					<LinkBreak size={18} weight="bold" />
				{:else}
					<Link size={18} weight="bold" />
				{/if}
			</button>

			<!-- Image -->
			<button
				type="button"
				class="toolbar-btn"
				onclick={oninsertimage}
				title="Insert Image"
			>
				<Image size={18} weight="bold" />
			</button>

			<!-- YouTube -->
			<button
				type="button"
				class="toolbar-btn"
				onclick={openYoutubeInput}
				title="Insert YouTube Video"
			>
				<YoutubeLogo size={18} weight="bold" class="text-[#FF0000]" />
			</button>

			<div class="w-px h-5 bg-border mx-1"></div>

			<!-- Custom blocks -->
			<button
				type="button"
				class="toolbar-btn text-accent"
				onclick={oninsertlocation}
				title="Insert Location Card"
			>
				<MapPin size={18} weight="bold" />
			</button>
			<button
				type="button"
				class="toolbar-btn text-accent"
				onclick={oninsertroute}
				title="Insert Route"
			>
				<Path size={18} weight="bold" />
			</button>
		</div>

		<!-- Link URL input -->
		{#if showLinkInput}
			<div class="flex gap-2 items-center">
				<input
					bind:this={linkInputEl}
					type="url"
					class="flex-1 bg-page border-2 border-border rounded-lg px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
					bind:value={linkUrl}
					placeholder="https://example.com"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } else if (e.key === 'Escape') cancelLink(); }}
				/>
				<button
					type="button"
					class="px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-lg border-2 border-border cursor-pointer transition-all shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
					onclick={applyLink}
				>
					Apply
				</button>
				<button
					type="button"
					class="px-3 py-1.5 text-xs font-bold text-text-muted rounded-lg border-2 border-border cursor-pointer transition-all hover:bg-accent-light"
					onclick={cancelLink}
				>
					Cancel
				</button>
			</div>
		{/if}

		<!-- YouTube URL input -->
		{#if showYoutubeInput}
			<div class="space-y-1.5">
				<div class="flex gap-2 items-center">
					<YoutubeLogo size={18} weight="bold" class="text-[#FF0000] shrink-0" />
					<input
						bind:this={youtubeInputEl}
						type="url"
						class="flex-1 bg-page border-2 border-border rounded-lg px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--color-border)] focus:outline-none focus:border-accent"
						bind:value={youtubeUrl}
						placeholder="https://youtube.com/watch?v=..."
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyYoutube(); } else if (e.key === 'Escape') cancelYoutube(); }}
					/>
					<button
						type="button"
						class="px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-lg border-2 border-border cursor-pointer transition-all shadow-[2px_2px_0_var(--color-border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
						onclick={applyYoutube}
					>
						Embed
					</button>
					<button
						type="button"
						class="px-3 py-1.5 text-xs font-bold text-text-muted rounded-lg border-2 border-border cursor-pointer transition-all hover:bg-accent-light"
						onclick={cancelYoutube}
					>
						Cancel
					</button>
				</div>
				{#if youtubeError}
					<p class="text-xs text-error pl-7">{youtubeError}</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.1s;
		color: var(--color-text-primary);
		background: transparent;
		border: none;
	}

	.toolbar-btn:hover {
		background: var(--color-accent-light);
	}

	.toolbar-btn.active {
		background: var(--color-accent);
		color: white;
	}
</style>
