// RC2-H-08: create the empty target site on the fresh Standard instance
// that the portable archive will be imported into.
import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'

import config from '../../src/payload.config'

const payload = await getPayload({ config })
const site = await payload.create({
  collection: 'sites',
  data: {
    name: 'H08 Import Target',
    slug: 'h08-import-target',
    description: 'Empty site created by RC2-H-08 to receive the portable import.',
    lifecycle: 'active',
  } as never,
  overrideAccess: true,
})
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/h08-target-site.json',
  JSON.stringify({ targetSiteId: site.id }, null, 2),
)
console.log('target site:', site.id)
process.exit(0)
