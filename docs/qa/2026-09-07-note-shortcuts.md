# Tickets 126–128: Note shortcut acceptance

Date: 2026-09-07. Local working-copy verification only.

Ticket 126's contract and deterministic evaluation passed final acceptance review.
Ticket 127's implementation passes automated checks. Native UI acceptance remains
complete after isolated native QA on 2026-09-08. Ticket 128 failed its measured provider gate.
No hosted migration, release, personal-Note upload, or model request occurred.

## Implemented scope

- Shared resolver: eligibility, exact repeated text, source hashes, review,
  expiry, suppression, bounds, and semantic revision tokens.
- Shared Note form: accepted-only fill/append, manual Save note, pending-draft
  preservation, and shortcut provenance through web and desktop form actions.
- Behavior and Settings controls: explicit matching, accept/edit/dismiss/remove,
  persisted global/Behavior opt-in, off controls, and insufficient-evidence feedback.
- Postgres migration `20260908003245_add_note_shortcut_states.sql`: owner RLS,
  constrained state, guarded context CAS, atomic Note/exclusion writes, and sync.
- SQLite schema 13: atomic state/outbox writes, guarded Note exclusions, account
  synchronization, restart persistence, and protected-backup upgrade support.
- Product/data/privacy contracts, design-system bench/catalog, interaction registry,
  load map, user guides, and desktop parity evidence.

Earlier uncommitted export, reminder, and timezone work remains intact. The local
SQL contract helpers use the existing full export-bundle reader after that work's
export-page API split. No provider implementation was scaffolded for Ticket 128.

## Automated verification

The parent reran checks using Node 24.19.0 after integrating the agent changes.

| Check | Result |
|---|---|
| `agents:check`, `interactions:check`, `resolvers:check` | Passed |
| `core:check`, `design-system:check` | Passed |
| `lint` | Passed; seven existing fixture warnings |
| `typecheck`, `build` | Passed |
| `test` | 1,573 passed; 26 explicitly skipped |
| `desktop:typecheck`, `desktop:build` | Passed |
| `desktop:native:test` | 76 passed |
| `desktop:contract:test` | 18 passed, including the actual desktop Note form action |
| `desktop:parity:check` | Passed |
| `marketing:check`, `marketing:build` | Passed |
| `git diff --check` | Passed |
| Synthetic repeated-text evaluation | Eight cases passed; zero unsupported suggestions; one deliberate paraphrase miss |

The full test suite needs loopback socket access for its fake email server.
Its approved rerun passed. Skipped native/Postgres suites were supplemented by
the explicit SQLite contract and real Postgres smoke below.

The provider/storage agent regenerated database types. The parent replayed all
final migrations from a clean local database, then ran:

```sh
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  -v ON_ERROR_STOP=1 -f tests/sql/ticket-127-note-shortcuts-smoke.sql
```

The transaction passed and rolled back its synthetic fixtures. It verifies owner
isolation, direct-write denial, foreign Behavior rejection, stale Note/global-off
contexts, atomic rollback, saved exclusions while disabled, account-sync apply,
and reserved removal capacity at the 128-slot limit.

The first final reset omitted the existing custom Docker network/proxy. Migration
replay succeeded, but dependent service health checks failed and the recreated
Postgres port bound all interfaces. The parent stopped that container, preserved
its named volume, and recovered the reviewed initialization proxy from
`/private/tmp/cadence-category-reset.sh`. The corrected create binds Postgres to
`127.0.0.1:55322`. A complete local stack restart and final reset through that
proxy passed. The final SQL contract passed and rolled back its fixtures. All
published Cadence ports remained on loopback; services with health checks reported healthy.
No hosted service changed.

The final successful reset command was:

```sh
SUPABASE_TELEMETRY_DISABLED=1 \
DOCKER_HOST=unix:///private/tmp/cadence-docker-init-6638.sock \
npm run supabase -- db reset --local --network-id cadence-local
```

Evidence: `/tmp/cadence-127-accepted-postgres-loopback.log`.

The SQLite checks exercise resolver/service/native boundaries, saved shortcuts
through restart, outbox failure rollback, stale context, foreign profile rejection,
sync conflicts/deletion, and schema-12 protected backup restoration into schema 13.
Portable exports omit private shortcut state while retaining explicitly saved Notes.
Shortcut-management journal rows store only the request SHA-256 and a null result.
Exact retries remain idempotent without retaining source Notes or shortcut text.

## Browser and native acceptance

Authenticated browser QA passed at `http://localhost:4326`, using synthetic local
Supabase data. Nine source Notes covered three repeated patterns. The agent verified:

- Global and Behavior enable; analyze; accept, edit, dismiss, and remove.
- Accepted-only shortcuts in Timeline, Needs decision, and selected-day Review.
- Empty-draft fill, newline append, explicit save, and immediate consecutive manual save.
- Disable hides shortcuts; keyboard Space toggles Behavior enable.
- A 360px viewport has no horizontal overflow.

The browser pass preceded the final resolver, sync-validation, and first-link fixes.
Resolver tests, full tests, and both product builds reran after those fixes. The consecutive-save bug
reproduced before its fix and passed afterward without reload. The second manual Note remained saved. Browser page errors were empty.
Popmelt emitted `useInsertionEffect must not schedule updates` in development;
production behavior for that existing instrumentation is not verified here.

The parent inspected annotated screenshots under
`/private/tmp/cadence-ticket127-qa/`: `proposals-desktop.png`,
`accepted-desktop.png`, `timeline-shortcut-desktop.png`, and
`timeline-shortcut-mobile-360.png`. They contain inspection overlays. Clean
screenshot commands created no files, so clean visual captures remain unavailable.
The agent closed its browser session and stopped its local server before database
replay. No hosted account or personal Notes were used.

