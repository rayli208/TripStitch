# TripStitch UX Review — Comprehensive Analysis

**Reviewer**: ArchitectUX
**Date**: 2026-03-21
**Scope**: All routes, editor components, layout, UI primitives, state management

---

## 1. Executive Summary — Top 5 Most Impactful Issues

### 1. Massive Code Duplication Between Create and Edit Pages (P0)
`/create/+page.svelte` and `/trip/[id]/edit/+page.svelte` share ~80% identical code (export logic, elapsed timer, visibility handlers, export steps builder, download/cancel/retry handlers, blob URL management). This is not just a maintenance burden — it means bug fixes must be applied in two places, and the two flows can silently diverge. The edit page currently lacks the iOS backgrounding recovery (`SAVED_TRIP_KEY`) pattern, meaning iOS users editing a trip are more vulnerable to data loss than those creating one.

**File references**: `/src/routes/create/+page.svelte` (lines 121-340) vs `/src/routes/trip/[id]/edit/+page.svelte` (lines 120-333)

### 2. No "Back to Location Card" Navigation After Adding a Stop (P0)
In `LocationsStep.svelte`, after a user adds clips to a location and taps "Add another stop," they enter the search phase. If they accidentally tap it or want to go back to the previous location card, they must tap the tiny location pill at the top. There is no visible "Back" or "Cancel adding" affordance in the search state when coming from a filled location — the "Cancel" link at line 381 exists but is only 12px text (`text-xs`) and easily missed, especially on mobile.

**File**: `/src/lib/components/editor/LocationsStep.svelte` (lines 370-386)

### 3. Profile Save Bar Positioning Conflicts with Bottom Nav (P1)
The sticky save bar in the profile page uses `bottom: calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)` to position above the bottom nav. This is fragile — if the bottom nav height changes (currently `h-16` = 4rem, but the nav also has `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px)`), the save bar could overlap or leave a gap. On shorter viewports, the save bar plus bottom nav consume ~140px of vertical space, leaving limited room for content.

**File**: `/src/routes/profile/+page.svelte` (line 684)

### 4. Landing Page Says "100% free" While Pricing Section Shows Paid Tier (P1)
The sign-in page (line 307) displays "100% free" as a trust badge. The landing page pricing section clearly shows a "Pro" tier coming soon. Meanwhile, free tier limits (watermark, no custom branding) are already enforced. This messaging inconsistency will erode trust — users sign up expecting "100% free" and immediately hit limitations.

**Files**: `/src/routes/signin/+page.svelte` (line 307), `/src/routes/+page.svelte` (lines 575-680)

### 5. No Explore or Invite Page Exists (P1)
The CLAUDE.md references `/explore/` and `/invite/` routes, but neither exists in the codebase (confirmed via Glob search). If users somehow reach these URLs (old links, documentation), they get the SPA fallback with no content or a blank page. There should either be pages at these routes or proper redirects.

---

## 2. Page-by-Page Analysis

### Landing Page (`/src/routes/+page.svelte`)

**Strengths:**
- Strong visual identity with brutalist design language
- Good SEO with structured data, OG tags
- Scroll-reveal animations respect `prefers-reduced-motion`
- Hero mockup effectively communicates the product

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| L1 | P2 | **Grain overlay uses `position: fixed` with `z-index: 9999`** — this creates a fixed full-screen element that sits above everything. While `pointer-events: none` prevents interaction blocking, it can interfere with browser dev tools selection and adds unnecessary compositing cost on lower-end mobile devices. | 122-131 |
| L2 | P2 | **No footer with legal links** — no privacy policy, terms of service, or contact information anywhere on the landing page. For a product that handles user media and uses Firebase Auth, this is a compliance gap. | End of file |
| L3 | P3 | **Marquee ticker has no `aria-live` or screen reader consideration** — the duplicate `aria-hidden="true"` on the second span is good, but the entire marquee conveys important feature info that screen reader users would miss entirely. | 288-298 |
| L4 | P2 | **Showcase cards use horizontal scroll on mobile without scroll indicators** — the `snap-x` container has no visual hint (scrollbar, peek, or dots) that more cards exist off-screen. | 505-571 |
| L5 | P3 | **"See how it works" anchor link to `#features` jumps past the Location Spotlight section** — the `#features` ID is on the feature grid, not the "how it works" section. Clicking this button scrolls the user to features, but the visual hierarchy suggests it should scroll to the 3-step "how it works" area. | 237-243 |
| L6 | P2 | **Authenticated users are silently redirected to `/create`** — no transition or feedback. If a logged-in user bookmarks the landing page and shares the link, they can never see it again without signing out. | 7-11 |

