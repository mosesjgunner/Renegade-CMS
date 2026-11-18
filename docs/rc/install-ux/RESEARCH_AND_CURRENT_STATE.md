# RC3-UX-INSTALL-01 — Research and current state

Baseline: GitHub main `0e7a0d5138b3c504ec17ad0e3911a7efb8b69be8` (PR #97 merge),
verified by fetch before the worktree was created. Branch `rc3-ux-install-01`.
The preparation for this pass inspected main `6c291cf` by source only; every
finding below was re-verified by source inspection at the execution baseline,
and behavior claims are backed by the tests named in the evidence log
(`rc3-ux-install-01-evidence/` in the RC goal folder).

## What the baseline actually did (source-verified)

- `install.sh` is the single supported bootstrap: preflight (OS, Docker,
  Compose, memory, disk, port), per-instance image naming, generated secrets,
  `.env.production` written atomically at mode 600, `docker compose up -d
  --build`, health wait, and a printed claim handoff.
- Browser setup is a five-step form at `/setup` backed by the installation
  service in `src/modules/operations/installation.ts`: bootstrap token →
  passkey enrollment → starter onboarding → recovery codes shown once.
- Installation state is durable in PostgreSQL (`installation_state`):
  `incomplete → installing → complete`, with the bootstrap token and the
  enrollment session stored as hashes only.

## Defects found at baseline (UXI-D1…D9)

| ID | Severity | Defect | Disposition |
| --- | --- | --- | --- |
| UXI-D1 | Critical | Cancelling the passkey prompt stranded setup permanently: the bootstrap token was consumed, state stuck at `installing`, every retry rejected, `/setup` offered only CLI recovery. | Fixed (Stage A + C) |
| UXI-D2 | High | A lost completion response permanently hid the recovery codes; rotation existed only as a local CLI script. | Fixed (Stage A + D) |
| UXI-D3 | High | Setup form hardcoded "✓ Verified — migrations fully applied (108/108)" without checking anything; the readiness API's own error fallback hardcoded the same 108. | Fixed (Stage C) |
| UXI-D4 | Medium | Form advertised a sub-1 GB Lean the installer rejects (<1024 MB fails preflight); the site *feature* profile was mislabeled "Deployment profile" and defaulted to Standard regardless of the installed resource profile. | Fixed (Stages B + C) |
| UXI-D5 | Critical | `install.sh` port preflight ran before the existing-config branch, so rerunning the installer against its own running deployment failed with "port already in use" — the documented recovery path defeated itself. | Fixed (Stage B) |
| UXI-D6 | Medium | No prebuilt-artifact path: every install compiled from source under a forced per-instance image name. | Addressed (Stage B: `--image` pull path; signatures do not exist upstream — digest pinning is the honest verification, stated in the installer help) |
| UXI-D7 | Medium | Slug was a required manual field; locale/timezone were free-text fields a beginner could typo into an invalid state. | Fixed (Stage C) |
| UXI-D8 | Medium | Completion screen showed recovery codes as bare text — no copy, no download, no acknowledgment. | Fixed (Stage C) |
| UXI-D9 | Medium | Claim handoff told the operator to dump full container logs to find the setup token. | Fixed (Stage B: one-line grep command) |

## Facts established during execution

- Resource profiles are four, not two: `ResourceProfile = 'Lean' |
  'Standard' | 'Media' | 'Scale'` (`src/modules/extensions/contracts.ts`).
  The onboarding *feature* profile is only `'Lean' | 'Standard'`
  (`onboardingProfiles` in `src/modules/operations/onboarding.ts`) and gates
  media processing and quality scanning. Any support matrix that conflates
  the two is wrong; the setup form no longer does.
- Memory boundary (standing, unchanged by this pass): Lean is *supported*
  from 1 GB (installer minimum) with a 2 GB recommended floor — the H-06
  cgroup fixture proved fit at 1 GB, and the product position is that 1 GB
  is not recommended. Standard requires ≥2 GB in the installer.
- This execution environment has no Docker daemon and no public domain, so
  Docker-path install proof and public-HTTPS proof are BLOCKED here, not
  failed; the installer behavior is proven with a stubbed harness instead
  (see ACCEPTANCE_RESULTS.md).

## Coordination boundary

The System 2 v1.2 program owns onboarding/presentation code
(`src/modules/operations/onboarding.ts`, `src/modules/starters/service.ts`,
`src/modules/presentation/*`, builder preview, themes API, presentation
import, `PublicLayout`, page-builder). Requirements from this pass that land
on that surface are recorded as inputs in the evidence log, not implemented
here. This pass owns install/bootstrap, the setup flow, recovery, status
honesty, and admin surfaces outside that boundary.
