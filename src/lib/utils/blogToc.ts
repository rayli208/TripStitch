export interface BlogHeading {
	id: string;
	text: string;
	level: 2 | 3;
}

interface TipTapNode {
	type?: string;
	attrs?: Record<string, unknown>;
	content?: TipTapNode[];
	text?: string;
}

function headingText(node: TipTapNode): string {
	let text = '';
	const walk = (n: TipTapNode) => {
		if (n.text) text += n.text;
		n.content?.forEach(walk);
	};
	walk(node);
	return text.trim();
}

function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'section'
	);
}

/**
 * Extract h2/h3 headings (with stable, deduped anchor ids) from TipTap JSON,
 * in document order. The renderer and the TOC both use this so anchors and
 * links always agree.
 */
export function extractHeadings(content: Record<string, unknown>): BlogHeading[] {
	const nodes = (content?.content as TipTapNode[]) ?? [];
	const seen = new Map<string, number>();
	const headings: BlogHeading[] = [];
	for (const node of nodes) {
		if (node.type !== 'heading') continue;
		const level = (node.attrs?.level as number) === 3 ? 3 : 2;
		const text = headingText(node);
		if (!text) continue;
		const base = slugify(text);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		headings.push({ id: count === 0 ? base : `${base}-${count}`, text, level });
	}
	return headings;
}
