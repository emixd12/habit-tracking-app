# Calendar inspection and Timeline reload, Ticket 149

September 18, 2026. Local implementation acceptance; no installed release or
live provider acceptance is implied.

## Requested behavior

- Owner-selected Poline facet `#DA3278`, 1px overlap border without a glow.
- Bottom preview with close icon aligned to the title and its 44px target intact.
- Centered native details modal with viewport bounds and internal scrolling.
- Bundled official Google Calendar provider icon.
- No permanent healthy Calendar current label.
- Mobile pull and desktop upward overscroll reload Cadence and connectors.
- Temporary completion feedback only after successful refresh.

## Browser evidence

Codex browser session at `http://127.0.0.1:4322`. Synthetic design-system fixtures
perform no account or provider reads.

Centered dialog measured 640px wide at a 1488px viewport, with equal left/right
and top/bottom clearance. At the requested 390px viewport (354 CSS pixels under
the browser's existing zoom), the dialog retained 16px clearance and no horizontal
overflow. Escape closed the dialog and restored its launcher.

Baseline Timeline bench exposed a measured-day geometry crash before visual edits.
The fix reads all visible days together and uses one shared boundary between
adjacent sections. The regression simulates a height change plus fractional
DOMRect error. The resolver keeps its strict geometry validation.

Browser checks passed for the thin pink border, bundled icon, title-aligned
preview close icon (zero center offset, 44px target), centered modal, and Escape focus return without reopening
the preview. Both desktop and narrow responsive layouts were inspected.

## Automated verification

Node 24 checks passed: `agents:check`, `interactions:check`, `resolvers:check`,
`design-system:check`, `lint`, `typecheck`, `desktop:typecheck`, `build`,
`desktop:build`, and `git diff --check`. Lint retains 10 pre-existing warnings;
builds retain existing bundler directive/chunk warnings.

`npm test -- --maxWorkers=4`: 222 files passed, 5 skipped; 1,811 tests passed,
29 skipped. The default parallel run timed out five unrelated tests while builds
ran; the complete four-worker rerun passed without increasing test timeouts.
The first sandbox run could not bind the fake provider's local socket. The final
suite ran with approved loopback access.

DOM and connector tests cover desktop wheel and mobile gesture thresholds,
control/modal/nested-scroll exclusion, coalescing, in-flight completion, forced
Calendar reads, stale/offline failure, linked-account synchronization ordering,
and revoked account failure. Geometry regression covers moved day sections and
fractional adjacent bounds. The design-system catalog retains manual mappings
and reconciles 154 usage locations.

## Changed implementation

- Shared Timeline presentation: `components/timeline/DayProgressTimeline.tsx`,
  `ExternalEventDetails.tsx`, `day-progress-timeline.module.css`, and
  `packages/ui/tokens.css`.
- Refresh: `components/timeline/MobileTimelinePullToRefresh.tsx`,
  `lib/ui/timeline-wheel-reload.ts`, `lib/ui/google-calendar.ts`, and desktop
  `src/product.tsx`, `src/timeline-screen.tsx`, `src/calendar/use-google-calendar.ts`.
- Provider asset: `public/brand/google-calendar.svg`, attribution beside it,
  and desktop `vite.config.ts` asset packaging.
- Bench, interaction/design catalogs, product docs, user guide, ticket/status
  records, and matching regression tests.

Fresh independent read-only review returned `ship` with no findings.
Native installed trackpad behavior
and real connector refresh remain unverified by this local fixture session.
This task does not deploy or change provider permissions.


## Duration-line follow-up

The owner extended the thin highlight treatment to event duration on the axis.
`DayProgressTimeline.tsx` now uses a solid 1px `#DA3278` stroke instead of the
6px translucent stroke. Its center aligns with the center of the 1px CSS axis.
The duration mapping and hover/focus behavior remain unchanged. Web and desktop
share this component; marketing has no live duration highlight, and future native
mobile remains deferred.

Browser readback at 1488px confirms stroke width 1px, opacity 1, RGB 218/50/120,
and equal stroke/axis centers at 270.5px. The existing preview shows the thin
segment without a glow. Follow-up checks passed: agents, interactions, resolvers,
design-system, lint, web/desktop type checks and builds, and the full four-worker
test suite (1,811 passed, 29 skipped). Existing lint/bundler warnings remain.
This visual-only follow-up changes no interaction or usage location.

## Release review correction

PR review found that an unconditional browser connectivity check incorrectly
reported failure after a successful offline local-mode reload. Completion now
uses the actual account, local-data, and Calendar read results. The regression
failed before the fix and passes afterward. All 24 desktop retry tests pass,
including linked-account offline failure; resolver checks, desktop type checking,
and the desktop build also pass.
