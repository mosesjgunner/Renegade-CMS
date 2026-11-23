import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { MediaAsset, MediaEditProject } from '@/payload-types'
import { recordMediaUsage } from '../media/usage'
import { MediaWorkflowError } from '../media/workflow'
import { withUploadLock } from '../media/upload-staging'
import { stableStringify } from '../starters/provenance'
import { authorizeCreator } from './policy'
import { relationId, uuid, type SubmissionActor } from './submission-targets'
import { editStart, recipeSchema, recipeSources, type EditRecipe } from './media-edit-recipe'

export const editAccessOptions = { depth: 0, overrideAccess: true } as const
export const maxSourceBytes = 256 * 1024 * 1024
export const editNotFound = () => new MediaWorkflowError('Media edit item unavailable.', 404)
export const editConflict = (message: string) => new MediaWorkflowError(message, 409)
export const editHash = (value: unknown) =>
  createHash('sha256').update(stableStringify(value)).digest('hex')

const nowExpired = (until?: string | null) => Boolean(until && Date.parse(until) <= Date.now())
export const sourceFormats: Readonly<Record<string, string>> = {
  'video/mp4': 'mov',
  'video/webm': 'matroska',
  'audio/mp4': 'mov',
  'audio/webm': 'matroska',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'image/png': 'png_pipe',
  'image/jpeg': 'jpeg_pipe',
  'image/webp': 'webp_pipe',
}

export type Dependency = {
  id: string
  blob: string
  checksum: string
  size: number
  mimeType: string
}
export type EditSnapshot = { recipe: EditRecipe; dependencies: Dependency[]; hash: string }
type History = { cursor: number; versions: EditSnapshot[] }
const historyLimit = 24
const historyOf = (project: MediaEditProject) => project.history as unknown as History
export const editSnapshot = (project: MediaEditProject) => {
  const history = historyOf(project)
  return history.versions[history.cursor]
}

export async function requireEdit(payload: Payload, actor: SubmissionActor) {
  try {
    return await authorizeCreator(payload, { ...actor, capability: 'media.edit-own' })
  } catch {
    throw new MediaWorkflowError('Media editing access denied.', 403)
  }
}

export async function ownEditProject(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw editNotFound()
  const project = await payload.findByID({
    collection: 'media-edit-projects',
    id,
    ...editAccessOptions,
    disableErrors: true,
  })
  if (
    !project ||
    relationId(project.site) !== actor.siteId ||
    relationId(project.owner) !== actor.memberId
  )
    throw editNotFound()
  return project
}

export function editProjectView(project: MediaEditProject) {
  const { versions, cursor } = historyOf(project)
  return {
    id: project.id,
    revision: project.revision,
    ...versions[cursor],
    canUndo: cursor > 0,
    canRedo: cursor < versions.length - 1,
  }
}
export type EditProjectView = ReturnType<typeof editProjectView>

export async function listEditProjects(payload: Payload, actor: SubmissionActor) {
  const { docs } = await payload.find({
    collection: 'media-edit-projects',
    ...editAccessOptions,
    sort: '-updatedAt',
    limit: 100,
    where: { and: [{ site: { equals: actor.siteId } }, { owner: { equals: actor.memberId } }] },
  })
  return docs.map(({ id, title }) => ({ id, title }))
}

function usable(asset: MediaAsset, actor: SubmissionActor) {
  const mime = mimeOf(asset)
  return (
    relationId(asset.site) === actor.siteId &&
    relationId(asset.owner) === actor.memberId &&
    Object.hasOwn(sourceFormats, mime) &&
    asset.processingState === 'ready' &&
    asset.retentionMode !== 'tombstone' &&
    asset.retentionMode !== 'archive' &&
    !nowExpired(asset.retentionExpiresAt) &&
    !nowExpired(asset.rightsExpiresAt) &&
    !['restricted', 'expired'].includes(asset.rightsStatus ?? '') &&
    asset.retentionHold !== 'moderation'
  )
}

const mimeOf = (asset: MediaAsset) => (asset.mimeType ?? '').split(';')[0].toLowerCase()

export async function listEditSources(payload: Payload, actor: SubmissionActor) {
  const { docs } = await payload.find({
    collection: 'media-assets',
    ...editAccessOptions,
    sort: '-createdAt',
    limit: 100,
    where: {
      and: [
        { site: { equals: actor.siteId } },
        { owner: { equals: actor.memberId } },
        { kind: { in: ['video', 'image', 'audio'] } },
      ],
    },
  })
  return docs
    .filter((asset) => usable(asset, actor))
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      duration: asset.durationSeconds ?? null,
      mimeType: mimeOf(asset),
      width: asset.width,
      height: asset.height,
    }))
}
export type EditSource = Awaited<ReturnType<typeof listEditSources>>[number]

