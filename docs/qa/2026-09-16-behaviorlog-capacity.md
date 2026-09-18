# Full-history BehaviorLog capacity verification

## Result

Web and desktop successfully import, restore, and re-export five years of
synthetic history. A private copy of the owner's all-time desktop export passes
both platforms' import and restore previews. Web uses the explicit native-to-browser
reminder conversion choice. No import or restore writes targeted the owner's database.

The fixture covers 2021-01-01 through 2025-12-31 in America/New_York:

- Four daily Behaviors and 7,304 Occurrences, including unresolved decisions.
- 6,972 status events, including correction/revision relationships.
- 1,044 Unicode Notes and 1,464 timing sessions.
- Twenty configuration events and twenty definition events.
- DST transitions and fractional timestamps at PostgreSQL's microsecond precision.

Tests compare historical values, timestamps, status revisions, Note contents,
and parent relationships after both write cycles. Generated local IDs may change.
Web export normally materializes the current day. Its four additional current-day
Occurrences are outside the fixture's historical interval; historical rows must
still match exactly. Preserved native configuration history also survives web
conversion. Conversion affects current reminder intent only.

## Measured sizes

Exact ZIP sizes vary slightly with generated UUIDs.

| Measurement | Desktop | Web, importing native reminders |
| --- | ---: | ---: |
| Initial ZIP bytes | 721,412 | 653,740 |
| Re-export ZIP bytes | 2,670,131 | 2,385,439 |
| Post-restore synchronization entity bytes | 45,890,401 | 58,782,300 |
| Post-restore synchronization entities | 50,457 | 50,465 |

Desktop's full import preview is 19,489,710 bytes. Its largest preparation
request is 34,860,956 bytes. Its re-export expands to 40,002,046 bytes.
Initial preserved metadata is 2,026,540 bytes. Compact desktop ledger rows are
478,097; 2,743,317; 10,089,060; and 8,003,764 bytes.

The private all-time export measured 682,976 ZIP bytes and 402,282 metadata
bytes during diagnosis. The old 256 KiB metadata ceiling rejected that history.
Private contents and database copies are excluded from repository artifacts.
The private test copy was removed; no temporary Supabase accounts remain.

## Limits and fixes

| Boundary | Final limit / behavior | Evidence |
| --- | --- | --- |
| Preserved metadata | 8 MiB, counted as UTF-8 | Old 256 KiB limit rejects the owner's export and fixture; Unicode over-limit regression rejects without truncation. |
| Uploaded ZIP | 3 MiB | The desktop re-export exceeds 2 MiB. No evidence requires a larger upload allowance. |
| Expanded ZIP | 32 MiB per entry; 64 MiB total; 128 entries; 100:1 ratio | Fixture fits. Existing archive validation stays intact. |
| Web Server Action request | 4.25 MiB | A maximum 3 MiB ZIP encodes to 4 MiB base64. A serialized multipart regression checks the remaining headroom. |
| Desktop import preparation | 64 MiB | Restore carries expected and next records; measured request exceeds 32 MiB. |
| Desktop import-run row | 32 MiB | Compact ledgers fit; ordinary rows remain 1 MiB and Note shortcut states remain 8 MiB. |
| Other desktop mutations | 32 MiB | Existing 64 MiB Note shortcut commit exception remains. |
| Synchronization snapshot | 64 MiB; existing 100,000-row collection limits | Desktop fingerprint and authenticated web snapshot/fingerprint checks pass at the sizes above. |
| Web import RPC timeout | 60 seconds | Several-year atomic imports exceed the normal eight-second deadline. |
| Web snapshot read timeout | 25 seconds | Full-history fingerprinting exceeds eight seconds; desktop's 30-second synchronization deadline stays unchanged. |

The SQL migration replaces repeated whole-preview action lookups with a lookup
built once per phase. Counter updates no longer copy the full import-run ledger
for every timing session. These were measured memory and time failures, not
speculative optimizations. The migration keeps first-match action semantics,
authentication, RLS, ownership, accepted-preview binding, and atomic writes.

Restore preview ledgers on both platforms retain the action and IDs required by
native/SQL authorization. Full product records are recomputed and fingerprint-checked
before apply. Import and restore confirmations, Note-sensitivity acknowledgements,
stale-preview checks, and archive fingerprints remain required. Repeated apply
returns the stored receipt without presenting a compact ledger as a full preview.

Web conversion is unchecked by default. It only maps `other` reminder rules
explicitly marked `app.cadence.native_notification: true`. Generic `other` rules
remain unsupported. Changing conversion invalidates the preview; apply cannot
change the accepted choice. Historical configurations and passive observations
remain portable. Browser notification permission remains separate.

## Remaining boundaries

Eight MiB of metadata is not a promise of unlimited history. Note length,
configuration churn, timing sessions, and repeated import ledgers affect capacity.
An exploratory eight-Behavior/five-year fixture re-exported above 3 MiB and
expanded above 64 MiB. That larger fixture remains outside the supported bounds.
Cadence rejects it rather than truncating history or relaxing archive safeguards.

Repeated large imports/restores can eventually exceed synchronization's 64 MiB
snapshot limit. That rejection remains explicit. This task verifies large-snapshot
read/fingerprint compatibility, not a full remote upload/download synchronization
cycle at maximum capacity. Existing synchronization contracts remain required.

Web Server Actions use Next's streamed Flight response. Streaming responses avoid
Vercel's buffered-response ceiling; requests still have the 4.5 MB provider ceiling.
See [Vercel's payload guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
Hosted execution is not verified: this task does not deploy the web app or apply
hosted migrations. Web capacity requires deploying the code and migration together
in a separately authorized task.

## Verification

- All seven required commands pass: agents, interactions, resolvers, lint,
  typecheck, test, and web production build.
- Default suite: 1,678 passed; 29 optional tests skipped.
- Real SQLite adapter/portability suite: 21 passed, including private-copy previews.
- Native Rust suite: 95 passed.
- Real authenticated local Supabase capacity roundtrip and snapshot fingerprint pass.
- Separate real Supabase ownership, atomic rollback, restore, and lineage contracts pass.
- Clean local migration reset passes. Regenerated database types match except a trailing blank line.
- Core portability, desktop TypeScript, desktop parity, and design-system checks pass.
- Browser QA at desktop and 390px widths confirms conversion labels, default-off
  controls, and preview invalidation. The fixture bench performs no product writes.
- Existing lint and desktop bundle-size warnings remain.

## Local installation

Preview `0.1.1-preview.32` is installed at `/Applications/Cadence.app`.
Its binary, ad hoc signature, DMG contents, and signed updater archive passed the
local release verifier. No release was published.

The protected rollback directory is
`~/Library/Application Support/Cadence Release/full-history-2026-09-16`.
It contains `Cadence preview.30.app`, a consistent pre-update SQLite backup,
and table hashes. Integrity and foreign-key checks pass. Every live database
table matched the backup after installation and initial launch.

Final interactive startup verification passed after the owner completed the macOS
Keychain prompt. The installed preview.32 displays Timeline and opens Export & Import
without the original native configuration error. Import and Restore both display
their preview controls and the 3 MiB file limit. This final check used read-only
navigation; no import or restore writes targeted the owner's database.
