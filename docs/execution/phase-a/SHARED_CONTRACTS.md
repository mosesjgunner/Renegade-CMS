# Phase A — Shared Contracts (frozen at A-00)

These contracts are **frozen from the repository as it exists at base commit
`ae0d121652d4e6507a327f68c029c0512588bcdd`**. They are grounded in actual collections,
globals, modules, and migrations — not invented. Where the repository does not yet settle a
decision, it is marked **`MUST BE FROZEN BY A-XX`**; no card may invent a contradicting
contract. If code contradicts a frozen contract, the card **stops and records it** rather
than building a competing architecture.

Repository evidence used to freeze these contracts (verified at A-00):
- Collections: `src/collections/*.ts` (slugs enumerated below).
- Global: `src/globals/SiteSettings.ts` (slug `site-settings`).
- Shared field helpers: `src/collections/canonical-shared.ts`
  (`visibilityOptions = ['public','unlisted','members','friends','private']`,
  `publicationStatusOptions`, `moderationStateOptions`, `canonicalSlug`, retention fields).
- Media module: `src/modules/media/{storage.ts,workflow.ts,contracts.ts,publishing.ts}`.
- Migrations ledger: `src/migrations/index.ts` (41 registered).

| Concern                               | Frozen contract / bounded uncertainty                                                                                                                                                                                                                          | Repository evidence                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Canonical content identity            | Payload/PostgreSQL UUID is canonical; `content` and `article-family-content` are source records and public presentation is a projection, not a replacement store.                                                                                              | `docs/architecture/canonical-information-architecture.md`                 |
| Page/post body and revision ownership | Owning content/editorial records own body and revision/provenance truth; `revision-records` retains history. Renderer, theme, provider, and layout do not own it. Exact compatible page/post body shape and ownership boundary are **MUST BE FROZEN BY A-03**. | `src/collections/Publishing.ts`; `docs/architecture/project-spine.md`     |
| Canonical path and redirect ownership | Publishing/taxonomy records own scoped canonical paths; `taxonomy-redirects` owns taxonomy move history and site-scoped `public-redirects` owns public redirects. A redirect cannot target itself. Path reconciliation details are **MUST BE FROZEN BY A-03**. | `src/collections/Publishing.ts`; canonical-information architecture       |
| Media assets / usages                 | `media-assets` owns reusable bytes/storage; `media-usages` owns references. Content/albums reuse assets and do not create another byte store. Replacement/deletion semantics are **MUST BE FROZEN BY A-02**.                                                   | `src/collections/Publishing.ts`; canonical-information architecture       |
| Storage                               | Local filesystem storage is the default. Optional S3 is an adapter seam; incomplete non-production S3 falls back to local and no provider becomes canonical storage.                                                                                           | `src/modules/core/config.ts`; `src/collections/Publishing.ts`             |
| Site / publication / space scope      | `sites` is the installation boundary; publications are site-related and space/member ownership uses explicit relationships. Do not infer scope from singleton, URL, slug, or provider account.                                                                 | canonical-information architecture; `src/collections/canonical-shared.ts` |
| Draft/public visibility               | Direct rendering uses `canRenderPublic`; discovery uses `canDiscoverPublic`. Non-public/non-published and other blocked states remain excluded by those gates.                                                                                                 | `docs/architecture/public-rendering-contract.md`; `src/modules/public`    |
| Public-media eligibility              | A public projection must pass its visibility gate and must not disclose private provenance or an ineligible asset through a usage. Exact predicate is **MUST BE FROZEN BY A-09**.                                                                              | public-rendering and media-publication contracts                          |
| Publication navigation ownership      | Navigation/layout is a scoped presentation projection over `page-layouts`, taxonomy, and canonical paths; it does not own canonical content. Write owner is **MUST BE FROZEN BY A-04**.                                                                        | dependency map; `docs/architecture/page-builder-sdk.md`                   |
| Site Settings SEO inheritance         | `site-settings` owns defaults and `inheritancePolicy`; typed SEO precedence is manual then generated, with explicit inheritance policy. Resolved editor surface is **MUST BE FROZEN BY A-06**.                                                                 | `src/globals/SiteSettings.ts`; public-rendering contract                  |
| Operational backup / portable export  | Operational backup/restore is deployment recovery with PostgreSQL/runtime storage; portable export is a separate portability boundary. Retention/compatibility details are **MUST BE FROZEN BY A-08**.                                                         | `package.json`; platform-operations task; extension SDK                   |
| Architecture                          | One Next.js App Router/Payload modular monolith using Payload's PostgreSQL adapter and registered domains/jobs; no parallel runtime, generic event bus, competing identity store, or second architecture.                                                      | `src/payload.config.ts`; five-phase baseline                              |
| Deployment                            | Lean and Standard are small-to-start profiles. Lean hides, queues, or delegates constrained capabilities without deleting data/changing ownership; Standard remains supported.                                                                                 | `src/modules/core/config.ts`; `src/globals/SiteSettings.ts`               |


