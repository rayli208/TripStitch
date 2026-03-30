export interface User {
	id: string;
	name: string;
	email: string;
	avatarUrl: string;
}

export type TransportMode = 'walked' | 'drove' | 'biked';

export type PriceTier = '$' | '$$' | '$$$' | '$$$$';

export type TripVisibility = 'public' | 'unlisted' | 'private';

export type TripTag =
	| 'Road Trip'
	| 'Hiking'
	| 'City Break'
	| 'Beach'
	| 'Backpacking'
	| 'Foodie'
	| 'Adventure'
	| 'Nature'
	| 'Cultural'
	| 'Photography';

export type AspectRatio = '9:16' | '1:1' | '16:9';

export type AnimationStyle = 'kenBurns' | 'zoomIn' | 'panHorizontal' | 'static';

export type MapStyle = 'streets' | 'satellite' | 'outdoor' | 'topo' | 'dark' | 'light';

export type GlobeStyle = MapStyle | 'custom';

export type MapDisplay = 'globe' | 'map';

export interface SocialLinks {
	instagram?: string;
	youtube?: string;
	tiktok?: string;
	website?: string;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid' | null;

export interface UserProfile {
	username: string;
	displayName: string;
	bio: string;
	avatarUrl: string;
	logoUrl: string | null;
	socialLinks: SocialLinks;
	brandColors: string[];
	secondaryColor: string;
	preferredFontId: string;
	globeStyle: GlobeStyle;
	mapDisplay: MapDisplay;
	createdAt: string;
	stripeCustomerId?: string | null;
	subscriptionStatus?: SubscriptionStatus;
	subscriptionId?: string | null;
	subscriptionPriceId?: string | null;
	subscriptionCurrentPeriodEnd?: number | null;
}

export interface Clip {
	id: string;
	order: number;
	file: File | null;
	previewUrl: string | null;
	type: 'photo' | 'video' | null;
	animationStyle: AnimationStyle;
	durationSec?: number;
	trimStartSec?: number;
	trimEndSec?: number;
}

export interface Location {
	id: string;
	order: number;
	name: string;
	label: string | null;
	description: string | null;
	lat: number;
	lng: number;
	city: string | null;
	state: string | null;
	country: string | null;
	clips: Clip[];
	transportMode: TransportMode | null;
	rating: number | null;
	priceTier: PriceTier | null;
}

export interface VideoLinks {
	youtube?: string;
	instagram?: string;
	tiktok?: string;
}

export interface Trip {
	id: string;
	title: string;
	titleColor: string;
	titleDescription: string;
	titleMediaFile: File | null;
	titleMediaPreviewUrl: string | null;
	titleMediaType: 'photo' | 'video' | null;
	showLogoOnTitle: boolean;
	fontId: string;
	mapStyle: MapStyle;
	tripDate: string;
	tags: TripTag[];
	visibility: TripVisibility;
	locations: Location[];
	aspectRatio: AspectRatio;
	videoLinks?: VideoLinks;
	cities: string[];
	states: string[];
	countries: string[];
	createdAt: string;
	updatedAt: string;
}

export interface SharedTrip {
	id: string;
	userId: string;
	username: string;
	userDisplayName: string;
	userAvatarUrl: string;
	userLogoUrl: string | null;
	title: string;
	titleDescription: string;
	titleColor: string;
	fontId: string;
	mapStyle: MapStyle;
	coverImageUrl: string | null;
	tags: TripTag[];
	visibility: TripVisibility;
	locations: SharedLocation[];
	aspectRatio: AspectRatio;
	videoLinks?: VideoLinks;
	tripDate: string;
	stats: { stops: number; miles: number; minutes: number };
	cities: string[];
	states: string[];
	countries: string[];
	createdAt: string;
	sharedAt: string;
}

export type MusicMood = 'adventure' | 'chill' | 'cinematic' | 'upbeat' | 'romantic' | 'epic';

export interface MusicSelection {
	trackId: string;
	title: string;
	mood: MusicMood | 'custom';
	audioBlob: Blob;
	previewUrl: string | null;
	durationSec: number;
	startOffsetSec: number;
}

export interface ExportStepItem {
	id: string;
	label: string;
	icon: 'title' | 'map' | 'clips' | 'route' | 'finalize';
}

export interface SharedLocation {
	id: string;
	order: number;
	name: string;
	label: string | null;
	description: string | null;
	lat: number;
	lng: number;
	city: string | null;
	state: string | null;
	country: string | null;
	transportMode: TransportMode | null;
	rating: number | null;
	priceTier: PriceTier | null;
}

// ── Blog Types ──

export type BlogCategory = 'guide' | 'listicle' | 'review' | 'story' | 'tips' | 'itinerary';

export type BlogVisibility = 'draft' | 'public' | 'unlisted' | 'private';

export interface BlogLocation {
	id: string;
	order: number;
	name: string;
	label: string | null;
	description: string | null;
	lat: number;
	lng: number;
	city: string | null;
	state: string | null;
	country: string | null;
	rating: number | null;
	priceTier: PriceTier | null;
	imageUrls: string[];
	websiteUrl: string | null;
	instagramHandle: string | null;
	hours: string | null;
	rank: number | null;
	category: string | null;
	tips: string | null;
}

export interface RouteStop {
	id: string;
	order: number;
	name: string;
	description: string | null;
}

export interface BlogRoute {
	id: string;
	title: string;
	stops: RouteStop[];
}

export interface BlogPost {
	id: string;
	userId: string;
	title: string;
	subtitle: string | null;
	coverImageUrl: string | null;
	coverImageFile: File | null;
	content: Record<string, unknown>;
	tags: string[];
	category: BlogCategory;
	visibility: BlogVisibility;
	slug: string;
	excerpt: string;
	readingTime: number;
	linkedTripIds: string[];
	youtubeUrl: string | null;
	locations: BlogLocation[];
	routes: BlogRoute[];
	cities: string[];
	states: string[];
	countries: string[];
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
}

export interface SharedBlog {
	id: string;
	userId: string;
	username: string;
	userDisplayName: string;
	userAvatarUrl: string;
	title: string;
	subtitle: string | null;
	coverImageUrl: string | null;
	content: Record<string, unknown>;
	tags: string[];
	category: BlogCategory;
	visibility: BlogVisibility;
	slug: string;
	excerpt: string;
	readingTime: number;
	linkedTripIds: string[];
	youtubeUrl: string | null;
	locations: BlogLocation[];
	routes: BlogRoute[];
	cities: string[];
	states: string[];
	countries: string[];
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
}
