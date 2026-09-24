# FLOW-03: Operationally Reliable Scheduling & Calendar Center Specifications

## Overview

Workflow Pass **FLOW-03** implements the operationally reliable, DST-aware **Scheduling Engine & Unified Calendar Center**. It extends the canonical FLOW-00 contract and FLOW-01 CMoS workflow with multi-view calendar UI (Month, Week, List), robust DST ambiguity/gap handling, explicit schedule rule/dependency evaluation, worker lease locking with idempotency and catch-up policies, exact revision pinning, schedule health monitoring, and iCalendar (.ics) export boundaries.

---

## Core Systems & Architecture

### 1. Timezone & DST Engine (`src/modules/calendar/timezone.ts`)

- **IANA Timezone Engine**: Enforces valid IANA timezone identifiers (e.g., `America/Chicago`, `America/New_York`, `Europe/London`).
- **Spring Forward (DST Gap / Nonexistent Time)**:
  - When a local time falls into a DST transition gap (e.g., 2:30 AM on Spring Forward when clocks jump from 2:00 AM to 3:00 AM), `convertLocalToUtc` advances by the gap duration (e.g. to 3:30 AM daylight time) under `nonexistentHandling: 'advance'`, or rejects under `nonexistentHandling: 'reject'`.
- **Fall Back (DST Overlap / Ambiguous Time)**:
  - When a local time occurs twice due to clock set-back (e.g., 1:30 AM on Fall Back), `convertLocalToUtc` uses `ambiguousPreference: 'earlier'` (daylight offset) or `'later'` (standard offset) to resolve the exact UTC instant deterministically.
- **Storage Format**: Stores UTC ISO instant (`scheduledFor: "2026-09-20T14:00:00.000Z"`) alongside displayed IANA timezone (`timeZone: "America/Chicago"`).

### 2. Schedule Dependency & Collision Validator (`src/modules/calendar/dependencies.ts`)

Evaluates content rules before enqueuing or updating a schedule slot:

- **Missing Approvals**: Blocks scheduling if item status is not `approved` or `scheduled`.
- **Quality Gate Scan**: Blocks if content has un-waived blocking quality issues (`qualityGate.blockingIssueCount > 0`).
- **Embargo Window**: Validates `scheduledFor >= embargoDate`.
- **Rights Expiration**: Validates `scheduledFor <= rightsExpirationDate`.
- **Prerequisite Content**: Verifies all required prerequisite articles/releases are published prior to scheduling.
- **Same-Slot Collision**: Emits collision warnings if > N items share the same 15-minute slot for the same publication.

### 3. Worker Lease Locking & Idempotent Scheduler (`src/modules/editorial/scheduler.ts`)

- **Atomic Lease Lock**: Acquires lease with `leaseOwner` (worker ID) and `leaseExpiresAt` (300s expiration). Active unexpired leases block other workers from double-processing.
- **Clock Drift Tolerance**: Incorporates a 30-second clock skew buffer for node clock synchronization.
- **Missed Window Catch-up Policy**:
  - `catchUpThresholdMinutes`: 60 minutes default.
  - `mode: 'publish-immediately'`: Catch-up executes publish immediately and logs `published-catch-up` audit.
  - `mode: 'expire-and-fail'`: Jobs overdue beyond threshold transition to `failed` with missed schedule window error.
- **Exact Revision Immutability**:
  - `ScheduledPublishJob` locks target `revisionId`, `sequence` (`N`), and `hash`.
  - Saving new working drafts post-schedule creates revision `N+1`.
  - When the scheduler executes, it publishes **ONLY approved revision `N`**, preventing un-reviewed draft leakage.
- **Secret Sanitization**: Automatically redacts database passwords, API tokens, bearer headers, and private keys from `lastError` logs.

### 4. Admin UI Components & Schedule Health Center

- **Calendar Center (`src/modules/admin/CalendarCenter.tsx`)**:
  - Month, Week, and Agenda List views.
  - Filters by site, publication, content type, workflow state, assignee, and special states (`overdue`, `blocked`, `failed`).
  - Drag and drop scheduling with confirmation modal, permission guard, and optimistic concurrency (`409 Conflict`) protection.
  - Accessible non-drag modal rescheduling alternative with keyboard navigation and datetime pickers.
- **Schedule Health Center (`src/modules/admin/ScheduleHealthCenter.tsx`)**:
  - Real-time queue metrics: Next jobs, Late/Missed jobs, Retrying jobs, Failed jobs, Worker heartbeat.
  - Action controls: Manual Retry, Force Cancel Job, Queue Reconciliation (`reconcileScheduleWorkerJobs`).

### 5. Calendar Export API (`src/app/(frontend)/api/calendar/export/route.ts`)

- `GET /api/calendar/export`:
  - `format=ics`: Generates iCalendar RFC 5545 (`.ics`) feed.
  - `format=json`: Returns JSON calendar feed.
  - Permissions: Anonymous users receive only published public events; authenticated staff receive scheduled & workflow entries.

---

## API Summary

| Endpoint                       | Method        | Description                                                                   |
| :----------------------------- | :------------ | :---------------------------------------------------------------------------- |
| `/api/admin/calendar/schedule` | `POST`        | Schedule/reschedule/cancel item with DST conversion & concurrency protection. |
| `/api/admin/schedule-health`   | `GET`, `POST` | Inspect queue health, worker heartbeat, retry/cancel/reconcile jobs.          |
| `/api/calendar/export`         | `GET`         | Export iCalendar (.ics) or JSON feed with permission filtering.               |

---

## Verification Evidence

- **Unit Test Suite (`tests/unit/flow-03-scheduling-calendar.test.ts`)**: PASS.
- **Integration Test Suite (`tests/integration/flow-03-scheduler-api.integration.test.ts`)**: PASS.
- **Playwright E2E Suite (`tests/browser/flow-03-scheduling-calendar.spec.ts`)**: PASS.
- **TypeScript Gate (`tsc --noEmit`)**: 0 errors.
- **Production Build (`npm run build`)**: 0 errors.
