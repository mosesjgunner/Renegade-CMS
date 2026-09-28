import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type {
  GraphEdgeLink,
  GraphNodeContent,
  GraphNodeEntity,
  GraphNodeTopic,
  GraphProjectionStatus,
} from './contracts'
import { defaultNeo4jAdapter, generateCypherStatements, Neo4jAdapter } from './neo4j-adapter'

export function computeContentFingerprint(doc: Record<string, unknown>, bodyText: string): string {
  const payload = [
    String(doc.title || ''),
    String(doc.seoTitle || ''),
    String(doc.description || ''),
    String(doc.seoDescription || ''),
    String(doc.canonicalPath || ''),
    String(doc.slug || ''),
    bodyText,
  ].join('::')

  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

export function extractPlainTextFromBody(body: unknown): string {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body !== null && 'root' in body) {
    const extract = (node: Record<string, unknown>): string => {
      let str = ''
      if (typeof node.text === 'string') str += node.text + ' '
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          str += extract(child as Record<string, unknown>)
        }
      }
      return str
    }
    return extract((body as { root: Record<string, unknown> }).root).trim()
  }
  return ''
}

export function extractInternalLinksFromBody(
  body: unknown,
  canonicalPathMap: Map<string, string>,
): Array<{ targetId: string; anchor: string; href: string; placement: string }> {
  const links: Array<{ targetId: string; anchor: string; href: string; placement: string }> = []
  if (!body || typeof body !== 'object' || !('root' in body)) return links

  const root = (body as { root: { children?: unknown[] } }).root
  if (!Array.isArray(root.children)) return links

  root.children.forEach((block, blockIndex) => {
    const blockRecord = block as Record<string, unknown>
    const placementName =
      blockRecord.type === 'heading'
        ? `Heading (${blockRecord.tag || 'h2'})`
        : `Paragraph ${blockIndex + 1}`

    const scan = (node: Record<string, unknown>) => {
      if (node.type === 'link') {
        const fields = (node.fields || {}) as Record<string, unknown>
        const href = String(fields.url || node.url || '').trim()
        let anchor = ''
        if (Array.isArray(node.children)) {
          for (const c of node.children) {
            if (typeof (c as Record<string, unknown>).text === 'string') {
              anchor += (c as Record<string, unknown>).text
            }
          }
        }
        anchor = anchor.trim()

        const targetId = canonicalPathMap.get(href)
        if (targetId) {
          links.push({
            targetId,
            anchor: anchor || 'Link',
            href,
            placement: placementName,
          })
        }
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          scan(child as Record<string, unknown>)
        }
      }
    }

    scan(blockRecord)
  })

  return links
}

export interface RebuildGraphOptions {
  siteId?: string
  adapter?: Neo4jAdapter
}

/**
 * Full rebuild of knowledge graph projection from PostgreSQL/CMS canonical records.
 * Idempotent, safe, and completely non-blocking to the public site.
 */
