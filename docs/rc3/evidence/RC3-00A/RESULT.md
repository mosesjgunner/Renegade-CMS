# RC3-00A — Production dependency triage and patch — RESULT

> **Status: patches applied and verified; two gauntlet stages NOT RUN
> locally.** All four production findings are patched on this branch and
> every locally runnable gauntlet stage passes on the final tree. The
> production build died silently twice at the compile step on this
> memory-capped rig (the same failure mode recorded at baseline during
> POD-RC-01, on the unpatched tree), so the build and the boot smoke
> that depends on it are **NOT RUN** here. The arbiter for those two
> stages is GitHub CI on the eventual PR for this branch.
>
> **Escalation check:** no finding was confirmed REACHABLE at high
> severity in the shipped RC2, before or after patching. No RC2
> maintenance-patch decision is forced by this pass.

## Authorization and limits

- Execution phase authorized by the owner (Matthew, Nov 20, 2026,
  18:54 CT, tap in chat): "Run it — patch what's patchable and force
  the happy-dom upgrade, proving the editors still work."
- Local branch only (`rc3-00a`). Nothing pushed; no PR opened; no
  finding published anywhere public.

## Baseline

- Pinned SHA: `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf` (rc2 tag =
  main). Fresh fetch at execution start confirmed main still resolves
  to that SHA.
- Worktree: `~/workspace/rc3-00a-tree`, branch `rc3-00a` from the
  pinned SHA.
