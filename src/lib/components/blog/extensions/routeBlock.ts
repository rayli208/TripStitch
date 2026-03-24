import { Node, mergeAttributes } from '@tiptap/core';

export interface RouteBlockAttributes {
	id: string;
	title: string;
	stops: string; // JSON stringified RouteStop[]
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		routeBlock: {
			insertRouteBlock: (attrs: RouteBlockAttributes) => ReturnType;
		};
	}
}

export const RouteBlockExtension = Node.create({
	name: 'routeBlock',
	group: 'block',
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			id: { default: '' },
			title: { default: '' },
			stops: { default: '[]' }
		};
	},

	addCommands() {
		return {
			insertRouteBlock:
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
		return [{ tag: 'div[data-route-block]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-route-block': '' }), 0];
	},

	addNodeView() {
		return ({ node, getPos }) => {
			const dom = document.createElement('div');
			dom.className = 'route-block-node';
			dom.setAttribute('data-route-block', '');
			dom.style.cssText =
				'border: 2px solid var(--color-border); border-radius: 12px; padding: 12px 16px; margin: 8px 0; background: var(--color-card); box-shadow: 3px 3px 0 var(--color-border); cursor: pointer; transition: box-shadow 0.15s;';

			const attrs = node.attrs;
			let stops: { name: string; description: string | null }[] = [];
			try {
				stops = JSON.parse(attrs.stops || '[]');
			} catch { /* empty */ }

			const stopsHtml = stops
				.map(
					(stop, i) => `
				<div style="display:flex;gap:10px;${i < stops.length - 1 ? 'padding-bottom:10px;' : ''}">
					<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
						<div style="width:22px;height:22px;border-radius:50%;background:var(--color-accent);color:#fff;font-weight:bold;font-size:11px;display:flex;align-items:center;justify-content:center;border:2px solid var(--color-border);">${i + 1}</div>
						${i < stops.length - 1 ? '<div style="width:2px;flex:1;background:var(--color-border);margin-top:4px;"></div>' : ''}
					</div>
					<div style="padding-top:2px;">
						<div style="font-weight:bold;font-size:13px;">${stop.name || 'Stop ' + (i + 1)}</div>
						${stop.description ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">${stop.description}</div>` : ''}
					</div>
				</div>`
				)
				.join('');

			dom.innerHTML = `
				<div style="font-weight:bold;font-size:13px;color:var(--color-accent);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${attrs.title || 'Route'}</div>
				${stopsHtml || '<div style="font-size:12px;color:var(--color-text-muted);">No stops added yet</div>'}
			`;

			dom.addEventListener('click', () => {
				if (typeof getPos === 'function') {
					const event = new CustomEvent('edit-route-block', {
						detail: { pos: getPos(), attrs: { ...node.attrs } },
						bubbles: true
					});
					dom.dispatchEvent(event);
				}
			});

			dom.addEventListener('mouseenter', () => {
				dom.style.boxShadow = '4px 4px 0 var(--color-border)';
			});
			dom.addEventListener('mouseleave', () => {
				dom.style.boxShadow = '3px 3px 0 var(--color-border)';
			});

			return {
				dom,
				update(updatedNode) {
					if (updatedNode.type.name !== 'routeBlock') return false;
					return false;
				}
			};
		};
	}
});
