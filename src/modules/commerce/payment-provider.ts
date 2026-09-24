import { createHmac, timingSafeEqual } from 'node:crypto'

export const PAYMENT_PROVIDER_CONTRACT_VERSION = 'shop-04.v1' as const

export type ProviderPaymentState =
  | 'initiated'
  | 'action-required'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'partially-refunded'
  | 'refunded'
  | 'disputed'
  | 'unknown'

export type ProviderErrorCode =
  | 'configuration'
  | 'authentication'
  | 'invalid-request'
  | 'not-found'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'unknown-outcome'

export class PaymentProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly outcomeKnown: boolean,
  ) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}

export type HostedCheckoutRequest = Readonly<{
  attemptId: string
  idempotencyKey: string
  amountMinor: string
  currency: string
  description: string
  successUrl: string
  cancelUrl: string
  expiresAt: string
  customerEmail?: string
  metadata: Readonly<Record<string, string>>
}>

export type ProviderPayment = Readonly<{
  providerReference: string
  providerPaymentReference?: string
  state: ProviderPaymentState
  amountMinor: string
  currency: string
  actionUrl?: string
  expiresAt?: string
  refundedAmountMinor?: string
  observedAt: string
}>

export type NormalizedPaymentEvent = Readonly<{
  providerEventId: string
  providerReference: string
  providerPaymentReference?: string
  kind:
    | 'action-required'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'partially-refunded'
    | 'refunded'
    | 'disputed'
  amountMinor?: string
  currency?: string
  occurredAt: string
  sequence?: number
  sanitizedEvidence: Readonly<Record<string, string | number | boolean | null>>
}>

export interface PaymentProviderAdapter {
  readonly key: string
  readonly contractVersion: typeof PAYMENT_PROVIDER_CONTRACT_VERSION
  readonly metadata: Readonly<{
    implementationVersion: string
    providerApiVersion: string
    mode: 'deterministic-test' | 'provider-test'
    hosted: true
    rawPaymentDataAccepted: false
    maximumAmountMinor?: string
    supportedCurrencies: readonly string[]
  }>
  readiness(): Promise<{
    ready: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    reason?: string
  }>
  createHostedCheckout(input: HostedCheckoutRequest): Promise<ProviderPayment>
  retrieve(providerReference: string): Promise<ProviderPayment>
  reconcile(providerReference: string): Promise<ProviderPayment>
  cancel(providerReference: string, idempotencyKey: string): Promise<ProviderPayment>
  refund(input: {
    providerPaymentReference: string
    amountMinor: string
    currency: string
    idempotencyKey: string
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  }): Promise<{
    providerRefundReference: string
    state: 'processing' | 'succeeded' | 'failed'
    amountMinor: string
  }>
  listDisputes(providerPaymentReference: string): Promise<readonly NormalizedPaymentEvent[]>
  normalizeSignedWebhook(
    rawBody: string,
    signature: string,
    now?: Date,
  ): NormalizedPaymentEvent | null
}

/** Capabilities for recurring billing are deliberately separate from one-time checkout. */
export interface RecurringPaymentProvider {
  createSubscriptionCheckout(input: {
    idempotencyKey: string
    priceReference: string
    trialDays?: number
    successUrl: string
    cancelUrl: string
    customerEmail?: string
    metadata: Readonly<Record<string, string>>
  }): Promise<{
    providerReference: string
    customerReference?: string
    subscriptionReference?: string
    actionUrl: string
    state: 'incomplete' | 'active' | 'trialing'
  }>
  createCustomerPortal(input: { customerReference: string; returnUrl: string }): Promise<string>
  previewSubscriptionChange(input: {
    subscriptionReference: string
    priceReference: string
  }): Promise<{ amountMinor: string; currency: string; expiresAt: string }>
  resolveSubscriptionPayment(input: {
    invoiceReference?: string
    chargeReference?: string
  }): Promise<{ subscriptionReference: string | null; fullyRefunded: boolean }>
  reconcileSubscription(subscriptionReference: string): Promise<{
    state: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
    customerReference: string
    currentPeriodStart: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    priceReference?: string
  }>
  normalizeSignedSubscriptionWebhook(
    rawBody: string,
    signature: string,
    now?: Date,
  ): NormalizedSubscriptionEvent | null
}

