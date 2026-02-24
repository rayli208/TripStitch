export interface User {
	id: string;
	name: string;
	email: string;
	avatarUrl: string;
}

export type TransportMode = 'walked' | 'drove' | 'biked';

export type AspectRatio = '9:16' | '1:1' | '16:9';

export type AnimationStyle = 'kenBurns' | 'zoomIn' | 'panHorizontal' | 'static';

export type MapStyle = 'streets' | 'satellite' | 'outdoor' | 'topo' | 'dark' | 'light';

export interface SocialLinks {
	instagram?: string;
	youtube?: string;
	tiktok?: string;
	website?: string;
}

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
	createdAt: string;
}

export interface Clip {
	id: string;
	order: number;
	file: File | null;
	previewUrl: string | null;
	type: 'photo' | 'video' | null;
	animationStyle: AnimationStyle;
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
}

export interface VideoLinks {
	youtube?: string;
	instagram?: string;
	tiktok?: string;
	other?: string;
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
	locations: Location[];
	aspectRatio: AspectRatio;
	videoLinks?: VideoLinks;
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
}