### Sign In (`/src/routes/signin/+page.svelte`)

**Strengths:**
- Clean two-panel layout (decorative left, form right)
- Good Firebase error mapping
- Email validation before submit
- Password reset flow is clean

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| S1 | P1 | **Form uses `Button` component with `onclick` instead of `type="submit"`** — the form's `onsubmit` handler calls `handleSubmit()`, but the Button also calls `handleSubmit()` via `onclick`. This means pressing Enter in a field fires the form submit, then a separate click event. The `e.preventDefault()` on the form prevents the default, but the flow is redundant and could cause double-submission on some browsers. | 221-222, 252-257 |
| S2 | P2 | **No loading state for initial auth check** — the page renders the full form immediately, then redirects if already signed in. This causes a flash of the sign-in form for authenticated users. | 25-27 |
| S3 | P2 | **Google Sign-In button is not using the Button component** — it has its own inline styles that duplicate the brutalist button pattern. If the Button component's styling changes, this button won't update. | 270-283 |
| S4 | P3 | **Forgot password always shows success** — `resetPassword` catches and swallows errors (line 81: `.catch(() => {})`), then always sets `resetSent = true`. This is intentional to prevent email enumeration, but the UX could be improved with a note like "If an account exists..." (which it does have at line 218 — good). | 80-83 |
| S5 | P2 | **"100% free" badge is misleading** given freemium limits exist. | 307 |

### Dashboard / My Trips (`/src/routes/trips/+page.svelte`)

**Strengths:**
- Good loading state with skeleton cards
- Empty state with clear CTA
- Globe/map visualization adds delight
- Profile link banner is well-positioned

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| D1 | P2 | **TripCard has an `onlinks` handler that navigates to `/trip/${trip.id}/links`** — but this route does not exist in the codebase. Users clicking the link icon get a blank page or 404. | 104 |
| D2 | P2 | **Delete confirmation is inline with no modal or undo** — a mis-tap on "Delete" immediately shows the confirm, and the confirm button is positioned where the delete button just was, making accidental double-tap deletion plausible. There is no undo/toast with recovery. | TripCard.svelte 59-74 |
| D3 | P3 | **No pagination or virtual scrolling** — if a user has dozens of trips, all are rendered with full globe/map visualization. This could become slow. | 99-118 |
| D4 | P2 | **Profile setup banner shows for users without a profile, but no auto-redirect** — new users who just signed up land on `/create` (from signin redirect), not `/trips`. If they navigate to trips first, they see the banner but must manually navigate to profile. The onboarding flow has no guided sequence. | 31-39 |

### Create Page (`/src/routes/create/+page.svelte`)

**Strengths:**
- Tool chooser (Trip Video vs Location Spotlight) is clean
- Navigation guard prevents accidental data loss
- iOS backgrounding recovery is well-handled
- Auth flicker protection during export

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| C1 | P0 | **Export starts automatically when advancing from Review to Stitch** — `onnext={() => { editor.nextStep(); handleExport(); }}` (line 451). There is no confirmation step. The ExportStep idle state (lines 162-174 in ExportStep.svelte) has a "Stitch Video" button, but it's never seen because `handleExport()` fires immediately. This is confusing: the step 4 "Stitch" indicator lights up, but the user never had a chance to see the pre-export screen with the "Stitch Video" button. | 451 |
| C2 | P2 | **Editor state is created with profile's font before profile loads** — `createEditorState({ fontId: profileState.profile?.preferredFontId ?? 'inter' })` runs during component initialization, when `profileState.profile` is likely still null. The `$effect` at lines 74-84 patches this after the fact, but only if the default wasn't already changed. | 69-84 |
| C3 | P2 | **No way to go back to the tool chooser from within the editor** — once the user picks "Trip Video" and enters the editor, there's no back arrow or close button to return to the chooser. They can only use browser back (which triggers the unsaved work dialog) or tap the "Create" bottom nav tab, which fires a custom event. | 343-491 |
| C4 | P3 | **`videoDurations` effect creates a new Map on every update** — `videoDurations = new Map(videoDurations).set(clipId, dur)` triggers a complete re-render of all derived state. For many clips, this is unnecessarily expensive. | 101 |

