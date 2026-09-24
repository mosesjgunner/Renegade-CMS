/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'
import { createHash } from 'node:crypto'

import { loadConfig } from '../core/config'
import { selectEmailDeliveryAdapter } from '../email/delivery'
import { isDeliveryTerminal, isMarketingMessage, type EmailBlock } from './contracts'
import { renderEmailDesign } from './email-composer'
import {
  canDeliverToSubscriber,
  issueAudienceAccessToken,
  queueNewsletterDeliveries,
  subscriberSuppressionReason,
} from './service'

type DeliveryInput = { deliveryId: string }
type Doc = Record<string, any>

function emailText(blocks: readonly EmailBlock[] = []): string {
  return blocks
    .flatMap((block) => {
      if (block.type === 'heading' || block.type === 'text') return [block.text]
      if (block.type === 'button') return [`${block.label}: ${block.href}`]
      if (block.type === 'content-cards')
        return block.cards.map(
          (card) => `${card.title}${card.text ? ` - ${card.text}` : ''}: ${card.href}`,
        )
      if (block.type === 'columns')
        return block.columns.flatMap((column) => emailText(column.blocks).split('\n'))
      return []
    })
    .join('\n')
}

export const emailDeliveryTask = {
  slug: 'audience-email-delivery',
  label: 'Audience email delivery',
  inputSchema: [{ name: 'deliveryId', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 500, type: 'exponential' } },
  concurrency: ({ input }: { input: DeliveryInput }) => `audience.email:${input.deliveryId}`,
  handler: async ({ input, req }: { input: DeliveryInput; req: any }) => {
    const delivery = (await req.payload.findByID({
      collection: 'email-deliveries',
      id: input.deliveryId,
      depth: 1,
      overrideAccess: true,
    })) as Doc
    if (isDeliveryTerminal(delivery.status) || ['failed', 'dead-letter'].includes(delivery.status))
      return { output: {} }
    const message = delivery.message as Doc
    // A queued recipient renders the reviewed revision captured at queue time;
    // later edits to the message cannot alter an approved send.
    const snapshot = (delivery.messageSnapshot as Doc | undefined) ?? message
    const category = isMarketingMessage(String(snapshot.kind)) ? 'marketing' : 'transactional'
    const siteId =
      (typeof message?.site === 'object' && message?.site !== null
        ? String((message.site as Doc).id ?? message.site)
        : message?.site
          ? String(message.site)
          : undefined) ??
      (typeof delivery.site === 'object' && delivery.site !== null
        ? String((delivery.site as Doc).id ?? delivery.site)
        : delivery.site
          ? String(delivery.site)
          : 'site-1')
    const eligible =
      category === 'marketing'
        ? await canDeliverToSubscriber(req.payload, {
            siteId,
            subscriberId: delivery.subscriber
              ? String((delivery.subscriber as Doc).id ?? delivery.subscriber)
              : undefined,
            recipientEmail: delivery.recipientEmail,
          })
        : true
    // This is intentionally adjacent to adapter use: a late unsubscribe wins over a snapshot.
    if (!eligible) {
      const subscriber = delivery.subscriber as Doc | undefined
      const reason = subscriber?.emailHash
        ? await subscriberSuppressionReason(req.payload, siteId, String(subscriber.emailHash))
        : null
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: {
          status: 'cancelled',
          outcome: {
            code: 'suppressed-before-send',
            governingSuppression: reason ?? {
              reason: 'ineligible-recipient',
              source: 'audience-state',
            },
          },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }
    // An unknown outcome is never retried against a different transport. Reconcile
    // first when the current provider can prove the stable idempotency key.
    const adapter = selectEmailDeliveryAdapter(loadConfig())
    if (delivery.status === 'unknown') {
      const reconciled = await adapter.reconcile?.({
        idempotencyKey: delivery.idempotencyKey,
        providerMessageId: delivery.providerMessageId,
      })
      if (!reconciled?.ok) return { output: {} }
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: {
          status: 'accepted',
          provider: reconciled.provider,
          providerMessageId: reconciled.providerMessageId,
          outcome: { ...(delivery.outcome ?? {}), reconciledAt: new Date().toISOString() },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }
    await req.payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: { status: 'sending', attempts: Number(delivery.attempts || 0) + 1 },
      overrideAccess: true,
    })
    if (!adapter.capabilities.includes(category)) {
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: { status: 'failed', outcome: { code: 'email_capability_disabled', category } },
        overrideAccess: true,
      })
      return { output: {} }
    }
    const rendered = snapshot.messageDesign
      ? renderEmailDesign(snapshot.messageDesign, {
          origin: process.env.APP_URL ?? 'http://localhost:3000',
          recipient: snapshot.recipientPreview,
        })
      : {
          text: emailText(Array.isArray(snapshot.blocks) ? (snapshot.blocks as EmailBlock[]) : []),
          html: undefined,
        }
    let unsubscribeToken = delivery.unsubscribeToken as string | undefined
    if (category === 'marketing' && !unsubscribeToken && delivery.subscriber) {
      unsubscribeToken = await issueAudienceAccessToken(req.payload, {
        siteId: String(message.site),
        subscriberId: String((delivery.subscriber as Doc).id ?? delivery.subscriber),
        purpose: 'unsubscribe',
      })
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: { unsubscribeToken },
        overrideAccess: true,
      })
    }
    const unsubscribeUrl = unsubscribeToken
      ? `${new URL('/unsubscribe', process.env.APP_URL ?? 'http://localhost:3000').toString()}?token=${encodeURIComponent(unsubscribeToken)}`
      : undefined
    const result = await adapter.send({
      from: loadConfig().email.from ?? '',
      to: delivery.recipientEmail,
      subject: String(snapshot.subject ?? 'Renegade notification'),
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: delivery.idempotencyKey,
      category,
      replyTo: snapshot.senderIdentity?.replyTo,
      messageId: `<${createHash('sha256').update(String(delivery.idempotencyKey)).digest('hex').slice(0, 32)}@renegade.local>`,
      headers:
        category === 'marketing' && unsubscribeUrl
          ? {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              'X-Renegade-Purpose': String(snapshot.purpose ?? 'newsletter'),
            }
          : { 'X-Renegade-Purpose': String(snapshot.purpose ?? 'transactional') },
    })
    if (result.ok) {
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: {
          status: 'accepted',
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          acceptedAt: new Date().toISOString(),
          rfcMessageId: `<${createHash('sha256').update(String(delivery.idempotencyKey)).digest('hex').slice(0, 32)}@renegade.local>`,
          renderHash: createHash('sha256')
            .update(`${rendered.text}\n${rendered.html ?? ''}`)
            .digest('base64url'),
          outcome: { acceptedAt: new Date().toISOString(), delivery: 'not-observed' },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }
    await req.payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: {
        status:
          result.failure.kind === 'unknown'
            ? 'unknown'
            : result.failure.kind === 'permanent'
              ? 'failed'
              : 'queued',
        provider: result.provider,
        outcome: {
          code: result.failure.code,
          message: result.failure.message,
          retryable: result.failure.kind === 'retryable',
          ...(result.failure.kind === 'retryable'
            ? {
                nextAttemptAt: new Date(
                  Date.now() + Math.min(3_600_000, 1_000 * 2 ** Number(delivery.attempts || 0)),
                ).toISOString(),
              }
            : {}),
        },
      },
      overrideAccess: true,
    })
    if (result.failure.kind === 'retryable')
      throw new Error(`Email delivery retryable: ${result.failure.code}`)
    return { output: {} }
  },
} as unknown as TaskConfig
export const newsletterDispatchTask = {
  slug: 'audience-newsletter-dispatch',
  label: 'Audience newsletter dispatch',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: () => 'audience.newsletter-dispatch',
  schedule: [{ cron: '*/30 * * * * *', queue: 'operations' }],
  handler: async ({ req }: { req: any }) => {
    const due = await req.payload.find({
      collection: 'email-messages',
      where: {
        status: { equals: 'scheduled' },
        scheduledFor: { less_than_equal: new Date().toISOString() },
      },
      limit: 100,
      overrideAccess: true,
    })
    for (const message of due.docs) await queueNewsletterDeliveries(req.payload, message.id)
    return { output: {} }
  },
} as unknown as TaskConfig
export const audienceTasks = [emailDeliveryTask, newsletterDispatchTask]
