# Public Repository Release Gate

## Decision

Status: **FAIL**.

Reviewed on 2026-08-25. This decision blocks Ticket 100. Cadence must remain
private until every fail condition below is remediated and the complete gate is
rerun against one clean, deployable commit and a fresh GitHub metadata snapshot.

## Audited basis

- Local branch: `main`.
- Local rewritten base commit:
  `c02514851b30987c432bfdfc9067ccb1245a20c8`.
- Preserved remote-tracking base commit:
  `e8d3ec79bf56c6e7e762ed1a229c7f99bdb2ffb9`. Local `main` and
  `origin/main` intentionally diverge until a separately authorized,
  force-with-lease publication step replaces the private GitHub history.
- Local release candidate: this containing commit records the 150 previously
  changed or untracked status entries containing the locally completed Ticket
  078-083, 093, and 095-099 work. It is the immutable local release candidate.
  Its commit hash is reported externally because a commit cannot contain its
  own hash. The candidate is not yet the GitHub or production release.
- Rewritten local `main` retains 137 commits. Commit topology, messages,
  timestamps, and author/committer names are unchanged. All non-targeted blob
  contents and metadata are unchanged. Preserved remote-tracking, Codex, and
  reflog references keep the pre-rewrite objects recoverable locally. No local
  tag exists.
- Recovery directory:
  `/private/tmp/cadence-ticket098-history-rewrite-XTnslg`. The directory is
  mode 700. Its all-refs bundle, dirty patch, untracked archive, status/refs
  snapshots, and checksum manifest are mode 600. The verified bundle SHA-256
  is `e67ebb4d621226f1f611f8bbee1e2a8dd488067c7a14ed27e8a0fda228ef2fc3`.
- Last documented production application commit:
  `a0fd750e3a936067c2142de350f43f9cfca559cb`. This value comes from the prior
  Ticket 094 record. Ticket 098 did not independently verify the current
  deployed version.
- Last documented hosted migration boundary:
  `20260812172823_add_time_session_query_rpcs.sql`. The clean local database
  reset applies through `20260825080815_add_occurrence_sync_batch_order_index.sql`.
- Tickets 079-083 and 093 are complete locally but their security-relevant
  application and migration changes are not fully deployed and verified.

The deployed application, hosted migration history, and immutable local release
candidate therefore do not identify one shared releasable version.

## Source and history evidence

- After the rewrite, Gitleaks 8.30.1 separately scanned rewritten local
  `main`, all 15 preserved local refs, and a private temporary copy of every
  tracked and unignored worktree file. All three scans returned exit code 0
  with no finding. The all-ref graph contains 164 unique reachable commits;
  rewritten local `main` retains 137 commits.
- The Cadence source check reviewed 571 text files and the all-ref patch
  history for Supabase, Sequenzy, VAPID, Google OAuth, AgentMail, Vercel,
  cron/process, database, session, and private-key patterns. It found no
  project-specific credential match and no server-only environment name in a
  Next client or Astro source file.
- After owner approval, Ticket 098 rewrote local `main` in an isolated clone.
  The historical test-recipient value became an `example.invalid` placeholder,
  and the audited non-noreply author/committer email became the repository
  owner's GitHub noreply address. Validation found zero old-value occurrences
  in rewritten-branch blobs, patches, or commit metadata and found the intended
  replacements. Exactly one path changed across 27 commit trees. Rewritten
  HEAD changes only that path relative to the old HEAD tree.
- The primary worktree retained all protected bytes. A private checksum audit
  compared 157 concrete dirty or untracked file paths with zero mismatch. The
  150-entry status snapshot remained identical, and the refreshed index has
  zero staged changes.
- GitHub and `origin/main` remain unchanged at the pre-rewrite history. Old
  objects and reflogs were not pruned. The local rewrite therefore reduces the
  future publication risk but does not clear the remote-history gate.
- Raw scanner reports remained outside the repository. No matched value,
  fingerprint, private identifier, or user record appears in this document.

These results cover the reviewed source and local refs. They do not prove that
no undiscovered vulnerability or credential exists.

## GitHub-hosted surface evidence

The GitHub CLI installation was present, but its configured authentication was
invalid. An authenticated read-only GitHub connector completed the repository
inventory instead. The connector reported:

- one branch and no tags;
- no issues or pull requests;
- no releases;
- no Actions workflow runs; and
- disabled wiki, Discussions, and Pages surfaces.

Issue comments, pull-request comments and reviews, release assets, Actions logs,
and run artifacts had no parent object to inspect. A generic repository-artifact
request was unavailable, but the zero-run inventory makes per-run logs and
artifacts inapplicable for this snapshot. The reviewed issue, pull-request,
release, Actions, wiki, Discussions, and Pages metadata contained no sensitive
content. Remote-history risk is recorded separately above. No GitHub mutation
occurred.

## Browser artifact boundary

Fresh Next.js and Astro builds used six unique public canaries and ten unique
server-only canaries. The complete `.next` tree and
`apps/marketing/dist` tree passed the artifact check:

- every declared public canary had at least one intended placement;
- Next public canaries appeared only in the Next build;
- Astro public canaries appeared only in the Astro build;
- no public canary crossed application surfaces; and
- no server-only canary appeared in either build.

The proof found 20 Next artifact-file placements and 21 Astro artifact-file
placements. The test suite also proves that an absent declared public canary,
a cross-surface public canary, or any server canary fails the check.

## Public database and authorization evidence

A clean local Supabase reset applied every migration. The static catalog audit
covered every public relation, function, grant, and policy.

