/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-EMAIL-01: durable outbox for account + operational mail
 * (docs/rc/email/EMAIL_CONTRACTS.md §2/§4).
 *
 * Audience mail keeps the proven email-deliveries outbox. Account mail
 * previously had NO durable record: routes sent inline and discarded the
 * result. Every account/operational send now goes through an email-intents
 * row first: enqueue (idempotent) → dispatch (leased, pause- and
 * suppression-checked immediately before submission) → durable outcome.
 * Unknown provider outcomes quarantine; they are never blindly resent.
 */
import { createHash, randomUUID } from 'node:crypto'

import { loadConfig, type AppConfig } from '../core/config'
import { decryptSecret, encryptSecret } from '../social/security'
import { audienceDigest, normalizeEmailAddress } from '../audience/contracts'
import { withExecutionLock } from '../operations/execution-lock'
import {
  MIN_ACTION_LIFETIME_MS,
  RETRY_POLICY,
  boundaryForClass,
  classForPurpose,
  type EmailPurpose,
  type EmailTrafficClass,
} from './classes'
import { boundaryFrom, selectEmailAdapterForBoundary, type EmailDeliveryAdapter } from './delivery'

type Store = any
type Doc = Record<string, any>

export type EmailIntentPayload = {
  text: string
  html?: string
  replyTo?: string
}

export type EnqueueEmailIntentInput = {
  purpose: EmailPurpose
  recipientEmail: string
  subject: string
  payload: EmailIntentPayload
  idempotencyKey: string
  /** When the underlying action (token/link) stops being usable. */
  expiresAt: Date
  siteId?: string
  fromIdentity?: string
}

export function recipientHashFor(email: string): string {
  return audienceDigest(normalizeEmailAddress(email))
}

function intentEvent(type: string, detail?: Record<string, unknown>) {
  return { type, at: new Date().toISOString(), ...(detail ? { detail } : {}) }
}

/**
 * Create the durable intent. Idempotent on idempotencyKey: a repeated event
 * returns the existing intent instead of creating a duplicate send.
 */
