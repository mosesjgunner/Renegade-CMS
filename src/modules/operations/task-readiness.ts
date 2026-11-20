/**
 * UXI-02 — shared task-readiness service.
 *
 * One readiness contract for every guided task surface (first-run setup,
 * the operator console, later admin wizards): a task is described by a
 * static definition (identity, scope, permission, prerequisites, evidence
 * type, next action) and a live check result; the pure evaluation core in
 * this module derives the task's state from those two inputs.
 *
 * States: not-started, in-progress, blocked, ready, verified, failed.
 * A task the operator deliberately skipped is NOT broken: its check outcome
 * is `skipped`, it evaluates to `ready` with `skipped: true`, it satisfies
 * prerequisites, and its safe reason says it was skipped on purpose. A
 * failed check evaluates to `failed` and never satisfies a prerequisite.
 * A task whose prerequisites are unmet evaluates to `blocked` (unless its
 * own check already failed — a broken task reports `failed`, not `blocked`).
 *
 * The evaluation core is pure and unit-testable. Persistence is a thin
 * layer at the bottom of this file: the latest evaluated snapshot is stored
 * on the singleton `installation_state` row (additive columns, migration
 * 20261119_120000_uxi02_task_readiness_setup_draft) so operator surfaces
 * can serve the last real evaluation instead of re-probing or guessing.
 */

import type { Payload } from 'payload'

import type { InstallationReadiness } from './installation'

export type TaskState = 'not-started' | 'in-progress' | 'blocked' | 'ready' | 'verified' | 'failed'

export type TaskEvidenceType = 'live-check' | 'configuration' | 'manual' | 'derived'

export type TaskSiteScope = 'installation' | 'site' | 'global'

export type TaskNextAction = {
  label: string
  target?: string
}

export type TaskDefinition = {
  id: string
  label: string
  siteScope: TaskSiteScope
  /** Permission/role required to act on this task (e.g. 'operator', 'owner'). */
  permission: string
  prerequisites: readonly string[]
  evidenceType: TaskEvidenceType
  /** Optional tasks may be deliberately skipped without blocking anything. */
  optional?: boolean
  nextAction: TaskNextAction
}

export type TaskCheckOutcome = 'pass' | 'fail' | 'skipped' | 'in-progress' | 'not-run'

export type TaskCheckResult = {
  taskId: string
  outcome: TaskCheckOutcome
  /** Operator/user-safe explanation. Never put secrets or internals here. */
  reason?: string
  evidenceType?: TaskEvidenceType
  checkedAt?: string
  /** Advanced diagnostics for operator surfaces; string/number/boolean only. */
  diagnostics?: Record<string, string | number | boolean>
}

export type TaskReadiness = {
  taskId: string
  label: string
  siteScope: TaskSiteScope
  permission: string
  prerequisites: string[]
  state: TaskState
  /** True when the operator deliberately skipped this (optional) task. */
  skipped: boolean
  /** Safe, human-readable reason for the current state. */
  reason: string
  lastCheckedAt: string | null
  evidenceType: TaskEvidenceType
  nextAction: TaskNextAction
  diagnostics?: Record<string, string | number | boolean>
}

// ---------------------------------------------------------------------------
// Registry of task definitions
// ---------------------------------------------------------------------------

