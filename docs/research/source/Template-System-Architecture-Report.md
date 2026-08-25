# Template System Architecture Report

## Executive recommendation

Build a **three-layer theme system**:

1. **Platform content model**: Payload collections and stable semantic blocks own Articles, Authors, Episodes, Events, Products, navigation, media, and rich content. Themes never own or redefine this data.
2. **Theme contract**: a declarative package defines tokens, layouts, slots, compatible components, placeholders, starter content, and optional visual-editor configuration.
3. **Trusted rendering code**: first-party or reviewed developer themes may add typed React components, server-side data adapters, and migrations. This is deliberately a different trust tier from a no-code theme.

Use a **hybrid layout model**: JSON serializes a page’s ordered sections and their safe props; React renders each section from a versioned component registry; semantic slots tell templates where durable content goes. Do not make saved JSX, HTML, Puck’s internal state, or a screenshot-derived DOM the durable source of truth.

For visual editing, integrate **Puck** as the primary canvas, wrapped in your own `PublisherEditor`. Puck is an MIT-licensed React visual editor designed to render application-owned React components and work with Next.js, while keeping data under the application’s control ([Puck](https://github.com/puckeditor/puck)). That matches the product much better than using GrapesJS as the site editor. Use GrapesJS only as an _import-lab / isolated legacy HTML editor_ if it proves useful; it has a capable HTML/CSS model but its project JSON, not exported HTML, is its reliable editor state ([GrapesJS storage model](https://grapesjs.com/docs/modules/Storage.html)).

The important product decision: **do not promise that every user can edit every pixel of every theme.** Let people safely change what the theme intentionally exposes. A separate Advanced CSS/File mode gives old-school tinkerers real access without letting drag-and-drop generate fragile production code.

## The operating model

| Person     | What they see                                | What they change                                               | What persists                 |
| ---------- | -------------------------------------------- | -------------------------------------------------------------- | ----------------------------- |
| Site owner | “Edit site” canvas, settings drawer, preview | copy, media, token choices, sections, navigation               | page layouts and site overlay |
| Power user | Visual, CSS, files, safe HTML embeds         | custom CSS, exported/imported section recipes, allowed markup  | CSS overlay and recipes       |
| Designer   | Theme studio                                 | layouts, component variants, placeholders, starter kit, tokens | a declarative theme package   |
| Developer  | local dev server and CLI                     | React renderers, fields, adapters, migrations, plugins         | signed code-theme package     |

Use human language in the product: _section_, _page pattern_, _site style_, _image guide_, _advanced CSS_, and _theme update_. Keep _component registry_, _schema_, and _migration_ in developer mode.

### The non-negotiable boundary

```
Content record  ── references / semantic facts ──► Theme adapter ──► React renderer
Page layout     ── section instances / safe props ─► Component registry ─► HTML
Site overlay    ── tokens / slots / CSS rules ─────► CSS cascade ──► presentation
```

An `Article` retains `title`, `dek`, `authors`, `heroMedia`, `body`, `sources`, `publishedAt`, and relationships. A theme can choose whether those appear in a newspaper masthead, a magazine card, or a long-form essay view. It cannot turn them into theme-private fields. A site may keep theme-specific visual decisions in `articlePresentation` only when the decision is optional and has a documented fallback, e.g. `heroVariant: "immersive"`; the Article does not store a theme component name.

## Platform content, blocks, and slots

Payload is well suited as the content/schema authority: its config is typed and code-first, and its Blocks field stores ordered objects with per-block schemas ([Payload config](https://payloadcms.com/docs/configuration/overview), [Blocks](https://payloadcms.com/docs/fields/blocks)). Use that capability, but do **not** let each theme invent arbitrary Payload fields at install time.

### Stable collections

- `articles`, `pages`, `authors`, `media`, `categories`, `tags`, `navigation`, `redirects`
- optional capability collections: `episodes`, `videos`, `books`, `events`, `programs`, `donations`, `products`, `testimonials`
- `site-settings`, `site-customizations`, `theme-installations`, `theme-update-plans`, `starter-content-runs`

### Two kinds of blocks

1. **Editorial blocks** belong inside article/page body: prose, pull quote, image, embed, table, callout, source list. They are platform-level, portable, accessible, and rendered in every theme.
2. **Composition blocks** belong in a page layout: Hero, ArticleGrid, NewsletterSignup, ProgramGrid, ImpactStats, CTA, BookFeature. They are registry components with a JSON-safe prop schema.

The registry has IDs such as `publisher.hero`, `publisher.article-grid`, `renegade.data-callout`. Every definition declares: input schema, editable fields, defaults, allowed children, rendering module, preview module, content requirements, capability flags, and fallback renderer. The renderer takes a normalized document/view model, not raw database records.

### Semantic slots

Core templates expose named locations, not paths into a React tree:

`site.header`, `site.utility-nav`, `page.before-main`, `page.hero`, `page.primary`, `page.sidebar`, `article.before-body`, `article.after-body`, `site.footer`.

Themes map their design to those slots. A site overlay can attach a compatible composition block to a slot. If a theme does not support `page.sidebar`, an attached sidebar block is shown in `page.after-main` with a migration warning, never silently dropped.

## Theme package specification

Package normal no-code themes as ZIP archives and install them into platform-managed storage. Code themes are npm packages or Git releases built in CI and installed only by an administrator. The installed runtime receives a compiled, immutable artifact and manifest, not a folder of arbitrary browser JavaScript.

```text
renegade-editorial/
├── publisher-theme.json
├── README.md
├── LICENSE
├── preview/
│   ├── cover.png
│   ├── home.png
│   └── article.png
├── design/
│   ├── tokens.json
│   ├── type-scale.json
│   └── styles.css
├── layouts/
│   ├── home.layout.json
│   ├── page.layout.json
│   └── article.layout.json
├── components/
│   ├── hero.component.json
│   └── article-grid.component.json
├── placeholders/
│   └── article-hero.placeholder.json
├── starter-kit/
│   ├── manifest.json
│   ├── collections.ndjson
│   ├── layouts.ndjson
│   └── media/
├── locales/en.json
└── code/                         # only in reviewed code themes
    ├── index.ts
    ├── renderers/
    ├── server-adapters/
    └── migrations/
```

```json
{
  "$schema": "https://publisher.example/schemas/theme/v1.json",
  "id": "org.renegade.editorial",
  "name": "Renegade Editorial",
  "version": "1.0.0",
  "platform": { "min": "1.0.0", "max": "<2.0.0" },
  "license": "AGPL-3.0-or-later",
  "kind": "declarative",
  "capabilities": ["articles", "authors", "books", "video", "comments"],
  "layouts": { "home": "layouts/home.layout.json", "article": "layouts/article.layout.json" },
  "slots": ["site.header", "page.hero", "page.primary", "article.after-body", "site.footer"],
  "components": [
    "publisher.hero",
    "publisher.article-grid",
    "publisher.newsletter",
    "renegade.data-callout"
  ],
  "settingsSchema": "design/settings.schema.json",
  "starterKit": "starter-kit/manifest.json",
  "integrity": { "algorithm": "sha256", "files": "integrity.json" }
}
```

**Declarative configuration belongs in the package**: metadata, tokens, layout trees, component selection, editable prop schema, slots, placeholder guidance, assets, defaults, starter content, and compatibility declarations. **Code belongs only in trusted packages**: React renderers, server adapters, a Payload plugin/migration, custom interactive behavior, and bespoke data logic. A theme must never ship database credentials, arbitrary install scripts, raw `<script>` tags, or a requirement to turn off CSP.

## Layout JSON and Theme IR

Use a small **Theme IR**, but constrain its job. It is worth it because the same declarative representation serves the visual editor, static-template importer, theme migration/validation, and AI conversion. It is _not_ a universal representation of arbitrary React applications.

```json
{
  "irVersion": 1,
  "kind": "layout",
  "routeType": "home",
  "regions": [
    {
      "slot": "page.primary",
      "children": [
        { "id": "a7", "type": "publisher.hero", "props": { "variant": "split", "source": "site" } },
        { "id": "a8", "type": "publisher.article-grid", "props": { "query": "latest", "count": 6 } }
      ]
    }
  ]
}
```

IR units are `DesignTokens`, `AssetRefs`, `ComponentInstances`, `Regions`, `Layouts`, `Bindings`, `ResponsiveConstraints`, and `PlaceholderSpecs`. The validator rejects unknown IDs, incompatible nesting, unsatisfied required props, raw JavaScript, and direct database queries. Store IR as normal JSONB with revision history. Compile it to a typed render plan at publish time; do not generate files on each edit.

Puck’s serialized data should be adapted to and from this IR through a versioned adapter. It is an editor transport, not the platform’s permanent standard. Craft.js likewise serializes its complete node state to JSON ([Craft.js](https://craft.js.org/docs/guides/save-load-state)); that makes it viable but more editor-centric and less attractive for a content platform.

## Visual editor and “FrontPage mode”

### Recommendation: Puck embedded in a Publisher shell

Puck provides the on-canvas selection, drag/drop, field editing, and component registration. The shell provides authorization, Payload draft/live preview, revision history, media picker, semantic slots, responsive previews, validation, theme settings, and an exit route that still works if Puck is later replaced.

| Candidate                  | Recommendation           | Why                                                                                                                                    |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Puck                       | **Integrate and extend** | React-native, component/schema based, Next-compatible, MIT, application owns data.                                                     |
| Payload Blocks + custom UI | **Build on**             | Great content/block persistence; insufficient alone for direct manipulation and designer canvas.                                       |
| Craft.js                   | Evaluate as fallback     | React-native and serializable, but more low-level editor framework and more UI/product work.                                           |
| GrapesJS                   | Import lab only          | Excellent HTML/CSS/legacy visual editing and export, but its free-form document model conflicts with controlled React/Payload layouts. |
| Custom editor from scratch | Avoid in V1              | You would spend the project on selection, DnD, history, keyboard behavior, and canvas bugs.                                            |

The Visual mode must only expose allowed controls. Each component schema classifies props as `content`, `presentation`, `layout`, or `advanced`. The Code tab is not an “edit JSX live” tab: it shows read-only generated layout JSON by default, with a validated JSON editor for power users. CSS is a site-owned override file. Files lets users browse assets, starter examples, and declarative files; code-theme source is viewable only when its license/package permits it and never browser-edited in production.

Direct editing is realistic for text, media, component props, and section order. Editing arbitrary nested JSX is misleading because it risks server/client boundaries, types, data fetching, and secure builds. The UX should say “Edit this section” rather than pretend a React application is a static HTML file.

### Responsive rules

Components own their default responsiveness; users can choose bounded variants and limited breakpoint overrides. Use CSS custom properties for tokens and a documented cascade: `reset < platform < theme < site-customization < emergency-override`. CSS variables participate in inheritance and cascade ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables)); cascade layers make that precedence explicit ([MDN @layer](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40layer)). Prefer container queries for reusable cards/sections, because they respond to their container rather than global viewport width ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries)).

Provide desktop/tablet/mobile previews plus warnings, not a requirement to hand-design all three. Lock structural breakpoints and allow only schema-defined values such as column count, gap, alignment, stack behavior, and image crop focal point.

## Placeholders and starter content

### Placeholder contract

Placeholders are media-field metadata, not images embedded in user content.

```json
{
  "id": "article.hero.editorial",
  "field": "article.heroMedia",
  "label": "Feature article image",
  "required": false,
  "aspectRatio": "16:9",
  "recommendedPixels": { "width": 1600, "height": 900 },
  "purpose": "Sets the story’s first visual impression",
  "guidance": [
    "Use an editorial image or conceptual illustration",
    "Keep the subject clear at small sizes"
  ],
  "accessibility": {
    "altRequired": true,
    "altHint": "Describe meaningful content, not the file name"
  },
  "responsive": { "fit": "cover", "focalPoint": true },
  "fallback": { "kind": "themeGraphic", "asset": "graphics/hero-fallback.svg" },
  "ai": {
    "promptHints": ["editorial illustration", "institutional incentives"],
    "requiresUserReview": true
  }
}
```

The empty state renders a purposeful graphic plus overlay controls: Upload, Choose media, See examples, and Get visual ideas. It should never publish to visitors as instructional text unless the theme explicitly chooses an attractive fallback.

### Starter kit, not demo pollution

Theme installation opens a deliberate decision:

1. Preview theme with ephemeral demo data.
2. Choose **Start with my existing content**, **Install a starter kit**, or **Import selected examples only**.
3. If selected, create a labeled, reversible import run in a separate draft workspace.
4. Ask the user to personalize/publish; keep the run’s record so all untouched demo items can later be deleted safely.

Starter text must be labeled guidance, not lorem ipsum. Seed only as drafts, mark all demo media and records with `starterRunId`, preserve slugs/namespaces, and never overwrite existing records. A screenshot preview may use a fixture database rather than actual inserts.

## AI assistance

AI is a contextual assistant, never the primary editor or a hidden automatic publisher. It may draft placeholder copy from the Brand Profile, propose headings, suggest image concepts and prompts, map detected HTML regions to approved components, flag missing alt text, propose a color adjustment, or show a mobile-risk explanation. Every action produces a visible diff or proposal, validates against the theme schema, and requires the human to apply it.

It may **not** silently change live layouts, run third-party scripts, infer legal rights to imported material, write custom production code into a no-code theme, make accessibility conformance claims without automated and manual checks, or use private content as an unspecified model-training input. Its useful output is deterministic artifacts: layout IR, CSS-token changes, mapping decisions, and original assets/prompts. The theme operates normally with no model/API key after creation.

## Safe customization and updates

Use an overlay model, not WordPress-style file mutation:

```text
Base theme (immutable, versioned)
  + site overlay (tokens, layouts, slot attachments, approved CSS)
  + custom package(s) (reviewed components)
  = active render plan
```

Every overlay operation is a typed patch against stable IDs: token override, component prop patch, add/move/remove section, slot attachment, navigation selection, and CSS override. Keep an append-only revision stream plus materialized current JSON. Never modify the installed base theme.

An update compares old and new manifests, runs declarative migrations, builds a preview render, performs schema/slot/component checks, and produces plain-language results: “three page patterns updated; one custom Hero setting needs a choice.” Auto-apply only patch-safe changes. Preserve unsupported section data as an inactive fallback revision; offer map/replace/keep-old-theme rather than deleting it. Require rollback snapshot, semantic version compatibility, and a test render before activation.

Child themes are valuable only for developers. Replace the WordPress inheritance maze with a **derived theme package**: declares a fixed base version range, carries an explicit overlay, and must be rebuilt/tested when the base changes. Ordinary users use the site overlay.

## Template conversion pipeline

The compiler is feasible as a **guided conversion system**, not a magic one-click converter. Build it around a staged, inspectable evidence model:

```text
Import folder/URL (authorized) → parse DOM/CSS/assets → identify regions/patterns
→ extract tokens and responsive clues → candidate Theme IR → visual mapping review
→ generate declarative package + CSS → screenshot/DOM regression checks → package
```

The compiler needs: HTML parser (parse5/Cheerio), CSS parser with selector/variable analysis (PostCSS), asset scanner, DOM-to-visual geometry via Playwright, breakpoint screenshots, a component-pattern clustering pass, token extraction, AST/code analysis for supported React inputs, and an optional multimodal model that returns structured mapping proposals. The AI gets DOM/capture summaries and a strict JSON schema; it does not directly emit trusted executable code.

### Strategy by source

| Source          | Outcome                              | Why / strategy                                                                                                                |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Static HTML/CSS | Mostly automatic                     | Parse structure, assets and CSS; map repeating cards/regions; human binds CMS data.                                           |
| Bootstrap       | Mostly automatic                     | Familiar component/layout conventions improve mapping, but custom JS/plugins need review.                                     |
| Tailwind        | Semi-automatic                       | Extract markup and visual system; utility classes can be preserved only as isolated CSS or remapped.                          |
| WordPress theme | Semi-automatic to manual             | Reuse markup/styles where licensed; PHP hooks, plugin logic, shortcodes, custom fields and WooCommerce are not portable code. |
| Ghost           | Mostly automatic                     | Handlebars templates and standard post data are relatively approachable; helpers must be mapped.                              |
| Hugo/Jekyll     | Semi-automatic                       | Templates/content front matter map well; custom shortcodes/data sources need recreation.                                      |
| Webflow export  | Mostly automatic                     | Exported static HTML/CSS/assets convert well; CMS interactions and platform behavior do not.                                  |
| React           | Semi-automatic                       | AST-assisted extraction if components are presentational and dependencies are available; hooks/data code stays manual.        |
| Next.js         | Semi-automatic to manual             | Presentation can migrate; App Router, RSC/client boundaries, server actions and data/auth logic must be re-engineered.        |
| Screenshot only | Manual reconstruction with AI assist | Can infer hierarchy, tokens and patterns, not legal ownership, semantics, interactions, hidden states, or responsive rules.   |

For WordPress, split the job explicitly: **design/migration** is fair target; PHP business logic, plugins, shortcode behavior, Elementor runtime, WooCommerce and custom data models are separate scoped migrations. Rendered-site DOM plus uploaded theme source gives better results than either alone. Ghost, static sites, and exported HTML are the flagship early paths. Do not begin by promising WordPress one-click conversion.

Screenshot/reference mode must require ownership/authorization attestation. It creates original markup and uses no copied assets or proprietary source. The importer records source URL/file hashes, detected license, user attestation, and exclusions. Open-source/license-compatible templates may be packaged with attribution. A theme marketplace must surface license, author, source, dependencies, and a “rights not verified” warning.

## Security model

| Package tier        | Allowed                                                                   | Prohibited                                                                   |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Declarative theme   | JSON, CSS subject to validator, approved assets, components from registry | JavaScript, executable install hooks, arbitrary dependencies, remote scripts |
| Reviewed code theme | compiled/signed React/server modules, declared permissions                | postinstall scripts, dynamic code evaluation, unpinned dependency graph      |
| Site overlay        | token patches, layout patches, scoped CSS, approved embeds                | source edits to base theme, inline JS                                        |

Require signed manifests and checksums, lockfiles/SBOMs for code themes, dependency/license/CVE scanning, explicit declared capabilities, administrator approval, and preview in an isolated environment. Use restrictive CSP, which Next.js explicitly recommends for protecting against threats such as XSS ([Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)). Broker any remote media/embeds through an allow-list and privacy review. Never treat a browser iframe as an adequate sandbox for server-side theme code.

## Performance and accessibility baseline

Themes must pass build-time rules and release tests. Next.js Server Components do not add client JavaScript bundle size, so defaulting rendering/data work to the server is a strong policy ([Next.js production guide](https://nextjs.org/docs/app/guides/production-checklist)).

| Budget / requirement            | Baseline                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Initial route JS owned by theme | ≤ 170 KB gzip; warn at 130 KB                                                                                        |
| Per interactive component       | ≤ 35 KB gzip unless approved                                                                                         |
| Third-party scripts             | none by default; ≤ 2 approved, async/lazy, consent-gated where needed                                                |
| Images                          | responsive sizes, next/image or equivalent optimizer, modern formats, dimensions always declared                     |
| Fonts                           | ≤ 2 families / 4 faces initial load; self-host/subset; `font-display: swap`                                          |
| Motion                          | no essential information only in motion; honor `prefers-reduced-motion`                                              |
| HTML semantics                  | one H1, ordered headings, landmarks, native controls first                                                           |
| Contrast                        | WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)) |
| Keyboard / focus                | every action reachable; strong focus indicator; no keyboard trap                                                     |
| Pointer targets                 | at least 24×24 CSS px except WCAG exceptions ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/))                         |

