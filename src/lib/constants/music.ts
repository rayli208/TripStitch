import type { MusicMood } from '$lib/types';

export interface MusicMoodDef {
	id: MusicMood;
	label: string;
	icon: string;
}

export interface MusicTrackDef {
	id: string;
	title: string;
	mood: MusicMood;
	durationSec: number;
	storagePath: string;
}

export const MUSIC_MOODS: MusicMoodDef[] = [
	{ id: 'adventure', label: 'Adventure', icon: '🏔️' },
	{ id: 'chill', label: 'Chill', icon: '🌊' },
	{ id: 'cinematic', label: 'Cinematic', icon: '🎬' },
	{ id: 'upbeat', label: 'Upbeat', icon: '🎉' },
	{ id: 'romantic', label: 'Romantic', icon: '💕' },
	{ id: 'epic', label: 'Epic', icon: '⚡' }
];

export const MUSIC_TRACKS: MusicTrackDef[] = [
	// Adventure — search "adventure" on pixabay.com/music/
	{ id: 'adv-begins', title: 'Adventure Begins', mood: 'adventure', durationSec: 145, storagePath: 'music/adv-begins.mp3' },
	{ id: 'adv-best', title: 'Best Adventure Ever', mood: 'adventure', durationSec: 153, storagePath: 'music/adv-best.mp3' },
	{ id: 'adv-epic', title: 'Adventure Epic Background Music', mood: 'adventure', durationSec: 150, storagePath: 'music/adv-epic.mp3' },
	// Chill — search "chill", "lofi" on pixabay.com/music/
	{ id: 'chill-goodnight', title: 'Good Night - Lofi Cozy Chill Music', mood: 'chill', durationSec: 147, storagePath: 'music/chill-goodnight.mp3' },
	{ id: 'chill-lofi', title: 'Lofi Chill', mood: 'chill', durationSec: 145, storagePath: 'music/chill-lofi.mp3' },
	{ id: 'chill-just', title: 'Just Chill', mood: 'chill', durationSec: 122, storagePath: 'music/chill-just.mp3' },
	// Cinematic — search "cinematic", "emotional" on pixabay.com/music/
	{ id: 'cin-piano', title: 'Inspiring Emotional Cinematic Piano', mood: 'cinematic', durationSec: 150, storagePath: 'music/cin-piano.mp3' },
	{ id: 'cin-emotional', title: 'Emotional Cinematic Background Music', mood: 'cinematic', durationSec: 150, storagePath: 'music/cin-emotional.mp3' },
	{ id: 'cin-underscore', title: 'Soft Emotional Cinematic Underscore', mood: 'cinematic', durationSec: 135, storagePath: 'music/cin-underscore.mp3' },
	// Upbeat — search "happy", "upbeat", "fun" on pixabay.com/music/
	{ id: 'up-happy', title: 'Happy and Fun', mood: 'upbeat', durationSec: 130, storagePath: 'music/up-happy.mp3' },
	{ id: 'up-upbeat', title: 'Upbeat and Fun', mood: 'upbeat', durationSec: 130, storagePath: 'music/up-upbeat.mp3' },
	{ id: 'up-fungame', title: 'Fun Game - Upbeat Happy Video Game Music', mood: 'upbeat', durationSec: 120, storagePath: 'music/up-fungame.mp3' },
	// Romantic — search "romantic" on pixabay.com/music/
	{ id: 'rom-story', title: 'Emotional Romantic Piano Story', mood: 'romantic', durationSec: 150, storagePath: 'music/rom-story.mp3' },
	{ id: 'rom-inspire', title: 'Inspirational Romantic Piano', mood: 'romantic', durationSec: 131, storagePath: 'music/rom-inspire.mp3' },
	{ id: 'rom-beautiful', title: 'Inspiring Piano (Beautiful Emotional Romantic)', mood: 'romantic', durationSec: 150, storagePath: 'music/rom-beautiful.mp3' },
	// Epic — search "epic", "dramatic" on pixabay.com/music/
	{ id: 'epic-hollywood', title: 'Epic Hollywood Trailer', mood: 'epic', durationSec: 121, storagePath: 'music/epic-hollywood.mp3' },
	{ id: 'epic-victory', title: 'Epic Orchestral Music For Victory', mood: 'epic', durationSec: 98, storagePath: 'music/epic-victory.mp3' },
	{ id: 'epic-tension', title: 'Dramatic Orchestral - Mystery of Tension', mood: 'epic', durationSec: 152, storagePath: 'music/epic-tension.mp3' }
];

export function getTrackById(id: string): MusicTrackDef | undefined {
	return MUSIC_TRACKS.find((t) => t.id === id);
}

export function getTracksByMood(mood: MusicMood): MusicTrackDef[] {
	return MUSIC_TRACKS.filter((t) => t.mood === mood);
}
