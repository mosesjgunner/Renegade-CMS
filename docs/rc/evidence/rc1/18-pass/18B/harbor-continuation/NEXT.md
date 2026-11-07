# Next after 18B Harbor continuation (2026-11-07) — 18B is PASS

## 18B close-out state

18B flipped to **PASS** on 2026-11-07. Final gates on the close-out
tree: format/lint/typecheck exit 0; unit **2,083 passed / 0 failed**;
fresh-DB migrate (132 migrations, PostgreSQL 16.15) + full
integration **306 passed / 0 failed**; build exit 0 with
`git diff -- tsconfig.json` empty. Matthew's 2026-11-07 decision
(exempt the system's own execution events in the site-deletion guard)
is implemented, together with the layered rollback-teardown
completion found beneath it (site publications, unreferenced media
blobs, the execution-events site-detach migration, and rollback
teardown authority for global collections). disc-00's shared-database
scope hazards are fixed at fixture level with afterAll restore. Full
record: `RESULT.md` in this directory (2026-11-07 resolution
addendum).

## Delivery — combined with 18C

Per Matthew's 2026-11-07 instruction, the 18B and 18C deliveries ship
as **one combined Pass 18 PR**; Matthew merges once. 18B's branch
(`rc1-18b-finish`) is local and complete; the parent agent handles
the combined delivery — nothing here is pushed by the worker.

## Then 18C

- 18C ("Independent browser golden journey A–T") is being run by
  Matthew himself; when his work lands on the repo, Harbor
  inspects/verifies/reconciles it the same way as the 17A and
  18A/18B pushes.
- Prerequisites work from 18B as landed on main (after the combined
  merge).
- Packaged proof: the T1 tsconfig fix removes the known cause of the
  17C CI byte-identity failure (run 42121759686); one post-merge
  `workflow_dispatch` of the 17C workflow by Matthew doubles as the
  packaged-image proof for the final tree. No local Docker claim is
  made anywhere in 18B's evidence.

## Watch items carried forward

- rc03 cases 1/2 fail in solo/subset runs only (sparse-user fallback
  picks the same user as author and editor). Pre-existing; passes in
  full-suite context. Fix opportunistically if 18C touches rc03.
- Shared-suite-database ambient state remains the fragile class:
  suites that rewrite the shared `site-settings` global or create
  publications shift host resolution and the discovery default scope
  for whoever runs next, and vitest file ordering is not guaranteed.
  disc-00 now pins and restores its scope; other suites still use
  unordered first-match finds and unrestored global writes — same
  hazard class, fix on sight. The canonical protocol is unchanged:
  fresh DB → migrate → full suite; subset results are indicative,
  not canonical.
