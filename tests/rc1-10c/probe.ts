import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '@payload-config'

assert.equal(process.env.RC1_10C_DISPOSABLE, 'yes')
const payload = await getPayload({ config })
const sites = await payload.find({ collection: 'sites', limit: 10, overrideAccess: true })
console.log('Sites in DB:', JSON.stringify(sites.docs.map((s: any) => ({ id: s.id, title: s.title, domain: s.domain }))))
process.exit(0)
