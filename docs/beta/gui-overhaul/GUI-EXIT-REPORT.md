# Beta GUI Overhaul — Exit Report (GUI-08E)

**Classification: CONDITIONAL GO** for the internal RC1 baseline.
Per the pack's own rule, a GUI GO is not a product RC1 claim — and
RC1's formal READY (Pass 18, Nov 7) already stands on its own
record; this report governs the visual overhaul only.

## What is proven

- **The editor works end to end.** NEW-02 (the P0 that silently
  removed the body field from every post form) is found, fixed and
  journey-proven: create → site prefilled → type → save → autosave
  → reload round-trip → history, zero page errors (GUI-04E, build
  `e17542b`).
- **The regression gate is green on the final tree:** typecheck,
  unit 2,104/2,104, integration 317/317, production build clean
  (GUI-08D).
- **Design system exists and is enforced by convention:** semantic
  admin tokens (02A), shared primitives (02B), binding form
  patterns (02C), a live showcase + report-only style checker (02D).
- **Shell and context are coherent:** route-ownership map (03A),
  task-first navigation (03B), truthful site switching in both
  switchers (03C/06C), zero-overflow shell captures (03D).
- **Named defects fixed along the way:** NEW-01 media module-off
  banner (06A), silent media fetch failures (06A), builder return
  path + preview label (06B), DISC codes in headings (07A),
  EmailComposer's hardcoded production host (07C), RevisionHistory
  breadcrumb (04D), stale-preview truthfulness (04B).

## Why CONDITIONAL, not GO

1. **GUI-05A–D (dashboard/lists/command centers) not yet run** —
   assigned to Codex (job files issued Nov 10); Harbor verifies on
   return.
2. **GUI-06D creative-tools acceptance** needs seeded media/layout
   fixtures — entry condition recorded, not yet run.
3. **Interactive authorization matrix + two-site proof** (08C)
   needs an expanded fixture (second site, lesser-role users). The
   server-side tenant boundary is integration-proven; the
   interactive UI proof is honestly outstanding.
4. **Accessibility depth** (08B): 200% zoom, focus trap/return,
   screen-reader pass, measured contrast, nav aria-current — all
   explicitly NOT VERIFIED, with owners named.
5. **Editor focus mode** (from 04C) not implemented.
6. **After-state captures** for editor at 375/768px and dark theme
   ride the next capture cycle (before-state exists; the desktop
   after-state is journey-proven).

## Defect register state

P0s: UX-01/02/03 addressed by 04/03 families; NEW-01, NEW-02
CLOSED. Remaining P1/P2 items carry owners in
`docs/beta/gui-overhaul/defect-register.md`.

## RC1 readiness boundary

The GUI overhaul's critical path (write → save → publish) is
proven. The conditions above are completeness and depth items,
none of which blocks internal-baseline use; they DO block calling
the overhaul "complete," and they transfer as the opening backlog
for the RC2 quality pass — where NEW-02's lesson (presentation for
built-in fields belongs in CSS; verify by doing, not by looking)
belongs in the engineering-integrity register.

**Next:** Codex returns GUI-05 → verification → GUI-06D fixtures →
08B/08C fixture expansion → re-classify.
