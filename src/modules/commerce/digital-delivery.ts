import { authorizePrivateDownload } from './catalog'
import type { Payload } from 'payload'

export async function assertDigitalAssetsReady(
  payload: Payload,
  products: readonly { digitalDelivery?: unknown }[],
  siteId: string,
) {
  for (const product of products) {
    const delivery = product.digitalDelivery as
      | {
          assets?: Array<{
            mediaId?: unknown
            rightsStatus?: unknown
            malwareStatus?: unknown
            publicOriginal?: unknown
          }>
        }
      | undefined
    for (const configured of delivery?.assets ?? []) {
      const asset = await payload
        .findByID({
          collection: 'media-assets',
          id: String(configured.mediaId ?? ''),
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const assetSite = typeof asset?.site === 'object' ? asset.site.id : asset?.site
      if (
        !asset ||
        String(assetSite) !== siteId ||
        asset.publicPolicy !== 'private' ||
        ['quarantined', 'failed'].includes(String(asset.processingState)) ||
        configured.rightsStatus !== 'approved' ||
        configured.malwareStatus !== 'clean' ||
        configured.publicOriginal !== false
      )
        throw new Error(
          'A digital asset is not approved for private delivery. Contact the store before paying.',
        )
    }
  }
}

export function deliverySigningSecret(): string {
  return (
    process.env.COMMERCE_DELIVERY_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : 'development-delivery-secret')
  )
}

/** Reject an undeliverable purchase before creating any provider payment. */
export function assertDigitalDeliveryConfigured(
  products: readonly { digitalDelivery?: unknown }[],
  secret = deliverySigningSecret(),
) {
  if (
    products.some((product) => {
      const delivery = product.digitalDelivery as { assets?: unknown[] } | null | undefined
      return Array.isArray(delivery?.assets) && delivery.assets.length > 0
    }) &&
    secret.length < 16
  )
    throw new Error('Digital delivery is unavailable. Contact the store before paying.')
}

export function deliveryGrantAvailable(grant: {
  id: unknown
  entitlement?: unknown
  expiresAt?: unknown
  revokedAt?: unknown
  downloadLimit?: unknown
  downloadCount?: unknown
}) {
  const entitlement = grant.entitlement as
    | { revokedAt?: unknown; startsAt?: unknown; endsAt?: unknown }
    | undefined
  return authorizePrivateDownload({
    id: String(grant.id),
    entitlementActive: Boolean(
      entitlement &&
        !entitlement.revokedAt &&
        (!entitlement.startsAt || Date.parse(String(entitlement.startsAt)) <= Date.now()) &&
        (!entitlement.endsAt || Date.parse(String(entitlement.endsAt)) > Date.now()),
    ),
    expiresAt: grant.expiresAt ? String(grant.expiresAt) : undefined,
    revokedAt: grant.revokedAt ? String(grant.revokedAt) : undefined,
    downloadLimit: grant.downloadLimit == null ? undefined : Number(grant.downloadLimit),
    downloadCount: Number(grant.downloadCount ?? 0),
  }).allowed
}
