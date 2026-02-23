import type { Trip, Location } from '$lib/types';

const phoenixvilleLocations: Location[] = [
	{
		id: 'loc-1',
		order: 0,
		name: 'Phoenixville, PA',
		lat: 40.1304,
		lng: -75.5146,
		mediaFile: null,
		mediaPreviewUrl: null,
		mediaType: null,
		label: null,
		animationStyle: 'kenBurns',
		transportMode: null
	},
	{
		id: 'loc-2',
		order: 1,
		name: 'Valley Forge Park',
		lat: 40.0964,
		lng: -75.4441,
		mediaFile: null,
		mediaPreviewUrl: null,
		mediaType: null,
		label: null,
		animationStyle: 'kenBurns',
		transportMode: 'drove'
	},
	{
		id: 'loc-3',
		order: 2,
		name: 'King of Prussia Mall',
		lat: 40.0879,
		lng: -75.3925,
		mediaFile: null,
		mediaPreviewUrl: null,
		mediaType: null,
		label: null,
		animationStyle: 'kenBurns',
		transportMode: 'drove'
	}
];

const nycLocations: Location[] = [
	{
		id: 'loc-4',
		order: 0,
		name: 'Times Square',
		lat: 40.758,
		lng: -73.9855,
		mediaFile: null,
		mediaPreviewUrl: null,
		mediaType: null,
		label: null,
		animationStyle: 'kenBurns',
		transportMode: null
	},
	{
		id: 'loc-5',
		order: 1,
		name: 'Central Park',
		lat: 40.7829,
		lng: -73.9654,
		mediaFile: null,
		mediaPreviewUrl: null,
		mediaType: null,
		label: null,
		animationStyle: 'kenBurns',
		transportMode: 'walked'
	}
];

export const mockTrips: Trip[] = [
	{
		id: 'trip-1',
		title: 'Weekend in Phoenixville',
		titleColor: '#FFFFFF',
		titleDescription: '',
		titleMediaFile: null,
		titleMediaPreviewUrl: null,
		titleMediaType: null,
		showLogoOnTitle: false,
	fontId: 'inter',
		locations: phoenixvilleLocations,
		aspectRatio: '9:16',
		createdAt: '2026-01-15T10:00:00Z',
		updatedAt: '2026-01-15T12:30:00Z'
	},
	{
		id: 'trip-2',
		title: 'NYC Day Trip',
		titleColor: '#FFD700',
		titleDescription: '',
		titleMediaFile: null,
		titleMediaPreviewUrl: null,
		titleMediaType: null,
		showLogoOnTitle: false,
	fontId: 'inter',
		locations: nycLocations,
		aspectRatio: '1:1',
		createdAt: '2026-02-01T08:00:00Z',
		updatedAt: '2026-02-01T14:00:00Z'
	}
];

export const mockSearchResults = [
	{ name: 'Eiffel Tower, Paris', lat: 48.8584, lng: 2.2945 },
	{ name: 'Colosseum, Rome', lat: 41.8902, lng: 12.4922 },
	{ name: 'Statue of Liberty, NYC', lat: 40.6892, lng: -74.0445 },
	{ name: 'Big Ben, London', lat: 51.5007, lng: -0.1246 },
	{ name: 'Sydney Opera House', lat: -33.8568, lng: 151.2153 },
	{ name: 'Machu Picchu, Peru', lat: -13.1631, lng: -72.545 },
	{ name: 'Golden Gate Bridge, SF', lat: 37.8199, lng: -122.4783 },
	{ name: 'Taj Mahal, India', lat: 27.1751, lng: 78.0421 },
	{ name: 'Central Park, NYC', lat: 40.7829, lng: -73.9654 },
	{ name: 'Times Square, NYC', lat: 40.758, lng: -73.9855 },
	{ name: 'Brooklyn Bridge, NYC', lat: 40.7061, lng: -73.9969 },
	{ name: 'Shibuya Crossing, Tokyo', lat: 35.6595, lng: 139.7004 }
];
