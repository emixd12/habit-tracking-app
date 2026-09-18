# Desktop performance follow-up — September 14, 2026

Source repairs and synthetic verification address unnecessary desktop work.
The supplied preview.24 report does not identify a named JavaScript entry point.
These findings do not establish that every observed WebKit burst has been removed.

## Reproduced causes and changes

- `apps/desktop/src/product.tsx` previously requested synchronization twice when
  the first bundle loaded. A fresh profile object also recreated the callback,
  reattached listeners, and triggered synchronization alongside the bundle effect.
  The callback now depends on account/profile IDs. One effect owns bundle and retry
  requests; event subscription no longer performs a second initial request.
- Concurrent refresh requests previously launched independent full data reads.
  A synthetic slow read plus eight native resume events and one minute poll
  launched ten reads before the first finished. The refresh now retains one
  running read and one latest request. It discards superseded results before
  building analytics and Note shortcuts. Errors, latest timestamps, queued sync,
  retry, notification activation, and local-midnight behavior retain tests.
  Reminder refresh remains independent of screen reads so slow UI loading cannot
  delay cancellation after a save. The existing reminder service coalesces its own work.
- `packages/core/src/resolvers/native-reminder.resolver.ts` parsed both timestamp
  strings inside every sort comparison. It now retains the already-parsed rounded
  instant's numeric timestamp for sorting. Upward rounding, timezone equivalence,
  ID tie ordering, extended years, input validation, and contiguous coverage stay
  unchanged. No persistent cache or new dependency was added.
- The shared completion chime created/resumed a retained Web Audio context on a
  Completed gesture. It never suspended or closed that context, including when
  the save failed or media playback handled the sound. Audio cleanup is tracked
  separately from the JavaScript burst; the report did not show busy audio rendering.
  `lib/ui/completion-feedback.ts` now suspends idle contexts and disconnects finished
  sources. It retains user-gesture preparation and counts pending/active playback
  so cleanup cannot cut off overlapping chimes. `tests/completion-feedback.test.ts`
  covers failed saves, media success, deferred decode/resume, overlap, and start failures.

## Before and after evidence

Run with Node 24 using the existing Vitest dependency:

```sh
npx vitest bench --run tests/desktop-performance.bench.ts
npx vitest run tests/desktop-retry.dom.test.tsx tests/native-reminder.resolver.test.ts tests/desktop-reminder-repair.test.ts --maxWorkers=1
```

The benchmark uses 4,408 synthetic reminders in deterministic mixed order and
64 retained requests. The operation selects reminders and assesses OS-limited
coverage. It makes no native calls and accesses no user data. The fixture count
is a workload choice, not a claim about the owner's pending reminders.

| Measurement | Before | After |
|---|---:|---:|
| Selection and coverage mean | 218.82 ms (8 samples) | 50.74 ms (20 samples) |
| Relative margin of error | ±7.34% | ±1.78% |
| Synchronizations on initial linked load | 2 | 1 |
| Reads launched before the blocked initial read resolves | 10 | 1 |

The measured reminder operation used about 77% less elapsed time (4.3× throughput).
This is a Node microbenchmark, not an installed WKWebView CPU or memory result.
Regression tests failed against the prior lifecycle code and pass after repair.
Benchmark outputs were captured at `/tmp/cadence-desktop-perf-before.json` and
`/tmp/cadence-desktop-perf-after.json`; this table retains their aggregate results.

## Platform impact and boundaries

Desktop uses the repaired lifecycle and native-reminder resolver. Web shares the
completion chime module. Marketing does not use these runtime paths. Future mobile
implementation remains deferred. Existing interaction intents and design-system
surface mappings remain unchanged; no visible layout or control changed.

At the end of iteration one, the minute refresh remained active. Iteration two
below replaces periodic refreshes with the documented lifecycle triggers. The
source repairs preserve schema, stored history, reminder policy, and account-conflict
rules. Installed application acceptance appears at the end of this report.

