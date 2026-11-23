/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-19 (#30) — general automation execution.
 *
 * Until this pass, `automation-definitions` were review records: the
 * collections, the run/failure ledgers and the action vocabulary all
 * existed, and the UI honestly labelled general execution unavailable,
 * but nothing ever ran a definition. This module is the missing
 * executor. It runs the bounded vocabulary from `engine.ts`
 * (delay / condition / send-approved-message / add-tag / remove-tag /
 * add-list / remove-list / create-task / notify / exit) against one
 * subscriber subject, journaling every step on the run row and every
 * failure on `automation-failures`.
 *
 * Mounted entry points:
 * - `triggerAutomations` is called from `confirmDoubleOptIn` (the
 *   confirmed-subscription domain event) in `service.ts`.
 * - `resumeDueAutomationRuns` is called by the scheduled
 *   `audience-automation-resume` task in `tasks.ts`, which is how a
 *   run paused on a `delay` action continues.
 *
 * Safety rails, in order: a definition runs only when it is `active`,
 * belongs to the subject's site, passes `validateAutomation`, and —
 * when it requires approval — carries an approval timestamp. Sending
 * is gated again at the send step (subscriber active, on-site, not
 * suppressed). A suppressed membership is never resurrected by
 * add-list. Runs are idempotent on (definition, source event).
 */
import { createHash } from 'node:crypto'

import { withExecutionLock } from '../operations/execution-lock'
import { automationIdempotencyKey, deliveryIdempotencyKey } from './contracts'
import { AUTOMATION_ACTIONS, validateAutomation } from './engine'

type Doc = Record<string, any>
type Store = any

const now = () => new Date().toISOString()
const relationId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object' && value && 'id' in value) return String((value as Doc).id)
  const str = String(value).trim()
  return str.length > 0 ? str : undefined
}

type AutomationSubject = { subscriberId: string; email?: string; siteId: string }
type StepOutcome = Record<string, unknown>

