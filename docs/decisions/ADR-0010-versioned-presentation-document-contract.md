# ADR-0010: Versioned Presentation Document Contract

**Status**: Adopted  
**Date**: 2026-09-27  
**Author**: Renegade CMoS Architecture Team  
**Supersedes/Extends**: ADR-0006 (Presentation Manifest Boundary)

---

## 1. Context & Architectural Problem Statement

In the initial Presentation Pass (PRE-00 through PRE-06), Renegade CMoS established a bounded presentation runtime that successfully isolated the visual editor (@puckeditor/core) from anonymous public SSR bundles and guaranteed theme token contrast and atomic theme switching.

However, an exhaustive trace from Site Resolution through SSR and an end-to-end audit on current HEAD revealed structural fragmentation between the persistence layer, the visual editor, and the nine core product surfaces:

1. **Dual Representation**: Presentation is represented simultaneously as:
   - `PageLayout` in PostgreSQL collection `page-layouts` (Payload-owned fields: `blocks: LayoutBlock[]`, `unknownBlocks`, `surface`, `slot`, `templateId`, `templateMode`).
   - `PresentationDocument` v1 in `src/modules/presentation/contracts.ts` (in-memory and serialized in `publishedPresentation.document`).
2. **Editor UX Friction**:
   - **Single-Slot Canvas**: Puck can only edit one slot at a time (`resolveActiveSlot`), preventing holistic multi-region composition (header, announcement, main, cta, footer).
   - **Inert Surface Stubs**: Components for Commerce (`publisher.donation`), Audience (`publisher.newsletter-cta`), Events (`publisher.event-card`), and Community (`publisher.forum-activity`) are implemented using generic inert text stubs (`simple(...)`) rather than live interactive surface integrations.
   - **Untyped Reference Brittle Boundaries**: Media and internal links require manual, brittle `{ id, siteId, label, href }` reference structures that fail with fatal validation errors if `siteId` is not explicitly set by the editor caller.
   - **Absence of Responsive Values**: Breakpoints only support coarse block-level binary visibility (`visible: { desktop, tablet, mobile }`), with no per-property responsive styling.
   - **No Dynamic Binding**: All text and media props are static strings; authors cannot write dynamic expressions (e.g. `{{ site.name }}`, `{{ author.displayName }}`).
   - **Lost Override Provenance**: When a layout inherits from a template, there is no granular record of which properties were modified by the author versus inherited from the upstream template.

---

## 2. Decision: The Versioned Presentation Document Contract (V2 Specification)

Renegade CMoS establishes a single, versioned, portable presentation document contract across all editor adapters, storage backends, and public SSR renderers.

### 2.1 Formal TypeScript Schema Definition

```typescript
/**
 * Renegade CMoS Presentation Document Contract V2
 * Schema Identifier: renegade.presentation.document
 */

export const PRESENTATION_DOCUMENT_SCHEMA = 'renegade.presentation.document' as const
export const PRESENTATION_DOCUMENT_VERSION = 2 as const

export type UUID = string

// 1. Stable Component Identifiers
export type CanonicalComponentId =
  | `publisher.${string}`
  | `theme.${string}.${string}`
  | `custom.${string}`

// 2. Breakpoint-Aware Responsive Values
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl'

export type ResponsiveValue<T> = T | Partial<Record<Breakpoint, T>>

// 3. Strongly Typed References
export type MediaAssetReference = {
  kind: 'media'
  siteId: UUID
  mediaId: UUID
  canonicalPath: string
  altText: string
  preferredVariant?: 'thumbnail' | 'card' | 'inline' | 'hero' | 'original'
  focalPoint?: { x: number; y: number }
}

export type ContentReference = {
  kind: 'content'
  siteId: UUID
  contentId: UUID
  contentType: 'article' | 'page' | 'event' | 'podcast' | 'video' | 'book'
  canonicalPath: string
  label: string
}

export type SurfaceActionReference = {
  kind: 'action'
  surface: 'audience' | 'commerce' | 'community' | 'discovery'
  actionId: string
  targetEndpoint: string
  params?: Record<string, string | number | boolean>
}

export type TypedReference = MediaAssetReference | ContentReference | SurfaceActionReference

// 4. Safe AST Binding Expressions
export type BindingExpression = {
  __binding: true
  path:
    | `site.${'name' | 'description' | 'url' | 'locale' | 'timezone'}`
    | `article.${'title' | 'excerpt' | 'publishedAt' | 'author' | 'readingTime'}`
    | `member.${'handle' | 'displayName' | 'avatar'}`
    | `query.${string}`
  fallback: string
}

// 5. Override Provenance
export type OverrideProvenance = {
  origin: 'template' | 'pattern' | 'author'
  sourceDocumentId?: UUID
  sourceBlockId?: string
  sourceVersion?: number
  overriddenProperties: string[]
  lockedProperties?: string[]
}

// 6. Presentation Block Contract
export type PresentationBlockV2 = {
  id: string // Stable UUIDv5 or cryptographically random identifier
  component: CanonicalComponentId
  componentVersion: number
  props: Record<string, unknown | ResponsiveValue<unknown> | TypedReference | BindingExpression>
  visible?: Partial<Record<Breakpoint, boolean>>
  provenance: OverrideProvenance
}

// 7. Slots & Multi-Region Topology
export type PresentationSlotName = 'header' | 'announcement' | 'main' | 'cta' | 'footer'

export type PresentationDocumentV2 = {
  schema: typeof PRESENTATION_DOCUMENT_SCHEMA
  version: typeof PRESENTATION_DOCUMENT_VERSION
  id: UUID
  siteId: UUID
  locale: string
  theme: {
    id: string
    version: string
    tokenOverrides?: Record<string, string>
  }
  template?: {
    id: string
    version: string
    mode: 'inherited' | 'explicit' | 'detached'
  }
  surface: 'page' | 'article' | 'home' | 'archive' | 'search' | '404' | 'layout'
  slots: Partial<Record<PresentationSlotName, PresentationBlockV2[]>>
  dependencies: {
    mediaIds: UUID[]
    contentIds: UUID[]
    formIds?: UUID[]
    productIds?: UUID[]
  }
  metadata: {
    title?: string
    description?: string
    canonicalPath: string
    createdAt: string
    updatedAt: string
    authorId: UUID
    revision: number
  }
}

// 8. Published Immutable Snapshot
export type PublishedPresentationSnapshotV2 = {
  schema: typeof PRESENTATION_DOCUMENT_SCHEMA
  version: typeof PRESENTATION_DOCUMENT_VERSION
  snapshotId: UUID
  publishedAt: string
  publishedRevision: number
  document: PresentationDocumentV2
  integrity: {
    digest: string // SHA-256 over canonical JSON serialization
    signedBy: UUID
  }
}
```

