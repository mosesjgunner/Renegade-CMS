# Community completion evidence — 2026-09-24

Status: **PARTIAL — Community is not verified.**

ADR-0009 and the existing member, profile, forum, messaging, notification, moderation, and policy paths were inspected. This pass connected the existing conversations API to `/messages` for direct and group creation, listing, history, and sending. It also added a member-scoped notification preference endpoint and controls on member settings. The work uses canonical `members`, `profiles`, and the existing notification preference table.

Focused evidence: ESLint passed for the four changed source files. The 12 focused conversation, message request, and digest/outbox unit tests passed. Full typecheck still fails in the pre-existing untracked `scratch/schema-drift-audit.ts` file; no errors were reported for the changed source files.

**First unmet boundary:** The new `/messages` and notification preference controls have not been exercised through a running browser and HTTP server against persisted PostgreSQL state. No three-member, cross-site, cross-role test of these new controls was completed. Therefore, no Community release verification is claimed.

Further unproven boundaries include object-ID attacks against all new and existing routes, private attachment retrieval, search and notification leakage, realtime reconnect, worker restart, and backup/restore policy. The messages UI currently requires member IDs for composing; member discovery and request acceptance controls still need usable UI wiring. The existing service and unit coverage do not establish those browser and operational behaviors.
