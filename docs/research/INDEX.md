# Research index

Inventory date: 2026-08-11. Initial-audit hashes record the supplied bytes. A repository-wide Prettier pass later normalized Markdown formatting in six reports before they were excluded from formatting; their current hashes are listed below. The audio prompt was unchanged. Report wording was not intentionally edited, but byte-for-byte preservation is no longer claimed for those six files.

The canonical preserved corpus for future milestones is `docs/research/source/`. Its seven files are byte-identical copies of the corresponding root-level research files as of 2026-08-12. The root-level copies remain because they are referenced by completed M01 evidence; use the `source/` corpus for new milestone research.

Status vocabulary: **authoritative input** means the preferred research source for its subject, not an accepted product decision; **supporting** means overlapping or narrower input; **prompt only** is a request for research, not evidence. Explicit requirements and accepted ADRs outrank every report.

## Corpus inventory

| File                                                             | Subject                                                   | Stated cutoff                        | Freshness on inventory date                                               | Status / duplicate result                            | Milestones                   | SHA-256                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `Renegade_CMS_Architecture_Report.md`                            | Product and system architecture                           | Not stated; file modified 2026-08-10 | Undated: structural guidance usable, external claims require revalidation | Authoritative input for overall architecture; unique | M01-M15                      | `8E0A1327F6B4D2B747D52B677199219849AF01EC2FB1921239DD999A22109881` |
| `COMMENT_IDENTITY_SECURITY_ARCHITECTURE_REPORT.md`               | Staff/member identity, comments, abuse prevention         | 2026-08-10                           | Current snapshot; provider/legal claims remain volatile                   | Authoritative input for identity/security; unique    | M01, M02, M07, M08, M15      | `4A0DD0805CB98326D96362BB08E569584617475F5EF71353300AF29F2EBE0CD3` |
| `Template-System-Architecture-Report.md`                         | Themes, presentation IR, visual editing                   | Not stated; file modified 2026-08-10 | Undated: boundaries usable; tool/library choices must be rechecked        | Authoritative input for presentation; unique         | M01, M05, M06, M15           | `230073237738AB22CA8904A8AC13E8CE3845A27366C3FEA24E23F50DA1141A3A` |
| `Renegade_CMS_Social_Publishing_Architecture_Report.md`          | Social provider contracts and publishing workflow         | 2026-08-10                           | Current snapshot; APIs, quotas, scopes, terms are volatile                | Authoritative input for social; unique               | M01, M08, M09, M11, M14, M15 | `73526F99BAF7841404E1899A39F0E119B8B217B094F33DA5B44F75A2E3B43B05` |
| `Renegade-CMS-Media-Distribution-Command-Center-Architecture.md` | Media ingestion, production and distribution              | 2026-08-10                           | Current snapshot; vendor/tool claims require implementation-time check    | Authoritative input for media command center; unique | M01, M02, M08-M11, M14, M15  | `B88FBC0836A60D7EEA18B65F11C28749679D2ACBE5F7214ACB4CC125E57047C7` |
| `ai-seo-content-discovery-engine-report.md`                      | Search, SEO, evidence and AI-assisted discovery           | 2026-08-10                           | Current snapshot; search/provider behavior is volatile                    | Authoritative input for discovery; unique            | M01, M04, M05, M09, M14, M15 | `A7361290EF8C786F343931D56F6DFB1A93F09193D007175256924C0727C19604` |
| `renegade-cms-maximalist-audio-publishing-research-prompt.md`    | Questions and desired deliverables for audio/TTS research | No completed-research date           | Not evidence; obtain a completed dated report before M10 choices          | Prompt only; unique                                  | M10, M14, M15                | `ADD9AFD3455930FC44DCF576E2E19257B74643D8C232A178B2F68A659861AE9A` |

