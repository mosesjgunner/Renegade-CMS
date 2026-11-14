// RC2-H-08: plant a dummy provider credential on instance A, then inspect
// the portable export (plaintext manifest) for secret leakage.
import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { exportPortableSite } from '../../src/modules/portability/site-export'
import { encryptSecret } from '../../src/modules/social/security'

export const DUMMY_SECRET = 'H08-DUMMY-SECRET-7f3a9c'
const SITE_A = process.env.H08_SITE_ID ?? ''

const payload = await getPayload({ config })

const existing = await payload.find({
  collection: 'social-accounts',
  where: {
    and: [{ site: { equals: SITE_A } }, { externalAccountId: { equals: 'h08-dummy.test' } }],
  },
  depth: 0,
  overrideAccess: true,
})
const account =
  existing.docs[0] ??
  (await payload.create({
    collection: 'social-accounts',
    data: {
      site: SITE_A,
      displayName: 'H08 Dummy Bluesky',
      network: 'bluesky',
      actorType: 'site',
      externalAccountId: 'h08-dummy.test',
      capabilityState: 'available',
      capabilities: {},
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(DUMMY_SECRET)}`,
    } as never,
    overrideAccess: true,
  }))
console.log('planted social account:', account.id)

const stored = await payload.findByID({
  collection: 'social-accounts',
  id: account.id as string,
  depth: 0,
  overrideAccess: true,
})
const storedRef = String((stored as { connectionReference?: string }).connectionReference ?? '')
console.log('stored reference is encrypted form:', storedRef.startsWith('enc:'))
console.log('stored reference contains dummy plaintext:', storedRef.includes(DUMMY_SECRET))

const manifest = await exportPortableSite(payload, SITE_A)
const manifestJson = JSON.stringify(manifest)
const summary = {
  records: manifest.records.length,
  dummyPlaintextInExport: manifestJson.includes(DUMMY_SECRET),
  encryptedRefInExport: manifestJson.includes(storedRef),
  anyEncReferenceInExport: manifestJson.includes('enc:'),
  collections: Array.from(
    new Set(manifest.records.map((r: { collection: string }) => r.collection)),
  ).sort(),
}
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/h08-export-inspection.json',
  JSON.stringify(summary, null, 2),
)
console.log(JSON.stringify(summary, null, 2))
process.exit(0)
