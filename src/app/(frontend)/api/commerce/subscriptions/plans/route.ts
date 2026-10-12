import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { configuredPaymentProvider, recurringProvider } from '@/modules/commerce/payment-provider'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    if (!(await currentMember(payload as never, readMemberSession(request.headers))))
      return NextResponse.json({ error: 'Sign in to view membership plans.' }, { status: 401 })
    const siteId = await catalogSiteForHost(payload, request.headers.get('host'))
    const [plans, merchants] = await Promise.all([
      payload.find({
        collection: 'plan-revisions',
        where: { and: [{ site: { equals: siteId } }, { lifecycle: { equals: 'published' } }] },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'merchant-connections',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      }),
    ])
    return NextResponse.json(
      {
        plans: await Promise.all(
          plans.docs.map(async (plan) => {
            const mappings = plan.providerMappings as Record<string, unknown> | null
            const providerKey = Object.keys(mappings ?? {}).find((key) =>
              merchants.docs.some((merchant) => merchant.providerKey === key),
            )
            let available = false
            let reason = 'No active recurring payment provider is configured for this plan.'
            if (providerKey) {
              try {
                const provider = configuredPaymentProvider(providerKey)
                recurringProvider(provider)
                const readiness = await provider.readiness()
                available = readiness.ready
                reason =
                  readiness.reason ?? (available ? '' : 'The recurring provider is unavailable.')
              } catch (error) {
                reason = error instanceof Error ? error.message : reason
              }
            }
            return {
              id: String(plan.id),
              name: plan.name,
              amountMinor: plan.amountMinor,
              currency: plan.currency,
              interval: plan.interval,
              intervalCount: plan.intervalCount,
              trialDays: plan.trialDays,
              cancelPolicy: plan.cancelPolicy,
              changePolicy: plan.changePolicy,
              available,
              reason,
              providerMode: providerKey === 'stripe-test' ? 'provider-test' : null,
            }
          }),
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Membership plans could not be loaded.' }, { status: 503 })
  }
}
