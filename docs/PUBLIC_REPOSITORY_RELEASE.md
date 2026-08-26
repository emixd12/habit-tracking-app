# Public Repository Release Gate

## Decision

Status: **PASS**.

Reviewed on 2026-08-25. Ticket 098 clears the security release gate. The
repository remains private. Ticket 100 may begin only after separate explicit
authorization. This record does not authorize public visibility, settings
changes, deployment, or provider sends.

## Audited basis

- Audited executable commit:
  `6c07538f13df1a358bd8902383b9f109e4da0509`, with parent
  `57171c3f17b32b83acd60b31a27938c856675731`.
- The commit containing this PASS record changes only `STATUS.md` and this
  document from the audited executable commit. Its exact hash belongs in the
  external release handoff. This wording avoids an impossible self-reference.
- The executable branch contains 140 commits. The containing evidence commit
  adds one documentation-only commit.
- Private GitHub `main` and `origin/main` identify the audited executable
  commit before the containing evidence commit is published.
- Web production deployment `dpl_3KGt9dNUy2bg1UxtMdLWDakqDBSZ` is READY at
  the audited executable commit.
- Marketing production deployment `dpl_7gLBemWhZ9WuaUujD2npwu62JUGd` is READY
  at the audited executable commit.
- The hosted Supabase migration boundary ends at
  `20260825080815_add_occurrence_sync_batch_order_index.sql`.
- The containing evidence commit does not change executable, dependency,
  database, policy, or deployment configuration.

## Source and history evidence

Gitleaks 8.30.1 completed history-aware scans of the rewritten branch, all
preserved local refs, and the final fresh private clone. Every scan returned
exit code 0 with no finding. Raw scanner reports remained mode 600 in private
temporary storage.

The Cadence source check reviewed 571 tracked and unignored text files plus
all-ref patch history. It covered Supabase, Sequenzy, VAPID, Google OAuth,
AgentMail, Vercel, cron/process, database, session, and private-key patterns.
It found no credential pattern and no server-only environment name in Next
client or Astro source.

The owner authorized a targeted private-history rewrite before the release
candidate. The isolated rewrite replaced the two audited private values. It
preserved topology, messages, timestamps, names, and unrelated blob and
metadata content. The old values have zero occurrence in rewritten branch
blobs, patches, or author and committer metadata. Intended synthetic and
noreply replacements are present.

The mode-700 recovery directory remains at
`/private/tmp/cadence-ticket098-history-rewrite-XTnslg`. Its mode-600 bundle,
dirty patch, untracked archive, snapshots, and checksum manifest remain intact.
The verified bundle SHA-256 is
`e67ebb4d621226f1f611f8bbee1e2a8dd488067c7a14ed27e8a0fda228ef2fc3`.
Old local objects and reflogs were not pruned. Detached Codex worktrees remain
unchanged.

