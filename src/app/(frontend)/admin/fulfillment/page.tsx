import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { FulfillmentCommandCenter } from '@/modules/admin/FulfillmentCommandCenter'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { getPublicPodConnectionProjection } from '@/modules/commerce/pod-connection'
import {
  MANUAL_FULFILLMENT_DISCLAIMER,
  type ManualFulfillmentPackage,
} from '@/modules/commerce/manual-fulfillment'
import type { PODJob } from '@/modules/commerce/fulfillment-plan'
import type { PublicPodConnectionProjection } from '@/modules/commerce/pod-connection'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    tab?: 'jobs' | 'manual' | 'providers' | 'mappings'
    provider?: string
  }>
}

export default async function FulfillmentAdminPage({ searchParams }: Props) {
  const payload = await getPayload({ config: configPromise })
  const incomingHeaders = await headers()
  const auth = await payload.auth({ headers: incomingHeaders }).catch(() => null)
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  if (!grant.authorized) {
    redirect('/login')
  }

  const { tab, provider } = (await searchParams) || {}
  const siteFilter = grant.isGlobalOwner
    ? undefined
    : grant.authorizedSiteIds.length === 1
      ? { site: { equals: grant.authorizedSiteIds[0] } }
      : { site: { in: grant.authorizedSiteIds } }

  const [jobsRes, providersRes, manualRes] = await Promise.all([
    payload
      .find({
        collection: 'pod-jobs' as never,
        where: siteFilter,
        limit: 100,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
    payload
      .find({
        collection: 'pod-connections' as never,
        where: siteFilter,
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
    payload
      .find({
        collection: 'manual-fulfillment-packages' as never,
        where: siteFilter,
        limit: 100,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
  ])

  const initialJobs: PODJob[] = (jobsRes.docs as any[]).map((doc) => ({
    id: String(doc.id),
    orderId: String(typeof doc.order === 'object' && doc.order ? doc.order.id : (doc.order ?? '')),
    siteId: String(typeof doc.site === 'object' && doc.site ? doc.site.id : (doc.site ?? '')),
    connectionId: String(
      typeof doc.connection === 'object' && doc.connection
        ? doc.connection.id
        : (doc.connection ?? ''),
    ),
    providerKey: String(doc.providerKey ?? ''),
    packageIndex: Number(doc.packageIndex ?? 0),
    idempotencyKey: String(doc.idempotencyKey ?? ''),
    payloadHash: String(doc.payloadHash ?? ''),
    state: doc.state ?? 'pending',
    addressPolicy: doc.addressPolicy ?? 'domestic',
    recipientSnapshot: doc.recipientSnapshot ?? {
      name: '',
      addressLine1: '',
      city: '',
      country: 'US',
    },
    itemsSnapshot: Array.isArray(doc.itemsSnapshot) ? doc.itemsSnapshot : [],
    costSnapshot: doc.costSnapshot ?? { estimatedCostMinor: '0', currency: 'USD' },
    attemptCount: Number(doc.attemptCount ?? 0),
    externalOrderId: doc.externalOrderId ? String(doc.externalOrderId) : undefined,
    holdExpiresAt: doc.holdExpiresAt ? String(doc.holdExpiresAt) : undefined,
    releasedAt: doc.releasedAt ? String(doc.releasedAt) : undefined,
    auditTrail: Array.isArray(doc.auditTrail) ? doc.auditTrail : [],
    lastError: doc.lastError ? String(doc.lastError) : undefined,
    lastReconciledAt: doc.lastReconciledAt ? String(doc.lastReconciledAt) : undefined,
    createdAt: String(doc.createdAt),
    updatedAt: String(doc.updatedAt),
  }))

  const initialProviders: PublicPodConnectionProjection[] = (providersRes.docs as any[]).map(
    (doc) =>
      getPublicPodConnectionProjection({
        id: String(doc.id),
        siteId: String(typeof doc.site === 'object' && doc.site ? doc.site.id : (doc.site ?? '')),
        spaceId: doc.space
          ? String(typeof doc.space === 'object' ? doc.space.id : doc.space)
          : undefined,
        providerKey: String(doc.providerKey ?? 'pod'),
        label: String(doc.label ?? 'Print On Demand'),
        remoteStoreId: doc.remoteStoreId ? String(doc.remoteStoreId) : undefined,
        remoteStoreName: doc.remoteStoreName ? String(doc.remoteStoreName) : undefined,
        encryptedApiKey: doc.encryptedApiKey ? String(doc.encryptedApiKey) : '',
        encryptedWebhookSecret: doc.encryptedWebhookSecret
          ? String(doc.encryptedWebhookSecret)
          : undefined,
        status: doc.status ?? 'active',
        capabilities: doc.capabilities ?? {
          supportsAutomaticReprint: true,
          supportsPoBoxDelivery: false,
          supportsAddressValidation: true,
          supportsMockMode: true,
        },
        lastHealthCheckedAt: doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : undefined,
        lastHealthStatus: doc.lastHealthStatus,
        lastHealthReason: doc.lastHealthReason,
        disabledReason: doc.disabledReason,
        createdAt: String(doc.createdAt),
        updatedAt: String(doc.updatedAt),
      }),
  )

  const initialManualPackages: ManualFulfillmentPackage[] = (manualRes.docs as any[]).map(
    (doc) => ({
      id: String(doc.id),
      orderId: String(
        typeof doc.order === 'object' && doc.order ? doc.order.id : (doc.order ?? ''),
      ),
      siteId: String(typeof doc.site === 'object' && doc.site ? doc.site.id : (doc.site ?? '')),
      packageIndex: Number(doc.packageIndex ?? 0),
      source: doc.source ?? 'explicit-manual-product',
      status: doc.status ?? 'pending_acknowledgement',
      approvedLines: Array.isArray(doc.approvedLines) ? doc.approvedLines : [],
      permissionedAddressManifest: doc.permissionedAddressManifest ?? {
        name: '',
        addressLine1: '',
        city: '',
        country: 'US',
      },
      instructions: String(doc.instructions ?? ''),
      disclaimer: MANUAL_FULFILLMENT_DISCLAIMER,
      acknowledgement: doc.acknowledgement,
      externalFulfillment: doc.externalFulfillment,
      auditTrail: Array.isArray(doc.auditTrail) ? doc.auditTrail : [],
      createdAt: String(doc.createdAt),
      updatedAt: String(doc.updatedAt),
    }),
  )

  return (
    <FulfillmentCommandCenter
      initialJobs={initialJobs}
      initialProviders={initialProviders}
      initialManualPackages={initialManualPackages}
      initialTab={tab}
      initialProviderFilter={provider}
    />
  )
}
