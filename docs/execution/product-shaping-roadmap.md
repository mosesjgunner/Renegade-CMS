# Renegade CMS product shaping roadmap

Date: 2026-10-16. This is a product and design plan, not release acceptance evidence.

## The decision

Reach a complete everyday WordPress core baseline first: an owner can install the CMS, design a site, publish and organize content, manage media and discussion, control users, handle SEO, maintain the site, and move its data without editing code. Community, audience, commerce, AI, and other enabled modules should then join that experience as complete, clearly labeled journeys. The number of implemented modules is not the measure of completion.

The current RC1 work is an engineering and release track. Stage 06 has independent sign-off, and Stage 07 has a Gemini handoff awaiting independent Sol acceptance. Neither establishes that the product looks polished or is easy to learn. Keep this roadmap separate from the RC1 gate; do not relabel existing test receipts as design or usability proof.

## What the repository suggests today

- There is real breadth: publishing, presentation, media, identity, operations, and optional modules already have routes, services, tests, and acceptance documents. Reuse these contracts instead of starting over.
- The admin mixes Payload views and Next.js routes. `PublisherDashboard.tsx` is a useful work queue, but its primary structure is plain headings, paragraphs, and lists with inline spacing. Other workspaces use their own CSS modules or local styles. A shared visual and interaction language is needed.
- The public presentation system already has themes, tokens, templates, and a visual editor. Its existence does not guarantee attractive default sites. Archived presentation screenshots show a sparse neutral home and a mobile campaign page that reads like unstyled text. These are historical examples to check against the current running build.
- The earlier product completion plan puts the UX sweep near the end. Move design and usability work to the front, then apply it continuously as workflows are completed.
- The current working tree contains unrelated edits. Preserve them; do product work in a separate branch or worktree and bind evidence to its exact source.

## Mandatory WordPress baseline

