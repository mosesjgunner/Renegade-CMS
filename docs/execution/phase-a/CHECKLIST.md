# Phase A checklist (coordinator-owned)

Only **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **FAILED**, and **VERIFIED** are permitted states. Card owners do not edit this board, the evidence index, or another card's evidence; the coordinator changes shared records during reconciliation.

| Card | State       | Dependency                                             | Branch        | Parallel group         | Merge state             | Assigned evidence  | Remediation link        |
| ---- | ----------- | ------------------------------------------------------ | ------------- | ---------------------- | ----------------------- | ------------------ | ----------------------- |
| A-01 | NOT STARTED | A-00 merged; reconcile with A-09                       | `phase-a/a01` | 0 (with A-09)          | Not merged              | `evidence/A-01.md` | `remediation/A-01-*.md` |
| A-02 | NOT STARTED | A-09 merged                                            | `phase-a/a02` | 1 (with A-03/A-04)     | Not merged              | `evidence/A-02.md` | `remediation/A-02-*.md` |
| A-03 | NOT STARTED | A-09 merged                                            | `phase-a/a03` | 1 (with A-02/A-04)     | Not merged              | `evidence/A-03.md` | `remediation/A-03-*.md` |
| A-04 | NOT STARTED | A-09 merged                                            | `phase-a/a04` | 1 (with A-02/A-03)     | Not merged              | `evidence/A-04.md` | `remediation/A-04-*.md` |
| A-05 | NOT STARTED | A-03 body/URL contract frozen                          | `phase-a/a05` | 1 (after A-03 freeze)  | Not merged              | `evidence/A-05.md` | `remediation/A-05-*.md` |
| A-06 | NOT STARTED | A-02/A-03/A-04/A-05 reconciled                         | `phase-a/a06` | 2 (with A-08)          | Not merged              | `evidence/A-06.md` | `remediation/A-06-*.md` |
| A-07 | NOT STARTED | A-02 through A-06 merged                               | `phase-a/a07` | 3 (alone)              | Not merged              | `evidence/A-07.md` | `remediation/A-07-*.md` |
| A-08 | NOT STARTED | A-02/A-03 reconciled                                   | `phase-a/a08` | 2 (with A-06)          | Not merged              | `evidence/A-08.md` | `remediation/A-08-*.md` |
| A-09 | NOT STARTED | A-00 merged; reconcile with A-01                       | `phase-a/a09` | 0 (with A-01)          | Not merged; merge first | `evidence/A-09.md` | `remediation/A-09-*.md` |
| A-10 | NOT STARTED | A-01 through A-09 merged; release candidate reconciled | `phase-a/a10` | 5 (alone, clean clone) | Not merged              | `evidence/A-10.md` | `remediation/A-10-*.md` |

## Mandatory merge checkpoints

1. **A-09 / A-01:** run in parallel after A-00; merge A-09 first, then rebase and merge A-01.
2. **A-02 / A-03 / A-04 / A-05:** reconcile shared schemas, URL/body contracts, migration ledger, generated artifacts, evidence index, and resource map. A-05 cannot begin its URL/body work until A-03 records its freeze.
3. **A-06 / A-08:** reconcile together, including generated artifacts and migration order.
4. **A-07:** reconcile alone on the integrated admin surface.
5. **Release candidate:** reconcile accepted A-01 through A-09 evidence, generated Payload artifacts, global migration ledger, and `git diff --check`.
6. **A-10:** run alone from a fresh clean clone of that release candidate.

No concurrent card may share mutable runtime resources or edit this checklist. A card writes only its assigned evidence file; the coordinator owns indexes and reconciliation.
