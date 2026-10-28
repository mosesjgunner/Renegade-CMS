import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'
import { currentMember, readMemberSession, type IdentityStore } from '../identity/member-identity'
import { verifyGuestOrderToken } from './payment-operations'
import { catalogSiteForHost } from './site-scope'

export const localTestCheckoutEnabled = (url: string) => {
  const host = new URL(url).hostname.toLowerCase()
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(host)
  if (process.env.LOCAL_E2E_TEST_MODE === 'true' && loopback) return true
  if (process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED !== 'true') return false
  if (
    (process.env.COMMERCE_GUEST_ORDER_SECRET?.length ?? 0) < 32 ||
    (process.env.COMMERCE_TEST_WEBHOOK_SECRET?.length ?? 0) < 32
  )
    return false
  let configuredHost = ''
  try {
    configuredHost = new URL(process.env.APP_URL ?? '').hostname.toLowerCase()
  } catch {}
  return loopback || (host.endsWith('.test') && host === configuredHost)
}

export function guestCanConfirmTestCheckout(input: {
  cookie: string
  sessionId: string
  siteId: string
  expiresAt: string
}) {
  const token = input.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`renegade_checkout_${input.sessionId}=`))
    ?.slice(`renegade_checkout_${input.sessionId}=`.length)
  const secret =
    process.env.COMMERCE_GUEST_ORDER_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : 'development-commerce-guest-secret-32')
  return Boolean(
    token &&
      secret &&
      verifyGuestOrderToken(token, { orderId: input.sessionId, siteId: input.siteId }, secret) &&
      Date.parse(input.expiresAt) > Date.now(),
  )
}

const relationId = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String((value as { id?: unknown }).id ?? '')
    : String(value ?? '')

export async function canConfirmTestCheckout(
  payload: Payload,
  input: {
    headers: Headers
    session: { id?: unknown; cart?: unknown }
    siteId: string
    expiresAt: string
  },
): Promise<boolean> {
  const sessionId = relationId(input.session.id)
  if (
    guestCanConfirmTestCheckout({
      cookie: input.headers.get('cookie') ?? '',
      sessionId,
      siteId: input.siteId,
      expiresAt: input.expiresAt,
    })
  )
    return true
  if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now())
    return false
  const cartId = relationId(input.session.cart)
  if (!cartId) return false
  const hostSite = await catalogSiteForHost(payload, input.headers.get('host')).catch(() => '')
  if (!hostSite || hostSite !== input.siteId) return false
  const cart =
    typeof input.session.cart === 'object' && input.session.cart !== null
      ? (input.session.cart as { member?: unknown; owner?: unknown; site?: unknown })
      : await payload
          .findByID({
            collection: 'carts',
            id: cartId,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
  if (!cart || relationId(cart.site) !== input.siteId) return false
  const ownerId = relationId(cart.member ?? cart.owner)
  if (!ownerId) return false
  const actorMemberId = await currentMember(
    payload as unknown as IdentityStore,
    readMemberSession(input.headers),
  )
  return Boolean(actorMemberId && actorMemberId === ownerId)
}

export function signedLocalPaymentEvent(input: {
  attemptId: string
  providerReference: string
  amountMinor: string
  currency: string
  secret: string
}) {
  const raw = JSON.stringify({
    providerEventId: `local-test-paid:${input.attemptId}`,
    providerReference: input.providerReference,
    kind: 'succeeded',
    amountMinor: input.amountMinor,
    currency: input.currency,
    occurredAt: new Date().toISOString(),
    sanitizedEvidence: { attemptId: input.attemptId, source: 'local-test-checkout' },
  })
  return { raw, signature: createHmac('sha256', input.secret).update(raw).digest('hex') }
}
