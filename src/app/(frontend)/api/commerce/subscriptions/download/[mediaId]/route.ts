import config from '@payload-config'
import { getPayload } from 'payload'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { hasEntitlement } from '@/modules/commerce/subscription-service'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { mediaStorage } from '@/modules/media/storage'
import { mediaStorageKey } from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const denied = () =>
    Response.json(
      { error: 'Download unavailable.' },
      { status: 404, headers: { 'cache-control': 'private, no-store' } },
    )
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  const { mediaId } = await context.params
  if (
    !siteId ||
    !memberId ||
    !(await hasEntitlement(payload, {
      subjectId: memberId,
      siteId,
      resource: `media:${mediaId}`,
      capability: 'download',
      unmetered: true,
    }))
  )
    return denied()
  const asset = await payload
    .findByID({ collection: 'media-assets', id: mediaId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const assetSite = typeof asset?.site === 'object' ? asset.site?.id : asset?.site
  if (
    !asset ||
    String(assetSite) !== siteId ||
    asset.publicPolicy !== 'private' ||
    asset.rightsStatus !== 'approved' ||
    asset.processingState !== 'ready'
  )
    return denied()
  const key = await mediaStorageKey(payload, { ...asset })
  const bytes = key ? await mediaStorage(loadConfig()).get(key) : undefined
  if (!bytes) return denied()
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
