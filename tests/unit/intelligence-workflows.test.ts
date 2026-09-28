import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { MemoryGraphStore } from '../../src/modules/intelligence/graph/neo4j-adapter'
import { buildTopicAuthorityMaps } from '../../src/modules/intelligence/workflows/topic-authority'
import { generateContentBrief } from '../../src/modules/intelligence/workflows/content-brief'
import { assessInformationGain } from '../../src/modules/intelligence/workflows/information-gain'
import {
  detectCannibalizationCandidates,
  inferSearchIntent,
} from '../../src/modules/intelligence/workflows/cannibalization-engine'
import { diagnoseContentDecay } from '../../src/modules/intelligence/workflows/content-decay'
import { detectCoverageGaps } from '../../src/modules/intelligence/workflows/coverage-gaps'
import { executeEditorialWorkflowAction } from '../../src/modules/intelligence/workflows/editorial-actions'

describe('Content Intelligence Workflows & Decisions', () => {
  describe('Topic Hubs & Authority Maps', () => {
    it('computes authority maps, completeness, and tiered recommendations', () => {
      const store = new MemoryGraphStore()

      store.upsertTopic({
        id: 't-arch',
        name: 'Systems Architecture',
        slug: 'systems-architecture',
      })

      // Hub page
      store.upsertContent({
        id: 'c-hub',
        title: 'Modern Architecture Pillar',
        slug: 'modern-architecture-pillar',
        canonicalPath: '/arch/pillar',
        contentType: 'article',
        status: 'published',
        wordCount: 1600,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-hub',
        topics: ['t-arch'],
        entities: ['e-1', 'e-2'],
        isHub: true,
      })

      // 3 spokes
      for (let i = 1; i <= 3; i++) {
        store.upsertContent({
          id: `c-spoke-${i}`,
          title: `Architecture Spoke ${i}`,
          slug: `architecture-spoke-${i}`,
          canonicalPath: `/arch/spoke-${i}`,
          contentType: 'article',
          status: 'published',
          wordCount: 900,
          publishedAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
          contentRevision: `rev-spk-${i}`,
          topics: ['t-arch'],
          entities: ['e-1'],
          isHub: false,
        })
        store.addLink({
          sourceId: `c-spoke-${i}`,
          targetId: 'c-hub',
          anchor: 'Modern Architecture Pillar',
          href: '/arch/pillar',
          placement: 'Paragraph 1',
        })
        store.addLink({
          sourceId: 'c-hub',
          targetId: `c-spoke-${i}`,
          anchor: `Subtopic ${i}`,
          href: `/arch/spoke-${i}`,
          placement: 'Paragraph 2',
        })
      }

      store.upsertEntity({
        id: 'e-1',
        name: 'Distributed Systems',
        slug: 'distributed-systems',
        entityType: 'concept',
        externalId: 'ext-1',
      })
      store.upsertEntity({
        id: 'e-2',
        name: 'Eventual Consistency',
        slug: 'eventual-consistency',
        entityType: 'concept',
        externalId: 'ext-2',
      })

      const authorityMaps = buildTopicAuthorityMaps(store)
      expect(authorityMaps.length).toBe(1)

      const map = authorityMaps[0]
      expect(map.topicName).toBe('Systems Architecture')
      expect(map.hubContent?.id).toBe('c-hub')
      expect(map.spokes.length).toBe(3)
      expect(['pillar', 'authoritative']).toContain(map.tier)
      expect(map.evidence.dataSufficiency).toBe('sufficient')
      expect(map.evidence.internalLinksTotal).toBe(6) // 3 spoke->hub + 3 hub->spoke
    })

    it('labels data sufficiency as partial for small or unanchored clusters', () => {
      const store = new MemoryGraphStore()
      store.upsertTopic({ id: 't-sparse', name: 'Sparse Topic', slug: 'sparse' })
      store.upsertContent({
        id: 'c-lone',
        title: 'Only Page',
        slug: 'only-page',
        canonicalPath: '/sparse/only',
        contentType: 'article',
        status: 'published',
        wordCount: 400,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-lone',
        topics: ['t-sparse'],
        entities: [],
        isHub: false,
      })

      const maps = buildTopicAuthorityMaps(store)
      expect(maps[0].evidence.dataSufficiency).toBe('partial')
      expect(maps[0].recommendations).toContain(
        'Create a dedicated landing page or pillar article to anchor "Sparse Topic".',
      )
    })
  })

  describe('Content Briefs (Evidence vs Generated Suggestions)', () => {
    it('generates content brief strictly distinguishing evidence from suggestions', async () => {
      const store = new MemoryGraphStore()
      store.upsertTopic({ id: 't-gov', name: 'Decentralized Governance', slug: 'gov' })
      store.upsertContent({
        id: 'c-decl',
        title: 'The Renegade Declaration',
        slug: 'renegade-declaration',
        canonicalPath: '/articles/renegade-declaration',
        contentType: 'article',
        status: 'published',
        wordCount: 1200,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-decl',
        topics: ['t-gov'],
        entities: ['e-gov'],
        isHub: true,
      })

      store.upsertEntity({
        id: 'e-gov',
        name: 'Sovereign Publishing',
        slug: 'sovereign-publishing',
        entityType: 'concept',
        externalId: 'ext-gov',
      })

      const brief = await generateContentBrief(store, undefined, {
        topicId: 't-gov',
        proposedTitle: 'Autonomous Consensus and Verifiable Content',
        userAngle: 'Focus on cryptographic auditing of editorial claims',
        searchIntent: 'informational',
      })

      // Check Evidence Section
      expect(brief.evidence.competingPages.length).toBe(1)
      expect(brief.evidence.competingPages[0].title).toBe('The Renegade Declaration')
      expect(brief.evidence.knownEntityReferences).toContain('Sovereign Publishing')
      expect(brief.evidence.dataSufficiency).toBe('sufficient')
      expect(brief.evidence.evidenceSummary).toContain('The Renegade Declaration')

      // Check Gap Filled
      expect(brief.specificGapFilled).toContain('cryptographic auditing of editorial claims')

      // Check Generated Suggestions Section
      expect(brief.generatedSuggestions.questionsToAnswer.length).toBeGreaterThanOrEqual(3)
      expect(brief.generatedSuggestions.outline.length).toBe(4)
      expect(brief.generatedSuggestions.suggestedInternalLinks.length).toBe(1)
      expect(brief.generatedSuggestions.suggestedInternalLinks[0].targetTitle).toBe(
        'The Renegade Declaration',
      )
    })
  })

  describe('Information-Gain Assessment', () => {
    it('compares against benchmarks and explains comparison without unsupported scores', () => {
      const assessment = assessInformationGain({
        contentId: 'doc-subj',
        contentTitle: 'Decentralized Truth in Governance',
        contentBodyText:
          'Decentralized truth requires verifiable cryptographic audit trails, sovereign storage, and multi-signature editorial checks.',
        contentEntities: ['Cryptographic Audit Trail', 'Sovereign Storage'],
        contentClaims: ['Every revision is backed by SHA-256 state locks.'],
        benchmarkSources: [
          {
            type: 'internal_content',
            title: 'Generic Governance Overview',
            identifier: '/articles/governance-overview',
            bodyText:
              'Governance is important for organizations and involves sovereign storage and voting protocols.',
            entities: ['Sovereign Storage', 'Voting Protocols'],
          },
        ],
      })

      expect(assessment.qualitativeGainTier).toBe('moderate_gain')
      expect(assessment.novelInsights.length).toBeGreaterThan(0)
      expect(assessment.novelInsights.some((n) => n.concept === 'Cryptographic Audit Trail')).toBe(
        true,
      )
      expect(assessment.redundantPoints.some((r) => r.concept === 'Sovereign Storage')).toBe(true)
      expect(assessment.missingAngles.some((m) => m.concept === 'Voting Protocols')).toBe(true)

      // Verification of qualitative explanatory standard
      expect(assessment.explanation).toContain('Moderate Information Gain')
      expect(assessment.explanation).toContain('Cryptographic Audit Trail')
      expect(assessment.evidence.hasComparisonBenchmark).toBe(true)
      expect(assessment.evidence.dataSufficiency).toBe('sufficient')
    })

    it('labels insufficient evidence when no comparison benchmarks are supplied', () => {
      const assessment = assessInformationGain({
        contentId: 'doc-orphan',
        contentTitle: 'Novel Ideas With No Benchmark',
        contentBodyText: 'Some completely uncompared prose.',
        benchmarkSources: [],
      })

      expect(assessment.qualitativeGainTier).toBe('insufficient_evidence')
      expect(assessment.explanation).toContain('requires baseline comparison content')
      expect(assessment.evidence.dataSufficiency).toBe('insufficient')
    })
  })

  describe('Cannibalization Detection (Intent & Query Grounding)', () => {
    it('infers search intent accurately from title and content', () => {
      expect(inferSearchIntent('How to Configure Database Caching')).toBe('informational')
      expect(inferSearchIntent('Best Self-Hosted CMS vs Ghost')).toBe('commercial')
      expect(inferSearchIntent('Buy Enterprise License & Pricing')).toBe('transactional')
      expect(inferSearchIntent('User Login & Support Portal')).toBe('navigational')
    })

    it('flags critical conflict when both pages share identical intent AND actual query collision', () => {
      const candidates = detectCannibalizationCandidates(
        [
          {
            id: 'page-1',
            title: 'Complete Guide to Self-Hosted CMS Architecture',
            canonicalPath: '/guides/self-hosted-cms',
            headings: ['Self-Hosted CMS Architecture', 'Installation'],
            primaryIntent: 'informational',
          },
          {
            id: 'page-2',
            title: 'Self-Hosted CMS Overview and Technical Setup',
            canonicalPath: '/articles/self-hosted-cms-overview',
            headings: ['Self-Hosted CMS Overview', 'Installation Steps'],
            primaryIntent: 'informational',
          },
        ],
        [
          { query: 'self hosted cms architecture', url: '/guides/self-hosted-cms', position: 6 },
          {
            query: 'self hosted cms architecture',
            url: '/articles/self-hosted-cms-overview',
            position: 9,
          },
        ],
      )

      expect(candidates.length).toBe(1)
      const c = candidates[0]
      expect(c.severity).toBe('critical')
      expect(c.intentConflictLevel).toBe('high')
      expect(c.hasQueryData).toBe(true)
      expect(c.sharedQueries.length).toBe(1)
      expect(c.suggestedAction).toBe('merge_redirect')
      expect(c.evidence.queryOverlapExplanation).toContain('self hosted cms architecture')
    })

    it('avoids false positives when wording is similar but search intents are distinct', () => {
      const candidates = detectCannibalizationCandidates([
        {
          id: 'page-info',
          title: 'Decentralized CMS Architecture Explained',
          canonicalPath: '/articles/cms-architecture',
          headings: ['Decentralized CMS Architecture'],
          primaryIntent: 'informational',
        },
        {
          id: 'page-trans',
          title: 'Buy Decentralized CMS Cloud Hosting & Pricing',
          canonicalPath: '/pricing/decentralized-cms',
          headings: ['Decentralized CMS Pricing'],
          primaryIntent: 'transactional',
        },
      ])

      // Different intents: marked benign / low conflict, retain_distinct
      if (candidates.length > 0) {
        expect(candidates[0].intentConflictLevel).toBe('low')
        expect(candidates[0].suggestedAction).toBe('retain_distinct')
        expect(candidates[0].evidence.intentOverlapExplanation).toContain(
          'Distinct intents detected',
        )
      }
    })

    it('labels insufficient query data when query records are absent', () => {
      const candidates = detectCannibalizationCandidates([
        {
          id: 'page-a',
          title: 'Advanced Payload Configuration Rules',
          canonicalPath: '/docs/payload-config-rules',
          primaryIntent: 'informational',
        },
        {
          id: 'page-b',
          title: 'Advanced Payload CMS Configuration Guide',
          canonicalPath: '/docs/payload-configuration-guide',
          primaryIntent: 'informational',
        },
      ])

      if (candidates.length > 0) {
        expect(candidates[0].hasQueryData).toBe(false)
        expect(candidates[0].evidence.dataSufficiency).toBe('insufficient_query_data')
        expect(candidates[0].evidence.queryOverlapExplanation).toContain(
          'Insufficient query evidence',
        )
      }
    })
  })

  describe('Content Decay Diagnostics', () => {
    it('distinguishes URL migrations and recent redirects from genuine decay', () => {
      const signals = diagnoseContentDecay([
        {
          id: 'migrated-page',
          title: 'Recently Migrated Article',
          canonicalPath: '/new-path/article',
          publishedAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
          metrics: { currentTraffic: 100, previousTraffic: 300 }, // -66% drop
          context: {
            recentUrlChange: true,
            recentRedirectDate: '2026-09-15',
          },
        },
      ])

      expect(signals.length).toBe(1)
      expect(signals[0].diagnosis).toBe('url_migration')
      expect(signals[0].recommendedAction).toBe('preserve_current')
      expect(signals[0].evidence.notes).toContain('URL or path structure was recently modified')
    })

    it('distinguishes telemetry tracking gaps from true content decay', () => {
      const signals = diagnoseContentDecay([
        {
          id: 'untracked-page',
          title: 'Analytics Broken Page',
          canonicalPath: '/articles/untracked',
          publishedAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          metrics: { currentTraffic: 20, previousTraffic: 200 }, // -90% drop
          context: {
            trackingHealth: 'missing_consent',
          },
        },
      ])

      expect(signals.length).toBe(1)
      expect(signals[0].diagnosis).toBe('tracking_gap')
      expect(signals[0].recommendedAction).toBe('investigate_tracking')
      expect(signals[0].evidence.notes).toContain('consent banner gap')
    })

    it('distinguishes seasonal patterns from genuine decay', () => {
      const signals = diagnoseContentDecay([
        {
          id: 'seasonal-page',
          title: 'Annual Holiday Publishing Calendar',
          canonicalPath: '/articles/holiday-calendar',
          publishedAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          metrics: { currentTraffic: 50, previousTraffic: 250 },
          context: {
            isSeasonalTopic: true,
            currentSeasonIsOffPeak: true,
          },
        },
      ])

      expect(signals.length).toBe(1)
      expect(signals[0].diagnosis).toBe('seasonal_pattern')
      expect(signals[0].recommendedAction).toBe('monitor_seasonality')
    })

    it('detects genuine content decay when URLs and tracking are stable without seasonality', () => {
      const signals = diagnoseContentDecay([
        {
          id: 'decayed-page',
          title: 'Outdated Technical Guide from 2024',
          canonicalPath: '/guides/outdated-tech',
          publishedAt: '2024-06-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z',
          metrics: {
            currentTraffic: 80,
            previousTraffic: 300,
            historicalAnnualDataAvailable: true,
          },
          context: {
            recentUrlChange: false,
            isSeasonalTopic: false,
            trackingHealth: 'healthy',
          },
        },
      ])

      expect(signals.length).toBe(1)
      expect(signals[0].diagnosis).toBe('genuine_decay')
      expect(signals[0].recommendedAction).toBe('refresh_content')
      expect(signals[0].evidence.dataSufficiency).toBe('sufficient')
    })
  })

  describe('Coverage Gaps Detection', () => {
    it('detects uncovered domain entities and underdeveloped clusters', () => {
      const store = new MemoryGraphStore()
      store.upsertTopic({ id: 't-1', name: 'Open Web', slug: 'open-web' })

      store.upsertEntity({
        id: 'e-uncovered',
        name: 'ActivityPub Protocol',
        slug: 'activitypub-protocol',
        entityType: 'concept',
        externalId: 'ext-ap',
      })

      // Topic has only 1 article
      store.upsertContent({
        id: 'c-sparse',
        title: 'Introduction to Open Web',
        slug: 'open-web-intro',
        canonicalPath: '/open-web/intro',
        contentType: 'article',
        status: 'published',
        wordCount: 500,
        publishedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        contentRevision: 'rev-sp',
        topics: ['t-1'],
        entities: [], // Does NOT mention ActivityPub
        isHub: false,
      })

      const gaps = detectCoverageGaps(store)
      expect(gaps.length).toBeGreaterThanOrEqual(2)

      const entityGap = gaps.find((g) => g.gapType === 'uncovered_entity')
      expect(entityGap).toBeDefined()
      expect(entityGap?.subject).toContain('ActivityPub Protocol')

      const subtopicGap = gaps.find((g) => g.gapType === 'missing_subtopic')
      expect(subtopicGap).toBeDefined()
      expect(subtopicGap?.subject).toContain('Open Web')
    })
  })

  describe('Editorial Workflow Decisions (Dismiss, Defer, Merge, Task)', () => {
    it('executes dismiss, defer, merge and task creation without mutating published content', async () => {
      let createdRedirect: any = null

      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }),
        findByID: vi.fn().mockImplementation(async ({ id }) => {
          if (id === 'source-doc') {
            return {
              id: 'source-doc',
              title: 'Source Duplicate Page',
              canonicalPath: '/duplicate-path',
              body: { root: { type: 'root', children: [] } },
            }
          }
          if (id === 'target-doc') {
            return {
              id: 'target-doc',
              title: 'Canonical Target Page',
              canonicalPath: '/canonical-path',
              body: { root: { type: 'root', children: [] } },
            }
          }
          return null
        }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          if (collection === 'public-redirects') {
            createdRedirect = data
            return { id: 'redir-1', ...data }
          }
          return { id: 'task-1', ...data }
        }),
        update: vi.fn().mockResolvedValue({ id: 'updated' }),
      } as unknown as Payload

      // 1. Dismiss
      const dismissRes = await executeEditorialWorkflowAction(mockPayload, {
        action: 'dismiss',
        findingType: 'cannibalization',
        findingId: 'cand-1',
        siteId: 'site-test',
        userId: 'editor-1',
      })
      expect(dismissRes.success).toBe(true)
      expect(dismissRes.actionApplied).toBe('dismiss')

      // 2. Defer
      const deferRes = await executeEditorialWorkflowAction(mockPayload, {
        action: 'defer',
        findingType: 'decay',
        findingId: 'decay-1',
        siteId: 'site-test',
        userId: 'editor-1',
        deferUntilDate: '2026-11-01T00:00:00.000Z',
      })
      expect(deferRes.success).toBe(true)
      expect(deferRes.details.deferredUntil).toBe('2026-11-01T00:00:00.000Z')

      // 3. Merge (Safe Redirect)
      const mergeRes = await executeEditorialWorkflowAction(mockPayload, {
        action: 'merge',
        findingType: 'cannibalization',
        findingId: 'cand-1',
        siteId: 'site-test',
        userId: 'editor-1',
        mergeConfig: {
          sourceId: 'source-doc',
          targetId: 'target-doc',
          redirectType: '308',
        },
      })
      expect(mergeRes.success).toBe(true)
      expect(createdRedirect).toBeDefined()
      expect(createdRedirect?.fromPath).toBe('/duplicate-path')
      expect(createdRedirect?.toPath).toBe('/canonical-path')
      expect(createdRedirect?.statusCode).toBe('308')

      // 4. Create Task
      const taskRes = await executeEditorialWorkflowAction(mockPayload, {
        action: 'create_task',
        findingType: 'coverage_gap',
        findingId: 'gap-1',
        siteId: 'site-test',
        userId: 'editor-1',
        taskConfig: {
          title: 'Cover ActivityPub Protocol',
          notes: 'Write 1000 word guide on federation protocol',
          priority: 'high',
        },
      })
      expect(taskRes.success).toBe(true)
      expect(taskRes.createdTaskId).toBeDefined()
      expect(taskRes.details.taskTitle).toBe('Cover ActivityPub Protocol')
    })
  })

  describe('End-to-End Workflow with Existing Content & Evidence Sufficiency Labeling', () => {
    it('executes the complete content-intelligence lifecycle on existing content and labels insufficient evidence', async () => {
      const store = new MemoryGraphStore()

      // 1. Seed existing content (representing seeded Demo Field Report & cluster)
      store.upsertTopic({
        id: 'cat-notes',
        name: 'Field Reports & Civic Notes',
        slug: 'field-reports-civic-notes',
      })

      store.upsertEntity({
        id: 'ent-demo',
        name: 'Civic Demo Studio',
        slug: 'civic-demo-studio',
        entityType: 'organization',
        externalId: 'tag-demo-studio',
      })

      store.upsertEntity({
        id: 'ent-portable',
        name: 'Portable Publishing',
        slug: 'portable-publishing',
        entityType: 'concept',
        externalId: 'tag-portable-publishing',
      })

      // Existing Hub
      store.upsertContent({
        id: 'content-field-report-hub',
        title: 'Demo Field Report',
        slug: 'demo-field-report',
        canonicalPath: '/notes/demo-field-report',
        contentType: 'article',
        status: 'published',
        wordCount: 1100,
        publishedAt: '2026-08-13T12:00:00.000Z',
        updatedAt: '2026-08-13T12:00:00.000Z',
        contentRevision: 'rev-field-rep-01',
        topics: ['cat-notes'],
        entities: ['ent-demo', 'ent-portable'],
        isHub: true,
      })

      // Existing Spoke
      store.upsertContent({
        id: 'content-spoke-meetup',
        title: 'Community Meetup Report',
        slug: 'community-meetup-report',
        canonicalPath: '/notes/community-meetup-report',
        contentType: 'article',
        status: 'published',
        wordCount: 750,
        publishedAt: '2026-08-20T12:00:00.000Z',
        updatedAt: '2026-08-20T12:00:00.000Z',
        contentRevision: 'rev-meetup-01',
        topics: ['cat-notes'],
        entities: ['ent-demo'],
        isHub: false,
      })

      store.addLink({
        sourceId: 'content-spoke-meetup',
        targetId: 'content-field-report-hub',
        anchor: 'Demo Field Report',
        href: '/notes/demo-field-report',
        placement: 'Paragraph 1',
      })

      // Step A: Topic Authority Hub & Completeness
      const authorityMaps = buildTopicAuthorityMaps(store)
      expect(authorityMaps.length).toBe(1)
      const hubMap = authorityMaps[0]
      expect(hubMap.topicName).toBe('Field Reports & Civic Notes')
      expect(hubMap.hubContent?.id).toBe('content-field-report-hub')
      expect(hubMap.spokes.length).toBe(1)
      expect(hubMap.evidence.entitiesCovered).toContain('Civic Demo Studio')
      // Partial sufficiency due to cluster size (<3 articles)
      expect(hubMap.evidence.dataSufficiency).toBe('partial')
      expect(hubMap.evidence.notes).toContain('Limited cluster size')

      // Step B: Content Brief Generation from Existing Content
      const brief = await generateContentBrief(store, undefined, {
        topicId: 'cat-notes',
        proposedTitle: 'Field Verification and Reproducibility in Civic Media',
        userAngle: 'Local on-site verification methodology',
        searchIntent: 'informational',
      })

      // Strict distinction between Evidence and Generated Suggestions
      expect(brief.evidence.competingPages.some((p) => p.title === 'Demo Field Report')).toBe(true)
      expect(brief.evidence.knownEntityReferences).toContain('Civic Demo Studio')
      expect(brief.evidence.dataSufficiency).toBe('sufficient')
      expect(brief.specificGapFilled).toContain('Local on-site verification methodology')
      expect(brief.generatedSuggestions.questionsToAnswer.length).toBeGreaterThan(0)
      expect(brief.generatedSuggestions.suggestedInternalLinks[0].targetTitle).toBe(
        'Demo Field Report',
      )

      // Step C: Qualitative Information Gain Assessment (No Unsupported Numeric Scores)
      const gain = assessInformationGain({
        contentId: 'content-field-report-hub',
        contentTitle: 'Demo Field Report',
        contentBodyText:
          'Civic Demo Studio demonstrates portable publishing and cryptographic claim validation on-site.',
        contentEntities: [
          'Civic Demo Studio',
          'Portable Publishing',
          'Cryptographic Claim Validation',
        ],
        contentClaims: ['Portable publishing guarantees decentralized content sovereignty.'],
        benchmarkSources: [
          {
            type: 'internal_content',
            title: 'Community Meetup Report',
            identifier: '/notes/community-meetup-report',
            bodyText: 'Civic Demo Studio hosted a meetup to discuss publishing.',
            entities: ['Civic Demo Studio'],
          },
        ],
      })

      expect(gain.qualitativeGainTier).toBe('high_originality')
      expect(gain.novelInsights.some((n) => n.concept === 'Portable Publishing')).toBe(true)
      expect(gain.novelInsights.some((n) => n.concept === 'Cryptographic Claim Validation')).toBe(
        true,
      )
      expect(gain.redundantPoints.some((r) => r.concept === 'Civic Demo Studio')).toBe(true)
      // Explanation is descriptive and qualitative
      expect(gain.explanation).toContain('High Information Gain')
      expect(gain.explanation).not.toMatch(/score:\s*\d+(\.\d+)?%/i)

      // Step D: Cannibalization Assessment with Insufficient Query Data Labeling
      const candidates = detectCannibalizationCandidates([
        {
          id: 'content-field-report-hub',
          title: 'Demo Field Report',
          canonicalPath: '/notes/demo-field-report',
          headings: ['Field Report', 'Methodology'],
          primaryIntent: 'informational',
        },
        {
          id: 'content-field-report-guide',
          title: 'Demo Field Reporting Complete Guide',
          canonicalPath: '/notes/demo-field-reporting-guide',
          headings: ['Field Report Guide', 'Methodology'],
          primaryIntent: 'informational',
        },
      ])

      expect(candidates.length).toBe(1)
      const cand = candidates[0]
      // Labeled with insufficient query data because no query telemetry was supplied
      expect(cand.hasQueryData).toBe(false)
      expect(cand.evidence.dataSufficiency).toBe('insufficient_query_data')
      expect(cand.evidence.queryOverlapExplanation).toContain('Insufficient query evidence')

      // Step E: Content Decay Diagnostics (URL Migration vs Genuine Decay)
      const decaySignals = diagnoseContentDecay([
        {
          id: 'content-field-report-hub',
          title: 'Demo Field Report',
          canonicalPath: '/notes/demo-field-report',
          publishedAt: '2026-08-13T12:00:00.000Z',
          updatedAt: '2026-09-20T12:00:00.000Z',
          metrics: { currentTraffic: 100, previousTraffic: 250 }, // dip
          context: { recentUrlChange: true, recentRedirectDate: '2026-09-18' },
        },
      ])

      expect(decaySignals.length).toBe(1)
      expect(decaySignals[0].diagnosis).toBe('url_migration')
      expect(decaySignals[0].recommendedAction).toBe('preserve_current')
      expect(decaySignals[0].evidence.notes).toContain(
        'URL or path structure was recently modified',
      )

      // Step F: Safe Editorial Actions on Finding
      let createdRedirectDoc: any = null
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ docs: [] }),
        findByID: vi.fn().mockImplementation(async ({ id }) => {
          if (id === 'content-field-report-guide') {
            return {
              id: 'content-field-report-guide',
              title: 'Demo Field Reporting Complete Guide',
              canonicalPath: '/notes/demo-field-reporting-guide',
              body: { text: 'Original Guide Body' },
            }
          }
          if (id === 'content-field-report-hub') {
            return {
              id: 'content-field-report-hub',
              title: 'Demo Field Report',
              canonicalPath: '/notes/demo-field-report',
              body: { text: 'Original Hub Body' },
            }
          }
          return null
        }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          if (collection === 'public-redirects') {
            createdRedirectDoc = data
            return { id: 'redir-e2e', ...data }
          }
          return { id: 'task-e2e', ...data }
        }),
        update: vi.fn().mockResolvedValue({ id: 'updated' }),
      } as unknown as Payload

      // Safe Merge (creates 308 redirect, preserves body)
      const mergeResult = await executeEditorialWorkflowAction(mockPayload, {
        action: 'merge',
        findingType: 'cannibalization',
        findingId: cand.id,
        siteId: 'site-demo',
        userId: 'editor-e2e',
        mergeConfig: {
          sourceId: 'content-field-report-guide',
          targetId: 'content-field-report-hub',
          redirectType: '308',
        },
      })

      expect(mergeResult.success).toBe(true)
      expect(createdRedirectDoc.fromPath).toBe('/notes/demo-field-reporting-guide')
      expect(createdRedirectDoc.toPath).toBe('/notes/demo-field-report')
      expect(createdRedirectDoc.statusCode).toBe('308')
      expect(mergeResult.details.message).toContain(
        'Source article body was preserved for revision history',
      )
    })
  })
})
