# Phase A evidence index (coordinator-owned)

Only the coordinator updates this index. A missing assigned card evidence file means
**NOT RUN**, not a pass. Results below are bound to code baseline
`3375297ed9403631f900c37be49efdec9ad3e8a6`.

## A-00 nondestructive baseline gates

| Check                      | Exit / state | Result                                                                                                                                             |
| -------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                   | `0`          | PASS — clean dependency installation completed.                                                                                                    |
| `npm run format:check`     | `1`          | FAILED — Prettier reports formatting issues in 475 files.                                                                                          |
| `npm run lint`             | `0`          | PASS — ESLint completed with `--max-warnings=0`.                                                                                                   |
| `npm run typecheck`        | `0`          | PASS — `tsc --noEmit` completed.                                                                                                                   |
| `npm test`                 | `1`          | FAILED — 58 files / 224 tests: 223 passed, 1 failed (`team-collaboration.test.ts`, `Invitation expiry must be in the future.`).                    |
| `npm run build`            | NOT RUN      | NOT RUN — compilation and type checking began, but the terminal runner did not return a reproducible completion exit code; do not treat as passed. |
| Docker / isolated Compose  | NOT RUN      | Docker CLI and Compose are installed; daemon connection failed (`dockerDesktopLinuxEngine` pipe missing). No infrastructure was started.           |
| PostgreSQL                 | NOT RUN      | `psql` and `pg_isready` unavailable; no isolated server started.                                                                                   |
| Chromium / Playwright gate | NOT RUN      | Playwright `1.62.1` with Chromium/headless-shell 1234 installed; no isolated web server or browser proof.                                          |

These are baseline environment outcomes, not defects to repair in A-00 and not capability
claims. Cards must report their own commands, exit codes, and counts.

## Card evidence allocation

| Card | Assigned evidence  | Reconciled status |
| ---- | ------------------ | ----------------- |
| A-01 | `evidence/A-01.md` | NOT RUN           |
| A-02 | `evidence/A-02.md` | NOT RUN           |
| A-03 | `evidence/A-03.md` | NOT RUN           |
| A-04 | `evidence/A-04.md` | NOT RUN           |
| A-05 | `evidence/A-05.md` | NOT RUN           |
| A-06 | `evidence/A-06.md` | NOT RUN           |
| A-07 | `evidence/A-07.md` | NOT RUN           |
| A-08 | `evidence/A-08.md` | NOT RUN           |
| A-09 | `evidence/A-09.md` | NOT RUN           |
| A-10 | `evidence/A-10.md` | NOT RUN           |

The required template is `evidence/_TEMPLATE.md`. Remediation records use
`remediation/A-XX-*.md` and are linked from the checklist/evidence when needed.
