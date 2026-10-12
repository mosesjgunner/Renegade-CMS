import { createHmac } from 'node:crypto'
import { verifyGuestOrderToken } from './payment-operations'

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
