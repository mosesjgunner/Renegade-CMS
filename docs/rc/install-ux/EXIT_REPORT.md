# RC3-UX-INSTALL-01 — Exit report

## Remainder-pass addendum (Stages 1–9, branch `ux-install-remainder`, 2026-11-20)

The report below documents the PR #100 candidate (`fe1d296`). The
UX-INSTALL remainder pass — commissioned as the continuation of this
work — has since run on branch `ux-install-remainder` (Stages 1, 3, 4,
5, 6, 7, 9; Stage 2 had already shipped as PR #106 and Stage 8 is the
blocked human study, UXI-14). This addendum supersedes the candidate
line above and the per-gate table below for current status. The
original text is preserved unchanged as the PR #100 record.

What the remainder added, in one paragraph per area: a complete
operator-surface inventory with a shared task-readiness service and
server-side setup drafts that cannot silently overwrite (Stage 1);
HTTPS diagnosis with exact corrective records and a fragment claim
handoff (Stage 3); guided setup that resolves the authorized site
server-side, an explicit site-visibility policy enforced at render,
starter provenance with impact previews (Stage 4); a forms kit whose
"Saved" state is unreachable before server acknowledgement, adopted on
the everyday surfaces, with the email and social walks completed to
their provider boundaries (Stage 5); guided health, honestly-labelled
backup coverage, verified-restore and preflighted-update surfaces
(Stage 6); an axe-core accessibility audit of the public core journeys
with all serious findings fixed and re-verified at zero violations,
and the executable remainder of the failure matrix (Stage 7); and
this full-surface re-audit with per-defect dispositions (Stage 9).

### Per-gate verdicts for the whole pass (PR #100 + remainder)

| Gate                                                            | Verdict                                              | Basis                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install engineering (installer behavior, reruns, prebuilt path) | **PASS** (harness-proven) / Docker proof **BLOCKED** | PR #100 harness 12/12 + Stage 3 harness 19/19; no Docker daemon in this environment                                                                                                                                                                                                                                                                                                                  |
| Browser setup & resume                                          | **PASS**                                             | PR #100 integration + live journey; Stage 4 guided-setup rework with first-complete-proof journey test 2/2                                                                                                                                                                                                                                                                                           |
| Owner recovery                                                  | **PASS**                                             | PR #100 rotation proof; Stage 6 guided restore verification                                                                                                                                                                                                                                                                                                                                          |
| Status honesty                                                  | **PASS**                                             | Live readiness everywhere; Stage 5 composer de-fabrication; Stage 6 backup-coverage labelling derived from actual capture                                                                                                                                                                                                                                                                            |
| Public HTTPS / claim                                            | **BLOCKED**                                          | No domain/host authority in this environment; diagnosis + claim handoff proven at fixture/harness level only (Stage 3)                                                                                                                                                                                                                                                                               |
| Everyday core workflows                                         | **PASS** with two provider-boundary PARTIALs         | Stage 5 journey walks (publishing, pages/design, media, navigation, community, commerce test-mode, staff, import/export); audience/email PARTIAL — loop complete to the provider boundary, live leg BLOCKED on the owner's held email research (nothing built or faked at that boundary); social PARTIAL — verified to the provider boundary on fixtures, live leg BLOCKED on real provider accounts |
| Surface coverage (UXI-15)                                       | **PASS** for audit + dispositions                    | Stage 1 inventory (69 surfaces + 24 API groups); Stage 9 live crawl 29/29; UXI-D10–D17 closed or carried with named dispositions in the matrix addendum                                                                                                                                                                                                                                              |
| Accessibility (UXI-12)                                          | **PASS** (automated scope)                           | axe-core audit on the production build: zero violations at any impact on 10 core pages; keyboard focus, reflow, target-size checks green. Screen-reader passes, dark-mode contrast, and admin-surface audit **UNVERIFIED** — named, not claimed                                                                                                                                                      |
| Failure resilience (UXI-13)                                     | **PARTIAL**                                          | Wrong-site/crafted-ID, mid-migration interruption (SIGKILL proxy), stale-tab, and validation-error rows PROVEN; Docker and public-host rows **BLOCKED** (no daemon, no host)                                                                                                                                                                                                                         |
| Maintenance / recovery (operator)                               | **PASS** for in-product paths                        | Stage 6 guided surfaces; real off-host restore and real upgrade execution **UNVERIFIED** (fixture-level proof; live flows remain the isolated CLI commands by design)                                                                                                                                                                                                                                |
| Human usability (UXI-14)                                        | **BLOCKED**                                          | No participants — recruitment is the owner's; kit prepared; zero participant claims made                                                                                                                                                                                                                                                                                                             |

