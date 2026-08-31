# Events/calendar workflow evidence

Events remain canonical `events` records scoped by site, publication, space, and owner. Admin users create and edit them in Payload’s Calendar group; `beforeValidate` enforces valid instants, IANA time zones, end ordering, capacity, virtual meeting links, and bounded recurrence inputs.

Public discovery uses the existing Phase A `canDiscoverPublic` contract: drafts, future scheduled events, private/unlisted records, and cancellation are not exposed. `/events` scopes its query to the active public site, supports a bounded date-range list and pagination; canonical event pages preserve `<time datetime>` semantics; `/events/feed.ics` and `/events/[slug]/ics` provide calendar consumption.

Recurrence supports daily/weekly/monthly series only, capped at 250 occurrences and a 366-day expansion range. Editing the series updates the parent event. Editing one occurrence is represented by `recurrenceOverrides` keyed by the original start instant; an override with `status: cancelled` suppresses that occurrence. Ticketing, payment, inventory, and check-in remain deferred: `registrationUrl` is the stable external handoff.

Validation: `npm test -- events-contracts` covers DST wall-time preservation, recurrence boundaries/one-off cancellation, ICS generation, draft exclusion, malformed dates, invalid zones, and virtual-event validation. `tests/browser/events-workflow.spec.ts` covers creation → publication → public discovery → feed consumption → cancellation → unpublish against a migrated PostgreSQL stack.
