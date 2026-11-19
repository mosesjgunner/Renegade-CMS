// RC2-I-02 / RC2-DEBT-07 proof: in a Lean profile (RENEGADE_MODULES
// empty = floor only), are the quality collections registered, and
// what happens when the rendered-audit lifecycle tries to persist?
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { persistRenderedAuditLifecycle } from '../../src/modules/public/discovery-lifecycle'

const payload = await getPayload({ config })
const slugs = Object.keys(payload.collections)
const viewPaths = Object.values(
  (
    payload.config as {
      admin?: { components?: { views?: Record<string, { path?: string }> } }
    }
  ).admin?.components?.views ?? {},
).map((view) => view.path)
console.log(
  JSON.stringify({
    profileModules: process.env.RENEGADE_MODULES ?? '(unset)',
    collectionCount: slugs.length,
    qualityScansRegistered: slugs.includes('quality-scans'),
    qualityIssuesRegistered: slugs.includes('quality-issues'),
    renderedQualityViewRegistered: viewPaths.includes('/rendered-quality'),
  }),
)
const site = await payload.find({ collection: 'sites', limit: 1, depth: 0, overrideAccess: true })
const siteId = site.docs[0] ? String(site.docs[0].id) : 'missing-site'
try {
  const summary = await persistRenderedAuditLifecycle(payload as never, siteId, [])
  console.log(JSON.stringify({ persist: 'ok', summary }))
} catch (error) {
  console.log(
    JSON.stringify({
      persist: 'threw',
      error: error instanceof Error ? error.message.slice(0, 240) : String(error),
    }),
  )
}
await payload.db.destroy?.()
process.exit(0)
