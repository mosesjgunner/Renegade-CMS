import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.find({ collection: 'sites', limit: 1, depth: 0, overrideAccess: true })
    return Response.json({ status: 'ready', checks: { database: 'ok', migrations: 'applied' } })
  } catch (error) {
    // Readiness remains intentionally non-disclosing, but operators need the
    // underlying cause in server logs when a deployment never becomes ready.
    console.error('Readiness database check failed:', error)
    return Response.json(
      { status: 'not_ready', checks: { database: 'unavailable' } },
      { status: 503 },
    )
  }
}
