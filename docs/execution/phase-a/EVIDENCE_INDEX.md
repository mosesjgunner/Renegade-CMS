# Phase A evidence index (coordinator-owned)

Only the coordinator updates this index. A missing assigned card evidence file means
**NOT RUN**, not a pass. Results below are bound to `3375297ed9403631f900c37be49efdec9ad3e8a6`.

## A-00 nondestructive baseline gates

| Check | Exit / state | Result |
| --- | --- | --- |
| `npm ci` | `-4051` | FAILED — Windows `ENOTEMPTY` removing `node_modules/@esbuild/win32-x64`; no clean dependency install. |
| `npm run format:check` | `1` | FAILED — `prettier` unavailable after incomplete install. |
| `npm run lint` | `1` | FAILED — `eslint` unavailable after incomplete install. |
| `npm run typecheck` | `1` | FAILED — `tsc` unavailable after incomplete install. |
| `npm test` | `1` | FAILED — `vitest` unavailable; no test count. |
| `npm run build` | `1` | FAILED — `cross-env` unavailable. |
| Docker / isolated Compose | NOT RUN | Docker Compose `v5.1.0` installed; daemon connection failed (`dockerDesktopLinuxEngine` pipe missing). No infrastructure was started. |
| PostgreSQL | NOT RUN | `psql` unavailable and no isolated server started. |
| Chromium / Playwright gate | NOT RUN | Chrome installed; `npx playwright --version` returned `1.62.1`; no isolated web server or browser proof. |

These are baseline environment outcomes, not defects to repair in A-00 and not capability
claims. Cards must report their own commands, exit codes, and counts.

## Card evidence allocation

| Card | Assigned evidence | Reconciled status |
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

The required template is `evidence/_TEMPLATE.md`. Remediation records use
`remediation/A-XX-*.md` and are linked from the checklist/evidence when needed.
