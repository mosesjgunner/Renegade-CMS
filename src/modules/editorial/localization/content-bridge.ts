import { createHash } from 'node:crypto'

import type { Payload } from 'payload'

import { resolveSiteSettings } from '../../core/site-settings'
import type { LocaleVariant, TranslationGroup } from './contracts'
import type { CreateTranslationGroupInput } from './engine'

/**
 * RC3-21 (#61) content bridge: the two legs between the in-memory
 * localization engine and real Payload `content` documents.
 *
 * - `loadSourceDocument` reads a real content doc (plus its editorial
 *   companion / current revision record) and builds the engine's
 *   sourceDocument shape, so `create-group` no longer needs a
 *   hand-constructed document.
 * - `materializePublishedVariant` turns an approved + published engine
 *   variant into a real localized `content` document.
 *
 * Engine-state persistence is a named gap and is NOT built here: groups,
 * requests and variants still live in the engine's in-memory Maps. The
 * bridge-group registry below is likewise in-memory and only records
 * which groups were created from real content, so the publish route can
 * materialize those (and fail loudly when materialization fails) while
 * hand-constructed groups keep their legacy publish behavior.
 */

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value)
    return String((value as { id: unknown }).id)
  return ''
}

const bridgeGroupIds = new Set<string>()

export function markBridgeGroup(groupId: string): void {
  bridgeGroupIds.add(groupId)
}

export function isBridgeGroup(groupId: string): boolean {
  return bridgeGroupIds.has(groupId)
}

const ENGINE_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'] as const

const toEngineStatus = (status: unknown): (typeof ENGINE_STATUSES)[number] => {
  const raw = String(status ?? 'draft')
  // 'updated' is a published document with later edits; it is published
  // for localization purposes (it is the live public revision lineage).
  if (raw === 'updated') return 'published'
  return (ENGINE_STATUSES as readonly string[]).includes(raw)
    ? (raw as (typeof ENGINE_STATUSES)[number])
    : 'draft'
}