- Toolchain on this rig: Node v24.22.1, npm 10.9.4 (the RC2 audit
  recorded Node 24.22.3 / npm 11.19.1 on the auditor's machine).
- Local test stages used the system FFmpeg 8.1.2 via `FFMPEG_PATH` /
  `FFPROBE_PATH`; CI installs the pinned bundled FFmpeg instead. This
  divergence is the same one recorded in earlier passes.

## Audit reproduction (analysis phase)

- `npm audit --omit=dev --json` could not be run from this sandbox:
  the egress policy returns `403 policy_denied` for the npm bulk-audit
  endpoint. The audit was reproduced equivalently from the GHSA
  dataset via OSV over the exact lockfile: 1,015 lockfile package
  entries, 996 unique name@version pairs, 9 packages with advisories,
  4 in production scope — the same four packages the RC2 audit names.
- Count difference vs the RC2 audit: npm audit reported 5 production
  entries (1 high, 2 moderate, 2 low); the OSV reproduction found 4
  production packages. npm audit collapses each package to one entry
  at its highest severity (happy-dom alone carries 2 HIGH + 1
  MODERATE advisories). The unreproduced 5th entry could not be
  identified without the blocked endpoint; every package the audit
  doc names was reproduced. This remains an open minor uncertainty.

## Changes applied

`package.json` + `package-lock.json` only (lockfile diff: 96 lines).

| Package   | Before  | After      | Mechanism                                                                   |
| --------- | ------- | ---------- | --------------------------------------------------------------------------- |
| next      | 16.4.1  | **16.4.5** | Direct dependency pin (in-range patch)                                      |
| happy-dom | 20.11.2 | **21.0.4** | Scoped overrides under `@lexical/headless` and `@puckeditor/core` only      |
| fast-uri  | 3.1.8   | **3.1.9**  | Existing root override floor raised `^3.1.8` → `^3.1.9`                     |
| dompurify | 3.4.16  | **3.4.18** | Existing root override floor raised `^3.4.16` → `^3.4.17` (resolved 3.4.18) |

Proof of resolution: fresh `npm ci` from a deleted `node_modules`
exited 0, and `npm ls happy-dom next fast-uri dompurify` plus direct
lockfile inspection confirm the versions above. The lockfile contains
exactly **one** happy-dom entry (`node_modules/happy-dom@21.0.4`),
deduped across the Lexical, Puck, Tiptap-peer, and Vitest consumers.

## Per-finding disposition

### 1. happy-dom — PATCHED (forced major via scoped override)

- Chains (production): `@payloadcms/richtext-lexical` →
  `@lexical/headless` (declared `happy-dom@^20.9.0`);
  `@puckeditor/core` (declared `^20.0.10`); peer of `@tiptap/html`.
- Advisories: GHSA-834v-8h66-3h79 HIGH (host code execution via
  unsanitized import alias; fixed 21.0.4), GHSA-c8p4-j97h-3vg8 HIGH
  (SSRF parsing untrusted HTML; fixed 21.0.0), GHSA-5fpq-26gf-qwcr
  MODERATE (cookie scope forgery; fixed 20.14.6). Both HIGHs are
  fixed only in 21.x, outside both dependents' `^20` ranges — hence
  the owner's explicit force decision.
- Pre-patch reachability (static): no file under `src/` imports
  `happy-dom`, `@lexical/headless`, or any headless-editor API;
  `@puckeditor/core`'s shipped dist contains no happy-dom import;
  `@lexical/headless` uses happy-dom only as the DOM shim behind its
  `withDOM` helper, which does not enable the script-evaluation or
  external-resource features the HIGH advisories require. Verdict was
  PRESENT-BUT-UNREACHABLE (no path demonstrated), with transitive
  invocation through Payload's lazy proxies not fully excludable
  statically. The patch removes the question rather than relying on
  that static verdict.
- **Editor compatibility proof (the owner's condition):**
  - Focused suites: the 17 unit files under `tests/unit` that touch
    Lexical / rich-text / Puck paths — **17 files, 98 tests, all
    passed** on the patched tree.
  - Direct runtime probe: a script importing `withDOM` from
    `@lexical/headless/dom` (the exact module that imports happy-dom)
    created a happy-dom 21.0.4 `Window`, installed its `DOMParser`,
    converted HTML (`<h1>` + `<p>`) into Lexical nodes via
    `$generateNodesFromDOM`, and read the content back intact —
    **PROBE PASS**. The probe file was deleted after the run and is
    not part of this commit.
  - The full unit suite (below) passes on the patched tree.
  - Honest limit: the app and unit suites run in a `node` test
    environment, not inside happy-dom; the probe is the direct
    execution proof for the headless path, and browser-side
    Lexical/Puck rendering rides on the production build + CI, which
    are the NOT RUN stages below.

### 2. next@16.4.1 — PATCHED (16.4.5)

Seven MODERATE advisories, all fixed in 16.4.5 (patch-level,
in-range). Individually traced items were not reachable as
configured: the four `use cache` / Cache Components advisories (the
codebase has zero `'use cache'` directives, no `unstable_cache`, no
`cacheComponents` config), the Edge-runtime cookie advisory (no
`runtime = 'edge'` routes in `src/`), and the image-optimizer SVG
advisory (no `images` / `dangerouslyAllowSVG` config). The update
resolves all seven regardless.

### 3. fast-uri@3.1.8 — PATCHED (3.1.9)

Chain: `payload` → nested `ajv` (declared `fast-uri@^3.0.1`). Four
advisories (2 MODERATE, 2 LOW) in URI parsing used by ajv's format
validation; inputs are schema-driven and predominantly
developer-controlled — PRESENT-BUT-UNREACHABLE in any demonstrated
path. 3.1.9 satisfies the existing range; the override floor was
raised to force the lockfile onto it.

### 4. dompurify@3.4.16 — PATCHED (3.4.18); monaco-editor left in place

Chain: root direct dependency `monaco-editor@0.57.0` → `dompurify`.
Three LOW advisories, fixed in 3.4.17; resolved version is 3.4.18.
No file under `src/` references monaco at all — the package is
declared but unused by app source, so its DOMPurify path never runs.
Per the pass scope, monaco-editor was **not** removed; removing the
dead dependency is a separate owner decision.

### Out of scope but recorded (dev-only)

OSV also flagged vite@7.3.6, vitest@3.2.7, @vitest/mocker@3.2.7,
minimatch@10.2.6, zod@4.4.3 — all dev-tree only in this lockfile,
outside the `--omit=dev` scope of this pass. Unchanged. (Vitest's own
happy-dom usage now dedupes to the patched 21.0.4 as a side effect of
the scoped overrides.)

## Gauntlet (CI order, final tree, this rig)

| #   | Stage                                          | Result                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `npm ci` (fresh, clean `node_modules`)         | PASS (exit 0)                                                                                                                                                                                                                                                                             |
| 1   | Fresh migration acceptance                     | PASS (exit 0) — run twice: before and after a VM replacement re-baseline                                                                                                                                                                                                                  |
| 2   | Fixture seed (`ALLOW_FIXTURE_SEED=true`)       | PASS (exit 0) — run twice, same reason as above                                                                                                                                                                                                                                           |
| 3   | Upgrade migration acceptance                   | PASS (exit 0) — `20260914_110000_…` → current                                                                                                                                                                                                                                             |
| 4   | Format check (`prettier --check .`, repo-wide) | PASS (exit 0)                                                                                                                                                                                                                                                                             |
| 5   | Lint (`eslint . --max-warnings=0`)             | PASS (exit 0)                                                                                                                                                                                                                                                                             |
| 6   | Typecheck                                      | PASS (exit 0); `next-env.d.ts` churn discarded                                                                                                                                                                                                                                            |
| 7   | Unit (`vitest run tests/unit`, NODE_ENV=test)  | PASS — **343 files / 2,792 tests, 0 failed** (matches baseline)                                                                                                                                                                                                                           |
| 8   | Integration (`scripts/run-integration.mjs`)    | PASS — **93 files / 538 passed, 6 skipped, 0 failed** (matches baseline). Attempt 1 was invalidated mid-run by a VM replacement and is not counted; attempt 2 ran solo on the re-baselined DB                                                                                             |
| 9   | Production build (`node scripts/build.mjs`)    | **NOT RUN** — two solo attempts each died silently at "Creating an optimized production build …" (11-line log, no error, no `.next/standalone/server.js`); available memory fell to ~1.2 GB during compile. Same documented rig failure mode as POD-RC-01 at baseline. Arbiter: GitHub CI |
| 10  | Boot smoke (`test:smoke`)                      | **NOT RUN** — depends on the build artifact                                                                                                                                                                                                                                               |

Editor-focused proof (step 4 of the pass) ran before the gauntlet:
17 files / 98 tests passed, plus the `withDOM` runtime probe above.

## Remaining findings and compensating controls

- No production finding remains unpatched on this branch.
- The happy-dom override is a forced major-version override: the
  dependents still declare `^20` ranges. Compensating control: the
  override is scoped to the two production parents (not global), the
  headless path is runtime-proven, and the full unit + integration
  suites pass. The overrides should be removed when upstream
  Lexical/Puck releases admit happy-dom 21.x.
- Dev-only advisories (vite/vitest family, minimatch, zod) remain,
  as scoped out of this pass.

## Remaining risks

- Build + smoke are unverified locally (rig memory ceiling, not a
  code signal: typecheck, unit, and integration all pass on the
  final tree, and the identical silent-death occurred at baseline in
  POD-RC-01). Until GitHub CI runs on this branch's PR, the delivery
  is not proven end-to-end.
- The unidentified 5th npm-audit production entry (see Audit
  reproduction) is still unidentified; the OSV reproduction covers
  every package the RC2 audit names.
- Browser-side rendering of the Lexical editor and Puck with
  happy-dom 21 in the tree is covered only indirectly (suites +
  typecheck) until the build/CI leg runs.
