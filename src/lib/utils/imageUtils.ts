/** Compress and resize an image File to WebP, returning a Blob.
 *  Maintains aspect ratio. Defaults to max 1200px wide, 0.8 quality. */
export async function compressImage(
	file: File,
	maxWidth = 1200,
	quality = 0.8
): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, maxWidth / bitmap.width);
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	// Try WebP first, fall back to JPEG
	let blob = await canvas.convertToBlob({ type: 'image/webp', quality });
	if (blob.type !== 'image/webp') {
		blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
	}
	return blob;
}

/** Get the file extension for an image blob's mime type */
export function imageExtension(blob: Blob): string {
	return blob.type === 'image/webp' ? 'webp' : 'jpg';
}