## Verification and remaining acceptance

Iteration-one verification passed with Node 24:

- `npm run agents:check`, `interactions:check`, `resolvers:check`, and `core:check`.
- `npm run lint`, `typecheck`, and `desktop:typecheck`.
- `npm run test -- --maxWorkers=2`: 1,624 passed, 26 skipped.
- `npm run build` and `npm run desktop:build`.
- `git diff --check` and two fresh read-only reviews: ship, no findings.

The initial test run denied loopback socket creation. The permitted final run
passed the synthetic provider tests. Lint retains seven existing fixture warnings;
desktop bundling retains the existing large-chunk warning. No visual controls or
layout changed; lifecycle, activation, and audio acceptance used automated tests.
At that iteration, the native app package had not been rebuilt or installed.

At the iteration-one checkpoint, installed acceptance remained necessary: install a reviewed build, record workload
and window state, and capture at least two minutes each at idle, after a Completed
save, and after a failed save. Repeat a long-running session with the same data.
Use Safari Web Inspector to identify named burst stacks. Compare process-owned CPU,
post-reclamation memory, and `pmset -g assertions` after chimes finish. Preserve
active playback and native notification delivery during the comparison.

No claim about heat, fan noise, a retained-memory leak, power-assertion release, or
installed WebContent CPU improvement follows from these synthetic checks alone.

## Iteration two: event-driven idle work (complete)

The owner requested an ongoing measure–change–verify loop after iteration one.
The installed preview.24 process group was independently verified through
`launchctl print pid/38790`. Sixty `top` intervals, excluding its first sample,
measured WebContent mean CPU 43.34%, median 35.45%, and maximum 106.0%.
Its first/last sampled footprint was 195/257 MiB (rounded `top` values).
The window received a Hide command, but hidden state was not independently
verified; treat this as an uncontrolled installed baseline. The app had been
running for over four days. A coreaudiod sleep assertion named its GPU process.

The next source changes remove the full minute refresh and Supabase's 30-second
Keychain ticker. Native resume owns foreground synchronization. Local changes
finish occurrence generation before requesting synchronization. Successful sync
refreshes downloaded data directly without starting another sync. Browsing more
days or analytics ranges does not request account synchronization. Auth clients
release their visibility listeners and BroadcastChannel on unmount. Actual account
requests still refresh expired tokens through the installed Supabase SDK.

TimeTracker stops its 1 Hz display interval while hidden. Persisted timestamps
continue measuring elapsed time; returning to the window updates the display
immediately. Six-hour fake-time tests cover idle local/linked sessions, hidden time
tracking, and real SDK on-demand token renewal with an intercepted HTTP transport.
Midnight, native wake/resume, notifications, local mutations, online recovery,
bounded failure retries, and daily update checks remain active.

Native QA uses a separate `app.cadence.desktop.performanceqa` bundle, distinct
SQLite storage, an isolated URL scheme, and disabled hosted auth configuration.
The representative synthetic fixture contains 40 daily Behaviors and 1,280
Occurrences. It derives from one Behavior created through the normal UI. SQLite
integrity and foreign-key checks pass. The fixture and snapshot backups are under
`/tmp`; they contain no owner data. The baseline bundle contains iteration one's
repairs and still has the minute timer. The paired comparison is recorded below.

Repeat the loop:

1. Build and launch an isolated release bundle using the same synthetic database.
2. Open Behaviors, wait for loading to finish, then leave the app untouched.
3. Run the sampler below for both versions in the same state. It verifies the
   app's launchctl ownership, includes its WebKit processes, discards the first
   `top` sample, and rejects process exits or incomplete sample counts.
4. Repeat hidden and after completion audio. Check `pmset -g assertions` for the
   verified GPU PID after playback finishes. Test an active time session across
   hiding and returning. Compare post-reclamation memory over a longer session.
