# Evidence — A-XX <card title>

> Copy this template to `evidence/A-XX.md`. Fill **every** section. Missing evidence =
> not done. Do not weaken assertions, seed via direct DB writes, or call internal services
> in place of the public/admin workflow. Record honest `NOT RUN` / `FAILED` where true.

## 1. Identity & commit binding
- Card: `A-XX`
- Branch: `phase-a/aXX-...`
- **Base SHA** (commit branched from): `________`
- **Final SHA** (commit evidence describes): `________`
- Merge checkpoint satisfied: `________` (which dependency/checkpoint, and how verified)
- Assigned resources used (from RESOURCE_MAP.md): compose project / ports / databases /
  media path/volume / migration-test DB: `________`

## 2. Changed files
- Full list of files added/modified/deleted (paths):
  ```
  ________
  ```

## 3. Migrations
- New migration(s) added (name + global-order justification): `________`
- Migration ledger position (registered in `src/migrations/index.ts` where): `________`
- Collision check vs existing 41 migrations: `________`

## 4. Commands executed (exact command + exit code)
| Command | Exit code | Notes / log location |
|---|---|---|
| `npm run lint` | | |
| `npm run typecheck` | | |
| `npm run build` | | |
| `<card unit tests>` | | test count: |
| `<card integration tests>` (isolated Postgres) | | test count: |
| `<card Playwright spec>` (isolated browser) | | |
| `<other required commands>` | | |


> Record `NOT RUN` (with reason) for anything not executed. Never mark an unrun gate as
> passed.

## 5. Test counts
- Unit: `___ passed / ___ total`
- Integration: `___ passed / ___ total`
- Browser: `___ passed / ___ total`

## 6. Browser / API / manual proof
- Browser journey steps proven (visible controls only): `________`
- API/HTTP assertions (status, headers, body): `________`
- Manual verification (if any), with exact steps: `________`

## 7. Traces & artifacts
- Playwright trace/video paths: `________`
- Screenshots / HTTP capture files: `________`
- Media SHA-256 (source vs served/restored, if applicable): `________`

## 8. Limitations
- Known limitations / partial areas: `________`

## 9. Failed boundaries
- Any Definition-of-Done boundary that failed or was not proven: `________`

## 10. Security effects
- Access/permission changes; anonymous exposure checked (draft/private/orphan/cross-site):
  `________`
- Intentionally public metadata (explicitly listed): `________`

## 11. Generated-file effects
- Does this card require `generate:types` / `generate:importmap` regeneration? `Yes/No`
- What changed in schema that triggers it: `________`
  (Do not hand-edit generated files; coordinator reconciles at the merge checkpoint.)

## 12. Remediation
- Bounded remediation files created for unfinished work: `remediation/A-XX-*.md`
- Summary of each: `________`

## 13. Definition-of-done verdict (explicit)
- Verdict (choose one): `VERIFIED` / `PARTIAL` / `INCOMPLETE` / `BROKEN` / `FAILED`
- One-paragraph justification tied to the reproduced evidence above: `________`
- Contract effects (which SHARED_CONTRACTS.md items were frozen/consumed/contradicted):
  `________`
