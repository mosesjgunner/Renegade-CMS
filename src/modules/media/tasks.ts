import type { TaskConfig } from 'payload'

import { loadConfig } from '../core/config'
import { processAssetVariants } from './variants'

type MediaTask = {
  input: {
    mediaJobId?: string
    mediaAssetId?: string
    idempotencyKey: string
    recipeKeys?: string[]
  }
  output: { mediaJobId?: string; mediaAssetId?: string; completed: boolean; count?: number }
}

const task = (slug: string, label: string): TaskConfig<MediaTask> => ({
  slug,
  label,
  inputSchema: [
    { name: 'mediaJobId', type: 'text' },
    { name: 'mediaAssetId', type: 'text' },
    { name: 'idempotencyKey', type: 'text', required: true },
    { name: 'recipeKeys', type: 'json' },
  ],
  outputSchema: [
    { name: 'mediaJobId', type: 'text' },
    { name: 'mediaAssetId', type: 'text' },
    { name: 'completed', type: 'checkbox', required: true },
    { name: 'count', type: 'number' },
  ],
  // Sharp is CPU/memory intensive. Payload's per-asset concurrency key and
  // exponential retry prevent duplicate decodes and a transient object-store
  // failure from becoming a web-request failure.
  retries: { attempts: 4, backoff: { delay: 1_000, type: 'exponential' } },
  concurrency: ({ input }) =>
    `media.${slug}:${String(input.mediaAssetId || input.idempotencyKey || 'global')}`,
  handler: async ({ input, req }) => {
    // 1. Check job cancellation if mediaJobId is provided
    if (input.mediaJobId) {
      const job = await req.payload
        .findByID({
          collection: 'media-jobs' as never,
          id: input.mediaJobId,
          depth: 0,
        })
        .catch(() => null)

      if (!job || (job as { status?: string }).status === 'cancelled') {
        return {
          output: {
            mediaJobId: input.mediaJobId,
            mediaAssetId: input.mediaAssetId,
            completed: false,
          },
        }
      }

      await req.payload
        .update({
          collection: 'media-jobs' as never,
          id: input.mediaJobId,
          data: { status: 'running', progress: 20 } as never,
        })
        .catch(() => undefined)
    }

    // 2. Execute variant generation if mediaAssetId is provided
    let count = 0
    try {
      if (input.mediaAssetId) {
        // Check cancellation on deletion
        const asset = await req.payload
          .findByID({
            collection: 'media-assets',
            id: input.mediaAssetId,
            depth: 0,
          })
          .catch(() => null)

        if (!asset || (asset as { retentionMode?: string }).retentionMode === 'tombstone') {
          return {
            output: {
              mediaJobId: input.mediaJobId,
              mediaAssetId: input.mediaAssetId,
              completed: false,
            },
          }
        }

        const config = loadConfig()
        const results = await processAssetVariants(req.payload, config, input.mediaAssetId, {
          recipeKeys: input.recipeKeys,
        })
        count = results.length
      }

      // 3. Mark media-jobs completed if present
      if (input.mediaJobId) {
        await req.payload
          .update({
            collection: 'media-jobs' as never,
            id: input.mediaJobId,
            data: { status: 'completed', progress: 100, output: { variantCount: count } } as never,
          })
          .catch(() => undefined)
      }

      return {
        output: {
          mediaJobId: input.mediaJobId,
          mediaAssetId: input.mediaAssetId,
          completed: true,
          count,
        },
      }
    } catch (error) {
      if (input.mediaJobId) {
        await req.payload
          .update({
            collection: 'media-jobs' as never,
            id: input.mediaJobId,
            data: {
              status: 'retrying',
              failure: {
                message:
                  error instanceof Error
                    ? error.message.slice(0, 500)
                    : 'Variant processing failed.',
              },
            } as never,
          })
          .catch(() => undefined)
      }
      throw error
    }
  },
})

export const mediaTasks = [
  task('media-import', 'Media import'),
  task('media-render', 'Media rendering'),
  task('media-variant-generate', 'Generate media variants'),
  task('media-transcribe', 'Media transcription'),
  task('media-tts', 'Text-to-speech generation'),
]
