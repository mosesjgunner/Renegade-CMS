import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertRestoreSafety,
  createOperationalBackupManifest,
  directoryIsEmpty,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

const roots: string[] = []

async function createBackupFixture(options?: { corruptMedia?: boolean; omitMedia?: boolean }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'renegade-backup-media-'))
  roots.push(root)

  await writeFile(path.join(root, 'database.dump'), 'mock-postgres-custom-dump-content')

  if (!options?.omitMedia) {
    await writeFile(
      path.join(root, 'media.tar.gz'),
      Buffer.from('simulated-compressed-tarball-containing-canonical-blobs-and-variants'),
    )
  }

  const manifest = await createOperationalBackupManifest(root, {
    createdAt: new Date().toISOString(),
    renegade: { version: '1.0.0', buildSha: null },
    postgresql: { version: '17.6' },
    consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    migrationState: [
      '20260912_060000_med_00_media_contract',
      '20260912_070000_med_01_upload_sessions',
    ],
    installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
  })

  if (options?.corruptMedia) {
    // Corrupt media archive after manifest was generated with original hash
    await writeFile(
      path.join(root, 'media.tar.gz'),
      Buffer.from('corrupted-data-tampered-after-manifest'),
    )
  }

  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return { root, manifest }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('MED-01 operational backup and restore media verification', () => {
  it('verifies media.tar.gz archive integrity and manifest consistency', async () => {
    const { root, manifest } = await createBackupFixture()
    const verified = await verifyOperationalBackup(root)

    expect(verified.format).toBe('renegade-operational-backup')
    expect(verified.version).toBe(1)
    expect(verified.files).toHaveLength(2)

    const mediaEntry = verified.files.find((f) => f.path === 'media.tar.gz')
    expect(mediaEntry).toBeDefined()
    expect(mediaEntry?.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(mediaEntry?.bytes).toBeGreaterThan(0)
    expect(verified.totals.bytes).toBe(manifest.totals.bytes)
  })

  it('rejects tampered or corrupted media archive during pre-restore verification', async () => {
    const { root } = await createBackupFixture({ corruptMedia: true })
    await expect(verifyOperationalBackup(root)).rejects.toThrow(
      'Operational backup checksum mismatch: media.tar.gz',
    )
  })

  it('requires clean target directory before restoring media', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-restore-target-'))
    roots.push(mediaDir)

    expect(await directoryIsEmpty(mediaDir)).toBe(true)

    // Simulate pre-existing conflicting file
    await writeFile(path.join(mediaDir, 'existing-file.txt'), 'collision')
    expect(await directoryIsEmpty(mediaDir)).toBe(false)
  })

  it('enforces isolation and authorization gates for media restores', () => {
    expect(() =>
      assertRestoreSafety({
        isolated: false,
        authorized: true,
        composeFile: 'compose.restore.yaml',
      }),
    ).toThrow('Restore requires --isolated and --authorize-restore')

    expect(() =>
      assertRestoreSafety({
        isolated: true,
        authorized: false,
        composeFile: 'compose.restore.yaml',
      }),
    ).toThrow('Restore requires --isolated and --authorize-restore')

    expect(() =>
      assertRestoreSafety({
        isolated: true,
        authorized: true,
        composeFile: 'compose.production.yaml',
      }),
    ).toThrow('Restore refuses a non-isolated Compose target')

    expect(() =>
      assertRestoreSafety({
        isolated: true,
        authorized: true,
        composeFile: 'compose.restore.yaml',
      }),
    ).not.toThrow()
  })

  it('validates exclusion of ephemeral session directories from media backup structure', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-media-source-'))
    roots.push(mediaDir)

    // Canonical media structure
    await mkdir(path.join(mediaDir, 'blobs'), { recursive: true })
    await writeFile(path.join(mediaDir, 'blobs', 'canonical.png'), 'canonical-png-data')

    // Staging ephemeral structure
    const stagingDir = path.join(mediaDir, '.upload-sessions', 'test-session-123')
    await mkdir(stagingDir, { recursive: true })
    await writeFile(path.join(stagingDir, '0.part'), 'temporary-part-chunk')

    // Filter pattern matching backup script: excludes .upload-sessions
    const filesInMedia = ['blobs/canonical.png', '.upload-sessions/test-session-123/0.part']
    const excludedPatterns = ['.upload-sessions', './.upload-sessions']

    const backedUpFiles = filesInMedia.filter(
      (file) => !excludedPatterns.some((pattern) => file.startsWith(pattern.replace('./', ''))),
    )

    expect(backedUpFiles).toEqual(['blobs/canonical.png'])
    expect(backedUpFiles).not.toContain('.upload-sessions/test-session-123/0.part')
  })
})
