# GUI-08D — Functional, data and resilience gate

**Result: PASS** (on the current working tree, this cycle)

Fresh runs, this tree, this cycle (PostgreSQL 16.15, local):

| Gate                      | Result                                        |
| ------------------------- | --------------------------------------------- |
| Typecheck                 | PASS (exit 0)                                 |
| Unit suite                | **284 files, 2,104/2,104 PASS**               |
| Migrations on a fresh DB  | PASS (exit 0)                                 |
| Integration suite         | **54 files, 317/317 PASS**                    |
| Production build          | PASS — cycle-10, source `e17542b`, clean tree |
| Editor end-to-end journey | **8/8 PASS** (GUI-04E addendum)               |
| Unauthenticated denial    | login page served, no shell leakage           |

The editorial-acceptance integration test (create → review →
preview → schedule → publish exactly once → restore → embargo
non-leakage) is inside the 317. No data loss observed anywhere in
the cycle: the seeded article and the journey-created article both
round-tripped through save/reload.

Environment note: the VM was replaced mid-cycle (uptime 21 min at
recovery); PostgreSQL and the fixture were rebuilt from the
standing recipe and every gate above ran AFTER that rebuild, on
this tree. The packaged/Docker proof remains the GitHub Actions
17C route, as before.

**Exact next prompt: GUI-08E.**