const deterministicUuid = (seed: string) => {
  const hash = createHash('sha256').update(seed).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

async function loadSubscriber(payload: Store, siteId: string, subscriberId: string) {
  const subscriber = (await payload.findByID({
    collection: 'subscribers',
    id: subscriberId,
    depth: 0,
    overrideAccess: true,
  })) as Doc | null
  if (!subscriber) throw new Error('Automation subject subscriber not found.')
  if (relationId(subscriber.site) !== siteId)
    throw new Error('Automation subject belongs to another site.')
  return subscriber
}

async function isSuppressed(payload: Store, siteId: string, emailHash: string) {
  const found = await payload.find({
    collection: 'suppressions',
    where: { site: { equals: siteId }, emailHash: { equals: emailHash } },
    limit: 1,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

/** The contact a subscriber's tags hang from; created on first use, mirroring form intake. */
async function ensureContact(payload: Store, siteId: string, subscriber: Doc) {
  const linked = relationId(subscriber.contact)
  if (linked) {
    const contact = (await payload.findByID({
      collection: 'contacts',
      id: linked,
      depth: 0,
      overrideAccess: true,
    })) as Doc | null
    if (contact && relationId(contact.site) === siteId) return contact
  }
  const email = String(subscriber.email ?? '')
  const found = await payload.find({
    collection: 'contacts',
    where: { and: [{ site: { equals: siteId } }, { emailHash: { equals: subscriber.emailHash } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const contact =
    found.docs[0] ??
    (await payload.create({
      collection: 'contacts',
      data: {
        site: siteId,
        email,
        emailHash: subscriber.emailHash,
        displayName: email,
        status: 'lead',
      },
      overrideAccess: true,
    }))
  if (!linked) {
    await payload.update({
      collection: 'subscribers',
      id: subscriber.id,
      data: { contact: contact.id },
      overrideAccess: true,
    })
  }
  return contact as Doc
}

async function applyTag(
  payload: Store,
  siteId: string,
  subscriber: Doc,
  tagName: string,
  mode: 'add' | 'remove',
) {
  const contact = await ensureContact(payload, siteId, subscriber)
  const tags = await payload.find({
    collection: 'contact-tags',
    where: { and: [{ site: { equals: siteId } }, { name: { equals: tagName } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  let tag = tags.docs[0] as Doc | undefined
  if (!tag) {
    if (mode === 'remove') return { tag: tagName, result: 'absent' }
    tag = (await payload.create({
      collection: 'contact-tags',
      data: { site: siteId, name: tagName },
      overrideAccess: true,
    })) as Doc
  }
  const taggings = await payload.find({
    collection: 'contact-taggings',
    where: { and: [{ contact: { equals: contact.id } }, { tag: { equals: tag.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (mode === 'add') {
    if (!taggings.docs.length) {
      await payload.create({
        collection: 'contact-taggings',
        data: { contact: contact.id, tag: tag.id, source: 'automation' },
        overrideAccess: true,
      })
    }
    return { tag: tagName, tagId: String(tag.id), result: 'added' }
  }
  if (taggings.docs.length) {
    await payload.delete({
      collection: 'contact-taggings',
      id: taggings.docs[0].id,
      overrideAccess: true,
    })
  }
  return { tag: tagName, tagId: String(tag.id), result: 'removed' }
}

async function applyList(
  payload: Store,
  siteId: string,
  subscriber: Doc,
  listId: string,
  mode: 'add' | 'remove',
) {
  const list = (await payload.findByID({
    collection: 'audience-lists',
    id: listId,
    depth: 0,
    overrideAccess: true,
  })) as Doc | null
  if (!list) throw new Error(`Automation list ${listId} does not exist.`)
  if (relationId(list.site) !== siteId) throw new Error('Automation list belongs to another site.')
  const memberships = await payload.find({
    collection: 'audience-memberships',
    where: { subscriber: { equals: subscriber.id }, audienceList: { equals: listId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const membership = memberships.docs[0] as Doc | undefined
  if (mode === 'add') {
    if (membership?.status === 'suppressed')
      return { listId, result: 'skipped', reason: 'membership-suppressed' }
    if (membership) {
      if (membership.status !== 'active') {
        await payload.update({
          collection: 'audience-memberships',
          id: membership.id,
          data: { status: 'active', source: 'automation' },
          overrideAccess: true,
        })
      }
      return { listId, result: 'added', membershipId: String(membership.id) }
    }
    const created = (await payload.create({
      collection: 'audience-memberships',
      data: {
        subscriber: subscriber.id,
        audienceList: listId,
        status: 'active',
        source: 'automation',
      },
      overrideAccess: true,
    })) as Doc
    return { listId, result: 'added', membershipId: String(created.id) }
  }
  if (!membership) return { listId, result: 'absent' }
  if (membership.status !== 'suppressed') {
    await payload.update({
      collection: 'audience-memberships',
      id: membership.id,
      data: { status: 'unsubscribed' },
      overrideAccess: true,
    })
  }
  return { listId, result: 'removed', membershipId: String(membership.id) }
}

async function sendApprovedMessage(
  payload: Store,
  siteId: string,
  subscriber: Doc,
  messageId: string,
): Promise<StepOutcome> {
  const message = (await payload.findByID({
    collection: 'email-messages',
    id: messageId,
    depth: 0,
    overrideAccess: true,
  })) as Doc | null
  if (!message) throw new Error(`Automation message ${messageId} does not exist.`)
  if (relationId(message.site) !== siteId)
    throw new Error('Automation message belongs to another site.')
  if (
    !message.reviewedAt ||
    ['draft', 'review', 'cancelled', 'failed'].includes(String(message.status))
  )
    throw new Error('Automation message has not passed review; send-approved-message refuses it.')
  // The send gate is re-checked at send time, never inherited from the trigger.
  if (
    subscriber.status !== 'active' ||
    subscriber.globalUnsubscribedAt ||
    (await isSuppressed(payload, siteId, String(subscriber.emailHash)))
  )
    return { messageId, result: 'skipped', reason: 'not-deliverable' }
  const key = deliveryIdempotencyKey(messageId, String(subscriber.id))
  const exists = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  if (exists.docs.length)
    return { messageId, result: 'already-queued', deliveryId: String(exists.docs[0].id) }
  const delivery = (await payload.create({
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
        messageDesign: message.messageDesign,
        purpose: message.purpose,
        senderIdentity: message.senderIdentity,
      },
    },
    overrideAccess: true,
  })) as Doc
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: delivery.id },
    queue: 'operations',
  })
  return { messageId, result: 'queued', deliveryId: String(delivery.id) }
}

async function createTask(
  payload: Store,
  siteId: string,
  run: Doc,
  action: Doc,
  index: number,
): Promise<StepOutcome> {
  const taskId = deterministicUuid(`automation-task:${run.id}:${index}`)
  const found = await payload.find({
    collection: 'workflow-items',
    where: { id: { equals: taskId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const task =
    found.docs[0] ??
    (await payload.create({
      collection: 'workflow-items',
      data: {
        id: taskId,
        site: siteId,
        title: String(action.title ?? 'Automation follow-up').slice(0, 240),
        type: 'custom',
        status: 'open',
        priority: 'normal',
        sourceReferences: [{ collection: 'automation-runs', id: String(run.id) }],
      },
      overrideAccess: true,
    }))
  return { result: 'created', taskId: String((task as Doc).id) }
}

async function notify(payload: Store, siteId: string, subscriber: Doc, action: Doc) {
  const event = (await payload.create({
    collection: 'activity-events',
    data: {
      site: siteId,
      type: 'automation-notify',
      actor: { kind: 'automation' },
      object: { subscriberId: String(subscriber.id) },
      payload: { note: String(action.note ?? 'Automation notification').slice(0, 500) },
      occurredAt: now(),
    },
    overrideAccess: true,
  })) as Doc
  const memberId = relationId(subscriber.member)
  if (!memberId) return { result: 'recorded', activityEventId: String(event.id) }
  const notification = (await payload.create({
    collection: 'notifications',
    data: {
      activityEvent: event.id,
      recipientMember: memberId,
      status: 'unread',
      channels: ['in-app'],
    },
    overrideAccess: true,
  })) as Doc
  return {
    result: 'recorded',
    activityEventId: String(event.id),
    notificationId: String(notification.id),
  }
}

async function evaluateCondition(
  payload: Store,
  siteId: string,
  subscriber: Doc,
  action: Doc,
): Promise<boolean> {
  const condition = (action.condition ?? action) as Doc
  const absent = condition.absent === true
  let present: boolean
  if (typeof condition.tag === 'string') {
    const contact = await ensureContact(payload, siteId, subscriber)
    const tags = await payload.find({
      collection: 'contact-tags',
      where: { and: [{ site: { equals: siteId } }, { name: { equals: condition.tag } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!tags.docs.length) {
      present = false
    } else {
      const taggings = await payload.find({
        collection: 'contact-taggings',
        where: { and: [{ contact: { equals: contact.id } }, { tag: { equals: tags.docs[0].id } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      present = taggings.docs.length > 0
    }
  } else if (typeof condition.listId === 'string') {
    const memberships = await payload.find({
      collection: 'audience-memberships',
      where: {
        and: [
          { subscriber: { equals: subscriber.id } },
          { audienceList: { equals: condition.listId } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    present = memberships.docs.length > 0
  } else {
    throw new Error('Automation condition needs a tag name or a list id.')
  }
  return absent ? !present : present
}

/**
 * Execute (or resume) one run from its recorded step. Safe to call
 * repeatedly: completed/failed runs return immediately, a delay step
 * parks the run for the resume sweep, and every side effect is keyed
 * deterministically so a replay cannot duplicate it.
 */
export async function executeAutomationRun(payload: Store, runId: string) {
  return withExecutionLock(payload, `automation-run:${runId}`, async () => {
    const run = (await payload.findByID({
      collection: 'automation-runs',
      id: runId,
      depth: 0,
      overrideAccess: true,
    })) as Doc | null
    if (!run) throw new Error('Automation run not found.')
    if (['completed', 'failed'].includes(String(run.status))) return run
    const definition = (await payload.findByID({
      collection: 'automation-definitions',
      id: relationId(run.definition),
      depth: 0,
      overrideAccess: true,
    })) as Doc | null
    if (!definition) throw new Error('Automation definition not found.')
    const subject = run.subject as AutomationSubject
    const siteId = subject.siteId
    const subscriber = await loadSubscriber(payload, siteId, subject.subscriberId)
    const actions = Array.isArray(definition.actions) ? (definition.actions as Doc[]) : []
    const steps: StepOutcome[] = Array.isArray(run.outcome?.steps) ? run.outcome.steps : []
    await payload.update({
      collection: 'automation-runs',
      id: runId,
      data: { status: 'running' },
      overrideAccess: true,
    })
    let index = Number(run.step ?? 0)
    try {
      for (; index < actions.length; index++) {
        const action = actions[index]
        const type = String(action?.type ?? '')
        if (!AUTOMATION_ACTIONS.includes(type as never))
          throw new Error(`Unsupported automation action: ${type}`)
        if (type === 'delay') {
          const minutes = Number(action.minutes ?? 0)
          const nextRunAt = new Date(Date.now() + minutes * 60_000).toISOString()
          steps.push({ index, type, result: 'paused', minutes, nextRunAt })
          await payload.update({
            collection: 'automation-runs',
            id: runId,
            data: { status: 'paused', step: index + 1, nextRunAt, outcome: { steps } },
            overrideAccess: true,
          })
          return { ...run, status: 'paused', step: index + 1 }
        }
        if (type === 'exit') {
          steps.push({ index, type, result: 'exit' })
          break
        }
        if (type === 'condition') {
          const met = await evaluateCondition(payload, siteId, subscriber, action)
          steps.push({ index, type, result: met ? 'met' : 'not-met' })
          if (!met) break
          continue
        }
        if (type === 'add-tag' || type === 'remove-tag') {
          const tagName = String(action.tag ?? action.name ?? '')
          if (!tagName) throw new Error(`Automation ${type} action needs a tag name.`)
          steps.push({
            index,
            type,
            ...(await applyTag(
              payload,
              siteId,
              subscriber,
              tagName,
              type === 'add-tag' ? 'add' : 'remove',
            )),
          })
          continue
        }
        if (type === 'add-list' || type === 'remove-list') {
          const listId = String(action.listId ?? action.list ?? '')
          if (!listId) throw new Error(`Automation ${type} action needs a list id.`)
          steps.push({
            index,
            type,
            ...(await applyList(
              payload,
              siteId,
              subscriber,
              listId,
              type === 'add-list' ? 'add' : 'remove',
            )),
          })
          continue
        }
        if (type === 'send-approved-message') {
          const messageId = String(action.messageId ?? action.message ?? '')
          if (!messageId) throw new Error('Automation send-approved-message needs a message id.')
          steps.push({
            index,
            type,
            ...(await sendApprovedMessage(payload, siteId, subscriber, messageId)),
          })
          continue
        }
        if (type === 'create-task') {
          steps.push({ index, type, ...(await createTask(payload, siteId, run, action, index)) })
          continue
        }
        if (type === 'notify') {
          steps.push({ index, type, ...(await notify(payload, siteId, subscriber, action)) })
          continue
        }
      }
      await payload.update({
        collection: 'automation-runs',
        id: runId,
        data: {
          status: 'completed',
          step: index,
          nextRunAt: null,
          outcome: { steps, completedAt: now() },
        },
        overrideAccess: true,
      })
      return { ...run, status: 'completed' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      steps.push({
        index,
        type: String(actions[index]?.type ?? ''),
        result: 'failed',
        error: message,
      })
      await payload
        .create({
          collection: 'automation-failures',
          data: { run: runId, actionIndex: index, error: { message }, retryable: true },
          overrideAccess: true,
        })
        .catch(() => undefined)
      await payload.update({
        collection: 'automation-runs',
        id: runId,
        data: {
          status: 'failed',
          step: index,
          outcome: { steps, failedAt: now(), error: message },
        },
        overrideAccess: true,
      })
      return { ...run, status: 'failed' }
    }
  })
}

/**
 * Fire every eligible definition for a domain event. Returns one entry
 * per definition that started (or already had) a run; ineligible
 * definitions (inactive, unapproved, invalid, other-site) never run.
 */
export async function triggerAutomations(
  payload: Store,
  input: {
    siteId: string
    triggerType: string
    subscriberId: string
    sourceEventId: string
    sourceEventRef?: string
  },
) {
  const subscriber = await loadSubscriber(payload, input.siteId, input.subscriberId)
  const definitions = await payload.find({
    collection: 'automation-definitions',
    where: { and: [{ site: { equals: input.siteId } }, { status: { equals: 'active' } }] },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const started: Array<{ definitionId: string; runId: string; status: string }> = []
  for (const definition of definitions.docs as Doc[]) {
    const trigger = (definition.trigger ?? {}) as Doc
    if (String(trigger.type ?? '') !== input.triggerType) continue
    if (definition.requiresApproval !== false && !definition.approvedAt) continue
    const actions = Array.isArray(definition.actions) ? definition.actions : []
    if (validateAutomation({ trigger: input.triggerType, actions }).length) continue
    const key = automationIdempotencyKey(String(definition.id), input.sourceEventId)
    const existing = await payload.find({
      collection: 'automation-runs',
      where: { idempotencyKey: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length) {
      started.push({
        definitionId: String(definition.id),
        runId: String(existing.docs[0].id),
        status: String(existing.docs[0].status),
      })
      continue
    }
    if (definition.reentryPolicy === 'never') {
      const prior = await payload.find({
        collection: 'automation-runs',
        where: { definition: { equals: definition.id } },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const alreadyRan = (prior.docs as Doc[]).some(
        (row) => String((row.subject as Doc)?.subscriberId ?? '') === input.subscriberId,
      )
      if (alreadyRan) continue
    }
    const run = (await payload.create({
      collection: 'automation-runs',
      data: {
        definition: definition.id,
        ...(input.sourceEventRef ? { sourceEvent: input.sourceEventRef } : {}),
        idempotencyKey: key,
        status: 'queued',
        subject: {
          subscriberId: input.subscriberId,
          email: subscriber.email,
          siteId: input.siteId,
        },
        definitionVersion: String(definition.version ?? ''),
        step: 0,
      },
      overrideAccess: true,
    })) as Doc
    const executed = await executeAutomationRun(payload, String(run.id))
    started.push({
      definitionId: String(definition.id),
      runId: String(run.id),
      status: String((executed as Doc).status),
    })
  }
  return started
}

/** Resume every paused run whose delay has elapsed. Called by the scheduled resume task. */
export async function resumeDueAutomationRuns(payload: Store, at = new Date()) {
  const due = await payload.find({
    collection: 'automation-runs',
    where: {
      and: [{ status: { equals: 'paused' } }, { nextRunAt: { less_than_equal: at.toISOString() } }],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  let resumed = 0
  for (const run of due.docs as Doc[]) {
    await executeAutomationRun(payload, String(run.id))
    resumed++
  }
  return resumed
}
