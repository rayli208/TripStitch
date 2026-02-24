import { storage } from '$lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import type { MusicTrackDef } from '$lib/constants/music';

// In-memory caches (session lifetime)
const urlCache = new Map<string, string>();
const blobCache = new Map<string, Blob>();

/** Get a Firebase Storage download URL for a track (cached). */
export async function getTrackUrl(track: MusicTrackDef): Promise<string> {
	const cached = urlCache.get(track.id);
	if (cached) return cached;

	const storageRef = ref(storage, track.storagePath);
	const url = await getDownloadURL(storageRef);
	urlCache.set(track.id, url);
	return url;
}

/** Fetch a track's audio as a Blob (cached). Requires CORS configured on the storage bucket. */
export async function fetchTrackBlob(track: MusicTrackDef): Promise<Blob> {
	const cached = blobCache.get(track.id);
	if (cached) return cached;

	const url = await getTrackUrl(track);
	const res = await fetch(url);
	if (!res.ok) throw new Error('Failed to fetch audio');
	const blob = await res.blob();
	blobCache.set(track.id, blob);
	return blob;
}

/** Create play/stop controls for an 8-second track preview snippet. */
export function createTrackPreview(url: string): {
	play: () => void;
	stop: () => void;
	readonly playing: boolean;
} {
	const audio = new Audio();
	audio.src = url;
	audio.volume = 0.6;
	let playing = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	function stop() {
		if (timeout) { clearTimeout(timeout); timeout = null; }
		audio.pause();
		audio.currentTime = 0;
		playing = false;
	}

	function play() {
		stop();
		audio.currentTime = 0;
		audio.play().catch(() => {});
		playing = true;
		timeout = setTimeout(stop, 8000);
	}

	audio.onended = () => { playing = false; };

	return {
		play,
		stop,
		get playing() { return playing; }
	};
}
