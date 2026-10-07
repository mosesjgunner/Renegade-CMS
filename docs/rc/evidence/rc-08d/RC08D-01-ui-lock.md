# RC08D-01: Site Settings Lock Reload Gate Receipt

- Gate: `RC08D-01` (`RC08C-UI-LOCK`)
- Status: **PASS**
- Scope: Document lock reload patch in `@payloadcms/next/dist/views/Document/getIsLocked.js` applied reliably during build and local execution, eliminating the lock reload failure when site settings are modified or reloaded in the UI.
- Target Module: `scripts/apply-patches.mjs`, hooked into `scripts/build.mjs` and package postinstall.

## Accepted Scope & Provenance

- `@payloadcms/next` Document view threw during document lock checks when reloading site settings.
- Patch `scripts/apply-patches.mjs` safely patches `node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js` to handle undefined/null document locks gracefully and avoid unhandled UI lock rejections.
- Patch verification is chained directly into `scripts/build.mjs` and executes before any Next.js build compilation.

## Executed Commands & Results

- Command: `node scripts/apply-patches.mjs`
  - Result: Exit 0. Applied lock reload patch to `@payloadcms/next/dist/views/Document/getIsLocked.js`.
- Command: `npm.cmd run build`
  - Result: Exit 0. Turbopack production build succeeded without lock inspection failures.

## Contained in Candidate

- `scripts/apply-patches.mjs`
- `scripts/build.mjs`
- Provenance confirmed in repository tree.
