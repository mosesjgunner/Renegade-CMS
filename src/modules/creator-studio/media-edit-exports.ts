import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import type { Payload, TaskConfig, Where } from 'payload'
import type { MediaEditExport } from '@/payload-types'
import { loadConfig, type AppConfig } from '../core/config'
import { mediaStorage } from '../media/storage'
import { withUploadLock } from '../media/upload-staging'
import { persistReviewedCreatorMedia } from '../media/workflow'
import { MediaWorkflowError } from '../media/workflow'
import { withExecutionLock } from '../operations/execution-lock'
import { relationId, uuid, type SubmissionActor } from './submission-targets'
import {
  editAccessOptions,
  editConflict,
  editHash,
  editSnapshot,
  editUsage,
  ownEditProject,
  ownedEditSource,
  requireEdit,
  type EditSnapshot,
} from './media-edit-projects'
import {
  mediaEditQueue,
  mediaEditTaskSlug,
  exportProfiles,
  timelineDuration,
  type ExportProfile,
} from './media-edit-recipe'
import { renderDeadlineMs, renderMediaEdit, renderRecipeVersion } from './media-edit-render'

const collection = 'media-edit-exports' as const
const workerLock = 'creator-media-export:engine'
const byOwner = (actor: SubmissionActor): Where[] => [
  { site: { equals: actor.siteId } },
  { owner: { equals: actor.memberId } },
]

function exportView(row: MediaEditExport) {
  return {
    id: row.id,
    revision: row.projectRevision,
    profile: row.profile as ExportProfile,
    state: row.state,
    video: relationId(row.video),
    thumbnail: relationId(row.thumbnail),
    report: row.report,
    error: row.error,
  }
}
export type EditExportView = ReturnType<typeof exportView>

export async function listEditExports(payload: Payload, actor: SubmissionActor, id: string) {
  await ownEditProject(payload, actor, id)
  const { docs } = await payload.find({
    collection,
    ...editAccessOptions,
    limit: 50,
    sort: '-createdAt',
    where: { project: { equals: id } },
  })
  return docs.map(exportView)
}

async function enqueue(payload: Payload, row: MediaEditExport) {
  const job = await payload.jobs.queue({
    task: mediaEditTaskSlug,
    queue: mediaEditQueue,
    input: { exportId: row.id },
  })
  return payload.update({
    collection,
    id: row.id,
    ...editAccessOptions,
    data: { state: 'queued', jobId: String(job.id), error: null },
  })
}

export async function queueEditExport(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  data: Record<string, unknown>,
) {
  const profile = exportProfiles.find((item) => item === data.profile)
  if (
    !profile ||
    (data.requestKey !== undefined &&
      (typeof data.requestKey !== 'string' || !uuid.test(data.requestKey)))
  )
    throw editConflict('Select a valid export profile.')
  return withUploadLock(payload, `creator-edits:${actor.siteId}:${actor.memberId}`, async () => {
    const { quota } = await requireEdit(payload, actor)
    const project = await ownEditProject(payload, actor, id)
    if (data.revision !== project.revision)
      throw editConflict('Save or reload the current version first.')
    const snapshot = editSnapshot(project)
    if (!snapshot.recipe.clips.length) throw editConflict('Add at least one clip before exporting.')
    const key = editHash([
      id,
      project.revision,
      snapshot.hash,
      profile,
      renderRecipeVersion,
      data.requestKey,
    ])
    const {
      docs: [existing],
    } = await payload.find({
      collection,
      ...editAccessOptions,
      where: { key: { equals: key } },
      limit: 1,
    })
    if (existing && !['failed', 'pending'].includes(existing.state)) return exportView(existing)
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const usage = await payload.find({
      collection,
      ...editAccessOptions,
      pagination: false,
      where: { and: [...byOwner(actor), { createdAt: { greater_than_equal: since } }] },
    })
    if (!quota.exportJobs || (!existing && usage.docs.length >= Math.min(quota.exportJobs, 100)))
      throw editConflict('The daily export quota has been reached.')
    if (
      usage.docs.filter(({ state }) => ['pending', 'queued', 'rendering'].includes(state)).length >=
        2 &&
      existing?.state !== 'pending'
    )
      throw editConflict('Wait for an active export to finish before starting another.')
    const duration = timelineDuration(snapshot.recipe)
    const minutes = usage.docs.reduce(
      (sum, row) =>
        row.id === existing?.id
          ? sum
          : sum + timelineDuration((row.snapshot as unknown as EditSnapshot).recipe) / 60,
      0,
    )
    if (!quota.processingMinutes || minutes + duration / 60 > quota.processingMinutes + 0.0001)
      throw editConflict('The daily processing quota has been reached.')
    const row =
      existing ??
      (await payload.create({
        collection,
        ...editAccessOptions,
        data: {
          site: actor.siteId,
          owner: actor.memberId,
          project: id,
          key,
          projectRevision: project.revision,
          profile,
          state: 'pending',
          snapshot,
        },
      }))
    return exportView(await enqueue(payload, row))
  })
}