This is an **outcome parity** target for the everyday WordPress core experience, not a promise to run WordPress themes/plugins or duplicate every marketplace plugin. WordPress currently exposes posts/pages, revisions and autosaves, roles, media, comments, navigation, site templates/patterns/styles, permalinks, import/export, and extension management. Use its [admin screen guide](https://wordpress.org/documentation/article/administration-screens/), [Site Editor guide](https://wordpress.org/documentation/article/site-editor/), [roles guide](https://wordpress.org/documentation/article/roles-and-capabilities/), [comments guide](https://wordpress.org/documentation/article/comment-moderation/), and [export guide](https://wordpress.org/documentation/article/tools-export-screen/) as the comparison references. Assess each row through ordinary Renegade UI and persisted output; existing code alone means **candidate**, not **pass**.

| Required area              | Ordinary outcome to prove                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install and settings       | Complete first run; set site identity, homepage, reading/discussion settings, time zone, domain and permalinks; see readiness and recover from misconfiguration     |
| Content                    | Create/edit posts and pages with useful rich blocks, drafts, preview, revisions/autosave, scheduled publishing, trash/restore, bulk actions, and safe URL changes   |
| Organization and discovery | Categories/tags or equivalent taxonomies, author/archive/search pages, navigation menus, RSS/feeds, canonical URLs, redirects, and SEO controls                     |
| Media                      | Upload, browse, search, replace, crop/edit where promised, set alt text/captions, reuse assets, and preserve original files and access rules                        |
| Design                     | Choose and customize a theme; edit home, header, footer, templates and reusable patterns; preview responsive output and roll back a bad change                      |
| Discussion                 | Enable/disable comments per content, approve/reply/spam/trash, handle abuse, and show only approved public output                                                   |
| People and access          | Invite/manage users, role and site permissions, session/recovery controls, and safe denial across sites                                                             |
| Data and operations        | Import/export ordinary site content and media, back up and restore, run updates/migrations safely, see failures and repair paths                                    |
| Extensibility              | Documented, versioned slots for themes, blocks, fields, routes, events/hooks, providers and integrations with capability, compatibility, security and upgrade rules |

For each row, record **pass / partial / missing / intentionally different** with a link to a current browser journey. An intentional difference is acceptable only when the same everyday user goal is still achieved. Every partial or missing core item becomes a blocking backlog task before a WordPress-baseline claim.

### SEO is part of that baseline

**Yes, Renegade has SEO tools in source today.** There are editable SEO title, description, canonical URL, image alt, keywords/focus phrase and noindex fields; an editor discovery preview; shared metadata/structured-data generation; sitemap and robots routes; redirects; indexing and rendered-quality admin views. The historical DISC-06 report records a broader discovery pass on its older candidate. Five focused discovery unit files also pass on this working tree (44 tests, 2026-10-16). These facts establish implemented capability, not a fresh end-to-end SEO sign-off.

The mandatory SEO journey is: set site defaults and canonical origin → write a post/page → inspect search/social preview → set title, description, image, indexability and URL → publish → inspect raw public HTML for title, description, canonical, robots, Open Graph, social card and appropriate JSON-LD → inspect sitemap/robots/feed and search inclusion → rename URL and verify the redirect → unpublish/noindex and verify removal → run the quality/indexing audit and follow its repair link. Repeat for home, article, page, archive, taxonomy and one enabled specialized content type, including a second site and mobile admin view. Test draft/private exclusion, bad canonical inputs, missing/expired images, and restart/revalidation. External search-engine ranking or indexing is outside the product's control; show submission or handoff status honestly.

Treat the SEO workflow as **unverified on the current candidate** until that browser and raw-response matrix passes. Improve the UI where advanced JSON fields, scattered settings or poor repair guidance force users to understand internal contracts to perform a basic SEO task.

### Slots for becoming a broader tool

Keep the everyday baseline stable while providing explicit extension points for future capability: versioned manifests and compatibility checks; site/role permissions; theme/template/block registration; admin navigation and settings surfaces; server-side events and jobs; provider adapters and webhooks; data migrations, disable/uninstall behavior and backup/restore coverage. The repo has extension contracts and presentation slots already, but each slot needs a supported lifecycle and one working example before it is called ready. Do not expose an extension marketplace or arbitrary code installation as complete on the strength of contracts alone.

## Product standard

A feature is ready when a new operator can discover it, understand the next action, complete it through the ordinary UI, see the persisted result, and recover from a realistic mistake. Its public output must be credible on desktop and mobile. Disabled or provider-dependent actions must say what is available and why. Access checks remain authoritative on the server.

Use one coherent 16-area admin map: Dashboard, Publishing, Media, Presentation, Discovery, Workflow, Distribution, Audience, Community, Commerce, Analytics, Users, Roles, Providers, Site Settings, and Maintenance. Show only relevant areas for the active role, site, and module set. Preserve clear breadcrumbs and return paths.

## Every intended feature must be discoverable and usable

Completion covers the WordPress baseline **and the existing intended Renegade capabilities**. The baseline sets implementation order; it does not remove the broader product from the completion target. Build one feature ledger from the core registrations, all 17 optional module manifests, public/admin routes, navigation, provider capabilities and user documentation. Include AI and other core capabilities even when they are not separate optional modules. Break broad modules into actual tasks: for example, books, podcasts, video and graphics each need their own journey.

Each feature row must record its user-facing name, owning module, intended actor/site, navigation location, setup requirements, main action, visible result, error/recovery path, current limitation, browser evidence and next repair. Track **discoverability, setup, functionality, visual quality and acceptance separately** so a buried working feature or an attractive unfinished screen cannot receive an overall ready verdict.

An authorized owner must be able to browse the product's capabilities and understand what each does. Enabled features need a clear working entry point in the appropriate workspace. Disabled features need an explanation of prerequisites and the supported activation path, including deployment configuration when required. Provider-dependent features need connection setup, an actionable readiness status and a clear distinction between local, sandbox and live operation. The first-use screen should help the user begin with real data; subsequent visits should show real work, results and failures.

The visibility audit must inspect `applyProgressiveDisclosure` and conditional links in `PublishingLinks`: the current source hides many backing collections and only renders some module links when registered. Account for each intended user task through a supported workspace. Internal records may stay hidden when their user-facing workflow is complete. Missing navigation, setup or task UI is a repair item; hiding an intended feature does not complete it. Reconcile module summaries, scope documents and actual behavior where their status labels disagree.

The final walkthrough must start from the normal dashboard and reach every intended feature through the UI, configure it through the supported path, complete its primary task, inspect its saved/public result, and resolve a representative failure. Capture desktop/mobile output and role/site boundaries. An explicitly future extension slot may be ready as an extension contract with a working example; an advertised feature needs its actual user journey to pass.

## Sequence

| Order | Work package             | Concrete output                                                                                                    | Exit gate                                                                                                                                        |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | WordPress baseline audit | Core parity matrix, SEO journey, current desktop/mobile screenshots, severity-ranked friction register             | Every required area has a current ordinary-browser verdict and each issue has a URL, actor, reproduction, screenshot, owner and proposed fix     |
| 1     | Product shape            | One-sentence promise, primary users, first-release capability map, navigation model, and task flows                | A new operator can identify the primary action on every core screen; each visible module has an explicit complete, limited, or unavailable state |
| 2     | Design foundation        | Figma or coded reference screens, shared tokens/components, content and interaction rules                          | Dashboard, editor, media, setup, and one public starter use the same type, spacing, color, status, form, and feedback patterns                   |
| 3     | Core baseline            | Refined install, setup, design, content, media, comments, SEO, users, import/export, operate and recover workflows | All mandatory WordPress baseline rows pass in a real browser with persisted state; no fixture shortcut or code edit is needed                    |
| 4     | Public experience        | Two credible starters and their key templates, responsive content and imagery, theme customization                 | An operator can personalize, publish, and switch a starter without losing canonical content or URLs; real mobile pages remain usable             |
| 5     | Optional module slices   | Focused end-to-end improvements to enabled modules, ordered by user value                                          | Each slice has customer and operator actions, honest provider states, error/retry handling, persisted output, and role/site checks               |
| 6     | Product acceptance       | Usability, accessibility, visual, performance, recovery, and RC evidence review                                    | No critical journey blocker or dead control; independent RC gates pass on a frozen candidate before release claims                               |

### 0. Audit the product people actually see

Run a disposable install with test-auth off and ordinary owner, staff, member, and visitor sessions. Capture the current admin and public surfaces at desktop and mobile widths with console/network errors. Walk every row of the mandatory WordPress baseline, the full SEO journey, and one enabled commerce or audience path. Check empty, loading, success, validation, denied, offline/provider-unavailable, and retry states. Record where the first-time user gets lost or sees something visually unfinished. Include basic accessibility and performance measurements, but have a human review the rendered pages too.

Prioritize findings by impact: **P0** data loss, authorization, money, or broken core journey; **P1** user cannot finish a promised task; **P2** confusing or visually weak core screen; **P3** localized polish. Fix P0/P1 before decorative work. Use the audit to set the first backlog; do not assume archived screenshots are current.

### 1. Give the product a clear center

Define the default experience as a **complete site builder and publisher** with the everyday WordPress baseline available. Let additional capabilities appear when enabled and ready for use. Make the dashboard a guided home: site status, next publishing action, drafts awaiting attention, scheduled work, failed jobs, and a link to the public site. Give each status a source, timestamp, and action. Remove duplicate routes and vague “command center” names where a task name is clearer. Keep advanced operations available to authorized users without making them the first screen for everyone.

Write three task flows before redesigning screens: new owner publishes a site; editor drafts and requests review; owner resolves a failed publication or provider task. These flows determine information hierarchy and navigation.

### 2. Create a design system and prove it on representative screens

Choose a deliberate visual direction for the admin: calm editorial workspace with clear hierarchy, restrained color, generous but efficient spacing, and strong typography. Define semantic tokens for light/dark surfaces, contrast, spacing, type scale, borders, elevation, focus, and status. Build reusable page header, action bar, card, table/list, form field, empty state, inline alert, confirmation dialog, progress step, and status badge. Put accessibility behavior and responsive rules in each component definition.

Design and implement five representative screens first: setup, dashboard, content editor/list, media library, and theme/public preview. Review them together in the browser at 375, 768, and 1280 pixels before propagating styles. The public themes should share accessibility and content-quality rules but retain distinct visual identities; do not force the admin aesthetic onto every customer site.

### 3. Finish the core journey before widening the surface

Polish the first-run path so an operator knows what must be configured, what can wait, and what is safe to publish. In the editor, make draft, preview, review, scheduled, and published state obvious. Show validation and publish outcomes next to the action that caused them. Make media selection and replacement understandable without exposing storage machinery. Ensure dashboard links take users to the exact item requiring work. Test with real persisted content, not seeded success screens.

### 4. Make the default site worth showing

Create two strong starter experiences: a publication and a campaign/commerce site. Each needs real composition, imagery, typography, navigation, article, archive/search, contact or signup, legal pages, and relevant member/commerce pages. Provide realistic local sample content that can be replaced in the UI. Inspect long titles, sparse content, empty collections, missing images, and narrow screens. Use the existing theme/package and presentation contracts; protect published snapshots and canonical URLs when changing themes.

### 5. Complete optional modules as vertical slices

Select the next slice from actual target-user demand and the audit, not code volume. A sensible initial order is audience/newsletter, community participation and moderation, then commerce checkout and operations; AI, analytics, federation, and additional providers follow when their core user journey has a clear place in the product. For every enabled slice, finish its navigation, setup, primary action, result, error/retry, operator recovery, and documentation together. Local harness, sandbox, and live provider outcomes need separate labels.

## Review gates for every work package

1. **Design:** current screenshots and a short before/after explanation; coherent desktop/mobile hierarchy and copy.
2. **Function:** real browser journey with supported authentication, persisted database/media result, restart where state matters, and no dead links or fake success.
3. **Safety:** role/site boundaries, server-side authorization, truthful provider state, and no regression to existing content or migrations.
4. **Quality:** keyboard and screen-reader checks on the changed flow; responsive layout; targeted tests plus relevant build/type/lint gates.
5. **Evidence:** exact source SHA/tree, environment without secrets, commands, screenshots, first failure, and open limitations. A passing unit test is not a product acceptance verdict.

## First implementation cycle

Start with package 0, the mandatory WordPress parity matrix and SEO journey, and the three task flows from package 1. Fix any missing core baseline outcome before broader module work. Then ship the shared design foundation through the dashboard and first-run setup, followed by the editor and public starter. This creates a visible, testable improvement early and exposes any design rule that fails on real product complexity. Keep RC1 final acceptance on its existing source-bound track; this roadmap may produce a later candidate, but it does not change the current release verdict by itself.
