# FLOW-01: Renegade CMoS Workflow & Editorial Loop Specifications

## Overview

Workflow Pass **FLOW-01** implements the full multi-tenant **Renegade CMoS Workflow**, extending the canonical FLOW-00 state machine contract with configurable workflow templates, dead end and privilege escalation validation, task assignment (owner, editor, reviewers, priority, watchers), SLA due date tracking, personal/team review queues, stale approval protection, emergency overrides, bulk queue operations with partial-failure reporting, actionable admin dashboard navigation, and comprehensive audit history.

---

## Key Features & Invariants

### 1. Built-in Simple Workflow & Configurable Templates (`src/modules/editorial/cmos-workflow.ts`)

- **Built-in Simple Template (`BUILTIN_SIMPLE_WORKFLOW_TEMPLATE`)**: Pre-configured simple 3-stage workflow (`draft` ➔ `review` ➔ `approved`) suitable for small sites.
- **Configurable Templates (`WorkflowTemplate`)**: Allows defining custom stages, eligible roles per action (`submit-for-review`, `decide-review`, `request-changes`, `withdraw`, `cancel`, `reopen`, `emergency-override`, `reassign`), required approval count/order, optional quality gates, SLA due offset hours, emergency override allowance, self-approval prevention, and site scope guards.
- **Template Validation (`validateWorkflowTemplate`)**:
  - **Dead End Check**: Verifies that every required stage (such as `review`) has eligible roles mapped to progress the state.
  - **Privilege Escalation Check**: Ensures low-privilege roles (`author`) cannot be granted exclusive emergency override or un-guarded self-approval powers.

### 2. Task Assignment, SLA & Queue Membership (`CMoSWorkflowEngine`)

- **Task Assignment Metadata**: Tracks `ownerId`, `editorId`, `reviewerIds`, `dueDate`, `priority` (`low` | `normal` | `high` | `urgent`), and `watchers`.
- **SLA Due Date Offset**: Automatically calculates SLA due date based on template `serviceLevelDueOffsetHours` upon submission if not explicitly set.
- **Queue Membership Classification (`evaluateQueueMembership` & `categorizeWorkflowQueues`)**:
  - `assigned`: Directly assigned tasks for the active editor/reviewer.
  - `awaiting-approval`: Items in `review` stage waiting for editorial decision.
  - `requested-changes`: Items returned to author for revisions.
  - `approved`: Items approved and ready for scheduling or publication.
  - `scheduled`: Items bound to scheduled publishing jobs.
  - `overdue`: Items where `now > dueDate` and status is not published/archived.
  - `blocked`: Items blocked by failing quality gate scans lacking explicit staff waiver.

### 3. Stale Approval Protection

- Approval decisions (`ReviewDecisionRecord`) capture exact `targetRevisionSequence` and `targetRevisionHash`.
- If an author saves a new draft revision after approval (`saveDraft` creates revision `sequence N+1`), the state transitions to `updated` and marks `staleApproval = true` (`staleReason = "New draft revision (seq #N) created after approval decision"`).
- Stale approvals visibly warn staff in the UI and prevent un-reviewed publication without explicit re-review or emergency override.

### 4. Security Guards: Self-Approval & Site Scope

- **Prevent Self-Approval (`preventSelfApproval`)**: When enabled, authors cannot review or approve their own submissions even if they hold the `editor` role.
- **Site Scope Guard (`siteScopeGuard`)**: Prevents staff assigned to one site from taking workflow actions on articles belonging to a different site (`WorkflowPermissionError`).

### 5. Emergency Override & Bulk Queue Operations

- **Emergency Override (`emergencyOverride`)**: Allows staff with `admin` or `publisher` roles to bypass workflow restrictions when urgent breaking news occurs. Requires an explicit justification reason logged to audit history.
- **Bulk Queue Operations (`bulkExecuteWorkflowActions` & `/api/admin/workflow/bulk`)**: Supports bulk approval, request changes, withdrawal, and reassignment with per-item validation and partial-failure isolation reporting (`{ totalCount, succeededCount, failedCount, results }`).

---

## Admin Command Center (`src/modules/admin/EditorialWorkflowCenter.tsx`)

- Registered view at `/admin/workflow` in `payload.config.ts`.
- Navigation link registered in `PublishingLinks.tsx`.
- Features:
  - Personal vs. Team Queue tabs with live counts.
  - Filter pills for queue categories.
  - Interactive Task Drawer displaying task details, SLA timer, stale approval warning banner, action controls, emergency override input, and chronological audit trail.
  - Workflow Template Manager displaying template configurations and validation status against dead ends & privilege escalation.
  - Bulk operations toolbar with multi-select checkboxes.

---

## API Reference

| Endpoint                        | Method        | Description                                                   |
| :------------------------------ | :------------ | :------------------------------------------------------------ |
| `/api/admin/workflow/templates` | `GET`, `POST` | List and configure workflow templates with validation.        |
| `/api/admin/workflow/queues`    | `GET`         | List Personal and Team workflow queues for current user.      |
| `/api/admin/workflow/actions`   | `POST`        | Execute single workflow lifecycle actions.                    |
| `/api/admin/workflow/bulk`      | `POST`        | Execute bulk queue operations with partial-failure reporting. |
| `/api/admin/workflow/audit`     | `GET`         | Retrieve chronological audit trail for a workflow item.       |

---

## Verification Evidence

- **Unit Tests (`tests/unit/flow-01-cmos-workflow.test.ts`)**: 16/16 PASS.
- **Integration Tests (`tests/integration/flow-01-workflow-api.integration.test.ts`)**: 3/3 PASS.
- **Browser Acceptance (`tests/browser/flow-01-cmos-workflow.spec.ts`)**: 1/1 PASS (7.2s).
- **TypeScript Static Verification (`tsc --noEmit`)**: 0 errors.
- **Production Standalone Build (`npm run build`)**: 0 errors.