async function materialize(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  snapshot: EditSnapshot,
  directory: string,
  signal: AbortSignal,
) {
  const files = new Map<string, { filename: string; mimeType: string }>()
  const storage = mediaStorage(config)
  for (const [index, expected] of snapshot.dependencies.entries()) {
    const { key, dependency } = await ownedEditSource(payload, actor, expected.id)
    if (editHash(dependency) !== editHash(expected))
      throw editConflict('A source has changed since this version was saved.')
    const stream = await storage.open(key, 0, expected.size - 1)
    if (!stream) throw editConflict('A source is missing from storage.')
    const filename = `source-${index}`
    const hash = createHash('sha256')
    let count = 0
    await pipeline(
      Readable.fromWeb(stream as NodeReadableStream<Uint8Array>),
      async function* (chunks) {
        for await (const chunk of chunks) {
          count += chunk.length
          if (count > expected.size) throw editConflict('Source bytes exceed the saved size.')
          hash.update(chunk)
          yield chunk
        }
      },
      createWriteStream(path.join(directory, filename), { mode: 0o600 }),
      { signal },
    )
    if (count !== expected.size || `sha256:${hash.digest('hex')}` !== expected.checksum)
      throw editConflict('Source integrity verification failed.')
    files.set(expected.id, { filename, mimeType: expected.mimeType })
  }
  return files
}

async function registerOutput(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  row: MediaEditExport,
  type: 'video' | 'thumbnail',
  file: { filename: string; size: number; checksum: string },
  report: Awaited<ReturnType<typeof renderMediaEdit>>['report'],
) {
  const video = type === 'video'
  const extension = video ? 'mp4' : 'jpg'
  const source = `creator-edit:${row.id}:${type}:${file.checksum}`
  const {
    docs: [existing],
  } = await payload.find({
    collection: 'media-assets',
    ...editAccessOptions,
    limit: 1,
    where: { and: [...byOwner(actor), { source: { equals: source } }] },
  })
  const asset =
    existing ??
    (await persistReviewedCreatorMedia(
      payload,
      config,
      {
        user: { member: actor.memberId },
        scope: { kind: 'site', siteId: actor.siteId },
        title: `${(row.snapshot as unknown as EditSnapshot).recipe.title} · ${row.profile} ${type}`,
        originalFilename: `${row.profile}-${type}.${extension}`,
      },
      file,
      {
        kind: video ? 'video' : 'image',
        mimeType: video ? 'video/mp4' : 'image/jpeg',
        extension,
        source,
        private: true,
        width: video ? report.width : report.thumbnailWidth,
        height: video ? report.height : report.thumbnailHeight,
        durationSeconds: video ? report.duration : undefined,
      },
    ))
  if (asset.rightsStatus !== 'pending')
    await payload.update({
      collection: 'media-assets',
      id: String(asset.id),
      ...editAccessOptions,
      data: { rightsStatus: 'pending' },
    })
  return String(asset.id)
}