export type NormalizedSubscriptionEvent = Readonly<{
  providerEventId: string
  subscriptionReference?: string
  subscriptionId?: string
  customerReference?: string
  priceReference?: string
  invoiceReference?: string
  chargeReference?: string
  kind:
    | 'trial_started'
    | 'activated'
    | 'invoice_paid'
    | 'invoice_failed'
    | 'cancel_scheduled'
    | 'canceled'
    | 'resumed'
    | 'changed'
    | 'payment_review'
    | 'payment_refunded'
    | 'refund_recorded'
  status?: string
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  occurredAt: string
  sequence?: number
  evidence: Readonly<Record<string, string | number | boolean | null>>
}>

export function recurringProvider(provider: PaymentProviderAdapter): RecurringPaymentProvider {
  const candidate = provider as PaymentProviderAdapter & Partial<RecurringPaymentProvider>
  if (
    !candidate.createSubscriptionCheckout ||
    !candidate.createCustomerPortal ||
    !candidate.previewSubscriptionChange ||
    !candidate.resolveSubscriptionPayment ||
    !candidate.reconcileSubscription ||
    !candidate.normalizeSignedSubscriptionWebhook
  )
    throw new PaymentProviderError(
      'configuration',
      `Provider ${provider.key} does not support recurring billing.`,
      false,
      true,
    )
  return candidate as PaymentProviderAdapter & RecurringPaymentProvider
}

const assertCreateInput = (input: HostedCheckoutRequest) => {
  if (!/^[1-9][0-9]*$/.test(input.amountMinor))
    throw new Error('Checkout amount must be positive minor units.')
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw new Error('Checkout currency must be an ISO-4217 code.')
  if (!input.idempotencyKey || input.idempotencyKey.length > 200)
    throw new Error('A bounded idempotency key is required.')
  for (const url of [input.successUrl, input.cancelUrl]) {
    const parsed = new URL(url)
    const localTestHttp =
      process.env.LOCAL_E2E_TEST_MODE === 'true' &&
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if (
      parsed.protocol !== 'https:' &&
      !localTestHttp &&
      !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')
    )
      throw new Error('Checkout return URLs must use an allowed web protocol.')
    if (parsed.username || parsed.password)
      throw new Error('Checkout return URLs cannot contain credentials.')
  }
  for (const [key, value] of Object.entries(input.metadata)) {
    if (!/^[a-z0-9_.-]{1,40}$/i.test(key) || value.length > 200)
      throw new Error('Provider metadata must be allowlisted and bounded.')
  }
}

