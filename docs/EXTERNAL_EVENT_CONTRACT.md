# External event interface contract

Status: Ticket 134 local implementation verified 2026-09-16: versioned contract,
provider adapter, OAuth broker, credential persistence, desktop cache, and Settings.
The connector remains disabled until provider configuration and live acceptance.
Ticket 132's UI baseline is owner-accepted. Minor visual polish is deferred.

## Purpose and boundary

Cadence consumers must understand external events without parsing provider payloads,
display labels, or screen geometry. Preserve enough scheduling facts for future
day-rearrangement work, but do not implement a planner, model call, schedule write,
MCP server, or additional connector in Tickets 133–137.

Use the existing `NormalizedExternalEvent` family in
`packages/core/src/types/day-progress.ts`. Extend it in Ticket 134 rather than
creating another event model for desktop, UI, or a future model consumer.
The shared event family now distinguishes timed/all-day events, recurrence identity,
missing details, revision, source timezone, event state, busy/free facts, user response,
derived duration, and freshness. The implemented snapshot adds versioned wire
validation, coverage, capabilities, failures, and cancellation tombstones.

The inspiration is MCP's named operations, input/output schemas, structured results,
and capability declarations. This is an internal interface, not MCP compatibility.
See the pinned [MCP tools reference](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
Cadence keeps normal authenticated services and repositories; no generic plugin
framework or protocol transport is required.

## Owners and data flow

Google response → validated Google adapter → normalized event snapshot → shared
resolvers and web/desktop views. Desktop persists the same validated snapshot in
its separate account-scoped cache. Neither core nor UI consumes raw Google JSON.

| Boundary | Owner and requirement |
|---|---|
| Provider I/O and credentials | Ticket 134 server connector; same Google subject as the authenticated Cadence account; reviewed OAuth custody and revocation |
| Provider mapping | Google adapter validates payloads, maps fields, and reports missing or invalid data |
| Shared semantics | Core types and pure functions validate normalized time/identity semantics and derive duration with Temporal |
| Persistence | Web repositories and desktop cache adapter enforce ownership, atomic replacement, expiry, and cleanup |
| Presentation | Tickets 133/135 consume normalized values; clipping, marker displacement, dismissal, and labels never change event facts |
| Estimates and overlap | Ticket 136 combines normalized intervals with Behavior estimates; no writes or automatic rearrangement |
| Release evidence | Ticket 137 proves contract parity, exclusions, lifecycle, and documentation |

## Contract artifacts required by Ticket 134

Ship a versioned JSON Schema for the event snapshot and operation inputs/results,
paired TypeScript types, runtime boundary validation, a field dictionary with
units/null semantics, provider mapping, and synthetic valid/invalid examples.
Use one schema/type source where practical; otherwise enforce parity in tests.
Do not hand-maintain independent schemas for each platform.
The bounded implementation slice owns these artifacts:

| Artifact | Path and role |
|---|---|
| Shared event types | `packages/core/src/types/day-progress.ts`; normalized event facts consumed by Timeline and future clients |
| Snapshot/types | `packages/core/src/types/external-event.ts`; `ExternalEventSnapshotV1`, coverage, failures, capabilities, tombstones, and scheduling projection |
| JSON Schema | `packages/core/src/external-event.schema.json`; structural wire contract for schema `1.0.0` |
| Runtime validation | `packages/core/src/services/external-event-validation.ts`; semantic checks omitted from JSON Schema, including interval order, exact derived duration, date counts, timezone validity, complete coverage, and revision consistency |
| Scheduling projection | `packages/core/src/services/external-event-projection.ts`; removes rich text and participant details |
| Google adapter/read helper | `lib/services/google-calendar-provider.ts`; safe field adaptation and bounded selected-calendar pagination |
| Contract fixtures | `tests/fixtures/external-event-snapshot.valid.json` and `tests/fixtures/google-calendar/*.json` |
| Contract tests | `tests/external-event-contract.test.ts` and `tests/google-calendar-provider.test.ts` |

`ExternalEventFieldAvailability` describes why a field has no usable value:
`not_provided`, `restricted`, `provider_omitted`, `unsupported`, or `unknown`.
An omitted map entry means the normalized value is available. Collection detail
uses `complete`, `provider_omitted`, `client_truncated`, `restricted`,
`unsupported`, or `unknown`. Null never means that the provider supplied an
empty value. It means no usable value crossed the adapter boundary.

The current provider helper exposes two bounded operations:

```ts
readGoogleCalendarCalendars(input: GoogleCalendarListInput):
  Promise<CalendarListEntry[]>

readGoogleCalendarEvents(input: GoogleCalendarReadInput):
  Promise<GoogleCalendarReadResult>
```

Both inputs carry a request-local access token. Calendar listing returns only
reader/writer/owner calendars with validated identifiers, labels, timezones,
selection, primary, and access-role facts. Typed failures use
`GoogleCalendarProviderError.failure`.

The event input also carries the authenticated account ID, connection generation,
selected readable calendars, an inclusive displayed local-date range, fetch time,
and injectable fetch/retry controls. Provider `timeMax` uses the next local
midnight after the inclusive end date. The helper accepts at
most 32 selected calendars, 31 calendar days, 20 pages per calendar, and two
retries per page by default. It requests at most 2,500 events and 100 attendees
per provider page. It never returns or stores the token.

Success returns `{ ok: true, snapshot }` only after every selected calendar
finishes pagination. Failure returns `{ ok: false, error, partialSnapshot }`.
The partial snapshot has `completeness: "incomplete"`, null
`freshness.refreshedAt`, false completeness claims, per-calendar coverage, and a
stable failure. It is diagnostic input and
must not replace the last complete cache.

The connector exposes bounded calendar-list, range-read, and connection reads
through the existing service/API structure. Per-event details use the validated
range snapshot; they do not make a separate provider call. Refresh and
connect/disconnect perform the documented network or credential/cache side
effects. No event-create/update/delete operation is exposed.

Every operation states its input bounds, authentication, ownership, outputs,
side effects, stable error codes, retry semantics, and capability requirements.
The implemented service, repositories, OAuth routes, and desktop cache adapter
use this contract. Their paths and lifecycle are recorded below.

## Scheduling facts

| Fact | Required meaning |
|---|---|
| Identity | Source, calendar ID, provider event ID, normalized ID, and logical instance ID; account-scoped storage/cache identity |
| Timed start/end | Original scheduled instants with offsets normalized to UTC; half-open interval `[startAt, endAt)`; preserve source IANA timezone when supplied and record any fallback |
| Timed duration | Explicit known/unknown result; known seconds are derived from end minus start, not a duplicate editable value; never from row height or a formatted label |
| Unspecified end | Preserve provider `endTimeUnspecified`; any compatibility end value is not an asserted duration; expose unknown duration and do not assert a free interval from it |
| All-day span | Date-only start and exclusive end; expose calendar-day count separately from timed seconds; never assume each local day is 24 hours |
| Recurrence | Series ID and original instance start identify an occurrence even when its current scheduled start moves; display/overlap uses the current scheduled interval |
| Revision/provenance | Provider update timestamp/ETag when available, fetch time, source URL, adapter/schema version; distinguish unavailable revision metadata |
| Event state | Confirmed, tentative, cancelled, or unknown; cancellations may contain only identity, so model deletion records separately from complete events |
| Availability | Preserve busy/free/unknown and the current user's response when supplied; these are source facts, not permission to move an event |
| Missing fields | Preserve absent, restricted, omitted, truncated, unsupported, and unknown distinctions where relevant; never replace missing time/duration with zero |

### Wire field dictionary

| Field | Unit/null rule |
|---|---|
| `schemaVersion` | Exact semantic wire version. Current value is `1.0.0`. |
| `adapterVersion` | Exact provider mapping version. Current value is `google-calendar-v1`. |
| `accountId` | Authenticated Cadence account scope. Never inferred from provider content. |
| `connectionGeneration` | Positive integer. Older responses cannot repopulate a cleared cache. |
| Requested `startLocalDate` / `endLocalDate` | First and last displayed `YYYY-MM-DD` dates, both inclusive. Maximum span is 31 calendar days. |
| `requestedRange.timezone` | IANA timezone used to derive provider `timeMin` and the next local midnight after the inclusive end date for `timeMax`. |
| `fetchedAt` / `revision.providerUpdatedAt` | UTC-normalized instants. Provider update is null only when unavailable. |
| `revision.providerEtag` | Opaque provider revision or null. `revision.availability` agrees with timestamp/ETag presence. |
| Timed `startAt` / `endAt` | UTC-normalized instants. End is exclusive. |
| Timed `duration.seconds` | Positive elapsed seconds derived by instant arithmetic. It is never independently edited. |
| Unknown timed duration | `{ kind: "unknown", reason: "end_unspecified" }`; compatibility `endAt` does not assert duration or a free interval. |
| All-day `startLocalDate` / `endLocalDate` | Date span with exclusive end. |
| All-day `duration.days` | Count of calendar dates. It is never converted to 24-hour seconds. |
| `sourceTimezone` | Provider event timezone, calendar fallback, or request fallback. `sourceTimezoneFallback` records which. |
| `state` | `confirmed`, `tentative`, or `unknown` on live events. Cancelled resources become tombstones. |
| `availability` | `busy`, `free`, or `unknown`. This fact does not authorize moving an event. |
| `currentUserResponse` | Normalized self-attendee response or null when not supplied. |
| `coverage[].itemCount` | Provider items consumed, including cancellation resources. It is not the rendered event count. |
| `paginationComplete` | True only after the provider omits `nextPageToken`. |
| External URLs | Source and attachment links require HTTPS. Conference entries allow HTTPS, `tel:`, or `sip:` by entry type. |
| External text | Bounded plaintext. The adapter converts description and conference HTML to plaintext before normalization. |

Google's [event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events)
documents timed versus date-only bounds, unspecified ends, recurrence instance
identity, cancellation, and transparency. Ticket 134 records exact mappings and
defaults in its field matrix. Do not infer recurrence from titles or deduplicate
distinct recurring instances by `iCalUID` alone. Events copied across calendars
remain distinct unless a documented identity rule proves otherwise.

Validation rejects invalid dates/instants, reversed intervals, incompatible
timed/all-day fields, mismatched duration projections, and cross-account identifiers.
Quarantine malformed provider items and mark affected coverage incomplete; do not
silently discard an item and claim a complete empty calendar. Unknown schema major
versions fail explicitly. Document compatible optional-field additions and cache
upgrade/invalidation rules so older desktop clients cannot misread new semantics.

## Snapshot, coverage, and capabilities

An event list is not sufficient. Its envelope includes schema version, selected
calendar IDs, requested range and timezone, fetched time, per-calendar covered
range, pagination completion, freshness, and typed failures. Distinguish complete
empty results from disconnected, denied, stale, incomplete, or unavailable results.
Record bounded/truncated detail collections independently from time-range coverage.

Retain the last complete cache during interrupted refresh. Do not delete cached
events from partial pages. Apply cancellation records and complete replacements
atomically. Range and selection changes cannot reuse an unrelated completeness
claim. A late response from a previous account or connection generation cannot
repopulate a cleared cache. No UI dismissal modifies this snapshot.

Capabilities explicitly distinguish provider support, granted permission, and
current availability for calendar listing, timed/all-day reads, recurrence,
details, and source links. Read-only access must remain enforced by scopes and
service methods; a capability label is not authorization. Cache state and errors
must not masquerade as absence of scheduling constraints.

The schema requires every capability entry. Each entry separates provider
`support`, granted `permission`, and current `availability`. A successful read
reports supported/granted/available. An interrupted read reports degraded
availability and incomplete freshness.

Stable read error codes are:

| Code | Retry meaning |
|---|---|
| `unauthenticated`, `not_connected`, `wrong_account` | Caller or connection state must change. Do not retry the same request. |
| `reconnect_required` | Provider authorization failed. The owning service clears unusable credentials and requires reconnection. |
| `permission_denied` | Provider rejected access. Do not present an empty calendar. |
| `rate_limited` | Retryable within the finite budget. Provider 403 and 429 responses use this code. |
| `provider_unavailable`, `timeout` | Retryable only within the finite request budget. |
| `malformed_provider_response` | Quarantine the affected item/page and mark coverage incomplete. |
| `incomplete_pagination` | A token repeated or the page ceiling was reached. Do not advance complete cache coverage. |
| `invalid_request` | The bounded request failed validation. |
| `unsupported_schema_version` | The wire version is unsupported. Runtime validation rejects it before use. |

The provider adapter reads every selected calendar. It caps calendar-list and
event reads at 20 pages. Event pages request 2,500 items; calendar-list pages
request 250. Both operations retry at most twice by default with capped
exponential backoff and jitter. They honor a numeric `Retry-After` up to five
minutes. An absent `nextPageToken` is the only completion proof.

Duplicate provider event IDs within one calendar replace the earlier page copy.
Copies in different calendars remain distinct. A cancellation tombstone removes
the matching live event from that response and remains available for atomic cache
reconciliation. The helper returns partial events only inside an explicitly
incomplete result. A caller must never use it as a complete cache replacement.

### Version compatibility

Schema `1.0.0` is the first cacheable snapshot. The current validator accepts
that exact version. A future validator may explicitly accept a minor version
that adds optional fields whose absence preserves the documented default or
unknown meaning. A minor version cannot change identity, interval,
duration, recurrence, availability, cancellation, or coverage semantics.
Changing those facts requires a new major schema and cache invalidation or an
explicit migration. The adapter version changes whenever Google mapping rules
change, even when the wire schema remains compatible. Desktop validates every
snapshot before atomic replacement and retains the last complete snapshot after
any validation or refresh failure.

## Future consumer readiness, without a planner

Define and fixture-test a minimal scheduling projection from the same event model:
identity, scheduled interval or date span, duration/unknown reason, timezone,
event state, availability, recurrence identity, revision, and snapshot coverage.
Rich descriptions, attendees, conference links, and attachments are not required
to calculate interval overlap and should not enter that projection by default.
Projection tests establish reusable data, not an AI feature or transmission grant.

A later scheduling feature must separately decide how to treat all-day, tentative,
declined, transparent, stale, or unknown-end events. For this release, preserve
these facts, retain conservative advisory overlap semantics, and exclude all-day
events from timed warnings. No current calculation declares a day safe to rearrange.

External text and URLs remain untrusted data, never model instructions or authority.
Any future model integration needs its own consent, data-minimization, read/write
permissions, and stale-snapshot review. No external event enters BehaviorLog,
ordinary account sync, backups, telemetry payloads, or prompt history by default.

## Acceptance examples and required evidence

This Ticket 134 slice adds provider-adapter, schema, duration, and snapshot fixtures:

- `08:00Z–08:45Z` yields 2,700 known seconds; an unspecified end yields unknown.
- Adjacent intervals do not overlap. Overnight bounds retain one event identity.
- DST-crossing timed intervals use instant arithmetic. All-day spans count dates.
- A moved recurring instance preserves original identity and uses its moved interval.
- A cancelled instance with only identity removes the matching cached instance.
- Duplicate pages, multiple calendars, restricted fields, malformed items, partial
  pagination, rate limits, stale cache, account switches, and unsupported versions
  preserve honest completeness and never expose credentials.
- The same normalized fixture produces equal scheduling facts on web and desktop,
  independent of drawer state, dismissed markers, or timeline compression.

Ticket 137 closes only with an indexed schema, examples, field/capability matrix,
error catalog, code ownership, operational lifecycle/cleanup guidance, compatibility
policy, and links to passing contract tests. `docs/qa/day-progress-release.md`
tracks this evidence alongside live connector and native acceptance.

Platform impact: web and desktop share the contract under 134–136. Marketing
documents only verified user-visible capabilities under 137. Future native mobile
and dynamic rearrangement remain deferred consumers, with no implementation here.
