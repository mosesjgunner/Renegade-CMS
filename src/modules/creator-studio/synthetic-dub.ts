import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Payload, TaskConfig } from 'payload'
import { z } from 'zod'
import { loadConfig } from '../core/config'
import { readBoundedUploadBody, withUploadLock } from '../media/upload-staging'
import { transcriptChecksum } from '../media/contracts'
import { inspectMedia, mediaStorage } from '../media/storage'
import { MediaWorkflowError } from '../media/workflow'
import { revisionSegments } from '../podcast-studio/intelligence/service'
import {
  editAccessOptions,
  editHash,
  editNotFound,
  editSnapshot,
  ownEditProject,
  ownedEditSource,
  requireEdit,
} from './media-edit-projects'
import { mediaEditQueue } from './media-edit-recipe'
import { relationId, uuid, type SubmissionActor } from './submission-targets'

const slug = 'creator-synthetic-dub'
const maxAudioBytes = 16 * 1024 * 1024
const denial = () =>
  new MediaWorkflowError(
    'Synthetic dubbing requires approved media rights and explicit permission for your verified voice, project, and transcript revision.',
    403,
  )
const scope = z.object({
  siteId: z.string().uuid(),
  memberId: z.string().uuid(),
  project: z.string().uuid(),
  media: z.string().uuid(),
  revision: z.string().uuid(),
  projectHash: z.string(),
  sourceChecksum: z.string(),
  revisionChecksum: z.string(),
  voice: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/),
  adapter: z.enum(['local-command', 'byo-http']),
  enrollment: z.string(),
  purpose: z.literal(slug),
})
type Scope = z.infer<typeof scope>

function configuredVoice(actor: SubmissionActor) {
  // Provisioned by the operator only after verifying enrollment with the speaker.
  const raw = process.env.CREATOR_DUB_VERIFIED_VOICES
  let voice: unknown
  try {
    voice = raw && JSON.parse(raw)[actor.siteId + ':' + actor.memberId]
  } catch {
    return null
  }
  const adapter = process.env.CREATOR_DUB_COMMAND
    ? 'local-command'
    : process.env.CREATOR_DUB_ENDPOINT
      ? 'byo-http'
      : null
  const destination = process.env.CREATOR_DUB_COMMAND || process.env.CREATOR_DUB_ENDPOINT
  if (!adapter || !destination || typeof voice !== 'string') return null
  const enrollment = createHash('sha256')
    .update(
      JSON.stringify([
        adapter,
        destination,
        voice,
        adapter === 'byo-http' ? process.env.CREATOR_DUB_KEY : undefined,
      ]),
    )
    .digest('hex')
  return { voice, adapter, enrollment }
}

async function verifiedInputs(payload: Payload, input: Scope) {
  const voice = configuredVoice(input)
  if (!voice || voice.voice !== input.voice || voice.enrollment !== input.enrollment) throw denial()
  const project = editSnapshot(await ownEditProject(payload, input, input.project))
  const { asset } = await ownedEditSource(payload, input, input.media)
  if (
    project.hash !== input.projectHash ||
    project.recipe.clips.length !== 1 ||
    project.recipe.clips[0].asset !== input.media ||
    asset.rightsStatus !== 'approved' ||
    asset.checksum !== input.sourceChecksum
  )
    throw denial()
  const revision = await payload.findByID({
    collection: 'transcript-revisions',
    id: input.revision,
    ...editAccessOptions,
    disableErrors: true,
  })
  if (
    !revision ||
    relationId(revision.media) !== input.media ||
    revision.reviewState !== 'reviewed' ||
    !revision.immutable
  )
    throw denial()
  const segments = revisionSegments(revision)
  if (transcriptChecksum(segments) !== input.revisionChecksum) throw denial()
  const clip = project.recipe.clips[0]
  const cues = segments
    .filter(({ startSeconds, endSeconds }) => startSeconds >= clip.in && endSeconds <= clip.out)
    .map(({ startSeconds, endSeconds, text }) => ({
      start: startSeconds - clip.in,
      end: endSeconds - clip.in,
      text,
    }))
  if (!cues.length || cues.length > 150 || JSON.stringify(cues).length > 100_000) throw denial()
  return { cues, duration: clip.out - clip.in }
}

const consentKey = (input: Scope) => slug + ':' + editHash(input)
const objectKey = (input: Scope, id: string) =>
  ['creator-dubs', input.siteId, input.memberId, id + '.wav'].join('/')

