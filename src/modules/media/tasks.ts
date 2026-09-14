import type { TaskConfig } from 'payload'

import { loadConfig } from '../core/config'
import { processAssetVariants } from './variants'
import { createPublicMediaIncidents, reconcileMediaUsages } from './workflow'
import { processVideoAsset } from './video-workflow'

type MediaTask = {
  input: {
    mediaJobId?: string
    mediaAssetId?: string
    idempotencyKey: string
    recipeKeys?: string[]
  }
  output: { mediaJobId?: string; mediaAssetId?: string; completed: boolean; count?: number }
}
type ReconciliationTask = {
  input: { siteId: string }
  output: { created: number; updated: number; removed: number; incidents: number }
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
  {
    slug: 'video-process',
    label: 'Process native video',
    inputSchema: [
      { name: 'videoAssetId', type: 'text', required: true },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'count', type: 'number' },
    ],
    retries: { attempts: 4, backoff: { delay: 10_000, type: 'exponential' } },
    concurrency: () => 'media.video-process:global',
    handler: async ({
      input,
      req,
    }: {
      input: { videoAssetId: string }
      req: { payload: import('payload').Payload }
    }) => ({ output: await processVideoAsset(req.payload, loadConfig(), input.videoAssetId) }),
  } as unknown as TaskConfig<MediaTask>,
  {
    slug: 'media-usage-reconcile',
    label: 'Reconcile media usage graph',
    inputSchema: [{ name: 'siteId', type: 'text', required: true }],
    outputSchema: [
      { name: 'created', type: 'number', required: true },
      { name: 'updated', type: 'number', required: true },
      { name: 'removed', type: 'number', required: true },
      { name: 'incidents', type: 'number', required: true },
    ],
    retries: { attempts: 3, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { siteId: string } }) =>
      `media.usage-reconcile:${input.siteId}`,
    handler: async ({
      input,
      req,
    }: {
      input: { siteId: string }
      req: { payload: import('payload').Payload }
    }) => {
      const reconciliation = await reconcileMediaUsages(req.payload, input.siteId)
      const incidents = await createPublicMediaIncidents(req.payload, input.siteId)
      if (reconciliation.failures.length)
        throw new Error(
          `Usage reconciliation left ${reconciliation.failures.length} rows unresolved.`,
        )
      return {
        output: {
          created: reconciliation.created,
          updated: reconciliation.updated,
          removed: reconciliation.removed,
          incidents: incidents.created,
        },
      }
    },
  } as TaskConfig<ReconciliationTask>,
  {
    slug: 'audio-recipe-task',
    label: 'Process audio recipe and loudness',
    inputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'recipeKey', type: 'text' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'loudness', type: 'json' },
    ],
    retries: { attempts: 3, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { mediaAssetId: string } }) =>
      `media.audio-recipe:${input.mediaAssetId}`,
    handler: async ({
      input,
      req,
    }: {
      input: { mediaAssetId: string; recipeKey?: string; idempotencyKey: string }
      req: { payload: import('payload').Payload }
    }) => {
      const config = loadConfig()
      const { processAudioRecipe } = await import('./audio')
      const metadata = await processAudioRecipe(
        req.payload,
        config,
        input.mediaAssetId,
        input.recipeKey || 'podcast-standard-lufs16',
      )
      return {
        output: {
          mediaAssetId: input.mediaAssetId,
          completed: true,
          loudness: metadata.loudness,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
]
