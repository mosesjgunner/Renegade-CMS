# 18D ADDENDUM — FINAL RC1 DECISION (2026-11-07, America/Chicago)

**Verdict: RC1 READY.**

Candidate: main `fcf046a7e3798854443151e13d7823c8ba3e668a` (PR #28, the 18D
decision record, and PR #29, the three closures, both merged 2026-11-07).

## What changed since the 18D verdict

The 18D decision (same date, earlier) returned NOT READY resting solely on
three unexecuted mandatory acceptances, with no defects found in anything
executed. The owner chose to run the three closure reruns rather than
re-scope the RC1 claim. All three are now executed and PASS:

- **09D — PASS, with a genuine product fix.** The closure found that
  `evaluateSegmentRecipients` (`src/modules/audience/service.ts`) silently
  matched nobody for seven of the nine audience-segment dimensions because
  it loaded only lists and tags and hardcoded the rest empty. Fixed
  minimally; proved by 11 new integration cases including the full
  subscribe → confirm (local sink) → segment → snapshot → dispatch journey.
  Automation scope is bounded exactly as RC1-SCOPE states it: the supported
  form-intake event path is proved; `automation-definitions` have no
  executor in the product and none was invented.
  Evidence: `docs/rc/evidence/rc1/18-pass/09D/closure-20261107/RESULT.md`.
- **14A — PASS, zero code changes.** All six BYO-AI runtime groups executed
  in a real headless-Chromium admin journey (24/24 checks): encrypted
  credential persistence verified in the database, graceful degradation
  with secrets scrubbed, provider negatives denied before any provider I/O,
  survival of a genuine PostgreSQL restart, transactional disconnect.
  Bounded honestly: loopback Ollama-protocol stand-in (not an Ollama
  engine); web under `next dev` per the original harness, because
  production mode refuses the loopback-HTTP topology by design.
  Evidence: `docs/rc/evidence/rc1/18-pass/14A/closure-20261107/RESULT.md`.
- **15C — PASS, proof gap closed with genuine traces.** The shipped journey
  harness executed unmodified (its container only ever hosted PostgreSQL,
  reproduced with a disposable PG 16.15 cluster): experiment journey 22/22,
  restart run 9/9. A 15C ledger row now exists for the first time.
  Evidence: `docs/rc/evidence/rc1/18-pass/15C/closure-20261107/RESULT.md`.

## Final gates on the closure tree (PostgreSQL 16.15)

- format:check, lint, typecheck: exit 0
- unit: 2,104 passed / 0 failed (284 files)
- fresh-database migrate: exit 0 (132 migrations)
- integration: 317 passed / 0 failed (54 files)
- production build: exit 0; tsconfig.json byte-stable

Recorded flake: the first final-gates integration run reported one med-01
failure (316/317). Two full fresh-database reruns both returned 317/317, as
did the post-09D verification run on identical product source. The
governing result is green; the single failure is recorded here rather than
smoothed over.

## Packaged proof on the exact candidate

GitHub Actions run **42433965930** (workflow_dispatch on `fcf046a`, run #10
of the RC1 17C image acceptance workflow): harness success and Compose
proof success, all steps green. Candidate image
`renegade-cms:rc117c-fcf046a7`
`sha256:9f6b6320bedc5bc89f456b56f0839aa51bbcc5f639625e7f1bd05a8aa7b442ca`.

## Standing bounds (unchanged from 18D, restated for the final record)

- Restore proof for the candidate is inherited-bounded from 18C steps S/T
  plus the packaged runs' restart phases; no stronger restore claim is made.
- Provider truth is as executed throughout RC1: Bluesky is the sole live
  social claim; X is manual-handoff; all other external effects are local
  sinks, emulators or sandboxes as recorded per subpass.
- Local `npm audit` remains unavailable from the verification environment
  (registry audit endpoint policy-blocked); the CI lockfile/image checks
  are the advisory input, as recorded in 18D.

## Ledger state

All 70 RC1 subpasses are PASS. Rows for 09D and 14A now carry their closure
bases; the 15C row is recorded for the first time.

## What READY authorizes next (owner's separate instruction required)

Release-notes preparation, the `v0.1.0-rc.1` version/tag, and any
deployment remain withheld until the owner gives the separate word, per
the 18D rule. This addendum changes the verdict record only.
