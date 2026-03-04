import type { TripTag, PriceTier } from '$lib/types';

export const TRIP_TAGS: { value: TripTag; label: string; icon: string }[] = [
	{ value: 'Road Trip', label: 'Road Trip', icon: '🚗' },
	{ value: 'Hiking', label: 'Hiking', icon: '🥾' },
	{ value: 'City Break', label: 'City Break', icon: '🏙️' },
	{ value: 'Beach', label: 'Beach', icon: '🏖️' },
	{ value: 'Backpacking', label: 'Backpacking', icon: '🎒' },
	{ value: 'Foodie', label: 'Foodie', icon: '🍽️' },
	{ value: 'Adventure', label: 'Adventure', icon: '⛰️' },
	{ value: 'Nature', label: 'Nature', icon: '🌿' },
	{ value: 'Cultural', label: 'Cultural', icon: '🏛️' },
	{ value: 'Photography', label: 'Photography', icon: '📷' }
];

export const PRICE_TIERS: { value: PriceTier; label: string }[] = [
	{ value: '$', label: '$' },
	{ value: '$$', label: '$$' },
	{ value: '$$$', label: '$$$' },
	{ value: '$$$$', label: '$$$$' }
];
