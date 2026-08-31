# First-party analytics and consent operations

Analytics is disabled by default. An owner enables it in **Site Settings → Privacy and first-party analytics**, reviews the consent version, and selects retention. The public system collects only a small first-party allowlist after an explicit analytics choice: page views, navigation/outbound clicks, search, read depth, form submissions, and downloads. No third-party tracker, fingerprint, raw IP address, or user-agent is stored.

The necessary `renegade-consent` cookie is signed, HttpOnly, same-site, and contains only a random consent subject, reviewed consent version, and category choices. It exists to remember the legal choice. Analytics identifier cookies are created only after analytics consent; withdrawal deletes them and creates an immutable withdrawal evidence record. Consent records store a salted subject hash, never the cookie subject itself.

## Policy and boundaries

- Categories: necessary (always on), analytics, personalization, and marketing. Personalization and marketing have no active tracker in this release.
- Global Privacy Control (`Sec-GPC: 1`) and Do Not Track (`DNT: 1`) suppress analytics when the matching owner policy is enabled (both default on).
- The server verifies the signed, current-version consent cookie and configuration again. A browser POST cannot turn server-side collection into a consent bypass.
- Bots, crawlers, headless clients, uptime monitors, and explicitly internal requests are discarded before persistence. The heuristic is defensive, not a promise of perfect bot classification.
- Client retries use an event id. Event source id/dedupe key is unique; a session is 30 minutes and the anonymous cookie lasts 90 days only after consent. Stored identifiers are salted hashes.
- Raw events expire at the configured 1–365 day retention (90 default). Rollups are intended for the configured 1–3650 day retention (730 default); only bounded, deduplicated UTC windows may be aggregated. Consent evidence is audit data and is not removed by raw-event cleanup.
- Public callers may only use collection and consent endpoints. `/api/analytics/report` and Payload Analytics collections require staff access and are site-filtered; public reporting never exposes event records.

## Event/data inventory

| Item            | Purpose                          | Stored data                                                                   | Retention                   |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| Consent record  | prove a choice/change/withdrawal | salted subject hash, choices, version, timestamp, site                        | audit policy                |
| Analytics event | aggregate use of a site          | event type/time, site, path/referrer context, salted anonymous/session hashes | configured raw retention    |
| Rollup          | basic operator counts            | site, metric, UTC window, dimensions, count                                   | configured rollup retention |

Operator checks: set the current legal consent version before publishing changed wording; test reject and withdrawal; inspect the staff report for the intended site; and run the retention job/process with a dry-run count before deletion. Do not add an event type, new client storage, or third-party destination without updating this inventory, review, and tests.
