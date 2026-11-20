import { describe, expect, it } from 'vitest'

import {
  buildSetupTaskChecks,
  evaluateSetupTasks,
  evaluateTaskReadiness,
  getTaskDefinition,
  taskDefinitions,
  type TaskDefinition,
} from '../../src/modules/operations/task-readiness'
import type { InstallationReadiness } from '../../src/modules/operations/installation'

const now = new Date('2026-11-19T12:00:00.000Z')

const defs: TaskDefinition[] = [
  {
    id: 'a',
    label: 'Task A',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: [],
    evidenceType: 'live-check',
    nextAction: { label: 'Fix A', target: '/a' },
  },
  {
    id: 'b',
    label: 'Task B',
    siteScope: 'installation',
    permission: 'operator',
    prerequisites: ['a'],
    evidenceType: 'live-check',
    nextAction: { label: 'Fix B' },
  },
  {
    id: 'c',
    label: 'Task C (optional)',
    siteScope: 'site',
    permission: 'owner',
    prerequisites: [],
    evidenceType: 'configuration',
    optional: true,
    nextAction: { label: 'Configure C later' },
  },
  {
    id: 'd',
    label: 'Task D',
    siteScope: 'site',
    permission: 'owner',
    prerequisites: ['c'],
    evidenceType: 'live-check',
    nextAction: { label: 'Fix D' },
  },
]

const byId = (tasks: ReturnType<typeof evaluateTaskReadiness>) =>
  Object.fromEntries(tasks.map((task) => [task.taskId, task]))

describe('task readiness evaluation core', () => {
  it('maps a passing live check to verified and a passing configuration check to ready', () => {
    const tasks = byId(
      evaluateTaskReadiness(
        defs,
        [
          { taskId: 'a', outcome: 'pass' },
          { taskId: 'b', outcome: 'pass' },
          { taskId: 'c', outcome: 'pass' },
          { taskId: 'd', outcome: 'pass' },
        ],
        now,
      ),
    )
    expect(tasks.a.state).toBe('verified')
    expect(tasks.b.state).toBe('verified')
    expect(tasks.c.state).toBe('ready')
    expect(tasks.d.state).toBe('verified')
    expect(tasks.a.nextAction.label).toBe('Done')
    expect(tasks.a.lastCheckedAt).toBe(now.toISOString())
  })

  it('distinguishes a deliberately skipped task from a broken one', () => {
    const tasks = byId(
      evaluateTaskReadiness(
        defs,
        [
          { taskId: 'a', outcome: 'pass' },
          { taskId: 'b', outcome: 'pass' },
          { taskId: 'c', outcome: 'skipped', reason: 'Not configured (skippable).' },
          { taskId: 'd', outcome: 'pass' },
        ],
        now,
      ),
    )
    expect(tasks.c.state).toBe('ready')
    expect(tasks.c.skipped).toBe(true)
    expect(tasks.c.reason).toContain('skippable')
    // A skipped prerequisite is satisfied: the dependent task is not blocked.
    expect(tasks.d.state).toBe('verified')
    expect(tasks.d.skipped).toBe(false)
  })

  it('reports failed checks as failed and blocks their dependents', () => {
    const tasks = byId(
      evaluateTaskReadiness(
        defs,
        [
          { taskId: 'a', outcome: 'fail', reason: 'Database connection failed' },
          { taskId: 'b', outcome: 'not-run' },
          { taskId: 'c', outcome: 'pass' },
          { taskId: 'd', outcome: 'pass' },
        ],
        now,
      ),
    )
    expect(tasks.a.state).toBe('failed')
    expect(tasks.a.skipped).toBe(false)
    expect(tasks.a.reason).toContain('Database connection failed')
    expect(tasks.b.state).toBe('blocked')
    expect(tasks.b.reason).toContain('Task A')
  })

  it('keeps a task failed (not merely blocked) when its own check fails behind an unmet prerequisite', () => {
    const tasks = byId(
      evaluateTaskReadiness(
        defs,
        [
          { taskId: 'a', outcome: 'not-run' },
          { taskId: 'b', outcome: 'fail', reason: 'B itself is broken' },
        ],
        now,
      ),
    )
    expect(tasks.b.state).toBe('failed')
    expect(tasks.b.reason).toContain('B itself is broken')
  })

  it('blocks a passing task whose prerequisite has not run, and reports not-started / in-progress honestly', () => {
    const tasks = byId(
      evaluateTaskReadiness(
        defs,
        [
          { taskId: 'a', outcome: 'in-progress' },
          { taskId: 'b', outcome: 'pass' },
          { taskId: 'c', outcome: 'not-run' },
        ],
        now,
      ),
    )
    expect(tasks.a.state).toBe('in-progress')
    expect(tasks.b.state).toBe('blocked')
    expect(tasks.c.state).toBe('not-started')
    expect(tasks.c.lastCheckedAt).toBe(now.toISOString())
    // d has no check at all and its prerequisite c is not satisfied.
    expect(tasks.d.state).toBe('blocked')
    expect(tasks.d.lastCheckedAt).toBeNull()
  })

  it('registry definitions are well-formed with resolvable prerequisites', () => {
    const seen = new Set<string>()
    for (const definition of taskDefinitions) {
      expect(definition.id).toBeTruthy()
      expect(definition.label).toBeTruthy()
      expect(definition.permission).toBeTruthy()
      expect(definition.nextAction.label).toBeTruthy()
      for (const prerequisite of definition.prerequisites) {
        expect(seen.has(prerequisite)).toBe(true)
        expect(getTaskDefinition(prerequisite)).toBeDefined()
      }
      seen.add(definition.id)
    }
  })
})

