# RC2 Status — Prompt Ledger and Live Record

**Release frame (governing):** RC2 is the Code Quality & Engineering Integrity
release — quality-led, with the 12 family journeys serving as the audit
instrument (Matthew's decision, Nov 11, 2026; amendment filed with the RC2
execution prompt pack of Nov 11, 2026). The point of the release: demonstrate,
with inspectable evidence, that AI-assisted development produces code at a
professional standard — "good code, period," not "good for AI-written."
Binding anti-trap: no aesthetic rewrites of working code; structural changes
must justify against measurable problems; before/after evidence is preserved.

**Scope authority:** the 90-area master inventory (names and system groupings
verbatim) with the pack's 12 journey families retained as the proof-journey
index only (reconciled Appendix A, Nov 11, 2026). Evidence ladder E0–E4
applies literally; fake success and E-level relabeling are banned; a sandbox
result never counts as a live-provider result.

**Frozen baseline:** RC2-A-01 — see `evidence/RC2-A-01/RESULT.md`. Starting
HEAD `d79e6d7784a001cdc1ef78b29bbcc7d953befb9d` (main, Nov 11, 2026), the
merge of PR #39; GitHub CI on that commit is green (run 43017632098).

## Prompt ledger

| Prompt      | Title                                                            | Status             | Evidence                    |
| ----------- | ---------------------------------------------------------------- | ------------------ | --------------------------- |
| RC2-A-01    | Freeze the baseline and reconcile RC1 → RC2                      | PASS               | evidence/RC2-A-01/RESULT.md |
| RC2-A-02    | Build the all-90 executable maturity ledger                      | PASS               | evidence/RC2-A-02/RESULT.md |
| RC2-A-03    | Cross-system seams, route owners, dependency map                 | NEXT — not started | —                           |
| RC2-A-04    | Two-site, multi-role, module-profile fixtures                    | not started        | —                           |
| RC2-B-01…03 | Publishing & presentation journeys                               | not started        | —                           |
| RC2-C-01…03 | Media & discovery journeys                                       | not started        | —                           |
| RC2-D-01…04 | Workflow, distribution, audience, campaign                       | not started        | —                           |
| RC2-E-01…03 | Members, community, moderation, notifications                    | not started        | —                           |
| RC2-F-01…03 | Commerce and financial integrity                                 | not started        | —                           |
| RC2-G-01…03 | Intelligence, analytics/graph, network                           | not started        | —                           |
| RC2-H-01…08 | UX proof debt, role proof, cleanup, jobs, performance, lifecycle | not started        | —                           |
| RC2-I-01…03 | Family matrix, repair reconciliation, exit decision              | not started        | —                           |

## Carryover into RC2 (from RC1 and the GUI overhaul — all named, none hidden)

1. GUI exit report conditions 3–6 still open (condition 1 closed by GUI-05,
   condition 2 closed by GUI-06D): interactive two-site/role proof → A-04 +
   H-02; accessibility depth (zoom, focus trap/return, screen reader,
   measured contrast, aria-current) → H-01; editor focus mode → H-01;
   editor after-state captures at 375/768 + dark → H-01.
2. GUI-05B/05C/05D named debts: redirects no-match capture with seeded rules;
   live rendered-quality audit run on real published content; populated
   review queue — all fixture-dependent, land with A-04.
3. Spaces/profiles structural merge (spaces duplicate profiles; spaces are
   operator-created only) — RC2 structural item; the auto-space-on-signup vs
   opt-in decision is still Matthew's, still open.
4. Article-level SEO live test (explicit vs derived title/description on real
   posts + staff discovery audit run) — filed, runs in C-03.
5. Editor extras decision (Lexical tables / code block / text color) —
   inventoried; code block and tables recommended ON by Harbor; text color
   is Matthew's deliberate call. Not enabled; not RC2-blocking.
6. Inert file on main: `WritingCanvasField.tsx` (unreferenced since the
   NEW-02 fix) — deletion needs the owner via the GitHub web UI or a future
   local-push path; cosmetic, tracked here so it is not forgotten.
7. License mismatch: `LICENSE` says GPL-3.0; README and package.json say
   AGPL-3.0-or-later. Owner decision pending (Harbor recommended AGPL-3.0);
   quiet item, not RC2-blocking.

## Rules reminders for every RC2 pass

- One prompt, one bounded assignment, then stop; hand off the next prompt ID.
- Any open P0 (auth/tenant/secret/money/data-loss/can't-publish) vetoes the
  release until repaired and reverified.
- A family journey short of E2 is a _finding_ (root-caused into the seam/debt
  registers), not an RC2 veto — it becomes a named, ranked RC3 item. A
  concealed shortfall _is_ a veto.
- Never delete, disable, or stub an intended feature to make a test pass.
- Historical failure evidence is never overwritten; this file only appends.
