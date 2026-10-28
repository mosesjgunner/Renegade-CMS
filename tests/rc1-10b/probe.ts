/* eslint-disable @typescript-eslint/no-explicit-any -- guarded disposable schema diagnosis */
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '@payload-config'
assert.equal(process.env.RC1_10B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5456/rc110b_complete_release_acceptance',
)
const payload: any = await getPayload({ config })
const site = (await payload.find({ collection: 'sites', limit: 1, overrideAccess: true })).docs[0]
try {
  const result = await payload.create({
    collection: 'realtime-events',
    overrideAccess: true,
    data: {
      scopeKind: 'site',
      site: site.id,
      scopeKey: `site:${site.id}`,
      kind: 'community.comment_created',
      payload: { diagnostic: true },
      occurredAt: new Date().toISOString(),
    },
  })
  console.log(JSON.stringify({ id: result.id, sequence: result.sequence }))
} catch (error: any) {
  console.log(
    JSON.stringify(
      { message: error.message, cause: error.cause?.message, data: error.data },
      null,
      2,
    ),
  )
  process.exit(1)
}
process.exit(0)
