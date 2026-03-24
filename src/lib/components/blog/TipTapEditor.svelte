<script lang="ts">
	import { untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import CharacterCount from '@tiptap/extension-character-count';
	import { LocationCardExtension } from './extensions/locationCard';
	import { RouteBlockExtension } from './extensions/routeBlock';

	let {
		content = {},
		onupdate,
		editable = true
	}: {
		content: Record<string, unknown>;
		onupdate: (json: Record<string, unknown>) => void;
		editable?: boolean;
	} = $props();

	let element: HTMLDivElement | undefined;
	let editor: Editor | undefined;

	export function getEditor() {
		return editor;
	}

	$effect(() => {
		if (!element) return;

		// Read content and onupdate outside of reactive tracking —
		// we only need initial values, TipTap manages its own state after creation
		const initialContent = untrack(() => content);
		const updateHandler = untrack(() => onupdate);

		editor = new Editor({
			element,
			editable,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] }
				}),
				Image.configure({ inline: false, allowBase64: true }),
				Link.configure({ openOnClick: false }),
				Placeholder.configure({
				placeholder: ({ editor: e }) => e.isEmpty ? 'Start writing your blog post...' : ''
			}),
				CharacterCount,
				LocationCardExtension,
				RouteBlockExtension
			],
			content: Object.keys(initialContent).length > 0 ? initialContent : undefined,
			onUpdate: ({ editor: e }) => {
				updateHandler(e.getJSON() as Record<string, unknown>);
			},
			editorProps: {
				attributes: {
					class: 'tiptap-content'
				}
			}
		});

		return () => {
			editor?.destroy();
		};
	});
</script>

<div bind:this={element} class="tiptap-editor"></div>

<style>
	.tiptap-editor :global(.tiptap-content) {
		min-height: 300px;
		outline: none;
		padding: 12px 0;
		font-size: 15px;
		line-height: 1.7;
	}

	.tiptap-editor :global(.tiptap-content h2) {
		font-size: 1.4em;
		font-weight: 700;
		margin: 1.2em 0 0.4em;
	}

	.tiptap-editor :global(.tiptap-content h3) {
		font-size: 1.15em;
		font-weight: 700;
		margin: 1em 0 0.3em;
	}

	.tiptap-editor :global(.tiptap-content p) {
		margin: 0.5em 0;
	}

	.tiptap-editor :global(.tiptap-content ul) {
		list-style-type: disc;
		padding-left: 1.5em;
		margin: 0.5em 0;
	}

	.tiptap-editor :global(.tiptap-content ol) {
		list-style-type: decimal;
		padding-left: 1.5em;
		margin: 0.5em 0;
	}

	.tiptap-editor :global(.tiptap-content li) {
		margin: 0.2em 0;
		display: list-item;
	}

	.tiptap-editor :global(.tiptap-content li p) {
		margin: 0;
	}

	.tiptap-editor :global(.tiptap-content blockquote) {
		border-left: 3px solid var(--color-border);
		margin: 0.8em 0;
		padding: 0.4em 1em;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.tiptap-editor :global(.tiptap-content hr) {
		border: none;
		border-top: 2px solid var(--color-border);
		margin: 1.5em 0;
	}

	.tiptap-editor :global(.tiptap-content img) {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		margin: 0.8em 0;
	}

	.tiptap-editor :global(.tiptap-content a) {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.tiptap-editor :global(.tiptap-content code) {
		background: var(--color-accent-light);
		padding: 0.15em 0.4em;
		border-radius: 8px;
		font-size: 0.9em;
	}

	.tiptap-editor :global(.tiptap-content pre) {
		background: var(--color-primary);
		color: var(--color-card);
		padding: 1em;
		border-radius: 8px;
		overflow-x: auto;
		margin: 0.8em 0;
	}

	.tiptap-editor :global(.tiptap-content .is-empty::before) {
		content: attr(data-placeholder);
		float: left;
		color: var(--color-text-muted);
		pointer-events: none;
		height: 0;
	}
</style>
