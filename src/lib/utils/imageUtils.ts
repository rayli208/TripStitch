/** True if the file is a HEIC/HEIF image. Browsers other than Safari report an
 *  empty `file.type` for these, so we sniff the extension as well as the MIME type. */
export function isHeic(file: File): boolean {
	return (
		file.type === 'image/heic' ||
		file.type === 'image/heif' ||
		/\.(heic|heif)$/i.test(file.name)
	);
}

/** Ensure a user-selected image is in a format every browser can decode and display.
 *  HEIC/HEIF (Apple's default photo format) can only be decoded natively by Safari, so
 *  for every other browser we convert it to JPEG up front. Non-HEIC files pass through
 *  untouched. The heic2any decoder is loaded lazily so its WASM payload only ships when
 *  a HEIC file is actually selected. */
export async function normalizeImageFile(file: File): Promise<File> {
	if (!isHeic(file)) return file;

	const { default: heic2any } = await import('heic2any');
	const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
	const blob = Array.isArray(result) ? result[0] : result;
	const name = file.name.replace(/\.(heic|heif)$/i, '.jpg');
	return new File([blob], name, { type: 'image/jpeg' });
}

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