export function createDeterministicPaymentAdapter(input: {
  key?: string
  secret: string
  initialState?: ProviderPaymentState
  now?: () => Date
}): PaymentProviderAdapter & { setState(reference: string, state: ProviderPaymentState): void } {
  const records = new Map<string, ProviderPayment>()
  const idempotency = new Map<string, string>()
  const now = input.now ?? (() => new Date())
  return {
    key: input.key ?? 'deterministic-test',
    contractVersion: PAYMENT_PROVIDER_CONTRACT_VERSION,
    metadata: {
      implementationVersion: '1',
      providerApiVersion: 'fixture-v1',
      mode: 'deterministic-test',
      hosted: true,
      rawPaymentDataAccepted: false,
      supportedCurrencies: [],
    },
    async readiness() {
      return input.secret
        ? { ready: true, health: 'healthy' }
        : { ready: false, health: 'unavailable', reason: 'missing-secret' }
    },
    async createHostedCheckout(request) {
      assertCreateInput(request)
      const prior = idempotency.get(request.idempotencyKey)
      if (prior) return records.get(prior)!
      const providerReference = `det_cs_${createHmac('sha256', input.secret).update(request.idempotencyKey).digest('hex').slice(0, 24)}`
      const payment: ProviderPayment = {
        providerReference,
        providerPaymentReference: `det_pi_${request.attemptId}`,
        state: input.initialState ?? 'action-required',
        amountMinor: request.amountMinor,
        currency: request.currency,
        actionUrl: `/checkout/test/${encodeURIComponent(providerReference)}`,
        expiresAt: request.expiresAt,
        observedAt: now().toISOString(),
      }
      records.set(providerReference, payment)
      idempotency.set(request.idempotencyKey, providerReference)
      return payment
    },
    async retrieve(reference) {
      const payment = records.get(reference)
      if (!payment)
        throw new PaymentProviderError('not-found', 'Hosted checkout was not found.', false, true)
      return payment
    },
    async reconcile(reference) {
      return this.retrieve(reference)
    },
    async cancel(reference) {
      const payment = await this.retrieve(reference)
      const updated = { ...payment, state: 'cancelled' as const, observedAt: now().toISOString() }
      records.set(reference, updated)
      return updated
    },
    async refund(request) {
      if (!/^[1-9][0-9]*$/.test(request.amountMinor))
        throw new Error('Refund amount must be positive minor units.')
      return {
        providerRefundReference: `det_re_${request.idempotencyKey}`,
        state: 'succeeded',
        amountMinor: request.amountMinor,
      }
    },
    async listDisputes() {
      return []
    },
    normalizeSignedWebhook(rawBody, signature) {
      const expected = createHmac('sha256', input.secret).update(rawBody).digest('hex')
      if (
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        return null
      try {
        const value = JSON.parse(rawBody) as NormalizedPaymentEvent
        return value?.providerEventId && value?.providerReference ? value : null
      } catch {
        return null
      }
    },
    setState(reference, state) {
      const payment = records.get(reference)
      if (!payment) throw new Error('Unknown deterministic payment.')
      records.set(reference, { ...payment, state, observedAt: now().toISOString() })
    },
  }
}

type StripeObject = Record<string, unknown>
type FetchLike = typeof fetch

export function createStripeTestAdapter(input: {
  secretKey: string
  webhookSecret: string
  fetch?: FetchLike
  now?: () => Date
  apiVersion?: string
}): PaymentProviderAdapter & RecurringPaymentProvider {
  if (input.secretKey && !input.secretKey.startsWith('sk_test_'))
    throw new Error('SHOP-04 Stripe adapter accepts test-mode secret keys only.')
  const request = input.fetch ?? fetch
  const now = input.now ?? (() => new Date())
  const apiVersion = input.apiVersion ?? '2025-06-30.basil'
  const call = async (
    path: string,
    init: { method?: string; body?: URLSearchParams; idempotencyKey?: string } = {},
  ) => {
    if (!input.secretKey)
      throw new PaymentProviderError(
        'configuration',
        'Stripe test key is not configured.',
        false,
        true,
      )
    let response: Response
    try {
      response = await request(`https://api.stripe.com/v1${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${input.secretKey}`,
          'Stripe-Version': apiVersion,
          ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        },
        body: init.body,
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new PaymentProviderError(
        'unknown-outcome',
        'Stripe request outcome is unknown; reconcile before retrying.',
        true,
        false,
      )
    }
    const body = (await response.json().catch(() => ({}))) as StripeObject
    if (!response.ok) {
      const message = String(
        (body.error as StripeObject | undefined)?.message ?? 'Stripe request failed.',
      )
      const code: ProviderErrorCode =
        response.status === 429
          ? 'rate-limited'
          : response.status >= 500
            ? 'provider-unavailable'
            : response.status === 401
              ? 'authentication'
              : 'invalid-request'
      throw new PaymentProviderError(
        code,
        message,
        response.status === 429 || response.status >= 500,
        true,
      )
    }
    return body
  }
  const paymentFromSession = (session: StripeObject): ProviderPayment => {
    const paymentStatus = String(session.payment_status ?? '')
    const status = String(session.status ?? '')
    const state: ProviderPaymentState =
      paymentStatus === 'paid'
        ? 'succeeded'
        : status === 'expired'
          ? 'cancelled'
          : status === 'complete'
            ? 'processing'
            : 'action-required'
    return {
      providerReference: String(session.id),
      ...(session.payment_intent
        ? { providerPaymentReference: String(session.payment_intent) }
        : {}),
      state,
      amountMinor: String(session.amount_total ?? '0'),
      currency: String(session.currency ?? '').toUpperCase(),
      ...(session.url ? { actionUrl: String(session.url) } : {}),
      ...(session.expires_at
        ? { expiresAt: new Date(Number(session.expires_at) * 1000).toISOString() }
        : {}),
      observedAt: now().toISOString(),
    }
  }
  return {
    key: 'stripe-test',
    contractVersion: PAYMENT_PROVIDER_CONTRACT_VERSION,
    metadata: {
      implementationVersion: '1',
      providerApiVersion: apiVersion,
      mode: 'provider-test',
      hosted: true,
      rawPaymentDataAccepted: false,
      supportedCurrencies: [],
    },
    async readiness() {
      if (!input.secretKey || !input.webhookSecret)
        return { ready: false, health: 'unavailable', reason: 'missing-test-secrets' }
      try {
        await call('/balance')
        return { ready: true, health: 'healthy' }
      } catch (error) {
        return {
          ready: false,
          health:
            error instanceof PaymentProviderError && error.retryable ? 'degraded' : 'unavailable',
          reason: error instanceof Error ? error.message : 'readiness-failed',
        }
      }
    },
    async createHostedCheckout(checkout) {
      assertCreateInput(checkout)
      const body = new URLSearchParams()
      body.set('mode', 'payment')
      body.set('success_url', checkout.successUrl)
      body.set('cancel_url', checkout.cancelUrl)
      body.set('client_reference_id', checkout.attemptId)
      body.set('expires_at', String(Math.floor(Date.parse(checkout.expiresAt) / 1000)))
      body.set('line_items[0][quantity]', '1')
      body.set('line_items[0][price_data][currency]', checkout.currency.toLowerCase())
      body.set('line_items[0][price_data][unit_amount]', checkout.amountMinor)
      body.set('line_items[0][price_data][product_data][name]', checkout.description.slice(0, 120))
      if (checkout.customerEmail) body.set('customer_email', checkout.customerEmail)
      for (const [key, value] of Object.entries(checkout.metadata))
        body.set(`metadata[${key}]`, value)
      for (const [key, value] of Object.entries(checkout.metadata))
        body.set(`payment_intent_data[metadata][${key}]`, value)
      const session = await call('/checkout/sessions', {
        method: 'POST',
        body,
        idempotencyKey: checkout.idempotencyKey,
      })
      return paymentFromSession(session)
    },
    async createSubscriptionCheckout(checkout) {
      if (!checkout.priceReference || !checkout.priceReference.startsWith('price_'))
        throw new PaymentProviderError(
          'invalid-request',
          'A published provider recurring price mapping is required.',
          false,
          true,
        )
      const body = new URLSearchParams({
        mode: 'subscription',
        success_url: checkout.successUrl,
        cancel_url: checkout.cancelUrl,
        'line_items[0][price]': checkout.priceReference,
        'line_items[0][quantity]': '1',
      })
      if (checkout.trialDays && checkout.trialDays > 0)
        body.set('subscription_data[trial_period_days]', String(checkout.trialDays))
      if (checkout.customerEmail) body.set('customer_email', checkout.customerEmail)
      for (const [key, value] of Object.entries(checkout.metadata))
        body.set(`metadata[${key}]`, value)
      for (const [key, value] of Object.entries(checkout.metadata))
        body.set(`subscription_data[metadata][${key}]`, value)
      const session = await call('/checkout/sessions', {
        method: 'POST',
        body,
        idempotencyKey: checkout.idempotencyKey,
      })
      return {
        providerReference: String(session.id),
        ...(session.customer ? { customerReference: String(session.customer) } : {}),
        ...(session.subscription ? { subscriptionReference: String(session.subscription) } : {}),
        actionUrl: String(session.url ?? ''),
        state: 'incomplete' as const,
      }
    },
    async createCustomerPortal(portal) {
      const result = await call('/billing_portal/sessions', {
        method: 'POST',
        body: new URLSearchParams({
          customer: portal.customerReference,
          return_url: portal.returnUrl,
        }),
      })
      return String(result.url ?? '')
    },
    async previewSubscriptionChange(change) {
      const result = await call('/invoices/create_preview', {
        method: 'POST',
        body: new URLSearchParams({
          subscription: change.subscriptionReference,
          'subscription_details[items][0][price]': change.priceReference,
        }),
      })
      return {
        amountMinor: String(result.amount_due ?? result.total ?? '0'),
        currency: String(result.currency ?? '').toUpperCase(),
        expiresAt: new Date(now().getTime() + 60_000).toISOString(),
      }
    },
    async resolveSubscriptionPayment(reference) {
      let invoiceReference = reference.invoiceReference ?? ''
      let fullyRefunded = false
      if (reference.chargeReference) {
        const charge = await call(`/charges/${encodeURIComponent(reference.chargeReference)}`)
        invoiceReference ||= String(charge.invoice ?? '')
        fullyRefunded =
          Number(charge.amount_refunded ?? 0) >= Number(charge.amount ?? 0) &&
          Number(charge.amount ?? 0) > 0
      }
      if (!invoiceReference) return { subscriptionReference: null, fullyRefunded }
      const invoice = await call(`/invoices/${encodeURIComponent(invoiceReference)}`)
      const parent = (invoice.parent as StripeObject | undefined)?.subscription_details as
        | StripeObject
        | undefined
      return {
        subscriptionReference: String(invoice.subscription ?? parent?.subscription ?? '') || null,
        fullyRefunded,
      }
    },
    async reconcileSubscription(reference) {
      const result = await call(`/subscriptions/${encodeURIComponent(reference)}`)
      const status = String(result.status)
      const item = (
        (result.items as StripeObject | undefined)?.data as StripeObject[] | undefined
      )?.[0]
      return {
        state: (['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'paused'].includes(
          status,
        )
          ? status
          : 'paused') as 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused',
        customerReference: String(result.customer ?? ''),
        currentPeriodStart: new Date(
          Number(result.current_period_start ?? item?.current_period_start ?? 0) * 1000,
        ).toISOString(),
        currentPeriodEnd: new Date(
          Number(result.current_period_end ?? item?.current_period_end ?? 0) * 1000,
        ).toISOString(),
        cancelAtPeriodEnd: Boolean(result.cancel_at_period_end),
        ...(item?.price
          ? { priceReference: String((item.price as StripeObject).id ?? item.price) }
          : {}),
      }
    },
    normalizeSignedSubscriptionWebhook(rawBody, signature, observedNow = now()) {
      const parts = signature.split(',').map((part) => part.split('=', 2) as [string, string])
      const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
      const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
      if (
        !Number.isSafeInteger(timestamp) ||
        Math.abs(observedNow.getTime() / 1000 - timestamp) > 300 ||
        !signatures.length
      )
        return null
      const expected = createHmac('sha256', input.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex')
      if (
        !signatures.some(
          (value) =>
            value.length === expected.length &&
            timingSafeEqual(Buffer.from(value), Buffer.from(expected)),
        )
      )
        return null
      try {
        const event = JSON.parse(rawBody) as StripeObject
        const object = ((event.data as StripeObject)?.object ?? {}) as StripeObject
        const type = String(event.type)
        const status = String(object.status ?? '')
        const kind =
          type === 'charge.dispute.created' || type === 'charge.dispute.funds_withdrawn'
            ? 'payment_review'
            : type === 'charge.refunded' &&
                Number(object.amount_refunded ?? 0) >= Number(object.amount ?? 0) &&
                Number(object.amount ?? 0) > 0
              ? 'payment_refunded'
              : type === 'charge.refunded' || type === 'refund.created' || type === 'refund.updated'
                ? 'refund_recorded'
                : type === 'invoice.paid'
                  ? 'invoice_paid'
                  : type === 'invoice.payment_failed'
                    ? 'invoice_failed'
                    : type === 'customer.subscription.deleted'
                      ? 'canceled'
                      : type === 'customer.subscription.created' && status === 'trialing'
                        ? 'trial_started'
                        : type === 'customer.subscription.updated' &&
                            Boolean(object.cancel_at_period_end)
                          ? 'cancel_scheduled'
                          : type === 'customer.subscription.updated' && status === 'canceled'
                            ? 'canceled'
                            : type === 'customer.subscription.created' && status === 'active'
                              ? 'activated'
                              : type === 'customer.subscription.updated' && status === 'active'
                                ? 'changed'
                                : type.startsWith('customer.subscription.')
                                  ? 'changed'
                                  : null
        if (!kind) return null
        const invoiceSubscription = (
          (object.parent as StripeObject | undefined)?.subscription_details as
            | StripeObject
            | undefined
        )?.subscription
        const invoiceMetadata = (
          (object.parent as StripeObject | undefined)?.subscription_details as
            | StripeObject
            | undefined
        )?.metadata
        const subscriptionReference = String(
          object.object === 'subscription'
            ? object.id
            : (object.subscription ?? invoiceSubscription ?? ''),
        )
        const item = (
          (object.items as StripeObject | undefined)?.data as StripeObject[] | undefined
        )?.[0]
        const metadata = (object.metadata ?? invoiceMetadata ?? {}) as StripeObject
        return {
          providerEventId: String(event.id),
          ...(subscriptionReference ? { subscriptionReference } : {}),
          ...(object.invoice && typeof object.invoice === 'string'
            ? { invoiceReference: String(object.invoice) }
            : {}),
          ...(object.charge && typeof object.charge === 'string'
            ? { chargeReference: String(object.charge) }
            : {}),
          ...(metadata.renegade_subscription_id
            ? { subscriptionId: String(metadata.renegade_subscription_id) }
            : {}),
          ...(object.customer ? { customerReference: String(object.customer) } : {}),
          kind,
          status,
          ...(item?.price
            ? { priceReference: String((item.price as StripeObject).id ?? item.price) }
            : {}),
          ...(object.current_period_start
            ? {
                currentPeriodStart: new Date(
                  Number(object.current_period_start) * 1000,
                ).toISOString(),
              }
            : {}),
          ...(object.current_period_end
            ? { currentPeriodEnd: new Date(Number(object.current_period_end) * 1000).toISOString() }
            : {}),
          ...(object.cancel_at_period_end !== undefined
            ? { cancelAtPeriodEnd: Boolean(object.cancel_at_period_end) }
            : {}),
          occurredAt: new Date(Number(event.created) * 1000).toISOString(),
          sequence: Number(event.created),
          evidence: {
            objectId: String(object.id ?? ''),
            eventType: type,
            status,
            customer: String(object.customer ?? ''),
            amountMinor: Number(object.amount_refunded ?? object.amount ?? 0),
            currency: String(object.currency ?? '').toUpperCase(),
            reason: String(object.reason ?? ''),
          },
        }
      } catch {
        return null
      }
    },
    async retrieve(reference) {
      return paymentFromSession(await call(`/checkout/sessions/${encodeURIComponent(reference)}`))
    },
    async reconcile(reference) {
      return this.retrieve(reference)
    },
    async cancel(reference, idempotencyKey) {
      return paymentFromSession(
        await call(`/checkout/sessions/${encodeURIComponent(reference)}/expire`, {
          method: 'POST',
          body: new URLSearchParams(),
          idempotencyKey,
        }),
      )
    },
    async refund(refund) {
      const body = new URLSearchParams({
        payment_intent: refund.providerPaymentReference,
        amount: refund.amountMinor,
      })
      if (refund.reason) body.set('reason', refund.reason)
      const result = await call('/refunds', {
        method: 'POST',
        body,
        idempotencyKey: refund.idempotencyKey,
      })
      const status = String(result.status)
      return {
        providerRefundReference: String(result.id),
        state:
          status === 'succeeded'
            ? 'succeeded'
            : status === 'failed' || status === 'canceled'
              ? 'failed'
              : 'processing',
        amountMinor: String(result.amount),
      }
    },
    async listDisputes(providerPaymentReference) {
      const result = await call(
        `/disputes?payment_intent=${encodeURIComponent(providerPaymentReference)}&limit=100`,
      )
      return (Array.isArray(result.data) ? result.data : []).map((item) => {
        const dispute = item as StripeObject
        return {
          providerEventId: `reconcile:dispute:${String(dispute.id)}`,
          providerReference: String(dispute.id),
          providerPaymentReference,
          kind: 'disputed' as const,
          amountMinor: String(dispute.amount ?? ''),
          currency: String(dispute.currency ?? '').toUpperCase(),
          occurredAt: new Date(Number(dispute.created ?? 0) * 1000).toISOString(),
          sanitizedEvidence: {
            objectId: String(dispute.id),
            status: String(dispute.status),
            reason: String(dispute.reason ?? ''),
          },
        }
      })
    },
    normalizeSignedWebhook(rawBody, signature, observedNow = now()) {
      const signatureParts = signature
        .split(',')
        .map((part) => part.split('=', 2) as [string, string])
      const timestamp = Number(signatureParts.find(([key]) => key === 't')?.[1])
      const candidates = signatureParts.filter(([key]) => key === 'v1').map(([, value]) => value)
      if (
        !Number.isSafeInteger(timestamp) ||
        Math.abs(observedNow.getTime() / 1000 - timestamp) > 300 ||
        !candidates.length
      )
        return null
      const expected = createHmac('sha256', input.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex')
      if (
        !candidates.some(
          (candidate) =>
            candidate.length === expected.length &&
            timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)),
        )
      )
        return null
      try {
        const event = JSON.parse(rawBody) as StripeObject
        const object = ((event.data as StripeObject)?.object ?? {}) as StripeObject
        const type = String(event.type)
        const metadata = (object.metadata ?? {}) as StripeObject
        const providerReference = String(
          object.object === 'checkout.session'
            ? object.id
            : (metadata.checkout_session_id ??
                metadata.renegade_attempt_id ??
                object.payment_intent ??
                ''),
        )
        const kind =
          type === 'payment_intent.succeeded' ||
          type === 'checkout.session.async_payment_succeeded' ||
          (type === 'checkout.session.completed' && object.payment_status === 'paid')
            ? 'succeeded'
            : type.includes('requires_action')
              ? 'action-required'
              : type.includes('processing') ||
                  (type === 'checkout.session.completed' && object.payment_status !== 'paid')
                ? 'processing'
                : type.includes('payment_failed') || type.includes('async_payment_failed')
                  ? 'failed'
                  : type.includes('expired') || type.includes('canceled')
                    ? 'cancelled'
                    : type.includes('dispute')
                      ? 'disputed'
                      : type === 'charge.refunded'
                        ? String(object.amount_refunded) === String(object.amount)
                          ? 'refunded'
                          : 'partially-refunded'
                        : (type === 'refund.created' || type === 'refund.updated') &&
                            String(object.status) === 'succeeded'
                          ? 'partially-refunded'
                          : null
        if (!kind || !providerReference) return null
        return {
          providerEventId: String(event.id),
          providerReference,
          ...(object.payment_intent
            ? { providerPaymentReference: String(object.payment_intent) }
            : {}),
          kind,
          ...((object.amount_total ?? object.amount)
            ? { amountMinor: String(object.amount_total ?? object.amount) }
            : {}),
          ...(object.currency ? { currency: String(object.currency).toUpperCase() } : {}),
          occurredAt: new Date(Number(event.created) * 1000).toISOString(),
          sequence: Number(event.created),
          sanitizedEvidence: {
            objectId: String(object.id ?? ''),
            eventType: type,
            livemode: Boolean(event.livemode),
            status: String(object.status ?? object.payment_status ?? ''),
            attemptId: String(metadata.renegade_attempt_id ?? ''),
          },
        }
      } catch {
        return null
      }
    },
  }
}

export function configuredPaymentProvider(providerKey: string): PaymentProviderAdapter {
  if (providerKey === 'stripe-test') {
    if (process.env.COMMERCE_STRIPE_TEST_ENABLED !== 'true')
      throw new PaymentProviderError(
        'configuration',
        'Stripe test checkout is not enabled.',
        false,
        true,
      )
    return createStripeTestAdapter({
      secretKey: process.env.COMMERCE_STRIPE_TEST_SECRET_KEY ?? '',
      webhookSecret: process.env.COMMERCE_STRIPE_TEST_WEBHOOK_SECRET ?? '',
      apiVersion: process.env.COMMERCE_STRIPE_API_VERSION,
    })
  }
  if (providerKey === 'deterministic-test' || providerKey.startsWith('development-'))
    return createDeterministicPaymentAdapter({
      key: providerKey,
      secret: process.env.COMMERCE_TEST_WEBHOOK_SECRET ?? 'development-only',
    })
  throw new PaymentProviderError(
    'configuration',
    `Payment provider ${providerKey} is not configured.`,
    false,
    true,
  )
}
