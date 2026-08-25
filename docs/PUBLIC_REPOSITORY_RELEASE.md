# Public Repository Release Gate

## Decision

Status: **FAIL**.

Reviewed on 2026-08-25. This decision blocks Ticket 100. Cadence remains
private after the authorized history rewrite. It must remain private until the
remaining fail conditions are remediated and the complete gate is rerun against
one reproducible deployed commit and a fresh GitHub metadata snapshot.

## Audited basis

- Local branch: `main`.
- Local rewritten base commit:
  `c02514851b30987c432bfdfc9067ccb1245a20c8`.
- Replaced private remote base commit:
  `e8d3ec79bf56c6e7e762ed1a229c7f99bdb2ffb9`. The owner authorized one exact
  force-with-lease update after a fresh remote read matched this value.
- Immutable release candidate:
  `ae3dae1c554ac389db715891abef1704ab648a8c`. This commit records the 150
  previously changed or untracked status entries containing the locally
  completed Ticket 078-083, 093, and 095-099 work. Local `main`, private GitHub
  `main`, and `origin/main` now identify this candidate. Both Vercel projects
  report it as their Git source commit.
- Rewritten `main` retains 138 commits. Commit topology, messages,
  timestamps, and author/committer names are unchanged. All non-targeted blob
  contents and metadata are unchanged. Local Codex worktrees, reflogs, and the
  recovery bundle keep the pre-rewrite objects recoverable locally. No local or
  remote tag exists.
- Recovery directory:
  `/private/tmp/cadence-ticket098-history-rewrite-XTnslg`. The directory is
  mode 700. Its all-refs bundle, dirty patch, untracked archive, status/refs
  snapshots, and checksum manifest are mode 600. The verified bundle SHA-256
  is `e67ebb4d621226f1f611f8bbee1e2a8dd488067c7a14ed27e8a0fda228ef2fc3`.
- The authenticated web application and marketing deployment both report the
  immutable candidate as their Git source commit. The marketing deployment is
  `dpl_8aYoaAbPQ3rVE6tS3v2SWJBvCBQU`.
- The marketing canonical and project domains remain. Vercel automatically
  removed the prior per-user branch alias during the production deployment;
  Ticket 098 made no domain or project-setting request.
- The hosted Supabase migration boundary now ends at
  `20260825080815_add_occurrence_sync_batch_order_index.sql`. It matches a
  clean local reset and the tracked migration directory.
- Five worktree paths now differ from the candidate: these two evidence files,
  the Settings App Router page, the existing settings component module, and
  the focused settings test. The three source/test changes are the minimal
  correction for a Next 16.3.3 route-export failure discovered during the
  fresh gate. They are not committed, pushed, or deployed.

The Git source and hosted schema identify the candidate. The marketing build's
installed dependency graph does not. The uncommitted Next correction also
means the candidate is no longer the proposed releasable source tree.

## Source and history evidence

- After the rewrite, Gitleaks 8.30.1 separately scanned rewritten local
  `main`, all 15 preserved local refs, and a private temporary copy of every
  tracked and unignored worktree file. All three scans returned exit code 0
  with no finding. The all-ref graph contains 164 unique reachable commits;
  rewritten base `main` retained 137 commits before the release-candidate
  commit.
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
- The exact force-with-lease update changed only private GitHub `main`. A
  post-push remote read and explicit fetch confirmed both remote `main` and
  `origin/main` at the immutable release candidate. Remote ref inventory found
  one branch named `main` and no tags, so no old branch, tag, or recovery ref
  was created remotely.
- A fresh private single-branch clone resolved to the exact candidate with 138
  commits. It contained zero prior-target occurrences across 2,366 reachable
  history blobs, full patches, and author/committer metadata. Intended
  replacements were present. Gitleaks returned exit code 0 with no finding.
  The public-source check reviewed 571 text files with zero worktree, history,
  or client-environment finding. `LICENSE`, `SECURITY.md`,
  `THIRD_PARTY_NOTICES.md`, `README.md`, and the required release-policy files
  were present.
- Old objects and reflogs were not pruned. The mode-700 recovery directory and
  detached Codex worktrees remain unchanged.
- Raw scanner reports remained outside the repository. No matched value,
  fingerprint, private identifier, or user record appears in this document.

These results cover the reviewed source and local refs. They do not prove that
no undiscovered vulnerability or credential exists.

## GitHub-hosted surface evidence

