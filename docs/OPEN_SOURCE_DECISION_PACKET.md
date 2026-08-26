# Ticket 099 Open-Source Decision Record

This public-safe record documents the approved Ticket 099 license, asset-scope,
trademark, attribution, and private-reporting decisions. Root `LICENSE`,
`SECURITY.md`, and `README.md` provide the operative public terms. This record
is not legal advice and does not replace those files.

Reviewed on 2026-08-25 against the current dirty worktree. Ticket 098 remains a
release `FAIL`. One authorized synthetic route-test email was sent. No GitHub,
deployment, publication, or other recipient mutation occurred during this
review.

## Approved owner decisions

### 1. Code license

Owner decision: **MIT**.

Owner value: **Identity Scaffolding LLC** is the approved copyright holder.

The root `LICENSE` now contains the standard MIT text and
`Copyright (c) 2026 Identity Scaffolding LLC`.

### 2. Private security-reporting route

Owner decision: use a **dedicated security email as the primary route**. Enable
**GitHub private vulnerability reporting as a secondary route after the
repository becomes public**. A public issue is not an acceptable route.

Owner value: **security@identityscaffolding.com** is the approved primary
address.

Owner value: the **repository owner** monitors the inbox.

The owner authorized exactly one harmless synthetic route-test email to the
approved address. No other recipient or outbound message is authorized.

Route-test result on 2026-08-25: the sender accepted exactly one authorized
synthetic message and retained it with sent status. Recipient-side inspection
confirmed that the approved mailbox received it. The message landed in the junk
folder, so the repository owner must monitor junk and quarantine folders or
maintain appropriate allowlisting. The test record contains no screenshot,
sender address, provider identifier, message header, message content,
vulnerability detail, credential, user data, or behavioral content.

Root `SECURITY.md` requests affected version, impact, reproduction steps, and a
minimal proof. It prohibits credentials, real user data, behavioral content,
and public-issue disclosure. It asks for coordinated disclosure without
promising an unstaffed response deadline.

The policy support statement is: “the current production version and latest
source release receive security fixes.” Cadence currently has no tags or
releases. The policy does not promise a response deadline.

### 3. Non-code copyright scope and Cadence trademark posture

Owner decision: **split copyright scope**.

The MIT copyright grant covers owner-controlled source code, documentation,
and synthetic sample content. The owner confirmed authority to license those
included groups.

The MIT grant excludes every tracked binary non-code asset pending provenance
review. The excluded groups include Next app icons, Cadence logos, brand
illustrations, product captures, custom notification icons, design exploration,
QA screenshots, and audio. `README.md` names these exclusions without implying
that they lack all rights under applicable law.

Owner decision: **Cadence marks remain reserved**. No affirmative
trademark-use grant is approved.

A copyright license for a logo image does not itself grant permission to use
the Cadence name or logo as a trademark. Apache-2.0 expressly excludes
trademark permission, and a software license should not be treated as an
implicit trademark policy. Any affirmative trademark-use grant requires a
separate explicit owner decision and legal review. Without that separate grant,
Cadence trademark rights remain reserved, subject to applicable nominative-use
doctrines.

The source license never grants rights to production credentials, hosted
service access, or user-owned behavioral data.

## Evidence inventory

### Repository license and attribution state

- At the initial Ticket 099 review, no tracked root `LICENSE`, `SECURITY.md`,
  `NOTICE`, `COPYING`, third-party notice, or attribution file existed.
- Root and marketing package manifests are both marked `private: true`.
- At that initial review, `README.md` and marketing copy called Cadence
  open-source while no root license provided a source reuse grant.
- Git history identifies commit authors. It does not establish the approved
  copyright holder or prove rights in every asset.
- A source scan found one explicitly copied code file:
  `tests/fixtures/behaviorlog-reference/validate.mjs`. Its adjacent
  `SNAPSHOT.md` records upstream repository, commit, and a small local
  adaptation. The current upstream BehaviorLog repository states MIT. Ticket
  099 fetched the exact pinned license and preserves it in
  `THIRD_PARTY_NOTICES.md`.
- The scan found no other copied-code or SPDX provenance header. That absence
  is not proof that every remaining file is original.

### Direct runtime dependencies

Versions and license identifiers below come from `package.json`,
`apps/marketing/package.json`, `package-lock.json`, and installed package
metadata.

| Direct dependency | Resolved version | Declared license | Current use |
|---|---:|---|---|
| `@js-temporal/polyfill` | 0.5.1 | ISC | Timezone and recurrence logic. |
| `@supabase/ssr` | 0.10.3 | MIT | Server-rendered authentication. |
| `@supabase/supabase-js` | 2.107.0 | MIT | Supabase client access. |
| `lucide-react` | 1.17.0 | ISC | Product interface icons. |
| `next` | 16.2.7 | MIT | Authenticated web application. |
| `react` | 19.2.7 | MIT | Product UI runtime. |
| `react-dom` | 19.2.7 | MIT | Product DOM runtime. |
| `web-push` | 3.6.7 | MPL-2.0 | Browser push delivery. Review MPL file-level obligations before release. |
| `@fontsource-variable/ibm-plex-sans` | 5.2.8 | OFL-1.1 | Bundled marketing sans font. |
| `@fontsource/ibm-plex-mono` | 5.2.7 | OFL-1.1 | Bundled marketing mono font. |
| `astro` | 6.4.8 | MIT | Static marketing application. |