export const taskDefinitions: readonly TaskDefinition[] = [
  {
    id: 'setup.database',
    label: 'PostgreSQL database',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'live-check',
    nextAction: { label: 'Start PostgreSQL and verify DATABASE_URL', target: '/setup' },
  },
  {
    id: 'setup.migrations',
    label: 'Schema migrations',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: ['setup.database'],
    evidenceType: 'live-check',
    nextAction: { label: 'Run npm run db:migrate', target: '/setup' },
  },
  {
    id: 'setup.storage',
    label: 'Media storage',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: ['setup.database'],
    evidenceType: 'live-check',
    nextAction: {
      label: 'Give the application read/write access to the media folder',
      target: '/setup',
    },
  },
  {
    id: 'setup.installation',
    label: 'Owner enrollment & site provisioning',
    siteScope: 'installation',
    permission: 'owner',
    prerequisites: ['setup.migrations', 'setup.storage'],
    evidenceType: 'live-check',
    nextAction: { label: 'Finish setup', target: '/setup' },
  },
  {
    id: 'setup.https',
    label: 'Public HTTPS & proxy',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: ['setup.installation'],
    evidenceType: 'live-check',
    nextAction: {
      label: 'Fix the DNS, certificate, or proxy finding and re-check',
      target: '/setup',
    },
  },
  {
    id: 'setup.audio-engine',
    label: 'Audio engine (ffmpeg)',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'live-check',
    optional: true,
    nextAction: { label: 'Install the audio engine from the Capability Center', target: '/admin' },
  },
  {
    id: 'setup.email',
    label: 'Outbound email',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'configuration',
    optional: true,
    nextAction: { label: 'Configure email later in Admin Studio', target: '/admin' },
  },
  {
    id: 'setup.ai',
    label: 'AI model provider',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'configuration',
    optional: true,
    nextAction: { label: 'Configure an AI provider later in Admin Studio', target: '/admin' },
  },
  {
    id: 'setup.analytics',
    label: 'Analytics & telemetry',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'configuration',
    optional: true,
    nextAction: { label: 'Configure analytics later in Admin Studio', target: '/admin' },
  },
] as const

const definitionById = new Map(taskDefinitions.map((definition) => [definition.id, definition]))

export function getTaskDefinition(taskId: string): TaskDefinition | undefined {
  return definitionById.get(taskId)
}

// ---------------------------------------------------------------------------
// Pure evaluation core
// ---------------------------------------------------------------------------

const MAX_REASON_LENGTH = 300

function safeReason(reason: string | undefined, fallback: string): string {
  const trimmed = (reason ?? '').trim()
  return (trimmed || fallback).slice(0, MAX_REASON_LENGTH)
}

function ownState(definition: TaskDefinition, check: TaskCheckResult | undefined): TaskState {
  if (!check || check.outcome === 'not-run') return 'not-started'
  switch (check.outcome) {
    case 'pass': {
      const evidence = check.evidenceType ?? definition.evidenceType
      return evidence === 'live-check' ? 'verified' : 'ready'
    }
    case 'fail':
      return 'failed'
    case 'skipped':
      return 'ready'
    case 'in-progress':
      return 'in-progress'
  }
}

function defaultReason(definition: TaskDefinition, state: TaskState, skipped: boolean): string {
  if (skipped) return 'Skipped for now — this can be configured later.'
  switch (state) {
    case 'verified':
      return 'Verified by a live check.'
    case 'ready':
      return 'Ready.'
    case 'failed':
      return 'The check failed.'
    case 'blocked':
      return 'Waiting on a prerequisite task.'
    case 'in-progress':
      return 'In progress.'
    case 'not-started':
      return 'Not checked yet.'
  }
}

/**
 * Evaluate task states from check results. Definitions are evaluated in
 * registry order; prerequisites must appear earlier in the list (the
 * built-in registry satisfies this). An unknown prerequisite counts as
 * unsatisfied, so a dependent task blocks rather than silently passing.
 */