async function findConsent(payload: Payload, input: Scope) {
  const { docs } = await payload.find({
    collection: 'media-jobs',
    ...editAccessOptions,
    limit: 1,
    where: { idempotencyKey: { equals: consentKey(input) } },
  })
  return docs[0]
}

export async function voiceOptions(payload: Payload, actor: SubmissionActor, media: string) {
  const voice = configuredVoice(actor)
  const { docs } = await payload.find({
    collection: 'media-jobs',
    ...editAccessOptions,
    limit: 12,
    sort: '-createdAt',
    where: {
      and: [
        { 'input.purpose': { equals: slug } },
        { 'input.media': { equals: media } },
        { 'input.siteId': { equals: actor.siteId } },
        { 'input.memberId': { equals: actor.memberId } },
      ],
    },
  })
  return {
    voice: voice?.voice ?? null,
    dubs: docs.flatMap((doc) => {
      const checked = scope.safeParse(doc.input)
      if (!checked.success) return []
      const output = dubOutput.safeParse(doc.output)
      return [
        {
          id: doc.id,
          revision: checked.data.revision,
          project: checked.data.project,
          status: doc.status,
          reviewed: output.success && output.data.reviewed,
        },
      ]
    }),
  }
}

const dubOutput = z.object({
  contentHash: z.string(),
  duration: z.number(),
  reviewed: z.boolean(),
  provenance: z.object({
    type: z.literal('synthetic-dub'),
    voice: z.string(),
    adapter: z.string(),
    revision: z.string(),
    project: z.string(),
  }),
})

async function authorizedRow(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw editNotFound()
  const row = await payload.findByID({
    collection: 'media-jobs',
    id,
    ...editAccessOptions,
    disableErrors: true,
  })
  const result = scope.safeParse(row?.input)
  if (
    !row ||
    !result.success ||
    result.data.siteId !== actor.siteId ||
    result.data.memberId !== actor.memberId
  )
    throw editNotFound()
  return { row, input: result.data }
}