---

## 3. Published Resolution Rules

1. **Snapshot Primacy**: SSR routes must render _only_ from the verified `PublishedPresentationSnapshotV2`. Unpublished draft mutations never leak into public server responses.
2. **Deterministic Fallback**: If an active theme does not register a component specified in a block, the runtime replaces that block with a deterministic containment placeholder (`<section data-unavailable-component="..."/>`) while preserving the raw block data losslessly in the document.
3. **Safe Binding Evaluation**: Binding expressions (`{{ ... }}`) are evaluated against a sanitized read-only projection context. Arbitrary JavaScript execution, string interpolation with `<script>`, or template injection is forbidden.
4. **Tenant Isolation**: All typed references (`mediaId`, `contentId`, `formId`) are validated against the request's canonical `siteId`. References pointing across site boundaries without explicit federation grants are refused at pre-mutation.
5. **Zero-Leak Bundle Boundary**: The visual editor package (`@puckeditor/core`), editor styling, and studio controls remain strictly quarantined to `/builder/[id]` and admin routes. Public routes must never include Puck runtime or CSS.

---

## 4. Prioritized Gap Ledger

| Priority | Surface / Area            | Gap Description                                                                                                             | Technical Remedy                                                                                                               | Target Milestone |
| :------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :--------------- |
| **P0**   | **Presentation IR**       | Dual schema divergence between Payload `PageLayout` and runtime `PresentationDocument`.                                     | Migrate `PageLayouts` collection to persist `document: PresentationDocumentV2` directly with backward-compatible getter hooks. | Post-Beta.1      |
| **P0**   | **Surface 8 (Commerce)**  | `publisher.donation` and `publisher.product-card` are inert stubs that cannot trigger checkouts.                            | Bind commerce blocks to `createDonationProposal` and server-authoritative checkout proposals.                                  | Core Release     |
| **P0**   | **Surface 6 (Audience)**  | `publisher.newsletter-cta` does not submit to double opt-in subscriber endpoint.                                            | Wire component props directly to `PublicForm` and `/api/audience/subscribe` RFC-compliant handler.                             | Core Release     |
| **P1**   | **Visual Editor UX**      | Puck canvas is restricted to single-slot editing (`main`). Authors cannot preview or edit header/footer regions in context. | Implement multi-slot Puck adapter using Puck's nested zones or custom composite frame layout.                                  | Minor Update     |
| **P1**   | **Responsive Design**     | No property-level responsive values; only block-level binary visibility.                                                    | Implement `ResponsiveValue<T>` field editors in the studio sidebar with viewport preview synchronizers.                        | Minor Update     |
| **P1**   | **Surface 7 (Community)** | `publisher.forum-activity` does not query live discussion trees.                                                            | Connect block to `getPublicSsrComments` and spaces projection service with caching.                                            | Minor Update     |
| **P2**   | **Dynamic Expressions**   | Authors cannot bind CMS fields (e.g. author name, post date) into hero/CTA headlines.                                       | Implement safe token evaluation engine `evaluateBinding(expr, context)` for text properties.                                   | Feature Release  |
| **P2**   | **Composition Engine**    | Template override provenance is binary (`inherited` vs `detached`); field-level overrides are not diffed.                   | Track `overriddenProperties: string[]` during draft reconciliation.                                                            | Feature Release  |

---

## 5. Compatibility Adapter Assessment

### Audit Finding

Does current HEAD require an emergency compatibility adapter today?

**Verdict: NOT REQUIRED IMMEDIATELY FOR SYSTEM SURVIVAL; RECOMMENDED AS PROGRESSIVE TRANSITION ADAPTER.**

**Rationale**:

1. **Existing V1 Runtime is Passing 100% of Tests**: All 6 unit test suites (67 tests), all 4 integration test suites (12 tests), and the browser Playwright E2E suite (`pre-06-presentation-pass-gate.spec.ts`) pass cleanly on current HEAD without data corruption.
2. **Current Fallback Guard Already Exists**: `PublicLayout.tsx` already implements a dual-path runtime:
   - If `record.publishedPresentation` exists, it invokes `renderPresentation(snapshot.document, resolveTheme(...))`.
   - If missing, it falls back to `renderLayout(layout)`.
3. **Safe Progressive Adoption**: The V2 specification can be introduced alongside V1 without breaking active database layouts. A migration script (`20261001_000000_presentation_contract_v2.ts`) will upgrade stored V1 documents to V2 while preserving all existing component IDs and props.
