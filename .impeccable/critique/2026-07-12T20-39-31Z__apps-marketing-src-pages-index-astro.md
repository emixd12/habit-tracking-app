---
target: marketing homepage
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-07-12T20-39-31Z
slug: apps-marketing-src-pages-index-astro
---
# Critique: marketing homepage (apps/marketing/src/pages/index.astro)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Near-full-viewport hero leaves only a blank padding sliver of the next section visible; weak scroll cue |
| 2 | Match System / Real World | 2 | "SINGLE-PLAYER" reads as gaming; "occurrence", JSONL, SHA-256, namespaced extensions hit consumer visitors mid-homepage |
| 3 | User Control and Freedom | 3 | No traps; nav/footer always available |
| 4 | Consistency and Standards | 2 | Marketing surface contradicts the committed design system (DESIGN.md); clicking Try Cadence lands in a visually different brand |
| 5 | Error Prevention | 3 | Zip download has no size/content hint; little else at stake |
| 6 | Recognition Rather Than Recall | 3 | "Needs decision · 2" chip and product jargon require carrying definitions forward |
| 7 | Flexibility and Efficiency | 3 | Anchor jump, skip link, markdown mirrors + llms.txt; single human path |
| 8 | Aesthetic and Minimalist Design | 3 | Pill soup (5 different meanings share one chip look); decorative icons carry no meaning |
| 9 | Error Recovery | 3 | Static page; effectively n/a |
| 10 | Help and Documentation | 3 | /docs, spec, examples, trust/privacy/terms one hop away |
| **Total** | | **28/40** | **Good: solid foundation, real weak areas** |

## Anti-Patterns Verdict

**LLM assessment:** Craft is tidy (AA+ contrast everywhere, textbook reveal/reduced-motion implementation, restrained nav) but the layout grammar is assembled from the modal 2024–26 SaaS template: split hero with floating screenshot cards, uppercase mono chip eyebrow, three identical icon cards, numbered zigzag steps, dark "technical credibility" band with mono file tree and macOS traffic-light dots, centered closing CTA. Fails the second-order category-reflex test ("calm open-source dev-adjacent tracker" → mono chips + dark code band is exactly what the category predicts). Specific tells with evidence:
- Em dashes ×9 in rendered copy (banned): index.astro:21, 46, 54, 68, 86, 124, 142, 164
- Aphoristic negation cadence ≥4 blocks: "No streaks. No guilt. No lock-in." / "Silence is never failure" / "Your history is a file, not a hostage." / "An honest record starts today."
- Identical card grid (absolute ban): .principle-card ×3, icon+h3+p, same size
- Ghost-card defect (1px border + ≥16px shadow): .hero-media__screen (0 18px 40px), .principle-card:hover (0 10px 30px), .button--primary:hover (0 8px 20px)
- Mono as technical costume on a consumer-calm product: chips, step numbers, closing note (brand.md ban); code/file names are defensible
- Generic meaningless icons (circle, three lines, arrow); traffic-light window dots on the fake terminal
Done right: reveal enhances visible defaults + reduced-motion alternative; numbered steps are a genuine sequence (permitted); letter-spacing 0; H1 under 6rem ceiling; no gradient text, side-stripes, or cream body.

**Deterministic scan:** CLI detector clean on index.astro, BaseLayout.astro, and components/ (exit 0, no findings). In-browser detector (detect.js via live-server, injection succeeded): 4 findings — gpt-thin-border-wide-shadow ×2 on .hero-media__screen--timeline/--behavior (true positives, global.css ~379–388, predates the redesign), clipped-overflow-container on .hero (structurally true, no observed clipping at tested widths — but see the P1 mobile clip below where it does bite), cramped-padding on .page-section--ink (false positive: inset is margin-based via .page-section__inner, measured 39.65px).

## Overall Impression

A clean, accessible, well-plumbed page whose voice is borrowed. The one unpredictable asset (the trajectory-horse drawing) is buried behind floating screenshots while interchangeable SaaS grammar (icon cards, mono chips, terminal cosplay) gets whole sections. Biggest opportunity: make the page look like the product it sells — square, ledger-like, exact — instead of the costume every AI landing page wears, and fix the one real breakage (mobile hero clip).

## What's Working

