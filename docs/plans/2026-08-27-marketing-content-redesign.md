# Cadence Marketing Content Redesign Implementation Plan

> **Execution:** implement task by task in one reviewable branch. Do not publish the legal copy or open public registration until the release gates pass.

**Goal:** Reframe Cadence around explicit decisions, preserved context, longitudinal review, and portable records while keeping every public claim aligned with the implemented product.

**Source of truth:** The approved Cadence Website Content Map, this plan's settled decisions, `docs/PRODUCT_SPEC.md`, `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`, `docs/EXPORT_FORMATS.md`, and the current implementation.

**Architecture:** Keep Astro as the marketing site. Keep the Next application as the only canonical host for `/trust`, `/privacy`, and `/terms`. Reuse the deployed public Trust evidence pipeline and change only its view model and presentation. Generate marketing Markdown and agent outputs from existing shared route data.

**Tech stack:** Astro, Next.js App Router, TypeScript, React, CSS, Vitest, the existing public Trust evidence feed.

---

## Settled decisions

- Cadence is public at `https://github.com/emixd12/habit-tracking-app` under the MIT license in the repository.
- Keep accurate open-source claims, GitHub links, source evidence, and the repository entry in `llms.txt`.
- The application origin remains canonical for `/trust`, `/privacy`, and `/terms`. Do not create Astro copies.
- Cadence provides prepared prompts, but users export data and choose an external AI service. Cadence does not send behavior data to an AI provider.
- Use exactly five export formats: JSONL, JSON, CSV, Markdown, and BehaviorLog bundle.
- Describe duration as optional context. The implemented interaction is start, stop, and reset timing, not manual duration entry.
- Describe definition history as implemented title and description revision history. Do not imply that the app offers a full revision browser where it does not.
- Describe pricing as: "Cadence is currently available without charge." Do not promise permanent free hosted service.
- Reuse the completed nine-check Trust pipeline. Do not redesign its schema, collector, publication workflow, or freshness rules.
- Public legal entity: Identity Scaffolding LLC, a Wyoming limited liability company assumed authorized in New York.
- Public address: 30 N Gould St Ste R, Sheridan, WY 82801.
- Privacy contact: `privacy@identityscaffolding.com`. Publication requires creation and confirmation of this mailbox.
- Minimum age: 18.
- New York law governs, subject to nonwaivable consumer protections.
- Disputes use informal resolution first, then a court of competent jurisdiction in New York State.
- Do not require arbitration or waive class-action rights in the initial Terms.
- Routine logs: 30 days.
- Security-incident logs: up to 90 days or until the investigation concludes.
- Backups: no more than 30 days, subject to verified provider capabilities.
- Deleted-account live data: immediately or within seven days. Backup remnants age out within 30 days.
- Support messages: 12 months after resolution.
- Retain specific records longer only for security investigations, fraud prevention, or legal preservation.

## Explicit non-goals

- No new product features, AI integration, analytics, payment flow, auth flow, or export format.
- No duplicate legal routes or legal Markdown mirrors on the marketing origin.
- No changes to Trust evidence collection or provider permissions.
- No new design system, component library, content management system, or runtime dependency.
- No invented screenshots, analytics, verification results, or provider guarantees.

## Task 1: Record the content contract and release gates

**Objective:** Make the settled content and legal boundaries durable before changing public copy.

**Files:**

