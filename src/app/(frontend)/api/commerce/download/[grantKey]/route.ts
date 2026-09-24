import { createHash } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { authorizePrivateDownload } from '@/modules/commerce/catalog'
import { mediaStorage } from '@/modules/media/storage'
import { mediaStorageKey } from '@/modules/media/workflow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const id = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? String((value as { id?: unknown }).id ?? '')
    : String(value ?? '')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function GET(request: Request, context: { params: Promise<{ grantKey: string }> }) {
  const payload = await getPayload({ config })
  const { grantKey } = await context.params
  const found = await payload.find({
    collection: 'digital-delivery-grants',
    where: { grantKeyHash: { equals: hash(grantKey) } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const grant = found.docs[0] as unknown as Record<string, unknown> | undefined
  const entitlement = grant?.entitlement as Record<string, unknown> | undefined
  const decision = authorizePrivateDownload(
    grant
      ? {
          id: String(grant.id),
          entitlementActive: Boolean(
            entitlement &&
              !entitlement.revokedAt &&
              (!entitlement.endsAt || Date.parse(String(entitlement.endsAt)) > Date.now()),
          ),
          expiresAt: grant.expiresAt ? String(grant.expiresAt) : undefined,
          revokedAt: grant.revokedAt ? String(grant.revokedAt) : undefined,
          downloadLimit:
            grant.downloadLimit === null || grant.downloadLimit === undefined
              ? undefined
              : Number(grant.downloadLimit),
          downloadCount: Number(grant.downloadCount ?? 0),
        }
      : null,
  )
  const fingerprint = hash(
    `${request.headers.get('user-agent') ?? ''}|${request.headers.get('x-forwarded-for') ?? ''}`,
  )
  if (!grant || !decision.allowed) {
    if (grant)
      await payload.create({
        collection: 'digital-download-events',
        data: {
          site: id(grant.site),
          publication: id(grant.publication) || undefined,
          space: id(grant.space) || undefined,
          grant: String(grant.id),
          mediaAsset: id(grant.mediaAsset),
          occurredAt: new Date().toISOString(),
          outcome: 'denied',
          reason: decision.reason,
          requestFingerprint: fingerprint,
        },
        overrideAccess: true,
      } as never)
    return Response.json(
      { error: 'Download is unavailable.' },
      { status: 404, headers: { 'cache-control': 'private, no-store' } },
    )
  }
  const asset = grant.mediaAsset as Record<string, unknown>
  const product = grant.product as Record<string, unknown>
  const configured = (
    (product.digitalDelivery as { assets?: Array<Record<string, unknown>> } | undefined)?.assets ??
    []
  ).find((item) => String(item.mediaId) === String(asset.id))
  if (
    !configured ||
    configured.rightsStatus !== 'approved' ||
    configured.malwareStatus !== 'clean' ||
    configured.publicOriginal !== false ||
    asset.publicPolicy !== 'private' ||
    ['quarantined', 'failed'].includes(String(asset.processingState))
  ) {
    await payload.create({
      collection: 'digital-download-events',
      data: {
        site: id(grant.site),
        grant: String(grant.id),
        mediaAsset: id(asset),
        occurredAt: new Date().toISOString(),
        outcome: 'denied',
        reason: 'ASSET_NOT_DELIVERABLE',
        requestFingerprint: fingerprint,
      },
      overrideAccess: true,
    } as never)
    return Response.json(
      { error: 'Download is unavailable.' },
      { status: 404, headers: { 'cache-control': 'private, no-store' } },
    )
  }
  const key = await mediaStorageKey(payload, asset)
  const bytes = key ? await mediaStorage(loadConfig()).get(key) : undefined
  if (!bytes)
    return Response.json(
      { error: 'Download is unavailable.' },
      { status: 404, headers: { 'cache-control': 'private, no-store' } },
    )
  const now = new Date().toISOString()
  const pool = (
    payload as unknown as {
      db?: {
        pool?: {
          query: (
            text: string,
            values: unknown[],
          ) => Promise<{ rows: Array<Record<string, unknown>> }>
        }
      }
    }
  ).db?.pool
  if (pool) {
    const reserved = await pool.query(
      `UPDATE digital_delivery_grants SET download_count = download_count + 1, last_downloaded_at = $2, updated_at = $2 WHERE id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > $2) AND (download_limit IS NULL OR download_count < download_limit) RETURNING id`,
      [String(grant.id), now],
    )
    if (!reserved.rows.length)
      return Response.json(
        { error: 'Download is unavailable.' },
        { status: 404, headers: { 'cache-control': 'private, no-store' } },
      )
  } else {
    await payload.update({
      collection: 'digital-delivery-grants',
      id: String(grant.id),
      data: { downloadCount: Number(grant.downloadCount ?? 0) + 1, lastDownloadedAt: now },
      overrideAccess: true,
    } as never)
  }
  await payload.create({
    collection: 'digital-download-events',
    data: {
      site: id(grant.site),
      publication: id(grant.publication) || undefined,
      space: id(grant.space) || undefined,
      grant: String(grant.id),
      mediaAsset: id(asset),
      occurredAt: now,
      outcome: 'allowed',
      requestFingerprint: fingerprint,
    },
    overrideAccess: true,
  } as never)
  const filename = String(asset.filename ?? `${asset.id}.bin`).replace(/[^A-Za-z0-9._-]/g, '_')
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': String(asset.mimeType ?? 'application/octet-stream'),
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