export async function dubAction(
  payload: Payload,
  actor: SubmissionActor,
  media: string,
  data: Record<string, unknown>,
) {
  if (data.action === 'revoke-dub' || data.action === 'review-dub') {
    const { input } = await authorizedRow(payload, actor, String(data.dub ?? ''))
    if (input.media !== media) throw editNotFound()
    return withUploadLock(payload, consentKey(input), async () => {
      const row = await findConsent(payload, input)
      if (!row) throw editNotFound()
      if (data.action === 'revoke-dub') {
        await payload.update({
          collection: 'media-jobs',
          id: row.id,
          ...editAccessOptions,
          data: { status: 'cancelled', output: null },
        })
        await mediaStorage(loadConfig()).remove(objectKey(input, row.id))
        return { id: row.id, status: 'cancelled' }
      }
      const output = dubOutput.safeParse(row.output)
      if (row.status !== 'completed' || !output.success || data.reviewed !== true) throw denial()
      await verifiedInputs(payload, input)
      await payload.update({
        collection: 'media-jobs',
        id: row.id,
        ...editAccessOptions,
        data: { output: { ...output.data, reviewed: true } },
      })
      return { id: row.id, status: 'reviewed' }
    })
  }
  if (typeof data.project !== 'string' || !uuid.test(data.project)) throw denial()
  const project = editSnapshot(await ownEditProject(payload, actor, data.project))
  if (typeof data.revision !== 'string' || !uuid.test(data.revision)) throw denial()
  const revision = await payload.findByID({
    collection: 'transcript-revisions',
    id: data.revision,
    ...editAccessOptions,
    disableErrors: true,
  })
  if (!revision) throw denial()
  const { asset } = await ownedEditSource(payload, actor, media)
  const currentVoice = configuredVoice(actor)
  const checked = scope.safeParse({
    ...actor,
    ...currentVoice,
    project: data.project,
    media,
    revision: data.revision,
    projectHash: project.hash,
    sourceChecksum: asset.checksum,
    revisionChecksum: transcriptChecksum(revisionSegments(revision)),
    purpose: slug,
  })
  if (!checked.success || data.voice !== checked.data.voice) throw denial()
  const input = checked.data
  await verifiedInputs(payload, input)
  return withUploadLock(payload, consentKey(input), async () => {
    const row = await findConsent(payload, input)
    if (data.action === 'grant-dub-consent') {
      if (data.speakerPermission !== true || data.sessionVoiceConsent !== true) throw denial()
      if (row && row.status !== 'cancelled') return { id: row.id, status: row.status }
      // Revoked grants are terminal. A new edit session is required for new consent.
      if (row) throw denial()
      const grant = await payload.create({
        collection: 'media-jobs',
        ...editAccessOptions,
        data: {
          title: 'Authorized synthetic dub',
          kind: 'tts',
          status: 'queued',
          idempotencyKey: consentKey(input),
          input: {
            ...input,
            speakerPermission: true,
            sessionVoiceConsent: true,
            grantedAt: new Date().toISOString(),
          },
        },
      })
      return { id: grant.id, status: 'consented' }
    }
    if (!row || row.status === 'cancelled') throw denial()
    if (row.status === 'completed') return { id: row.id, status: row.status }
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      ...editAccessOptions,
      limit: 1,
      where: {
        and: [
          { taskSlug: { equals: slug } },
          { 'input.dubId': { equals: row.id } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
    })
    if (!docs.length)
      await payload.jobs.queue({
        task: slug,
        queue: mediaEditQueue,
        input: { dubId: row.id },
      } as never)
    return { id: row.id, status: 'queued' }
  })
}

async function synthesize(input: Scope, parts: Awaited<ReturnType<typeof verifiedInputs>>) {
  const body = JSON.stringify({ ...parts, voice: input.voice })
  if (input.adapter === 'byo-http') {
    const { safeFetch } = await import('../core/external-boundary')
    const response = await safeFetch(
      process.env.CREATOR_DUB_ENDPOINT!,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.CREATOR_DUB_KEY
            ? { authorization: 'Bearer ' + process.env.CREATOR_DUB_KEY }
            : {}),
        },
        body,
      },
      {
        allowedOrigins: process.env.CREATOR_DUB_ALLOWED_ORIGINS ?? '',
        maxRedirects: 0,
        maxBytes: maxAudioBytes,
        timeoutMs: 180_000,
      },
    )
    if (!response.ok || !response.body) throw new Error('Dub provider failed.')
    return readBoundedUploadBody(
      new Request('http://local.invalid/', {
        method: 'POST',
        body: response.body,
        duplex: 'half',
      } as RequestInit),
      maxAudioBytes,
    )
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'creator-dub-'))
  try {
    const source = path.join(directory, 'request.json')
    const output = path.join(directory, 'dub.wav')
    await writeFile(source, body, { mode: 0o600 })
    await promisify(execFile)(process.env.CREATOR_DUB_COMMAND!, [source, output], {
      timeout: 180_000,
      maxBuffer: 64 * 1024,
    })
    const { stat } = await import('node:fs/promises')
    if ((await stat(output)).size > maxAudioBytes)
      throw new Error('Dub audio exceeds the size limit.')
    return await readFile(output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function labelPcmWave(raw: Buffer, provenance: string) {
  if (
    raw.length < 44 ||
    raw.toString('ascii', 0, 4) !== 'RIFF' ||
    raw.toString('ascii', 8, 12) !== 'WAVE' ||
    raw.readUInt32LE(4) !== raw.length - 8
  )
    throw new Error('The dub provider must return PCM WAV.')
  let format: Buffer | undefined
  let samples: Buffer | undefined
  for (let offset = 12; offset + 8 <= raw.length; ) {
    const type = raw.toString('ascii', offset, offset + 4)
    const size = raw.readUInt32LE(offset + 4)
    const end = offset + 8 + size
    if (end > raw.length) throw new Error('The dub WAV is truncated.')
    if (type === 'fmt ') format = raw.subarray(offset + 8, end)
    if (type === 'data') samples = raw.subarray(offset + 8, end)
    offset = end + (size % 2)
  }
  if (
    !format ||
    format.length < 16 ||
    !samples?.length ||
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(14) !== 16
  )
    throw new Error('The dub provider must return 16-bit PCM WAV.')
  const channels = format.readUInt16LE(2)
  const rate = format.readUInt32LE(4)
  if (
    channels < 1 ||
    channels > 2 ||
    rate < 8000 ||
    rate > 48000 ||
    samples.length % (channels * 2)
  )
    throw new Error('Unsupported WAV layout.')
  const comment = Buffer.from('Renegade Creator Studio synthetic dub ' + provenance + '\0')
  const chunk = (type: string, content: Buffer) => {
    const header = Buffer.alloc(8)
    header.write(type)
    header.writeUInt32LE(content.length, 4)
    return Buffer.concat([header, content, Buffer.alloc(content.length % 2)])
  }
  const header = Buffer.alloc(12)
  header.write('RIFF')
  header.write('WAVE', 8)
  const pcmFormat = Buffer.from(format.subarray(0, 16))
  pcmFormat.writeUInt32LE(rate * channels * 2, 8)
  pcmFormat.writeUInt16LE(channels * 2, 12)
  const bytes = Buffer.concat([
    header,
    chunk('fmt ', pcmFormat),
    chunk('LIST', Buffer.concat([Buffer.from('INFO'), chunk('ICMT', comment)])),
    chunk('data', samples),
  ])
  if (bytes.length > maxAudioBytes) throw new Error('Labeled dub exceeds the size limit.')
  bytes.writeUInt32LE(bytes.length - 8, 4)
  return { bytes, duration: samples.length / (rate * channels * 2) }
}

export const creatorSyntheticDubTask: TaskConfig<{
  input: { dubId: string }
  output: { completed: boolean }
}> = {
  slug,
  inputSchema: [{ name: 'dubId', type: 'text', required: true }],
  outputSchema: [{ name: 'completed', type: 'checkbox', required: true }],
  concurrency: ({ input }) => slug + ':' + input.dubId,
  async handler({ input: { dubId }, req: { payload } }) {
    const row = await payload.findByID({
      collection: 'media-jobs',
      id: dubId,
      ...editAccessOptions,
    })
    const input = scope.parse(row.input)
    if (row.status === 'completed' || row.status === 'cancelled')
      return { output: { completed: row.status === 'completed' } }
    try {
      await requireEdit(payload, input)
      const parts = await verifiedInputs(payload, input)
      const grant = await findConsent(payload, input)
      const consent = grant?.input as {
        speakerPermission?: boolean
        sessionVoiceConsent?: boolean
      } | null
      if (
        !grant ||
        grant.id !== dubId ||
        grant.status === 'cancelled' ||
        consent?.speakerPermission !== true ||
        consent?.sessionVoiceConsent !== true
      )
        throw denial()
      const provenance = {
        type: 'synthetic-dub' as const,
        voice: input.voice,
        adapter: input.adapter,
        revision: input.revision,
        project: input.project,
      }
      const raw = await synthesize(input, parts)
      const { bytes, duration } = labelPcmWave(raw, JSON.stringify(provenance))
      const media = inspectMedia(bytes)
      if (Math.abs(duration - parts.duration) > 0.1)
        throw new Error('The dub must be a timeline-length WAV.')
      const completed = await withUploadLock(payload, consentKey(input), async () => {
        const current = await findConsent(payload, input)
        if (current?.status === 'cancelled') return false
        await verifiedInputs(payload, input)
        await mediaStorage(loadConfig()).put(objectKey(input, dubId), bytes, 'audio/wav')
        await payload.update({
          collection: 'media-jobs',
          id: dubId,
          ...editAccessOptions,
          data: {
            status: 'completed',
            progress: 100,
            failure: null,
            output: {
              contentHash: media.sha256,
              duration,
              reviewed: false,
              provenance,
            },
          },
        })
        return true
      })
      return { output: { completed } }
    } catch {
      await withUploadLock(payload, consentKey(input), async () => {
        if ((await findConsent(payload, input))?.status !== 'cancelled')
          await payload.update({
            collection: 'media-jobs',
            id: dubId,
            ...editAccessOptions,
            data: {
              status: 'failed',
              failure: {
                message: 'Synthetic dub failed. Check rights, consent, and the worker adapter.',
              },
            },
          })
      })
      return { output: { completed: false } }
    }
  },
}

export async function dubAudio(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  download: boolean,
) {
  const { row, input } = await authorizedRow(payload, actor, id)
  const checked = dubOutput.safeParse(row.output)
  if (row.status !== 'completed' || !checked.success || (download && !checked.data.reviewed))
    throw editNotFound()
  await verifiedInputs(payload, input)
  const bytes = await mediaStorage(loadConfig()).get(objectKey(input, id))
  if (
    !bytes ||
    bytes.byteLength > maxAudioBytes ||
    'sha256:' + createHash('sha256').update(bytes).digest('hex') !== checked.data.contentHash
  )
    throw editNotFound()
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-length': String(bytes.byteLength),
      'cache-control': 'private, no-store',
      'content-type': 'audio/wav',
      'x-content-type-options': 'nosniff',
      'x-creator-audio-provenance': JSON.stringify(checked.data.provenance),
      ...(download
        ? { 'content-disposition': 'attachment; filename="reviewed-synthetic-dub.wav"' }
        : {}),
    },
  })
}