### Location Spotlight (`/src/routes/create/spotlight/+page.svelte` + `SpotlightCreator.svelte`)

**Strengths:**
- Self-contained two-step flow (town then location)
- Map preview updates reactively
- Clean result screen with download

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| SP1 | P2 | **No navigation guard** — unlike the create page, the spotlight page has no `beforeunload` or `beforeNavigate` guard. If a user is mid-export and navigates away, they lose their work silently. | SpotlightCreator.svelte (entire file) |
| SP2 | P2 | **Input fields duplicate the Input component's styling** instead of using the `Input` component. The spotlight uses raw `<input>` elements with manually applied Tailwind classes that approximate but don't exactly match the Input component's styling (e.g., different shadow values, no `font-bold` on label). | SpotlightCreator.svelte 420-426, 470-476 |
| SP3 | P2 | **No share functionality on spotlight result** — after export, users can only "Save Video" or "Make Another." There is no share button or copy-link option, unlike the trip export flow. | SpotlightCreator.svelte 405-412 |
| SP4 | P3 | **MapLibre CSS loaded from unpkg CDN** — hardcoded to version 5.18.0. If this version is removed from unpkg or unpkg goes down, the map breaks. The trip view page has the same issue. | SpotlightCreator.svelte 381 |

### Profile (`/src/routes/profile/+page.svelte`)

**Strengths:**
- Excellent dirty tracking with snapshot comparison
- Username availability checking with debounce
- Collapsible sections reduce cognitive load
- Delete account has proper confirmation flow

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| P1 | P1 | **Save button can be pressed with validation errors** — `canSave` is `isDirty && !saving && usernameStatus !== 'checking'`, but it does NOT check `hasValidationErrors`. The `handleSave()` function checks and scrolls to show errors, but the button remains enabled and clickable. Users will tap, see nothing happen (scroll to top), and be confused. | 135-136, 198-204 |
| P2 | P2 | **Bio textarea does not use the Input component pattern** — it has slightly different border styling (`border` vs `border-2`), different `bg-page` vs `bg-card`, and no offset shadow. This breaks the brutalist consistency. | 396-400 |
| P3 | P2 | **Font search in profile is a full list render** — all fonts are rendered into the DOM and filtered client-side. With many fonts, this is a large DOM. The TitleStep's font dropdown is capped at `max-h-48` with overflow scroll, which is better. | 532-543 |
| P4 | P3 | **Theme switcher (System/Light/Dark) has no preview** — users must save and observe the change. An instant preview before saving would improve confidence. Actually, looking at the code, `themeState.setMode()` is called `onclick` and presumably applies immediately, which is good. But it's called outside the dirty-tracking snapshot, so theme changes are applied instantly but not tracked as "unsaved changes." | 407-427 |
| P5 | P2 | **Delete account button masquerades as a collapsible section** — the caret icon (line 649) suggests expandability, but it actually changes `deleteStep` to `'confirm'`. This is a dark pattern — users expecting to expand a section get a deletion confirmation instead. | 638-649 |

### Trip View (`/src/routes/trip/[id]/+page.svelte`)

**Strengths:**
- Beautiful public-facing page with grain texture, animations
- Interactive map with route animation and marker pop-in
- Good OG/Twitter meta tags for sharing
- Respects `prefers-reduced-motion`

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| TV1 | P2 | **Private trip check happens after full trip data is fetched** — the entire trip document is loaded from Firestore, then checked for visibility (line 46-48). The security rules should handle this server-side, but the client still processes and briefly holds the data. | 42-54 |
| TV2 | P2 | **"Back" button uses `history.back()`** — if a user arrives directly via a shared link (no history), this navigates to the browser's default page or does nothing. Should fall back to `/` or `/trips`. | 481-486 |
| TV3 | P1 | **Map popup content is built with raw HTML string interpolation** — `setHTML()` with template literals containing `${label}`, `${loc.description}`, etc. If any of these contain HTML, it's injected directly. This is an XSS vector for user-generated content (location labels, descriptions). | 322-323 |
| TV4 | P3 | **Grain overlay `z-index: 9999`** — same issue as landing page. Appears on trip view and profile pages too. | 396-398 |

