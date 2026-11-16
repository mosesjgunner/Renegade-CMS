// RC2-DEBT-01 S0/S4 prep — a REAL media upload through the media
// workflow service (bytes land in the configured storage), replacing
// the seed world's hollow fixture asset before a portability export.
// Run: with-env b01-env npx tsx tests/rc2-h08/d01-upload.ts
import { readFileSync } from 'node:fs'

import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { uploadMedia } from '../../src/modules/media/workflow'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const payload = await getPayload({ config })
const admin = await payload.findByID({
  collection: 'users',
  id: world.ids.adminAUserId,
  overrideAccess: true,
})
const bytes = readFileSync('/home/hatch/workspace/h08/pixel.png')
const asset = (await uploadMedia(payload as never, loadConfig(), {
  user: admin as never,
  scope: { kind: 'site', siteId: world.siteA.siteId },
  title: 'D01 baseline pixel',
  altText: 'D01 baseline upload',
  originalFilename: 'pixel.png',
  bytes,
})) as unknown as Record<string, unknown>
console.log(JSON.stringify({ uploadedAssetId: String(asset.id ?? asset.doc ?? ''), asset }))
process.exit(0)