### Collection slugs observed (source of truth for identity)

`sites`, `spaces`, `publications`, `content`, `article-family-content`, `revision-records`,
`page-layouts`, `media-assets`, `media-usages`, `public-redirects`, `taxonomy-redirects`,
`preview-tokens`, `authors`, `categories`, `sections`, `relationships`, `sources`,
`scheduled-publish-jobs`, `content-releases`, `members`, `member-sessions`,
`member-recovery-codes`, `linked-identities`, `identity-tokens`, `identity-audit-events`,
`users`, plus community/commerce/network/calendar collections out of Phase A scope. Global:
`site-settings`.

---

## Frozen contracts

### C-1 Canonical content identity
Editorial content is identified by the canonical **`content`** collection (slug `content`),
with the article/editorial family expressed through `article-family-content` and
`revision-records`. Cards MUST preserve this canonical identity and MUST NOT create a
parallel Pages/Posts database family. `canonicalSlug` (lowercase, hyphenated) governs slug
validity.

### C-2 Page/post body and revision ownership
The article revision engine (`revision-records` + `article-family-content`) owns
post/article body + publish lifecycle; **`page-layouts`** owns page body/layout IR. The
smallest compatible page body contract is **owned by A-03** and is
**`MUST BE FROZEN BY A-03`** (recorded in `evidence/A-03.md`). Downstream cards (A-05
search body projection, A-06 SEO) consume A-03's frozen body/URL contract; they do not
redefine it. A draft/future-scheduled revision must never replace the last public revision.

### C-3 Canonical-path and redirect ownership
Public URLs are canonical paths. Redirects are owned by **`public-redirects`** (with
`taxonomy-redirects` for taxonomy). A published slug/path change MUST create exactly one
correct redirect (no duplicates). **Contract gap to freeze:** `page-layouts` use a `path`
field while sitemap/canonical logic expects `canonicalPath`; reconciling `path` vs
`canonicalPath` is **`MUST BE FROZEN BY A-03`** and consumed/repaired by A-05/A-06.

### C-4 Media-assets / media-usages ownership
Canonical media identity is **`media-assets`**; usage references are tracked in
**`media-usages`**. Cards MUST NOT introduce a second Payload upload collection unless
inspection proves `media-assets` cannot support the workflow (A-02 must record such proof
if it ever claims this). Replacement/deletion semantics (atomic rewire vs bounded,
loop-safe replacement chain; refuse deletion while referenced) are **owned by A-02** and
**`MUST BE FROZEN BY A-02`**.

### C-5 Local storage default + optional adapter seam
Local filesystem storage is the **default** and is authoritative for Phase A
(`src/modules/media/storage.ts`, `MEDIA_DIR` env, default `./media`). An adapter seam for
S3/R2/CDN exists and remains an **optional, documented-later seam** — Phase A must work with
local storage and no optional provider. One shared web/worker media volume is the Phase A
layout.

### C-6 Site / publication / space scope
Content is scoped by **`sites` → `publications` → `spaces`**. Cross-site/cross-publication
reads and media references MUST NOT leak. Scope predicates apply to reads, media byte
serving, search, sitemap, and permissions.

### C-7 Draft / public visibility
Visibility values are fixed by `canonical-shared.ts`:
`['public','unlisted','members','friends','private']`, with publication status
`['draft','active','suspended','archived']` and moderation
`['clear','review','restricted','removed']`. Only genuinely published + public content is
anonymously readable. **Known baseline gap (verified at A-00):** `Content` (slug `content`,
`src/collections/Publishing.ts`) and `media-assets` (`src/collections/MediaPublishing.ts`)
currently declare `access.read: () => true`, so Payload REST/GraphQL may expose draft
content metadata and all media metadata anonymously even though public routes filter output.
**Closing this is owned by A-09** and is a hard Phase A gate.

### C-8 Public-media eligibility
Media bytes are public **only** through an approved published reference; unpublished /
orphan / private media bytes are unavailable anonymously (`/media/[id]` gated). Cross-site
references cannot make bytes public. Enforcement hardening is owned by **A-09**; workflow
correctness by **A-02**.

