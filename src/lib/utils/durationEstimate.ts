import type { Location } from '$lib/types';

// Timing constants matching videoAssembler.ts pipeline
const TITLE_DURATION = 2.5;
const FIRST_FLY_DURATION = 3.2; // flyTo (1.5s) + hold (1.7s)
const SUBSEQUENT_FLY_DURATION = 4.1; // zoomOut (1s) + pause (0.4s) + zoomIn (1.5s) + hold (1.2s)
const PHOTO_DURATION = 3; // kenBurns/zoom animation
const FLASH_DURATION = 0.4;
const FINAL_ROUTE_DURATION = 4.5;
const OUTRO_DURATION = 3;

export interface DurationEstimate {
	totalSec: number;
	formatted: string;
}

export function estimateVideoDuration(
	locations: Location[],
	videoDurations?: Map<string, number>,
	hasOutro = false
): DurationEstimate {
	let totalSec = TITLE_DURATION;

	for (let i = 0; i < locations.length; i++) {
		const loc = locations[i];

		// Map fly-to
		totalSec += i === 0 ? FIRST_FLY_DURATION : SUBSEQUENT_FLY_DURATION;

		// Clips
		for (const clip of loc.clips) {
			if (!clip.file) continue;
			if (clip.type === 'video') {
				const dur = videoDurations?.get(clip.id) ?? 5;
				totalSec += dur + FLASH_DURATION;
			} else {
				totalSec += (clip.durationSec ?? PHOTO_DURATION) + FLASH_DURATION;
			}
		}
	}

	totalSec += FINAL_ROUTE_DURATION;
	if (hasOutro) totalSec += OUTRO_DURATION;

	const formatted = formatDuration(totalSec);
	return { totalSec, formatted };
}

function formatDuration(sec: number): string {
	const rounded = Math.round(sec);
	if (rounded < 60) return `~${rounded}s`;
	const min = Math.floor(rounded / 60);
	const rem = rounded % 60;
	return rem > 0 ? `~${min}m ${rem}s` : `~${min}m`;
}