describe('setup task mapping from live checks', () => {
  const readyReadiness: InstallationReadiness = {
    ready: true,
    database: 'connected',
    migrationState: 'applied',
    appliedMigrations: 10,
    totalMigrations: 10,
    pendingMigrations: [],
    installationState: 'incomplete',
  }

  it('verifies database/migrations/storage and skips unconfigured optional providers', () => {
    const tasks = byId(
      evaluateSetupTasks({
        readiness: readyReadiness,
        providers: {
          database: {
            name: 'PostgreSQL Database',
            type: 'required',
            status: 'validated',
            message: 'Connected and operational',
          },
          storage: {
            name: 'Media Storage',
            type: 'required',
            status: 'validated',
            message: 'Local media storage directory verified.',
          },
          audioEngine: {
            name: 'Audio Engine (ffmpeg)',
            type: 'optional',
            status: 'unconfigured',
            message: 'Not set up yet',
          },
          email: {
            name: 'Outbound Email',
            type: 'optional',
            status: 'unconfigured',
            message: 'Not configured (skippable)',
          },
        },
        now,
      }),
    )
    expect(tasks['setup.database'].state).toBe('verified')
    expect(tasks['setup.migrations'].state).toBe('verified')
    expect(tasks['setup.migrations'].diagnostics).toMatchObject({
      appliedMigrations: 10,
      totalMigrations: 10,
    })
    expect(tasks['setup.storage'].state).toBe('verified')
    expect(tasks['setup.audio-engine'].skipped).toBe(true)
    expect(tasks['setup.email'].skipped).toBe(true)
    // Installation itself is not done yet, but its prerequisites are met.
    expect(tasks['setup.installation'].state).toBe('not-started')
  })

  it('fails migrations when pending and blocks installation behind them', () => {
    const checks = buildSetupTaskChecks({
      readiness: {
        ...readyReadiness,
        ready: false,
        migrationState: 'pending',
        appliedMigrations: 3,
        pendingMigrations: ['m4'],
        recoveryAction: 'Run "npm run db:migrate" to apply 1 pending migration(s).',
      },
      providers: {
        database: {
          name: 'PostgreSQL Database',
          type: 'required',
          status: 'validated',
          message: 'Connected and operational',
        },
        storage: {
          name: 'Media Storage',
          type: 'required',
          status: 'validated',
          message: 'ok',
        },
      },
      now,
    })
    const tasks = byId(evaluateTaskReadiness(taskDefinitions, checks, now))
    expect(tasks['setup.migrations'].state).toBe('failed')
    expect(tasks['setup.installation'].state).toBe('blocked')
  })

  it('fails the database task and blocks migrations when the database is disconnected', () => {
    const tasks = byId(
      evaluateSetupTasks({
        readiness: {
          ...readyReadiness,
          ready: false,
          database: 'disconnected',
          migrationState: 'uninitialized',
          recoveryAction: 'Start PostgreSQL and verify DATABASE_URL in .env.',
        },
        providers: {
          database: {
            name: 'PostgreSQL Database',
            type: 'required',
            status: 'failed',
            message: 'Database connection failed',
            recovery: 'Start PostgreSQL and verify DATABASE_URL in .env.',
          },
          storage: {
            name: 'Media Storage',
            type: 'required',
            status: 'failed',
            message: 'Storage write error',
          },
        },
        now,
      }),
    )
    expect(tasks['setup.database'].state).toBe('failed')
    expect(tasks['setup.migrations'].state).toBe('blocked')
    expect(tasks['setup.storage'].state).toBe('failed')
    expect(tasks['setup.installation'].state).toBe('blocked')
  })
})