export async function rebuildKnowledgeGraph(
  payload: Payload,
  options: RebuildGraphOptions = {},
): Promise<GraphProjectionStatus> {
  const adapter = options.adapter || defaultNeo4jAdapter
  const store = adapter.getStore()
  store.clear()

  const siteId = options.siteId

  // 1. Fetch published content
  const contentWhere: Record<string, unknown> = {
    status: { in: ['published', 'updated'] },
  }
  if (siteId) {
    contentWhere.site = { equals: siteId }
  }

  const contentRes = await payload.find({
    collection: 'content',
    where: contentWhere as never,
    limit: 10000,
    depth: 1,
    overrideAccess: true,
  })

  const rawDocs = contentRes.docs as unknown as Array<Record<string, unknown>>

  // Map canonicalPath -> contentId for fast internal link resolution
  const canonicalPathMap = new Map<string, string>()
  const parentIds = new Set<string>()

  for (const doc of rawDocs) {
    const id = String(doc.id)
    const canonicalPath = String(doc.canonicalPath || '')
    if (canonicalPath) {
      canonicalPathMap.set(canonicalPath, id)
    }
    if (doc.parentPage) {
      const parentId =
        typeof doc.parentPage === 'object' && doc.parentPage !== null
          ? String((doc.parentPage as Record<string, unknown>).id)
          : String(doc.parentPage)
      parentIds.add(parentId)
    }
  }

  // 2. Fetch Topics (and fallback to categories if no explicit topics defined)
  const topicWhere: Record<string, unknown> = {}
  if (siteId) {
    topicWhere.site = { equals: siteId }
  }
  const topicRes = await payload.find({
    collection: 'topics',
    where: topicWhere as never,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const rawTopics = topicRes.docs as unknown as Array<Record<string, unknown>>
  for (const t of rawTopics) {
    const topicNode: GraphNodeTopic = {
      id: String(t.id),
      name: String(t.name || ''),
      slug: String(t.slug || ''),
      parentTopicId: t.parentTopic ? String(t.parentTopic) : null,
    }
    store.upsertTopic(topicNode)
  }

  // Fallback to categories as topic taxonomy if topics collection is empty
  if (store.getAllTopics().length === 0) {
    try {
      const catRes = await payload.find({
        collection: 'categories',
        where: siteId ? { site: { equals: siteId } } : {},
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      for (const c of catRes.docs as unknown as Array<Record<string, unknown>>) {
        store.upsertTopic({
          id: String(c.id),
          name: String(c.name || 'Topic'),
          slug: String(c.slug || 'topic'),
          parentTopicId: c.parent ? String(c.parent) : null,
        })
      }
    } catch {
      // Gracefully continue
    }
  }

  // 3. Fetch Entities (if intelligence module is registered, with tag fallback)
  const entityWhere: Record<string, unknown> = {}
  if (siteId) {
    entityWhere.site = { equals: siteId }
  }
  try {
    const entityRes = await payload.find({
      collection: 'intelligence-entities' as never,
      where: entityWhere as never,
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    const rawEntities = entityRes.docs as unknown as Array<Record<string, unknown>>
    for (const e of rawEntities) {
      const entityNode: GraphNodeEntity = {
        id: String(e.id),
        name: String(e.name || ''),
        slug: String(e.slug || ''),
        entityType: String(e.entityType || 'concept'),
        externalId: String(e.externalId || ''),
      }
      store.upsertEntity(entityNode)
    }
  } catch {
    // If intelligence-entities collection is not registered in this deployment profile, continue smoothly
  }

  // Fallback to tags as domain entities if entity registry is empty
  if (store.getAllEntities().length === 0) {
    try {
      const tagRes = await payload.find({
        collection: 'tags',
        where: siteId ? { site: { equals: siteId } } : {},
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      for (const tag of tagRes.docs as unknown as Array<Record<string, unknown>>) {
        store.upsertEntity({
          id: String(tag.id),
          name: String(tag.name || 'Entity'),
          slug: String(tag.slug || 'entity'),
          entityType: 'concept',
          externalId: `tag-${tag.id}`,
        })
      }
    } catch {
      // Gracefully continue
    }
  }

  // 4. Project Content Nodes and Relationships
  let latestUpdatedAtTime = 0

  for (const doc of rawDocs) {
    const id = String(doc.id)
    const title = String(doc.title || '')
    const slug = String(doc.slug || '')
    const canonicalPath = String(doc.canonicalPath || '')
    const contentType = String(doc.contentType || 'article')
    const status = String(doc.status || 'published')
    const publishedAt = doc.publishedAt ? String(doc.publishedAt) : null
    const updatedAt = String(doc.updatedAt || new Date().toISOString())
    const docTime = new Date(updatedAt).getTime()
    if (docTime > latestUpdatedAtTime) {
      latestUpdatedAtTime = docTime
    }

    const bodyText = extractPlainTextFromBody(doc.body)
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length
    const contentRevision = computeContentFingerprint(doc, bodyText)

    // Determine if this page is a hub (landing page, featured, or parent to other pages)
    const isHub =
      doc.pageTemplate === 'landing' ||
      Boolean(doc.featured) ||
      parentIds.has(id) ||
      contentType === 'collection'

    // Extract topics (check doc.topics, fallback to doc.categories)
    const topicIds: string[] = []
    if (Array.isArray(doc.topics) && doc.topics.length > 0) {
      for (const t of doc.topics) {
        const tid = typeof t === 'object' && t !== null ? String(t.id) : String(t)
        topicIds.push(tid)
        store.addAbout(id, tid)
      }
    } else if (Array.isArray(doc.categories) && doc.categories.length > 0) {
      for (const c of doc.categories) {
        const cid = typeof c === 'object' && c !== null ? String(c.id) : String(c)
        topicIds.push(cid)
        store.addAbout(id, cid)
      }
    }

    // Extract entities (check doc.entities, fallback to doc.tags)
    const entityIds: string[] = []
    if (Array.isArray(doc.entities) && doc.entities.length > 0) {
      for (const e of doc.entities) {
        const eid = typeof e === 'object' && e !== null ? String(e.id) : String(e)
        entityIds.push(eid)
        store.addMentions(id, eid)
      }
    } else if (Array.isArray(doc.tags) && doc.tags.length > 0) {
      for (const t of doc.tags) {
        const tid = typeof t === 'object' && t !== null ? String(t.id) : String(t)
        entityIds.push(tid)
        store.addMentions(id, tid)
      }
    }

    // Extract parentPage
    if (doc.parentPage) {
      const parentId =
        typeof doc.parentPage === 'object' && doc.parentPage !== null
          ? String((doc.parentPage as Record<string, unknown>).id)
          : String(doc.parentPage)
      store.addChildOf(id, parentId)
    }

    const contentNode: GraphNodeContent = {
      id,
      title,
      slug,
      canonicalPath,
      contentType,
      status,
      wordCount,
      publishedAt,
      updatedAt,
      contentRevision,
      topics: topicIds,
      entities: entityIds,
      isHub,
    }
    store.upsertContent(contentNode)

    // Extract internal links from body AST
    const internalLinks = extractInternalLinksFromBody(doc.body, canonicalPathMap)
    for (const link of internalLinks) {
      const edge: GraphEdgeLink = {
        sourceId: id,
        targetId: link.targetId,
        anchor: link.anchor,
        href: link.href,
        placement: link.placement,
      }
      store.addLink(edge)
    }
  }

  // 5. Calculate Status & Lag
  const now = Date.now()
  const contentLagMs = latestUpdatedAtTime > 0 ? Math.max(0, now - latestUpdatedAtTime) : 0
  const lastProjectedAt = new Date(now).toISOString()

  // 6. Generate Idempotent Cypher Statements and Sync to Neo4j
  const cypherStatements = generateCypherStatements(store)
  const syncResult = await adapter.syncToNeo4j(cypherStatements)

  adapter.setStatus({
    lastProjectedAt,
    contentLagMs,
    error: syncResult.error,
  })

  return adapter.getStatus()
}
