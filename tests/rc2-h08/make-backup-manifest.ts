// RC2-H-08: build + verify the operational backup manifest for the native
// backup of instance A, using the product's own format library.
import { writeFileSync } from 'node:fs'
import { Client } from 'pg'

import {
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

const root = '/home/hatch/workspace/h08/backup'
const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const mig = await client.query('select name from payload_migrations order by batch, name')
const ver = await client.query('show server_version')
await client.end()

const manifest = await createOperationalBackupManifest(root, {
  createdAt: new Date().toISOString(),
  renegade: { version: '0.1.0', buildSha: 'ca445a1b1c14c23b7f0acfe1fa68f9c09b4da3cd' },
  postgresql: { version: String(ver.rows[0].server_version) },
  consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
  includedComponents: [
    'postgresql-data',
    'media-and-local-generated-assets',
    'db-extension-and-capability-state',
    'non-secret-installation-metadata',
  ],
  migrationState: mig.rows.map((r: { name: string }) => r.name),
  installation: {
    storageDriver: 'local',
    mediaDir: '/home/hatch/workspace/h08/media-a',
    imageTag: null,
  },
})
writeFileSync(`${root}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log('manifest written:', manifest.totals)

const verified = await verifyOperationalBackup(root)
console.log(
  'verifyOperationalBackup: OK —',
  verified.files.length,
  'files,',
  verified.totals.bytes,
  'bytes',
)
process.exit(0)
