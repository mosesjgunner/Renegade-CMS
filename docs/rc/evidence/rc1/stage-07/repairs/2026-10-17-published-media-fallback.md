# RC1 published media fallback repair

Status: bounded repair verified; RC1 **NOT READY**. This receipt does not replace Stage 07 final acceptance.

## Source and defect

- Tested executable commit: `07c069c9f5a4e6c3a6fe7b9e40f3e652086a2bd6`.
- Tested tree: `a902f70dad5fbb3694148f3c234fcf084ef09cc9`.
- Clean detached checkout: `C:\Projects\RENEGADE CMS\rc1-07c069c9-20261017` (`git status --short` empty).
- Before repair, a fresh no-test-mode publishing browser journey completed, but the published hero requested three unavailable AVIF derivative URLs and received HTTP 503. The database had zero `media_variants` rows for the uploaded image. The public presentation advertised derivatives before they were ready.
- Repair: only ready derivatives enter responsive sources; when none are ready, the published image uses the permitted original media route. Editorial presentation loads ready derivatives for the same site and asset. The browser assertion now requires a decoded hero image and no page response with status 500 or greater.

## Executed checks on the exact commit

| Check                                                                                                                                                            | Result                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm ci --include=dev` in clean checkout                                                                                                                         | Exit 0                                                       |
| Fresh `npm run db:migrate` on `rc1_clean_release_acceptance`                                                                                                     | Exit 0                                                       |
| Production `npm run build` with `BUILD_SHA=07c069c9f5a4e6c3a6fe7b9e40f3e652086a2bd6`                                                                             | Exit 0; build reported clean source                          |
| `npm run verify:presentation-bundles`                                                                                                                            | Exit 0                                                       |
| `npx playwright test tests/browser/publishing-journey.spec.ts --config=playwright.rc1.config.ts --reporter=line`                                                 | 1 passed, 0 failed; published hero decoded; no page HTTP 5xx |
| `npm run format:check`; `npm run lint`; `npm run typecheck`                                                                                                      | Exit 0 each                                                  |
| `npm test -- --reporter=dot`                                                                                                                                     | 199 files, 1,321 passed, 0 failed                            |
| Fresh `npm run db:migrate` plus `node scripts/run-integration.mjs tests/integration/med-03-variants.integration.test.ts` on `rc1_clean_media_release_acceptance` | Exit 0; 1 integration test passed                            |

The browser ran Chromium against the production standalone server via local HTTPS at `dispatch.rc02.test:3111`. `LOCAL_E2E_TEST_MODE=false`, `NEXT_PUBLIC_LOCAL_E2E_TEST_MODE=false`, and `ENABLE_TEST_ROUTES=false`; the host resolved to loopback. PostgreSQL was an owned disposable container on loopback port 55433; browser and integration used distinct databases ending `_release_acceptance`. Media used an isolated `rc1-` temporary directory. After the browser, the browser database contained one site, one media asset, zero derivatives, and two published content rows. That persisted state is the relevant fallback case. No credential or setup token is recorded here.

## Release boundary

This check covers one ordinary publishing journey and one media lifecycle integration test. It does not rerun the complete Stage 07 gate chain on this source: full integration, fresh and upgrade acceptance, golden browser matrix, image/security, business recovery, operational restore, and independent Sol decision remain open. The previous Stage 07 Gemini dossier targets `9b1272151458227f98750d1094b307cd97267815` and cannot be relabeled as proof for this commit.

`npm audit --omit=dev --json` on this lockfile reports five high package entries in one transitive chain, `@payloadcms/richtext-lexical` -> `@payloadcms/next` -> `sass` -> `chokidar` -> `braces@3.0.3`. The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched release as of this check. Exposure of an untrusted brace pattern in the shipped runtime has not been established or ruled out; production image/security adjudication remains open.
