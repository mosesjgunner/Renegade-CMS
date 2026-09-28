import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// 1. Mock payload
const findMock = vi.fn()
const findGlobalMock = vi.fn()
const getMigrationsMock = vi.fn()

const getPayloadMock = vi.fn()

vi.mock('payload', () => ({
  getPayload: async () => getPayloadMock(),
  getMigrations: async () => getMigrationsMock(),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

// 2. Mock next/navigation & headers
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

// 3. Mock core config & diagnostics
vi.mock('../../src/modules/core/config', () => ({
  loadConfig: () => ({
    version: '1.0.0-rc.1',
    buildSha: 'abc123fed456',
    schemaVersion: '1.0.0',
    deploymentProfile: 'Standard',
    storage: { driver: 'local', mediaDir: 'media' },
    email: { mode: 'disabled', secure: true },
    networking: { enabled: false },
  }),
}))

vi.mock('../../src/migrations', () => ({
  migrations: [{ name: '001_initial' }, { name: '002_add_commerce' }],
}))

vi.mock('../../src/modules/operations/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/operations/backup')>()
  return {
    ...actual,
    backupStatusFromMedia: async () => ({
      status: 'healthy',
      lastSuccessfulAt: '2026-09-25T18:00:00.000Z',
      lastFailureAt: null,
      verified: true,
      archivePath: 'C:\\backups\\archive',
      archiveFiles: 2,
      archiveBytes: 123,
    }),
  }
})

import PublisherDashboard from '../../src/modules/admin/PublisherDashboard'
import AdminLayout from '../../src/app/(frontend)/admin/layout'
import PublishingLinks from '../../src/modules/admin/PublishingLinks'
import {
  assertRestoreSafety,
  verifyOperationalBackup,
  createOperationalBackupManifest,
} from '../../src/modules/operations/backup'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

describe('ADMIN-MAINTENANCE-AND-ACCESSIBILITY: Governance Exposure & Screen-Reader Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMigrationsMock.mockResolvedValue({
      existingMigrations: [{ name: '001_initial' }, { name: '002_add_commerce' }],
    })
    findGlobalMock.mockResolvedValue({
      adminExperience: { optionalCapabilities: {} },
    })
    findMock.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'content') {
        return { docs: [], totalDocs: 0 }
      }
      if (collection === 'public-redirects') {
        return { docs: [], totalDocs: 1 }
      }
      if (collection === 'payload-jobs') {
        return {
          docs: [
            {
              id: 'job-1',
              taskSlug: 'operations-heartbeat',
              completedAt: new Date().toISOString(),
            },
          ],
          totalDocs: 1,
        }
      }
      if (collection === 'sites') {
        return { docs: [{ id: 'site-1', name: 'Primary Sovereign Site' }], totalDocs: 1 }
      }
      return { docs: [], totalDocs: 0 }
    })
  })

  describe('1. System Governance & Operational Coverage Exposure', () => {
    it('exposes version, deployment profile, migration state, worker queues, and backup coverage to Owner', async () => {
      const ownerReq = {
        user: { id: 'owner-1', role: 'owner' },
        payload: { find: findMock, findGlobal: findGlobalMock, db: {} },
        url: 'http://localhost/admin',
      } as any

      const result = await PublisherDashboard({
        initPageResult: { req: ownerReq },
      } as any)

      const html = renderToStaticMarkup(result as any)

      // 1. Version, profile, and schema
      expect(html).toContain('1.0.0-rc.1')
      expect(html).toContain('[STANDARD]')
      expect(html).toContain('abc123fed456')

      // 2. Database and migrations
      expect(html).toContain('[HEALTHY]')
      expect(html).toContain('[CURRENT]')
      expect(html).toContain('2 of 2')
      expect(html).toContain('All registered migrations applied')

      // 3. Worker process & queues
      expect(html).toContain('Worker Status')
      expect(html).toContain('Heartbeat')

      // 4. Backup coverage & scope disclosure
      expect(html).toContain('Backup &amp; Restore Governance')
      expect(html).toContain('View Included &amp; Excluded Data Scope')
      expect(html).toContain('database.dump')
      expect(html).toContain('media.tar.gz')
      expect(html).toContain('manifest.json')
      expect(html).toContain('Checksum verification succeeded at backup time.')
      expect(html).toContain('C:\\backups\\archive')
      expect(html).toContain('Environment secrets')
      expect(html).toContain('Provider credentials')

      // 5. Restore instructions
      expect(html).toContain('View Restore &amp; Rehearsal Commands')
      expect(html).toContain('backup:operational')
      expect(html).toContain('restore:operational')
      expect(html).toContain('restore:rehearsal')
    })

    it('exposes system governance and backup/restore coverage to Administrator without requiring Owner role', async () => {
      const adminReq = {
        user: { id: 'admin-1', role: 'administrator' },
        payload: { find: findMock, findGlobal: findGlobalMock, db: {} },
        url: 'http://localhost/admin',
      } as any

      const result = await PublisherDashboard({
        initPageResult: { req: adminReq },
      } as any)

      const html = renderToStaticMarkup(result as any)

      expect(html).toContain('System Runtime, Migrations &amp; Backup Governance')
      expect(html).toContain('1.0.0-rc.1')
      expect(html).toContain('[STANDARD]')
      expect(html).toContain('database.dump')
      expect(html).toContain('restore:operational')
      // Administrator should not see Owner-only telemetry cards
      expect(html).not.toContain('Analytics Events (30 days)')
    })

    it('hides operational governance panel from restricted Staff role', async () => {
      const staffReq = {
        user: { id: 'staff-1', role: 'staff', adminSites: ['site-1'] },
        payload: { find: findMock, findGlobal: findGlobalMock, db: {} },
        url: 'http://localhost/admin?siteId=site-1',
      } as any

      const result = await PublisherDashboard({
        initPageResult: { req: staffReq },
      } as any)

      const html = renderToStaticMarkup(result as any)
      expect(html).not.toContain('System Runtime, Migrations &amp; Backup Governance')
      expect(html).not.toContain('View Included &amp; Excluded Data Scope')
    })
  })

  describe('2. Accessibility & Screen Reader Landmarks', () => {
    it('provides a keyboard skip link targeting #main-content in admin layout', async () => {
      const authUser = { id: 'admin-1', email: 'admin@renegade.test', role: 'administrator' }
      const mockPayloadInstance = {
        auth: vi.fn().mockResolvedValue({ user: authUser }),
        find: vi.fn().mockResolvedValue({ docs: [{ id: 'site-1', name: 'Test Site' }] }),
      }

      getPayloadMock.mockResolvedValueOnce(mockPayloadInstance as any)

      const layoutResult = await AdminLayout({ children: 'Child Content' } as any)
      const html = renderToStaticMarkup(layoutResult as any)

      expect(html).toContain('href="#main-content"')
      expect(html).toContain('Skip to main content')
      expect(html).toContain('id="main-content"')
    })

    it('connects navigation disclosure buttons to regions with aria-controls, aria-expanded, and aria-hidden glyphs', async () => {
      const React = await import('react')
      const result = React.createElement(PublishingLinks)
      const html = renderToStaticMarkup(result as any)

      // Section button has aria-expanded and aria-controls
      expect(html).toContain('aria-expanded="true"')
      expect(html).toContain('aria-controls="nav-section-dashboard"')
      expect(html).toContain('id="nav-section-dashboard"')

      // Decorative chevron is hidden from screen readers
      expect(html).toContain('aria-hidden="true"')

      // External link notifies screen readers of new window
      expect(html).toContain('(opens in new tab)')
    })
  })

  describe('3. Operational Backup Consistency & Isolated Restore Boundaries', () => {
    it('verifies included and excluded components and enforces isolated restore targets', async () => {
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'renegade-test-backup-'))
      try {
        await writeFile(path.join(tempRoot, 'database.dump'), 'mock-pg-dump')
        await writeFile(path.join(tempRoot, 'media.tar.gz'), 'mock-media-archive')

        const manifest = await createOperationalBackupManifest(tempRoot, {
          createdAt: new Date().toISOString(),
          renegade: { version: '1.0.0', buildSha: 'abc' },
          postgresql: { version: '17.6' },
          consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
          includedComponents: [
            'postgresql-data',
            'media-and-local-generated-assets',
            'db-extension-and-capability-state',
            'non-secret-installation-metadata',
          ],
          migrationState: ['001_initial'],
          installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
        })

        await writeFile(path.join(tempRoot, 'manifest.json'), JSON.stringify(manifest))

        const verified = await verifyOperationalBackup(tempRoot)
        expect(verified.files).toHaveLength(2)
        expect(verified.includedComponents).toContain('postgresql-data')
        expect(verified.includedComponents).toContain('media-and-local-generated-assets')
        expect(verified.exclusions).toContain('environment variables and .env files')
        expect(verified.exclusions).toContain('Payload secrets')

        // Restore safety assertions: requires --isolated and refuses production compose
        expect(() =>
          assertRestoreSafety({
            isolated: false,
            authorized: true,
            composeFile: 'compose.restore.yaml',
          }),
        ).toThrow('requires')

        expect(() =>
          assertRestoreSafety({
            isolated: true,
            authorized: true,
            composeFile: 'compose.production.yaml',
          }),
        ).toThrow('refuses a non-isolated Compose target')

        expect(() =>
          assertRestoreSafety({
            isolated: true,
            authorized: true,
            composeFile: 'compose.restore.yaml',
          }),
        ).not.toThrow()
      } finally {
        await rm(tempRoot, { recursive: true, force: true })
      }
    })
  })
})