Current hashes after the formatting pass: architecture `D8D58199F30A2032D55AD9C226C74B672AA9150DF3D88EDB977749F0FE9EBE14`; identity/security `E58A76F37BACA8283CFE6E33D4320F9542CC53B7DE5E199106F78DAACE0BDC56`; template `2731BA127609B5642F747405752428ECC346B3F518D89C20E964EFD8006628B0`; social `A54406A310214959157EF32AAE74D2451862198661DD9ACF4BF1DFAD91AED6A4`; media `0F7A19752F5B066FDCD905355FC03EC8DD973277F7F7E5BC78AE935C03970818`; AI/SEO `54A96AA070253E61A70C1E6517FF0F725D6FDD4C68144406035FDFDC5644CC57`; audio prompt `ADD9AFD3455930FC44DCF576E2E19257B74643D8C232A178B2F68A659861AE9A`.

Exact duplicate check: no initial or current SHA-256 values match. Likely superseded-copy check: none identified. The social and media reports overlap on durable intents, provider adapters, scheduling and attempts, but have different scopes and are complementary rather than silently merged. The audio file is not an older architecture report; it is an unfulfilled research prompt.

Reproduce the duplicate check in PowerShell:

```powershell
Get-ChildItem docs/research/source -File | Get-FileHash -Algorithm SHA256
```

## Decision extraction

| Source               | Report assertions/decisions (not automatically accepted)                                                                                  | Recommendations                                                                                      | Unresolved questions or conflicts                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Architecture         | Portable content core; stable immutable IDs; URLs are aliases; structured canonical content; versioned presentation packages              | Modular monolith, PostgreSQL, Payload/Next substrate, local-first Docker, DB-backed work             | Exact content grammar, editor/export schema, storage, jobs, identity and deployment remain milestone decisions     |
| Identity/security    | Separate staff and public identity domains; verified email attaches a member identity; layered edge/application enforcement               | First-party identity orchestration, opaque sessions, bounded security events, PostgreSQL constraints | Email/provider/regional compliance, retention, appeals, moderator governance, edge provider                        |
| Template system      | Canonical content is independent of themes; themes expose bounded controls; theme packages are versioned trusted code                     | Portable layout IR, semantic slots, Puck candidate, starter kits separate from canonical data        | Theme signing/trust, compatibility/migrations, degree of visual freedom, current editor choice                     |
| Social publishing    | Source remains canonical; provider capabilities are snapshots; immutable intents and append-only attempts separate uncertain remote state | Adapter contract, dedicated worker, idempotency/reconciliation, per-account editable variants        | Provider application credentials, supported launch providers, quotas/scopes/pricing and managed broker             |
| Media command center | Media source, derived assets, release/distribution state and operational attempts are distinct                                            | Direct multipart object storage for large media, isolated processing, capability-driven adapters     | Local versus object storage baseline, worker implementation, codecs/tool versions and provider scope               |
| AI/SEO               | Evidence and provenance must remain reviewable; rules precede AI; publication control remains human                                       | Action queue, deterministic validators, knowledge graph and optional model/provider adapters         | Its Redis/Neo4j/object-storage target conflicts with the minimal M01 baseline; rankings/APIs/costs require recheck |
| Audio prompt         | No findings or decisions                                                                                                                  | Requests a provider matrix, processing design, rights model and experiments                          | Entire research result is unresolved; do not select an audio architecture from this prompt                         |

## Preserved conflicts

- M01 accepts PostgreSQL-only infrastructure. The SEO report's Redis/Neo4j/object-storage topology is deferred until measured needs justify ADRs.
- Job identity is frozen, but job implementation is deferred to M02: reports differ between a simple database table and Payload Jobs.
- Local development storage is sufficient for M01; S3-compatible direct upload remains an M10/deployment decision.
- Cloudflare is an optional edge implementation, never a core policy dependency.
- Puck is a candidate to re-evaluate in M06, not an accepted dependency.

Superseding accepted records: [ADR-0001](../decisions/ADR-0001-foundation-architecture.md) and [ADR-0002](../decisions/ADR-0002-shared-contracts.md).
