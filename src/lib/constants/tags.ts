import type { TripTag, PriceTier } from '$lib/types';

export const TRIP_TAGS: { value: TripTag; label: string }[] = [
	{ value: 'Road Trip', label: 'Road Trip' },
	{ value: 'Hiking', label: 'Hiking' },
	{ value: 'City Break', label: 'City Break' },
	{ value: 'Beach', label: 'Beach' },
	{ value: 'Backpacking', label: 'Backpacking' },
	{ value: 'Foodie', label: 'Foodie' },
	{ value: 'Adventure', label: 'Adventure' },
	{ value: 'Nature', label: 'Nature' },
	{ value: 'Cultural', label: 'Cultural' },
	{ value: 'Photography', label: 'Photography' }
];

export const PRICE_TIERS: { value: PriceTier; label: string }[] = [
	{ value: '$', label: '$' },
	{ value: '$$', label: '$$' },
	{ value: '$$$', label: '$$$' },
	{ value: '$$$$', label: '$$$$' }
];