export async function ownedEditSource(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw editNotFound()
  const asset = await payload.findByID({
    collection: 'media-assets',
    id,
    ...editAccessOptions,
    disableErrors: true,
  })
  if (!asset || !usable(asset, actor)) throw editNotFound()
  const blobId = relationId(asset.originalBlob)
  const blob =
    blobId &&
    (await payload.findByID({
      collection: 'media-blobs',
      id: blobId,
      ...editAccessOptions,
      disableErrors: true,
    }))
  if (
    !blob ||
    blob.state !== 'ready' ||
    relationId(blob.site) !== actor.siteId ||
    blob.checksum !== asset.checksum ||
    !/^sha256:[a-f0-9]{64}$/.test(blob.checksum) ||
    !Number.isSafeInteger(blob.sizeBytes) ||
    blob.sizeBytes <= 0 ||
    blob.sizeBytes > maxSourceBytes
  )
    throw editNotFound()
  const dependency: Dependency = {
    id,
    blob: blob.id,
    checksum: blob.checksum,
    size: blob.sizeBytes,
    mimeType: mimeOf(asset),
  }
  return { asset, dependency, key: blob.storageKey }
}

async function snapshot(payload: Payload, actor: SubmissionActor, value: unknown) {
  const checked = recipeSchema.safeParse(value)
  if (!checked.success)
    throw new MediaWorkflowError(checked.error.issues[0]?.message ?? 'Invalid edit recipe.')
  const recipe = checked.data
  const sources = new Map<string, Awaited<ReturnType<typeof ownedEditSource>>>()
  let size = 0
  for (const item of recipeSources(recipe)) {
    let source = sources.get(item.asset)
    if (!source) {
      source = await ownedEditSource(payload, actor, item.asset)
      sources.set(item.asset, source)
      size += source.dependency.size
    }
    if (!item.kinds.includes(source.asset.kind))
      throw new MediaWorkflowError('Incorrect source type.')
  }
  if (size > maxSourceBytes) throw new MediaWorkflowError('Combined sources exceed 256 MiB.', 413)
  const dependencies = [...sources.values()]
    .map(({ dependency }) => dependency)
    .sort((a, b) => a.id.localeCompare(b.id))
  return { recipe, dependencies, hash: editHash({ recipe, dependencies }) }
}

export async function editUsage(
  payload: Payload,
  actor: SubmissionActor,
  project: string,
  asset: string,
  field: 'source' | 'video' | 'thumbnail' | 'still',
  revision?: number,
) {
  await recordMediaUsage(payload, {
    site: actor.siteId,
    media: asset,
    usedBy: { relationTo: 'media-edit-projects', value: project },
    usageKey: `creator-edit:${project}:${field}:${asset}`,
    targetType: 'media-edit-project',
    targetId: project,
    targetRevision: revision === undefined ? undefined : String(revision),
    field,
    lifecycle: 'draft',
    purpose: field === 'thumbnail' ? 'thumbnail' : 'attachment',
    approvedForPublic: false,
    replaceGlobally: false,
  })
}

export async function createEditProject(payload: Payload, actor: SubmissionActor) {
  return withUploadLock(payload, `creator-edits:${actor.siteId}:${actor.memberId}`, async () => {
    const { totalDocs } = await payload.count({
      collection: 'media-edit-projects',
      overrideAccess: true,
      where: { and: [{ site: { equals: actor.siteId } }, { owner: { equals: actor.memberId } }] },
    })
    if (totalDocs >= 100) throw editConflict('This account has reached its 100 project limit.')
    const first = await snapshot(payload, actor, editStart())
    return editProjectView(
      await payload.create({
        collection: 'media-edit-projects',
        ...editAccessOptions,
        data: {
          site: actor.siteId,
          owner: actor.memberId,
          title: first.recipe.title,
          revision: 1,
          history: { cursor: 0, versions: [first] },
        },
      }),
    )
  })
}

export async function saveEditProject(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  input: Record<string, unknown>,
) {
  return withUploadLock(payload, `creator-edit:${id}`, async () => {
    const project = await ownEditProject(payload, actor, id)
    const { cursor, versions } = historyOf(project)
    const current = versions[cursor]
    if (input.revision !== project.revision)
      throw editConflict('This project was changed elsewhere. Reload before saving.')
    let history: History = { cursor, versions }
    if (input.action === 'undo' && cursor > 0) history = { cursor: cursor - 1, versions }
    if (input.action === 'redo' && cursor < versions.length - 1)
      history = { cursor: cursor + 1, versions }
    if (input.action === 'save') {
      const next = await snapshot(payload, actor, input.recipe)
      if (next.hash === current.hash) return editProjectView(project)
      const pinned = new Map(current.dependencies.map((dependency) => [dependency.id, dependency]))
      for (const dependency of next.dependencies) {
        const previous = pinned.get(dependency.id)
        if (previous && editHash(previous) !== editHash(dependency))
          throw editConflict('A source changed. Remove it and explicitly select it again.')
        await editUsage(payload, actor, id, dependency.id, 'source')
      }
      const kept = [...versions.slice(0, cursor + 1), next].slice(-historyLimit)
      history = { cursor: kept.length - 1, versions: kept }
    }
    if (history.cursor === cursor && history.versions === versions) return editProjectView(project)
    const updated = await payload.update({
      collection: 'media-edit-projects',
      id,
      ...editAccessOptions,
      data: {
        title: history.versions[history.cursor].recipe.title,
        revision: project.revision + 1,
        history,
      },
    })
    return editProjectView(updated)
  })
}
