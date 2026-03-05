# TripStitch

Browser-based travel video creator. Users add photos/videos from trips, and the app generates MP4 videos with animated map transitions, music, and voice-over - all processed client-side.

## Stack

- **Svelte 5** (runes: `$state`, `$derived`, `$effect`) + **SvelteKit** (file-based routing)
- **TypeScript**, **Tailwind CSS v4**, **Vite**

- **Firebase**: Auth (Google + Email/Password), Firestore (data), Storage (images)
- **MapLibre GL** + **MapTiler** for maps, **Globe.GL** for 3D globe
- **mp4-muxer** + **WebCodecs API** for video encoding

## Project Structure

```
src/
  routes/                    # SvelteKit file-based routing
    +page.svelte             # Landing page
    create/                  # Trip editor (multi-step form)
    signin/                  # Auth (Google + email/password + forgot password)
    trips/                   # Dashboard (user's trips)
    profile/                 # Profile setup
    trip/[id]/               # View trip (public share page)
      edit/                  # Edit existing trip
      export/                # Export trip to video
    u/[username]/            # Public profile page
    explore/                 # Trip discovery
    invite/                  # Invite flow

  lib/
    components/
      ui/                    # Primitives: Button, Input, Modal, ColorPicker, Spinner, etc.
      editor/                # Editor steps: TitleStep, LocationsStep, ReviewStep, ExportStep (orchestrator), ExportProgress, ExportResult, AudioEditor
      dashboard/             # Trip cards, empty states
      layout/                # AppShell, navigation
      TravelMap.svelte       # MapLibre map display
      TravelGlobe.svelte     # 3D globe (globe.gl)

    state/                   # Svelte 5 reactive stores (module-level singletons)
      auth.svelte.ts         # Firebase auth state
      trips.svelte.ts        # Trip list with Firestore real-time sync
      profile.svelte.ts      # User profile (fonts, colors, social links)
      editor.svelte.ts       # Multi-step editor state (factory function)
      toast.svelte.ts        # Toast notifications

    services/                # Core business logic
      videoAssembler.ts      # MP4 assembly with mp4-muxer
      videoProcessor.ts      # Canvas frame encoding
      voiceOverService.ts    # Voice recording + audio merging
      mapRenderer.ts         # Map animation frames
      routeService.ts        # Route calculation between locations (cached)
      musicService.ts        # Music track management (cached)
      shareService.ts        # Public sharing / trip fetching
      exportGuard.ts         # Prevents mobile backgrounding during export
      webCodecsEncoder.ts    # WebCodecs API encoder
      browserCompat.ts       # Feature detection (WebCodecs, Safari workarounds)

    types/index.ts           # All TypeScript interfaces (Trip, Location, Clip, User, etc.)
    constants/               # fonts.ts, music.ts, map.ts, tags.ts
    utils/                   # imageUtils, distance, durationEstimate, fontLoader, videoEmbed
    firebase.ts              # Firebase init
```

## Key Patterns

- **State**: Module-level singletons using Svelte 5 runes. `auth` and `trips` are created once; `editor` is a factory (`createEditorState()`) for fresh instances.
- **Auth guard**: Pages use `$effect` to check `authState.isSignedIn` and redirect to `/signin`.
- **Data serialization**: `trips.svelte.ts` strips `File` objects and blob URLs before Firestore writes (`serializeTrip()`), and handles backward-compatible migration from old single-media format to clips array.
- **Video pipeline**: Editor collects media -> `videoProcessor` draws frames on canvas -> `webCodecsEncoder` or MediaRecorder encodes -> `videoAssembler` muxes to MP4.
- **Maps**: MapTiler tiles via MapLibre GL. 6 styles available (streets, satellite, outdoor, topo, dark, light). Routes fetched from MapTiler routing API.

## Commands

```bash
npm run dev        # Dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run check      # svelte-check type checking
```

## Environment Variables

All prefixed `PUBLIC_` (client-side accessible via SvelteKit):
- `PUBLIC_FIREBASE_*` - Firebase config (API key, auth domain, project ID, etc.)
- `PUBLIC_MAPTILER_KEY` - MapTiler API key
- `PUBLIC_GOOGLE_PLACES_API_KEY` - Google Places autocomplete

## Firebase

- **Firestore collections**: `trips` (top-level), `users/{uid}/profile/main`, `usernames/{username}`
- **Storage paths**: `users/{uid}/logo.*`, `trips/{tripId}/*`
- **Security rules**: `firestore.rules`, `storage.rules`
- **Index**: Composite index on trips `(userId ASC, createdAt DESC)`

## Firebase Projects

- **Dev**: `tripstitch-dev` (used by `.env.development`)
- **Prod**: `tripstitch-6b21a` (used by `.env.production`)
- Deploy rules to both: `firebase deploy --only storage,firestore --project <project-id>`

## Deployment

- **Hosting**: Firebase Hosting with `adapter-static` (SPA fallback to `200.html`)
- **CI/CD**: GitHub Actions auto-deploy on push to `main`, preview deploys on PRs
- **Domain**: `tripstitch.blog` (custom domain via Namecheap DNS)
