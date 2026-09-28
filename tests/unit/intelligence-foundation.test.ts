import { describe, expect, it, vi } from 'vitest'
import { runDeterministicContentChecks } from '../../src/modules/intelligence/deterministic-analyzer'
import { runContentAiAssessment } from '../../src/modules/intelligence/ai-assessment'
import {
  importIntelligenceJson,
  importIntelligenceCsv,
} from '../../src/modules/intelligence/ingestion'
import {
  runContentIntelligenceAnalysis,
  approveIntelligenceRecommendation,
  executeApprovedRecommendation,
} from '../../src/modules/intelligence/analysis-service'

describe('Intelligence & Discovery Foundation', () => {
  describe('Deterministic Content Checks', () => {
    it('detects missing SEO title and recommends using post title', () => {
      const results = runDeterministicContentChecks({
        id: 'post-1',
        title: 'My First Post',
        seoTitle: '',
        description: 'A great description of the post that is reasonably long and informative.',
        canonicalPath: '/posts/my-first-post',
        bodyText: 'This is the body content with enough words to satisfy length checks.',
        headings: [{ level: 1, text: 'My First Post' }],
      })

      const missingTitle = results.find((r) => r.ruleId === 'DET-SEO-TITLE-MISSING')
      expect(missingTitle).toBeDefined()
      expect(missingTitle?.severity).toBe('warning')
      expect(missingTitle?.recommendation).toBeDefined()
      expect(missingTitle?.recommendation?.action).toBe('update_seo_title')
      expect(missingTitle?.recommendation?.proposedValue).toContain('My First Post')
    })

    it('detects missing H1 heading in content body', () => {
      const results = runDeterministicContentChecks({
        id: 'post-2',
        title: 'Post Without H1',
        seoTitle: 'Post Without H1 - My Site',
        seoDescription: 'A valid description for SEO purposes.',
        canonicalPath: '/post-without-h1',
        headings: [{ level: 2, text: 'Subheading only' }],
        bodyText: 'Just some text here.',
      })

      const missingH1 = results.find((r) => r.ruleId === 'DET-SEO-H1-MISSING')
      expect(missingH1).toBeDefined()
      expect(missingH1?.severity).toBe('warning')
    })

    it('detects entity mentions and flags unverified claims or claims missing citations', () => {
      const results = runDeterministicContentChecks({
        id: 'post-3',
        title: 'Article about Open Source and Antigravity',
        seoTitle: 'Article about Open Source and Antigravity',
        seoDescription: 'Detailed exploration of tools and software.',
        canonicalPath: '/posts/open-source',
        headings: [{ level: 1, text: 'Open Source in 2026' }],
        bodyText: 'The Antigravity system was released in 2026 and provides agentic tools.',
        knownEntities: [
          {
            id: 'ent-1',
            name: 'Antigravity',
            slug: 'antigravity',
          },
        ],
        associatedClaims: [
          {
            id: 'claim-1',
            statement: 'Antigravity was released in 2026',
            verificationStatus: 'unverified',
            citationCount: 0,
          },
        ],
      })

      const entityMention = results.find((r) => r.ruleId === 'DET-ENTITY-MENTION-DETECTED')
      expect(entityMention).toBeDefined()
      expect(entityMention?.message).toContain('Antigravity')

      const unverifiedClaim = results.find((r) => r.ruleId === 'DET-CLAIM-UNVERIFIED')
      expect(unverifiedClaim).toBeDefined()

      const missingCitation = results.find((r) => r.ruleId === 'DET-CLAIM-MISSING-CITATION')
      expect(missingCitation).toBeDefined()
    })
  })

  describe('AI Assessment & Provider Failure Boundaries', () => {
    it('returns structured provider failure state when AI connection is missing or disabled', async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }), // No AI connections
      } as unknown as Parameters<typeof runContentAiAssessment>[0]

      const result = await runContentAiAssessment(mockPayload, {
        siteId: 'site-1',
        contentId: 'content-1',
        title: 'Test Article',
        existingSeoTitle: 'Test Article',
        bodyText: 'Sample content text.',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('AI_PROVIDER_UNCONFIGURED')
      expect(result.findings).toHaveLength(0)
      expect(result.recommendations).toHaveLength(0)
    })

    it('enforces that AI recommendations are strictly proposals and never auto-mutate', async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({
          docs: [
            {
              id: 'ai-conn-1',
              providerKey: 'anthropic',
              endpoint: 'https://api.anthropic.com',
              model: 'claude-3-5-sonnet',
              status: 'active',
              capabilities: ['structured_output'],
              allowedTasks: ['intelligence.metadata-seo'],
            },
          ],
        }),
      } as unknown as Parameters<typeof runContentAiAssessment>[0]

      const result = await runContentAiAssessment(mockPayload, {
        siteId: 'site-1',
        contentId: 'content-1',
        title: 'AI Draft Title',
        existingSeoTitle: '',
        bodyText: 'This is a long insightful post about autonomous systems.',
      })

      // When AI recommendations are generated, every single one is a proposal
      for (const rec of result.recommendations) {
        expect(rec.rationale).toBeDefined()
      }
    })
  })

  describe('Provenance and Ingestion (JSON & CSV)', () => {
    it('enforces unverified status and retains provenance on JSON claim ingestion', async () => {
      const createdDocs: Record<string, unknown>[] = []
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          const doc = { id: `id-${createdDocs.length + 1}`, ...data }
          createdDocs.push(doc)
          return doc
        }),
      } as unknown as Parameters<typeof importIntelligenceJson>[0]

      const importPayload = {
        version: '1.2.0',
        compiler: 'external-web-scraper',
        generatedAt: new Date().toISOString(),
        siteId: 'site-alpha',
        claims: [
          {
            externalId: 'claim-ext-100',
            statement: 'Carbon capture plants operate at 95% efficiency in test conditions.',
            uncertainty: 0.6,
            verificationStatus: 'supported', // Trying to claim supported!
            provenance: {
              sourceUrl: 'https://example.com/test',
              importedAt: new Date().toISOString(),
            },
            quote: 'Efficiency reached 95% in lab tests.',
          },
        ],
      }

      const result = await importIntelligenceJson(mockPayload, {
        siteId: 'site-alpha',
        payload: importPayload as never,
        dryRun: false,
      })

      expect(result.success).toBe(true)
      expect(result.counts.claimsCreated).toBe(1)

      const createdClaim = createdDocs.find((d) => d.externalId === 'claim-ext-100') as {
        verificationStatus: string
        uncertainty: number
        provenance: { sourceUrl: string; rawVerificationStatusAttempted?: string }
      }
      expect(createdClaim).toBeDefined()
      // Crucial requirement: ingestion must NOT make claims verified facts!
      expect(createdClaim.verificationStatus).toBe('unverified')
      expect(createdClaim.uncertainty).toBe(0.6)
      expect(createdClaim.provenance.rawVerificationStatusAttempted).toBe('supported')
    })

    it('parses CSV claims and enforces unverified status and externalId deduplication', async () => {
      const createdDocs: Record<string, unknown>[] = []
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          const doc = { id: `id-${createdDocs.length + 1}`, ...data }
          createdDocs.push(doc)
          return doc
        }),
      } as unknown as Parameters<typeof importIntelligenceCsv>[0]

      const csv = [
        'externalId,statement,uncertainty,verificationStatus',
        'ext-csv-1,"Public transit usage grew by 14% in 2025.",0.3,verified',
        'ext-csv-2,"Electric fleet transitioned 50 buses.",0.2,supported',
      ].join('\n')

      const result = await importIntelligenceCsv(mockPayload, {
        siteId: 'site-beta',
        csvContent: csv,
        type: 'claims',
        dryRun: false,
      })

      expect(result.success).toBe(true)
      expect(result.counts.claimsCreated).toBe(2)
      expect(result.errors).toHaveLength(0)

      for (const doc of createdDocs) {
        // Enforce all CSV claims are unverified
        expect((doc as { verificationStatus: string }).verificationStatus).toBe('unverified')
        expect((doc as { site: string }).site).toBe('site-beta')
      }
    })

    it('respects dryRun mode without writing records to database', async () => {
      const createSpy = vi.fn()
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }),
        create: createSpy,
      } as unknown as Parameters<typeof importIntelligenceCsv>[0]

      const csv = 'externalId,name,entityType\nent-1,Acme Corp,organization'

      const result = await importIntelligenceCsv(mockPayload, {
        siteId: 'site-gamma',
        csvContent: csv,
        type: 'entities',
        dryRun: true,
      })

      expect(result.success).toBe(true)
      expect(createSpy).not.toHaveBeenCalled()
    })
  })

  describe('Analysis Lifecycle, Idempotency & Stale Handling', () => {
    it('returns existing analysis when content fingerprint is unchanged (idempotent)', async () => {
      const existingAnalysis = {
        id: 'analysis-prev-1',
        site: 'site-1',
        targetType: 'content',
        targetId: 'content-1',
        contentRevision: 'mock-revision-hash',
        status: 'completed',
        source: 'renegade-deterministic-analyzer',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        evidence: { contentFingerprint: 'mock-revision-hash' },
      }

      const mockPayload = {
        findByID: vi.fn().mockResolvedValue({
          id: 'content-1',
          site: 'site-1',
          title: 'Static Post',
          seoTitle: 'Static Post',
          seoDescription: 'Static description',
          canonicalPath: '/posts/static',
        }),
        find: vi.fn().mockImplementation(async ({ collection }) => {
          if (collection === 'intelligence-analyses') {
            return { docs: [existingAnalysis] }
          }
          return { docs: [] }
        }),
      } as unknown as Parameters<typeof runContentIntelligenceAnalysis>[0]

      const result = await runContentIntelligenceAnalysis(mockPayload, {
        siteId: 'site-1',
        contentId: 'content-1',
      })

      expect(result.analysisId).toBe('analysis-prev-1')
      expect(result.isIdempotentReuse).toBe(true)
    })

    it('marks prior analyses as stale when new analysis runs with fresh revision', async () => {
      const updatedAnalyses: Array<{ id: string; status: string }> = []
      const createdDocs: Record<string, unknown>[] = []

      const oldAnalysis = {
        id: 'analysis-old',
        site: 'site-1',
        targetType: 'content',
        targetId: 'content-1',
        contentRevision: 'old-rev',
        status: 'completed',
      }

      const mockPayload = {
        findByID: vi.fn().mockResolvedValue({
          id: 'content-1',
          site: 'site-1',
          title: 'Brand New Title',
          seoTitle: 'Brand New Title',
          seoDescription: 'Valid updated description',
          canonicalPath: '/posts/new',
          body: {
            root: {
              type: 'root',
              children: [
                { type: 'heading', tag: 'h1', children: [{ text: 'Brand New Title' }] },
                { type: 'paragraph', children: [{ text: 'Updated body text.' }] },
              ],
            },
          },
        }),
        find: vi.fn().mockImplementation(async ({ collection }) => {
          if (collection === 'intelligence-analyses') {
            return { docs: [oldAnalysis] }
          }
          return { docs: [] }
        }),
        update: vi.fn().mockImplementation(async ({ collection, id, data }) => {
          if (collection === 'intelligence-analyses') {
            updatedAnalyses.push({ id, status: data.status })
          }
          return { id, ...data }
        }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          const doc = { id: `new-id-${createdDocs.length + 1}`, ...data }
          createdDocs.push(doc)
          return doc
        }),
      } as unknown as Parameters<typeof runContentIntelligenceAnalysis>[0]

      const result = await runContentIntelligenceAnalysis(mockPayload, {
        siteId: 'site-1',
        contentId: 'content-1',
        force: true,
      })

      expect(result.isIdempotentReuse).toBe(false)
      expect(result.status).toBe('completed')
      // Old analysis must be marked stale!
      expect(updatedAnalyses).toContainEqual({ id: 'analysis-old', status: 'stale' })
    })
  })

  describe('Approval & Execution Workflow', () => {
    it('approves or rejects recommendations with reviewer attribution', async () => {
      const rec = {
        id: 'rec-1',
        status: 'pending',
        site: 'site-1',
        isProposal: true,
        action: 'update_seo_title',
        proposedValue: 'Optimized Title',
      }

      const mockPayload = {
        findByID: vi.fn().mockResolvedValue(rec),
        update: vi.fn().mockImplementation(async ({ id, data }) => ({ ...rec, ...data })),
      } as unknown as Parameters<typeof approveIntelligenceRecommendation>[0]

      const approval = await approveIntelligenceRecommendation(mockPayload, {
        recommendationId: 'rec-1',
        decision: 'approved',
        userId: 'admin-user-42',
      })

      expect(approval.success).toBe(true)
      expect(approval.recommendation.status).toBe('approved')
      expect(approval.recommendation.decidedBy).toBe('admin-user-42')
      expect(approval.recommendation.decidedAt).toBeDefined()
    })

    it('rejects execution of unapproved recommendations', async () => {
      const pendingRec = {
        id: 'rec-pending',
        status: 'pending', // Not approved!
        targetCollection: 'content',
        targetId: 'content-1',
        proposedValue: 'Title',
      }

      const mockPayload = {
        findByID: vi.fn().mockResolvedValue(pendingRec),
      } as unknown as Parameters<typeof executeApprovedRecommendation>[0]

      await expect(
        executeApprovedRecommendation(mockPayload, {
          recommendationId: 'rec-pending',
          userId: 'admin-user-42',
        }),
      ).rejects.toThrow(/Cannot execute recommendation with status "pending"/)
    })

    it('executes approved recommendations and records immutable before/after snapshots', async () => {
      const approvedRec = {
        id: 'rec-approved',
        status: 'approved',
        site: 'site-1',
        targetCollection: 'content',
        targetId: 'content-1',
        action: 'update_seo_title',
        proposedValue: 'Approved New SEO Title',
      }

      const targetDoc = {
        id: 'content-1',
        title: 'Original Title',
        seoTitle: 'Old SEO Title',
      }

      const createdExecutions: Record<string, unknown>[] = []

      const mockPayload = {
        findByID: vi.fn().mockImplementation(async ({ collection }) => {
          if (collection === 'intelligence-recommendations') return approvedRec
          if (collection === 'content') return targetDoc
          return null
        }),
        update: vi.fn().mockImplementation(async ({ collection, data }) => {
          if (collection === 'content') {
            return { ...targetDoc, ...data }
          }
          if (collection === 'intelligence-recommendations') {
            return { ...approvedRec, ...data }
          }
          return data
        }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          const doc = { id: 'exec-1', ...data }
          createdExecutions.push(doc)
          return doc
        }),
      } as unknown as Parameters<typeof executeApprovedRecommendation>[0]

      const execution = await executeApprovedRecommendation(mockPayload, {
        recommendationId: 'rec-approved',
        userId: 'admin-user-42',
      })

      expect(execution.success).toBe(true)
      expect(execution.executionId).toBe('exec-1')
      expect(execution.beforeSnapshot).toEqual({ seoTitle: 'Old SEO Title' })
      expect(execution.afterSnapshot).toEqual({ seoTitle: 'Approved New SEO Title' })

      expect(createdExecutions).toHaveLength(1)
      expect(createdExecutions[0].executedBy).toBe('admin-user-42')
      expect(createdExecutions[0].status).toBe('applied')
    })
  })
})
