import { describe, expect, it, vi } from 'vitest'

const { migrations } = vi.hoisted(() => ({ migrations: vi.fn() }))
vi.mock('payload', () => ({ getMigrations: migrations }))

import {
  buildOperationsDiagnostics,
  createSupportBundle,
  DIAGNOSTICS_MAX_FAILED_JOBS,
  isOperator,
  jobFailureDiagnostic,
} from '../../src/modules/operations/diagnostics'

const config = {
  version: '1.2.3',
  buildSha: 'abc123',
  schemaVersion: '1.0.0',
  deploymentProfile: 'Standard',
  storage: { driver: 'local' as const, mediaDir: 'media' },
  email: { mode: 'disabled' as const, secure: true, password: 'configured-secret' },
  proxyMode: 'direct' as const,
  warnings: [],
} as never
const result = (docs: unknown[]) => ({ docs })
const payload = (overrides: Record<string, unknown> = {}) =>
  ({
    db: {},
    find: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string
        where?: { hasError?: { equals?: boolean } }
      }) => {
        if (collection === 'payload-jobs' && where?.hasError)
          return result((overrides.failed as unknown[] | undefined) ?? [])
        if (collection === 'payload-jobs' && where)
          return result((overrides.heartbeat as unknown[] | undefined) ?? [])
        if (collection === 'payload-jobs')
          return result((overrides.jobs as unknown[] | undefined) ?? [])
        if (collection === 'social-accounts')
          return result((overrides.social as unknown[] | undefined) ?? [])
        return result((overrides.merchants as unknown[] | undefined) ?? [])
      },
    ),
  }) as never

describe('operations diagnostics', () => {
  it('reports a healthy bounded read model and safely inspects failed jobs', async () => {
    migrations.mockResolvedValue({ existingMigrations: [{ name: 'm1' }] })
    const diagnostics = await buildOperationsDiagnostics(
      payload({
        heartbeat: [{ id: 'hb', completedAt: '2026-08-28T00:00:00.000Z' }],
        jobs: [{ id: 'q1', createdAt: '2026-08-28T00:01:00.000Z' }],
        failed: Array.from({ length: 40 }, (_, index) => ({
          id: `f${index}`,
          taskSlug: 'send',
          hasError: true,
          totalTried: 2,
          error: 'token=super-secret',
        })),
      }),
      config,
      {
        now: () => new Date('2026-08-28T00:00:10.000Z'),
        expectedMigrations: ['m1'],
        checkMediaStorage: async () => {},
      },
    )
    expect(diagnostics.status).toBe('healthy')
    expect(diagnostics.version).toMatchObject({
      app: '1.2.3',
      buildSha: 'abc123',
      schemaVersion: '1.0.0',
      deploymentProfile: 'Standard',
    })
    expect(diagnostics.jobs.recentFailures).toHaveLength(DIAGNOSTICS_MAX_FAILED_JOBS)
    expect(diagnostics.jobs.recentFailures[0].error).not.toContain('super-secret')
  })

  it('distinguishes missing workers and optional provider degradation from core failure', async () => {
    migrations.mockResolvedValue({ existingMigrations: [{ name: 'm1' }] })
    const diagnostics = await buildOperationsDiagnostics(
      payload({ social: [{ id: 'social', label: 'social', credentialHealth: 'expired' }] }),
      config,
      {
        now: () => new Date('2026-08-28T01:00:00.000Z'),
        expectedMigrations: ['m1'],
        checkMediaStorage: async () => {},
      },
    )
    expect(diagnostics.status).toBe('degraded')
    expect(diagnostics.database.status).toBe('healthy')
    expect(diagnostics.worker.status).toBe('unavailable')
    expect(diagnostics.providers[0].status).toBe('degraded')
  })

  it('returns unhealthy_core when the canonical database read fails', async () => {
    migrations.mockRejectedValue(new Error('database unavailable'))
    const diagnostics = await buildOperationsDiagnostics(payload(), config, {
      expectedMigrations: ['m1'],
    })
    expect(diagnostics.status).toBe('unhealthy_core')
    expect(diagnostics.database.status).toBe('unavailable')
  })

  it('authorizes only owners and creates a secret-free, valid JSON support bundle', () => {
    expect(isOperator({ role: 'owner' })).toBe(true)
    expect(isOperator({ role: 'staff' })).toBe(false)
    const job = jobFailureDiagnostic({ id: '1', error: 'Bearer top-secret', totalTried: 1 })
    const bundle = createSupportBundle(
      {
        generatedAt: '2026-08-28T00:00:00.000Z',
        status: 'healthy',
        version: { app: '1', buildSha: null },
        database: { status: 'healthy' },
        migrations: { status: 'current', applied: 1, expected: 1, missing: [] },
        web: { status: 'healthy', observedAt: '2026-08-28T00:00:00.000Z' },
        worker: { status: 'healthy', observedAt: '2026-08-28T00:00:00.000Z', ageMs: 0 },
        jobs: { queued: 0, running: 0, failed: 1, oldestPendingAt: null, recentFailures: [job] },
        capabilities: [],
        providers: [],
        email: { provider: 'smtp', status: 'healthy' },
        mediaStorage: { status: 'healthy', driver: 'local' },
        backup: { status: 'not_configured', lastSuccessfulAt: null, lastFailureAt: null },
      },
      config,
    )
    expect(bundle).not.toContain('top-secret')
    expect(bundle).not.toContain('configured-secret')
    expect(JSON.parse(bundle).format).toBe('renegade-support-bundle/v1')
  })
})