Run TypeScript/schema validation, ESLint, Lighthouse/Web Vitals budgets, axe-core, keyboard smoke tests, Playwright visual snapshots at 360/768/1440px, link checks, and content-required-field checks. Automation catches common defects, not all accessibility problems; each first-party theme still needs manual screen-reader and keyboard review.

## Theme authoring tools

### No-code Theme Studio

Start from an existing theme, an approved starter skeleton, an authorized static import, or reference-driven reconstruction. Then select tokens, configure page patterns, add registry components, define sample content and image guides, preview with fixtures and existing content, run checks, and export a declarative ZIP. Designers can duplicate a page/section/component and save a section recipe. The starter is never a blank canvas: each step has a working example.

### Developer kit

Provide `create-publisher-theme`, local fixture content, hot reload, typed registry APIs, schema generation, package validation, build/test/lint commands, visual regression screenshots, a11y tests, package signing, and a playground. Code components must declare client boundaries. Data adapters fetch normalized platform view models; they do not reach into arbitrary tables. Payload’s admin can be customized with React components and supports live preview, making it practical to house core authoring experiences there ([Payload Admin](https://payloadcms.com/docs/admin/overview)).

## First three production themes

### 1. Renegade Party

An unapologetically editorial political-think-tank theme: dark ink, paper, red/blue accents used sparingly, document/pamphlet details, oversized serif headlines paired with clean utility sans, and strong evidence/diagram modules. Home page: featured argument, latest essays, issue positions, data/evidence explainer, books/media, author identity, email call. Article: readable long-form width, byline, source trail, pull quotes, sticky reading progress, related positions, share/comment area. Signature components: `EvidenceCard`, `ClaimCounterargument`, `TimelineSlice`, `PositionCallout`, `SourceRail`. It proves the framework can handle complicated, data-dense editorial material without being a generic blog skin.

### 2. Modern Creator

Bright, flexible, personality-led visual system with dynamic media cards, prominent latest video/podcast module, newsletter, affiliate/product shelves, course/book/project promotion, social links, and a compact article feed. Home page routes visitors by intent: watch, listen, read, hire, buy, join. Article pages prioritize an author’s voice but support embeds and conversion modules. Signature components: `NowPlaying`, `CreatorLinkStack`, `FeaturedProduct`, `EpisodePlayer`, `RecommendationShelf`. It proves content types can be presented as a creator business rather than a publication.

### 3. Nonprofit / Organization

Warm, credible, action-oriented theme with mission clarity, programs, events, impact stats, team, donation/volunteer calls, local news, partner logos and transparent reporting. Home page follows: mission → human impact → programs → evidence/metrics → upcoming event → ways to help. Signature components: `ImpactMetric`, `ProgramGrid`, `VolunteerCTA`, `DonationCTA`, `EventList`, `AnnualReportLink`. It proves the slot and capability model supports operational organizations without overloading them with irrelevant creator controls.

## Build, integrate, and extend matrix

| Subsystem                                      | Decision                                            | Rationale                                                            |
| ---------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Content collections, auth, workflows, media    | **Extend Payload**                                  | Core CMS responsibility and typed schema foundation.                 |
| Stable editorial blocks                        | **Build on Payload Blocks**                         | Portable platform blocks and admin UX.                               |
| Visual canvas                                  | **Integrate Puck; wrap it**                         | Avoid rebuilding canvas fundamentals while retaining data ownership. |
| Theme IR, validator, registry, slots, overlays | **Build**                                           | This is the platform’s durable differentiator.                       |
| CSS tokens/layers/responsive constraints       | **Build with web standards**                        | No framework lock-in; themes remain inspectable.                     |
| Conversion compiler                            | **Build incrementally**                             | Needs your content bindings and theme contract.                      |
| HTML/CSS parsing and browser capture           | **Extend open source**                              | Use proven parsers/PostCSS/Playwright, not homegrown parsers.        |
| AI mapping assistant                           | **Build orchestration around models**               | Strict JSON contract, review UI, deterministic outputs.              |
| Accessibility/performance test stack           | **Integrate**                                       | axe, Playwright, Lighthouse/Web Vitals.                              |
| Package registry/marketplace                   | **Build later; use signed ZIP/npm now**             | Do not make V1 depend on marketplace operations.                     |
| Legacy freeform HTML authoring                 | **Extend GrapesJS only if import demand proves it** | Keep it isolated from public rendering architecture.                 |

## V1: the smallest correct foundation

1. Define platform content schemas and 12–18 stable editorial/composition blocks.
2. Implement typed component registry, slot contract, layout IR v1, render-plan compiler, CSS token cascade, and overlay revisions.
3. Integrate Puck only for composition pages and the home/page visual canvas; use Payload’s normal editor for articles.
4. Ship one first-party declarative theme, starter-kit flow, placeholder system, preview/publish, backups, and validation.
5. Add trusted code-theme packaging plus theme-update preview before any public marketplace.
6. Build **static HTML/CSS import-lab** with parser, screenshot comparison and mandatory mapping review. Do not ship WordPress conversion yet.
7. Prove portability by finishing the other two production themes before expanding conversion or AI features.

## Risks and unresolved questions

- Puck is a dependency, so retain a clean IR adapter and a test suite that makes editor replacement possible.
- A “designer creates a fully new component” promise becomes coding as soon as the component needs novel behavior. V1 should offer composition and variants, not arbitrary component invention.
- Payload schema changes triggered by third-party themes are a migration and security problem. Keep ordinary themes capability-driven rather than schema-owning.
- Perfect visual conversion is unattainable when the source lacks responsive states, interactions, fonts, assets, or permission. Show confidence and review queues, not fake certainty.
- CSS overrides can damage accessibility and responsiveness. Scope them, lint them, provide a reset, and make theme upgrades preview them.
- Arbitrary third-party React is equivalent to granting code execution. A marketplace must be a trust/review system, not an upload form.
- AI-generated image/copy outputs need rights, privacy, and factual-review policy. Keep them proposals, not implicit publication.
- The editor’s “directness” can create a false sense that global changes are local. Always show whether an edit changes one page, a reusable section, or the site style.

## Final decision

The product should feel like an editable website template because it exposes inspectable tokens, layouts, assets, guidance, and safe CSS. It should remain a durable Next.js/Payload system because the public site is rendered from typed React components against a stable content model. The bridge is a narrow, versioned Theme IR plus semantic slots and immutable base-theme overlays. That is the architecture that makes visual editing, portability, upgrades, template conversion, and optional AI reinforce each other instead of becoming separate fragile systems.
