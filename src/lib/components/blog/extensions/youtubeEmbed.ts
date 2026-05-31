import { Node, mergeAttributes } from '@tiptap/core';

export interface YoutubeEmbedAttributes {
	src: string;
	title?: string | null;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		youtubeEmbed: {
			insertYoutubeEmbed: (attrs: YoutubeEmbedAttributes) => ReturnType;
		};
	}
}

export function extractYoutubeId(url: string): string | null {
	if (!url) return null;
	const match = url.match(
		/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([^&?#]+)/
	);
	return match?.[1] ?? null;
}

export const YoutubeEmbedExtension = Node.create({
	name: 'youtubeEmbed',
	group: 'block',
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			src: { default: '' },
			title: { default: null }
		};
	},

	addCommands() {
		return {
			insertYoutubeEmbed:
				(attrs) =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs
					});
				}
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-youtube-embed]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-youtube-embed': '' })];
	},

	addNodeView() {
		return ({ node }) => {
			const wrapper = document.createElement('div');
			wrapper.setAttribute('data-youtube-embed', '');
			wrapper.style.cssText =
				'position: relative; margin: 12px 0; border-radius: 12px; overflow: hidden; border: 2px solid var(--color-border); box-shadow: 3px 3px 0 var(--color-border); background: var(--color-overlay);';

			const id = extractYoutubeId(node.attrs.src as string);

			if (!id) {
				wrapper.style.background = 'var(--color-card)';
				wrapper.style.padding = '20px';
				wrapper.innerHTML = `<p style="text-align:center;color:var(--color-text-muted);font-size:13px;margin:0;">Invalid YouTube URL</p>`;
				return { dom: wrapper };
			}

			// Aspect ratio container
			const aspect = document.createElement('div');
			aspect.style.cssText = 'position: relative; width: 100%; padding-top: 56.25%;';

			// "YouTube" badge in top-left
			const badge = document.createElement('span');
			badge.style.cssText =
				'position: absolute; top: 10px; left: 10px; z-index: 2; background: #FF0000; color: white; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; padding: 3px 8px; border-radius: 4px; pointer-events: none;';
			badge.textContent = 'YouTube';

			const iframe = document.createElement('iframe');
			iframe.src = `https://www.youtube.com/embed/${id}`;
			iframe.title = (node.attrs.title as string) ?? 'YouTube video';
			iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
			iframe.setAttribute('allowfullscreen', 'true');
			iframe.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; border: 0;';

			aspect.appendChild(badge);
			aspect.appendChild(iframe);
			wrapper.appendChild(aspect);

			return { dom: wrapper };
		};
	}
});
