import type { Payload } from 'payload'
import { portfolioMediaIds, type Portfolio } from './portfolio-contract'
import {
  ownPortfolio,
  portfolioAccess,
  portfolioCollection,
  portfolioSpace,
  savePortfolio,
  type PortfolioActor,
} from './portfolio-service'
import { parsePortfolio, PortfolioError, record } from './portfolio-validation'
import { relationId, uuid } from './submission-targets'

const checksumFormat = /^sha256:[a-f0-9]{64}$/i

export async function exportPortfolio(
  payload: Payload,
  actor: PortfolioActor,
  kind: unknown,
  id: string,
) {
  const collection = portfolioCollection(kind)
  const doc = await ownPortfolio(payload, actor, collection, id)
  const draft = parsePortfolio(doc.portfolioDraft)
  const ids = portfolioMediaIds(draft)
  const media = ids.length
    ? (
        await payload.find({
          collection: 'media-assets',
          ...portfolioAccess,
          limit: ids.length,
          where: {
            and: [
              { id: { in: ids } },
              { site: { equals: actor.siteId } },
              { owner: { equals: actor.memberId } },
            ],
          },
        })
      ).docs
    : []
  if (
    media.length !== ids.length ||
    media.some(
      (asset) => relationId(asset.space) && relationId(asset.space) !== relationId(doc.space),
    )
  )
    throw new PortfolioError('Restore the missing media references before exporting.', 409)
  return {
    format: 'renegade-portfolio',
    version: 1,
    collection,
    kind: 'kind' in doc ? doc.kind : 'project',
    draft,
    media: media.map(({ id, title, checksum }) => ({
      id,
      title,
      checksum: checksum && checksumFormat.test(checksum) ? checksum.toLowerCase() : null,
    })),
  }
}

export async function importPortfolio(payload: Payload, actor: PortfolioActor, value: unknown) {
  const bundle = record(value)
  if (bundle.format !== 'renegade-portfolio' || bundle.version !== 1)
    throw new PortfolioError('Choose a Renegade portfolio export.')
  const draft = parsePortfolio(bundle.draft)
  const space = await portfolioSpace(payload, actor)
  const ids = portfolioMediaIds(draft)
  if (!Array.isArray(bundle.media) || bundle.media.length !== ids.length)
    throw new PortfolioError('The export is missing its media references.')
  const refs = new Map<string, string | null>()
  for (const value of bundle.media) {
    const { id, checksum } = record(value)
    if (
      typeof id !== 'string' ||
      !uuid.test(id) ||
      refs.has(id) ||
      (checksum !== null && (typeof checksum !== 'string' || !checksumFormat.test(checksum)))
    )
      throw new PortfolioError('The export contains an invalid media reference.')
    refs.set(id, typeof checksum === 'string' ? checksum.toLowerCase() : null)
  }
  if (ids.some((id) => !refs.has(id)))
    throw new PortfolioError('The export is missing a media reference.')
  const checksums = [
    ...new Set([...refs.values()].filter((value): value is string => Boolean(value))),
  ]
  const assets = ids.length
    ? (
        await payload.find({
          collection: 'media-assets',
          ...portfolioAccess,
          limit: 0,
          pagination: false,
          where: {
            and: [
              { site: { equals: actor.siteId } },
              { owner: { equals: actor.memberId } },
              { processingState: { equals: 'ready' } },
              {
                or: [
                  { id: { in: ids } },
                  ...(checksums.length ? [{ checksum: { in: checksums } }] : []),
                ],
              },
            ],
          },
        })
      ).docs.filter((asset) => !relationId(asset.space) || relationId(asset.space) === space)
    : []
  const remapped = new Map<string, string>()
  for (const id of ids) {
    const checksum = refs.get(id)
    const direct = assets.find(
      (asset) => asset.id === id && (!checksum || asset.checksum === checksum),
    )
    const matches = checksum ? assets.filter((asset) => asset.checksum === checksum) : []
    const asset = direct ?? (matches.length === 1 ? matches[0] : undefined)
    if (!asset)
      throw new PortfolioError(
        'A media reference is missing or ambiguous. Restore its original library asset before importing.',
        409,
      )
    remapped.set(id, asset.id)
  }
  const imported: Portfolio = {
    ...draft,
    cover: remapped.get(draft.cover) ?? '',
    sections: draft.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({ ...block, media: remapped.get(block.media) ?? '' })),
    })),
  }
  return savePortfolio(payload, actor, {
    action: 'save',
    collection: bundle.collection,
    kind: bundle.kind,
    draft: imported,
  })
}
