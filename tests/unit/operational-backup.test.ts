import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertRestoreSafety,
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'renegade-backup-'))
  roots.push(root)
  await writeFile(path.join(root, 'database.dump'), 'native-postgres-custom-dump')
  await writeFile(path.join(root, 'media.tar.gz'), 'media-and-derivatives')
  const manifest = await createOperationalBackupManifest(root, {
    createdAt: '2026-08-29T00:00:00.000Z',
    renegade: { version: '1.0.0', buildSha: null },
    postgresql: { version: '17.6' },
    consistency: { mode: 'maintenance-window', confirmedAt: '2026-08-29T00:00:00.000Z' },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    migrationState: ['m1'],
    installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
  })
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('operational backup manifest', () => {
  it('verifies native dump/media components and contains no secret installation fields', async () => {
    const root = await fixture()
    const manifest = await verifyOperationalBackup(root)
    expect(manifest.files).toHaveLength(2)
    expect(JSON.stringify(manifest)).not.toContain('super-secret')
  })
  it('rejects corrupted components and missing manifest components', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'database.dump'), 'corrupted')
    await expect(verifyOperationalBackup(root)).rejects.toThrow('checksum mismatch')
    const safeRoot = await fixture()
    const manifest = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(path.join(safeRoot, 'manifest.json'), 'utf8'),
    )
    manifest.files = manifest.files.slice(0, 1)
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyOperationalBackup(root)).rejects.toThrow('missing required components')
  })
  it('rejects corrupted media, unsupported formats, and secret-shaped manifest metadata', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'media.tar.gz'), 'corrupted-media')
    await expect(verifyOperationalBackup(root)).rejects.toThrow('checksum mismatch')
    const safeRoot = await fixture()
    const manifest = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(path.join(safeRoot, 'manifest.json'), 'utf8'),
    )
    manifest.version = 999
    await writeFile(path.join(safeRoot, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyOperationalBackup(safeRoot)).rejects.toThrow('Unsupported')
    manifest.version = 1
    manifest.installation.databasePassword = 'must-not-leak'
    await writeFile(path.join(safeRoot, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyOperationalBackup(safeRoot)).rejects.toThrow('must not contain secret')
  })

  it('refuses non-isolated or unauthorized restore targets', () => {
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
    ).toThrow('non-isolated')
  })
})
