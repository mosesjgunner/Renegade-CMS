# UXI-13 — Inject ordinary failures on real installations

Partial matrix, honestly bounded:

- Own running port vs foreign port: PROVEN (installer harness).
- Passkey cancel/interruption: PROVEN (integration tests).
- Lost completion response: PROVEN (rotation integration test).
- Instance mismatch / second installation guard: PROVEN (harness).
- Fresh-host Docker bootstrap, DNS/cert/proxy failures, SSH/reboot interruption, upgrade interruption: NOT RUN (no Docker daemon, no public host in this environment). These remain open, not passed.

## Continuation (Stage 7) — the executable remainder of the matrix (2026-11-19/20)

Rows completed in this stage, each with the evidence that proves it:

- **Wrong-site and crafted-ID attempts: PROVEN.**
  `tests/integration/uxi13-wrong-site.integration.test.ts` (7/7):
  unauthenticated starter reads refused (403); a site-scoped
  administrator is refused at the owner-only starters API (403); a
  crafted random site ID is refused even for the global owner (403,
  "Site access denied."); a crafted install POST is refused and writes
  nothing; control case — the global owner CAN read the other site's
  starter status (200), so the refusals are authorization, not breakage;
  guided setup shows the scoped administrator only their own site; a
  forged `renegade-active-site` cookie naming the other site is ignored
  (active site falls back to the operator's own).
- **SSH-disconnect / reboot mid-migration: PROVEN by executable proxy.**
  The rig is shared and cannot be rebooted for a test, so
  `tests/installer/uxi13-migration-interruption.mjs` runs the real
  migration verifier against a scratch database and SIGKILLs it
  mid-flight, then resumes with the ordinary migrate command. Result
  (run twice, including once after a full environment rebuild): kill
  landed at journal 1–2 of 155 (9–12 tables partial); resume completed
  to a schema fingerprint **identical** to an uninterrupted control run
  (324 tables, 4,863 columns, 155 migrations, same journal hash). An
  interrupted migration is recoverable by simply re-running migrate —
  no manual surgery, no schema drop.
- **Offline draft + stale tab: PROVEN (Stage 1 mechanism, re-verified).**
  Server-side setup drafts reject a stale write with 409 instead of
  silently overwriting (optimistic concurrency in the shared
  task-readiness/draft service); the full integration suite re-runs
  those tests green in this stage's tally.
- **Accessible completion with validation errors: PROVEN.**
  `/member-auth` previously relied on native browser validation
  bubbles. It now validates in the form: the error renders as
  `role="alert"`, the input carries `aria-invalid` +
  `aria-describedby`, and focus moves to the field. Verified live by
  the UXI-12 audit's validation test (empty and malformed submissions).
- **HTTPS / DNS / certificate / proxy failure rows: PROVEN at fixture
  level in Stage 3** (41 unit tests; every failure class yields the
  exact corrective record). Not re-run as live rows — see BLOCKED.

### BLOCKED (unchanged, stated exactly)

- **Fresh-host Docker bootstrap and the Docker rows of upgrade
  interruption**: this rig has no Docker daemon. Installer evidence
  remains harness-level (stubbed docker), as in Stage 3.
- **Public-host rows (real DNS change, real certificate issuance,
  public proxy behaviour)**: no owner domain or public host authority
  exists in this environment. The diagnosis module grades
  fixture-injected probes until an operator runs it against a real
  deployment.
- **A literal reboot of a production host mid-migration** was not
  performed; the SIGKILL proxy above is the executable evidence, and
  it is labelled as a proxy, not as the literal event.