5. Retain only changes that reduce measured work and pass the functional checks.
   Run the repository checks and obtain a fresh read-only review before acceptance.
6. After the obvious work is removed, research remaining measured costs against
   official WebKit, Tauri, and dependency documentation. Do not add a framework or
   background service merely to pursue an unmeasured possibility.

```sh
python3 apps/desktop/scripts/measure-idle.py \
  --pid <verified-app-pid> --app '/path/to/Cadence Performance QA.app' \
  --state 'Behaviors; 40 synthetic Behaviors; visible idle' \
  --seconds 120 --output /tmp/cadence-idle.json
```

The sampler reports observed intervals and elapsed wall time. `top` footprint is
not RSS; neither proves a retained-object leak. CPU percentages use one logical
core as 100%. Zero polling does not mean zero resident memory or zero required
midnight/reminder/synchronization work. Web shares the hidden-clock and audio
repairs; marketing and future mobile do not execute these paths.

### Native comparison and extended check

Each paired run captured 60 intervals over approximately 135 seconds. Both used
Behaviors with the same restored synthetic SQLite snapshot. CUA accessibility
navigation did not explicitly focus either window; these are **unfocused idle**
samples despite the original sampler labels saying visible. They do not establish
frontmost-idle performance. No build or test suite ran during either measurement.

| Process | Baseline mean CPU | Candidate mean CPU | Baseline peak | Candidate peak |
|---|---:|---:|---:|---:|
| WebContent | 1.108% | 0.045% | 29.3% | 2.7% |
| Main app | 0.638% | 0.000% | 18.0% | 0.0% |
| GPU | 0.000% | 0.000% | 0.0% | 0.0% |
| Networking | 0.000% | 0.000% | 0.0% | 0.0% |

WebContent mean CPU fell about 96%. Its baseline footprint was 115M throughout;
the candidate fell from 181M to 126M during the sample. This does **not** demonstrate
a memory reduction. Raw observations are `/tmp/cadence-perf-native-before.json`
and `/tmp/cadence-perf-native-after.json`.

The candidate saved Completed status on one synthetic Occurrence and started a
second Occurrence's time session. Its unfocused timer remained static. A native
title-bar click focused the app: the display immediately caught up to 00:02:01
and subsequently advanced to 00:02:47. The candidate GPU (93493) had no audio sleep
assertion after completion. The original installed GPU (38791) still held one.
Audible chime playback was not independently confirmed by the inspection tools.
The minimized run captured 300 intervals over 674 seconds. WebContent averaged
0.004% CPU (maximum 0.3%); the main app averaged 0.00067%. GPU and Networking
CPU stayed at zero. WebContent footprint changed from 198M to 199M. This short
run does not prove the absence of a long-term leak. Build checks ran concurrently.
The hidden display stayed at 00:03:07. Stopping the session saved 00:16:43,
confirming persisted elapsed time includes the hidden interval. Window restoration
did not establish foreground visibility through CUA; that acceptance remains open.
The candidate GPU still had no audio assertion. Raw data:
`/tmp/cadence-perf-native-hidden.json`.

Final source verification passes all agent, interaction, resolver, core, lint,
web/desktop TypeScript checks, 1,630 tests (26 skipped), and the web build.
The corrected preview.26 native package passes signature, DMG, and updater archive
verification. The review correction uses display-only refresh after reviewed
conflict sync succeeds. A fresh read-only review returned ship with no actionable findings. Installed
preview.24 was still unchanged at the source-review checkpoint. Installed
preview.26 acceptance and durable rollback storage are recorded below.

### Architecture research after the low-hanging work

- [WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)
  recommends eliminating idle timer wakeups and hidden display updates. It also
  identifies JavaScript allocation churn as a source of JIT/GC activity. The new
  lifecycle removes work rather than moving it to another thread.