A fresh private clone at the audited executable commit contains 140 commits.
The clone passed Gitleaks and the public-source check. `LICENSE`,
`SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `README.md`, and the required release
policy files exist. No screenshot or temporary path was added.

These checks do not prove that no undiscovered vulnerability exists. They
prove that the reviewed patterns and scanner rules found no release-blocking
source or history exposure.

## GitHub-hosted surface evidence

Authenticated GitHub CLI and transport reads confirmed that the repository is
private and unarchived. `main` is the default and only branch. No tag exists.

The fresh inventory found:

- no issue or pull request;
- no issue comment, pull-request comment, or review parent object;
- no release or release asset;
- no Actions run, log, or artifact parent object; and
- disabled wiki, Discussions, and Pages surfaces.

The authorized rewrite changed only private GitHub `main` with an exact lease.
Later authorized updates were normal fast-forward pushes. No old branch,
recovery ref, tag, repository setting, visibility setting, release, issue,
pull request, or GitHub feature state changed.

## Browser artifact boundary

Fresh Next.js and Astro builds used six unique public canaries and ten unique
server-only canaries. The complete `.next` and `apps/marketing/dist` trees
passed the artifact proof:

- every public canary had at least one intended placement;
- Next public canaries appeared only in the Next build;
- Astro public canaries appeared only in the Astro build;
- no public canary crossed application surfaces; and
- no server-only canary appeared in either build.

The final proof found 20 Next artifact-file placements and 23 marketing
artifact-file placements. Tests also prove that an absent public canary, a
cross-surface public canary, or any server canary fails the check.

The exact local `npm run build` completed with Next 16.3.3 Turbopack. Vercel
also completed the default Turbopack build for the audited executable commit.
The Astro build generated five static pages, and the Astro check reported zero
diagnostics.

## Public database and authorization evidence

A clean local Supabase reset applied all 33 tracked migrations through
`20260825080815_add_occurrence_sync_batch_order_index.sql`. The static catalog
audit covered every public relation, function, grant, and policy.

The schema has 18 public tables and no public view. Every table has RLS
enabled. Thirteen tables retain anonymous grants, but no policy authorizes the
anonymous role. No public function is executable by the anonymous role. The 12
authenticated functions match the checked registry. Every `SECURITY DEFINER`
function has a pinned search path.

The local ordinary-client RLS smoke created three temporary accounts. It
passed 92 ownership checks across all relations and authenticated functions.
It exercised cross-account reads and mutations through Data API paths. Cleanup
removed all temporary accounts. Local advisors reported no error-level
finding.

Hosted read-only migration and catalog verification matches local state. The
remote migration list contains all 33 migrations. A push dry run reports the
database up to date. The hosted catalog reports the same 18 RLS-enabled public
relations, no public view, no anonymous policy or executable function, 12
authenticated executable functions, and no unpinned security-definer
function.

The already-passed hosted RLS smoke remains applicable. It passed 92 ownership
checks and cleaned three temporary users. No schema, RLS, or privileged caller
source changed afterward. The final bounded window forbade hosted-data
deletion, so the release gate reused that evidence instead of creating new
fixtures. No hosted data changed during the final verification.

Hosted advisors returned no error. Nine security warnings and 31 performance
warnings remain documented. They do not expose an anonymous authorization
path or create a high or critical dependency finding.

## Privileged caller inventory

The server-only Supabase client supports development test login, account
deletion, protected occurrence processing, and protected reminder processing.
Local verification scripts use loopback credentials for bounded fixture
lifecycle. Normal browser data access uses ordinary authenticated clients.

Protected process routes read process secrets only on the server and compare
request values with timing-safe equality. Sequenzy and VAPID private keys stay
inside server provider adapters. The AgentMail key stays inside its operator
CLI. Database and Vercel credentials have no application client caller.

The source check, artifact proof, privacy-safe error paths, and export review
found no route that returns or logs a service-role key, provider secret, OAuth
secret, process secret, database credential, or session material to a browser
or exported artifact. Public Supabase configuration and the VAPID public key
remain the documented browser values.

## Dependency and build evidence

A clean `npm ci` installed the committed root workspace and lockfile. It did
not change `package.json`, `apps/marketing/package.json`, or
`package-lock.json`. The reproduced tree contains Next 16.3.3, Astro 7.2.6,
esbuild 0.28.2, PostCSS 8.5.26, sharp 0.35.3, and SVGO 4.1.0.

Both `npm audit --omit=dev --audit-level=low` and full
`npm audit --audit-level=low` returned exit code 0 with zero findings. The
esbuild override selects 0.28.2 within Vite 8's peer range. Astro and Next
retain sharp and SVGO through transitive contracts. Marketing does not declare
unnecessary direct copies.

The root Node engine requires 22.12.0 or newer. Public setup and operations
guidance recommend Node 24 for Vercel parity without asserting an unsupported
upper bound.

The complete clean verification passed:

- `npm run agents:check`;
- `npm run interactions:check`;
- `npm run resolvers:check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm run test` with 130 files passed, one skipped, 1,008 tests passed, and
  one skipped;
- exact `npm run build` with Next Turbopack;
- `npm run marketing:build`;
- `npm run marketing:check`;
- both dependency audits;
- the public-source and canary artifact checks; and
- `git diff --check`.

## Production evidence

Web deployment `dpl_3KGt9dNUy2bg1UxtMdLWDakqDBSZ` is READY at the audited
executable commit. Vercel installed with npm 11.17.0 and completed the default
Next 16.3.3 Turbopack build. The canonical, project, and main-branch aliases
remain unchanged. Public policy routes and protected application routes return
the expected successful responses. Unauthenticated process-route probes return
401. Verification sent no email or push notification.

Marketing deployment `dpl_7gLBemWhZ9WuaUujD2npwu62JUGd` is READY at the same
commit. The monorepo-root upload contained 669 committed files. Vercel used the
root workspace, root lockfile, and root overrides. It resolved esbuild 0.28.2
and completed the Astro build. The canonical alias
`cadence-marketing-two.vercel.app` remains unchanged. All 19 audited routes
returned HTTP 200.

The marketing Astro config supplies an inline empty PostCSS plugin list. This
prevents Vite from discovering the web application's root Tailwind/PostCSS
config during a marketing-scoped install. The boundary adds no dependency.
It preserves one root lockfile, one override policy, and the existing npm
workspace contract. A marketing-local lockfile is unnecessary.

## Ticket 099 policy evidence

The root MIT `LICENSE` names the approved holder. `README.md` documents the
license boundary for source, documentation, synthetic samples, binary assets,
and Cadence marks. `SECURITY.md` defines the monitored private disclosure route
and the future GitHub private-reporting route. `THIRD_PARTY_NOTICES.md`
preserves required upstream notices.

The owner assigned the security inbox monitor. One separately authorized
synthetic route-test email reached the approved mailbox. No recipient,
provider, message, header, vulnerability, credential, user, or behavior data
appears in this record. Ticket 098 sent no email or push notification.

## Remaining boundary

Ticket 098 has no remaining release blocker. The decision is PASS.

The repository remains private. Ticket 100 is `not_started`. Ticket 100 must
obtain separate explicit authorization before changing visibility or any
GitHub setting. This PASS record does not authorize that work.
