import { createHmac, timingSafeEqual } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loadConfig } from '@/modules/core/config'
import { mediaStorage, inspectMedia } from '@/modules/media/storage'
import { mediaStorageKey } from '@/modules/media/workflow'

/** Bounded bearer ingestion grant for exact private artwork bytes, never a public media policy. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const query = new URL(request.url).searchParams
  const site = query.get('site') ?? '',
    hash = query.get('hash') ?? '',
    exp = query.get('exp') ?? '',
    signature = query.get('sig') ?? ''
  const expires = Number(exp)
  const expected = createHmac('sha256', loadConfig().payloadSecret)
    .update(`${site}:${id}:${hash}:${exp}`)
    .digest('base64url')
  if (
    !site ||
    !/^(sha256:)?[a-f0-9]{64}$/.test(hash) ||
    !Number.isSafeInteger(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 24 * 60 * 60 * 1000 ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return new Response('Forbidden', { status: 403 })
  const payload = await getPayload({ config })
  const asset = await payload
    .findByID({ collection: 'media-assets', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (
    !asset ||
    String(typeof asset.site === 'object' ? asset.site?.id : asset.site) !== site ||
    asset.checksum !== hash ||
    asset.publicPolicy !== 'private' ||
    asset.rightsStatus !== 'approved' ||
    ['failed', 'quarantined'].includes(String(asset.processingState)) ||
    (asset.rightsExpiresAt && Date.parse(asset.rightsExpiresAt) <= Date.now())
  )
    return new Response('Unavailable', { status: 404 })
  const key = await mediaStorageKey(payload, { ...asset })
  const bytes = key ? await mediaStorage(loadConfig()).get(key) : undefined
  if (!bytes || inspectMedia(bytes).sha256 !== hash)
    return new Response('Unavailable', { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
