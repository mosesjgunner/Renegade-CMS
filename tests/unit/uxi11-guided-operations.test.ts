import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getMigrations: vi.fn() }))

import {
  backupDestinationLabel,
  createOperationalBackupManifest,
  deriveBackupCoverage,
  parseBackupStatusRecord,
  restoreBackupToFixtureTarget,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'
import {
  createSupportBundle,
  type OperationsDiagnostics,
} from '../../src/modules/operations/diagnostics'
import {
  SUPPORT_BUNDLE_ALLOWLIST,
  evaluateUpdatePreflight,
  liveRestoreOffered,
  loadBackupDestinationConfig,
  saveBackupDestinationConfig,
  translateDiagnosticsToHealthItems,
  validateBackupDestinationConfig,
} from '../../src/modules/operations/guided-operations'

const dirs: string[] = []
async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const baseDiagnostics = (
  overrides: Partial<OperationsDiagnostics> = {},
): OperationsDiagnostics => ({
  generatedAt: '2026-11-19T00:00:00.000Z',
  status: 'healthy',
  version: { app: '1.0.0', buildSha: 'abc', schemaVersion: '1.0.0', deploymentProfile: 'Standard' },
  database: { status: 'healthy' },
  migrations: { status: 'current', applied: 3, expected: 3, missing: [] },
  web: { status: 'healthy', observedAt: '2026-11-19T00:00:00.000Z' },
  worker: { status: 'healthy', observedAt: '2026-11-19T00:00:00.000Z', ageMs: 1000 },
  jobs: { queued: 0, running: 0, failed: 0, oldestPendingAt: null, recentFailures: [] },
  capabilities: [],
  providers: [],
  email: { provider: 'smtp', status: 'healthy' },
  mediaStorage: { status: 'healthy', driver: 'local' },
  backup: { status: 'healthy', lastSuccessfulAt: '2026-11-19T00:00:00.000Z', lastFailureAt: null },
  ...overrides,
})

async function backupFixture(destination?: {
  kind: 'local-disk' | 'operator-configured-remote'
  remoteType?: string
}) {
  const root = await tempDir('renegade-uxi11-backup-')
  await writeFile(path.join(root, 'database.dump'), 'native-postgres-custom-dump')
  await writeFile(path.join(root, 'media.tar.gz'), 'media-and-derivatives')
  const manifest = await createOperationalBackupManifest(root, {
    createdAt: '2026-11-19T00:00:00.000Z',
    renegade: { version: '1.0.0', buildSha: null },
    postgresql: { version: '17.6' },
    consistency: { mode: 'maintenance-window', confirmedAt: '2026-11-19T00:00:00.000Z' },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    ...(destination ? { destination } : {}),
    migrationState: ['m1', 'm2'],
    installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
  })
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
  return { root, manifest }
}

describe('UXI-11 health in task terms', () => {
  it('translates a missing worker into scheduling impact, not an engine code', () => {
    const items = translateDiagnosticsToHealthItems(
      baseDiagnostics({ worker: { status: 'unavailable', observedAt: null, ageMs: null } }),
    )
    const worker = items.find((item) => item.id === 'health.worker')
    expect(worker?.state).toBe('broken')
    expect(worker?.title).toContain('Scheduled tasks are paused')
    expect(worker?.title).toContain('will not publish on schedule')
    expect(worker?.impact).toBeTruthy()
    expect(worker?.nextAction).toBeTruthy()
  })

  it('never renders a dismissed-but-broken item as healthy or hidden', () => {
    const diagnostics = baseDiagnostics({
      worker: { status: 'unavailable', observedAt: null, ageMs: null },
    })
    const items = translateDiagnosticsToHealthItems(diagnostics, ['health.worker', 'health.backup'])
    const worker = items.find((item) => item.id === 'health.worker')
    expect(worker).toBeDefined()
    expect(worker?.state).toBe('broken')
    expect(worker?.dismissedButUnresolved).toBe(true)
    // A dismissed healthy tip, by contrast, is hidden.
    expect(items.find((item) => item.id === 'health.backup')).toBeUndefined()
  })
})

describe('UXI-11 backup coverage + destination labelling', () => {
  it('labels local-disk and unknown destinations as same-disk, remote with its type', () => {
    expect(backupDestinationLabel({ kind: 'local-disk' })).toBe(
      'same-disk snapshot — not an off-host backup',
    )
    expect(backupDestinationLabel({ kind: 'unknown' })).toBe(
      'same-disk snapshot — not an off-host backup',
    )
    expect(backupDestinationLabel(null)).toBe('same-disk snapshot — not an off-host backup')
    expect(
      backupDestinationLabel({ kind: 'operator-configured-remote', remoteType: 'S3 bucket' }),
    ).toBe('off-host backup — S3 bucket')
  })

  it('derives coverage truthfully: keys excluded, config non-secret only', () => {
    const coverage = deriveBackupCoverage({
      files: [{ path: 'database.dump' }, { path: 'media.tar.gz' }],
      includedComponents: ['postgresql-data', 'non-secret-installation-metadata'],
      exclusions: ['archive encryption keys'],
      renegade: { version: '1.0.0' },
    })
    expect(coverage).toEqual({
      database: true,
      media: true,
      configuration: 'non-secret-only',
      encryptionKeys: false,
      versionMetadata: true,
    })
  })

  it('records destination + coverage in new manifests; legacy status defaults to unknown', async () => {
    const { manifest } = await backupFixture({
      kind: 'operator-configured-remote',
      remoteType: 'second server (rsync)',
    })
    expect(manifest.destination).toEqual({
      kind: 'operator-configured-remote',
      remoteType: 'second server (rsync)',
    })
    expect(manifest.coverage?.encryptionKeys).toBe(false)
    const legacy = parseBackupStatusRecord({
      status: 'healthy',
      lastSuccessfulAt: '2026-11-19T00:00:00.000Z',
    })
    expect(legacy.destination.kind).toBe('unknown')
    expect(legacy.destinationLabel).toBe('same-disk snapshot — not an off-host backup')
    const recorded = parseBackupStatusRecord({
      status: 'healthy',
      lastSuccessfulAt: '2026-11-19T00:00:00.000Z',
      destinationKind: 'local-disk',
    })
    expect(recorded.destinationLabel).toBe('same-disk snapshot — not an off-host backup')
  })

  it('validates the guided destination flow and round-trips the saved config', async () => {
    expect(
      validateBackupDestinationConfig({ kind: 'local-disk', localPath: 'relative/path' }).ok,
    ).toBe(false)
    expect(
      validateBackupDestinationConfig({
        kind: 'operator-configured-remote',
        localPath: '/srv/backups',
      }).ok,
    ).toBe(false)
    const mediaDir = await tempDir('renegade-uxi11-media-')
    const saved = await saveBackupDestinationConfig(mediaDir, {
      kind: 'operator-configured-remote',
      localPath: '/srv/backups',
      remoteType: 'S3 bucket',
    })
    expect(saved.updatedAt).toBeTruthy()
    expect(await loadBackupDestinationConfig(mediaDir)).toMatchObject({
      kind: 'operator-configured-remote',
      remoteType: 'S3 bucket',
    })
  })
})

describe('UXI-11 fixture restore', () => {
  it('restores into a separate target, verifies, and leaves the source untouched', async () => {
    const { root } = await backupFixture()
    const target = path.join(await tempDir('renegade-uxi11-target-'), 'fixture')
    const verification = await restoreBackupToFixtureTarget({
      sourceRoot: root,
      targetRoot: target,
    })
    expect(verification.checksumsVerified).toBe(true)
    expect(verification.version).toBe('1.0.0')
    expect(verification.migrationCount).toBe(2)
    expect(liveRestoreOffered(verification)).toBe(true)
    expect(liveRestoreOffered(null)).toBe(false)
    // Source still verifies and its bytes are unchanged.
    await expect(verifyOperationalBackup(root)).resolves.toBeTruthy()
    expect(await readFile(path.join(root, 'database.dump'), 'utf8')).toBe(
      'native-postgres-custom-dump',
    )
    expect(await readFile(path.join(target, 'database.dump'), 'utf8')).toBe(
      'native-postgres-custom-dump',
    )
  })

  it('refuses the source itself or a non-empty target', async () => {
    const { root } = await backupFixture()
    await expect(
      restoreBackupToFixtureTarget({ sourceRoot: root, targetRoot: root }),
    ).rejects.toThrow('separate')
    await expect(
      restoreBackupToFixtureTarget({ sourceRoot: root, targetRoot: path.dirname(root) }),
    ).rejects.toThrow('empty')
  })
})

describe('UXI-11 update preflight', () => {
  const healthyBackup = parseBackupStatusRecord({
    status: 'healthy',
    lastSuccessfulAt: '2026-11-19T00:00:00.000Z',
    destinationKind: 'local-disk',
  })
  const now = new Date('2026-11-19T12:00:00.000Z')

  it('is ready only when artifact, recent backup, and disk all pass — and then offers only the operator command', () => {
    const preflight = evaluateUpdatePreflight({
      currentVersion: '1.0.0',
      targetVersion: '1.1.0',
      backup: healthyBackup,
      freeDiskBytes: 20 * 1024 ** 3,
      now,
    })
    expect(preflight.ready).toBe(true)
    expect(preflight.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(preflight.operatorCommand).toContain('npm run upgrade:operational')
    expect(preflight.operatorCommand).toContain('--target-version 1.1.0')
    expect(preflight.downtimeStatement).toContain('unavailable')
  })

  it('fails each check with a fix and offers no command when not ready', () => {
    const preflight = evaluateUpdatePreflight({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      backup: parseBackupStatusRecord({ status: 'not_configured' }),
      freeDiskBytes: 1 * 1024 ** 3,
      now,
    })
    expect(preflight.ready).toBe(false)
    expect(preflight.operatorCommand).toBeNull()
    expect(preflight.checks.map((check) => check.status)).toEqual(['fail', 'fail', 'fail'])
    expect(preflight.checks.every((check) => check.fix.length > 0)).toBe(true)
  })
})

describe('UXI-11 support bundle allowlist', () => {
  it('cannot contain a planted secret from diagnostics or config, by construction', () => {
    const planted = 'PLANTED-SECRET-VALUE-12345'
    const diagnostics = baseDiagnostics({
      providers: [
        { id: 'p1', label: planted, providerKey: planted, status: 'degraded', observedAt: null },
      ],
      jobs: {
        queued: 0,
        running: 0,
        failed: 1,
        oldestPendingAt: null,
        recentFailures: [
          {
            id: 'j1',
            taskName: 'send-email',
            timestamps: { createdAt: null, updatedAt: null, completedAt: null },
            attemptCount: 2,
            error: `token=${planted}`,
            correlation: { jobId: 'j1', queue: null, idempotencyKey: planted },
          },
        ],
      },
    })
    const config = {
      version: '1.0.0',
      storage: { driver: 'local', mediaDir: '/srv/media' },
      email: { mode: 'smtp', secure: true, password: planted },
      proxyMode: 'direct',
      warnings: [`warning containing ${planted}`],
    } as never
    const bundle = createSupportBundle(diagnostics, config)
    expect(bundle).not.toContain(planted)
    expect(bundle).not.toContain('/srv/media')
    const parsed = JSON.parse(bundle) as Record<string, unknown>
    expect(parsed.format).toBe('renegade-support-bundle/v1')
    // Every emitted top-level section is on the published allowlist.
    expect(SUPPORT_BUNDLE_ALLOWLIST).toContain('jobs.recentFailures[].taskName')
    expect(JSON.stringify(parsed.jobs)).toContain('send-email')
    expect(JSON.stringify(parsed.jobs)).not.toContain('error')
  })
})
