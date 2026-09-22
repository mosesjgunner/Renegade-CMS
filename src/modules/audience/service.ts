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
  normalizeFormAnswers,
  normalizeEmailAddress,
  audienceDigest as digest,
  opaqueDeliveryToken as newOpaqueToken,
  signAudienceClaims,
  verifyAudienceClaims,
  type EmailBlock,
  type FormSchemaSnapshot,
} from './contracts'
import { approvedRenderSnapshot, validateEmailDesign } from './email-composer'

type Doc = Record<string, any>
type Store = any
const now = () => new Date().toISOString()
const relationId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object' && value && 'id' in value) return String((value as Doc).id)
  const str = String(value).trim()
  return str.length > 0 ? str : undefined
}

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
  let schemaId = (input.schema as Doc).id
  if (!schemaId) {
    const form = (await payload.findByID({
      collection: 'form-definitions',
      id: input.formId,
      depth: 0,
      overrideAccess: true,
    })) as Doc
    schemaId = form?.activeSchema
      ? typeof form.activeSchema === 'object'
        ? form.activeSchema.id
        : form.activeSchema
      : undefined
  }
  const submission = await payload.create({
    collection: 'form-submissions',
    data: {
      site: input.siteId,
      form: input.formId,
      schema: schemaId,
      locale: input.schema.locale,
      values: normalizeFormAnswers(input.schema, input.values),
      consentSnapshot: consent,
      status: 'received',
      privacyClass: 'standard',
      abuse: { ipDigest: input.ipDigest, challenge: 'passed' },
      idempotencyKey: input.idempotencyKey,
      actionState: [],
      submittedAt: now(),
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
    overrideAccess: true,
  })
  return { submission }
}