**Overall: BLOCKED on the human gate (UXI-14), per the pass rule —
engineering results do not override missing human evidence.** Every
engineering gate above stands as tabled; the pass is ready for the
owner's beginner study whenever participants exist.

### Final counts on the remainder candidate

| Check                                                                                                          | Result                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (`vitest run tests/unit --no-file-parallelism`)                                                           | **PASS — 2,757 passed / 0 failed / 16 skipped, 342 files** (total 2,773, matching the Stage 6 total)                                                                                                                                             |
| Integration, targeted subset (fresh acceptance DB, 8 blast-radius files incl. the new UXI-13 wrong-site suite) | **PASS — 47/47, 8/8 files**                                                                                                                                                                                                                      |
| Integration, full suite                                                                                        | **PARTIAL locally** — 6 files / 44 tests green, 0 failures, stopped for environment time (suites take 30–77s each on this rig); Stages 1–6 full tallies stand in their close notes (Stage 6: 524/0/6); full suite runs in the lead's CI gauntlet |
| Typecheck / repo-wide format check                                                                             | **PASS / PASS**                                                                                                                                                                                                                                  |
| Production build (canonical, Turbopack)                                                                        | **PASS** (exit 0; obtained in a quiet window — see environment note)                                                                                                                                                                             |
| Accessibility audit (axe-core, production build)                                                               | **PASS — 12/12 tests; zero violations at any impact on 10 core pages**                                                                                                                                                                           |
| Surface crawl (29 routes, production build)                                                                    | **PASS — 29/29, no 5xx**                                                                                                                                                                                                                         |
| Migration-interruption proof                                                                                   | **PASS** (SIGKILL mid-migration; resume fingerprint identical to control)                                                                                                                                                                        |

### Environment note (remainder)

The build flake recorded below for PR #100 recurred throughout the
remainder (silent Turbopack compile deaths under contention on this
shared rig, peaking ≈4.9GB RSS; two further VM replacements). All
remainder tallies were taken in quiet windows against artifacts built
from the final tree, and databases were re-baselined fresh after each
replacement — no result was carried across a replacement. One
improvement worth keeping: the Playwright specs' `next/link` module
resolution failure noted below is worked around by preloading `tsx`
(`NODE_OPTIONS="--import tsx"`), after which the browser specs run
as-is against the standalone server.

