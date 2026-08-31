# Phase A checklist

Allowed card states are **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **FAILED**, and **VERIFIED** only. A card owner changes no shared row; A-00 records the change when evidence is reconciled.

| Card | State | Dependency | Branch | Parallel group / merge state | Evidence | Remediation |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | NOT STARTED | A-00 baseline; checkpoint with A-09 | `phase-a/a01` | G1 with A-09; awaiting checkpoint C1 | `evidence/A-01.md` | `remediation/A-01.md` |
| A-02 | NOT STARTED | C1 (A-09/A-01) | `phase-a/a02` | G2 with A-03/A-04/A-05; awaiting C2 | `evidence/A-02.md` | `remediation/A-02.md` |
| A-03 | NOT STARTED | C1 (A-09/A-01) | `phase-a/a03` | G2 with A-02/A-04/A-05; awaiting C2 | `evidence/A-03.md` | `remediation/A-03.md` |
| A-04 | NOT STARTED | C1 (A-09/A-01) | `phase-a/a04` | G2 with A-02/A-03/A-05; awaiting C2 | `evidence/A-04.md` | `remediation/A-04.md` |
| A-05 | NOT STARTED | C1 (A-09/A-01) | `phase-a/a05` | G2 with A-02/A-03/A-04; awaiting C2 | `evidence/A-05.md` | `remediation/A-05.md` |
| A-06 | NOT STARTED | C2 (A-02/A-03/A-04/A-05) | `phase-a/a06` | G3 with A-08; awaiting C3 | `evidence/A-06.md` | `remediation/A-06.md` |
| A-07 | NOT STARTED | C3 (A-06/A-08) | `phase-a/a07` | G4 alone; awaiting C4 | `evidence/A-07.md` | `remediation/A-07.md` |
| A-08 | NOT STARTED | C2 (A-02/A-03/A-04/A-05) | `phase-a/a08` | G3 with A-06; awaiting C3 | `evidence/A-08.md` | `remediation/A-08.md` |
| A-09 | NOT STARTED | A-00 baseline; checkpoint with A-01 | `phase-a/a09` | G1 with A-01; awaiting checkpoint C1 | `evidence/A-09.md` | `remediation/A-09.md` |
| A-10 | NOT STARTED | C5 release-candidate reconciliation | `phase-a/a10` | G6 alone, clean clone only; awaiting final merge | `evidence/A-10.md` | `remediation/A-10.md` |

## Merge checkpoints

| Checkpoint | Inputs | Required reconciliation |
| --- | --- | --- |
| C1 | A-09, A-01 | Merge together; reconcile contracts, migrations, Payload generated files, evidence index, and resources. |
| C2 | A-02, A-03, A-04, A-05 | Merge the complete group together; resolve registry/migration ordering before generation. |
| C3 | A-06, A-08 | Merge together; repeat generated-file and migration reconciliation. |
| C4 | A-07 | Reconcile A-07 alone after C3. |
| C5 | Release candidate | Reconcile every accepted card, generated artifacts, global migration ledger, evidence index, and `git diff --check`. |
| C6 | A-10 | A-10 runs alone from a new clean clone of the C5 candidate; no shared local runtime resources. |

The card scopes and acceptance conditions remain those in the approved card briefs. This control plane deliberately does not restate or expand them.
