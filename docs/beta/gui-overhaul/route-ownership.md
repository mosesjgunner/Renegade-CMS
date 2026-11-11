# Route ownership map — GUI-03A

Which tree actually serves each `/admin/*` surface, verified at runtime
(Nov 8, 2026, production build, fixture owner session) — not inferred
from source alone. This map is the reference for GUI-03B–03D and the
family passes; route names and access guards are unchanged by 03A.

## The two trees

- **Payload tree** — `src/app/(payload)/admin/[[...segments]]` renders
  everything registered in `src/payload.config.ts` `admin.components`:
  the dashboard, all custom views, and every collection/global screen,
  inside the Payload shell (Payload CSS, `--theme-*`, nav).
- **Frontend tree** — `src/app/(frontend)/admin/*` pages are plain
  Next routes wrapped ONLY by an auth-guard layout
  (`(frontend)/admin/layout.tsx` redirects non-staff to /login). They
  get the PUBLIC site's presentation system, not the Payload shell.

Runtime precedence (verified): where both trees claim a path, the
**frontend tree wins**.

## Collisions (both trees register the path; frontend serves)

| Path                  | Payload view (shadowed)      | Frontend page (serving)                                          | Verified                     |
| --------------------- | ---------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| /admin/email-composer | EmailComposer view           | `admin/email-composer/page.tsx` → same `EmailComposer` component | 200, frontend HTML signature |
| /admin/workflow       | EditorialWorkflowCenter view | `admin/workflow/page.tsx`                                        | 200, frontend signature      |
| /admin/audience       | AudienceCommandCenter view   | `admin/audience/page.tsx`                                        | 200 (content check pending)  |
| /admin/releases       | ReleaseCenter view           | `admin/releases/page.tsx`                                        | 200 (content check pending)  |
| /admin/telemetry      | Telemetry view (registered)  | `admin/telemetry/page.tsx`                                       | by registration              |

Note the email-composer collision is benign in content (both render
the same component) but not in chrome: the frontend copy renders
without the Payload shell — different fonts, no admin nav, public-site
styling. That inconsistency is register UX-05 in the wild.

## Frontend-only operator pages (no Payload view)

`ai`, `catalog` (+ `catalog/preview/[id]`), `commerce`, `fulfillment`,
`migration`, `social` — served by the frontend tree under the staff
guard layout. These are the GUI-07 family surfaces.

## Payload-only surfaces (the majority)

Dashboard `/`, capabilities, security, posts, pages, history,
navigation, media-library, indexing, redirects, rendered-quality,
moderation, design-system (02D), and all `/admin/collections/*` +
`/admin/globals/*` — served by the Payload tree with the full shell.

## Smallest safe chrome step taken by 03A

None in code. Deliberately: any shared-chrome change before 03B's
navigation work risks double-wrapping the Payload shell or stranding
the frontend pages mid-migration. The bounded, safe sequence is:
03B decides the one task navigation; 03C fixes context; the frontend
pages adopt the operator chrome (or migrate into Payload views) family
by family in GUI-07, each verified against this map. Changing route
precedence itself (deleting frontend duplicates) is a per-route
decision for those owner prompts, with the collision table above as
the checklist — starting with email-composer, where the Payload view
already exists and the component is identical.

**Exact next prompt: GUI-03B.**
