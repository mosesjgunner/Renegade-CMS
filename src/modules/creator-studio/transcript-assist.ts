import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Payload, TaskConfig } from 'payload'
import { z } from 'zod'
import { readBoundedJson } from '../core/external-boundary'
import { transcriptChecksum } from '../media/contracts'
import { withUploadLock } from '../media/upload-staging'
import { MediaWorkflowError } from '../media/workflow'
import { revisionSegments } from '../podcast-studio/intelligence/service'
import {
  editAccessOptions,
  editHash,
  editNotFound,
  ownedEditSource,
  requireEdit,
} from './media-edit-projects'
import { mediaEditQueue } from './media-edit-recipe'
import { relationId, type SubmissionActor } from './submission-targets'

const slug = 'creator-transcript-assist'
const limit = 120_000
const jobInput = z.object({
  siteId: z.string().uuid(),
  memberId: z.string().uuid(),
  media: z.string().uuid(),
  revision: z.string().uuid(),
  operation: z.enum(['translate-subtitles', 'suggest-clips']),
  language: z
    .string()
    .regex(/^[a-zA-Z0-9-]{2,35}$/)
    .optional(),
  adapter: z.enum(['local-command', 'byo-http']),
})
type Assist = z.infer<typeof jobInput>

const adapter = () =>
  process.env.CREATOR_TRANSCRIPT_ASSIST_COMMAND
    ? 'local-command'
    : process.env.CREATOR_TRANSCRIPT_ASSIST_ENDPOINT
      ? 'byo-http'
      : undefined

async function loadRevision(payload: Payload, input: Assist) {
  const revision = await payload.findByID({
    collection: 'transcript-revisions',
    id: input.revision,
    ...editAccessOptions,
    disableErrors: true,
  })
  if (!revision || relationId(revision.media) !== input.media || revision.reviewState === 'draft')
    throw editNotFound()
  const segments = revisionSegments(revision)
  if (!segments.length || segments.length > 150 || JSON.stringify(segments).length > limit)
    throw new MediaWorkflowError('Select a reviewed transcript with up to 150 cues.')
  return { revision, segments }
}

