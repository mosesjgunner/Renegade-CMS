/* eslint-disable @typescript-eslint/no-explicit-any */
/* Durable commands for public forms, subscriber lifecycle, and bulk delivery. */
import {
  audienceDigest,
  assertReviewedLocalizedConsent,
  deliveryIdempotencyKey,
  opaqueDeliveryToken,
  validateEmailBlocks,
  validateSubmission,
  type EmailBlock,
  type FormSchemaSnapshot,
} from './contracts'

type Doc = Record<string, any>
type Store = any
const now = () => new Date().toISOString()
const relationId = (value: unknown) =>
  typeof value === 'object' && value ? String((value as Doc).id) : String(value ?? '')

export async function submitPublicForm(
  payload: Store,
  input: {
    formId: string
    schema: FormSchemaSnapshot & {
      consentRevision?: string
      consentTranslationStatus?: string
      sourceLocale?: string
    }
    values: Record<string, unknown>
    siteId: string
    ipDigest: string
    honeypot?: string
    idempotencyKey: string
  },
) {
  if (input.honeypot) throw new Error('Submission was rejected.')
  assertReviewedLocalizedConsent(input.schema)
  const errors = validateSubmission(input.schema, input.values)
  if (Object.keys(errors).length) return { errors }
  const seen = await payload.find({
    collection: 'form-submissions',
    where: { idempotencyKey: { equals: input.idempotencyKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (seen.docs.length) return { submission: seen.docs[0], replay: true }
  const consent = {
    wording: input.schema.consentText,
    revision: input.schema.consentRevision,
    locale: input.schema.locale,
    schemaVersion: input.schema.version,
    reviewed: true,
  }
  const submission = await payload.create({
    collection: 'form-submissions',
    data: {
      site: input.siteId,
      form: input.formId,
      schema: (input.schema as Doc).id,
      locale: input.schema.locale,
      values: input.values,
      consentSnapshot: consent,
      status: 'received',
      privacyClass: 'standard',
      abuse: { ipDigest: input.ipDigest, challenge: 'passed' },
      idempotencyKey: input.idempotencyKey,
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
    overrideAccess: true,
  })
  return { submission }
}

export async function requestDoubleOptIn(
  payload: Store,
  input: {
    siteId: string
    listId: string
    email: string
    locale: string
    consentWording: string
    source: string
    formSubmissionId?: string
  },
) {
  const email = input.email.trim().toLowerCase()
  const emailHash = audienceDigest(email)
  const existing = await payload.find({
    collection: 'subscribers',
    where: { site: { equals: input.siteId }, emailHash: { equals: emailHash } },
    limit: 1,
    overrideAccess: true,
  })
  const subscriber =
    existing.docs[0] ||
    (await payload.create({
      collection: 'subscribers',
      data: { site: input.siteId, email, emailHash, status: 'pending' },
      overrideAccess: true,
    }))
  const memberships = await payload.find({
    collection: 'audience-memberships',
    where: { subscriber: { equals: subscriber.id }, audienceList: { equals: input.listId } },
    limit: 1,
    overrideAccess: true,
  })
  const membership =
    memberships.docs[0] ||
    (await payload.create({
      collection: 'audience-memberships',
      data: {
        subscriber: subscriber.id,
        audienceList: input.listId,
        status: 'pending',
        source: input.source,
      },
      overrideAccess: true,
    }))
  const token = opaqueDeliveryToken()
  await payload.create({
    collection: 'subscriber-confirmation-tokens',
    data: {
      site: input.siteId,
      subscriber: subscriber.id,
      audienceList: input.listId,
      tokenHash: audienceDigest(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      locale: input.locale,
      consentWording: input.consentWording,
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'consent-events',
    data: {
      site: input.siteId,
      subscriber: subscriber.id,
      formSubmission: input.formSubmissionId,
      audienceList: input.listId,
      event: 'requested',
      basis: 'consent',
      wording: input.consentWording,
      locale: input.locale,
      occurredAt: now(),
      evidence: { source: input.source, membership: membership.id },
    },
    overrideAccess: true,
  })
  return { subscriber, token }
}

export async function confirmDoubleOptIn(payload: Store, token: string) {
  const found = await payload.find({
    collection: 'subscriber-confirmation-tokens',
    where: { tokenHash: { equals: audienceDigest(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const confirmation = found.docs[0] as Doc | undefined
  if (!confirmation || confirmation.usedAt || new Date(confirmation.expiresAt) <= new Date())
    throw new Error('This confirmation link is invalid or has already been used.')
  const timestamp = now()
  await payload.update({
    collection: 'subscriber-confirmation-tokens',
    id: confirmation.id,
    data: { usedAt: timestamp },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'subscribers',
    id: relationId(confirmation.subscriber),
    data: { status: 'active', verifiedAt: timestamp },
    overrideAccess: true,
  })
  if (confirmation.audienceList) {
    const memberships = await payload.find({
      collection: 'audience-memberships',
      where: {
        subscriber: { equals: relationId(confirmation.subscriber) },
        audienceList: { equals: relationId(confirmation.audienceList) },
      },
      limit: 1,
      overrideAccess: true,
    })
    if (memberships.docs[0])
      await payload.update({
        collection: 'audience-memberships',
        id: memberships.docs[0].id,
        data: { status: 'active', confirmedAt: timestamp },
        overrideAccess: true,
      })
  }
  await payload.create({
    collection: 'consent-events',
    data: {
      site: relationId(confirmation.site),
      subscriber: relationId(confirmation.subscriber),
      audienceList: relationId(confirmation.audienceList),
      event: 'double-opt-in-confirmed',
      basis: 'consent',
      wording: confirmation.consentWording,
      locale: confirmation.locale,
      occurredAt: timestamp,
      evidence: { tokenId: confirmation.id },
    },
    overrideAccess: true,
  })
}

export async function suppressSubscriber(
  payload: Store,
  input: {
    siteId: string
    email: string
    reason: 'unsubscribe' | 'bounce' | 'complaint' | 'provider'
    provider?: string
  },
) {
  const emailHash = audienceDigest(input.email.trim().toLowerCase())
  const subscribers = await payload.find({
    collection: 'subscribers',
    where: { site: { equals: input.siteId }, emailHash: { equals: emailHash } },
    limit: 1,
    overrideAccess: true,
  })
  const subscriber = subscribers.docs[0]
  if (subscriber)
    await payload.update({
      collection: 'subscribers',
      id: subscriber.id,
      data: {
        status: input.reason === 'unsubscribe' ? 'unsubscribed' : 'suppressed',
        globalUnsubscribedAt: input.reason === 'unsubscribe' ? now() : undefined,
      },
      overrideAccess: true,
    })
  const prior = await payload.find({
    collection: 'suppressions',
    where: {
      site: { equals: input.siteId },
      emailHash: { equals: emailHash },
      reason: { equals: input.reason },
    },
    limit: 1,
    overrideAccess: true,
  })
  if (!prior.docs.length)
    await payload.create({
      collection: 'suppressions',
      data: {
        site: input.siteId,
        emailHash,
        reason: input.reason,
        provider: input.provider,
        occurredAt: now(),
        global: true,
      },
      overrideAccess: true,
    })
  if (subscriber)
    await payload.create({
      collection: 'consent-events',
      data: {
        site: input.siteId,
        subscriber: subscriber.id,
        event: input.reason,
        basis: 'suppression',
        occurredAt: now(),
        evidence: { provider: input.provider },
      },
      overrideAccess: true,
    })
}

export async function reviewAndScheduleNewsletter(
  payload: Store,
  input: { messageId: string; scheduledFor: string; cancelCutoffAt: string; blocks: EmailBlock[] },
) {
  const errors = validateEmailBlocks(input.blocks)
  if (errors.length) throw new Error(errors.join(' '))
  const message = (await payload.findByID({
    collection: 'email-messages',
    id: input.messageId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (message.status !== 'review') throw new Error('Only reviewed newsletters can be scheduled.')
  return payload.update({
    collection: 'email-messages',
    id: input.messageId,
    data: {
      status: 'scheduled',
      scheduledFor: input.scheduledFor,
      cancelCutoffAt: input.cancelCutoffAt,
      reviewedAt: now(),
    },
    overrideAccess: true,
  })
}

export async function queueNewsletterDeliveries(payload: Store, messageId: string) {
  const message = (await payload.findByID({
    collection: 'email-messages',
    id: messageId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (message.status === 'cancelled' || new Date(message.scheduledFor) > new Date()) return 0
  const lists = Array.isArray(message.audience?.lists) ? message.audience.lists : []
  let queued = 0
  for (const listId of lists) {
    const memberships = await payload.find({
      collection: 'audience-memberships',
      where: { audienceList: { equals: listId }, status: { equals: 'active' } },
      limit: 1000,
      depth: 1,
      overrideAccess: true,
    })
    for (const membership of memberships.docs as Doc[]) {
      const subscriber = membership.subscriber as Doc
      if (!subscriber?.email || subscriber.status !== 'active') continue
      const key = deliveryIdempotencyKey(messageId, subscriber.id)
      const exists = await payload.find({
        collection: 'email-deliveries',
        where: { idempotencyKey: { equals: key } },
        limit: 1,
        overrideAccess: true,
      })
      const delivery =
        exists.docs[0] ||
        (await payload.create({
          collection: 'email-deliveries',
          data: {
            message: messageId,
            subscriber: subscriber.id,
            recipientEmail: subscriber.email,
            idempotencyKey: key,
            status: 'queued',
          },
          overrideAccess: true,
        }))
      if (!exists.docs.length) {
        await payload.jobs.queue({
          task: 'audience-email-delivery',
          input: { deliveryId: delivery.id },
          queue: 'operations',
        })
        queued++
      }
    }
  }
  await payload.update({
    collection: 'email-messages',
    id: messageId,
    data: { status: 'queued' },
    overrideAccess: true,
  })
  return queued
}
