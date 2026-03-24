import type { BlogCategory } from '$lib/types';

export const BLOG_CATEGORIES: { value: BlogCategory; label: string }[] = [
	{ value: 'guide', label: 'Guide' },
	{ value: 'listicle', label: 'Listicle' },
	{ value: 'review', label: 'Review' },
	{ value: 'story', label: 'Story' },
	{ value: 'tips', label: 'Tips' },
	{ value: 'itinerary', label: 'Itinerary' }
];

export const BLOG_LOCATION_CATEGORIES = [
	'restaurant',
	'bar',
	'cafe',
	'brewery',
	'cocktail bar',
	'dive bar',
	'museum',
	'park',
	'hotel',
	'hostel',
	'landmark',
	'shop',
	'market',
	'nightclub',
	'winery',
	'distillery',
	'bakery',
	'other'
];

export const WORDS_PER_MINUTE = 238;