The GitHub CLI installation was present, but its configured authentication was
invalid. An authenticated read-only GitHub connector completed the repository
inventory instead. A fresh post-deployment connector read confirmed that the
repository remains private, unarchived, and configured with `main` as its
default branch. The connector and authenticated Git transport reported:

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
content. The only GitHub mutation was the separately authorized
force-with-lease update of `refs/heads/main` to the immutable release candidate.
No tag, other branch, repository setting, visibility setting, release, issue,
pull request, Actions, Pages, Discussions, or wiki state changed.

## Browser artifact boundary

Fresh Next.js and Astro builds used six unique public canaries and ten unique
server-only canaries. The complete `.next` tree and
`apps/marketing/dist` tree passed the artifact check:

- every declared public canary had at least one intended placement;
- Next public canaries appeared only in the Next build;
- Astro public canaries appeared only in the Astro build;
- no public canary crossed application surfaces; and
- no server-only canary appeared in either build.

The fresh proof found 27 Next artifact-file placements and 7 Astro artifact-file
placements. The test suite also proves that an absent declared public canary,
a cross-surface public canary, or any server canary fails the check.

The fresh Astro build used the ordinary workspace command. The managed local
environment denied Turbopack's internal loopback bind before compilation, even
after escalation. A clean Next webpack production build compiled, typechecked,
generated all routes, and supplied the audited artifacts after the route-export
correction. The next Vercel web deployment must pass the exact default
`npm run build`; the local webpack proof does not replace that hosted gate.

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

After explicit owner authorization, the seven pending tracked migrations were
applied to the linked hosted project in exact order. A fresh remote migration
list and dry run report no pending migration through
`20260825080815_add_occurrence_sync_batch_order_index.sql`. Hosted RLS smoke
again passed 92 ownership checks and cleaned three temporary users. A cleanup
query found no remaining run user or behavior.

The hosted catalog reports the same 18 RLS-enabled public relations, no public
view, no anonymous policy or executable function, 12 authenticated executable
functions, and no unpinned security-definer function. Migration-specific
checks confirm the new configuration lineage, protected profile/reminder
state, push cap, timezone grant, protected function grants, and sync-batch
index. Hosted advisors returned no error. They retain 9 security warnings and
31 performance warnings already recorded for follow-up.

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

The production marketing deployment does not reproduce this audited dependency
graph. The CLI command ran from `apps/marketing` and uploaded 37 marketing
files. It omitted the committed root `package-lock.json` and root `overrides`.
Vercel therefore ran `npm install`, reported a generated lockfile change, and
installed sharp 0.34.5 instead of the audited sharp 0.35.3. The deployment
reports the exact Git commit, but its installed dependency provenance is not
the candidate's locked graph.

The smallest durable remediation is to set the Vercel Root Directory to
`apps/marketing` and invoke Vercel CLI from the monorepo root. An authenticated
read-only project query confirms that the Root Directory is currently unset,
**Include source files outside of the Root Directory in the Build Step** is
already enabled, and no Git repository is linked to this project. Vercel's
monorepo guidance says CLI deployment should start at the repository root. The
existing outside-source setting then permits the build to read the root npm
workspace manifest and lockfile.

A committed `apps/marketing/package-lock.json` is the fallback, not the
preferred fix. It would make subtree-only uploads reproducible, but it would
duplicate dependency state. The root overrides would not govern a standalone
marketing install, so equivalent marketing-local overrides and separate audit
maintenance would also be required. The root-source option preserves one lock,
one override policy, and the existing npm workspace contract.

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

These additions do not change this document's `FAIL`. The resumed local source,
worktree, dependency, build, and artifact checks include Ticket 099's files.
The authorized private `main` rewrite clears the remote-history blocker but
does not authorize public visibility. Rerun Ticket 098 against a new immutable
candidate after the dependency-provenance and Next route-export fixes share one
commit, using a fresh GitHub metadata snapshot. Ticket 099's monitor assignment
and route-test gate are complete. Neither changes this release decision.

## Open risks and pass conditions

The gate fails for two independent reasons:

1. Marketing production omitted the committed root lockfile and overrides, so
   its installed dependency graph differs from the audited candidate.
2. The minimal Next route-export correction is uncommitted and undeployed. The
   next web deployment must pass its default `npm run build`.

A future rerun may pass only after both fixes share one new immutable commit
and reproducible production deployments. It also requires another fresh GitHub
snapshot, both dependency audits, history and source scans, clean canary
builds, and repeated database/RLS evidence. Ticket 100 must not make this
repository public before that pass record exists.