async function renderExport(payload: Payload, config: AppConfig, id: string, jobId: string) {
  return withExecutionLock(payload, workerLock, async () => {
    const initial = await payload.findByID({
      collection,
      id,
      ...editAccessOptions,
      disableErrors: true,
    })
    if (!initial) return false
    const row = await withExecutionLock(
      payload,
      `creator-edits:${relationId(initial.site)}:${relationId(initial.owner)}`,
      async () => {
        const row = await payload.findByID({
          collection,
          id,
          ...editAccessOptions,
          disableErrors: true,
        })
        if (!row || row.jobId !== jobId || !['queued', 'rendering'].includes(row.state)) return null
        return payload.update({
          collection,
          id,
          ...editAccessOptions,
          data: { state: 'rendering' },
        })
      },
    )
    if (!row) return false
    const actor = { siteId: relationId(row.site), memberId: relationId(row.owner) }
    const project = relationId(row.project)
    const snapshot = row.snapshot as unknown as EditSnapshot
    const signal = AbortSignal.timeout(renderDeadlineMs)
    let directory: string | undefined
    try {
      await requireEdit(payload, actor)
      await ownEditProject(payload, actor, project)
      directory = await mkdtemp(path.join(os.tmpdir(), 'renegade-creator-edit-'))
      const sources = await materialize(payload, config, actor, snapshot, directory, signal)
      const result = await renderMediaEdit({
        directory,
        recipe: snapshot.recipe,
        sources,
        profile: row.profile as ExportProfile,
        signal,
      })
      signal.throwIfAborted()
      await requireEdit(payload, actor)
      for (const expected of snapshot.dependencies) {
        const source = await ownedEditSource(payload, actor, expected.id)
        if (editHash(source.dependency) !== editHash(expected))
          throw editConflict('A source changed during rendering.')
      }
      const video = await registerOutput(
        payload,
        config,
        actor,
        row,
        'video',
        result.video,
        result.report,
      )
      const thumbnail = await registerOutput(
        payload,
        config,
        actor,
        row,
        'thumbnail',
        result.thumbnail,
        result.report,
      )
      await editUsage(payload, actor, project, video, 'video', row.projectRevision)
      await editUsage(payload, actor, project, thumbnail, 'thumbnail', row.projectRevision)
      await payload.update({
        collection,
        id,
        ...editAccessOptions,
        data: {
          state: 'ready',
          video,
          thumbnail,
          error: null,
          report: {
            ...result.report,
            videoChecksum: result.video.checksum,
            thumbnailChecksum: result.thumbnail.checksum,
            dependencyHash: snapshot.hash,
          },
        },
      })
      return true
    } catch (error) {
      payload.logger.error({ err: error, event: 'creator.media_export_failed', exportId: id })
      const message = signal.aborted
        ? 'The export exceeded the worker time limit.'
        : error instanceof MediaWorkflowError
          ? error.message
          : 'Rendering or verification failed. Check the source ranges and retry.'
      await payload.update({
        collection,
        id,
        ...editAccessOptions,
        data: { state: 'failed', error: message },
      })
      return false
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true })
    }
  })
}

type EditExportTask = { input: { exportId: string }; output: { verified: boolean } }
export const creatorMediaExportTask: TaskConfig<EditExportTask> = {
  slug: mediaEditTaskSlug,
  label: 'Render and verify a Creator Studio media edit',
  inputSchema: [{ name: 'exportId', type: 'text', required: true }],
  outputSchema: [{ name: 'verified', type: 'checkbox', required: true }],
  concurrency: () => workerLock,
  handler: async ({ input, job, req }) => ({
    output: {
      verified: await renderExport(req.payload, loadConfig(), input.exportId, String(job.id)),
    },
  }),
}

export async function recoverCreatorMediaExports(payload: Payload) {
  const cutoff = new Date(Date.now() - renderDeadlineMs - 5 * 60_000).toISOString()
  const { docs } = await payload.find({
    collection,
    ...editAccessOptions,
    limit: 10,
    where: {
      and: [
        { state: { in: ['pending', 'queued', 'rendering'] } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  })
  if (!docs.length) return
  await withExecutionLock(payload, workerLock, async () => {
    for (const old of docs) {
      const row = await payload.findByID({
        collection,
        id: old.id,
        ...editAccessOptions,
        disableErrors: true,
      })
      if (
        !row ||
        !['pending', 'queued', 'rendering'].includes(row.state) ||
        row.updatedAt >= cutoff
      )
        continue
      const job = row.jobId
        ? await payload.findByID({
            collection: 'payload-jobs',
            id: row.jobId,
            ...editAccessOptions,
            disableErrors: true,
          })
        : null
      if (
        job?.taskSlug === mediaEditTaskSlug &&
        !job.hasError &&
        !job.completedAt &&
        !job.processing
      )
        continue
      if (job?.taskSlug === mediaEditTaskSlug && job.processing) {
        await payload.update({
          collection: 'payload-jobs',
          id: job.id,
          ...editAccessOptions,
          data: { processing: false, hasError: true },
        })
      }
      await payload.update({
        collection,
        id: row.id,
        ...editAccessOptions,
        data: { state: 'failed', error: 'The worker was interrupted. Retry this export.' },
      })
    }
  })
}
