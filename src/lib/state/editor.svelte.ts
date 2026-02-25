import type { Location, Clip, TransportMode, AspectRatio, AnimationStyle, MapStyle, MusicSelection } from '$lib/types';

export function createEditorState(initial?: {
	title?: string;
	titleColor?: string;
	titleDescription?: string;
	fontId?: string;
	secondaryColor?: string;
	mapStyle?: MapStyle;
	tripDate?: string;
	aspectRatio?: AspectRatio;
	locations?: Location[];
}) {
	let currentStep = $state(0);
	let title = $state(initial?.title ?? '');
	let titleColor = $state(initial?.titleColor ?? '#FFFFFF');
	let titleDescription = $state(initial?.titleDescription ?? '');
	let fontId = $state(initial?.fontId ?? 'inter');
	let secondaryColor = $state(initial?.secondaryColor ?? '#0a0f1e');
	let titleMediaFile = $state<File | null>(null);
	let titleMediaPreviewUrl = $state<string | null>(null);
	let titleMediaType = $state<'photo' | 'video' | null>(null);
	let showLogoOnTitle = $state(false);
	let locations = $state<Location[]>(initial?.locations ? initial.locations.map(l => ({
		...l,
		clips: l.clips.map(c => ({ ...c }))
	})) : []);
	let aspectRatio = $state<AspectRatio>(initial?.aspectRatio ?? '9:16');
	let mapStyle = $state<MapStyle>(initial?.mapStyle ?? 'streets');
	let tripDate = $state(initial?.tripDate ?? new Date().toISOString().slice(0, 10));
	let keepOriginalAudio = $state(true);
	let musicSelection = $state<MusicSelection | null>(null);
	let musicVolume = $state(70);
	let voiceOverVolume = $state(100);
	let isExporting = $state(false);
	let exportDone = $state(false);

	let canAddLocation = $derived(locations.length < 10);
	let canExport = $derived(locations.length >= 2);
	let hasContent = $derived(title.trim().length > 0 || locations.length > 0);
	const stepLabels = ['Details', 'Locations', 'Review', 'Export'];

	return {
		get currentStep() {
			return currentStep;
		},
		set currentStep(v: number) {
			currentStep = v;
		},
		get title() {
			return title;
		},
		set title(v: string) {
			title = v;
		},
		get titleColor() {
			return titleColor;
		},
		set titleColor(v: string) {
			titleColor = v;
		},
		get titleDescription() {
			return titleDescription;
		},
		set titleDescription(v: string) {
			titleDescription = v;
		},
		get fontId() {
			return fontId;
		},
		set fontId(v: string) {
			fontId = v;
		},
		get secondaryColor() {
			return secondaryColor;
		},
		set secondaryColor(v: string) {
			secondaryColor = v;
		},
		get titleMediaFile() {
			return titleMediaFile;
		},
		get titleMediaPreviewUrl() {
			return titleMediaPreviewUrl;
		},
		get titleMediaType() {
			return titleMediaType;
		},
		get showLogoOnTitle() {
			return showLogoOnTitle;
		},
		set showLogoOnTitle(v: boolean) {
			showLogoOnTitle = v;
		},
		get locations() {
			return locations;
		},
		get aspectRatio() {
			return aspectRatio;
		},
		set aspectRatio(v: AspectRatio) {
			aspectRatio = v;
		},
		get mapStyle() {
			return mapStyle;
		},
		set mapStyle(v: MapStyle) {
			mapStyle = v;
		},
		get tripDate() {
			return tripDate;
		},
		set tripDate(v: string) {
			tripDate = v;
		},
		get keepOriginalAudio() {
			return keepOriginalAudio;
		},
		set keepOriginalAudio(v: boolean) {
			keepOriginalAudio = v;
		},
		get musicSelection() {
			return musicSelection;
		},
		set musicSelection(v: MusicSelection | null) {
			musicSelection = v;
		},
		get musicVolume() {
			return musicVolume;
		},
		set musicVolume(v: number) {
			musicVolume = v;
		},
		get voiceOverVolume() {
			return voiceOverVolume;
		},
		set voiceOverVolume(v: number) {
			voiceOverVolume = v;
		},
		get isExporting() {
			return isExporting;
		},
		get exportDone() {
			return exportDone;
		},
		get canAddLocation() {
			return canAddLocation;
		},
		get canExport() {
			return canExport;
		},
		get hasContent() {
			return hasContent;
		},
		get stepLabels() {
			return stepLabels;
		},

		nextStep() {
			if (currentStep < 3) currentStep++;
		},
		prevStep() {
			if (currentStep > 0) currentStep--;
		},

		addLocation(loc: { name: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null }) {
			if (!canAddLocation) return;
			const newLoc: Location = {
				id: crypto.randomUUID(),
				order: locations.length,
				name: loc.name,
				label: loc.name.split(',')[0],
				description: null,
				lat: loc.lat,
				lng: loc.lng,
				city: loc.city ?? null,
				state: loc.state ?? null,
				country: loc.country ?? null,
				clips: [],
				transportMode: null,
				rating: null
			};
			locations = [...locations, newLoc];
		},

		removeLocation(id: string) {
			locations = locations.filter((l) => l.id !== id).map((l, i) => ({ ...l, order: i }));
		},

		moveLocation(fromIndex: number, toIndex: number) {
			const copy = [...locations];
			const [moved] = copy.splice(fromIndex, 1);
			copy.splice(toIndex, 0, moved);
			locations = copy.map((l, i) => ({ ...l, order: i }));
		},

		addClipToLocation(locationId: string, file: File) {
			const isVideo = file.type.startsWith('video/');
			const previewUrl = URL.createObjectURL(file);
			const clip: Clip = {
				id: crypto.randomUUID(),
				order: 0,
				file,
				previewUrl,
				type: isVideo ? 'video' : 'photo',
				animationStyle: 'kenBurns'
			};
			locations = locations.map((l) => {
				if (l.id !== locationId) return l;
				const newClips = [...l.clips, { ...clip, order: l.clips.length }];
				return { ...l, clips: newClips };
			});
		},

		removeClip(locationId: string, clipId: string) {
			locations = locations.map((l) => {
				if (l.id !== locationId) return l;
				const filtered = l.clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, order: i }));
				return { ...l, clips: filtered };
			});
		},

		moveClip(locationId: string, fromIndex: number, toIndex: number) {
			locations = locations.map((l) => {
				if (l.id !== locationId) return l;
				const copy = [...l.clips];
				const [moved] = copy.splice(fromIndex, 1);
				copy.splice(toIndex, 0, moved);
				return { ...l, clips: copy.map((c, i) => ({ ...c, order: i })) };
			});
		},

		updateClipAnimation(locationId: string, clipId: string, style: AnimationStyle) {
			locations = locations.map((l) => {
				if (l.id !== locationId) return l;
				return {
					...l,
					clips: l.clips.map((c) => (c.id === clipId ? { ...c, animationStyle: style } : c))
				};
			});
		},

		updateLocationTransport(id: string, mode: TransportMode) {
			locations = locations.map((l) => (l.id === id ? { ...l, transportMode: mode } : l));
		},

		updateLocationLabel(id: string, label: string) {
			const trimmed = label.trim();
			locations = locations.map((l) =>
				l.id === id ? { ...l, label: trimmed || null } : l
			);
		},

		updateLocationDescription(id: string, description: string) {
			const trimmed = description.trim();
			locations = locations.map((l) =>
				l.id === id ? { ...l, description: trimmed || null } : l
			);
		},

		updateLocationRating(id: string, rating: number | null) {
			locations = locations.map((l) =>
				l.id === id ? { ...l, rating } : l
			);
		},

		updateTitleMedia(file: File) {
			if (titleMediaPreviewUrl) URL.revokeObjectURL(titleMediaPreviewUrl);
			titleMediaFile = file;
			titleMediaPreviewUrl = URL.createObjectURL(file);
			titleMediaType = 'photo';
		},

		clearMusic() {
			if (musicSelection?.previewUrl) URL.revokeObjectURL(musicSelection.previewUrl);
			musicSelection = null;
			musicVolume = 70;
		},

		removeTitleMedia() {
			if (titleMediaPreviewUrl) URL.revokeObjectURL(titleMediaPreviewUrl);
			titleMediaFile = null;
			titleMediaPreviewUrl = null;
			titleMediaType = null;
		},

		async startExport() {
			isExporting = true;
			exportDone = false;
			await new Promise((r) => setTimeout(r, 3000));
			isExporting = false;
			exportDone = true;
		}
	};
}
