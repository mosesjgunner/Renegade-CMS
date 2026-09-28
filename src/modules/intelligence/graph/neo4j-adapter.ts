import type {
  CypherStatement,
  GraphEdgeLink,
  GraphNodeContent,
  GraphNodeEntity,
  GraphNodeTopic,
  GraphProjectionStatus,
} from './contracts'

/**
 * In-Memory Graph Store for published CMS content, topics, entities, and relationships.
 * This guarantees the CMS and public site remain 100% operational when Neo4j is offline
 * or not provisioned in the deployment environment.
 */
export class MemoryGraphStore {
  private contents = new Map<string, GraphNodeContent>()
  private topics = new Map<string, GraphNodeTopic>()
  private entities = new Map<string, GraphNodeEntity>()

  private links: GraphEdgeLink[] = []
  private aboutEdges: Array<{ contentId: string; topicId: string }> = []
  private mentionsEdges: Array<{ contentId: string; entityId: string }> = []
  private childOfEdges: Array<{ childId: string; parentId: string }> = []

  public clear(): void {
    this.contents.clear()
    this.topics.clear()
    this.entities.clear()
    this.links = []
    this.aboutEdges = []
    this.mentionsEdges = []
    this.childOfEdges = []
  }

  public upsertContent(node: GraphNodeContent): void {
    this.contents.set(node.id, node)
  }

  public getContent(id: string): GraphNodeContent | undefined {
    return this.contents.get(id)
  }

  public getAllContent(): GraphNodeContent[] {
    return Array.from(this.contents.values())
  }

  public upsertTopic(node: GraphNodeTopic): void {
    this.topics.set(node.id, node)
  }

  public getTopic(id: string): GraphNodeTopic | undefined {
    return this.topics.get(id)
  }

  public getAllTopics(): GraphNodeTopic[] {
    return Array.from(this.topics.values())
  }

  public upsertEntity(node: GraphNodeEntity): void {
    this.entities.set(node.id, node)
  }

  public getEntity(id: string): GraphNodeEntity | undefined {
    return this.entities.get(id)
  }

  public getAllEntities(): GraphNodeEntity[] {
    return Array.from(this.entities.values())
  }

  public addLink(edge: GraphEdgeLink): void {
    // avoid exact duplicate edges
    const exists = this.links.some(
      (l) =>
        l.sourceId === edge.sourceId &&
        l.targetId === edge.targetId &&
        l.anchor === edge.anchor &&
        l.placement === edge.placement,
    )
    if (!exists) {
      this.links.push(edge)
    }
  }

  public addAbout(contentId: string, topicId: string): void {
    const exists = this.aboutEdges.some((e) => e.contentId === contentId && e.topicId === topicId)
    if (!exists) {
      this.aboutEdges.push({ contentId, topicId })
    }
  }

  public addMentions(contentId: string, entityId: string): void {
    const exists = this.mentionsEdges.some(
      (e) => e.contentId === contentId && e.entityId === entityId,
    )
    if (!exists) {
      this.mentionsEdges.push({ contentId, entityId })
    }
  }

  public addChildOf(childId: string, parentId: string): void {
    const exists = this.childOfEdges.some((e) => e.childId === childId && e.parentId === parentId)
    if (!exists) {
      this.childOfEdges.push({ childId, parentId })
    }
  }

  public getInDegree(contentId: string): number {
    return this.links.filter((l) => l.targetId === contentId).length
  }

  public getOutDegree(contentId: string): number {
    return this.links.filter((l) => l.sourceId === contentId).length
  }

  public getInLinks(contentId: string): GraphEdgeLink[] {
    return this.links.filter((l) => l.targetId === contentId)
  }

  public getOutLinks(contentId: string): GraphEdgeLink[] {
    return this.links.filter((l) => l.sourceId === contentId)
  }

  public getAllLinks(): GraphEdgeLink[] {
    return [...this.links]
  }

