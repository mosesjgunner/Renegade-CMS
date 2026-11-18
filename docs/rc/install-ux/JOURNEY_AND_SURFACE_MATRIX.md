# RC3-UX-INSTALL-01 — Journey and surface matrix

Scope actually covered by this pass: the install → setup → recovery spine
and the status surfaces inside it. Everyday-workflow surfaces outside this
spine (publishing loop, media, community, commerce, social) are owned by
their subsystem passes; onboarding/presentation surfaces are owned by the
System 2 v1.2 program (see the handoff list in the evidence log).

| Journey / surface | Role | Entry | States that must be honest | Verification in this pass |
| --- | --- | --- | --- | --- |
| `install.sh` fresh install | Server operator | Terminal, one command | Preflight failures name the exact blocker; stages print as they complete | Stubbed harness 12/12 (Docker proof BLOCKED: no daemon in this environment) |
| `install.sh` rerun, own deployment running | Server operator | Same command | Recognizes its own deployment; refuses foreign listener and instance mismatch | Harness cases 3–6 |
| `install.sh --image` fresh install | Server operator | Terminal | Pulls, never builds; image recorded in config | Harness cases 7–8 |
| `/setup` step 1 (owner) | Owner | Browser, bootstrap token | Passkey availability stated as browser capability, not a guarantee | Source + build; human validation BLOCKED (UXI-14) |
| `/setup` resume mode | Owner, same browser | `/setup` with enrollment cookie | "In progress" state, prefilled email, no token re-entry, no CLI dead end | Integration tests (resume rotation) + source |
| `/setup` steps 2–3 (identity, brand) | Owner | Continue | Slug derived until edited; locale/timezone are selects; theme choices are real registry entries | Source + build |
| `/setup` step 4 (features/providers) | Owner | Continue | Provider cards show live readiness only; feature profile labeled truthfully and defaulted from the installed resource profile | Source + build; live readiness proven by the Stage E server journey |
| `/setup` step 5 (review + enroll) | Owner | Finish button | Cancel shows cancel-specific copy and preserves all answers; retry resumes enrollment | Integration tests + form source |
| Completion screen | Owner | After enrollment | Recovery kit: copy, download, acknowledgment gate; rotation path explained | Source + build |
| `POST /api/setup/readiness` | Public (pre-setup) | Setup form fetch | Real counts in success and error paths | Source; Stage E live journey |
| `POST /api/auth/recovery/rotate` | Owner (session) | Security settings | Non-owner refused; rotation invalidates old codes and other sessions | Integration tests 5/5 |
| Admin → Security (`SecurityCenter`) | Owner/staff | Admin nav | Recovery section states consequences before rotating; new codes shown once with copy/download | Source + build |
| Locked `/setup` (no cookie / complete) | Anyone | Browser | Locked state with the exact operator recovery command; setup never reopens after completion | Existing integration tests |

## The beginner funnel, counted (browser setup, provisioned install)

1. Open `/setup` (link from the installer's final message / claim handoff).
2. Paste the one-time token, confirm email — 2 inputs.
3. Name the site — slug, URL, locale, timezone are pre-filled or derived —
   1 required input.
4. Pick a look (default preselected) — 0 required inputs.
5. Site features (default preselected from the installed profile); provider
   status is shown, not asked — 0 required inputs.
6. Review → create passkey (one device prompt).
7. Save recovery codes (copy/download + one checkbox) → Open Admin Studio.

Required human decisions on the default path: token, email, site name,
passkey prompt, recovery acknowledgment. Everything else has a default
that can be accepted.