export function evaluateTaskReadiness(
  definitions: readonly TaskDefinition[],
  checks: readonly TaskCheckResult[],
  now: Date = new Date(),
): TaskReadiness[] {
  const checkById = new Map(checks.map((check) => [check.taskId, check]))
  const evaluated = new Map<string, TaskReadiness>()
  const results: TaskReadiness[] = []

  for (const definition of definitions) {
    const check = checkById.get(definition.id)
    const skipped = check?.outcome === 'skipped'
    let state = ownState(definition, check)

    const unmet = definition.prerequisites.filter((prerequisiteId) => {
      const prerequisite = evaluated.get(prerequisiteId)
      if (!prerequisite) return true
      if (prerequisite.skipped) return false
      return prerequisite.state !== 'ready' && prerequisite.state !== 'verified'
    })

    // A task that failed its own check reports `failed` even when a
    // prerequisite is also unmet — it is broken, not merely waiting.
    if (unmet.length > 0 && state !== 'failed') {
      state = 'blocked'
    }

    const fallback = defaultReason(definition, state, skipped)
    let reason = safeReason(check?.reason, fallback)
    if (state === 'blocked' && unmet.length > 0) {
      const names = unmet
        .map((id) => definitionById.get(id)?.label ?? evaluated.get(id)?.label ?? id)
        .join(', ')
      reason = safeReason(
        check?.reason ? `${check.reason} Waiting on: ${names}.` : `Waiting on: ${names}.`,
        fallback,
      )
    }

    const readiness: TaskReadiness = {
      taskId: definition.id,
      label: definition.label,
      siteScope: definition.siteScope,
      permission: definition.permission,
      prerequisites: [...definition.prerequisites],
      state,
      skipped,
      reason,
      lastCheckedAt: check?.checkedAt ?? (check ? now.toISOString() : null),
      evidenceType: check?.evidenceType ?? definition.evidenceType,
      nextAction:
        state === 'verified' || (state === 'ready' && !skipped)
          ? { label: 'Done' }
          : definition.nextAction,
      ...(check?.diagnostics ? { diagnostics: check.diagnostics } : {}),
    }
    evaluated.set(definition.id, readiness)
    results.push(readiness)
  }

  return results
}

// ---------------------------------------------------------------------------
// Mapping the setup surfaces' live checks into task checks
// ---------------------------------------------------------------------------

export type SetupProviderStatus = {
  name: string
  type: 'required' | 'optional'
  status: 'validated' | 'failed' | 'configured' | 'unconfigured'
  message: string
  recovery?: string
}

const providerTaskIds: Record<string, string> = {
  database: 'setup.database',
  storage: 'setup.storage',
  audioEngine: 'setup.audio-engine',
  email: 'setup.email',
  ai: 'setup.ai',
  analytics: 'setup.analytics',
}

function providerCheck(
  taskId: string,
  provider: SetupProviderStatus,
  checkedAt: string,
): TaskCheckResult {
  if (provider.status === 'validated' || provider.status === 'configured') {
    return { taskId, outcome: 'pass', reason: provider.message, checkedAt }
  }
  if (provider.status === 'failed') {
    return {
      taskId,
      outcome: 'fail',
      reason: provider.recovery ?? provider.message,
      checkedAt,
    }
  }
  // unconfigured: an optional provider the operator has not set up is a
  // deliberate skip for setup purposes, never a failure. A required
  // provider that was never checked is simply not-run.
  return provider.type === 'optional'
    ? { taskId, outcome: 'skipped', reason: provider.message, checkedAt }
    : { taskId, outcome: 'not-run', reason: provider.message, checkedAt }
}

/**
 * Build task check results from the installation readiness probe plus the
 * provider record the setup readiness route already computes from live
 * checks (storage probe, audio-engine probe, environment configuration).
 */
