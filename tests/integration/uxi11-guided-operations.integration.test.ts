import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  createOperationalBackupManifest,
  restoreBackupToFixtureTarget,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

/**
 * UXI-11 fixture-restore proof against the real database: snapshot live
 * data into a backup, restore it into a SEPARATE fixture target, verify
 * the restored contents match the snapshot, and prove live data is
 * untouched by the whole flow.
 */
let payload: Payload
const dirs: string[] = []

beforeAll(async () => {
  payload = await getPayload({ config })
})
afterAll(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  if (payload?.db.destroy) await payload.db.destroy()
})

describe('UXI-11 guided fixture restore (integration)', () => {
  it('backup → separate fixture restore → verified contents → live data untouched', async () => {
    const liveBefore = await payload.find({ collection: 'content', limit: 1, depth: 0 })
    const snapshot = {
      contentTotal: liveBefore.totalDocs,
      firstTitle: (liveBefore.docs[0] as { title?: string } | undefined)?.title ?? null,
    }

    const source = await mkdtemp(path.join(os.tmpdir(), 'renegade-uxi11-src-'))
    dirs.push(source)
    await writeFile(path.join(source, 'database.dump'), JSON.stringify(snapshot))
    await writeFile(path.join(source, 'media.tar.gz'), 'fixture-media-bytes')
    const manifest = await createOperationalBackupManifest(source, {
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
      migrationState: ['m1'],
      installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
    })
    await writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest))
    expect(manifest.destination?.kind).toBe('local-disk')
    expect(manifest.coverage?.database).toBe(true)
    expect(manifest.coverage?.encryptionKeys).toBe(false)

    const targetParent = await mkdtemp(path.join(os.tmpdir(), 'renegade-uxi11-dst-'))
    dirs.push(targetParent)
    const target = path.join(targetParent, 'fixture-target')
    const verification = await restoreBackupToFixtureTarget({
      sourceRoot: source,
      targetRoot: target,
    })

    expect(verification.checksumsVerified).toBe(true)
    expect(verification.destinationLabel).toBe('same-disk snapshot — not an off-host backup')
    const restoredSnapshot = JSON.parse(await readFile(path.join(target, 'database.dump'), 'utf8'))
    expect(restoredSnapshot).toEqual(snapshot)
    await expect(verifyOperationalBackup(target)).resolves.toBeTruthy()

    const liveAfter = await payload.find({ collection: 'content', limit: 1, depth: 0 })
    expect(liveAfter.totalDocs).toBe(snapshot.contentTotal)
  })
})
