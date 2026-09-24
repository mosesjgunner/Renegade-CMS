# AUD-04 audience operations

Lists and contact tags are organizational facts with source/audit provenance. They never grant marketing consent. Use an Audience Segment only with the typed rule builder: channel eligibility, consent purpose, lists/tags, form/campaign source, time-bounded engagement, locale, role, and registered commerce/community projections.

Before approval, inspect the rule explanation, estimate, sample (only if permitted), exclusions and stale-evaluation warning. Approval freezes a recipient snapshot containing the exact segment version, evaluation time, recipients, exclusion totals, and a SHA-256 evidence hash. Editing a segment never changes that snapshot.

Every delivery repeats the live eligibility/suppression check. A withdrawal, complaint, unhealthy address, frequency cap, or disabled provider wins over a snapshot. Lower numeric campaign priority wins ties deterministically. Use seed recipients only for test deliveries; they are not a consent bypass.

Automations accept only canonical confirmed-subscription, form-action, published-content/release, anniversary, community-event, and commerce-event triggers. Their fixed actions are delay, condition, an approved pinned message, tag/list change, task, notification, and exit. No scripts, loops, outbound mutations, or auto-activation are allowed. Pause preserves run state; cancel exits pending work; failures are retained for retry/dead-letter review.

Starter definitions are intentionally drafts: welcome, newsletter broadcast, conservative re-engagement, and form follow-up. Configure approved templates and explicit consent purpose before activating any of them.

## Release evidence still required

Focused engine tests cover nested rules, deterministic snapshots, and send-time safety precedence. Production readiness still requires PostgreSQL migration, authenticated operator/browser flows, query-plan measurement on production-shaped data, worker concurrency/restart/dead-letter evidence, live provider delivery, and backup/restore proof.
