# UXI-08 — Standardize safety, forms, and feedback

Done on the setup spine: every setup error states what happened and the next action; passkey cancel is distinguished from failure; provider failure shows the recovery action from the readiness service; a disabled primary action (Open Admin Studio before acknowledgment) shows its reason inline. Platform-wide form/error standardization beyond the spine was not attempted in this pass.

---

## Continuation (Stage 5, workstream A) — the shared kit, built once and adopted

### The kit (`src/modules/admin/forms/`)

- `save-state.ts` — the persistence contract as a **pure reducer** (no
  React, unit-testable in the node test environment):
  `saveStateReducer`, `initialSaveState`, `classifySaveFailure`,
  `SaveConflictError`, `saveHttpError`.
- `useSaveState.ts` — `'use client'` hook, a thin binding over the
  reducer. `const { state, save, reset, isSaving, lastAcknowledgedAt,
lastAcknowledgedVersion } = useSaveState()`. `save(fn)` runs the
  surface's real server call and returns `{ ok: true, value }` or
  `{ ok: false, state }`; it never throws.
- `index.tsx` — components:
  - `FormField` (label + hint + error; children as a render prop
    receiving `fieldAriaProps`) and `FieldError` / `fieldAriaProps` /
    `fieldErrorId` / `fieldHintId` for hand-rolled fields.
  - `FormStatusSummary({ problems })` where a problem is
    `{ kind: 'input', fieldId, label, message }` or
    `{ kind: 'service', message }`.
  - `SaveStateIndicator({ state, onRetry?, onResolveConflict? })`.
  - `DisabledWithReason({ disabled, reason, repair?, children })` —
    clones the single action element, links the reason via
    `aria-describedby`, renders reason + repair inline.
  - `ConfirmDestructive({ triggerLabel, scope, consequence,
confirmLabel?, onConfirm, undo?, disabled? })` — inline
    `role="alertdialog"` confirmation; on success it shows the done
    state and the undo button **only when the surface passes a real
    `undo`**; otherwise it states completion cannot be undone from here.

### The standard (short)

1. Field errors are linked to their field (`aria-describedby` +
   `aria-invalid`) and say what happened **and** the fix.
2. A summary separates operator-correctable input errors (each an
   anchor link to its field) from service failures, and announces via
   `role="alert"`.
3. Save states are `idle / saving / saved / offline / conflict /
error`. **"Saved" renders only after a server acknowledgment**:
   the reducer honours `SAVE_ACK` only while a save is in flight, and
   the hook dispatches it only after the wrapped call resolves — there
   is no API by which a consumer can claim a save. `saved` carries the
   acknowledgment time and, when the server returns one, the version.
   A failure (including offline and HTTP 409) preserves the operator's
   work and says so; 409 lands in `conflict` with a call-site
   compare/reload affordance.
4. A disabled primary action shows its reason inline next to the
   action — never tooltip-only — plus the repair/next action when one
   exists.
5. Destructive actions confirm with scope + consequence in plain
   language; undo is offered after completion only where a working
   undo exists.

### Adoption (this stage)

- **EmailComposer** (`/admin/email-composer`): subject is a
  `FormField`; segment select and test-recipient input carry
  field-linked errors via `fieldAriaProps`/`FieldError`; validation
  (empty subject, no segment, empty test recipient) produces input
  problems in `FormStatusSummary`, while load/preview/evaluate
  failures render as the summary's service kind. Campaign
  save/review/schedule runs through `useSaveState` (success copy is
  set only from the ack outcome) with a `SaveStateIndicator` offering
  retry and conflict reload. Derive / Evaluate / Schedule primaries
  are `DisabledWithReason` (no articles, no segment, empty evaluated
  audience — each with its repair).
- **CatalogCommandCenter** (`/admin/catalog`, commerce): bulk archive
  is `ConfirmDestructive` inside `DisabledWithReason` (no selection →
  reason inline); archive now throws on failure so the confirm flow
  cannot report a completion that did not happen. Per-row Publish is
  `DisabledWithReason` naming the first readiness blocker. The import
  textarea is a `FormField`; invalid JSON is a field error stating
  the fix, not a status-line string.
- **ScheduleContentAction** (Publishing Center): both fields are
  `FormField`s; scheduling runs through `useSaveState` — the schedule
  API's real `409` (expected-sequence mismatch) lands in the conflict
  state with "Reload to see the latest version"; success keeps the
  previous behaviour (reload after ack).
- **TrashContentAction** (Publishing Center): the ad-hoc
  `<details>` confirm is now `ConfirmDestructive` with scope +
  consequence in plain language.

**Undo honesty:** no adopted surface exposes a working restore/undo
through its API (catalog archive has no un-archive transition; the
content trash retains revision history but this surface has no
restore), so no adoption passes `undo` — the kit supports it, and the
confirm copy on those surfaces says completion cannot be undone from
here rather than implying otherwise.

### Tests

`tests/unit/uxi-08-forms-kit.test.tsx` (25 tests): the reducer
(saving→saved only on ack; ack-from-idle and stale-ack invariants;
new save leaves `saved`; failure→error→retry→saved; 409→conflict with
server version; offline distinct from error; failure events outside
an in-flight save ignored), `classifySaveFailure` (409 /
`SaveConflictError` / offline network failure / plain error /
conflict-beats-offline), and static-markup component tests
(field aria linking, summary field anchors + service separation,
indicator states incl. never-"Saved"-without-ack rendering,
disabled-reason linking, confirm scope/consequence).

### What remains un-adopted (honest scope note for Stage 9)

Most operator surfaces still use their pre-kit patterns, including:
SocialCommandCenter, AudienceCommandCenter, ReleaseCenter,
EditorialWorkflowCenter, MediaCommandCenter / MediaLibraryClient
(upload + edit forms), CommunityModerationCenter, AiStudio,
CommerceOperations, SecurityCenter, StaffInvitations, the podcast
Studio workspace forms, and the Payload-native collection forms
(which keep Payload's own validation UI; the primitives'
`ValidationSummary`/`SaveStateNote` from GUI-02 remain the pattern
there and were not replaced). DraftAutosave already honoured the
ack-before-"saved" rule in its own code and was left as is. Stage 9's
final audit should sweep these surfaces against the standard above
and file the remainder rather than re-litigate the kit.