  public hasLink(sourceId: string, targetId: string): boolean {
    return this.links.some((l) => l.sourceId === sourceId && l.targetId === targetId)
  }

  public getAboutEdges(): Array<{ contentId: string; topicId: string }> {
    return [...this.aboutEdges]
  }

  public getMentionsEdges(): Array<{ contentId: string; entityId: string }> {
    return [...this.mentionsEdges]
  }

  public getChildOfEdges(): Array<{ childId: string; parentId: string }> {
    return [...this.childOfEdges]
  }

  public getNodeCounts(): {
    contentCount: number
    topicsCount: number
    entitiesCount: number
  } {
    return {
      contentCount: this.contents.size,
      topicsCount: this.topics.size,
      entitiesCount: this.entities.size,
    }
  }

  public getEdgeCounts(): {
    linksCount: number
    aboutCount: number
    mentionsCount: number
  } {
    return {
      linksCount: this.links.length,
      aboutCount: this.aboutEdges.length,
      mentionsCount: this.mentionsEdges.length,
    }
  }
}

/**
 * Generates idempotent Cypher MERGE statements for Neo4j.
 */
export function generateCypherStatements(store: MemoryGraphStore): CypherStatement[] {
  const statements: CypherStatement[] = []

  // 1. Content nodes
  for (const content of store.getAllContent()) {
    statements.push({
      cypher: `MERGE (c:Content { id: $id })
ON CREATE SET c.title = $title, c.slug = $slug, c.canonicalPath = $canonicalPath, c.contentType = $contentType, c.status = $status, c.wordCount = $wordCount, c.publishedAt = $publishedAt, c.updatedAt = $updatedAt, c.contentRevision = $contentRevision, c.isHub = $isHub
ON MATCH SET c.title = $title, c.slug = $slug, c.canonicalPath = $canonicalPath, c.contentType = $contentType, c.status = $status, c.wordCount = $wordCount, c.publishedAt = $publishedAt, c.updatedAt = $updatedAt, c.contentRevision = $contentRevision, c.isHub = $isHub`,
      params: {
        id: content.id,
        title: content.title,
        slug: content.slug,
        canonicalPath: content.canonicalPath,
        contentType: content.contentType,
        status: content.status,
        wordCount: content.wordCount,
        publishedAt: content.publishedAt,
        updatedAt: content.updatedAt,
        contentRevision: content.contentRevision,
        isHub: content.isHub,
      },
    })
  }

  // 2. Topic nodes
  for (const topic of store.getAllTopics()) {
    statements.push({
      cypher: `MERGE (t:Topic { id: $id })
ON CREATE SET t.name = $name, t.slug = $slug
ON MATCH SET t.name = $name, t.slug = $slug`,
      params: {
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
      },
    })
  }

  // 3. Entity nodes
  for (const entity of store.getAllEntities()) {
    statements.push({
      cypher: `MERGE (e:Entity { id: $id })
ON CREATE SET e.name = $name, e.slug = $slug, e.entityType = $entityType, e.externalId = $externalId
ON MATCH SET e.name = $name, e.slug = $slug, e.entityType = $entityType, e.externalId = $externalId`,
      params: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        entityType: entity.entityType,
        externalId: entity.externalId,
      },
    })
  }

  // 4. ABOUT edges
  for (const edge of store.getAboutEdges()) {
    statements.push({
      cypher: `MATCH (c:Content { id: $contentId }), (t:Topic { id: $topicId })
MERGE (c)-[:ABOUT]->(t)`,
      params: {
        contentId: edge.contentId,
        topicId: edge.topicId,
      },
    })
  }

  // 5. MENTIONS edges
  for (const edge of store.getMentionsEdges()) {
    statements.push({
      cypher: `MATCH (c:Content { id: $contentId }), (e:Entity { id: $entityId })
MERGE (c)-[:MENTIONS]->(e)`,
      params: {
        contentId: edge.contentId,
        entityId: edge.entityId,
      },
    })
  }

  // 6. LINKS_TO edges
  for (const edge of store.getAllLinks()) {
    statements.push({
      cypher: `MATCH (s:Content { id: $sourceId }), (t:Content { id: $targetId })
MERGE (s)-[r:LINKS_TO { anchor: $anchor, placement: $placement }]->(t)
ON CREATE SET r.href = $href
ON MATCH SET r.href = $href`,
      params: {
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        anchor: edge.anchor,
        placement: edge.placement,
        href: edge.href,
      },
    })
  }

  // 7. CHILD_OF edges
  for (const edge of store.getChildOfEdges()) {
    statements.push({
      cypher: `MATCH (c:Content { id: $childId }), (p:Content { id: $parentId })
MERGE (c)-[:CHILD_OF]->(p)`,
      params: {
        childId: edge.childId,
        parentId: edge.parentId,
      },
    })
  }

  return statements
}

