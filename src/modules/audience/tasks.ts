/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'

import { loadConfig } from '../core/config'
import { selectEmailDeliveryAdapter } from '../email/delivery'
import { isDeliveryTerminal, isMarketingMessage, type EmailBlock } from './contracts'
import { canDeliverToSubscriber, queueNewsletterDeliveries } from './service'

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
    if (isDeliveryTerminal(delivery.status) || delivery.status === 'failed') return { output: {} }
    const message = delivery.message as Doc
    const category = isMarketingMessage(String(message.kind)) ? 'marketing' : 'transactional'
    const eligible =
      category === 'marketing'
        ? await canDeliverToSubscriber(req.payload, {
            siteId: String(message.site),
            subscriberId: delivery.subscriber
              ? String((delivery.subscriber as Doc).id ?? delivery.subscriber)
              : undefined,
            recipientEmail: delivery.recipientEmail,
          })
        : true
    // This is intentionally adjacent to adapter use: a late unsubscribe wins over a snapshot.
    if (!eligible) {
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: { status: 'cancelled', outcome: { code: 'suppressed-before-send' } },
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
    const adapter = selectEmailDeliveryAdapter(loadConfig())
    if (!adapter.capabilities.includes(category)) {
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: { status: 'failed', outcome: { code: 'email_capability_disabled', category } },
        overrideAccess: true,
      })
      return { output: {} }
    }
    const result = await adapter.send({
      from: loadConfig().email.from ?? '',
      to: delivery.recipientEmail,
      subject: String(message.subject ?? 'Renegade notification'),
      text: emailText(Array.isArray(message.blocks) ? (message.blocks as EmailBlock[]) : []),
      idempotencyKey: delivery.idempotencyKey,
      category,
    })
    if (result.ok) {
      await req.payload.update({
        collection: 'email-deliveries',
        id: delivery.id,
        data: {
          status: 'sent',
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          outcome: { sentAt: new Date().toISOString() },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }
    await req.payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: {
        status: result.failure.kind === 'permanent' ? 'failed' : 'queued',
        provider: result.provider,
        outcome: {
          code: result.failure.code,
          message: result.failure.message,
          retryable: result.failure.kind === 'retryable',
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