export async function enqueueEmailIntent(
  payload: Store,
  input: EnqueueEmailIntentInput,
): Promise<Doc> {
  const trafficClass = classForPurpose(input.purpose)
  if (trafficClass === 'audience' || trafficClass === 'audience_confirmation') {
    throw new Error(
      `Purpose ${input.purpose} belongs to the audience outbox (email-deliveries), not email-intents.`,
    )
  }
  const existing = await payload.find({
    collection: 'email-intents',
    where: { idempotencyKey: { equals: input.idempotencyKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs[0]) return existing.docs[0] as Doc
  const config = loadConfig()
  const boundary = boundaryForClass(trafficClass)
  const created = await payload.create({
    collection: 'email-intents',
    data: {
      ...(input.siteId ? { site: input.siteId } : {}),
      purpose: input.purpose,
      trafficClass,
      recipientEmail: input.recipientEmail,
      recipientHash: recipientHashFor(input.recipientEmail),
      idempotencyKey: input.idempotencyKey,
      fromIdentity: input.fromIdentity ?? boundaryFrom(boundary, config),
      subject: input.subject,
      payloadCiphertext: encryptSecret(JSON.stringify(input.payload)),
      submission: 'queued',
      receiving: 'unobserved',
      placement: 'unobserved',
      actionState: 'not-observed',
      attempts: 0,
      attemptBudget: RETRY_POLICY[trafficClass].maxAttempts,
      expiresAt: input.expiresAt.toISOString(),
      events: [intentEvent('enqueued', { purpose: input.purpose, trafficClass })],
    },
    overrideAccess: true,
  })
  return created as Doc
}

/** Active pauses that block this intent, per the §4 precedence contract. */
export async function matchingEmailPause(
  payload: Store,
  input: {
    siteId?: string
    trafficClass: EmailTrafficClass
    boundary: string
    campaignId?: string
  },
): Promise<Doc | null> {
  const pauses = await payload.find({
    collection: 'email-pauses',
    where: { active: { equals: true } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const pause of pauses.docs as Doc[]) {
    if (pause.scope === 'global-class' && pause.trafficClass === input.trafficClass) return pause
    if (pause.scope === 'provider-boundary' && pause.boundary === input.boundary) return pause
    if (pause.scope === 'campaign' && input.campaignId && pause.campaignId === input.campaignId)
      return pause
    if (!input.siteId) continue
    const pauseSite =
      typeof pause.site === 'object' && pause.site !== null ? String(pause.site.id) : pause.site
    if (String(pauseSite ?? '') !== input.siteId) continue
    if (pause.scope === 'site') return pause
    if (pause.scope === 'site-class' && pause.trafficClass === input.trafficClass) return pause
  }
  return null
}

/** A confirmed invalid mailbox stops every class for that site + address. */
export async function hasInvalidAddressSuppression(
  payload: Store,
  input: { siteId?: string; recipientHash: string },
): Promise<boolean> {
  const where: Record<string, unknown>[] = [
    { emailHash: { equals: input.recipientHash } },
    { reason: { equals: 'invalid' } },
  ]
  if (input.siteId) where.push({ site: { equals: input.siteId } })
  const found = await payload.find({
    collection: 'suppressions',
    where: { and: where },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

const TERMINAL_SUBMISSIONS = ['accepted', 'rejected', 'expired', 'cancelled']

export type DispatchOutcome =
  | 'accepted'
  | 'retry-scheduled'
  | 'rejected'
  | 'unknown'
  | 'held'
  | 'expired'
  | 'skipped'

/**
 * Dispatch one intent. Serialized on the same PostgreSQL execution lock the
 * audience path uses. Pause, suppression, and expiry are re-read immediately
 * before the provider call — a pause that commits after enqueue still blocks.
 */
export async function dispatchEmailIntent(
  payload: Store,
  intentId: string,
  config: AppConfig = loadConfig(),
  adapterOverride?: EmailDeliveryAdapter,
): Promise<DispatchOutcome> {
  return withExecutionLock(payload, `email.intent:${intentId}`, async () => {
    const intent = (await payload.findByID({
      collection: 'email-intents',
      id: intentId,
      depth: 0,
      overrideAccess: true,
    })) as Doc
    if (!intent || TERMINAL_SUBMISSIONS.includes(String(intent.submission))) return 'skipped'
    if (intent.submission === 'leased' || intent.submission === 'submitting') {
      // A live lease means another dispatcher owns this intent.
      if (intent.leaseUntil && Date.parse(String(intent.leaseUntil)) > Date.now()) return 'skipped'
      // Expired lease after provider submission may be ambiguous: reconcile
      // or quarantine, never resend blindly (mirrors the audience rule).
      return reconcileOrQuarantine(payload, intent, config, adapterOverride)
    }
    if (intent.submission === 'unknown') {
      // A previous attempt ended with an ambiguous provider outcome: the
      // message may already have been accepted. Reconcile against the
      // provider that recorded the outcome, or stay quarantined — a direct
      // re-dispatch must never resend blindly (mirrors the audience rule).
      return reconcileOrQuarantine(payload, intent, config, adapterOverride, 'unknown-outcome')
    }
    const trafficClass = String(intent.trafficClass) as EmailTrafficClass
    const boundary = boundaryForClass(trafficClass)
    const siteId =
      typeof intent.site === 'object' && intent.site !== null
        ? String(intent.site.id)
        : intent.site
          ? String(intent.site)
          : undefined
    const events: Doc[] = Array.isArray(intent.events) ? [...intent.events] : []
    const patch = async (data: Doc) =>
      payload.update({ collection: 'email-intents', id: intent.id, data, overrideAccess: true })

    if (Date.parse(String(intent.expiresAt)) - Date.now() < MIN_ACTION_LIFETIME_MS) {
      await patch({
        submission: 'expired',
        actionState: 'expired',
        leaseUntil: null,
        events: [...events, intentEvent('expired-before-dispatch')],
      })
      return 'expired'
    }
    const pause = await matchingEmailPause(payload, { siteId, trafficClass, boundary })
    if (pause) {
      await patch({
        submission: 'held',
        events: [...events, intentEvent('held-by-pause', { pauseId: String(pause.id) })],
      })
      return 'held'
    }
    if (
      await hasInvalidAddressSuppression(payload, {
        siteId,
        recipientHash: String(intent.recipientHash),
      })
    ) {
      await patch({
        submission: 'cancelled',
        lastError: { code: 'invalid_address_suppressed' },
        events: [...events, intentEvent('cancelled-invalid-address')],
      })
      return 'skipped'
    }

    const adapter = adapterOverride ?? selectEmailAdapterForBoundary(boundary, config)
    const leaseOwner = `intent-${randomUUID()}`
    await patch({
      submission: 'submitting',
      provider: adapter.id,
      leaseOwner,
      leaseUntil: new Date(
        Date.now() + Math.max(60_000, config.email.sendTimeoutMs + 10_000),
      ).toISOString(),
      attempts: Number(intent.attempts || 0) + 1,
    })
    let message: EmailIntentPayload
    try {
      message = JSON.parse(decryptSecret(String(intent.payloadCiphertext))) as EmailIntentPayload
    } catch {
      await patch({
        submission: 'rejected',
        leaseUntil: null,
        lastError: { code: 'payload_undecryptable' },
        events: [...events, intentEvent('rejected-payload-undecryptable')],
      })
      return 'rejected'
    }
    const result = await adapter.send({
      from: String(intent.fromIdentity ?? boundaryFrom(boundary, config)),
      to: String(intent.recipientEmail),
      subject: String(intent.subject),
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      idempotencyKey: String(intent.idempotencyKey),
      category: trafficClass === 'account' ? 'transactional' : 'operational',
      messageId: `<${createHash('sha256').update(String(intent.idempotencyKey)).digest('hex').slice(0, 32)}@renegade.local>`,
      headers: { 'X-Renegade-Purpose': String(intent.purpose) },
    })
    const attempts = Number(intent.attempts || 0) + 1
    if (result.ok) {
      await patch({
        submission: 'accepted',
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        acceptedAt: new Date().toISOString(),
        leaseUntil: null,
        nextAttemptAt: null,
        events: [
          ...events,
          intentEvent('provider-accepted', { provider: result.provider, attempt: attempts }),
        ],
      })
      return 'accepted'
    }
    if (result.failure.kind === 'unknown') {
      await patch({
        submission: 'unknown',
        provider: result.provider,
        leaseUntil: null,
        lastError: { code: result.failure.code, message: result.failure.message },
        events: [...events, intentEvent('outcome-unknown', { code: result.failure.code })],
      })
      return 'unknown'
    }
    if (result.failure.kind === 'permanent') {
      await patch({
        submission: 'rejected',
        provider: result.provider,
        leaseUntil: null,
        lastError: { code: result.failure.code, message: result.failure.message },
        events: [...events, intentEvent('provider-rejected', { code: result.failure.code })],
      })
      return 'rejected'
    }
    // Retryable: bounded by attempt budget, class window, and action expiry.
    const policy = RETRY_POLICY[trafficClass]
    const windowStart = Date.parse(String(intent.createdAt ?? '')) || Date.now()
    const exhausted =
      attempts >=
        Math.min(policy.maxAttempts, Number(intent.attemptBudget || policy.maxAttempts)) ||
      Date.now() - windowStart > policy.windowMs
    if (exhausted) {
      await patch({
        submission: 'rejected',
        provider: result.provider,
        leaseUntil: null,
        lastError: { code: 'retry_exhausted', message: result.failure.message },
        events: [...events, intentEvent('retry-exhausted', { attempts })],
      })
      return 'rejected'
    }
    const backoff = Math.min(
      policy.windowMs,
      (result.failure.retryAfterMs ?? policy.baseDelayMs) * 2 ** (attempts - 1),
    )
    await patch({
      submission: 'retry-scheduled',
      provider: result.provider,
      leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + backoff).toISOString(),
      lastError: { code: result.failure.code, message: result.failure.message },
      events: [...events, intentEvent('retry-scheduled', { attempts, backoffMs: backoff })],
    })
    return 'retry-scheduled'
  })
}

async function reconcileOrQuarantine(
  payload: Store,
  intent: Doc,
  config: AppConfig,
  adapterOverride?: EmailDeliveryAdapter,
  source: 'interrupted' | 'unknown-outcome' = 'interrupted',
): Promise<DispatchOutcome> {
  const trafficClass = String(intent.trafficClass) as EmailTrafficClass
  const adapter =
    adapterOverride ?? selectEmailAdapterForBoundary(boundaryForClass(trafficClass), config)
  const events: Doc[] = Array.isArray(intent.events) ? [...intent.events] : []
  if (intent.provider && String(intent.provider) !== adapter.id) return 'skipped'
  const reconciled = await adapter.reconcile?.({
    idempotencyKey: String(intent.idempotencyKey),
    providerMessageId: intent.providerMessageId ? String(intent.providerMessageId) : undefined,
  })
  if (reconciled?.ok) {
    await payload.update({
      collection: 'email-intents',
      id: intent.id,
      data: {
        submission: 'accepted',
        provider: reconciled.provider,
        providerMessageId: reconciled.providerMessageId,
        acceptedAt: new Date().toISOString(),
        leaseUntil: null,
        events: [...events, intentEvent('reconciled-accepted')],
      },
      overrideAccess: true,
    })
    return 'accepted'
  }
  await payload.update({
    collection: 'email-intents',
    id: intent.id,
    data: {
      submission: 'unknown',
      leaseUntil: null,
      lastError: {
        code: source === 'unknown-outcome' ? 'unknown_outcome' : 'interrupted_send',
      },
      events: [
        ...events,
        intentEvent(
          source === 'unknown-outcome'
            ? 'quarantined-unknown-outcome'
            : 'quarantined-interrupted-send',
        ),
      ],
    },
    overrideAccess: true,
  })
  return 'unknown'
}

/**
 * Recovery sweep for the account boundary ONLY. It reads email-intents and
 * never touches email-deliveries; the audience sweep conversely never reads
 * email-intents. Held intents are re-evaluated (a lifted pause releases them).
 */
export async function recoverAccountEmailOutbox(
  payload: Store,
  config: AppConfig = loadConfig(),
): Promise<{ dispatched: number }> {
  const now = new Date().toISOString()
  const due = await payload.find({
    collection: 'email-intents',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      or: [
        { submission: { in: ['queued', 'held'] } },
        {
          and: [
            { submission: { equals: 'retry-scheduled' } },
            {
              or: [
                { nextAttemptAt: { exists: false } },
                { nextAttemptAt: { less_than_equal: now } },
              ],
            },
          ],
        },
        {
          and: [
            { submission: { in: ['leased', 'submitting'] } },
            { or: [{ leaseUntil: { exists: false } }, { leaseUntil: { less_than_equal: now } }] },
          ],
        },
      ],
    },
  })
  let dispatched = 0
  for (const intent of due.docs as Doc[]) {
    try {
      const outcome = await dispatchEmailIntent(payload, String(intent.id), config)
      if (outcome !== 'skipped') dispatched += 1
    } catch (error) {
      payload.logger?.error?.({
        err: error,
        event: 'email.intent.recovery_deferred',
        intentId: intent.id,
      })
    }
  }
  return { dispatched }
}
