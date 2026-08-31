/* eslint-disable @typescript-eslint/no-explicit-any */
/* Durable commands for public forms, subscriber lifecycle, and bulk delivery. */
import {
  audienceDigest,
  assertReviewedLocalizedConsent,
  deliveryIdempotencyKey,
  opaqueDeliveryToken,
  validateEmailBlocks,
  validateFormSchema,
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
  const schemaErrors = validateFormSchema(input.schema)
  if (schemaErrors.length) throw new Error(schemaErrors.join(' '))
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
  const created = !prior.docs.length
  if (created)
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
  // A provider retry must not create duplicate consent-history evidence.
  if (subscriber && created)
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
  return { created, subscriber }
}

export async function isSubscriberSuppressed(payload: Store, siteId: string, emailHash: string) {
  const suppression = await payload.find({
    collection: 'suppressions',
    where: { site: { equals: siteId }, emailHash: { equals: emailHash } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return suppression.docs.length > 0
}

export async function canDeliverToSubscriber(
  payload: Store,
  input: { siteId: string; subscriberId?: string; recipientEmail: string },
) {
  // Transactional deliveries can omit a Subscriber. Bulk newsletter snapshots cannot.
  if (!input.subscriberId) return true
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: input.subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (
    subscriber.status !== 'active' ||
    String(subscriber.site) !== input.siteId ||
    String(subscriber.email).trim().toLowerCase() !== input.recipientEmail.trim().toLowerCase()
  )
    return false
  return !(await isSubscriberSuppressed(payload, input.siteId, subscriber.emailHash))
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
  if (
    !['scheduled', 'queued'].includes(message.status) ||
    new Date(message.scheduledFor) > new Date()
  )
    return 0
  const lists = Array.isArray(message.audience?.lists) ? message.audience.lists : []
  let queued = 0
  for (const listId of lists) {
    // This pages in bounded batches. The unique delivery key is the database-backed
    // snapshot and deduplicates a subscriber that belongs to several selected lists.
    for (let page = 1; ; page++) {
      const memberships = await payload.find({
        collection: 'audience-memberships',
        where: { audienceList: { equals: listId }, status: { equals: 'active' } },
        limit: 100,
        page,
        depth: 1,
        overrideAccess: true,
      })
      for (const membership of memberships.docs as Doc[]) {
        const subscriber = membership.subscriber as Doc
        if (!subscriber?.email || subscriber.status !== 'active') continue
        if (await isSubscriberSuppressed(payload, String(message.site), subscriber.emailHash))
          continue
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
      if (!memberships.hasNextPage) break
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

export async function processProviderSuppressionEvent(
  payload: Store,
  input: {
    siteId: string
    email: string
    event: 'bounce' | 'complaint' | 'unsubscribe'
    provider?: string
    providerMessageId: string
  },
) {
  // A signed event is additionally bound to a known delivery/message/site. It cannot
  // use the caller-supplied site or address to affect an unrelated subscriber.
  const found = await payload.find({
    collection: 'email-deliveries',
    where: { providerMessageId: { equals: input.providerMessageId } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const delivery = found.docs[0] as Doc | undefined
  const message = delivery?.message as Doc | undefined
  if (
    !delivery ||
    !message ||
    String(message.site) !== input.siteId ||
    String(delivery.recipientEmail).trim().toLowerCase() !== input.email.trim().toLowerCase()
  )
    throw new Error('Provider event does not match a delivery in this site.')
  const status =
    input.event === 'unsubscribe'
      ? 'cancelled'
      : input.event === 'bounce'
        ? 'bounced'
        : 'complained'
  if (delivery.status !== status)
    await payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: { status, outcome: { ...(delivery.outcome ?? {}), providerEvent: input.event } },
      overrideAccess: true,
    })
  return suppressSubscriber(payload, { ...input, reason: input.event })
}

/** Public signup only creates marketing consent from the explicit subscription action. */
export async function requestNewsletterSubscription(
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  const list = (await payload.findByID({
    collection: 'audience-lists',
    id: input.listId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!list || list.status !== 'active' || String(list.site) !== input.siteId)
    throw new Error('Newsletter unavailable.')
  if (await isSubscriberSuppressed(payload, input.siteId, audienceDigest(email)))
    throw new Error('This address has been unsubscribed.')
  if (list.doubleOptIn !== false)
    return { ...(await requestDoubleOptIn(payload, input)), status: 'pending' as const }
  const result = await requestDoubleOptIn(payload, input)
  const timestamp = now()
  await payload.update({
    collection: 'subscribers',
    id: result.subscriber.id,
    data: { status: 'active', verifiedAt: timestamp },
    overrideAccess: true,
  })
  const memberships = await payload.find({
    collection: 'audience-memberships',
    where: { subscriber: { equals: result.subscriber.id }, audienceList: { equals: input.listId } },
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
  await payload.create({
    collection: 'consent-events',
    data: {
      site: input.siteId,
      subscriber: result.subscriber.id,
      audienceList: input.listId,
      event: 'resubscribe',
      basis: 'consent',
      wording: input.consentWording,
      locale: input.locale,
      occurredAt: timestamp,
      evidence: { source: input.source, doubleOptIn: false },
    },
    overrideAccess: true,
  })
  return { subscriber: result.subscriber, status: 'active' as const }
}

export async function updateAudiencePreferences(
  payload: Store,
  input: {
    siteId: string
    email: string
    audienceList?: string
    preferences: Record<string, boolean | string | number>
  },
) {
  const emailHash = audienceDigest(input.email.trim().toLowerCase())
  const subscribers = await payload.find({
    collection: 'subscribers',
    where: { site: { equals: input.siteId }, emailHash: { equals: emailHash } },
    limit: 1,
    overrideAccess: true,
  })
  const subscriber = subscribers.docs[0] as Doc | undefined
  if (!subscriber) throw new Error('Subscriber was not found.')
  const prior = await payload.find({
    collection: 'preferences',
    where: {
      subscriber: { equals: subscriber.id },
      ...(input.audienceList ? { audienceList: { equals: input.audienceList } } : {}),
    },
    limit: 1,
    overrideAccess: true,
  })
  if (prior.docs[0])
    return payload.update({
      collection: 'preferences',
      id: prior.docs[0].id,
      data: { preferences: input.preferences },
      overrideAccess: true,
    })
  return payload.create({
    collection: 'preferences',
    data: {
      subscriber: subscriber.id,
      audienceList: input.audienceList,
      preferences: input.preferences,
    },
    overrideAccess: true,
  })
}

/** Generates a reviewable digest from canonical published content; it does not track readers. */
export async function composeDigestFromContent(
  payload: Store,
  definitionId: string,
  since: string,
) {
  const definition = (await payload.findByID({
    collection: 'digest-definitions',
    id: definitionId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  const content = await payload.find({
    collection: 'content',
    where: {
      and: [
        { site: { equals: definition.site } },
        { status: { in: ['published', 'updated'] } },
        { publishedAt: { greater_than_equal: since } },
      ],
    },
    sort: '-publishedAt',
    limit: 25,
    depth: 0,
    overrideAccess: true,
  })
  const cards = (content.docs as Doc[]).map((item) => ({
    title: String(item.title),
    text: String(item.summary ?? item.excerpt ?? ''),
    href: new URL(String(item.canonicalPath), process.env.APP_URL).toString(),
  }))
  const message = await payload.create({
    collection: 'email-messages',
    data: {
      site: definition.site,
      subject: `${definition.name}: latest publishing`,
      kind: 'digest',
      status: definition.reviewRequired ? 'review' : 'scheduled',
      scheduledFor: definition.reviewRequired ? undefined : now(),
      blocks: [
        { type: 'heading', text: String(definition.name) },
        { type: 'content-cards', cards },
      ],
      audience: definition.filters?.audience ?? { lists: [] },
      idempotencyKey: `digest:${definition.id}:${since}`,
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'digest-runs',
    data: {
      definition: definition.id,
      sourceEventIds: (content.docs as Doc[]).map((item) => item.id),
      frozenAt: now(),
      status: definition.reviewRequired ? 'draft' : 'queued',
      outcome: { messageId: message.id },
    },
    overrideAccess: true,
  })
}

export async function queueTestSend(
  payload: Store,
  input: { messageId: string; recipientEmail: string },
) {
  const message = (await payload.findByID({
    collection: 'email-messages',
    id: input.messageId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!message || !['draft', 'review', 'scheduled'].includes(message.status))
    throw new Error('Message cannot be test sent.')
  const email = input.recipientEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  const key = `email:test:${message.id}:${audienceDigest(email)}`
  const prior = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  const delivery =
    prior.docs[0] ||
    (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: message.id,
        recipientEmail: email,
        idempotencyKey: key,
        status: 'queued',
        outcome: { test: true },
      },
      overrideAccess: true,
    }))
  if (!prior.docs[0])
    await payload.jobs.queue({
      task: 'audience-email-delivery',
      input: { deliveryId: delivery.id },
      queue: 'operations',
    })
  return delivery
}
export async function queueSubscriptionConfirmation(
  payload: Store,
  input: { siteId: string; subscriberId: string; email: string; token: string },
) {
  const url = new URL('/subscribe/confirm', process.env.APP_URL)
  url.searchParams.set('token', input.token)
  const message = await payload.create({
    collection: 'email-messages',
    data: {
      site: input.siteId,
      subject: 'Confirm your subscription',
      kind: 'transactional',
      status: 'queued',
      blocks: [
        { type: 'heading', text: 'Confirm your subscription' },
        { type: 'button', label: 'Confirm subscription', href: url.toString() },
      ],
      idempotencyKey: `subscription-confirmation:${audienceDigest(input.token)}`,
    },
    overrideAccess: true,
  })
  const delivery = await payload.create({
    collection: 'email-deliveries',
    data: {
      message: message.id,
      subscriber: input.subscriberId,
      recipientEmail: input.email,
      idempotencyKey: `subscription-confirmation:${audienceDigest(input.token)}`,
      status: 'queued',
    },
    overrideAccess: true,
  })
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: delivery.id },
    queue: 'operations',
  })
}