The Next application also requests IBM Plex Sans through `next/font/google`.
IBM publishes Plex under SIL OFL 1.1 with “Plex” as a reserved font name.

### Direct development and test dependencies

| Declared license | Direct packages and resolved versions |
|---|---|
| MIT | `@tailwindcss/postcss` 4.3.0; `@types/node` 22.19.20; `@types/react` 19.2.17; `@types/react-dom` 19.2.3; `@types/web-push` 3.6.4; `eslint` 9.39.4; `eslint-config-next` 16.2.7; `supabase` 2.105.0; `tailwindcss` 4.3.0; `vitest` 4.1.8; `@astrojs/check` 0.9.9. |
| Apache-2.0 | `agentmail-cli` 0.7.12; `typescript` 5.9.3. |
| MIT, Python load harness | `locust` 2.46.2 from `load-tests/requirements.txt`. |

This inventory covers direct dependencies. The lockfile remains the authority
for transitive dependency versions. Ticket 098 separately records unresolved
high-severity production dependency findings, so compatibility review alone
cannot clear publication.

### Fonts and icons

- Marketing bundles IBM Plex Sans and IBM Plex Mono from Fontsource packages
  under OFL-1.1.
- Next uses IBM Plex Sans through `next/font/google`. No repository font file is
  tracked for that surface.
- Product source imports Lucide icons from `lucide-react` under ISC.
- Two custom PNG notification icons live under `public/icons`. No attribution
  or provenance sidecar accompanies them.

### Images, marks, audio, and screenshots

The repository tracks 55 image files and one audio file:

- 16 active application or marketing images: two Next app icons, five files
  under `public/brand`, two custom notification icons, and seven marketing
  brand/product-capture files.
- 29 PNG/SVG design-exploration files under `docs/design-exploration`.
- 10 QA screenshots under `docs/qa`.
- One completion chime under `public/sounds/completion-chime.mp3`.

`public/brand/cadence-logo.png` and
`apps/marketing/public/brand/cadence-logo.png` are byte-identical. Other logo
sizes and the favicon appear to be derived variants based on names and use;
their creation source is not documented.

Git history shows one repository author added these files. It provides no
license, attribution, model release, stock-source receipt, or rights chain.
Ticket 071 records owner approval to add its source screenshots, but that
approval does not define a public reuse license. These assets remain excluded
pending provenance review. Any future inclusion requires explicit owner rights
confirmation.

### Samples and BehaviorLog material

- `apps/marketing/scripts/build-example-bundle.mjs` creates synthetic Cadence
  sample content and BehaviorLog-shaped records. The resulting
  `cadence-demo.behaviorlog.zip` is build-generated and ignored by Git.
- Cadence source, tests, and docs implement BehaviorLog field names, semantic
  rules, and examples. The upstream standard lives in a separate repository
  whose current page states MIT.
- The pinned validator is the only locally documented vendored upstream file.
  It requires preservation of the upstream MIT notice in distributed copies or
  substantial portions.
- The owner decided that Cadence-authored synthetic sample content shares the
  MIT license. User-created exports and behavioral data remain outside the
  source license.

### Hosted Terms, Privacy, and Trust boundaries

`components/settings/LegalContent.tsx` supplies separate public hosted-service
pages:

- Terms describe permitted product use, manual status semantics, product
  boundaries, authentication, export, and deletion.
- Privacy describes stored account and behavior data, providers, portability,
  and deletion.
- Trust describes manual truth, RLS-backed account isolation, portability, and
  reminder limitations.

None of these pages grants source, trademark, illustration, sample-content, or
user-data rights. The Ticket 099 documents preserve that separation. The
selected reporting routes add no hosted-form provider. These pages passed a
consistency review and need no new provider disclosure for Ticket 099.

## Local implementation and remaining gates

Implemented locally:

1. Root `LICENSE` contains the standard MIT text and approved holder.
2. Root `SECURITY.md` names the approved security email as primary and GitHub
   private vulnerability reporting as the post-publication secondary route. It
   includes supported versions, requested report fields, coordinated
   disclosure, and safe research boundaries.
3. `THIRD_PARTY_NOTICES.md` preserves the exact MIT notice fetched from the
   pinned BehaviorLog validator snapshot.
4. `README.md` records the split MIT copyright scope, binary-asset exclusions,
   reserved marks, security-policy link, self-hosting responsibilities, and
   browser/server secret boundary.
5. Operations, decisions, architecture, release, and status records preserve
   the hosted-service, source-license, user-data, and trademark distinctions.

Ticket 099 is complete locally. Its operational follow-up is:

1. Monitor junk and quarantine folders or maintain appropriate allowlisting so
   filtered private reports receive review.

Later release gates remain outside Ticket 099:

1. After Ticket 100 enables GitHub private vulnerability reporting, test that
   secondary route separately.
2. Rerun Ticket 098 against the exact proposed release commit. Ticket 100
   remains blocked until that gate passes.

Primary references reviewed:

- GitHub security policy guidance:
  `https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy`
- GitHub private vulnerability reporting:
  `https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately`
- BehaviorLog upstream repository and current MIT declaration:
  `https://github.com/emixd12/BehaviorLog-Bundle`
- IBM Plex license:
  `https://github.com/IBM/plex/blob/master/LICENSE.txt`
- Lucide license:
  `https://lucide.dev/license`
