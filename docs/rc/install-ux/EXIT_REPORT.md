# RC3-UX-INSTALL-01 — Exit report

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
