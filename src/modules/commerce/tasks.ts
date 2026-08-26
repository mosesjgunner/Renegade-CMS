/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'

/** Moves only stale open sessions; payment status remains webhook-authoritative. */
export const abandonCheckoutTask = {
  slug: 'commerce-abandon-checkouts',
  label: 'Expire abandoned checkout sessions',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: () => 'commerce.abandon-checkouts',
  schedule: [{ cron: '0 */15 * * * *', queue: 'operations' }],
  handler: async ({ req }: { req: any }) => {
    const stale = await req.payload.find({
      collection: 'checkout-sessions',
      where: {
        and: [
          { state: { in: ['open', 'pending'] } },
          { expiresAt: { less_than_equal: new Date().toISOString() } },
        ],
      },
      limit: 100,
      overrideAccess: true,
    })
    for (const session of stale.docs)
      await req.payload.update({
        collection: 'checkout-sessions',
        id: session.id,
        data: { state: 'abandoned' },
        overrideAccess: true,
      })
    return { output: {} }
  },
} as unknown as TaskConfig
export const commerceTasks = [abandonCheckoutTask]
