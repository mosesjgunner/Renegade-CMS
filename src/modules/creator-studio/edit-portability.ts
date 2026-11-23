import type { Payload } from 'payload'
import { z } from 'zod'
import { MediaWorkflowError } from '../media/workflow'
import {
  createEditProject,
  editSnapshot,
  ownEditProject,
  ownedEditSource,
} from './media-edit-projects'
import { listEditExports } from './media-edit-exports'
import { recipeSchema, recipeSources } from './media-edit-recipe'
import type { SubmissionActor } from './submission-targets'
import { segmentsToSrt, segmentsToVtt } from '../podcast-studio/intelligence/caption-codec'

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const reference = z.object({ id: z.string().uuid(), checksum: hash })
const portable = z.object({
  format: z.literal('renegade-media-edit'),
  version: z.literal(1),
  recipe: recipeSchema,
  media: z.array(reference).max(40),
})
const withheld = () => new MediaWorkflowError('The file is not cleared for export.', 403)

export async function portableAsset(payload: Payload, actor: SubmissionActor, id: string) {
  const source = await ownedEditSource(payload, actor, id)
  const { asset } = source
  if (
    asset.rightsStatus !== 'approved' ||
    asset.originalExportAllowed !== true ||
    asset.licenseType === 'unknown' ||
    (asset.rightsExpiresAt && !(Date.parse(asset.rightsExpiresAt) > Date.now())) ||
    (asset.retentionMode === 'expire-at' &&
      !(Date.parse(asset.retentionExpiresAt ?? '') > Date.now())) ||
    (asset.embargoUntil && !(Date.parse(asset.embargoUntil) <= Date.now())) ||
    asset.usageRestrictions
  )
    throw withheld()
  return source
}

export async function exportEditBundle(payload: Payload, actor: SubmissionActor, id: string) {
  const { recipe, dependencies } = editSnapshot(await ownEditProject(payload, actor, id))
  const allowed = await Promise.all(
    dependencies.map(async ({ id, checksum }) => {
      const { dependency } = await portableAsset(payload, actor, id)
      if (dependency.checksum !== checksum)
        throw new MediaWorkflowError(
          'A project file changed. Open the project and select the current file before exporting.',
          409,
        )
      return { id, checksum }
    }),
  )
  const exports = await listEditExports(payload, actor, id)
  const derivatives = []
  const candidates = new Set(
    exports
      .filter(({ state }) => state === 'ready')
      .flatMap(({ video, thumbnail }) => [video, thumbnail])
      .filter(Boolean),
  )
  for (const assetId of candidates) {
    const source = await portableAsset(payload, actor, assetId).catch(() => null)
    if (source) derivatives.push({ id: assetId, checksum: source.dependency.checksum })
  }
  const captions = recipe.captions.map(({ start, end, text }, index) => ({
    id: String(index + 1),
    startSeconds: start,
    endSeconds: end,
    text,
  }))
  return {
    format: 'renegade-media-edit',
    version: 1,
    recipe,
    media: allowed,
    derivatives,
    captions: { vtt: segmentsToVtt(captions), srt: segmentsToSrt(captions) },
    withheldDerivatives: candidates.size - derivatives.length,
  }
}

export async function importEditBundle(payload: Payload, actor: SubmissionActor, raw: unknown) {
  const result = portable.safeParse(raw)
  if (!result.success) throw new MediaWorkflowError('Choose a valid Studio project export.')
  const { recipe, media } = result.data
  const expected = new Set(recipeSources(recipe).map(({ asset }) => asset))
  const refs = new Map(media.map((item) => [item.id, item.checksum]))
  if (
    media.length !== refs.size ||
    refs.size !== expected.size ||
    [...expected].some((id) => !refs.has(id))
  )
    throw new MediaWorkflowError('The export has incomplete or duplicate file references.')
  const mapped = new Map<string, string>()
  for (const [sourceId, checksum] of refs) {
    const direct = await portableAsset(payload, actor, sourceId).catch(() => null)
    if (direct?.dependency.checksum === checksum) {
      mapped.set(sourceId, sourceId)
      continue
    }
    const { docs } = await payload.find({
      collection: 'media-assets',
      depth: 0,
      overrideAccess: true,
      limit: 2,
      where: {
        and: [
          { site: { equals: actor.siteId } },
          { owner: { equals: actor.memberId } },
          { checksum: { equals: checksum } },
          { processingState: { equals: 'ready' } },
        ],
      },
    })
    if (docs.length !== 1)
      throw new MediaWorkflowError(
        'A file is missing or matches several files. Restore the matching library file before importing.',
        409,
      )
    const target = await portableAsset(payload, actor, docs[0].id)
    mapped.set(sourceId, target.asset.id)
  }
  const resolve = (id: string) => mapped.get(id)!
  return createEditProject(payload, actor, {
    ...recipe,
    clips: recipe.clips.map((clip) => ({ ...clip, asset: resolve(clip.asset) })),
    layers: recipe.layers.map((layer) =>
      layer.kind === 'graphic' ? { ...layer, asset: resolve(layer.asset) } : layer,
    ),
    voiceover: recipe.voiceover
      ? { ...recipe.voiceover, asset: resolve(recipe.voiceover.asset) }
      : null,
    thumbnailAsset: recipe.thumbnailAsset ? resolve(recipe.thumbnailAsset) : null,
  })
}
