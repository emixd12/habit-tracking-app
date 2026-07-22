# Spacing Inventory — current state, measured

> **Resolution (2026-07-18):** the open decisions were settled — (a) row
> density tiers 8/12/16 kept as named tiers; (b) Timeline's promoted day
> headers stay as they are; (c) legal pages follow the same ladder one step
> airier; (d) heading sizes normalized to the ladder (page 3xl/4xl → super
> 2xl → section xl). The resulting system is codified in DESIGN.md
> ("The Spacing Scale" and "The Heading Ladder") and implemented; this file
> remains as the historical audit.

Status: **inventory only, no changes made.** Measured live at desktop width
(1280px viewport, lg breakpoint) on 2026-07-17, cross-referenced against the
class values in code. Mobile values from classes are noted where they differ.

## 1. The target model (the rule we are auditing against)

1. **Parallel equality.** Objects at the same hierarchy level are separated by
   identical spacing, everywhere they appear.
2. **Descending scale.** The gap between a level-1 object and a level-2 object
   is the largest; level-2↔level-3 is smaller; and so on down. Spacing alone
   should tell you how related two things are.

Hierarchy levels as they apply to this app:

| Level | Object class | Examples |
|---|---|---|
| L0 | App frame | page gutters, banner, sidebar offset |
| L1 | Page-level blocks | page header (title + rule), the section stack |
| L2 | Sections | Settings sections, Timeline day groups, Export super-sections |
| L3 | Section heading ↔ its content; sub-blocks | h2 → form, fieldsets, subsections |
| L4 | Items within a block | form controls, ledger rows, occurrence rows |
| L5 | Intra-item | label ↔ value, icon ↔ text |

Complication to resolve when we act: **Export has one more tier than the other
pages** (page → super-section (Export/Import) → subsection (Options/Downloads)
→ items), so its L2/L3 map one level deeper.

## 2. Current scale actually in use

Distinct vertical-spacing values found in product code (excluding scroll-mt):

`4 (gap-1) · 8 (gap-2, mt-2, mb-2, py-2) · 12 (gap-3, mt-3, py-3, pt-3, p-3) ·
16 (gap-4, mt-4, py-4, pt-4, pb-4, p-4) · 20 (gap-5, mt-5, py-5, pt-5, p-5) ·
24 (gap-6, py-6, pb-6, p-6) · 32 (gap-8, py-8, pb-8) · 36 (mb-9) ·
40 (py-10) · 48 (gap-12, py-12) · 56 (gap-14) · 96/128 (pb-24/pb-32, functional
clearance)`

Thirteen steps, with the 16–56 band carrying six of them. The lower band
(4/8/12) is clean and consistently used; the upper band is where the wobble is.

## 3. App frame (shared shell)

| Relationship | Class | Desktop px | Mobile px |
|---|---|---|---|
| Viewport → banner | `pt-1` | 4 | 4 |
| Page side gutters | `px-4 sm:px-6 lg:px-10` | 40 | 16 |
| Container top/bottom padding | `py-6 lg:py-10` | 40 | 24 |
| Container top → H1 top (measured) | — | **40** | 24 |
| H1 bottom → header rule | `pb-6` | **25** (24+1) | 25 |
| Header rule → next page block | `gap-8` on stack | **32** | 32 |
| Page title → description (when present) | `mt-3` | 12 | 12 |
| Page-level siblings (header, content blocks) | `gap-8` | 32 | 32 |

The flagged issue, quantified: the title sits 25px above its rule but the rule
sits 32px (Behaviors/Export) to **56px** (Settings: 32 + the section's own
24px top padding) above what follows, while the page's outer margins are 40px.
Three unrelated values (25 / 32–56 / 40) govern the same visual neighborhood.

## 4. Settings (measured)

| Relationship | Level | Class | Desktop px |
|---|---|---|---|
| Header rule → first section h2 | L1→L2 | `gap-8` + section `pt-6` | **56** |
| Section ↔ section (last content → next h2) | L2↔L2 | `py-5 sm:py-6` ×2 + 1px rule | **49** (24+1+24), rule centered ✓ |
| h2 → content (Profile, Timezone, Notifications, Delete) | L3 | `mt-4` | **16** ✓ consistent |
| h2 → content (Trust and legal) | L3 | description `mt-3` | **12** ✗ breaks the 16 |
| Form control ↔ control | L4 | `gap-3` | 12 ✓ |
| Deletion copy paragraph ↔ paragraph | L4 | `gap-3` | 12 ✓ |
| Profile dl rows | L4 | `gap-2` | 8 |
| Legal ledger row padding | L4 | `py-3` | 12 top+bottom per row |
| Label → value (dt→dd, title→summary) | L5 | line-height / `gap-1` | 0–4 ✓ |

Settings-internal verdict: L4/L5 clean; one L3 deviation (Trust and legal);
the L1→L2 gap (56) vs L2↔L2 (49) barely differentiates — 7px apart, reads as
"roughly equal" rather than as a deliberate step.

## 5. Timeline (measured)

