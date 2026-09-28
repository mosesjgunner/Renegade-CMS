import { beforeEach, describe, expect, it, vi } from 'vitest'

const findGlobal = vi.fn()
const find = vi.fn()
const getMigrationsMock = vi.fn()

vi.mock('payload', () => ({
  getMigrations: async () => getMigrationsMock(),
}))

vi.mock('../../src/migrations', () => ({
  migrations: [{ name: '001_initial' }, { name: '002_add_commerce' }],
}))

vi.mock('../../src/modules/core/config', () => ({
  loadConfig: () => ({
    version: '1.0.0-rc.1',
    buildSha: 'fedcba9876543210',
    schemaVersion: '1.0.0',
    deploymentProfile: 'Standard',
    storage: { driver: 'local', mediaDir: 'media' },
    email: { mode: 'disabled', secure: true },
    networking: { enabled: false },
  }),
}))

vi.mock('../../src/modules/operations/backup', () => ({
  backupStatusFromMedia: async () => ({
    status: 'healthy',
    lastSuccessfulAt: '2026-09-24T12:00:00.000Z',
    lastFailureAt: null,
  }),
}))

import { renderToStaticMarkup } from 'react-dom/server'
import CapabilityCenter from '../../src/modules/admin/CapabilityCenter'

describe('ADMIN-CAPABILITIES-GOVERNANCE: Operations & Lifecycle Admin Exposure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMigrationsMock.mockResolvedValue({
      existingMigrations: [{ name: '001_initial' }, { name: '002_add_commerce' }],
    })
    findGlobal.mockResolvedValue({
      adminExperience: {
        optionalCapabilities: {
          commerceCheckout: true,
          mediaProcessing: true,
        },
      },
    })
    find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'payload-jobs') {
        return {
          docs: [
            {
              id: 'job-hb',
              taskSlug: 'operations-heartbeat',
              completedAt: new Date().toISOString(),
            },
          ],
          totalDocs: 1,
        }
      }
      return { docs: [], totalDocs: 0 }
    })
  })

  it('restricts access to owner role only', async () => {
    const nonOwnerReq = {
      user: { id: 'staff-1', role: 'staff' },
      payload: { findGlobal, find, db: {} },
    } as any

    const result = await CapabilityCenter({
      initPageResult: { req: nonOwnerReq },
    } as any)

    expect(result).toBeDefined()
    const html = renderToStaticMarkup(result as any)
    expect(html).toContain('Owner access is required')
  })

  it('renders complete runtime identity, migration, worker, and backup governance for owner', async () => {
    const ownerReq = {
      user: { id: 'owner-1', role: 'owner' },
      payload: { findGlobal, find, db: {} },
    } as any

    const result = await CapabilityCenter({
      initPageResult: { req: ownerReq },
    } as any)

    expect(result).toBeDefined()
    const html = renderToStaticMarkup(result as any)

    // 1. Version & Deployment Profile
    expect(html).toContain('1.0.0-rc.1')
    expect(html).toContain('Standard')
    expect(html).toContain('fedcba9876543210')

    // 2. Migration Governance
    expect(html).toContain('Database &amp; Migrations')
    expect(html).toContain('CURRENT')
    expect(html).toContain('2 of 2')

    // 3. Worker & Job Queue Health
    expect(html).toContain('Worker &amp; Job Queues')
    expect(html).toContain('Worker Process')

    // 4. Operational Backup Coverage (Included vs Excluded data)
    expect(html).toContain('Operational Backup Coverage &amp; Isolated Restore Instructions')
    expect(html).toContain('Included Data (Comprehensive Archive)')
    expect(html).toContain('database.dump')
    expect(html).toContain('media.tar.gz')
    expect(html).toContain('Excluded Data (Security &amp; Cleanliness Boundary)')
    expect(html).toContain('PAYLOAD_SECRET')

    // 5. Documented Backup & Isolated Restore Commands
    expect(html).toContain('backup:operational')
    expect(html).toContain('restore:operational')
    expect(html).toContain('--isolated')
    expect(html).toContain('--authorize-restore')
    expect(html).toContain('restore:rehearsal')
  })
})
