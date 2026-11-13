# RC2-G-02 — Analytics, experiments and optional graph projection

**Verdict: PASS** — journey 8/8 stages over real HTTP on the A-04 two-site world. Analytics and
experimentation are exercised end to end under consent; the graph/Neo4j boundary is inspected
and labeled honestly: **absent (E0), with the full journey passing and no runtime dependency on
it** — exactly the fallback posture the prompt requires.

## Stated test boundary

Analytics collection is off by default and is switched by `privacy.analyticsEnabled` in the
site-settings global. That global is **unwritable through the product in a multi-site install
(RC2-DEBT-16, P1, already filed)** — so the flag was flipped in-process by the setup spec
(`tests/rc2-g02/setup.spec.ts`), the same stated-boundary pattern as E-02's role grants. Every
surface under test after the flip — consent, collect, report, exposure, conversion, dashboard,
winner — is real HTTP through the running server. DEBT-16 remains the product-surface defect;
nothing in this prompt re-files or fixes it.

## Analytics: consent-first, proven both directions

- **No consent, no data**: an event POST without a consent cookie is refused
  `202 {reason: 'consent-required'}` and nothing is stored.
- **Grant → collect → dedupe**: after a consent grant, a `page_view` for the published article
  is accepted (201). Replaying the **same event id** returns `202 {deduplicated: true}` — event
  identity is idempotent; a duplicate cannot inflate the counts.
- **Operator report**: the site report's `eventCount` reflects the accepted event; the other
  site's admin is refused 403. Events or consent naming Site B over Site A's host are refused
  404 — collection is bound to the host-resolved site.
- **Opt-out is real in both directions**: after the visitor withdraws consent, new events are
  refused `consent-required`, **and their previously accepted events leave the operator report**
  (eventCount drops by exactly that visitor's contribution, 5 → 4 in the final run; the report
  counts only events whose subjects hold current site-scoped consent). Withdrawal is not a
  label — the data exits the reporting surface.

## Experiments: assignment, measurement, and an evidence-gated winner

The site's canonical public experiment (Homepage Hero CTA) was persisted with its two variants
(50/50, one control) and its conversion form (a public form with a published schema — the
loader additionally requires a _versioned consent revision_ on the schema; published schemas
are immutable, so the setup supersedes with a new published version rather than editing one).

- **Assignment is server-side and stable**: a visitor cannot choose a variant. The resolver
  buckets the consent subject deterministically (salted hash), and the exposure route accepts
  only the assigned variant — the journey discovered each visitor's assignment by the route's
  own verdicts until both variants were covered. Assignment requires **personalization**
  consent in addition to analytics consent.
- **Exposure without consent records nothing** (204, no event).
- **Conversion is bound to a real outcome**: the assigned visitor submits the configured form
  through the public forms route (201); the jobs worker materializes the trusted `form_submit`
  outcome; the conversion route then verifies prior exposure + the trusted outcome + the
  configured form before recording the conversion (201, `accepted: true`).
- **Operator readback**: the telemetry dashboard shows the experiment with its exposures and
  conversion.
- **The winner gate demands evidence**: approving the variant with **no measured conversions**
  is refused 409 ("Measured conversions for this variant are required before approval."). The
  variant holding the measured conversion was approved (200, decision recorded with the
  operator's documented reason) and then **rolled back** (200), returning the experiment to
  running. Decisions are human, reasoned, and reversible — and the sample-size honesty is the
  operator's recorded reason, visible in the decision record.

## Graph / Neo4j boundary (inspection, per the prompt: do not invent)

- There is **no Neo4j driver, client, or runtime reference** anywhere in `src/`. The only
  mentions are descriptive contract types (`projector: 'neo4j-optional' | 'none'` in core
  contracts; portability contracts). Canonical storage is PostgreSQL; no projection exists to
  enable.
- **Classification: graph projection is E0 in the CMS** — unchanged from the A-02 ledger and
  consistent with the governing roadmap (§4A: RC3 requires one narrow real projection demo or
  the graph is named E0 in the exit report). The working Postgres→Neo4j outbox lives only in
  the Foundation repo's public-platform, a separate codebase.
- **Fallback proven**: every stage above ran with no graph configured or reachable; nothing in
  the CMS runtime reaches for Neo4j. The RC3 job stands as named in the roadmap.

## Ledger consequences

- #34 Unified analytics: stays **E2** — its named gap asked for exactly this G-02 re-proof on
  current HEAD (published-article event → operator report with opt-out exclusion), now
  delivered; the remaining gap is cross-channel attribution depth. (Enabling the feature
  through the product in multi-site installs remains blocked by RC2-DEBT-16.)
- #36 Experimentation / A-B testing: stays **E2**, evidence refreshed to current HEAD at the
  HTTP layer (assignment, exposure, form-bound conversion, winner gate, rollback); the named
  gap narrows to the browser-level re-proof.
- Family journey row 9 (AI & Editorial Intelligence): G-02 evidence recorded; G-03 remains.

## Evidence

- `tests/rc2-g02/setup.spec.ts` — analytics flag (stated boundary) + experiment/form
  persistence.
- `tests/rc2-g02/journey.mjs` — 8/8 stages (final run, exit 0), including the mid-run winner
  approval and rollback.
