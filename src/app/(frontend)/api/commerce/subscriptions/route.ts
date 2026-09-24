/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { recurringProvider, configuredPaymentProvider } from '@/modules/commerce/payment-provider'
import { visibleProration } from '@/modules/commerce/subscription-contract'
import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const memberId = await currentMember(payload as never, readMemberSession(request.headers))
    if (!memberId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    const siteId = await catalogSiteForHost(payload as never, request.headers.get('host'))
    const supporters = await (payload as any).find({
      collection: 'supporters',
      where: { member: { equals: memberId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const ids = supporters.docs.map((row: any) => String(row.id))
    if (!ids.length) return NextResponse.json({ subscriptions: [] })
    const subscriptions = await (payload as any).find({
      collection: 'subscriptions',
      where: { and: [{ site: { equals: siteId } }, { supporter: { in: ids } }] },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })
    return NextResponse.json({
      subscriptions: subscriptions.docs.map((sub: any) => ({
        id: sub.id,
        state: sub.state,
        plan: sub.planSnapshot,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        trialEnd: sub.trialEnd,
        graceEnd: sub.graceEnd,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Subscription service unavailable.' }, { status: 503 })
  }
}

/** Creates a provider hosted billing portal handoff for an owned subscription. */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const session = readMemberSession(request.headers)
    const memberId = await currentMember(payload as never, session)
    if (!memberId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    if (!verifyCsrf(request.headers))
      return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 })
    const siteId = await catalogSiteForHost(payload as never, request.headers.get('host'))
    const body = await request.json()
    if (typeof body.subscriptionId !== 'string')
      return NextResponse.json({ error: 'subscriptionId is required.' }, { status: 400 })
    const supporters = await (payload as any).find({
      collection: 'supporters',
      where: { member: { equals: memberId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const ids = supporters.docs.map((row: any) => String(row.id))
    const found = ids.length
      ? await (payload as any).find({
          collection: 'subscriptions',
          where: {
            and: [
              { id: { equals: body.subscriptionId } },
              { site: { equals: siteId } },
              { supporter: { in: ids } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] }
    const subscription = found.docs[0]
    if (!subscription)
      return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 })
    if (body.action === 'preview-change') {
      const plan: any = await (payload as any)
        .findByID({
          collection: 'plan-revisions',
          id: String(body.planRevisionId ?? ''),
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      if (
        !plan ||
        String(typeof plan.site === 'object' ? plan.site.id : plan.site) !== siteId ||
        plan.lifecycle !== 'published'
      )
        return NextResponse.json({ error: 'Published plan not found.' }, { status: 404 })
      if (!subscription.providerSubscriptionReference)
        return NextResponse.json(
          { error: 'Subscription is not yet linked to the provider.' },
          { status: 409 },
        )
      const priceReference = String(plan.providerMappings?.[subscription.providerKey] ?? '')
      if (!priceReference)
        return NextResponse.json(
          { error: 'The target plan has no matching provider price.' },
          { status: 422 },
        )
      const provider = recurringProvider(
        configuredPaymentProvider(String(subscription.providerKey)),
      )
      const preview = await provider.previewSubscriptionChange({
        subscriptionReference: String(subscription.providerSubscriptionReference),
        priceReference,
      })
      return NextResponse.json({ preview: visibleProration(preview) })
    }
    if (!subscription.providerCustomerReference)
      return NextResponse.json(
        { error: 'This subscription has no provider payment-management handoff.' },
        { status: 409 },
      )
    const adapter = recurringProvider(configuredPaymentProvider(String(subscription.providerKey)))
    const origin = new URL(request.url).origin
    const url = await adapter.createCustomerPortal({
      customerReference: String(subscription.providerCustomerReference),
      returnUrl: `${origin}/members/settings?tab=billing`,
    })
    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Subscription portal unavailable.' },
      { status: 503 },
    )
  }
}
