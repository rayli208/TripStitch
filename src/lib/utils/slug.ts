/** Generate a URL-safe slug from a title string */
export function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

/** Append a short random suffix to ensure slug uniqueness */
export function uniqueSlug(title: string): string {
	const base = generateSlug(title);
	const suffix = Math.random().toString(36).slice(2, 8);
	return base ? `${base}-${suffix}` : suffix;
}