| Relationship | Level | Class | Desktop px |
|---|---|---|---|
| Banner → first day header | L0→L2 | feed `pt` + day `sm:py-3` | **28** |
| Day group ↔ day group (visible: last row → next date) | L2↔L2 | `gap-5` + `py-3`×2 | **48** (12+20+12 + header offset) |
| Day header → its divider | — | `pb-3` | 12 |
| Day divider → first row | L3 | rows container `mt-3` | 12 (measured 39 to row title incl. row padding) |
| Row ↔ row | L4 | `gap-1` + row `py-2`/`py-1.5` | uniform **52px pitch** ✓ |
| Feed bottom clearance (fixed button) | — | `pb-32 sm:pb-24` | 96 | 
| Needs decision modal panel padding | — | `p-5`/`p-4`/`p-3` mixed | 20/16/12 |
| Modal day sections | L2 | `gap-5` | 20 (mirrors feed ✓) |
| Empty-day message inset | — | `p-3`, `mt-3` | 12 |

Timeline-internal verdict: very consistent. Its L2↔L2 (48) happens to nearly
match Settings' 49 — good outcome, but achieved through a different mechanism
(flex gap + small paddings vs. large paddings + divide-y), so the equality is
accidental, not systematic.

Note: Timeline has no page header; the day headers are the page's top tier, so
its L2 is visually promoted. The 28px banner→first-date gap is the smallest
"top of page" value anywhere in the app (Settings/Behaviors/Export: 40).

## 6. Behaviors (measured)

| Relationship | Level | Class | Desktop px |
|---|---|---|---|
| Header rule → Create behavior summary | L1→L2 | `gap-8` | **32** |
| Create section → review section | L2↔L2 | `gap-8` + **`mb-9`** | **68** ✗ one-off `mb-9` (36) stacks on the 32 |
| Create summary tap row | — | `py-4` | 16 |
| Create form wrapper | L3 | `py-5 pl-4` | 20 / 16 left inset (unique) |
| Create success message | — | `border-t pt-3 mb-4` | 12 ✗ carries its own divider — the pattern we removed from Settings inline results |
| Active behaviors h2 → first row | L3 | `pt-4` + row padding | **49** |
| Behavior row ↔ row (details summary → next title) | L4 | divide rows | uniform **21** ✓ |
| Row internals (adherence stats, counts) | L4/L5 | `gap-2`, `mt-2`, `py-2` | 8 |
| Day-review expansion | L4 | `p-1`…`pt-2` | 4–8 |
| BehaviorForm fieldset ↔ fieldset | L3 | `gap-6` | **24** |
| Schedule legend → fields | L3 | `mb-2` | 8 |
| Field grid gaps | L4 | mixed `gap-4` / `gap-3` / `gap-2` | 16/12/8 ✗ three values for sibling fields |
| Label → control | L5 | `gap-1` | 4 ✓ |

Behaviors-internal verdict: the `mb-9` is the single biggest unexplained
outlier in the app (68px between page-level siblings that are 32px apart
everywhere else). BehaviorForm mixes three gap values for parallel field
relationships.

## 7. Export (measured)

| Relationship | Level | Class | Desktop px |
|---|---|---|---|
| Header rule → Export h2 | L1→L2 | `gap-8` | **32** |
| Super-section ↔ super-section (Export ↔ Import) | L2↔L2 | `gap-12 sm:gap-14` | **56** |
| Super-header: h2 → description | L5 | `mt-2` | 8 ✗ (ScreenFrame uses 12 for the same relationship) |
| Super-header rule | — | `pb-4` | 16 (page header uses 24 — a coherent step down ✓) |
| Subsection ↔ subsection (Options/Downloads/AI) | L3↔L3 | `gap-8` | **32** ✗ identical to the L1→L2 value — no differentiation |
| Options h3 → form | L4 boundary | `mt-5` | **20** ✗ (Settings uses 16, forms use 24 for the parallel move) |
| Form rows | L4 | `gap-5`, `gap-3`, `gap-2` | 20/12/8 |
| Download row padding | L4 | `py-4` | 16 (Settings ledger rows: 12) |
| Import/restore internals | L4/L5 | `gap-3`/`gap-2`/`mt-1`/`mt-2` | 12/8/4/8 |

Export-internal verdict: the extra tier is real, but its spacing doesn't
encode it: super→sub (32) = page→super (32), so the crescendo flattens exactly
where the extra hierarchy needed it most. Also `h2` here is `text-3xl` — the
same size as the page title at small widths — so type scale and spacing both
under-differentiate this page's hierarchy.

## 8. Legal pages (/terms /privacy /trust — own shell)

| Relationship | Class | px |
|---|---|---|
| Container padding | `py-8 lg:py-12` | 48 desktop / 32 mobile ✗ (app: 40/24) |
| Nav rule | `pb-4` | 16 |
| Nav → h1 | `mt-3` | 12 |
| Header rule | `pb-8` | 32 ✗ (app page header: 24) |
| h1 → description | `mt-4` | 16 ✗ (app: 12) |
| Section ↔ section | `gap-8` + `pb-8` rules | 32+32 |
| Section h2 → content | `mt-4` | 16 ✓ matches Settings |
| Paragraph ↔ paragraph | `gap-3` | 12 ✓ |