/** Execute only reviewed, fixed action types. A failure is recorded and retryable; it never asks a visitor to resubmit. */
export async function runFormActions(
  payload: Store,
  input: { submission: Doc; form: Doc; schema: Doc },
) {
  const actions = Array.isArray(input.form.actions) ? input.form.actions : []
  const state: Doc[] = []
  for (const action of actions) {
    const kind = String(action?.type ?? '')
    try {
      if (kind === 'create-contact') {
        const emailField = String(action.emailField ?? 'email')
        const email = input.submission.values?.[emailField]
        if (typeof email !== 'string') throw new Error('Configured identity value is unavailable.')
        const hash = audienceDigest(normalizeEmailAddress(email))
        const existing = await payload.find({
          collection: 'contacts',
          where: {
            site: { equals: relationId(input.submission.site) },
            emailHash: { equals: hash },
          },
          limit: 1,
          overrideAccess: true,
        })
        const contact =
          existing.docs[0] ||
          (await payload.create({
            collection: 'contacts',
            data: {
              site: relationId(input.submission.site),
              displayName: String(
                input.submission.values?.[String(action.nameField ?? 'name')] ?? email,
              ).slice(0, 240),
              email: normalizeEmailAddress(email),
              emailHash: hash,
              status: 'lead',
              retentionMode: 'permanent',
              retentionHold: 'none',
            },
            overrideAccess: true,
          }))
        await payload.update({
          collection: 'form-submissions',
          id: input.submission.id,
          data: { contact: contact.id },
          overrideAccess: true,
        })
      } else if (kind === 'create-task') {
        await payload.create({
          collection: 'workflow-items',
          data: {
            site: relationId(input.submission.site),
            title: String(action.title ?? input.form.name).slice(0, 240),
            type: 'form-intake',
            status: 'open',
            priority: 'normal',
            sourceReferences: [{ collection: 'form-submissions', id: input.submission.id }],
          },
          overrideAccess: true,
        })
      } else if (kind === 'notify') {
        const address = String(action.address ?? '')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
          throw new Error('Notification recipient is not approved.')
        await payload.create({
          collection: 'execution-events',
          data: {
            site: relationId(input.submission.site),
            tenantId: relationId(input.submission.site),
            actor: { type: 'public-form' },
            eventType: 'form.notification.requested',
            eventVersion: 1,
            occurredAt: now(),
            correlationId: String(input.submission.id),
            idempotencyKey: `form-notify:${input.submission.id}:${audienceDigest(address)}`,
            privacyClass: 'restricted',
            payload: { submissionId: input.submission.id, recipient: address },
            state: 'ready',
            attempts: 0,
          },
          overrideAccess: true,
        })
      } else if (kind === 'approved-webhook') {
        if (!action.webhookId) throw new Error('No approved webhook is configured.')
        await payload.create({
          collection: 'execution-events',
          data: {
            site: relationId(input.submission.site),
            tenantId: relationId(input.submission.site),
            actor: { type: 'public-form' },
            eventType: 'form.submitted',
            eventVersion: 1,
            occurredAt: now(),
            correlationId: String(input.submission.id),
            idempotencyKey: `form-action:${input.submission.id}:${action.webhookId}`,
            privacyClass: 'restricted',
            payload: { submissionId: input.submission.id, webhookId: String(action.webhookId) },
            state: 'ready',
            attempts: 0,
          },
          overrideAccess: true,
        })
      } else if (!['redirect', 'download', 'tag', 'newsletter'].includes(kind))
        throw new Error('Unapproved action type.')
      state.push({ type: kind, status: 'completed', at: now() })
    } catch (error) {
      state.push({
        type: kind,
        status: 'failed',
        at: now(),
        error: error instanceof Error ? error.message : 'Action failed.',
      })
    }
  }
  await payload.update({
    collection: 'form-submissions',
    id: input.submission.id,
    data: { actionState: state },
    overrideAccess: true,
  })
  return state
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
  const email = normalizeEmailAddress(input.email)
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
  // A replay must not mint a second live confirmation or emit another message.
  // The existing opaque token cannot be recovered, so callers get a safe
  // pending response and staff can explicitly reissue after expiry.
  const outstanding = await payload.find({
    collection: 'subscriber-confirmation-tokens',
    where: {
      subscriber: { equals: subscriber.id },
      audienceList: { equals: input.listId },
      usedAt: { exists: false },
      expiresAt: { greater_than: now() },
    },
    limit: 1,
    overrideAccess: true,
  })
  if (outstanding.docs[0]) return { subscriber, token: undefined, replay: true }
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
  await queueSubscriptionConfirmation(payload, {
    siteId: input.siteId,
    subscriberId: subscriber.id,
    email,
    token,
  })
  return { subscriber, token, replay: false }
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
  const subDoc = (await payload.update({
    collection: 'subscribers',
    id: relationId(confirmation.subscriber),
    data: { status: 'active', verifiedAt: timestamp },
    overrideAccess: true,
  })) as Doc
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
  const siteId = relationId(confirmation.site) ?? relationId(subDoc?.site)
  await payload.create({
    collection: 'consent-events',
    data: {
      site: siteId,
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
  return subDoc
}

export async function suppressSubscriber(
  payload: Store,
  input: {
    siteId: string
    email: string
    reason:
      | 'unsubscribe'
      | 'bounce'
      | 'complaint'
      | 'provider'
      | 'invalid'
      | 'block'
      | 'operator'
      | 'legal'
    provider?: string
  },
) {
  const emailHash = audienceDigest(normalizeEmailAddress(input.email))
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

export async function subscriberSuppressionReason(
  payload: Store,
  siteId: string,
  emailHash: string,
) {
  const suppression = await payload.find({
    collection: 'suppressions',
    where: { site: { equals: siteId }, emailHash: { equals: emailHash } },
    sort: '-occurredAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const record = suppression.docs[0] as Doc | undefined
  return record
    ? { reason: record.reason, source: record.source ?? record.provider ?? 'recorded' }
    : null
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
  const designErrors = message.messageDesign
    ? validateEmailDesign(message.messageDesign, String(message.kind))
    : []
  if (designErrors.length) throw new Error(designErrors.join(' '))
  const approvedRender = message.messageDesign
    ? approvedRenderSnapshot(message.messageDesign, {
        origin: process.env.APP_URL ?? 'http://localhost:3000',
        subject: String(message.subject),
      })
    : undefined
  return payload.update({
    collection: 'email-messages',
    id: input.messageId,
    data: {
      status: 'scheduled',
      scheduledFor: input.scheduledFor,
      cancelCutoffAt: input.cancelCutoffAt,
      reviewedAt: now(),
      approvedRender,
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
              messageSnapshot: {
                subject: message.subject,
                blocks: message.blocks,
                kind: message.kind,
                reviewedAt: message.reviewedAt,
              },
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
    event: 'delivered' | 'deferred' | 'bounce' | 'complaint' | 'unsubscribe' | 'suppression'
    provider?: string
    providerMessageId: string
    providerEventId?: string
    occurredAt?: string
    evidence?: Record<string, unknown>
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
    input.event === 'delivered'
      ? 'delivered'
      : input.event === 'deferred'
        ? 'deferred'
        : input.event === 'unsubscribe'
          ? 'cancelled'
          : input.event === 'bounce'
            ? 'bounced'
            : 'complained'
  const eventKey = `provider:${input.provider ?? 'unknown'}:${input.providerEventId ?? `${input.event}:${input.providerMessageId}`}`
  const seen = await payload.find({
    collection: 'email-delivery-events',
    where: { idempotencyKey: { equals: eventKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (seen.docs[0]) return delivery
  await payload.create({
    collection: 'email-delivery-events',
    data: {
      delivery: delivery.id,
      idempotencyKey: eventKey,
      provider: input.provider ?? 'unknown',
      providerEventId: input.providerEventId,
      event: input.event,
      occurredAt: input.occurredAt ?? now(),
      evidence: input.evidence ?? {},
    },
    overrideAccess: true,
  })
  if (delivery.status !== status)
    await payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: { status, outcome: { ...(delivery.outcome ?? {}), providerEvent: input.event } },
      overrideAccess: true,
    })
  if (['bounce', 'complaint', 'unsubscribe', 'suppression'].includes(input.event))
    return suppressSubscriber(payload, {
      ...input,
      reason:
        input.event === 'suppression'
          ? 'provider'
          : (input.event as 'bounce' | 'complaint' | 'unsubscribe'),
    })
  return delivery
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
  const email = normalizeEmailAddress(input.email)
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
  const emailHash = audienceDigest(normalizeEmailAddress(input.email))
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
  if (message.messageDesign) {
    const errors = validateEmailDesign(message.messageDesign, String(message.kind))
    if (errors.length) throw new Error(errors.join(' '))
  }
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
        messageSnapshot: {
          subject: message.subject,
          blocks: message.blocks,
          messageDesign: message.messageDesign,
          kind: message.kind,
        },
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
  // Development's local sink still needs a usable confirmation link.
  const url = new URL('/subscribe/confirm', process.env.APP_URL ?? 'http://localhost:3000')
  url.searchParams.set('token', input.token)
  const key = `subscription-confirmation:${audienceDigest(input.token)}`
  const existing = await payload.find({
    collection: 'email-messages',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  const message =
    existing.docs[0] ||
    (await payload.create({
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
        idempotencyKey: key,
      },
      overrideAccess: true,
    }))
  const existingDelivery = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  const delivery =
    existingDelivery.docs[0] ||
    (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: message.id,
        subscriber: input.subscriberId,
        recipientEmail: input.email,
        idempotencyKey: key,
        status: 'queued',
        messageSnapshot: { subject: message.subject, blocks: message.blocks, kind: message.kind },
      },
      overrideAccess: true,
    }))
  if (!existingDelivery.docs[0])
    await payload.jobs.queue({
      task: 'audience-email-delivery',
      input: { deliveryId: delivery.id },
      queue: 'operations',
    })
  return delivery
}

export type ConsentChoice = { channel: 'email' | 'sms'; purpose: string; granted: boolean }

/** Consent history is immutable; this routine writes evidence then refreshes the disposable projection. */
export async function recordAudienceChoices(
  payload: Store,
  input: {
    siteId: string
    subscriberId: string
    choices: ConsentChoice[]
    source: string
    policyVersion?: string
    locale?: string
    proofReference?: string
    actor?: string
    ipDigest?: string
    userAgentDigest?: string
  },
) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: input.subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!subscriber || String(subscriber.site) !== input.siteId)
    throw new Error('Audience subject is unavailable.')
  for (const choice of input.choices) {
    if (!choice.purpose.trim()) throw new Error('A consent purpose is required.')
    await payload.create({
      collection: 'consent-events',
      data: {
        site: input.siteId,
        subscriber: subscriber.id,
        event: choice.granted ? 'preference-granted' : 'preference-withdrawn',
        basis: choice.granted ? 'consent' : 'withdrawal',
        channel: choice.channel,
        purpose: choice.purpose,
        captureSource: input.source,
        policyVersion: input.policyVersion,
        locale: input.locale,
        proofReference: input.proofReference,
        actor: input.actor,
        ipDigest: input.ipDigest,
        userAgentDigest: input.userAgentDigest,
        occurredAt: now(),
        evidence: { explicit: true },
      },
      overrideAccess: true,
    })
    if (!choice.granted)
      await suppressSubscriber(payload, {
        siteId: input.siteId,
        email: subscriber.email,
        reason: 'unsubscribe',
      })
  }
  return deriveAudienceEligibility(payload, input.siteId, subscriber.id)
}

export async function issueAudienceAccessToken(
  payload: Store,
  input: {
    siteId: string
    subscriberId: string
    purpose: 'preferences' | 'unsubscribe'
    ttlSeconds?: number
  },
) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: input.subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!subscriber || String(subscriber.site) !== input.siteId)
    throw new Error('Cross-site token issuance denied.')
  const nonce = newOpaqueToken()
  const exp = Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 7 * 24 * 60 * 60)
  await payload.create({
    collection: 'subscriber-confirmation-tokens',
    data: {
      site: input.siteId,
      subscriber: input.subscriberId,
      tokenHash: digest(nonce),
      expiresAt: new Date(exp * 1000).toISOString(),
      locale: 'und',
      consentWording: 'Audience access token',
      purpose: input.purpose,
    },
    overrideAccess: true,
  })
  return signAudienceClaims(
    {
      v: 1,
      siteId: input.siteId,
      subscriberId: input.subscriberId,
      purpose: input.purpose,
      exp,
      nonce,
    },
    process.env.PAYLOAD_SECRET ?? '',
  )
}

export async function authorizeAudienceAccess(
  payload: Store,
  token: string,
  purpose: 'preferences' | 'unsubscribe',
) {
  const claims = verifyAudienceClaims(token, process.env.PAYLOAD_SECRET ?? '', purpose)
  if (!claims) return null
  const found = await payload.find({
    collection: 'subscriber-confirmation-tokens',
    where: { tokenHash: { equals: digest(claims.nonce) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const record = found.docs[0] as Doc | undefined
  if (
    !record ||
    record.revokedAt ||
    record.usedAt ||
    record.purpose !== purpose ||
    String(record.site) !== claims.siteId ||
    String(record.subscriber) !== claims.subscriberId ||
    new Date(record.expiresAt) <= new Date()
  )
    return null
  return claims
}

export async function deriveAudienceEligibility(
  payload: Store,
  siteId: string,
  subscriberId: string,
) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!subscriber || String(subscriber.site) !== siteId)
    throw new Error('Audience subject is unavailable.')
  const events = await payload.find({
    collection: 'consent-events',
    where: { subscriber: { equals: subscriberId } },
    sort: '-occurredAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const choices: Record<string, boolean> = {}
  for (const event of events.docs as Doc[]) {
    const key = `${event.channel ?? 'email'}:${event.purpose ?? 'marketing'}`
    if (!(key in choices))
      choices[key] =
        event.event === 'preference-granted' ||
        event.event === 'double-opt-in-confirmed' ||
        event.event === 'resubscribe'
  }
  const suppressed = await isSubscriberSuppressed(payload, siteId, subscriber.emailHash)
  return {
    subscriberId,
    eligible: subscriber.status === 'active' && !suppressed,
    suppressed,
    choices,
    evidence: events.docs,
  }
}

/** Input rows stay review-only until an explicit, evidenced basis is supplied. */
export function previewAudienceCsv(
  csv: string,
  siteId: string,
  consent: { basis?: string; source?: string } = {},
) {
  const [headerLine = '', ...lines] = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
  const headers = headerLine.split(',').map((cell) => cell.trim().toLowerCase())
  const emailIndex = headers.indexOf('email')
  if (emailIndex < 0) throw new Error('CSV requires an email column.')
  const seen = new Set<string>()
  const rows: Doc[] = []
  for (let index = 0; index < lines.length; index++) {
    const cells = lines[index].split(',').map((cell) => cell.trim())
    try {
      const email = normalizeEmailAddress(cells[emailIndex] ?? '')
      const duplicate = seen.has(email)
      seen.add(email)
      rows.push({
        row: index + 2,
        email,
        emailHash: audienceDigest(email),
        action: duplicate
          ? 'quarantine'
          : consent.basis && consent.source
            ? 'review'
            : 'quarantine',
        reason: duplicate
          ? 'duplicate in file'
          : consent.basis && consent.source
            ? 'requires operator approval; consent is not inferred'
            : 'missing explicit consent basis/source',
      })
    } catch {
      rows.push({ row: index + 2, action: 'quarantine', reason: 'invalid email' })
    }
  }
  return {
    siteId,
    headers,
    rows,
    accepted: rows.filter((r) => r.action === 'review').length,
    quarantined: rows.filter((r) => r.action === 'quarantine').length,
    idempotencyKey: audienceDigest(`${siteId}:${csv}`),
  }
}

/** Resolves a cross-projection link only when each identity belongs to this site and no conflicting link exists. */
export async function linkSubscriberIdentity(
  payload: Store,
  input: { siteId: string; subscriberId: string; contactId?: string; memberId?: string },
) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: input.subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!subscriber || String(subscriber.site) !== input.siteId)
    throw new Error('Cross-site identity link denied.')
  if (input.contactId) {
    const contact = (await payload.findByID({
      collection: 'contacts',
      id: input.contactId,
      depth: 0,
      overrideAccess: true,
    })) as Doc
    if (
      !contact ||
      String(contact.site) !== input.siteId ||
      (subscriber.contact && String(subscriber.contact) !== input.contactId)
    )
      throw new Error('Conflicting contact link requires merge review.')
  }
  if (input.memberId && subscriber.member && String(subscriber.member) !== input.memberId)
    throw new Error('Conflicting member link requires merge review.')
  return payload.update({
    collection: 'subscribers',
    id: input.subscriberId,
    data: {
      ...(input.contactId ? { contact: input.contactId } : {}),
      ...(input.memberId ? { member: input.memberId } : {}),
    },
    overrideAccess: true,
  })
}

/** Merge only aliases a duplicate; source consent, suppressions, and audit remain attached to it. */
export async function mergeAudienceSubscribers(
  payload: Store,
  input: { siteId: string; sourceId: string; targetId: string; actor?: string },
) {
  if (input.sourceId === input.targetId) throw new Error('Choose two distinct audience records.')
  const [source, target] = await Promise.all(
    [input.sourceId, input.targetId].map(
      (id) =>
        payload.findByID({
          collection: 'subscribers',
          id,
          depth: 0,
          overrideAccess: true,
        }) as Promise<Doc>,
    ),
  )
  if (
    !source ||
    !target ||
    String(source.site) !== input.siteId ||
    String(target.site) !== input.siteId
  )
    throw new Error('Cross-site merge denied.')
  if (source.emailHash !== target.emailHash)
    throw new Error(
      'Different delivery addresses require a reviewed contact merge, not an audience merge.',
    )
  await payload.update({
    collection: 'subscribers',
    id: source.id,
    data: { status: 'suppressed' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'consent-events',
    data: {
      site: input.siteId,
      subscriber: source.id,
      event: 'operator-correction',
      basis: 'merge',
      actor: input.actor,
      occurredAt: now(),
      evidence: { mergedInto: target.id, reversible: true },
    },
    overrideAccess: true,
  })
  return { sourceId: source.id, targetId: target.id, state: 'merged-reviewable' }
}

export async function exportAudienceSubject(
  payload: Store,
  input: { siteId: string; subscriberId: string },
) {
  const eligibility = await deriveAudienceEligibility(payload, input.siteId, input.subscriberId)
  const [subscriber, consent, suppressions] = await Promise.all([
    payload.findByID({
      collection: 'subscribers',
      id: input.subscriberId,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'consent-events',
      where: { subscriber: { equals: input.subscriberId } },
      limit: 1000,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'suppressions',
      where: { site: { equals: input.siteId } },
      limit: 1000,
      overrideAccess: true,
    }),
  ])
  return {
    subscriber,
    eligibility,
    consentEvents: consent.docs,
    suppressions: (suppressions.docs as Doc[]).filter(
      (s) => s.emailHash === (subscriber as Doc).emailHash,
    ),
  }
}

export async function eraseAudienceSubject(
  payload: Store,
  input: { siteId: string; subscriberId: string; policyVersion: string; actor?: string },
) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: input.subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (!subscriber || String(subscriber.site) !== input.siteId)
    throw new Error('Cross-site erasure denied.')
  const digest = subscriber.emailHash
  await suppressSubscriber(payload, {
    siteId: input.siteId,
    email: subscriber.email,
    reason: 'legal',
  })
  await payload.update({
    collection: 'subscribers',
    id: subscriber.id,
    data: {
      email: `erased+${digest.slice(0, 18)}@invalid.local`,
      status: 'suppressed',
      erasedAt: now(),
      contact: undefined,
      member: undefined,
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'consent-events',
    data: {
      site: input.siteId,
      event: 'erased',
      basis: 'erasure',
      policyVersion: input.policyVersion,
      actor: input.actor,
      occurredAt: now(),
      evidence: { addressDigestRetainedForSuppression: true },
    },
    overrideAccess: true,
  })
}
