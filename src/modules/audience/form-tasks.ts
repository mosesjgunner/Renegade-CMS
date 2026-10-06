import type { TaskConfig } from 'payload'
import { executeIntakeActions } from './form-runtime'

export const formIntakeTask = {
  slug: 'audience-form-intake',
  label: 'Resume form intake actions',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: () => 'audience.form-intake',
  schedule: [{ cron: '*/30 * * * * *', queue: 'operations' }],
  handler: async ({ req }: { req: { payload: import('payload').Payload } }) => {
    if (!req.payload.collections['form-submissions']) return { output: {} }
    const due = await req.payload.find({
      collection: 'form-submissions' as never,
      where: { status: { equals: 'received' } },
      limit: 100,
      sort: 'submittedAt',
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const submission of due.docs as unknown as Record<string, unknown>[]) {
      try {
        const form = await req.payload.findByID({
          collection: 'form-definitions' as never,
          id: String(submission.form),
          depth: 0,
          overrideAccess: true,
        } as never)
        await executeIntakeActions(req.payload, {
          submission,
          form: form as unknown as Record<string, unknown>,
          schema: {},
        })
      } catch {
        await req.payload.update({
          collection: 'form-submissions' as never,
          id: String(submission.id),
          data: {
            status: 'held',
            reviewNotes:
              'Intake could not resume: the saved form or association is unavailable. Review before recovery.',
          } as never,
          overrideAccess: true,
        })
      }
    }
    return { output: {} }
  },
} as unknown as TaskConfig
