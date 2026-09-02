# Phase A — Checklist Board (coordinator-owned)

**Bound to base commit:** `ae0d121652d4e6507a327f68c029c0512588bcdd` (`main`).

> **Editing rule:** Only the coordinator edits this file, and only during reconciliation.
> Implementation cards MUST NOT edit this checklist; they write their own `evidence/A-XX.md`.
>
> **Allowed statuses (only these five):** `NOT STARTED`, `IN PROGRESS`, `BLOCKED`,
> `FAILED`, `VERIFIED`.
> All cards start `NOT STARTED`. Nothing is `VERIFIED` at A-00 — capability readiness is
> never declared from documentation; only reproduced evidence promotes a card to `VERIFIED`.

## Status board

| ID | Card | Status | Depends on | Branch | Parallel group | Merge state | Evidence file | Remediation |
|---|---|---|---|---|---|---|---|---|
| A-01 | Clean install, setup, and first login | NOT STARTED | A-00 (merged) | `phase-a/a01-install-login` | Group 0 (with A-09 only) | Not merged | `evidence/A-01.md` | `remediation/A-01-*.md` (as needed) |
| A-02 | Real media library workflow | NOT STARTED | A-09 (merged) | `phase-a/a02-media-workflow` | Group 1 (with A-03/A-04) | Not merged | `evidence/A-02.md` | `remediation/A-02-*.md` |
| A-03 | Normal page/post authoring & rendering | NOT STARTED | A-09 (merged) | `phase-a/a03-author-render` | Group 1 (with A-02/A-04) | Not merged | `evidence/A-03.md` | `remediation/A-03-*.md` |
| A-04 | Menu management & site chrome | NOT STARTED | A-09 (merged) | `phase-a/a04-navigation-chrome` | Group 1 (with A-02/A-03) | Not merged | `evidence/A-04.md` | `remediation/A-04-*.md` |
| A-05 | Search, redirects, and 404 behavior | NOT STARTED | A-03 body/URL contract frozen | `phase-a/a05-discovery` | Group 1 (after A-03 freeze) | Not merged | `evidence/A-05.md` | `remediation/A-05-*.md` |
| A-06 | SEO correctness engine & crawler proof | NOT STARTED | A-02, A-03, A-04, A-05 reconciled (Checkpoint 1) | `phase-a/a06-seo-crawlers` | Group 2 (with A-08) | Not merged | `evidence/A-06.md` | `remediation/A-06-*.md` |
| A-07 | Publisher-first admin UX | NOT STARTED | A-02…A-06 merged | `phase-a/a07-publisher-admin` | Serial (alone) | Not merged | `evidence/A-07.md` | `remediation/A-07-*.md` |
| A-08 | Backup/export/import & restored-site proof | NOT STARTED | A-02, A-03 merged (Checkpoint 1) | `phase-a/a08-backup-restore` | Group 2 (with A-06) | Not merged | `evidence/A-08.md` | `remediation/A-08-*.md` |
| A-09 | Draft/private/admin access hardening | NOT STARTED | A-00 (merged) | `phase-a/a09-access-hardening` | Group 0 (with A-01 only) | Not merged — **merge first** | `evidence/A-09.md` | `remediation/A-09-*.md` |
| A-10 | Final Phase A proof gate | NOT STARTED | A-01…A-09 merged | `phase-a/a10-proof-gate` | Serial (alone, clean clone) | Not merged | `evidence/A-10.md` | `remediation/A-10-*.md` |

## Dependency / parallel summary

- **A-00** runs first and alone; merge before any implementation card begins.
- **Group 0:** A-09 + A-01 only, after A-00 merges. **Merge A-09 first**, then rebase/merge A-01.
- **Group 1:** A-02 + A-03 + A-04 in separate worktrees after A-09 merges. **A-05 starts only
  after A-03 freezes the page/post body + URL contract** (recorded in `evidence/A-03.md`).
- **Group 2:** A-06 + A-08, after Reconciliation Checkpoint 1 (A-02→A-03→A-04→A-05 merged).
- **A-07** runs alone after A-02…A-06 are merged.
- **A-10** runs alone from a clean clone after A-01…A-09 are merged.

## Merge checkpoints (see SHARED_CONTRACTS.md §Merge checkpoints)

1. **Group 0 checkpoint:** A-09 then A-01.
2. **Reconciliation Checkpoint 1:** A-02 → A-03 → A-04 → A-05.
3. **Group 2 checkpoint:** A-06 → A-08.
4. **A-07 checkpoint:** A-07 alone.
5. **Release-candidate reconciliation:** all migrations, generated types/import map,
   contracts, docs/evidence/checklist, full static gates + full PostgreSQL integration +
   build + Phase A browser suite.
6. **A-10:** alone from a clean clone at the release-candidate commit.

## Status legend

| Status | Meaning |
|---|---|
| `NOT STARTED` | No work begun on this card. |
| `IN PROGRESS` | An agent is actively implementing on the card branch. |
| `BLOCKED` | Cannot proceed — unmet dependency, unavailable infra, or contract conflict (link the remediation file). |
| `FAILED` | A required gate or definition-of-done boundary failed and is recorded in the card's evidence file. |
| `VERIFIED` | Definition of done met and **independently reproduced**; evidence file complete. |