- Modify: `docs/TICKETS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `STATUS.md`

**Steps:**

1. Add one scoped implementation ticket for this redesign.
2. Record the public source, canonical legal host, external AI boundary, five export formats, entity facts, retention schedule, and dispute model.
3. Replace the current statement that retention is undecided.
4. Record three hard publication gates: provider retention verification, confirmed privacy mailbox, and one legal review.
5. State that public registration stays closed until those gates pass.
6. Mark the ticket in progress without changing unrelated ticket state.

**Check:** `rg -n "retention.*undecided|privacy@identityscaffolding.com|New York" docs STATUS.md`

## Task 2: Establish one canonical vocabulary and content contract test

**Objective:** Define project terms once and fail tests when public surfaces drift.

**Files:**

- Create: `apps/marketing/src/data/vocabulary.ts`
- Create: `tests/public-content-contract.test.ts`
- Modify: `apps/marketing/src/data/site.ts`
- Modify: `apps/marketing/src/data/faq.ts`
- Modify: `apps/marketing/src/data/routes.ts`
- Modify: `components/settings/LegalContent.tsx`

**Steps:**

1. Export the ordered glossary from `vocabulary.ts`: Behavior, Schedule, Occurrence, Decision, Completed, Not Completed, Unresolved, Context, Revision, Adherence, Record, View, and BehaviorLog.
2. Export the short and full definitions from the approved content map.
3. Import the exact status definitions into homepage route copy, FAQ, About, Terms, and generated machine text.
4. Update the global description to: "Cadence records recurring behavior through explicit decisions, preserved context, longitudinal review, and portable BehaviorLog data."
5. Add one focused test that scans public copy for banned phrases, em dashes, noncanonical occurrence synonyms, inconsistent status definitions, and incorrect export lists.
6. Keep the test data-driven. Do not add a second vocabulary abstraction.

**Focused check:** `npm run test -- tests/public-content-contract.test.ts`

## Task 3: Rebuild the homepage narrative with existing product primitives

**Objective:** Make the homepage the primary explanation of the recording model and user authority.

**Files:**

- Modify: `apps/marketing/src/pages/index.astro`
- Modify: `apps/marketing/src/components/HeroVisual.astro`
- Modify: `apps/marketing/src/components/HowItWorks.astro`
- Modify: `apps/marketing/src/components/ProductCapture.astro`
- Modify: `apps/marketing/src/styles/global.css` only for styles shared by multiple pages
- Create only if real captures are needed: `apps/marketing/public/brand/cadence-ui-definition-history-capture.png`
- Create only if real captures are needed: `apps/marketing/public/brand/cadence-ui-adherence-review-capture.png`

**Steps:**

1. Replace the hero with the approved behavioral-remodeling headline, concise description, `Begin a record`, and an in-page `See how the record works` link.
2. Remove GitHub from the hero. Keep it in supporting evidence locations.
3. Replace the three-feature ledger with three equal state columns. Show the Unresolved, Completed, and Not Completed interface state above the corresponding definition.
4. Update the existing four-step walkthrough to use Behavior, Schedule, Occurrence, Decision, Context, and Record exactly.
5. Add the definition-history section. Stack the earlier and revised Title and Description values with a directional arrow.
6. Add a dedicated adherence section using the actual 7, 30, or 90 day application view. Show Unresolved separately.
7. Replace the streak critique with the positive user-authority section from the approved map.
8. Add the prepared-prompt workflow as a static prompt panel. Do not render a chatbot.
9. Reframe BehaviorLog as the source record that supports multiple views. Keep the existing example bundle and repository links.
10. End with a distinct horse-motif close before the footer. Reuse current brand art if a different crop and composition clearly reads as a new closing motif. Create no new asset unless that reuse fails design review.
11. Use existing product captures or capture sanitized demo interfaces. Do not fabricate capabilities.
12. Keep essential copy in HTML. Keep decorative horse art empty-alt. Give informative captures descriptive alt text.

**Focused checks:**

- `npm run marketing:check`
- `npm run marketing:build`
- Verify keyboard focus, reduced motion, 390px layout, and desktop layout in the local browser.

## Task 4: Convert FAQ and About into their assigned roles

**Objective:** Put detailed questions in FAQ and the full philosophy and ontology in About.

**Files:**

- Modify: `apps/marketing/src/data/faq.ts`
- Modify: `apps/marketing/src/pages/faq.astro`
- Modify: `apps/marketing/src/pages/about.astro`
- Modify: `apps/marketing/src/data/routes.ts`

**Steps:**

1. Change FAQ data from one flat array to four named groups: recording model, context and history, review and analysis, privacy and portability.
2. Give each question a stable ID for direct links.
3. Render native `<details>` and `<summary>` elements. Keep all answer text in server output.
4. Add one last-updated date and one bottom CTA. Do not insert CTAs between questions.
5. Replace About with the approved hero, behavioral-remodeling explanation, four record principles, current product scope, Cadence and BehaviorLog roles, and implementation links.
6. Render the ontology from `vocabulary.ts` as a semantic `<dl>` with two columns on wide screens and one column on small screens.
7. Remove authentication, analytics, deployment, and supply-chain detail from About. Link to Trust and Privacy instead.
8. Update the FAQ JSON-LD and Markdown generator from the grouped source.

**Focused checks:**

- `npm run marketing:check`
- Confirm every FAQ answer exists in built HTML and each fragment ID resolves.

## Task 5: Redesign Trust around the existing evidence feed

**Objective:** Present current operational evidence by scope without changing how evidence is collected or published.

**Files:**

- Modify: `components/trust/TrustEvidencePanel.tsx`
- Modify: `components/settings/LegalContent.tsx`
- Modify: `lib/services/public-trust-evidence.service.ts`
- Modify: `app/(legal)/trust/page.tsx`
- Modify: `app/design-system/page.tsx`
- Modify: `tests/public-trust-page.test.tsx`
- Modify: `tests/public-trust-route.test.ts`
- Modify: `tests/legal-content.test.tsx`

**Steps:**

1. Keep all nine existing checks and all five existing statuses.
2. Extend the normalized view only with presentation fields already present in the validated snapshot: deployment URLs, workflow URL, build time, and snapshot freshness deadline.
3. Keep the API schema additive and backward compatible. Do not change the evidence schema version.
4. Present an overall deployment summary with source commit, application deployment, marketing deployment, build time, verification time, and freshness.
5. Group existing checks under build and supply chain, public route integrity, and hosted data boundaries.
6. Render status text, timestamp, scope, limit, and immutable evidence link for every check. Do not rely on color or icons.
7. Add the actual dependency table for Vercel, Supabase, Google Auth, browser push, and optional Sequenzy email reminders.
8. Add concise static sections for data boundaries, public source and MIT license, limits of verification, and evidence links.
9. Remove broad product philosophy from Trust. Keep verification claims bounded and time-specific.
10. Update the design-system fixture and focused tests. Do not edit the collector, workflow, schema, validator, or publication scripts.

**Focused checks:**

- `npm run test -- tests/public-trust-page.test.tsx tests/public-trust-route.test.ts tests/legal-content.test.tsx`
- `npm run public-trust:check`
- `npm run design-system:check`

## Task 6: Verify provider retention and draft Privacy and Terms

**Objective:** Replace the sparse legal copy with complete, concrete policies based on verified production capabilities.

**Files:**

- Modify: `components/settings/LegalContent.tsx`
- Modify: `app/(legal)/privacy/page.tsx`
- Modify: `app/(legal)/terms/page.tsx`
- Modify: `tests/legal-content.test.tsx`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/DECISIONS.md`