### C-9 Publication navigation ownership
Site navigation is owned by **`publications.navigation`** (normalized JSON), rendered by the
public navigation renderer (`tests/unit/public-navigation.test.ts` covers normalization).
Cards MUST NOT create a second menu collection unless a migration-safe analysis proves the
existing contract cannot meet Phase A (A-04 must record such proof if claimed). Menu
editing UX + validation is owned by **A-04**.

### C-10 Site Settings SEO inheritance
SEO defaults live in the **`site-settings`** global; per-content fields override site
defaults. Resolution order is **explicit override → content-derived fallback → site
default**, and the resolved source must be visible to the publisher. SEO behavior for
Phase A is owned by **A-06**; the exact resolved-field surface in the editor is
**`MUST BE FROZEN BY A-06`**.

### C-11 Operational backup vs portable export
Two distinct mechanisms are preserved:
- **Operational recovery** = PostgreSQL dump + complete local media archive (with checksums,
  secret exclusion, isolated-target guards): scripts `operational-backup.ts` /
  `operational-restore.ts` and `compose.restore.yaml`.
- **Portable export/import** = content/relationships/settings/redirects/media portability
  (`src/scripts/portability.ts`, `src/modules/portability/**`).

These are not merged into one mechanism. Both are owned/proven by **A-08**.

### C-12 Architecture: Payload + Next.js + PostgreSQL
The architecture is fixed: **Payload CMS 3.88.0**, **Next.js 16.3.0**, **PostgreSQL** via
`@payloadcms/db-postgres`. No card may add a second architecture, an alternative datastore
(Elasticsearch/Meilisearch/Redis/queue), or an SEO/analytics SaaS. Local deterministic
search stays in Postgres; the documented external-search trigger is 10,000 public documents
or sustained p95 > 250 ms (A-05).

### C-13 Deployment: Lean / Standard, small-to-start
The supported deployment profiles are **Lean / Standard, small-to-start**, via the Linux
installer (`install.sh`) and `compose.production.yaml` / `compose.restore.yaml`. Cards MUST
NOT add a mandatory hosted dependency or managed-hosting requirement. Passkey/WebAuthn
staff auth, permanent installation lock, and recovery codes are preserved (A-01).

---

## Generated-file and migration ownership

- **Generated Payload types (`src/payload-types.ts`) and the admin import map
  (`src/app/(payload)/admin/importMap.js`) are NOT owned by any single card.** A card that
  changes schema MUST *report in its evidence* that regeneration is required, but the actual
  regenerated artifacts are **reconciled at merge checkpoints** by the coordinator (to avoid
  N cards committing conflicting generated files). Do not hand-edit these files.
- **Migration names MUST be globally ordered and collision-free** across the entire ledger
  (`src/migrations/index.ts`, 41 registered at baseline). Use a strictly increasing
  `YYYYMMDD_HHMMSS_<slug>` prefix that sorts after the latest merged migration at the time
  the card branches, and register it in `index.ts` in global order. Two cards MUST NOT
  reuse a timestamp. Schema cards report the required migration + regeneration in evidence;
  the coordinator resolves ordering at the merge checkpoint.
- A-00 changed **no** migrations and **no** generated files.

## Merge checkpoints

1. **Group 0:** merge **A-09 first**, then rebase and merge **A-01**; coordinator reconciles
   their evidence and checklist state.
2. **Reconciliation Checkpoint 1:** merge **A-02 → A-03 → A-04 → A-05**, resolving only
   against the frozen content/media/navigation contracts; regenerate Payload types/import
   map if schemas changed; reconcile evidence/checklist; run lint/typecheck/unit/build plus
   focused PostgreSQL tests.
3. **Group 2:** merge **A-06 → A-08**; reconcile evidence/checklist; run
   media/content/crawler/restore focused suites together.
4. **A-07:** merge alone on the integrated admin surface.
5. **Release-candidate reconciliation:** migrations, generated types/import map, contracts,
   docs/evidence/checklist, full static gates, full PostgreSQL integration, build, and the
   Phase A browser suite.
6. **A-10:** run alone from a **clean clone** at the release-candidate commit.

## Contracts still to be frozen (uncertainty register)

| Contract | Owner card | Marker |
|---|---|---|
| Smallest compatible page body contract | A-03 | `MUST BE FROZEN BY A-03` |
| `page-layouts.path` vs `canonicalPath` reconciliation | A-03 (consumed by A-05/A-06) | `MUST BE FROZEN BY A-03` |
| Media replacement/deletion semantics (atomic rewire vs chain) | A-02 | `MUST BE FROZEN BY A-02` |
| Resolved SEO field surface (override/fallback/default display) | A-06 | `MUST BE FROZEN BY A-06` |
| Search public-body projection shape | A-05 (from A-03 body contract) | `MUST BE FROZEN BY A-05` |