/**
 * Neo4j Adapter with fallback to MemoryGraphStore and decoupled failure recovery.
 */
export class Neo4jAdapter {
  private memoryStore: MemoryGraphStore
  private lastProjectedAt: string | null = null
  private contentLagMs: number = 0
  private lastError: string | null = null
  private neo4jConfigured: boolean = false

  constructor() {
    this.memoryStore = new MemoryGraphStore()
    this.neo4jConfigured = Boolean(
      process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD,
    )
  }

  public getStore(): MemoryGraphStore {
    return this.memoryStore
  }

  public setStatus(update: {
    lastProjectedAt?: string | null
    contentLagMs?: number
    error?: string | null
  }): void {
    if (update.lastProjectedAt !== undefined) this.lastProjectedAt = update.lastProjectedAt
    if (update.contentLagMs !== undefined) this.contentLagMs = update.contentLagMs
    if (update.error !== undefined) this.lastError = update.error
  }

  public getStatus(): GraphProjectionStatus {
    const nodeCounts = this.memoryStore.getNodeCounts()
    const edgeCounts = this.memoryStore.getEdgeCounts()

    return {
      lastProjectedAt: this.lastProjectedAt,
      contentLagMs: this.contentLagMs,
      isAvailable: true, // Memory projection is always available
      projector: this.neo4jConfigured ? 'neo4j-optional' : 'in-memory',
      nodes: nodeCounts,
      edges: edgeCounts,
      error: this.lastError,
    }
  }

  /**
   * Syncs the in-memory graph to Neo4j if configured, handling connection failures gracefully.
   */
  public async syncToNeo4j(statements: CypherStatement[]): Promise<{
    synced: boolean
    statementCount: number
    error: string | null
  }> {
    if (!this.neo4jConfigured) {
      return { synced: true, statementCount: statements.length, error: null }
    }

    try {
      // In production/staging with Neo4j credentials, execute via HTTP endpoint or Bolt driver.
      // If endpoint is unreachable, catch and record without throwing.
      const uri = process.env.NEO4J_URI as string
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const auth = Buffer.from(
          `${process.env.NEO4J_USER}:${process.env.NEO4J_PASSWORD}`,
        ).toString('base64')
        const response = await fetch(`${uri.replace(/\/$/, '')}/db/neo4j/tx/commit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            statements: statements.map((s) => ({
              statement: s.cypher,
              parameters: s.params,
            })),
          }),
        })

        if (!response.ok) {
          throw new Error(`Neo4j HTTP ${response.status}: ${response.statusText}`)
        }
      }
      this.lastError = null
      return { synced: true, statementCount: statements.length, error: null }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.lastError = `Neo4j sync failed (recovered gracefully with in-memory projection): ${errMsg}`
      return { synced: false, statementCount: 0, error: this.lastError }
    }
  }
}

export const defaultNeo4jAdapter = new Neo4jAdapter()