- [Apple's App Nap guidance](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html)
  recommends proactively reaching idle instead of waiting for operating-system
  throttling. App Nap does not replace explicit timer cleanup.
- [Tauri's process model](https://v2.tauri.app/concept/process-model/)
  uses WKWebView on macOS. A web process and its retained page still consume
  memory when CPU work stops. Replacing the framework or destroying the window
  is not justified by these CPU results and would require preserving drafts,
  navigation, reminder maintenance, and startup responsiveness.
- [WebKit memory debugging](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/)
  provides heap timelines/snapshots for retained-object investigations. If a longer
  fixed-workload run shows continuing growth, inspect retained objects before
  introducing caches, forced reloads, or manual garbage-collection workarounds.
- [Supabase getSession](https://supabase.com/docs/reference/javascript/auth-getsession)
  refreshes a session when needed. Its [auto-refresh documentation](https://supabase.com/docs/reference/javascript/auth-startautorefresh)
  describes the recurring background check. The installed SDK regression test
  proves the next real RPC receives the renewed token after six idle hours.
  The current changelog contains no relevant getSession contract change.

No framework, dependency, background helper, polling replacement, or hosted change
journal was added. Required daily maintenance and user-triggered work remain.


### Installed preview.26 acceptance

The locally verified preview.26 replaced `/Applications/Cadence.app`. No GitHub
release or update feed was published. The previous bundle and consistent SQLite
backup are in the owner-only directory
`~/Library/Application Support/Cadence Release/performance-2026-09-14`.
The replacement retained the final identifier, public auth configuration,
existing preview Keychain path, and updater verification key.

The launched app reports preview.26, signed-in account state, and current account
data after synchronization. SQLite integrity and foreign-key checks pass.
Fifteen principal data/schema tables match their prelaunch hashes exactly.
The sixteenth table, account-link metadata, differs only in `authenticated_at`.
Native reminder permission remains Allowed; OS readback reports limited coverage
rather than claiming the full 30-day target. The original GPU audio sleep
assertion disappeared. No owner behavior, occurrence status, or note was edited
for this installed test.

The immediate preview.24 baseline used 60 intervals over 135.64 seconds after a
Timeline minimize command. WebContent averaged 34.68% CPU, peaked at 103.3%, and
its footprint changed from 197M to 196M. Main app CPU averaged 1.84%.
The updated run captured 60 intervals over 137.62 seconds after account sync
settled. Both runs use the same command sequence; CUA did not independently
establish the native minimized flag. No build or test suite ran during either
installed measurement.

| Process | Preview.24 mean CPU | Preview.26 mean CPU | Preview.26 median CPU |
|---|---:|---:|---:|
| WebContent | 34.683% | 0.128% | 0.0% |
| Main app | 1.843% | 0.107% | 0.0% |
| GPU | 0.235% | 0.057% | 0.0% |
| Networking | 0.138% | 0.000% | 0.0% |

WebContent mean CPU decreased about 99.6% in this comparison. Its updated peak
was 4.0%; footprint changed from 128M to 126M. The old instance had run for four
days and the new instance was fresh, so this comparison cannot isolate application
age or prove a memory-leak repair. The controlled fresh synthetic comparison
above independently supports the removed idle-work effect.
Raw installed observations: `/tmp/cadence-owner-before26.json` and
`/tmp/cadence-owner-after26.json`. Final readback again finds no Cadence audio
sleep assertion and no changed user history. Authentication bookkeeping is the
only changed column among the compared tables. The isolated QA app and samplers
are stopped; only the updated owner app remains running.

The loop ends after two measured improvement iterations and architecture research.
The remaining idle work is required lifecycle maintenance and user-triggered
operations. No additional speculative performance machinery was added. Re-run
the same sampler if sustained idle CPU returns. Long-term memory aging,
foreground restoration after minimizing, audible chimes, and actual timed
notification delivery were not established by this acceptance run. Existing
automated tests and the synthetic saved-duration check cover those code paths
where stated above; they do not substitute for those unobserved native outcomes.