- Contrast discipline is genuinely excellent: all measured pairs pass AA (muted body 5.23:1, primary button text 4.99:1, rust pill 4.57:1, ink muted 7.81:1).
- Reveal/motion implementation is textbook: visibility not gated on JS, reduced-motion kill switch, staggered entrance with exponential ease.
- Agent-readability is a real differentiator: canonical + markdown alternates + JSON-LD per route, llms.txt, route manifest; the "portable, inspectable" claim is structurally true of the site itself.

## Priority Issues

1. **[P1] Hero clips offscreen at ≤370px.** .hero-eyebrow{flex-wrap:nowrap} forces ~347px min-content; at 360px the third chip truncates mid-word and the primary CTA's right edge is cut by .hero{overflow:hidden} with no scrollbar. Fix: allow chip wrap, grid-template-columns:minmax(0,1fr) in the <820px hero rule. (Suggested: $impeccable adapt)
2. **[P1] Undocumented brand fork.** DESIGN.md commits to square corners, no shadows, no blur, underlined text CTAs; the marketing implementation uses 12/8/999px radii, soft shadows, backdrop-blur header, gradients, filled rounded CTA. Try Cadence lands in an app that looks like a different company. Decide deliberately: amend DESIGN.md or rebuild marketing chrome in the ledger vocabulary. (Suggested: $impeccable document + polish)
3. **[P1] Flat H1/H2 scale.** H1 54.7px vs H2 51.2px (1.07 ratio; rule ≥1.25). Every section shouts as loudly as the hero. Cap marketing H2 clamp near 2.25–2.5rem. (Suggested: $impeccable typeset)
4. **[P2] Copy pass.** Remove all 9 em dashes; break the 4-instance negation cadence; replace "a file, not a hostage" with a specific claim; keep SHA-256/namespacing depth on /standard, one plain sentence on the homepage; fix jargon for first-timers (SINGLE-PLAYER, occurrence, unexplained "Needs decision · 2"). (Suggested: $impeccable clarify)
5. **[P2] Asset hygiene.** 748KB logo PNG as favicon/og/header on every page; 536KB hero base eager+high-priority even on mobile where captures render 201px wide and illegible; 1.2MB unreferenced cadence-home-hero.png. Resize/convert, real favicon, delete dead file. (Suggested: $impeccable optimize)

## Persona Red Flags

**Jordan (first-timer):** "SINGLE-PLAYER" reads as a game mode; "occurrence" used before defined; "Needs decision · 2" counts nothing she knows about; hashes/JSONL mid-page say "this is for programmers"; header link "Cadence" while on the Cadence site reads as a broken self-link; Google-sign-in reassurance arrives only in the last line.
**Riley (stress tester):** 360px clip looks like a rendering bug (no scrollbar due to overflow:hidden); / and /cadence tell overlapping stories with no canonical "what is this"; footer llms.txt among human links dumps raw text; zip download has no size hint.
**Casey (distracted mobile):** stacked mobile header consumes 183px before content; product visual below the first screen and illegible at 312×228; ~1.3MB PNG before the hero settles on 3G; on 360px devices the primary CTA is visibly clipped.

## Minor Observations

- Accessibility plumbing above average: skip link, aria-current, section labels, aria-hidden decoratives, scroll-padding-top compensates sticky header.
- The rust "Not Completed" row is the most saturated element in the hero capture; a calm product leads with its failure-adjacent state (needs a new sanitized capture asset).
- Pill vocabulary flattens meaning: schedule preset, export format, status, count, and brand attribute all share one look.
- "Next section visible in first viewport" met in letter (102px of blank padding), not spirit.
- .hero-tertiary negative-margin rhythm hack; homepage <title> is bare "Cadence"; font weights 550/600 vs DESIGN.md all-400 experiment (part of the fork).
- Hero composites three images with % positioning vs DESIGN.md's "single exported image" description (doc drift).

## Questions to Consider

1. If the product is proudly square, flat, and underlined, why does the marketing site sell it in the rounded-shadow SaaS costume the product refuses to wear, and which surface is telling the truth about the brand?
2. Who is the homepage's second half for: the person tracking their mornings, or the agent parsing status_events.jsonl? The audience switches mid-scroll with no bridge.
3. The horse drawing is the only element no template would predict. Why is the one memorable asset hidden behind two floating screenshots while the interchangeable card grid gets a full section?
