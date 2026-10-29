/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { bindCheckoutReferral } from '@/modules/commerce/referral-lifecycle'
import { getPayload } from 'payload'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { validatePlanWrite } from '@/modules/commerce/plan-write'
import { ensureSubscriptionOrder } from '@/modules/commerce/subscription-order'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { catalogOriginForSite, catalogSiteForHost } from '@/modules/commerce/site-scope'
import { recurringProvider, configuredPaymentProvider } from '@/modules/commerce/payment-provider'
import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'

const id = (value: any) => String(typeof value === 'object' && value ? value.id : (value ?? ''))
const plusInterval = (date: Date, interval: string, count: number) => {
  const result = new Date(date)
  if (interval === 'week') result.setUTCDate(result.getUTCDate() + 7 * count)
  else if (interval === 'year') result.setUTCFullYear(result.getUTCFullYear() + count)
  else result.setUTCMonth(result.getUTCMonth() + count)
  return result
}

/** Starts an idempotent provider subscription checkout from a published immutable plan revision. */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const session = readMemberSession(request.headers)
    const memberId = await currentMember(payload as never, session)
    if (!memberId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    if (!verifyCsrf(request.headers))
      return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 })
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey || idempotencyKey.length > 160)
      return NextResponse.json({ error: 'A bounded Idempotency-Key is required.' }, { status: 400 })
    const body = await request.json()
    if (!body || Object.keys(body).some((key) => key !== 'planRevisionId'))
      return NextResponse.json({ error: 'Unsupported signup field.' }, { status: 400 })
    const { planRevisionId } = body
    if (typeof planRevisionId !== 'string')
      return NextResponse.json({ error: 'planRevisionId is required.' }, { status: 400 })
    const siteId = await catalogSiteForHost(payload as never, request.headers.get('host'))
    const db: any = payload
    const plan = await db
      .findByID({
        collection: 'plan-revisions',
        id: planRevisionId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!plan || id(plan.site) !== siteId || plan.lifecycle !== 'published')
      return NextResponse.json({ error: 'Published plan not found.' }, { status: 404 })
    validatePlanWrite(plan)
    const merchantRows = await db.find({
      collection: 'merchant-connections',
      where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
      limit: 100,
      overrideAccess: true,
    })
    const providerKey = String(
      Object.keys(plan.providerMappings ?? {}).find((key) =>
        merchantRows.docs.some((merchant: any) => merchant.providerKey === key),
      ) ?? '',
    )
    if (!providerKey)
      return NextResponse.json(
        { error: 'This plan has no active recurring provider mapping.' },
        { status: 422 },
      )
    const priceReference = String(plan.providerMappings[providerKey] ?? '')
    const adapter = recurringProvider(configuredPaymentProvider(providerKey))
    return await withExecutionLock(
      payload,
      `subscription-signup:${siteId}:${memberId}`,
      async () => {
        const supporters = await db.find({
          collection: 'supporters',
          where: { and: [{ member: { equals: memberId } }, { site: { equals: siteId } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        let supporter = supporters.docs[0]
        if (!supporter)
          supporter = await db.create({
            collection: 'supporters',
            data: { site: siteId, member: memberId, displayName: '', providerReferences: [] },
            overrideAccess: true,
          })
        let trialDays = Number(plan.trialDays ?? 0)
        if (plan.trialEligibility === 'none') trialDays = 0
        if (plan.trialEligibility === 'once_per_customer' && trialDays > 0) {
          const priorTrial = await db.find({
            collection: 'subscriptions',
            where: {
              and: [
                { supporter: { equals: supporter.id } },
                { site: { equals: siteId } },
                { trialEnd: { exists: true } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (priorTrial.docs.length) trialDays = 0
        }
        const checkoutKey = createHash('sha256')
          .update(`${memberId}|${planRevisionId}|${idempotencyKey}`)
          .digest('hex')
        const prior = await db.find({
          collection: 'subscriptions',
          where: { checkoutKey: { equals: checkoutKey } },
          limit: 1,
          overrideAccess: true,
        })
        if (prior.docs.length && prior.docs[0].settings?.checkoutUrl)
          return NextResponse.json({
            subscriptionId: prior.docs[0].id,
            url: prior.docs[0].settings.checkoutUrl,
            replay: true,
          })
        let subscription: any = prior.docs[0] ?? null
        const now = new Date()
        const end = plusInterval(now, String(plan.interval), Number(plan.intervalCount))
        const snapshot = {
          id: String(plan.id),
          planKey: String(plan.planKey),
          name: String(plan.name),
          revision: Number(plan.revision),
          publishedAt: String(plan.publishedAt),
          lifecycle: 'published',
          interval: plan.interval,
          intervalCount: Number(plan.intervalCount),
          amountMinor: String(plan.amountMinor),
          currency: String(plan.currency),
          trialDays: Number(plan.trialDays ?? 0),
          trialEligibility: plan.trialEligibility,
          entitlements: plan.entitlements ?? [],
          cancelPolicy: plan.cancelPolicy,
          changePolicy: plan.changePolicy,
          taxPolicy: plan.taxPolicy,
          providerMappings: plan.providerMappings ?? {},
        }
        const trialEnd =
          trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000).toISOString() : undefined
        if (!subscription)
          subscription = await db.create({
            collection: 'subscriptions',
            data: {
              site: siteId,
              owner: memberId,
              supporter: supporter.id,
              planRevision: plan.id,
              planSnapshot: snapshot,
              providerKey,
              state: 'incomplete',
              source: 'provider',
              currentPeriodStart: now.toISOString(),
              currentPeriodEnd: end.toISOString(),
              ...(trialEnd ? { trialEnd } : {}),
              cancelAtPeriodEnd: false,
              version: 1,
              checkoutKey,
              settings: { checkoutStatus: 'creating' },
            },
            overrideAccess: true,
          })
        const order = await ensureSubscriptionOrder(
          db,
          subscription,
          merchantRows.docs.find((merchant: any) => merchant.providerKey === providerKey).id,
        )
        await bindCheckoutReferral(payload, request, id(order.checkoutSession), siteId)
        const member = await db.findByID({
          collection: 'members',
          id: memberId,
          depth: 0,
          overrideAccess: true,
        })
        const origin = await catalogOriginForSite(payload, siteId)
        const result = await adapter.createSubscriptionCheckout({
          idempotencyKey: `subscription-checkout:${checkoutKey}`,
          priceReference,
          expectedPrice: {
            amountMinor: snapshot.amountMinor,
            currency: snapshot.currency,
            interval: String(snapshot.interval),
            intervalCount: snapshot.intervalCount,
          },
          ...(trialDays ? { trialDays } : {}),
          successUrl: `${origin}/members/settings?tab=billing&checkout=complete`,
          cancelUrl: `${origin}/members/settings?tab=billing&checkout=cancelled`,
          ...(member?.email ? { customerEmail: String(member.email) } : {}),
          metadata: {
            renegade_subscription_id: String(subscription.id),
            renegade_site_id: siteId,
            renegade_member_id: memberId,
            renegade_plan_revision_id: String(plan.id),
          },
        })
        await db.update({
          collection: 'subscriptions',
          id: subscription.id,
          data: {
            providerCustomerReference: result.customerReference,
            providerSubscriptionReference: result.subscriptionReference,
            settings: {
              orderId: String(order.id),
              checkoutStatus: 'created',
              checkoutReference: result.providerReference,
              checkoutUrl: result.actionUrl,
            },
          },
          overrideAccess: true,
        })
        return NextResponse.json(
          { subscriptionId: subscription.id, orderId: order.id, url: result.actionUrl },
          { status: 201 },
        )
      },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Subscription checkout unavailable.' },
      { status: 503 },
    )
  }
}