export function buildSetupTaskChecks(input: {
  readiness: InstallationReadiness
  providers: Record<string, SetupProviderStatus>
  now?: Date
}): TaskCheckResult[] {
  const checkedAt = (input.now ?? new Date()).toISOString()
  const { readiness, providers } = input
  const checks: TaskCheckResult[] = []

  for (const [providerKey, taskId] of Object.entries(providerTaskIds)) {
    const provider = providers[providerKey]
    if (provider) checks.push(providerCheck(taskId, provider, checkedAt))
  }

  // Migrations and installation state come from the readiness probe itself;
  // the database provider above already covers setup.database.
  if (readiness.migrationState === 'applied') {
    checks.push({
      taskId: 'setup.migrations',
      outcome: 'pass',
      reason: `Schema migrations applied (${readiness.appliedMigrations}/${readiness.totalMigrations}).`,
      checkedAt,
      diagnostics: {
        appliedMigrations: readiness.appliedMigrations,
        totalMigrations: readiness.totalMigrations,
      },
    })
  } else if (readiness.migrationState === 'pending') {
    checks.push({
      taskId: 'setup.migrations',
      outcome: 'fail',
      reason: readiness.recoveryAction ?? 'Migrations are pending.',
      checkedAt,
      diagnostics: { pendingMigrations: readiness.pendingMigrations.join(', ') },
    })
  } else if (readiness.database === 'connected') {
    checks.push({
      taskId: 'setup.migrations',
      outcome: 'fail',
      reason: readiness.recoveryAction ?? 'Migration state is uninitialized.',
      checkedAt,
    })
  } else {
    checks.push({ taskId: 'setup.migrations', outcome: 'not-run', checkedAt })
  }

  switch (readiness.installationState) {
    case 'complete':
      checks.push({
        taskId: 'setup.installation',
        outcome: 'pass',
        reason: 'Installation is complete.',
        checkedAt,
      })
      break
    case 'installing':
      checks.push({
        taskId: 'setup.installation',
        outcome: 'in-progress',
        reason: 'Owner enrollment is in progress.',
        checkedAt,
      })
      break
    case 'expired':
      checks.push({
        taskId: 'setup.installation',
        outcome: 'fail',
        reason: readiness.recoveryAction ?? 'The bootstrap token expired.',
        checkedAt,
      })
      break
    default:
      checks.push({
        taskId: 'setup.installation',
        outcome: 'not-run',
        reason: 'Setup has not been completed yet.',
        checkedAt,
      })
  }

  return checks
}

/** Evaluate the full setup task list from live check inputs. */
export function evaluateSetupTasks(input: {
  readiness: InstallationReadiness
  providers: Record<string, SetupProviderStatus>
  now?: Date
}): TaskReadiness[] {
  const now = input.now ?? new Date()
  return evaluateTaskReadiness(taskDefinitions, buildSetupTaskChecks({ ...input, now }), now)
}

// ---------------------------------------------------------------------------
// Thin persistence: latest evaluated snapshot on installation_state
// ---------------------------------------------------------------------------

type SqlPool = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rowCount?: number | null; rows: T[] }>
}

function getPool(payload: Payload): SqlPool | null {
  const database = payload.db as typeof payload.db & { pool?: SqlPool }
  return database.pool ?? null
}

export type TaskReadinessSnapshot = {
  tasks: TaskReadiness[]
  checkedAt: string
}

/**
 * Persist the latest evaluated snapshot. Best-effort by design: on an
 * installation whose migration has not run yet (or with no installation
 * row) this returns false instead of failing the caller's live response.
 */
export async function persistTaskReadinessSnapshot(
  payload: Payload,
  tasks: readonly TaskReadiness[],
): Promise<boolean> {
  const pool = getPool(payload)
  if (!pool) return false
  try {
    const result = await pool.query(
      `UPDATE installation_state
       SET task_readiness_snapshot = $1, task_readiness_checked_at = now(), updated_at = now()
       WHERE singleton = true`,
      [JSON.stringify({ tasks, checkedAt: new Date().toISOString() })],
    )
    return Boolean(result.rowCount)
  } catch {
    return false
  }
}

/** Load the most recently persisted snapshot, or null when none exists. */
export async function loadTaskReadinessSnapshot(
  payload: Payload,
): Promise<TaskReadinessSnapshot | null> {
  const pool = getPool(payload)
  if (!pool) return null
  try {
    const result = await pool.query<{
      task_readiness_snapshot: TaskReadinessSnapshot | string | null
      task_readiness_checked_at: Date | null
    }>(
      `SELECT task_readiness_snapshot, task_readiness_checked_at
       FROM installation_state WHERE singleton = true`,
    )
    const row = result.rows[0]
    if (!row?.task_readiness_snapshot) return null
    const snapshot =
      typeof row.task_readiness_snapshot === 'string'
        ? (JSON.parse(row.task_readiness_snapshot) as TaskReadinessSnapshot)
        : row.task_readiness_snapshot
    if (!Array.isArray(snapshot.tasks)) return null
    return {
      tasks: snapshot.tasks,
      checkedAt:
        snapshot.checkedAt ??
        (row.task_readiness_checked_at ? row.task_readiness_checked_at.toISOString() : ''),
    }
  } catch {
    return null
  }
}
