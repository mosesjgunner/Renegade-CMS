// RC2-I-02 / RC2-DEBT-26 proof, export leg: export the seed world's
// Site A through the real exportPortableSite and report whether the
// member-space chain (space, its profile, its member, the space post)
// is inside the archive — the profile was missing before the fix.
import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { exportPortableSite } from '../../src/modules/portability/site-export'
import { createPortableArchive } from '../../src/modules/portability/contracts'

const siteId = process.env.I02_SITE_ID ?? ''
const keyHex = process.env.I02_KEY ?? ''
if (!siteId || !/^[a-f0-9]{64}$/.test(keyHex)) throw new Error('I02_SITE_ID / I02_KEY required')

const payload = await getPayload({ config })
const manifest = await exportPortableSite(payload as never, siteId)
const byCollection = new Map<string, number>()
for (const record of manifest.records)
  byCollection.set(record.collection, (byCollection.get(record.collection) ?? 0) + 1)
const space = manifest.records.find((record) => record.collection === 'spaces')
const profileId = space ? String(space.data.profile ?? '') : ''
// RC2-DEBT-01: spaces carry no member field; the member is the
// profile's member.
const profileRecord = manifest.records.find(
  (record) => record.collection === 'profiles' && record.id === profileId,
)
const memberId = profileRecord ? String(profileRecord.data.member ?? '') : ''
const summary = {
  total: manifest.records.length,
  byCollection: Object.fromEntries([...byCollection.entries()].sort()),
  spacePresent: Boolean(space),
  spaceProfileId: profileId,
  profileInArchive: manifest.records.some(
    (record) => record.collection === 'profiles' && record.id === profileId,
  ),
  memberInArchive: manifest.records.some(
    (record) => record.collection === 'members' && record.id === memberId,
  ),
  spacePostInArchive: manifest.records.some(
    (record) => record.collection === 'content' && String(record.data.space ?? '') === space?.id,
  ),
}
console.log(JSON.stringify(summary, null, 2))
writeFileSync(
  process.env.I02_ARCHIVE ?? '/home/hatch/workspace/h08/i02-archive.json',
  `${JSON.stringify(createPortableArchive(manifest, Buffer.from(keyHex, 'hex')), null, 2)}\n`,
  { mode: 0o600 },
)
await payload.db.destroy?.()
process.exit(0)