Verdict: a third rhythm family. Public pages may legitimately breathe more,
but currently every header value differs from the app shell by one step in an
unpatterned way (48 vs 40, 32 vs 24, 16 vs 12).

## 9. First-run popup & dialogs

| Relationship | Class | px |
|---|---|---|
| Popup panel padding | `p-6` / `p-4` | 24/16 |
| Setup rows | `py-3` / `py-2` | 12/8 |
| Row internals | `gap-3`, `gap-1`, `mt-1/2` | 12/4/4-8 |
| Needs decision dialog panel | `p-5` desktop / `p-4` / `p-3` | 20/16/12 ✗ three panel-padding values across overlays |

## 10. Findings — Rule A violations (parallel objects, unequal spacing)

Ranked by visibility:

1. **Create-section outlier (Behaviors):** page-level siblings are 32px apart
   everywhere; the create section adds `mb-9` → 68px. No hierarchy reading
   explains 2.1× the standard gap.
2. **"Heading → its content" has four values:** 12 (Trust and legal), 16
   (Settings sections, legal pages), 20 (Export Options), 24 (BehaviorForm
   fieldsets). This is the single most-repeated relationship in the app.
3. **"Title → description" has three values:** 8 (Export super-header), 12
   (ScreenFrame page header), 16 (legal pages h1).
4. **Ledger/row paddings differ per surface:** 8 (timeline rows), 12 (settings
   legal rows, popup rows), 16 (export download rows, create summary). Some of
   this may be deliberate density (timeline is a dense feed); it should be a
   decision, not an accident — pick named densities.
5. **Overlay panel padding:** 12/16/20/24 all in use across the needs-decision
   dialog and first-run popup.
6. **Sibling form fields (BehaviorForm):** `gap-2`/`gap-3`/`gap-4` mixed for
   parallel field relationships within one form.
7. **Legacy divider-message pattern:** BehaviorCreateSection's success message
   still uses `border-t pt-3` (the pattern removed from Settings inline
   results under the One-Line-Per-Boundary rule).
8. **Legal-pages shell** shifts every header value one step from the app shell
   (48/32/16 vs 40/24/12) without a stated reason.

## 11. Findings — Rule B violations (the crescendo flattens or inverts)

1. **Export flattening:** page→super-section = 32 and super→subsection = 32.
   The page with the deepest hierarchy has zero spacing differentiation
   between its top two boundaries.
2. **Settings near-flattening:** L1→L2 = 56 vs L2↔L2 = 49. A 7px difference
   reads as noise, not as a step. (Elsewhere L1→L2 is 32, i.e. *smaller* than
   L2↔L2 49 — a true inversion, produced by the section paddings stacking
   onto the shared `gap-8` only where sections have their own `py`.)
3. **Header asymmetry (the originally flagged issue):** title→rule 25px vs
   rule→content 32–56px vs page margin 40px. The rule visually belongs to the
   title but floats between two unrelated distances; nothing in the 25/32/40/
   49/56 cluster is a clean multiple of anything else.
4. **Mechanism incoherence (root cause):** same-level gaps are composed
   differently per page — flex `gap` on a stack (Timeline, Export), section
   `py` + `divide-y` (Settings), margins on one component (Behaviors
   `mb-9`). Where equal spacing exists (48≈49), it's coincidence. Rule A can
   only hold durably if each level's gap comes from one mechanism owned at
   one place.
5. **What already works (keep):** the L4/L5 descent is clean and universal —
   12 (form/control gaps) → 8 (tight lists/stats) → 4 (label↔value). The
   Timeline row pitch (52px, uniform) and Settings section rhythm (49px,
   uniform) show per-surface discipline; the problem is cross-surface.

## 12. Appendix — candidate unified scale (proposal only, not applied)

One possible target, using a strict 2-step-per-level descent on the existing
Tailwind steps; listed to seed the next discussion, not as a decision:

| Boundary | Value | Mechanism (single owner) |
|---|---|---|
| Page top/bottom & gutters (lg) | 40 | ScreenFrame container |
| L1↔L2 (header rule ↔ sections; page-level siblings) | 48 | one `gap-12` stack in ScreenFrame; sections lose their own top/bottom padding |
| L2↔L2 (section ↔ section) | 32 | `gap-8` (divider drawn via the stack, centered) |
| L3 (heading → content; sub-block ↔ sub-block) | 16 | `mt-4` everywhere; Export subsections `gap-6/24` as the in-between tier |
| L4 (item ↔ item) | 12 | `gap-3` |
| L4 tight (stats, dl rows) | 8 | `gap-2` |
| L5 (label ↔ value) | 4 | `gap-1` |
| Title → its rule = rule → next block? | symmetric 24/24 or stepped 16/32 | decide once, apply to page header, Export super-headers, legal pages |

Open decisions the scale forces: (a) whether row density tiers (8/12/16) are
kept as named variants or unified; (b) whether Timeline's promoted day headers
adopt L2 or L1 spacing; (c) whether legal pages share the app scale or get a
documented "public, airier" multiplier; (d) Export's heading sizes alongside
its spacing (text-3xl super-headers vs the page title).