const hashBody = (body: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex')

/**
 * Reads a real `content` document and builds the engine sourceDocument.
 * Revision pin: the editorial companion (`article-family-content`) holds
 * `currentRevisionSequence`; the hash comes from the current
 * `revision-records` row (integrity hash, falling back to its document
 * hash, then the companion's document hash). When no companion exists
 * yet (e.g. a content type the companion hook does not track), the pin
 * is sequence 0 with a hash of the canonical body.
 */
export async function loadSourceDocument(
  payload: Payload,
  contentId: string,
): Promise<CreateTranslationGroupInput['sourceDocument']> {
  const doc = (await payload.findByID({
    collection: 'content',
    id: contentId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc | null
  if (!doc) throw new Error(`Content document '${contentId}' not found.`)

  const settings = await resolveSiteSettings(payload)
  const siteId = idOf(doc.site)
  const origin = (siteId && settings.canonicalOriginsBySite[siteId]) || settings.canonicalOrigin
  const canonicalPath = String(doc.canonicalPath ?? '')
  const canonicalUrl = canonicalPath.startsWith('http')
    ? canonicalPath
    : `${origin.replace(/\/+$/, '')}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`

  let revisionSequence = 0
  let revisionHash = hashBody(doc.body)
  const companions = (await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: String(doc.id) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: Doc[] }
  const companion = companions.docs[0]
  if (companion) {
    revisionSequence = Number(companion.currentRevisionSequence ?? 0)
    revisionHash = String(companion.documentHash ?? revisionHash)
    const revisionId = idOf(companion.currentRevision)
    if (revisionId) {
      const revision = (await payload
        .findByID({
          collection: 'revision-records',
          id: revisionId,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => null)) as Doc | null
      if (revision) {
        revisionHash = String(revision.integrityHash ?? revision.documentHash ?? revisionHash)
      }
    }
  }

  const heroMediaId = idOf(doc.heroMedia)
  const mediaChoices: CreateTranslationGroupInput['sourceDocument']['mediaChoices'] = {}
  if (heroMediaId) {
    mediaChoices[heroMediaId] = {
      mediaId: heroMediaId,
      altText: typeof doc.seoImageAlt === 'string' ? doc.seoImageAlt : '',
    }
  }

  return {
    id: String(doc.id),
    locale: settings.locale || 'en',
    title: String(doc.title ?? ''),
    slug: String(doc.slug ?? ''),
    canonicalPath,
    canonicalUrl,
    summary: typeof doc.summary === 'string' ? doc.summary : undefined,
    body: (doc.body ?? undefined) as Record<string, unknown> | string | undefined,
    revisionSequence,
    revisionHash,
    status: toEngineStatus(doc.status),
    seoTitle: typeof doc.seoTitle === 'string' ? doc.seoTitle : undefined,
    seoDescription: typeof doc.seoDescription === 'string' ? doc.seoDescription : undefined,
    mediaChoices,
  }
}

/** Normalizes an engine variant body into a storable Lexical document. */
const toStorableBody = (body: LocaleVariant['body']): Record<string, unknown> | undefined => {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') {
    return {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [{ type: 'text', version: 1, text: body }],
          },
        ],
      },
    }
  }
  // Engine drafts may annotate the document object (e.g. `_translated`);
  // the stored canonical body is the Lexical root document itself.
  if (typeof body === 'object' && 'root' in body) return { root: (body as Doc).root }
  return body as Record<string, unknown>
}

/**
 * Creates the real localized `content` document for an approved +
 * published engine variant and returns its id.
 *
 * Status rule: the localized document is created with workflow status
 * 'published' ONLY when the source document is itself published;
 * otherwise it is created as 'draft'. A localization must never make
 * public something the source has not made public.
 *
 * Linkage: the existing `discoveryOverrides` JSON seam on `content`
 * (see `seoFields()` in `src/collections/canonical-shared.ts`) is
 * documented to carry `locale` and `alternates`; the materialized doc
 * records its locale, the group's hreflang alternate paths, the source
 * content id and the translation group id there. Slug
 * (`<slug>-<locale>`) and canonicalPath (`/<locale>` + source path)
 * carry the same linkage in the URL contract.
 */
export async function materializePublishedVariant(
  payload: Payload,
  group: TranslationGroup,
  variant: LocaleVariant,
): Promise<string> {
  const source = (await payload.findByID({
    collection: 'content',
    id: group.sourceDocumentId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc | null
  if (!source) {
    throw new Error(
      `Source content document '${group.sourceDocumentId}' not found; cannot materialize locale '${variant.locale}'.`,
    )
  }

  const siteId = idOf(source.site)
  // Idempotent on re-publish: the engine may publish the same variant
  // again; the localized document is created once per (site, slug).
  const existing = (await payload.find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteId } }, { slug: { equals: variant.slug } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: Doc[] }
  if (existing.docs[0]) return String(existing.docs[0].id)

  const sourcePath = String(source.canonicalPath ?? '')
  const canonicalPath = `/${variant.locale}${sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`}`
  const status = String(source.status) === 'published' ? 'published' : 'draft'

  const alternates: Record<string, string> = {
    [group.sourceLocale]: sourcePath,
    [variant.locale]: canonicalPath,
  }

  const authors = Array.isArray(source.authors)
    ? (source.authors as Doc[]).map((entry) => ({
        author: idOf(entry.author),
        displayOrder: Number(entry.displayOrder ?? 0),
        ...(typeof entry.role === 'string' ? { role: entry.role } : {}),
      }))
    : []

  const created = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      ...(idOf(source.publication) ? { publication: idOf(source.publication) } : {}),
      ...(idOf(source.space) ? { space: idOf(source.space) } : {}),
      ...(idOf(source.owner) ? { owner: idOf(source.owner) } : {}),
      contentType: String(source.contentType ?? 'article'),
      title: variant.title,
      slug: variant.slug,
      // The localized canonical path is deliberate, not slug-derived.
      pathOverride: true,
      canonicalPath,
      summary: variant.summary,
      body: toStorableBody(variant.body),
      status,
      ...(status === 'published'
        ? { publishedAt: source.publishedAt ?? new Date().toISOString() }
        : {}),
      visibility: typeof source.visibility === 'string' ? source.visibility : 'public',
      authors,
      ...(idOf(source.heroMedia) ? { heroMedia: idOf(source.heroMedia) } : {}),
      seoTitle: variant.seoTitle,
      seoDescription: variant.seoDescription,
      discoveryOverrides: {
        locale: variant.locale,
        alternates,
        sourceContentId: String(source.id),
        translationGroupId: group.id,
        translationVariantDocumentId: variant.documentId,
      },
    },
    overrideAccess: true,
  } as never)) as Doc

  return String(created.id)
}