**Steps:**

1. Inspect the active Vercel, Supabase, Google Auth, Sequenzy, browser-push, backup, and support-mailbox settings or documented capabilities.
2. Record only sanitized retention evidence in Operations. Never copy credentials, user data, message content, or private provider payloads.
3. Verify that routine logs can meet 30 days, incident logs can meet the 90-day exception, backups can age out within 30 days, and support messages can meet 12 months after resolution.
4. If any provider cannot meet a target, stop the publication path. Update the proposed policy only after owner and legal review of the actual capability.
5. Expand Privacy with scope, marketing-site data, account and behavior data, exports and external AI, uses, processors, retention, security, user choices, children, international access, California disclosures, changes, and contact.
6. Add simple semantic tables for processor purposes and retention periods. Extend the existing legal renderer only enough to support these tables.
7. Expand Terms with acceptance, product model, user declarations, accounts, general-purpose recordkeeping, exports, external prompts, acceptable use, source licensing, availability, suspension, disclaimers, liability, governing law, disputes, severability, changes, and contact.
8. Use the settled entity, address, email, age, jurisdiction, and dispute facts directly. Do not use placeholders.
9. State that source code uses the repository license while the hosted service, Cadence marks, site content, and user data remain governed separately.
10. State the actual effective date selected for the reviewed release.
11. Keep the privacy mailbox address in the draft, but block publication until the mailbox receives and returns one harmless route-confirmation message.

**Focused checks:**

- `npm run test -- tests/legal-content.test.tsx tests/public-content-contract.test.ts`
- `rg -n "TBD|TODO|placeholder|\[DATE\]|\[EMAIL\]|\[COMPANY\]" components/settings app/'(legal)'`

## Task 7: Align global navigation, machine outputs, and README

**Objective:** Make human pages, generated mirrors, agent files, and repository documentation say the same thing.

**Files:**

- Modify: `apps/marketing/src/layouts/BaseLayout.astro`
- Modify: `apps/marketing/src/data/site.ts`
- Modify: `apps/marketing/src/data/routes.ts`
- Modify: `apps/marketing/src/data/agent-output.ts`
- Modify: `apps/marketing/src/pages/docs.astro`
- Modify: `apps/marketing/scripts/check-agent-readability.mjs`
- Modify: `README.md`
- Modify if a stable public marker changes: `config/public-app-routes.json`
- Modify: `tests/marketing-layout.test.ts`
- Modify: `tests/marketing-agent-readability.test.ts`
- Modify: `tests/interaction-registry-labels.test.ts`
- Modify: `interaction-registry.json` if a visible interaction label or destination changes

