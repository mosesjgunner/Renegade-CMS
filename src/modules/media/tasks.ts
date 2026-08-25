import type { TaskConfig } from 'payload'

type MediaTask = {
  input: { mediaJobId: string; idempotencyKey: string }
  output: { mediaJobId: string; completed: boolean }
}

const task = (slug: string, label: string): TaskConfig<MediaTask> => ({
  slug,
  label,
  inputSchema: [
    { name: 'mediaJobId', type: 'text', required: true },
    { name: 'idempotencyKey', type: 'text', required: true },
  ],
  outputSchema: [
    { name: 'mediaJobId', type: 'text', required: true },
    { name: 'completed', type: 'checkbox', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: ({ input }) => `media.${slug}:${String(input.idempotencyKey)}`,
  handler: async ({ input, req }) => {
    // Rendering/import adapters run out-of-request and must check cancellation before bytes are committed.
    const job = await req.payload.findByID({
      collection: 'media-jobs' as never,
      id: input.mediaJobId,
      depth: 0,
    })
    if ((job as { status?: string }).status === 'cancelled')
      return { output: { mediaJobId: input.mediaJobId, completed: false } }
    await req.payload.update({
      collection: 'media-jobs' as never,
      id: input.mediaJobId,
      data: { status: 'completed', progress: 100 } as never,
    })
    return { output: { mediaJobId: input.mediaJobId, completed: true } }
  },
})

export const mediaTasks = [
  task('media-import', 'Media import'),
  task('media-render', 'Media rendering'),
  task('media-transcribe', 'Media transcription'),
  task('media-tts', 'Text-to-speech generation'),
]
