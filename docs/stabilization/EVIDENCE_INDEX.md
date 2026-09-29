# Stabilization evidence index

Use this index for small, inspectable references. Store screenshots, browser traces, command output, and failure artifacts outside Markdown; link their paths and SHA/configuration here or on the relevant work-tree leaf. Never paste large generated logs.

| Area | Existing evidence/reference | Scope and limit |
| --- | --- | --- |
| Admin navigation/access | `docs/execution/admin-00-role-route-evidence.md` | Fresh migration and focused route evidence; live session/browser matrix open. |
| Media Library | `docs/stabilization/media-library-2026-09-28.md`; `docs/evidence/media-publishing-workflows.md` | Current standard-profile load/list/select and unavailable-state evidence; upload/save and optional Command Center acceptance remain open. |
| Commerce | `docs/execution/commerce-admin-state-transitions-proof.md`; `docs/execution/shop-08-final-release-gate-2026-09-24.md` | Deterministic/local evidence; not live-provider proof. |
| Community | `docs/execution/community-completion-2026-09-24.md` | Focused evidence; cross-site/restart/restore gates remain distinct. |
| Release | `docs/execution/final-release-proof-2026-09-23.md`; `docs/execution/final-release-proof-2026-09-24.md` | Conflicting historical verdicts; do not treat either as a current candidate claim. |
| Five-area stabilization | `docs/stabilization/five-area-pass-2026-09-28.md` | Current static/unit/type/lint evidence for Media, Navigation, Workflow, Releases, and Audience; browser/write/provider/candidate gates remain distinct. |
| Community, Commerce, Fulfillment, Social, Analytics | `docs/stabilization/five-area-pass-5b-2026-09-28.md` | Current focused test/lint evidence; Social is explicitly deferred beyond its preview surface, and all provider/browser/restart/restore gates remain distinct. |
| Admin release handoff | `docs/stabilization/admin-release-handoff-2026-09-29.md` | Synthesis only. Prompt 6 failed before a candidate could be frozen; dirty base `8ea0e248412252b230d1b3a5b76d6791798c449d` is not a release SHA. |
| Prompt 6 editorial workflow | `tests/browser/editorial-admin-workflow.spec.ts` | Isolated Chromium PASS (1 test, 20.6s) for Posts/Pages lifecycle and durable redirect; dirty tree, fixture/local profile, and browser-shutdown stream errors keep this below candidate acceptance. |
| Prompt 6 media lifecycle | `tests/browser/editor-media-lifecycle.spec.ts` | Isolated Chromium PASS (1 test, 17.3s) for upload, attach/reopen, publish, hero rendition, and immutable replacement; fixture/local profile only. |

## New evidence entry template

- **Node:** `N.N name`
- **State:** canonical state from `AGENTS.md`
- **SHA / configuration:**
- **Workflow and command:**
- **Artifacts:** screenshot/trace/log paths (redact secrets)
- **Result / remaining limit:**
