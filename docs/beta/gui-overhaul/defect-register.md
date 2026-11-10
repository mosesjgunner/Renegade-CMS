# GUI defect register — GUI-01C

Severity-ranked register reconciling the GUI-01A audit (UX-01…UX-10),
Matthew's hands-on fix list (Nov 8, 2026), and the GUI-01B authenticated
baseline captures (`docs/beta/evidence/GUI-01B-pack/`). Every entry has an
owning prompt with a reproducible acceptance check. Docs only; no product
code changed by this prompt.

Status key: OPEN (not yet addressed) / IN PROGRESS / PARTIAL (part landed,
acceptance still open) / RESOLVED (acceptance met) .

## P0 — blocks everyday work or trust

| ID | Defect | Route / surface | Evidence | Owner prompt | Acceptance check | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Editor is a database form: 76 top-level fields across six tabs; admin fields precede headline/body | /admin/collections/content/create, /:id | Audit §4; 01B before-captures (create-article-desktop.png: tabbed layout, headline top ≈777px, 13px font, no sidebar) | GUI-04A (+04C) | New Article shows headline + body first at 375/768/1280+; all 76 fields still reachable; title/body round-trip persists | PARTIAL — 04A merged (PR #31, main 8b68f1c); post-merge capture + geometry still open under 04E |
| UX-02 | Save / Preview / Publish / Schedule / History are scattered across panels, tabs, list rows and separate views | Content editor + list | Audit §4 | GUI-04B | One action location in the editor presents existing Save, saved-Preview, status transition, schedule and history entry with truthful saved-vs-live labels; no contract changes | OPEN |
| UX-03 | Site context is not authoritative in the UI: SiteSwitcher ignores the POST result (optimistic), MediaLibrary falls back to first active site, NavigationCenter has its own selector | Global admin chrome; /admin/media-library | Audit §3/§4 (source-confirmed; a UX/context risk, NOT evidence protected writes bypass server policy) | GUI-03C | Switch failure shows error and keeps old context; no first-active-site fallback; two-site + denied-role captures | OPEN |

## P1 — coherence, honesty of states, consistency

| ID | Defect | Route / surface | Evidence | Owner prompt | Acceptance check | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-04 | No consistent task navigation: flat injected links + Payload groups; duplicate conceptual destinations | Global admin | Audit §3 | GUI-03A/03B | One task taxonomy with active state and breadcrumbs; every link resolves to a mounted, authorized destination | OPEN |
| UX-05 | Dual route ownership (frontend vs Payload trees) gives inconsistent shell/fonts/returns | Overlapping admin routes | Audit §3/§5 | GUI-03A | Route-ownership table resolved; each verified route renders in the one operator shell | OPEN |
| UX-06 | Operations dominate everyday screens (command centers first, task content second) | Media, Audience, Workflow, Release centers | Audit §5; 01B media-library-desktop.png corroborates (telemetry/governance lead, library below) | GUI-05/06/07 family passes | Task list/content leads; operations behind contextual detail | OPEN |
| UX-07 | Styling varies by subsystem: hardcoded colors (SiteSwitcher slate, DiscoveryPanel red/green), inline styles, no shared admin tokens | Cross-admin | Audit §5; 01B media-library-desktop.png (raw unstyled controls under a styled header) | GUI-02A–02D | Semantic admin tokens adopted; both themes verified; contrast measured before any compliance claim | OPEN |
| UX-08 | Silent failure states: fetch catches return silently (MediaLibraryClient detail, SiteSwitcher GET); DiscoveryPanel error replaces the panel | Media library, switcher, editor panel | Audit §5 (race behavior NOT VERIFIED) | GUI-02C | Loading / empty / no-matches / denied / stale / error+retry states rendered distinctly on the affected surfaces | OPEN |
| UX-09 | Inconsistent dialogs/confirmations and keyboard experience (custom modals, native confirm, dense tables) | Image editor, RevisionHistory, command tables | Audit §5 | GUI-02C / GUI-08C | Shared confirmation chrome; focus trap/return verified; no WCAG claim without measurement | OPEN |
| NEW-01 | Media Command Center shows a raw internal error banner on a fresh install: "The collection with slug media-jobs can't be found. Find Operation." | /admin/media-library | 01B capture media-library-desktop.png (visually confirmed) | GUI-06A (media workspace) — triage whether it is a registration gap or an error-presentation defect | Fresh-install media library renders without internal error text; missing optional collections degrade to a plain-language empty state | OPEN |

## P2 — polish and vocabulary

| ID | Defect | Route / surface | Evidence | Owner prompt | Acceptance check | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-10 | Wrong return context + internal vocabulary: RevisionHistory breadcrumb always links Posts; "DISC-05"-style codes and "cryptographic"/"immutable" labels in headings | Revision history; quality/migration centers | Audit §3 | GUI-04D (breadcrumb) / family passes (labels) | Breadcrumb returns to the record's own type; headings use task language; codes move behind Details | OPEN |
| FIX-01 | Cookie-consent popup "keeps breaking" on the public site (owner report; exact breakage unpinned) | Public frontend | Hands-on fix list item 1 (post-rc1-fix-list-2026-11-08.md) | Separate functional fix — NOT a GUI pack prompt | Consent is OFF by default, enabled only on purpose (owner directive, EU-compliance opt-in); popup no longer renders unless enabled | PARTIAL — owner removed the ConsentManager mount from the public layout (93bb8aa), so nothing renders today; the default-off invariant still governs any reintroduction |

## Route collisions / ownership flags

- Dual registrations (frontend tree vs Payload tree) for operator surfaces
  are the root of UX-05; GUI-03A must publish the ownership table before
  any shell work moves components.
- Unmounted components confirmed by the audit — `CalendarCenter`,
  `ScheduleHealthCenter`, `PodMappingCenter`: registered in source, not
  mounted. They must not appear as navigation destinations (UX-04 check).

## UX acceptance measures (apply to every later prompt)

- **Body prominence:** on editor create/edit, the headline is the first
  editable control and the Lexical canvas is visible without scrolling past
  administrative fields (probe: headline top and canvas height recorded in
  the prompt's captures.json).
- **Visible task actions:** the screen's primary task action is visible in
  the first viewport at 375/768/1280+.
- **Navigation clarity:** current location is indicated; breadcrumb/return
  lands on the correct record type.
- **Correct site identity:** the site shown is the site persisted; a failed
  switch never displays as success.
- **Mobile integrity:** zero horizontal overflow at 375px on captured
  screens; failures are defects, not cosmetics.
- **Truthful states:** loading, saved/unsaved, empty, no-matches, denied,
  stale, and error/retry states are visually distinct and never fabricated.

## Not visually verifiable yet (NOT VERIFIED)

- SEO saved-preview flow, scheduling dialog, revision history, media
  picker modal — no authenticated captures exist (01B set covered the core
  surfaces). Candidates for a GUI-01B-R1 top-up before their owner prompts.
- The ~100 native collection screens in the audit's Appendix A register:
  source-inventoried only.
- Race/stale behavior behind UX-08; contrast ratios behind UX-07 — both
  need measurement, not assertion.

**Exact next prompt: GUI-02A.**
