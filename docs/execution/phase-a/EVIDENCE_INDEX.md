# Phase A evidence index

Only the coordinator updates this index. A card owner writes exactly the corresponding file under `evidence/`; a missing file is **NOT RUN**, not a pass.

## Baseline gates

| Check | Result | Notes |
| --- | --- | --- |
| `npm ci` | FAILED | First attempt left an incomplete `node_modules`; retry exited `1` with Windows `ENOTEMPTY` removing `node_modules/date-fns/_lib`. No clean dependency installation was achieved. |
| `npm run format:check` | FAILED | Exit `1`: `prettier` was not available in the incomplete installation. |
| `npm run lint` | FAILED | Exit `1`: `eslint` was not available in the incomplete installation. |
| `npm run typecheck` | FAILED | Exit `1`: `tsc` was not available in the incomplete installation. |
| `npm test` | FAILED | Exit `1`: `vitest` was not available in the incomplete installation; no test count. |
| `npm run build` | FAILED | Exit `1`: `cross-env` was not available in the incomplete installation. |
| Docker gate | NOT RUN | Docker daemon `29.3.1` and Compose `v5.1.0` are available; no isolated runtime was started. |
| PostgreSQL gate | NOT RUN | `psql` is unavailable. PostgreSQL can only be assessed through a card-specific Docker service. |
| Chromium/browser gate | NOT RUN | Chrome exists at `C:\Program Files\Google\Chrome\Application\chrome.exe`; Playwright CLI reports `1.62.1`; no isolated server/browser proof was run. |

## Card evidence

| Card | Assigned file | Reconciled status |
| --- | --- | --- |
| A-01 | `evidence/A-01.md` | NOT RUN |
| A-02 | `evidence/A-02.md` | NOT RUN |
| A-03 | `evidence/A-03.md` | NOT RUN |
| A-04 | `evidence/A-04.md` | NOT RUN |
| A-05 | `evidence/A-05.md` | NOT RUN |
| A-06 | `evidence/A-06.md` | NOT RUN |
| A-07 | `evidence/A-07.md` | NOT RUN |
| A-08 | `evidence/A-08.md` | NOT RUN |
| A-09 | `evidence/A-09.md` | NOT RUN |
| A-10 | `evidence/A-10.md` | NOT RUN |

## Evidence template

Copy this template only into the assigned evidence file; do not create another card’s file.

```md
# A-XX evidence

- Card / owner:
- Base SHA:
- Final SHA:
- Definition-of-done verdict: VERIFIED | FAILED | BLOCKED (state why)

## Change record
- Changed files:
- Migrations: none | names, registration position, fresh/upgrade result
- Generated-file effects: none | regeneration required/reconciled artifact and checkpoint
- Security effects:

## Reproduction
| Command | Exit code | Test count / result |
| --- | ---: | --- |
| exact command |  |  |

## Proof
- Browser/API/manual proof (request, response/assertion, screenshots if applicable):
- Traces/logs/artifacts (paths; redact credentials):
- Failed boundaries and negative cases:
- Limitations / checks not run:

## Remediation
- None, or link `../remediation/A-XX.md` with owner and next action.
```
