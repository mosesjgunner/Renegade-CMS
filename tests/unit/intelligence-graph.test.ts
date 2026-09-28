import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  defaultNeo4jAdapter,
  generateCypherStatements,
  MemoryGraphStore,
  Neo4jAdapter,
} from '../../src/modules/intelligence/graph/neo4j-adapter'
import {
  computeContentFingerprint,
  extractInternalLinksFromBody,
  extractPlainTextFromBody,
  rebuildKnowledgeGraph,
} from '../../src/modules/intelligence/graph/projection-engine'
import {
  detectLinkOpportunities,
  detectMissingHubRelationships,
  detectOrphanPages,
  detectWeakTopicClusters,
} from '../../src/modules/intelligence/graph/opportunity-detector'
import {
  applyLinkOpportunity,
  bulkReviewLinkOpportunities,
  insertLinkIntoLexicalBody,
  rollbackLinkExecution,
} from '../../src/modules/intelligence/graph/link-application'

describe('Intelligence Knowledge Graph & Link Engine', () => {
  describe('MemoryGraphStore & Cypher Generation', () => {
    it('indexes nodes, edges and generates idempotent Cypher MERGE queries', () => {
      const store = new MemoryGraphStore()

      store.upsertContent({
        id: 'c1',
        title: 'Pillar Article on Architecture',
        slug: 'pillar-architecture',
        canonicalPath: '/articles/pillar-architecture',
        contentType: 'article',
        status: 'published',
        wordCount: 1200,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-c1',
        topics: ['t1'],
        entities: ['e1'],
        isHub: true,
      })

      store.upsertContent({
        id: 'c2',
        title: 'Spoke Article on Microservices',
        slug: 'spoke-microservices',
        canonicalPath: '/articles/spoke-microservices',
        contentType: 'article',
        status: 'published',
        wordCount: 800,
        publishedAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        contentRevision: 'rev-c2',
        topics: ['t1'],
        entities: ['e1'],
        isHub: false,
      })

      store.upsertTopic({
        id: 't1',
        name: 'Software Architecture',
        slug: 'software-architecture',
      })

      store.upsertEntity({
        id: 'e1',
        name: 'Microservices Pattern',
        slug: 'microservices-pattern',
        entityType: 'concept',
        externalId: 'ext-microservices',
      })

      store.addAbout('c1', 't1')
      store.addAbout('c2', 't1')
      store.addMentions('c1', 'e1')
      store.addMentions('c2', 'e1')
      store.addLink({
        sourceId: 'c1',
        targetId: 'c2',
        anchor: 'read microservices guide',
        href: '/articles/spoke-microservices',
        placement: 'Paragraph 2',
      })

      expect(store.getNodeCounts()).toEqual({
        contentCount: 2,
        topicsCount: 1,
        entitiesCount: 1,
      })

      expect(store.getInDegree('c2')).toBe(1)
      expect(store.getInDegree('c1')).toBe(0)
      expect(store.hasLink('c1', 'c2')).toBe(true)
      expect(store.hasLink('c2', 'c1')).toBe(false)

      const cypherStatements = generateCypherStatements(store)
      expect(cypherStatements.length).toBeGreaterThan(0)

      // Verify MERGE statements exist for nodes and relationships
      const contentMerge = cypherStatements.find((s) => s.cypher.includes('MERGE (c:Content'))
      expect(contentMerge).toBeDefined()
      expect(contentMerge?.cypher).toContain('ON CREATE SET')
      expect(contentMerge?.cypher).toContain('ON MATCH SET')

      const linkMerge = cypherStatements.find((s) => s.cypher.includes('MERGE (s)-[r:LINKS_TO'))
      expect(linkMerge).toBeDefined()
      expect(linkMerge?.params.anchor).toBe('read microservices guide')
    })
  })

  describe('Projection Engine & Idempotency', () => {
    it('rebuilds projection idempotently and measures lag', async () => {
      const now = new Date('2026-09-25T12:00:00.000Z')
      const docUpdated = new Date('2026-09-25T11:50:00.000Z') // 10 minutes ago

      const mockDocs = [
        {
          id: 'art-1',
          title: 'Article One',
          slug: 'article-one',
          canonicalPath: '/articles/one',
          status: 'published',
          updatedAt: docUpdated.toISOString(),
          publishedAt: docUpdated.toISOString(),
          topics: ['top-1'],
          entities: ['ent-1'],
          pageTemplate: 'landing',
          body: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    { type: 'text', text: 'Check out ' },
                    {
                      type: 'link',
                      fields: { url: '/articles/two' },
                      children: [{ type: 'text', text: 'our second article' }],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          id: 'art-2',
          title: 'Article Two',
          slug: 'article-two',
          canonicalPath: '/articles/two',
          status: 'published',
          updatedAt: docUpdated.toISOString(),
          publishedAt: docUpdated.toISOString(),
          topics: ['top-1'],
          entities: ['ent-1'],
          body: {
            root: {
              type: 'root',
              children: [
                { type: 'paragraph', children: [{ type: 'text', text: 'Second content body.' }] },
              ],
            },
          },
        },
      ]

      const mockPayload = {
        find: vi.fn().mockImplementation(async ({ collection }) => {
          if (collection === 'content') return { docs: mockDocs }
          if (collection === 'topics') {
            return {
              docs: [{ id: 'top-1', name: 'Core Topics', slug: 'core-topics' }],
            }
          }
          if (collection === 'intelligence-entities') {
            return {
              docs: [
                {
                  id: 'ent-1',
                  name: 'Entity Alpha',
                  slug: 'entity-alpha',
                  entityType: 'concept',
                  externalId: 'ext-alpha',
                },
              ],
            }
          }
          return { docs: [] }
        }),
      } as unknown as Payload

      const customAdapter = new Neo4jAdapter()
      const status1 = await rebuildKnowledgeGraph(mockPayload, { adapter: customAdapter })

      expect(status1.nodes.contentCount).toBe(2)
      expect(status1.nodes.topicsCount).toBe(1)
      expect(status1.nodes.entitiesCount).toBe(1)
      expect(status1.edges.linksCount).toBe(1)
      expect(status1.contentLagMs).toBeGreaterThan(0)
      expect(status1.isAvailable).toBe(true)

      // Rebuild second time: exact same counts (idempotent)
      const status2 = await rebuildKnowledgeGraph(mockPayload, { adapter: customAdapter })
      expect(status2.nodes).toEqual(status1.nodes)
      expect(status2.edges).toEqual(status1.edges)
    })

    it('handles Neo4j sync failure gracefully with in-memory fallback and zero public downtime', async () => {
      const customAdapter = new Neo4jAdapter()

      // Force simulated failure
      const syncResult = await customAdapter.syncToNeo4j([
        { cypher: 'INVALID CYPHER STATEMENT', params: {} },
      ])
      // In the absence of NEO4J_URI, it returns synced: true; if simulated with URI:
      process.env.NEO4J_URI = 'http://localhost:9999'
      process.env.NEO4J_USER = 'neo4j'
      process.env.NEO4J_PASSWORD = 'password'

      const adapterWithUri = new Neo4jAdapter()
      const failResult = await adapterWithUri.syncToNeo4j([
        { cypher: 'MERGE (n) RETURN n', params: {} },
      ])

      expect(failResult.synced).toBe(false)
      expect(failResult.error).toContain('Neo4j sync failed')

      // Status shows error, but isAvailable remains true because memory store is functional
      const status = adapterWithUri.getStatus()
      expect(status.isAvailable).toBe(true)
      expect(status.projector).toBe('neo4j-optional')
      expect(status.error).toContain('Neo4j sync failed')

      // Cleanup env
      delete process.env.NEO4J_URI
      delete process.env.NEO4J_USER
      delete process.env.NEO4J_PASSWORD
    })
  })

  describe('Graph Topology Diagnostics', () => {
    it('detects orphan pages with inDegree = 0', () => {
      const store = new MemoryGraphStore()
      store.upsertContent({
        id: 'orphan-1',
        title: 'Lonely Orphan Page',
        slug: 'lonely-orphan',
        canonicalPath: '/articles/lonely-orphan',
        contentType: 'article',
        status: 'published',
        wordCount: 500,
        publishedAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
        contentRevision: 'rev-orph-1',
        topics: [],
        entities: [],
        isHub: false,
      })

      store.upsertContent({
        id: 'linked-1',
        title: 'Well Linked Page',
        slug: 'well-linked',
        canonicalPath: '/articles/well-linked',
        contentType: 'article',
        status: 'published',
        wordCount: 500,
        publishedAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
        contentRevision: 'rev-link-1',
        topics: [],
        entities: [],
        isHub: false,
      })

      store.upsertContent({
        id: 'source-1',
        title: 'Source Page',
        slug: 'source-page',
        canonicalPath: '/articles/source-page',
        contentType: 'article',
        status: 'published',
        wordCount: 500,
        publishedAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
        contentRevision: 'rev-src-1',
        topics: [],
        entities: [],
        isHub: false,
      })

      store.addLink({
        sourceId: 'source-1',
        targetId: 'linked-1',
        anchor: 'read well linked',
        href: '/articles/well-linked',
        placement: 'Paragraph 1',
      })

      const orphans = detectOrphanPages(store)
      const orphanIds = orphans.map((o) => o.contentId)
      expect(orphanIds).toContain('orphan-1')
      expect(orphanIds).toContain('source-1')
      expect(orphanIds).not.toContain('linked-1')
    })

    it('detects weak topic clusters with low link density or missing hub', () => {
      const store = new MemoryGraphStore()
      store.upsertTopic({ id: 'top-dense', name: 'Dense Topic', slug: 'dense-topic' })
      store.upsertTopic({ id: 'top-weak', name: 'Weak Topic', slug: 'weak-topic' })

      // Dense topic has hub and bidirectional links
      store.upsertContent({
        id: 'd-hub',
        title: 'Dense Hub',
        slug: 'dense-hub',
        canonicalPath: '/dense/hub',
        contentType: 'article',
        status: 'published',
        wordCount: 1000,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-dh',
        topics: ['top-dense'],
        entities: [],
        isHub: true,
      })
      store.upsertContent({
        id: 'd-spoke',
        title: 'Dense Spoke',
        slug: 'dense-spoke',
        canonicalPath: '/dense/spoke',
        contentType: 'article',
        status: 'published',
        wordCount: 800,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-ds',
        topics: ['top-dense'],
        entities: [],
        isHub: false,
      })
      store.addLink({
        sourceId: 'd-hub',
        targetId: 'd-spoke',
        anchor: 'spoke',
        href: '/dense/spoke',
        placement: 'P1',
      })
      store.addLink({
        sourceId: 'd-spoke',
        targetId: 'd-hub',
        anchor: 'hub',
        href: '/dense/hub',
        placement: 'P1',
      })

      // Weak topic has multiple articles but 0 internal links and no hub
      store.upsertContent({
        id: 'w-1',
        title: 'Weak Article 1',
        slug: 'weak-1',
        canonicalPath: '/weak/1',
        contentType: 'article',
        status: 'published',
        wordCount: 600,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-w1',
        topics: ['top-weak'],
        entities: [],
        isHub: false,
      })
      store.upsertContent({
        id: 'w-2',
        title: 'Weak Article 2',
        slug: 'weak-2',
        canonicalPath: '/weak/2',
        contentType: 'article',
        status: 'published',
        wordCount: 600,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-w2',
        topics: ['top-weak'],
        entities: [],
        isHub: false,
      })

      const weakClusters = detectWeakTopicClusters(store)
      const weakTopicIds = weakClusters.map((w) => w.topicId)
      expect(weakTopicIds).toContain('top-weak')
      expect(weakTopicIds).not.toContain('top-dense')

      const weakFinding = weakClusters.find((w) => w.topicId === 'top-weak')
      expect(weakFinding?.internalLinkDensity).toBe(0)
      expect(weakFinding?.hubContentId).toBeNull()
      expect(weakFinding?.recommendation).toContain('lacks a dedicated hub')
    })

    it('detects missing hub-to-spoke and spoke-to-hub relationships', () => {
      const store = new MemoryGraphStore()
      store.upsertTopic({ id: 'top-hub', name: 'Hub Spoke Topic', slug: 'hub-spoke-topic' })

      store.upsertContent({
        id: 'hub-1',
        title: 'Pillar Hub Page',
        slug: 'pillar-hub',
        canonicalPath: '/topic/pillar',
        contentType: 'article',
        status: 'published',
        wordCount: 1500,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-hub1',
        topics: ['top-hub'],
        entities: [],
        isHub: true,
      })

      store.upsertContent({
        id: 'spoke-1',
        title: 'Spoke Subtopic One',
        slug: 'spoke-one',
        canonicalPath: '/topic/spoke-one',
        contentType: 'article',
        status: 'published',
        wordCount: 800,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-spk1',
        topics: ['top-hub'],
        entities: [],
        isHub: false,
      })

      // Spoke links to hub, but hub does NOT link to spoke
      store.addLink({
        sourceId: 'spoke-1',
        targetId: 'hub-1',
        anchor: 'back to pillar',
        href: '/topic/pillar',
        placement: 'Paragraph 1',
      })

      const missing = detectMissingHubRelationships(store)
      expect(missing.length).toBe(1)
      expect(missing[0]?.missingDirection).toBe('hub_to_spoke')
      expect(missing[0]?.hubId).toBe('hub-1')
      expect(missing[0]?.spokeId).toBe('spoke-1')
    })
  })

  describe('Link Opportunity Detection & Negative Constraints', () => {
    it('scores opportunities using explainable signals and avoids negative constraints', async () => {
      const store = new MemoryGraphStore()

      store.upsertTopic({ id: 'top-tech', name: 'Modern Web Architecture', slug: 'web-arch' })
      store.upsertEntity({
        id: 'ent-jam',
        name: 'Jamstack Framework',
        slug: 'jamstack-framework',
        entityType: 'concept',
        externalId: 'ext-jam',
      })

      // Source page
      store.upsertContent({
        id: 'src-1',
        title: 'Frontend Frameworks Guide',
        slug: 'frontend-frameworks',
        canonicalPath: '/guides/frontend-frameworks',
        contentType: 'article',
        status: 'published',
        wordCount: 900,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-src',
        topics: ['top-tech'],
        entities: ['ent-jam'],
        isHub: false,
      })

      // Valid target (high overlap)
      store.upsertContent({
        id: 'tgt-valid',
        title: 'Jamstack Architecture Overview',
        slug: 'jamstack-overview',
        canonicalPath: '/articles/jamstack-overview',
        contentType: 'article',
        status: 'published',
        wordCount: 1200,
        publishedAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        contentRevision: 'rev-tgt',
        topics: ['top-tech'],
        entities: ['ent-jam'],
        isHub: true,
      })

      // Draft target (MUST be ignored)
      store.upsertContent({
        id: 'tgt-draft',
        title: 'Draft Post on Web',
        slug: 'draft-post',
        canonicalPath: '/articles/draft-post',
        contentType: 'article',
        status: 'draft',
        wordCount: 400,
        publishedAt: null,
        updatedAt: '2026-09-02T00:00:00.000Z',
        contentRevision: 'rev-draft',
        topics: ['top-tech'],
        entities: ['ent-jam'],
        isHub: false,
      })

      // Redirect target (MUST be ignored)
      store.upsertContent({
        id: 'tgt-redirect',
        title: 'Old Web Path',
        slug: 'old-web-path',
        canonicalPath: '/articles/old-web-path',
        contentType: 'article',
        status: 'published',
        wordCount: 500,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-redir',
        topics: ['top-tech'],
        entities: ['ent-jam'],
        isHub: false,
      })

      const redirectSources = new Set(['/articles/old-web-path'])

      const opportunities = await detectLinkOpportunities(store, undefined, {
        siteId: 'site-test',
        redirectSources,
      })

      // Verify draft target was ignored
      const targets = opportunities.map((o) => o.target.id)
      expect(targets).not.toContain('tgt-draft')

      // Verify redirect target was ignored
      expect(targets).not.toContain('tgt-redirect')

      // Verify self-links were avoided
      for (const opp of opportunities) {
        expect(opp.source.id).not.toBe(opp.target.id)
      }

      // Verify valid opportunity was found with explainable signals
      const validOpp = opportunities.find(
        (o) => o.source.id === 'src-1' && o.target.id === 'tgt-valid',
      )
      expect(validOpp).toBeDefined()
      expect(validOpp?.score).toBeGreaterThan(0.5)
      expect(validOpp?.signals.topicOverlap).toBe(1.0)
      expect(validOpp?.signals.entityOverlap).toBe(1.0)
      expect(validOpp?.anchor).toBe('Jamstack Framework') // Used shared entity
      expect(validOpp?.reason).toContain('topic')
    })
  })

  describe('Link Application, Concurrency & Rollback', () => {
    it('safely inserts link into Lexical richText AST preserving existing nodes', () => {
      const initialBody = {
        root: {
          type: 'root',
          children: [
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: 'Overview of Systems' }],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'We recommend reading our microservices guide for architectural clarity.',
                },
              ],
            },
          ],
        },
      }

      const { updatedBody, appliedAnchor } = insertLinkIntoLexicalBody(
        initialBody,
        '/articles/microservices',
        'microservices guide',
      )

      expect(appliedAnchor).toBe('microservices guide')

      const root = (updatedBody as { root: { children: Array<Record<string, unknown>> } }).root
      expect(root.children.length).toBe(2)

      // Heading remains completely intact
      expect(root.children[0]?.type).toBe('heading')

      // Paragraph contains beforeText, link, afterText
      const p = root.children[1]
      expect(p?.type).toBe('paragraph')
      const pChildren = p?.children as Array<Record<string, unknown>>
      expect(pChildren.length).toBe(3)
      expect(pChildren[0]?.text).toBe('We recommend reading our ')
      expect(pChildren[1]?.type).toBe('link')
      expect((pChildren[1]?.fields as Record<string, unknown>)?.url).toBe('/articles/microservices')
      expect(pChildren[2]?.text).toBe(' for architectural clarity.')
    })

    it('enforces revision concurrency lock and aborts if content was modified', async () => {
      const sourceDoc = {
        id: 'src-conc',
        site: 'site-conc',
        title: 'Concurrent Article',
        canonicalPath: '/concurrent',
        body: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Original concurrent text.' }],
              },
            ],
          },
        },
      }

      const targetDoc = {
        id: 'tgt-conc',
        title: 'Target Page',
        canonicalPath: '/target',
      }

      const mockPayload = {
        findByID: vi.fn().mockImplementation(async ({ id }) => {
          if (id === 'src-conc') return sourceDoc
          if (id === 'tgt-conc') return targetDoc
          return null
        }),
      } as unknown as Payload

      // Expect revision mismatch
      await expect(
        applyLinkOpportunity(mockPayload, {
          sourceContentId: 'src-conc',
          targetContentId: 'tgt-conc',
          expectedRevision: 'stale-wrong-revision-hash',
          anchorText: 'Target Page',
          userId: 'user-1',
        }),
      ).rejects.toThrow('Revision conflict')
    })

    it('records auditable execution and supports rollback to exact previous AST', async () => {
      const initialBody = {
        root: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Intro paragraph.' }],
            },
          ],
        },
      }

      let currentSourceBody = initialBody
      const executionRecords: Record<string, unknown>[] = []

      const sourceDoc = {
        id: 'src-rb',
        site: 'site-rb',
        title: 'Rollback Test Page',
        canonicalPath: '/rollback-test',
        body: currentSourceBody,
      }

      const targetDoc = {
        id: 'tgt-rb',
        site: 'site-rb',
        title: 'Target Rollback Page',
        canonicalPath: '/target-rb',
      }

      const initialBodyText = extractPlainTextFromBody(initialBody)
      const expectedRevision = computeContentFingerprint(sourceDoc, initialBodyText)

      const mockPayload = {
        findByID: vi.fn().mockImplementation(async ({ collection, id }) => {
          if (collection === 'content' && id === 'src-rb') {
            return { ...sourceDoc, body: currentSourceBody }
          }
          if (collection === 'content' && id === 'tgt-rb') {
            return targetDoc
          }
          if (collection === 'intelligence-executions' && id === 'exec-1') {
            return executionRecords[0]
          }
          return null
        }),
        find: vi.fn().mockResolvedValue({ docs: [] }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          if (collection === 'intelligence-analyses') {
            return { id: 'analysis-link-1', ...data }
          }
          if (collection === 'intelligence-recommendations') {
            return { id: 'rec-link-1', ...data }
          }
          if (collection === 'intelligence-executions') {
            const exec = { id: 'exec-1', ...data }
            executionRecords.push(exec)
            return exec
          }
          return { id: 'mock-created', ...data }
        }),
        update: vi.fn().mockImplementation(async ({ collection, id, data }) => {
          if (collection === 'content' && id === 'src-rb') {
            currentSourceBody = data.body
            return { ...sourceDoc, body: currentSourceBody }
          }
          if (collection === 'intelligence-executions' && id === 'exec-1') {
            const exec = executionRecords[0]
            if (exec) Object.assign(exec, data)
            return exec
          }
          return data
        }),
      } as unknown as Payload

      // 1. Apply Link
      const applyResult = await applyLinkOpportunity(mockPayload, {
        sourceContentId: 'src-rb',
        targetContentId: 'tgt-rb',
        expectedRevision,
        anchorText: 'Target Rollback Page',
        userId: 'user-admin',
      })

      expect(applyResult.success).toBe(true)
      expect(applyResult.executionId).toBe('exec-1')
      expect(executionRecords.length).toBe(1)
      expect(executionRecords[0]?.status).toBe('applied')

      // Body was updated with link
      const updatedBodyText = extractPlainTextFromBody(currentSourceBody)
      expect(updatedBodyText).toContain('Target Rollback Page')

      // 2. Rollback Link
      const rollbackResult = await rollbackLinkExecution(mockPayload, 'exec-1', 'user-admin')

      expect(rollbackResult.success).toBe(true)
      expect(executionRecords[0]?.status).toBe('reverted')
      expect(currentSourceBody).toEqual(initialBody)

      // 3. Attempting to rollback again fails
      await expect(rollbackLinkExecution(mockPayload, 'exec-1', 'user-admin')).rejects.toThrow(
        'Only "applied" executions can be rolled back',
      )
    })

    it('processes bulk reviews (accept, dismiss, edit)', async () => {
      const mockOpportunities = [
        {
          id: 'opp-1',
          sourceContentId: 'c1',
          targetContentId: 'c2',
          expectedRevision: 'rev-1',
          anchorText: 'Anchor 1',
        },
        {
          id: 'opp-2',
          sourceContentId: 'c1',
          targetContentId: 'c3',
          expectedRevision: 'rev-1',
          anchorText: 'Anchor 2',
        },
      ]

      const mockPayload = {} as unknown as Payload

      const bulkResult = await bulkReviewLinkOpportunities(
        mockPayload,
        [
          { id: 'opp-1', action: 'accept' },
          { id: 'opp-2', action: 'dismiss' },
          { id: 'opp-3', action: 'edit', editedAnchor: 'Custom Anchor' },
        ],
        'user-1',
        {
          findOpportunity: async (id) => mockOpportunities.find((o) => o.id === id) || null,
        },
      )

      expect(bulkResult.processed).toBe(3)
      expect(bulkResult.dismissed).toBe(1)
      expect(bulkResult.accepted).toBe(2)
    })
  })
})
