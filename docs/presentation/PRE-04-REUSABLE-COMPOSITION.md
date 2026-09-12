# PRE-04 Reusable Visual Composition

PRE-04 expands the visual editor from single-page drafting into reusable, site-scale composition for publishers while remaining inside safe theme contracts. A publisher can build a coherent multi-page site without writing code or arbitrary CSS.

## 1. Reusable Page Templates & Inheritance Semantics

Publishers can create, name, preview, duplicate, version, and retire reusable page templates (`surface: 'template'`, `slot: 'main'`).

### Inheritance Modes

- **Inherited (`inherited`)**: The page is logically tied to its template. When the template updates, the page draft can be synchronized (`syncPageWithTemplate`), pulling in updated blocks while generating unique block IDs.
- **Explicitly Applied (`explicit`)**: The page records its template linkage and version, but template updates are applied only when a publisher explicitly chooses to update the draft.
- **Detached (`detached`)**: The template served only as a starter scaffold; subsequent changes to the template are completely ignored.

### Never Surprise-Update Published Pages

> [!IMPORTANT]
> Template changes NEVER automatically mutate published pages. A template revision or synchronization only updates the layout's internal draft state. The published presentation snapshot (`publishedPresentation` / `publishedRevision`) remains immutable until an authorized publisher explicitly executes a publish action.

### Retirement & Duplication

- **Retirement**: Templates can be retired (`isRetired: true`), hiding them from new page selection while leaving existing pages intact and functioning.
- **Duplication**: Templates can be duplicated with unique component IDs and revision history tracking.

## 2. Reusable Patterns & Sections

Registered component subtrees can be saved as reusable patterns (`surface: 'pattern'`) with category and version metadata.

### Snapshot vs. Linked Instance

When inserting a pattern into a canvas:

- **Snapshot (`snapshot`)**: Clones the pattern's component blocks with new, detached UUIDs. The publisher can freely edit each block independently without affecting the source pattern.
- **Linked Instance (`linked`)**: Inserts a `publisher.pattern` reference block storing `patternId`, `patternName`, and `patternVersion`. The instance renders with visible badge identification and links back to the centralized pattern definition.

## 3. Versioned Global Regions & Rollback

Global layout regions (`surface: 'global'`) support the full set of approved outer shell slots:

- `header`: Global site header / navigation region.
- `footer`: Global footer columns and legal notices.
- `announcement`: Site-wide urgent banner or callout.
- `cta`: Global call-to-action block.

Global regions track a complete `revisionHistory`. The rollback endpoint (`/api/layouts/:id/rollback`) allows instant rollback to any prior revision number without history loss, creating an auditable rollback entry.

## 4. Theme-Approved Style Controls & Accessible Limits

To guarantee that layouts remain accessible and within theme boundaries, all style adjustments are constrained:

- **Spacing**: Constrained theme token (`compact` | `normal` | `relaxed`).
- **Width**: Constrained variant (`standard` | `wide` | `full`).
- **Alignment**: Constrained alignment (`left` | `center` | `right`).
- **Background**: Constrained color token (`canvas` | `surface` | `muted` | `brand` | `accent`).
- **Emphasis**: Constrained visual emphasis (`subtle` | `normal` | `bold`).
- **Visibility**: Responsive visibility map (`desktop`, `tablet`, `mobile` booleans).

Arbitrary CSS properties (e.g. `style`, `css`, `className`, arbitrary inline styles) and dangerous payloads (`<script>`, `<style>`, `javascript:`, event handlers) are strictly rejected by `validateLayout` and `validateComponentProps`.

## 5. Site-Builder Navigation & Responsive Presets

The Visual Editor Studio integrates a top-level unified navigation bar:

- **Canvas**: Direct Puck visual editing canvas.
- **Pages**: List of all pages in the current publication, showing template mode, status, revision, and direct preview links.
- **Templates**: Reusable page template manager with usage counts, retirement toggles, and "Create Page from Template" action.
- **Globals**: Global region manager with revision tracking and rollback controls.
- **Patterns**: Reusable pattern library with one-click "Insert Snapshot" and "Insert Linked" actions.

### Responsive Viewport Presets

The preview route (`/builder/:id/preview?viewport=...`) supports deterministic viewport testing:

- **Desktop**: Standard 1280px container (`max-w-6xl`).
- **Tablet**: 768px constrained viewport with container outline and shadow.
- **Mobile**: 375px phone viewport with container outline and shadow.
  Both the preview UI and the public renderer respect per-block `visible` rules for each viewport.

## 6. Relationship-Aware Deletion Safeguards

Before deleting any layout (`DELETE /api/layouts/:id`), safeguards prevent dangling dependencies:

- A template cannot be deleted while referenced by any active page (`templateId === id`).
- A pattern cannot be deleted while referenced by any layout block (`component === 'publisher.pattern'` and `props.patternId === id`).
- Clear, actionable error messages indicate the referencing pages and recommend retiring or detaching first.

## 7. Presentation Document Export & Import

The export and import routes (`/api/presentation/export` and `/api/presentation/import`):

- Export a portable `renegade-presentation-package` (version 1) containing all pages, templates, patterns, globals, and theme tokens.
- **Pre-Mutation Validation**: `validatePresentationImport` audits the package against the target theme's component registry and tokens _before_ modifying any database state. Any missing components or invalid schema structures are reported upfront, blocking mutation on incompatibility.

## 8. Verification & Test Evidence

- **Unit Suite (`tests/unit/pre-04-reusable-composition.test.ts`)**: 17 tests covering template validation, inheritance modes, immutable published snapshot guarantees, pattern instantiation (snapshot vs linked), global regions, theme style tokens, arbitrary CSS rejection, and export/import validation.
  - Overall unit test suite: **68 test files / 302 tests passed** (100% pass rate).
- **Integration Suite (`tests/integration/pre-04-reusable-composition.integration.test.ts`)**: 5 tests verifying PostgreSQL database persistence of templates, pattern safeguards, global region rollback, template retirement, and draft synchronization.
  - Overall integration test suite: **17 test files / 51 tests passed** (100% pass rate).
- **Browser Acceptance (`tests/browser/pre-04-reusable-composition.spec.ts`)**: End-to-end Playwright acceptance test exercising:
  - Multi-page Renegade Party mini-site setup.
  - Reusing a pattern as a linked instance.
  - Creating a second page from a reusable template with `inherited` mode.
  - Publishing Page 2 and proving anonymous visitors see published content.
  - Mutating the template to revision 2 and proving published Page 2 remains stable and unchanged until deliberately updated.
  - Editing a global region and verifying revision rollback.
  - Studio navigation verification (Pages, Templates, Globals, Patterns).
  - Responsive preview presets (`desktop`, `tablet`, `mobile`).
- **Bundle Isolation**: `npm run verify:presentation-bundles` confirms public routes exclude all editor modules.
- **Production Standalone Build**: `npm run build` compiled successfully in Next.js 16.3.0.
- **Lint & Format**: `npm run lint` and `npm run format:check` pass with zero warnings or errors.

Additive Migration: `20260912_040000_pre_04_reusable_composition.ts`.
