/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'

type DeliveryInput = { deliveryId: string }
/** Development capture is a real, testable adapter. Production adapters are selected only via configured Connections. */
export const developmentEmailAdapter = {
  id: 'development-capture',
  send: async (message: { id: string }, recipient: string) => ({
    providerMessageId: `dev:${message.id}:${Buffer.from(recipient).toString('base64url')}`,
  }),
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
    })) as any
    if (['sent', 'delivered', 'bounced', 'complained', 'cancelled'].includes(delivery.status))
      return { output: {} }
    await req.payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: { status: 'sending', attempts: Number(delivery.attempts || 0) + 1 },
      overrideAccess: true,
    })
    const result = await developmentEmailAdapter.send(
      delivery.message as any,
      delivery.recipientEmail,
    )
    await req.payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: {
        status: 'sent',
        provider: 'development-capture',
        providerMessageId: result.providerMessageId,
        outcome: { capturedAt: new Date().toISOString() },
      },
      overrideAccess: true,
    })
    return { output: {} }
  },
} as unknown as TaskConfig
export const audienceTasks = [emailDeliveryTask]
