import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { CoordinatedRelease, PinArtifactInput } from './contracts'

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    )
  return value
}
const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')

const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as { id?: unknown }).id ?? '')
    : String(value ?? '')

/** Resolve persisted ownership before any privileged artifact action, including retries. */
export async function assertReleaseArtifactScope(
  payload: Payload,
  release: Partial<CoordinatedRelease> & { site?: unknown },
  item: PinArtifactInput,
) {
  const collections: Record<string, string> = {
    article: 'article-family-content',
    page: 'page-layouts',
    presentation: 'page-layouts',
    media: 'media-assets',
    product: 'products',
    distribution: 'social-drafts',
    newsletter: 'email-messages',
    redirect: 'public-redirects',
  }
  const collection = collections[item.targetType]
  if (!collection) throw new Error('Unsupported release artifact type.')
  const site = idOf(release.site ?? release.siteId)
  if (!site) throw new Error('Release requires a persisted site.')
  // Redirects may be new rules, but their ownership is always the release site.
  if (item.targetType === 'redirect') return fingerprint(item.redirectRule)
  const target = (await payload.findByID({
    collection: collection as never,
    id:
      item.targetType === 'distribution'
        ? item.distributionDraftId || item.targetId
        : item.targetId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const owner =
    item.targetType === 'article' && target?.content
      ? await payload.findByID({
          collection: 'content',
          id: idOf(target.content),
          depth: 0,
          overrideAccess: true,
        })
      : target
  if (!owner || idOf(owner.site) !== site)
    throw new Error('Release artifact must belong to the same site as the release.')
  let destinations: unknown[] = []
  if (item.targetType === 'distribution') {
    const variants = await payload.find({
      collection: 'social-network-variants' as never,
      where: { draft: { equals: target.id } },
      pagination: false,
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    destinations = (variants.docs as unknown as Record<string, unknown>[])
      .map((v) => ({
        id: v.id,
        account: v.account,
        network: v.network,
        text: v.text,
        linkUrl: v.linkUrl,
        attachments: v.attachments,
        approvalHash: v.approvalHash,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    for (const variant of variants.docs as unknown as Record<string, unknown>[]) {
      const account = (await payload.findByID({
        collection: 'social-accounts' as never,
        id: idOf(variant.account),
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      if (idOf(account.site) !== site)
        throw new Error('Distribution account belongs to another site.')
    }
  }
  const fields: Record<string, string[]> = {
    article: ['currentRevision'],
    page: ['revision', 'blocks', 'themeId', 'path'],
    presentation: ['revision', 'blocks', 'themeId', 'surface', 'slot'],
    media: ['storageLocation', 'checksum', 'originalBlob', 'versionCount', 'replaceGloballyWith'],
    product: ['releaseRevision'],
    newsletter: ['subject', 'blocks', 'messageDesign', 'audience', 'senderIdentity', 'kind'],
    distribution: ['sourceContent', 'sourceRevision'],
  }
  return fingerprint({
    site,
    fields: (fields[item.targetType] ?? []).map((key) => [key, target[key]]),
    destinations,
  })
}