The 18 public tables are `profiles`, `categories`, `behaviors`,
`behavior_definition_events`, `behavior_configuration_events`,
`behavior_schedules`, `behavior_schedule_slots`, `occurrences`,
`reminder_deliveries`, `push_subscriptions`, `occurrence_status_events`,
`occurrence_sync_state`, `behaviorlog_import_runs`,
`behaviorlog_import_record_mappings`, `imported_notes`,
`imported_interventions`, `launch_rate_limits`, and
`occurrence_time_sessions`. No public view exists. Every table has RLS enabled.

Thirteen tables retain anonymous grants, but zero policy authorizes the
anonymous role. Zero public function is executable by the anonymous role. The
12 authenticated public functions match the checked registry. Every
`SECURITY DEFINER` function has a pinned search path.

The ordinary-client RLS smoke created three temporary accounts, exercised all
18 relations and the authenticated function registry, and passed 92 ownership
checks. It attempted cross-account reads and mutations through Data API paths.
Exact cleanup removed all three temporary accounts. Local Supabase advisors
reported no error-level finding. Existing RLS initialization-plan performance
warnings remain outside this security gate.

## Privileged caller inventory

The server-only Supabase client has four runtime purposes: development-only
test login, account deletion, protected occurrence processing, and protected
reminder processing. Local smoke, cleanup, and load-test scripts also use a
loopback service role for bounded fixture lifecycle. Normal browser data access
continues through ordinary authenticated clients.

The protected occurrence and reminder routes read process secrets only on the
server and compare request values with timing-safe equality. The Sequenzy API
key and VAPID private key are read only by server provider adapters. The
AgentMail key is limited to its operator CLI. Database and Vercel credentials
have no application client caller.

The client-source check, synthetic artifact proof, privacy-safe error paths,
and export review found no path that returns or logs a service-role key,
provider secret, OAuth secret, process secret, database credential, or session
material to a browser or exported artifact. Public Supabase configuration and
the VAPID public key remain the only documented browser credentials.

## Production dependency evidence

The final authorized full `npm audit` and `npm audit --omit=dev` runs completed
against the remediated manifest and lockfile. Both returned exit code 0 with 0
low, 0 moderate, 0 high, and 0 critical findings. Ticket 098 upgraded Next.js
and its aligned ESLint configuration to 16.3.3 and Astro to 7.2.6. The resolved
production tree now uses esbuild 0.28.2, js-yaml 4.3.1, nanoid 3.3.18, PostCSS
8.5.26, sharp 0.35.3, and SVGO 4.1.0.

The esbuild override selects 0.28.2 within Vite 8's declared 0.28.x peer range
and removes the prior low finding. Astro and Next retain sharp and SVGO through
their transitive contracts, so the marketing workspace does not declare those
packages directly. A clean `npm ci` reproduced the complete tree without
changing either manifest or the lockfile. The full development graph resolves
@astrojs/language-server 2.16.14, volar-service-yaml 0.0.71,
yaml-language-server 1.23.0, YAML 2.8.3 or newer, fast-uri 3.1.6, and the fixed
brace-expansion 1.1.18 and 5.0.9 lines. These compatible lock refreshes remove
all six prior development-tool findings without a broad override.

The root Node engine requires 22.12.0 or newer. The public setup and operations
guidance recommends Node 24 to match both Vercel projects without asserting an
unsupported upper bound.

## Ticket 099 post-audit policy artifacts

Ticket 099 added local policy artifacts after this release gate's audited
snapshot. The root MIT `LICENSE` names Identity Scaffolding LLC as the 2026
copyright holder. `README.md` applies MIT to owner-controlled source,
documentation, and synthetic samples while excluding tracked binary non-code
assets pending provenance review. Cadence marks remain reserved.

`SECURITY.md` names `security@identityscaffolding.com` as the primary private
route and GitHub private vulnerability reporting as a secondary route after
Ticket 100 enables it. The repository owner monitors the inbox. The sender
accepted and retained exactly one authorized synthetic route-test message with
sent status on 2026-08-25. Recipient-side inspection confirmed receipt at the
approved mailbox. The message landed in the junk folder, so filtered-folder
monitoring or appropriate allowlisting remains an operational requirement.
`THIRD_PARTY_NOTICES.md` preserves the pinned BehaviorLog validator's exact
upstream MIT notice.

These additions do not change this document's `FAIL`. The original GitHub
inventory predates Ticket 099, but the resumed local source, worktree,
dependency, build, and artifact checks include its files. Ticket 099 does not
remediate the deployment or remote-history blockers and does not authorize
publication. Rerun Ticket 098 against the containing local release candidate
after remote and production reconciliation, using a fresh GitHub metadata
snapshot. Ticket 099's monitor assignment and route-test gate are complete.
Neither changes this release decision.

## Open risks and pass conditions

The gate fails for three independent reasons:

1. Tickets 079-083 and 093 are not fully deployed and verified in production.
2. The deployed application and hosted migration boundary do not match the
   audited local state.
3. GitHub and `origin/main` retain the pre-rewrite history. Local `main` cannot
   become the public history until the owner authorizes a fresh remote check
   and a force-with-lease update against the recorded remote commit.

A future rerun may pass only after deployment verification, an authorized
force-with-lease history update, a fresh clone of the resulting GitHub branch,
and an authenticated refresh of every GitHub surface. It must verify the clone
matches this immutable local release candidate. It also requires a fresh
dependency audit, history and source scans, clean canary builds, and repeated
database/RLS evidence. Ticket 100 must not publish this repository before that
pass record exists.