export async function queueTranscriptAssist(
  payload: Payload,
  actor: SubmissionActor,
  media: string,
  data: Record<string, unknown>,
) {
  const configured = adapter()
  if (!configured) throw new MediaWorkflowError('Transcript assist is unavailable.', 503)
  const checked = jobInput.safeParse({
    ...actor,
    media,
    revision: data.revision,
    operation: data.action,
    language: data.language,
    adapter: configured,
  })
  if (
    data.optIn !== true ||
    !checked.success ||
    (checked.data.operation === 'translate-subtitles' && !checked.data.language)
  )
    throw new MediaWorkflowError(
      'Select a reviewed revision, target language for subtitles, and opt in.',
    )
  const input = checked.data
  await loadRevision(payload, input)
  const idempotencyKey = slug + ':' + editHash(input)
  return withUploadLock(payload, idempotencyKey, async () => {
    const { docs } = await payload.find({
      collection: 'media-jobs',
      ...editAccessOptions,
      limit: 1,
      where: { idempotencyKey: { equals: idempotencyKey } },
    })
    const prior = docs[0]
    if (prior?.status === 'completed' || prior?.status === 'running') return { id: prior.id }
    const row =
      prior ??
      (await payload.create({
        collection: 'media-jobs',
        ...editAccessOptions,
        data: {
          title: input.operation,
          kind: 'transcribe',
          status: 'queued',
          idempotencyKey,
          input: { ...input, purpose: slug },
        },
      }))
    const { docs: active } = await payload.find({
      collection: 'payload-jobs',
      ...editAccessOptions,
      limit: 1,
      where: {
        and: [
          { taskSlug: { equals: slug } },
          { 'input.assistId': { equals: row.id } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
    })
    if (!active.length)
      await payload.jobs.queue({
        task: slug,
        queue: mediaEditQueue,
        input: { assistId: row.id },
      } as never)
    return { id: row.id }
  })
}

async function runAdapter(input: Assist, segments: ReturnType<typeof revisionSegments>) {
  if (adapter() !== input.adapter)
    throw new Error('Transcript adapter changed. Queue a new request.')
  const request = JSON.stringify({ operation: input.operation, language: input.language, segments })
  if (input.adapter === 'local-command') {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'creator-transcript-'))
    try {
      const filename = path.join(directory, 'input.json')
      await writeFile(filename, request, { mode: 0o600 })
      const { stdout } = await promisify(execFile)(
        process.env.CREATOR_TRANSCRIPT_ASSIST_COMMAND!,
        [filename],
        { timeout: 120_000, maxBuffer: limit },
      )
      return JSON.parse(stdout) as unknown
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  const response = await fetch(process.env.CREATOR_TRANSCRIPT_ASSIST_ENDPOINT!, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
    headers: {
      'content-type': 'application/json',
      ...(process.env.CREATOR_TRANSCRIPT_ASSIST_KEY
        ? { authorization: 'Bearer ' + process.env.CREATOR_TRANSCRIPT_ASSIST_KEY }
        : {}),
    },
    body: request,
  })
  if (!response.ok) throw new Error('Transcript provider rejected the request.')
  return readBoundedJson(response, limit)
}

export const creatorTranscriptAssistTask: TaskConfig<{
  input: { assistId: string }
  output: { completed: boolean }
}> = {
  slug,
  inputSchema: [{ name: 'assistId', type: 'text', required: true }],
  outputSchema: [{ name: 'completed', type: 'checkbox', required: true }],
  concurrency: ({ input }) => slug + ':' + input.assistId,
  async handler({ input: { assistId }, req: { payload } }) {
    const row = await payload.findByID({
      collection: 'media-jobs',
      id: assistId,
      ...editAccessOptions,
    })
    const input = jobInput.parse(row.input)
    if (row.status === 'completed') return { output: { completed: true } }
    try {
      await requireEdit(payload, input)
      await ownedEditSource(payload, input, input.media)
      const { revision, segments } = await loadRevision(payload, input)
      const raw = await runAdapter(input, segments)
      const provenance = {
        adapter: input.adapter,
        sourceRevision: revision.id,
        operation: input.operation,
      }
      let result: object
      if (input.operation === 'translate-subtitles') {
        const { texts } = z
          .object({ texts: z.array(z.string().trim().min(1).max(300)).length(segments.length) })
          .parse(raw)
        const translated = segments.map(({ id, startSeconds, endSeconds }, i) => ({
          id,
          startSeconds,
          endSeconds,
          text: texts[i],
        }))
        const checksum = transcriptChecksum(translated)
        const transcriptRevisionId = await withUploadLock(
          payload,
          'creator-transcript:' + input.media,
          async () => {
            const title =
              'Subtitle translation draft (' + input.language + ', ' + input.adapter + ')'
            const { docs } = await payload.find({
              collection: 'transcript-revisions',
              ...editAccessOptions,
              where: { media: { equals: input.media } },
              sort: '-version',
              limit: 100,
            })
            const existing = docs.find(
              (doc) =>
                doc.title === title &&
                doc.checksum === checksum &&
                relationId(doc.sourceRevision) === revision.id,
            )
            if (existing) return existing.id
            const saved = await payload.create({
              collection: 'transcript-revisions',
              ...editAccessOptions,
              data: {
                title,
                media: input.media,
                sourceRevision: revision.id,
                source: 'provider',
                reviewState: 'draft',
                version: (docs[0]?.version ?? 0) + 1,
                segments: translated,
                checksum,
                immutable: true,
              },
            })
            return saved.id
          },
        )
        result = { transcriptRevisionId, language: input.language }
      } else {
        const { clips } = z
          .object({
            clips: z
              .array(
                z
                  .object({
                    start: z.number().min(segments[0].startSeconds),
                    end: z.number().max(segments[segments.length - 1].endSeconds),
                    reason: z.string().trim().min(1).max(300),
                  })
                  .refine(({ start, end }) => end > start),
              )
              .max(12),
          })
          .parse(raw)
        result = { clips }
      }
      await payload.update({
        collection: 'media-jobs',
        id: assistId,
        ...editAccessOptions,
        data: {
          status: 'completed',
          progress: 100,
          failure: null,
          output: { ...provenance, ...result },
        },
      })
      return { output: { completed: true } }
    } catch {
      await payload.update({
        collection: 'media-jobs',
        id: assistId,
        ...editAccessOptions,
        data: {
          status: 'failed',
          failure: {
            message: 'Transcript assist failed. Check the worker configuration and retry.',
          },
        },
      })
      return { output: { completed: false } }
    }
  },
}
