import { Node, mergeAttributes } from '@tiptap/core';

export interface LocationCardAttributes {
	id: string;
	name: string;
	label: string | null;
	description: string | null;
	lat: number;
	lng: number;
	city: string | null;
	state: string | null;
	country: string | null;
	rating: number | null;
	priceTier: string | null;
	imageUrls: string;
	websiteUrl: string | null;
	instagramHandle: string | null;
	hours: string | null;
	rank: number | null;
	category: string | null;
	tips: string | null;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		locationCard: {
			insertLocationCard: (attrs: LocationCardAttributes) => ReturnType;
		};
	}
}

export const LocationCardExtension = Node.create({
	name: 'locationCard',
	group: 'block',
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			id: { default: '' },
			name: { default: '' },
			label: { default: null },
			description: { default: null },
			lat: { default: 0 },
			lng: { default: 0 },
			city: { default: null },
			state: { default: null },
			country: { default: null },
			rating: { default: null },
			priceTier: { default: null },
			imageUrls: { default: '[]' },
			websiteUrl: { default: null },
			instagramHandle: { default: null },
			hours: { default: null },
			rank: { default: null },
			category: { default: null },
			tips: { default: null }
		};
	},

	addCommands() {
		return {
			insertLocationCard:
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
		return [{ tag: 'div[data-location-card]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-location-card': '' })];
	},

	addNodeView() {
		return ({ node, getPos }) => {
			const dom = document.createElement('div');
			dom.className = 'location-card-node';
			dom.setAttribute('data-location-card', '');
			dom.style.cssText =
				'border: 2px solid var(--color-border); border-radius: 12px; padding: 12px 16px; margin: 8px 0; background: var(--color-card); box-shadow: 3px 3px 0 var(--color-border); cursor: pointer; transition: box-shadow 0.15s;';

			const attrs = node.attrs;

			// Rank badge
			const rankHtml = attrs.rank
				? `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--color-accent);color:#fff;font-weight:bold;font-size:13px;margin-right:8px;flex-shrink:0;border:2px solid var(--color-border);">#${attrs.rank}</span>`
				: '';

			// Stars
			let starsHtml = '';
			if (attrs.rating) {
				const full = Math.floor(attrs.rating);
				const half = attrs.rating % 1 >= 0.5;
				for (let i = 0; i < full; i++) starsHtml += '<span style="color:var(--color-warning);">&#9679;</span>';
				if (half) starsHtml += '<span style="color:var(--color-warning);opacity:0.5;">&#9679;</span>';
			}

			// Price
			const priceHtml = attrs.priceTier
				? `<span style="color:var(--color-success);font-weight:bold;margin-left:6px;">${attrs.priceTier}</span>`
				: '';

			// Category badge
			const catHtml = attrs.category
				? `<span style="display:inline-block;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:bold;background:var(--color-accent-light);border:1px solid var(--color-border);;margin-left:6px;">${attrs.category}</span>`
				: '';

			// Location info
			const locationParts = [attrs.city, attrs.state, attrs.country].filter(Boolean);
			const locationStr = locationParts.length ? locationParts.join(', ') : '';

			dom.innerHTML = `
				<div style="display:flex;align-items:center;margin-bottom:4px;">
					${rankHtml}
					<div>
						<div style="font-weight:bold;font-size:14px;">${attrs.label || attrs.name || 'Untitled Location'}</div>
						${locationStr ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:1px;">${locationStr}</div>` : ''}
					</div>
				</div>
				${starsHtml || priceHtml || catHtml ? `<div style="display:flex;align-items:center;gap:2px;margin-top:4px;font-size:12px;">${starsHtml}${priceHtml}${catHtml}</div>` : ''}
				${attrs.hours ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">Hours: ${attrs.hours}</div>` : ''}
				${attrs.description ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">${attrs.description}</div>` : ''}
				${attrs.tips ? `<div style="font-size:11px;color:var(--color-accent);margin-top:4px;font-style:italic;">Tip: ${attrs.tips}</div>` : ''}
			`;

			dom.addEventListener('click', () => {
				if (typeof getPos === 'function') {
					const event = new CustomEvent('edit-location-card', {
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
					if (updatedNode.type.name !== 'locationCard') return false;
					return false;
				}
			};
		};
	}
});
