# R-09C — NEXT (handoff)

R-09C is **PASS** (see RESULT.md in this folder) — evidence-only, no
product changes. The branch is `rc1-repair-09c`, final HEAD is the
evidence commit on top of harness commits `f2c4a5d` + `e113ef1`
(tests only; `src/` is byte-identical to the `rc1-repair-09a` base
except the accepted R-09A fix in `src/modules/audience/service.ts`).

## The nine repairs are complete

R-09C was the last of the nine targeted repairs (R-01B, R-03A,
R-03B, R-03C, R-05C, R-03D, R-08-SOCIAL, R-09A, R-09C — all PASS).
Do not start any further repair or subpass from this handoff.

## What R-09C settled

- The frozen 09C bounded PASS now stands re-proven on production
  processes: real worker lifecycle (including a mid-send SIGKILL
  recovered by natural lease expiry), bounded 4-attempt automatic
  cycles, failed/dead-letter-only operator retry with lifetime
  attempts preserved (recovery at attempt 5), truthful
  `unknown` parking for ambiguous outcomes (drop / timeout / kill),
  send-time suppression re-check, queue-command and provider-event
  deduplication, tenant-scoped retry access, and the local
  telecom emulator / quiet-hours / STOP path.
- R-09A's three recorded dispatch observations are confirmed as
  designed semantics, not defects.

## Delivery

- The repairs chain ships as ONE combined targeted-repairs PR when
  Matthew says so. Nothing has been pushed; this branch is local.
- All R-09C evidence is text/JSON (no binary files in this folder).

## Environment leftovers (disposable, safe to drop)

- Database `rc1r09c_main` and scratch state under
  `scratch/rc1r09c/` remain for inspection; the supervisor tore
  down its web/worker processes. Re-running
  `node tests/rc1-r09c/run-local.mjs` resets the disposable
  database and reproduces the full acceptance.