**Steps:**

1. Keep the main header minimal: Cadence, `Begin a record`, and `Log in`.
2. Group footer links under Learn, Inspect, and Legal. Keep GitHub because the repository is public.
3. Keep Trust, Privacy, and Terms as absolute application-origin links. Do not add them to the marketing-origin route manifest.
4. Update homepage, FAQ, About, Docs, and Examples Markdown at their existing canonical source in `routes.ts`.
5. Update `llms.txt` with the ontology, analysis boundary, absolute legal and Trust links, Trust evidence route, and public Cadence repository.
6. Keep `llms-full.txt` generated from marketing routes. Clearly index legal pages as canonical HTML-only application routes.
7. Keep the marketing route manifest scoped to marketing-origin routes. Keep application legal routes in `config/public-app-routes.json` and the existing Trust route collector.
8. Update `siteConfig.lastModified` to the actual release date.
9. Rewrite only the README opening and section order needed by the content map. Preserve working setup, architecture, security, and verification instructions.
10. List implemented features exactly. Do not claim manual duration entry, automatic AI analysis, permanent free hosting, or more review capability than the app exposes.
11. Add a built-output check that every same-origin `llms.txt` link maps to a generated artifact. Keep external links for live pre-release verification.

**Focused checks:**

- `npm run interactions:check`
- `npm run marketing:check`
- `npm run marketing:build`
- `npm run test -- tests/marketing-layout.test.ts tests/marketing-agent-readability.test.ts tests/interaction-registry-labels.test.ts tests/public-content-contract.test.ts`

## Task 8: Complete design, legal, and release verification

**Objective:** Publish only after content, provider, legal, accessibility, and live-route checks agree.

**Local verification:**

1. Run `node .agents/skills/impeccable/scripts/context.mjs` before the UI edit begins.
2. Run `npm run agents:check`.
3. Run `npm run interactions:check`.
4. Run `npm run resolvers:check`.
5. Run `npm run design-system:check`.
6. Run `npm run lint`.
7. Run `npm run typecheck`.
8. Run `npm run test`.
9. Run `npm run build`.
10. Run `npm run marketing:check`.
11. Run `npm run marketing:build`.
12. Run `npm run public-trust:check`.
13. Run `git diff --check`.
14. Run the approved banned-copy and terminology searches from the content map.

**Browser verification:**

1. Start marketing on `127.0.0.1:4321` and the application on the next available port in the 4321 through 4330 pool.
2. Inspect homepage, FAQ, About, Trust, Privacy, and Terms at 390px and desktop widths.
3. Verify heading order, keyboard focus, native FAQ controls, reduced motion, status text, table overflow, image alt text, and no horizontal scrolling.
4. Verify all CTAs and footer links.
5. Verify built Markdown, `llms.txt`, `llms-full.txt`, route manifest, sitemap, and robots output against visible copy.

**Hard publication gates:**

1. A sanitized provider-retention record confirms the published retention claims.
2. `privacy@identityscaffolding.com` is created and confirmed with one harmless route test.
3. One legal review approves the final Privacy and Terms text, entity facts, retention language, disclaimers, liability language, and dispute process.
4. The approved effective date replaces the draft date.
5. Public registration remains closed until gates 1 through 4 pass.

**Production verification:**

1. Merge and deploy only after explicit owner authorization and all hard gates pass.
2. Verify every public marketing route and each canonical application legal route without authentication.
3. Dispatch the existing public Trust workflow for the new application and marketing deployments. Do not modify the pipeline.
4. Confirm that `/trust` and `/api/public/trust-evidence` show the new commit and deployments without stale Passed results.
5. Confirm that the public GitHub, MIT license, BehaviorLog, Privacy, Terms, Trust, and registration links resolve.
6. Update `STATUS.md` with the actual checks, deployment identifiers, legal review date, retention verification result, and remaining risks.

## Completion criteria

- The homepage explains the two decisions and separates Unresolved as missing determination.
- Public copy uses `occurrence` consistently and describes user decisions as declarations, not verified facts.
- Definition history, optional context, built-in adherence, external analysis, and BehaviorLog boundaries match implementation.
- FAQ, About, Trust, Privacy, Terms, machine files, and README each perform the role assigned in the content map.
- Trust presents the existing evidence feed without changing its collection pipeline.
- Privacy and Terms contain no placeholders and use the settled legal facts.
- Provider retention, the privacy mailbox, and one legal review are verified before publication or public registration.
- All repository checks, browser checks, public route checks, and post-deployment Trust checks pass.