### Edit Trip (`/src/routes/trip/[id]/edit/+page.svelte`)

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| E1 | P0 | **Code duplication with create page** — as noted in the executive summary. The entire export pipeline is copy-pasted. | Entire file |
| E2 | P2 | **Media re-attachment UX is poor** — when editing an existing trip, all clips are lost (media files can't be stored in Firestore). The warning banner at line 382-385 says "Re-attach your media" but doesn't explain why media was lost or how to re-attach. Users may think something broke. | 381-386 |
| E3 | P2 | **Starting on step 1 (locations) skips the title step** — when editing, the editor starts at `currentStep = 1` (line 80). Users who want to change their title must navigate backward. But the step indicator shows step 1 is active, and the "back" button goes to step 0, which works — it's just not discoverable. | 80 |

### Re-Export (`/src/routes/trip/[id]/export/+page.svelte`)

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| RE1 | P2 | **Simplified export page lacks most features** — this page uses the old single-media format (`trip.locations[0]?.mediaFile`), doesn't support the new clips array, has no music/audio editor, no share URL, no export steps checklist, no elapsed timer. It appears to be a legacy page that hasn't been updated. | 56-75 |
| RE2 | P2 | **No navigation guards** — unlike create and edit, this page has no `beforeunload` or `beforeNavigate` protection during export. | Entire file |
| RE3 | P3 | **No `showBottomNav`** on AppShell — this page uses `showBack` but no bottom nav, which is correct for a focused task, but inconsistent with the edit page which does show bottom nav. | 142 |

### Public Profile (`/src/routes/u/[username]/+page.svelte`)

**Strengths:**
- Clean profile header with avatar, bio, social links
- Stats strip provides good overview
- Trip grid with cover images is attractive
- Globe/map preference is respected

**Issues:**

| # | Severity | Finding | Line(s) |
|---|----------|---------|---------|
| UP1 | P2 | **"Back" button uses `history.back()`** — same issue as trip view. | 201 |
| UP2 | P3 | **No OG image** — the `<svelte:head>` block sets a title but no `og:image`, so social shares will have no preview image. A generated image or default would improve shareability. | 92-97 |
| UP3 | P3 | **Trip card links use `getShareUrl(trip.id)`** which likely returns a full URL like `https://tripstitch.blog/trip/xxx` — but these are used in `<a href=...>` tags. If `getShareUrl` returns a full external URL, navigation will do a full page reload instead of SvelteKit's client-side routing. | 335-336 |

---

## 3. Cross-Cutting Issues

### 3.1 Inconsistent Component Usage

The codebase has an `Input` component (`/src/lib/components/ui/Input.svelte`) with a well-defined brutalist style (border-2, offset shadow, bold label). But many pages create their own input elements:
- **Profile page**: Bio textarea (line 396) uses `border` instead of `border-2`, `bg-page` instead of `bg-card`
- **SpotlightCreator**: All inputs (lines 420-530) are raw elements with approximated styling
- **TitleStep**: Date input (line 200-203) and textarea (line 208-213) are raw elements
- **LocationsStep**: Label input (line 396-401) and description textarea (line 654-659) are raw elements
- **ReviewStep**: No inputs at all besides the tag buttons

**Recommendation**: Extend the `Input` component to support `type="date"`, `textarea` mode, and use it consistently everywhere.

### 3.2 Animation / Transition Repetition

Every page defines its own `@keyframes fade-up` animation with slightly different values:
- Landing: `translateY(30px)`, 0.8s
- Sign-in: `translateY(20px)`, 0.6s
- Profile: `translateY(16px)`, 0.5s
- Trip view: `translateY(20px)`, 0.6s
- Public profile: `translateY(20px)`, 0.6s

Each page also defines its own `.delay-*` and `.fill-both` classes. This should be a shared utility or Tailwind plugin.

### 3.3 Grain Overlay Repetition

The SVG grain filter + CSS overlay pattern is duplicated across:
- Landing page (`grain-filter`)
- Sign-in page (`grain-filter-signin`)
- Trip view (`grain-filter-trip`)
- Public profile (`grain-filter-profile`)

Each uses unique filter IDs to avoid conflicts, but the pattern is identical. This should be a shared component.

### 3.4 Missing `<title>` Tags

Several authenticated pages don't set `<title>`:
- `/create` — no `<svelte:head>` at all
- `/trips` — no `<svelte:head>`
- `/profile` — no `<svelte:head>`
- `/create/spotlight` — no `<svelte:head>`

Browser tabs just show "TripStitch" (from the layout) or nothing.

### 3.5 Auth Guard Pattern Inconsistency

All protected pages use `$effect` to check `authState.loading` and `authState.isSignedIn`, but the pattern varies:
- Some wait for `!authState.loading` before checking (correct)
- Some call `profileState.load()` inside the same effect
- Some subscribe to `tripsState` inside the auth effect
- The create page has special handling for auth flicker during export

This should be a shared utility or layout-level guard.

### 3.6 Button Component Missing `type` Attribute

The `Button` component (`/src/lib/components/ui/Button.svelte`) renders a `<button>` without a `type` attribute. Inside forms, buttons default to `type="submit"`, which can cause unintended form submissions. The component should default to `type="button"`.

### 3.7 Accessibility Gaps

| Area | Issue |
|------|-------|
| **Focus management** | Modal component traps focus (good), but editor step transitions don't manage focus. When moving from step 1 to step 2, focus stays on the "Next" button which is now in a different context. |
| **Form errors** | Error messages are visually rendered but not linked to inputs via `aria-describedby`. Screen readers won't associate errors with fields. |
| **Color picker** | Swatches are `<button>` elements with `aria-label` (good), but the selected state uses only visual cues (border color, scale). No `aria-pressed` or `aria-selected`. |
| **Star rating** | Not visible in the read file, but the `StarRating` component is used without clear keyboard interaction patterns shown. |
| **Drag and drop** | Both `svelte-dnd-action` (clips) and native drag API (review locations) are used. Neither has keyboard alternatives. Screen reader users cannot reorder locations or clips. |
| **Video player** | The `<!-- svelte-ignore a11y_media_has_caption -->` comments appear in multiple places, confirming videos have no captions/subtitles. |

---

## 4. Prioritized Recommendations

### P0 — Critical (Fix Before Next Release)

1. **Extract shared export logic into a service/hook** — Create a `useExport()` factory or similar pattern that both create and edit pages consume. This eliminates the duplication and ensures consistency.

2. **Fix XSS in map popup HTML** — In `/src/routes/trip/[id]/+page.svelte` line 322-323, sanitize `label`, `loc.description`, and other user-generated content before injecting into `setHTML()`. Use a simple HTML-escape utility.

3. **Auto-export on step advance is confusing** — Either (a) show the ExportStep idle state for 1-2 seconds before auto-starting, or (b) remove the auto-start and let users click "Stitch Video" themselves. The current behavior skips UI that was designed to be shown.

### P1 — High Impact

4. **Disable save button when validation errors exist** — In profile page, change `canSave` to include `!hasValidationErrors`: `const canSave = $derived(isDirty && !saving && !hasValidationErrors && usernameStatus !== 'checking');`

5. **Reconcile "100% free" messaging** — Either remove the "100% free" badge from the sign-in page, or change it to "Free to start" (matching the landing page badge). The landing page already says "Free to start" in the hero badge.

6. **Create a redirect or placeholder for `/explore` and `/invite`** — Add minimal pages or redirect to `/trips` and `/signin` respectively.

7. **Fix `history.back()` fallback** — On trip view and public profile, replace `history.back()` with: `if (history.length > 1) history.back(); else goto('/');`

8. **Remove or update the re-export page** — `/trip/[id]/export/+page.svelte` uses the old single-media format and is missing many features. Either update it to match the edit page's export capability, or remove it and redirect to `/trip/[id]/edit`.

### P2 — Medium Impact

9. **Unify input styling** — Create `TextArea` and `DateInput` variants of the Input component (or extend Input to support these types) and use them consistently.

10. **Add `type="button"` to Button component** — Prevents unintended form submissions.

11. **Add `<title>` to all pages** — Create, Trips, Profile, and Spotlight pages all need proper page titles.

12. **Extract shared animation utilities** — Create a global CSS file or Tailwind plugin for `fade-up`, `delay-*`, and `fill-both` classes.

13. **Improve "re-attach media" UX on edit page** — Add a clear explanation: "Photos and videos are stored on your device and can't be saved online. Please re-add them to re-export." Consider showing the original clip count per location.

14. **Fix delete account UX** — Replace the caret icon with an explicit "Delete Account" text-only button. Don't make it look like a collapsible section.

15. **Add scroll indicators to mobile showcase cards** — Use gradient fade on edges or pagination dots to indicate horizontal scrollability.

16. **Fix TripCard's `/links` route** — Either create the links page or remove the links button from TripCard.

### P3 — Nice to Have

17. **Add `aria-describedby` to form fields with errors** — Connect error messages to their inputs for screen reader users.

18. **Add keyboard alternatives for drag-and-drop** — Move up/down buttons alongside drag handles for both clips and review locations.

19. **Create a shared `GrainOverlay` component** — Eliminate the repeated SVG filter + CSS pattern across 4+ pages.

20. **Add OG image to public profile pages** — Even a dynamically generated fallback image would improve social sharing.

21. **Lazy load the globe/map on dashboard** — Use intersection observer to only initialize the heavy 3D globe when it scrolls into view (or is about to).

22. **Add pagination to trip list** — For users with many trips, virtualize or paginate the list.

---

## 5. Quick Wins (High Impact, Easy to Implement)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1 | Add `type="button"` default to Button component | `Button.svelte` line 33 | 1 min |
| 2 | Add `<svelte:head><title>` to Create, Trips, Profile, Spotlight pages | 4 files, 1 line each | 5 min |
| 3 | Change "100% free" to "Free to start" on sign-in page | `signin/+page.svelte` line 307 | 1 min |
| 4 | Add `!hasValidationErrors` to `canSave` derived | `profile/+page.svelte` line 135 | 1 min |
| 5 | HTML-escape popup content in trip view | `trip/[id]/+page.svelte` line 322-323 | 5 min |
| 6 | Fix `history.back()` to fall back to `/` | `trip/[id]/+page.svelte` line 483, `u/[username]/+page.svelte` line 201 | 2 min |
| 7 | Remove `/trip/${trip.id}/links` navigation (dead route) | `trips/+page.svelte` line 104, `TripCard.svelte` line 8 | 3 min |
| 8 | Add `aria-pressed` to ColorPicker swatch buttons | `ColorPicker.svelte` lines 44-59 | 3 min |
| 9 | Move the auto-export call behind the "Stitch Video" button click | `create/+page.svelte` line 451 | 5 min |
| 10 | Add `beforeNavigate` guard to spotlight creator | `create/spotlight/+page.svelte` | 5 min |

---

## Appendix: File Reference Index

| File | Key Issues |
|------|-----------|
| `/src/routes/+page.svelte` | L1-L6, pricing inconsistency |
| `/src/routes/signin/+page.svelte` | S1-S5 |
| `/src/routes/create/+page.svelte` | C1-C4, export duplication |
| `/src/routes/trips/+page.svelte` | D1-D4 |
| `/src/routes/profile/+page.svelte` | P1-P5 |
| `/src/routes/trip/[id]/+page.svelte` | TV1-TV4, XSS |
| `/src/routes/trip/[id]/edit/+page.svelte` | E1-E3, export duplication |
| `/src/routes/trip/[id]/export/+page.svelte` | RE1-RE3, legacy code |
| `/src/routes/u/[username]/+page.svelte` | UP1-UP3 |
| `/src/routes/create/spotlight/+page.svelte` | SP1-SP4 |
| `/src/lib/components/editor/TitleStep.svelte` | Raw input styling |
| `/src/lib/components/editor/LocationsStep.svelte` | Tiny cancel link, raw inputs |
| `/src/lib/components/editor/ReviewStep.svelte` | Native drag API (no keyboard alt) |
| `/src/lib/components/editor/ExportStep.svelte` | Idle state never shown |
| `/src/lib/components/editor/ExportProgress.svelte` | Clean, no issues |
| `/src/lib/components/editor/ExportResult.svelte` | Good UX |
| `/src/lib/components/layout/AppShell.svelte` | Clean, solid |
| `/src/lib/components/layout/BottomNav.svelte` | Clean, 3 tabs |
| `/src/lib/components/ui/Button.svelte` | Missing type attribute |
| `/src/lib/components/ui/Input.svelte` | Good but needs textarea/date variants |
| `/src/lib/components/ui/Modal.svelte` | Good focus trapping |
| `/src/lib/components/ui/ColorPicker.svelte` | Missing aria-pressed |
| `/src/lib/components/spotlight/SpotlightCreator.svelte` | No nav guard, input inconsistency |
| `/src/lib/components/dashboard/TripCard.svelte` | Dead /links route, delete UX |
| `/src/lib/components/dashboard/EmptyState.svelte` | Clean |
| `/src/lib/state/editor.svelte.ts` | Good factory pattern |
| `/src/lib/state/auth.svelte.ts` | Clean singleton |
