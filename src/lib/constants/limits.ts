import type { AspectRatio } from '$lib/types';

export type UserTier = 'free' | 'pro';

export const isMobileDevice =
	typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// ── Free-tier limits ──
export const FREE_LIMITS = {
	mobile: {
		maxLocations: 5,
		maxClipsPerLocation: 3,
		maxVideoClipSec: 15,
	},
	desktop: {
		maxLocations: 8,
		maxClipsPerLocation: 5,
		maxVideoClipSec: 30,
	}
} as const;

// ── Pro-tier limits ──
export const PRO_LIMITS = {
	mobile: {
		maxLocations: 15,
		maxClipsPerLocation: 10,
		maxVideoClipSec: 60,
	},
	desktop: {
		maxLocations: 25,
		maxClipsPerLocation: 15,
		maxVideoClipSec: 120,
	}
} as const;

export function getLimits(tier: UserTier = 'free') {
	const limits = tier === 'pro' ? PRO_LIMITS : FREE_LIMITS;
	return isMobileDevice ? limits.mobile : limits.desktop;
}

// ── Resolutions per tier ──
type ResolutionMap = { width: number; height: number };

const FREE_RESOLUTIONS: Record<string, Record<AspectRatio, ResolutionMap>> = {
	mobile: {
		'9:16': { width: 720, height: 1280 },
		'1:1': { width: 720, height: 720 },
		'16:9': { width: 1280, height: 720 }
	},
	desktop: {
		'9:16': { width: 1080, height: 1920 },
		'1:1': { width: 1080, height: 1080 },
		'16:9': { width: 1920, height: 1080 }
	}
};

const PRO_RESOLUTIONS: Record<string, Record<AspectRatio, ResolutionMap>> = {
	mobile: {
		'9:16': { width: 1080, height: 1920 },
		'1:1': { width: 1080, height: 1080 },
		'16:9': { width: 1920, height: 1080 }
	},
	desktop: {
		'9:16': { width: 1080, height: 1920 },
		'1:1': { width: 1080, height: 1080 },
		'16:9': { width: 1920, height: 1080 }
	}
};

export function getResolutionForTier(aspectRatio: AspectRatio, tier: UserTier = 'free'): ResolutionMap {
	const device = isMobileDevice ? 'mobile' : 'desktop';
	const resolutions = tier === 'pro' ? PRO_RESOLUTIONS : FREE_RESOLUTIONS;
	return resolutions[device][aspectRatio];
}

// ── Pro desktop high-resolution ladder (4K → 1440p → 1080p) ──
// Used only for Pro users on desktop. The export probes each rung with the real
// encoder config and uses the highest the device actually supports, always
// falling back to the proven 1080p baseline. Mobile/free are unaffected.
const PRO_DESKTOP_LADDER: Record<AspectRatio, ResolutionMap[]> = {
	'9:16': [
		{ width: 2160, height: 3840 }, // 4K portrait
		{ width: 1440, height: 2560 }, // 1440p portrait
		{ width: 1080, height: 1920 }  // 1080p portrait (baseline)
	],
	'1:1': [
		{ width: 2160, height: 2160 },
		{ width: 1440, height: 1440 },
		{ width: 1080, height: 1080 }
	],
	'16:9': [
		{ width: 3840, height: 2160 },
		{ width: 2560, height: 1440 },
		{ width: 1920, height: 1080 }
	]
};

/**
 * Ordered list of candidate export resolutions for a tier, best → safest.
 * Pro + desktop gets the 4K→1440p→1080p ladder; everyone else gets a single
 * resolution (their existing behavior is unchanged).
 */
export function getResolutionLadder(aspectRatio: AspectRatio, tier: UserTier = 'free'): ResolutionMap[] {
	const isDesktop = !isMobileDevice;
	if (tier === 'pro' && isDesktop) {
		return PRO_DESKTOP_LADDER[aspectRatio];
	}
	return [getResolutionForTier(aspectRatio, tier)];
}

// H.264 level thresholds by frame area (px). Levels cap the max frame size:
//  L4.0 → ≤1080p, L5.0 → ≤1440p, L5.1 → ≤4K. We pick the lowest level that fits
//  so older decoders still play smaller videos.
const AREA_1080P = 1920 * 1088; // ~2.09M
const AREA_1440P = 2560 * 1440; // ~3.69M (L5.0 MaxFS comfortably covers portrait 1440p too)

/** Pick the H.264 codec string (Main profile) for a resolution. */
export function avcCodecForResolution(width: number, height: number): string {
	const area = width * height;
	if (area <= AREA_1080P) return 'avc1.4d0028'; // Main, Level 4.0
	if (area <= AREA_1440P) return 'avc1.4d0032'; // Main, Level 5.0
	return 'avc1.4d0033'; // Main, Level 5.1 (covers up to 4K)
}

/** Target bitrate (bps) for a resolution at 30fps. */
export function bitrateForResolution(width: number, height: number): number {
	const area = width * height;
	if (area <= AREA_1080P) return 5_000_000; // unchanged baseline for ≤1080p
	if (area <= AREA_1440P) return 16_000_000; // 1440p
	return 40_000_000; // 4K
}
