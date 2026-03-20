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
