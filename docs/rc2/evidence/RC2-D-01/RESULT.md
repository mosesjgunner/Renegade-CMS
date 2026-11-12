# RC2-D-01 — Editorial workflow, scheduling, and releases journey — RESULT

**Verdict: PASS — 11/11 stages green** (`tests/rc2-d01/journey.mjs`, seeded by
`tests/rc2-d01/seed-content.spec.ts`, against the two-site A-04 world served by
the production build; jobs worker running throughout).

## What was proven (editor + approver, two sites)

1. **Review cycle with audit.** Editor submits an article; the approver rejects
   it back to `rejected` with a comment; resubmission is approved. The companion
   record's review decisions/audit carry the reject (`submit=200 reject=200
approve=200`).
2. **Timezone-correct scheduling.** The calendar schedule takes a Chicago
   wall-clock time (`2026-11-12T08:11:47` America/Chicago) and the durable
   calendar audit stores the exact expected UTC instant
   (`2026-11-12T14:11:47.000Z`). The article is 404 before its time.
3. **Restart recovery.** Server AND jobs worker are killed and restarted inside
   the scheduling window; the worker still publishes the article at/after its
   due time (page 200, status `published`).
4. **Coordinated release with honest partial failure.** A release (named
   publication, valid timezone — an invalid IANA zone is refused with 400 at
   create) pins two artifacts: the workflow-approved article (pinned at its
   approved revision) and a media asset. Gates evaluate with **0 blockers**;
   review + approval succeed. Between approval and execution the media asset's
   rights are set to `restricted`; execution lands the article and **fails the
   media item with a visible reason** ("Rights approval is required."), leaving
   the release `partially-failed` and the article live.
5. **Exactly-once retry.** Rights restored; `retry` completes ONLY the failed
   media item (attempts 2) — the published article is never re-executed
   (attempts stays 1, executedAt unchanged); the release completes.
6. **Durable audit trail.** `release.created → artifact.pinned ×2 →
gate.evaluated → review.requested → approved → execution.completed →
execution.retried`.
7. **Grants.** A Site B principal gets 403 on Site A workflow submit, release
   create, and release execute.

## Findings

- **F1 — the approvals gate needs the pinned revision.** A release artifact
  only counts as "approved" when the pin carries the artifact's approved
  revision id/sequence (the Release Center UI does this; a bare pin reports
  "(missing approved revision)"). Behavior is correct; noted as the operator
  contract.
- **F2 — the redirect release step upserts by design.** A pre-existing rule
  with the same `fromPath` is adopted and updated (previous state captured for
  rollback), not a conflict failure — discovered while designing this journey's
  failure case; the rights-lapse failure above is the real partial-failure
  path.
- **Not exercised (named):** release rollback, release scheduling via the
  release's own planned instant (calendar scheduling was proven through the
  editorial calendar instead), and embargo-specific release gating.

**Family verdict:** Editorial Workflow & Releases moves to **E2 proven** in
`docs/rc2/RC2-12-FAMILY-JOURNEYS.md`.
