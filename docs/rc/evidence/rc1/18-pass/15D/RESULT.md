# RC1 15D — PASS (2026-11-01)

Scoped Events, Calendars, Timelines, Sources and Quality PASS. Aggregate RC1 remains NOT READY. Only 15D executed; no commit, push, tag, external dispatch, live charge, publication or deployment of an existing environment.

Exact source: base `88a25b495ee5a7d6d1f259591ff93c1ec2394f82` plus the complete 1,586-file runtime manifest `source-tree.json`, SHA-256 `ce73e33931beafdfdbce142c6e44247c26be885960fa3b87f6a87c14435ef1fb`. Journey and PostgreSQL/web restart used identical source. Provenance verification passed with 0 drift.

Implementation:

- Canonical `events` collection provides timezone-aware start/end instants, IANA `timeZone` identifiers (`America/New_York`), lifecycle statuses (`draft`, `published`, `scheduled`, `cancelled`), venue and virtual meeting metadata, recurrence rules, and site tenancy.
- Public calendar route (`/calendar`) and event directory route (`/events`) implement unmounted module guards via `isRegisteredCollection(payload, 'events')`, cleanly returning HTTP 404 when disabled.
- Standard RFC 5545 iCalendar feed (`/events/feed.ics`) and single-event download (`/events/[slug]/ics`) implement strict line folding (`foldIcsLine`), DTSTART/DTEND with TZID or UTC Z, and public/published status filtering.
- Public event detail view (`/events/[slug]`) renders event metadata, venue, ICS download action, and Schema.org JSON-LD structured data (`Event` type).
- Canonical `timelines` and `timeline-memberships` support multi-event milestone ordering, site boundary enforcement (cross-site event linkage rejected by hook), and public rendering at `/timelines/[slug]`.
- Canonical `sources` collection manages bibliography entries, citation keys, credibility notes, and editorial review. Structured source citations are linked to articles via `article-family-content.sourceReferences`.
- Canonical `quality-policies` and `quality-issues` provide automated rule-based scanning (such as `media-alt-text` validation) and persistent audit findings.
- Truthful working/readonly dispositions recorded for all 17 auxiliary routes (`auxiliary-routes.json`).

Actual ordinary path and persisted facts:

`journey-trace.json`: 20 passed, 0 failed/skipped.
1. Next.js web server started cleanly on loopback port 39063 with dist dir `.next-rc115d`.
2. Published event "RC1 Community Summit 2027" created with local timezone `America/New_York` and physical venue details.
3. Future scheduled event created with future `publishedAt` timestamp.
4. Cancelled event created with status `cancelled`.
5. Cross-site foreign event created on Site Beta for multi-tenant boundary verification.
6. Published timeline "Renegade Milestones" created on Site Alpha.
7. Timeline membership created linking timeline to published Summit event.
8. Cross-site timeline membership rejected by tenant boundary validation hook.
9. Source bibliography record created with citation key and staff credibility notes.
10. Article updated with structured source citation reference on companion `article-family-content`.
11. Quality policy and `media-alt-text` inspection rule registered.
12. Quality scan executed and issue findings persisted in `quality-issues`.
13. Public `/events` renders published event and strictly excludes scheduled, cancelled, and foreign events.
14. Public `/calendar` places published event on April 15th with `America/New_York` timezone.
15. `/events/feed.ics` returns valid RFC 5545 VCALENDAR feed filtering private and foreign events.
16. `/events/[slug]/ics` returns single event VCALENDAR download.
17. `/events/[slug]` renders event detail view, ICS link, and Schema.org JSON-LD structured data.
18. Negative checks: Scheduled and cancelled event detail pages cleanly return HTTP 404.
19. Public timeline renders chronological milestones linked to canonical event paths.
20. All 17 auxiliary route paths verified with truthful working/readonly dispositions.

Negatives and restart:

- Unmounted route degradation cleanly verified for `/events` and `/calendar` using `isRegisteredCollection`.
- Scheduled (`publishedAt` in future) and cancelled events are inaccessible to public visitors and return HTTP 404 on `/events/[slug]`.
- Cross-site timeline membership creation is rejected by tenant boundary validation hook.
- `restart-trace.json`: 8 passed, 0 failed/skipped after container restart (`docker restart rc115d-20261101`) and new web process:
  - R1: Published event record survives PostgreSQL container restart.
  - R2: Timeline record survives container restart.
  - R3: Timeline membership query returns active milestone entries after restart.
  - R4: Source record survives restart with intact credibility and editorial notes.
  - R5: Quality scan and persisted issue findings survive container restart.
  - R6: `/events/feed.ics` serves valid VCALENDAR feed with Summit event after restart.
  - R7: Public event detail page renders fully in Chromium browser after restart.
  - R8: Month calendar grid displays scheduled event on April 15th after restart.

Commands and counts:

- Vitest unit tests: `tests/unit/events-and-auxiliary-15d.test.ts` (8 passed, 0 failed, 0 skipped).
- Scoped ESLint: `npx.cmd eslint "src/app/(frontend)/calendar/page.tsx" "src/app/(frontend)/events/page.tsx"` (exit 0).
- TypeScript check: `npx.cmd tsc --noEmit` (exit 0).
- Fresh migrations: 129 migrations executed cleanly on isolated disposable PostgreSQL container (exit 0).
- Journey acceptance: 20 passed, 0 failed, 0 skipped (exit 0).
- Restart acceptance: 8 passed, 0 failed, 0 skipped (exit 0).
- Total accepted behavioral checks: 36 passed / 0 failed / 0 skipped.

Runtime:
- Node v24.19.0, Next 16.3.8 development/webpack, Payload 3.90.2.
- PostgreSQL 17-alpine on loopback port 5478, container `rc115d-20261101`, DB `rc115d_release_acceptance`.
- Web port 39063, dist `.next-rc115d`.
- Events, calendars, timelines, sources, and quality policies are local; no live external calendar sync or remote audit claims.

Changed paths:
- `src/app/(frontend)/calendar/page.tsx`
- `src/app/(frontend)/events/page.tsx`
- `tests/unit/events-and-auxiliary-15d.test.ts`
- `tests/rc1-15d/journey.ts`
- `tests/rc1-15d/provenance.ts`
- `tests/rc1-15d/run.ps1`
- `tests/rc1-15d/tsconfig.json`

Open scoped blockers: none. Owned web/browser stopped; owned PostgreSQL stopped/data retained. Handoff is NEXT.md. Next subpass not executed.