The final corrected code built as an isolated ad-hoc desktop bundle, **Cadence Note QA**, with
identifier `app.cadence.noteshortcutqa` and empty hosted-account configuration.
The bundle is at `apps/desktop/src-tauri/target/debug/bundle/macos/Cadence Note QA.app`.
This separates QA data from installed Cadence data. The initial locked-Mac blocker
was resolved on 2026-09-08. Apple-trusted distribution remains Ticket 115.
The parent rebuilt the isolated bundle after the final corrections. Bundle identity
readback matched `app.cadence.noteshortcutqa`; strict deep signature verification passed.
Evidence: `/tmp/cadence-127-sync-validation-final-qa-bundle.log`.

Native WKWebView acceptance passed through CUA on 2026-09-08:

- Created fictional `Synthetic Note QA`, with three times today and native reminders off.
- Saved `Did not stretch` on all three Occurrences. Both shortcut settings initially showed off.
- Enabled global and Behavior controls. Find repeated Notes produced one supported proposal.
- Edited to `Did not stretch tonight`; Tab focused Accept and Return accepted it.
- Timeline insertion appended a newline to a nonempty draft. Two consecutive explicit saves succeeded.
- Clearing the draft and inserting filled it. Quitting without Save and restarting restored `Second explicit save`.
  This verified insertion did not automatically persist. The accepted shortcut survived restart.
- Global off hid shortcut buttons while retaining the saved Note. Management retained the accepted shortcut.
- Disabled the Behavior and removed the shortcut. After a second quit/relaunch, both settings remained off and no accepted shortcut remained.
- Behavior calendar still showed three Unresolved, zero Completed, and zero Not Completed after both restarts.
- Settings showed the isolated database at `~/Library/Application Support/app.cadence.noteshortcutqa/cadence.sqlite3`.
  Account sign-in was unavailable in this isolated build. No real Cadence data was accessed.

The final evaluation slice also passed agents, interactions, resolvers, lint, typecheck,
1,575 tests (26 skipped), and the web production build. The first test run hit sandbox
`listen EPERM` for the existing fake-provider loopback server; the authorized rerun passed.
Logs: `/tmp/cadence-note-model-final-checks.log` and `/tmp/cadence-note-model-final-tests-build.log`.

## Provider gate

[The provider evaluation](2026-09-07-note-suggestion-provider-evaluation.md)
records a measured no-go. The owner funded the matching Cadence project and accepted
standard retention for synthetic evaluation. Sharing remained disabled; ZDR remains unverified.
The 80-request run passed every schema and evidence check, but only 79 quality checks.
Negation case repetition 8 returned no suggestion. No unsupported suggestion or negation merge occurred.
The paraphrase case passed all ten repetitions. p95 latency was 2,072 ms.
Estimated API cost from reported tokens was $0.0088825, below the $0.84 approved ceiling.
Only synthetic data was sent with `store:false`, no tools, and no background processing.
Production processing of personal Notes remains unapproved and unimplemented.

## Review and cost evidence

The first fresh review returned `fix-first`. Its three findings were lost reuse
exclusions during reviewed sync, optional read failures blocking tracking, and
edited-shortcut removal exceeding the state limit. The implementation now unions
exclusions, isolates optional read failures, and reserves removal capacity in all
three validators. Browser QA also found a stale Note baseline after a successful
save. The shared form now advances its baseline, preserves pending drafts and
provenance, and retains conflict protection for external edits. Mounted regressions
cover consecutive submissions and external conflicts.

The next review confirmed a matching-text collision. Accepting or editing one
shortcut to another proposal's text left duplicate proposal text visible. Removing
the edited shortcut could also retain that proposal or an older dismissal expiry.
The resolver now removes duplicate proposals immediately and reconciles removal
suppression for existing proposed/dismissed entries. It preserves separate accepted
edits and never shortens an existing later suppression expiry. Regression tests
cover both management actions and all three existing-entry states.

A further review found that native/core revisions could exceed PostgreSQL's integer
ceiling. Shared commands, snapshot validation, and native storage now enforce
2,147,483,647. Boundary tests verify the last valid increment and reject overflow
before state or journal writes. Automated verification passed. The full native formatting check still reports existing formatting
drift; this task preserves unrelated native formatting.

The fourth fresh review found two remaining gaps. First-link detection ignored a
saved global shortcut preference on an otherwise untouched installation. The
shared detector now recognizes shortcut state and offers the existing import,
ignore, or cancel choice. Its focused regression passed. Sync validation also
checked only part of shortcut state before fingerprinting and planning. Sync now
reuses the complete shared validator before and after ownership-neutral
normalization. Regressions reject malformed state, entries, timestamps, and hidden
extra fields during fingerprinting and unchanged-snapshot planning. The provider evaluation
now describes the calculated $0.42/$0.84 ceilings as “at most,” rather than “below.”

Final parent verification logs use `/tmp/cadence-127-sync-validation-final-` with
`tests.log`, `checks.log`, `web.log`, and `desktop.log` suffixes.

The fifth fresh read-only review, `/root/gated_acceptance`, returned **ship** with
no findings. Its focused review suite passed 99 tests across six files. The review
accepted Ticket 126's deterministic slice with the recorded provider no-go. It
confirmed that Tickets 127 and 128 must retain their native UI and provider gates.
No production deployment or live provider acceptance is implied.

**API-EQUIVALENT COST RECEIPT — unavailable.** Runtime model/effort metadata and
token usage are not exposed for the parent, implementation agents, or reviewers.
No whole-task or delegated-only price comparison can be calculated;
unknown usage is not zero. The synthetic deterministic evaluation incurs no provider cost.