Candidate: branch `rc3-ux-install-01` at `fe1d296` + this report commit;
baseline main `0e7a0d5138b3c504ec17ad0e3911a7efb8b69be8` (PR #97),
fetch-verified before the worktree was created. No push, no PR — the lead
verifies and delivers.

## What a beginner gets now that they did not get at baseline

1. **Cancelling the passkey prompt is a stumble, not a lockout.**
   At baseline it permanently stranded setup (consumed token, state stuck
   at `installing`, CLI recovery or nothing). Now the enrollment session
   rotates challenge + session and the same browser retries in place;
   the form says "your answers are still here". Proven by integration
   tests and live over HTTP against the production server.
2. **Losing the recovery-codes screen is recoverable in the product.**
   At baseline the codes existed in one React state and a local CLI
   script. Now the owner rotates a fresh set from Security settings —
   old codes die, other sessions sign out, the current session survives,
   the rotation is audited. Proven by integration tests (including
   sign-in with a rotated code).
3. **Setup stops lying.** The hardcoded "✓ Verified (108/108)" card is
   replaced by the live readiness endpoint (real count at this baseline:
   137). The readiness API's own error fallback no longer hardcodes 108.
   The site feature profile is labeled "Site features", explains what it
   gates, and defaults from the installed resource profile instead of
   always claiming Standard; the sub-1 GB Lean claim is gone, and the
   one support matrix in INSTALL_UX_CONTRACTS.md is the only matrix.
4. **The installer survives its own recovery path.** Rerunning
   `install.sh` against its own running deployment works (own-listener
   port exemption); foreign listeners and instance mismatches are still
   refused. A prebuilt `--image` path exists for fresh installs
   (pull, never build), with honest digest-pinning guidance — release
   images are not signed and nothing claims they are. The claim handoff
   is a one-line token command, not a log dump. Proven by a 12-case
   stubbed harness.
5. **Small frictions removed:** slug derives from the site name until
   edited; locale/timezone are selects; the completion screen has
   copy/download and a saved-codes acknowledgment gating "Open Admin
   Studio".

## Per-gate verdicts

| Gate                                                            | Verdict                                              | Basis                                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Install engineering (installer behavior, reruns, prebuilt path) | **PASS** (harness-proven) / Docker proof **BLOCKED** | 12/12 stubbed harness; no Docker daemon in this environment                                                              |
| Browser setup & resume                                          | **PASS**                                             | Integration 8/8; live HTTP resume contract; live browser journey 15/15                                                   |
| Owner recovery                                                  | **PASS**                                             | Rotation service + route + UI; integration-proven incl. re-sign-in                                                       |
| Status honesty                                                  | **PASS**                                             | Live readiness in form and API; 137/137 observed live; no static verified claims remain in the setup flow                |
| Public HTTPS / claim                                            | **BLOCKED**                                          | No domain/host authority in this environment; claim-token handling improved (one-liner) but not proven over public HTTPS |
| Everyday core workflows (beyond setup spine)                    | **NOT IN EXECUTED SCOPE**                            | Owned by subsystem passes; see task records UXI-06…UXI-12 for exact boundaries and handoffs                              |
| Accessibility                                                   | **NOT VERIFIED**                                     | Native controls preserved in changed surfaces; no WCAG audit performed                                                   |
| Maintenance/recovery (operator)                                 | **PASS** for documented paths                        | Runbook written against verified commands; rerun safety harness-proven                                                   |
| Human usability (UXI-14)                                        | **BLOCKED**                                          | No participants; kit prepared; zero participant claims made                                                              |

**Overall: engineering PASS on the install/setup/recovery spine, with
public-HTTPS proof and human validation BLOCKED on external actions**
(a host with a domain; recruited participants). Per the pass rules, the
overall release verdict remains BLOCKED until those land — engineering
passing does not override missing evidence.

## Final counts on the candidate

- Unit: 2,126/2,126 (288 files)
- Integration: 389/389 (68 files), including 5 new resume/rotation tests
- Installer harness: 12/12
- Live browser journey: 15/15 checks
- Production build: PASS (standalone; manifest records the head SHA,
  clean source: true)
- Smoke: PASS (canonical seed → smoke order)
- Format/lint/typecheck on touched files: PASS; whole-project typecheck
  PASS

## Environment notes (for whoever re-runs this)

- Six production-build attempts died silently in the Turbopack compile
  phase on the night of Nov 17–18, 2026 while four passes shared this
  6 GB-cell VM (two other passes' builds died identically; three VM
  replacements also occurred). The identical tree built cleanly in a
  quiet window. Treat a truncated build log at "Creating an optimized
  production build ..." on this box as contention until proven otherwise.
- The Playwright spec suite's in-process Payload import fails module
  resolution (`next/link`) in this environment; the same journey was
  proven with a standalone Playwright-library script. Re-check the spec
  in CI, where the canonical `verify:release` runs it.

## Handed to the System 2 v1.2 program (recorded, not implemented here)

Starter/onboarding edit-preservation and progressive-onboarding
requirements, presentation-surface UX items, and the UXI-06
starter→publication walk — all on System 2's active surface
(`onboarding.ts`, `starters/service.ts`, `presentation/*`). Details in
the pass evidence log, section "System 2 inputs".
