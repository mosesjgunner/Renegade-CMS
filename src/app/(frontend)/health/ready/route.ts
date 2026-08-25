import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.find({ collection: 'sites', limit: 1, depth: 0 })
    return Response.json({ status: 'ready', checks: { database: 'ok', migrations: 'applied' } })
  } catch {
    return Response.json(
      { status: 'not_ready', checks: { database: 'unavailable' } },
      { status: 503 },
    )
  }
}
