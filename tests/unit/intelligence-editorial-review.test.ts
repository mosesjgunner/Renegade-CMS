import { describe, expect, it, vi } from 'vitest'
import {
  extractClaimsFromText,
  ingestClaim,
  evaluateSourceFreshness,
  detectConflict,
  attachSourceToClaim,
  applyAutomatedCheckProposal,
  verifyClaimHuman,
  auditJsonLdSchema,
  checkAntiFabrication,
  generateSchemaProposal,
  applyApprovedSchemaProposal,
  generateEditorialIntegrityReport,
  formatReportAsMarkdown,
  type EditorialClaim,
  type CanonicalDocFacts,
  type SiteIdentityFacts,
  type SchemaProposal,
} from '../../src/modules/intelligence/editorial-review'
import type { Payload } from 'payload'

describe('SEO-04 Claim, Citation & Structured-Data Editorial Review Workflows', () => {
  const sampleDocFacts: CanonicalDocFacts = {
    id: 'content-gov-101',
    revision: 'rev-20260925-01',
    title: 'Decentralized Governance and Editorial Accountability',
    canonicalUrl: '/posts/decentralized-governance',
    publishedAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-09-20T15:30:00.000Z',
    summary: 'An investigative study on cryptographic audit trails and editorial consensus.',
    authors: [{ name: 'Elena Rostova', url: 'https://renegade.example.com/authors/elena-rostova' }],
    heroImageUrl: 'https://cdn.example.com/media/governance-hero.jpg',
    section: 'Investigation',
    topics: ['Governance', 'Cryptographic Audits', 'Editorial Policy'],
    pageType: 'Article',
    hasVerifiedReviews: false,
  }

  const sampleSiteFacts: SiteIdentityFacts = {
    name: 'Renegade CMoS',
    url: 'https://renegade.example.com',
    legalName: 'Renegade Publishing Network Inc.',
    logoUrl: 'https://renegade.example.com/logo.png',
  }

  describe('1. Claim Extraction & Ingestion with Provenance and Exact Location', () => {
    it('ingests a factual claim with exact location and provenance metadata', () => {
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Zero-knowledge audits reduce reconciliation overhead by 68%.',
        quote: 'zero-knowledge audits reduce reconciliation overhead by 68%',
        location: {
          paragraphIndex: 3,
          offsetStart: 420,
          offsetEnd: 480,
          sectionPath: 'Implementation > Section 3',
        },
        provenance: {
          source: 'manual_ingest',
          extractorVersion: 'manual-editor-v1',
          extractedBy: 'editor-42',
          rawContext:
            'In our operational benchmarks, zero-knowledge audits reduce reconciliation overhead by 68% across all nodes.',
        },
      })

      expect(claim.id).toMatch(/^claim-/)
      expect(claim.contentId).toBe(sampleDocFacts.id)
      expect(claim.contentRevision).toBe(sampleDocFacts.revision)
      expect(claim.reviewStatus).toBe('unreviewed')
      expect(claim.location.paragraphIndex).toBe(3)
      expect(claim.location.offsetStart).toBe(420)
      expect(claim.location.offsetEnd).toBe(480)
      expect(claim.provenance.source).toBe('manual_ingest')
      expect(claim.provenance.extractedBy).toBe('editor-42')
    })

    it('extracts candidate factual assertions with numeric metrics from prose', () => {
      const prose = `
        Decentralized publishing requires resilient state machines.
        
        According to the 2026 benchmark, distributed verification decreased latency by 45% across 12 participating clusters.
        
        Editorial independence remains our core mission.
      `

      const extracted = extractClaimsFromText(prose, {
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        extractorVersion: 'model-extractor-v1',
        extractedBy: 'ai-assistant',
      })

      expect(extracted.length).toBeGreaterThanOrEqual(1)
      const claim = extracted[0]
      expect(claim.statement).toContain('decreased latency by 45%')
      expect(claim.location.offsetStart).toBeGreaterThan(0)
      expect(claim.location.offsetEnd).toBeGreaterThan(claim.location.offsetStart!)
      expect(claim.provenance.source).toBe('ai_extraction')
      expect(claim.reviewStatus).toBe('unreviewed')
    })
  })

  describe('2. Source Freshness & Outdated Claim Detection', () => {
    it('evaluates fresh sources versus aging and stale sources', () => {
      const fixedNow = new Date('2026-09-25T12:00:00.000Z')

      // Source published 6 months ago (< 1 year)
      const fresh = evaluateSourceFreshness('2026-03-25T12:00:00.000Z', { currentDate: fixedNow })
      expect(fresh.status).toBe('fresh')
      expect(fresh.isStale).toBe(false)
      expect(fresh.ageYears).toBeLessThanOrEqual(1.0)

      // Source published 2 years ago (between 1 and 3 years)
      const aging = evaluateSourceFreshness('2024-09-25T12:00:00.000Z', { currentDate: fixedNow })
      expect(aging.status).toBe('aging')
      expect(aging.isStale).toBe(false)

      // Source published 5 years ago (> 3 years threshold)
      const stale = evaluateSourceFreshness('2021-09-25T12:00:00.000Z', {
        currentDate: fixedNow,
        staleThresholdYears: 3.0,
      })
      expect(stale.status).toBe('stale')
      expect(stale.isStale).toBe(true)
      expect(stale.ageYears).toBeGreaterThanOrEqual(5.0)

      // Undated source
      const undated = evaluateSourceFreshness(undefined)
      expect(undated.status).toBe('undated')
      expect(undated.isStale).toBe(false)
    })

    it('marks claim review status as outdated when all attached citations are stale', () => {
      const fixedNow = new Date('2026-09-25T12:00:00.000Z')
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Cloud storage costs decrease by 10% annually.',
        quote: 'Cloud storage costs decrease by 10% annually.',
        location: { paragraphIndex: 1 },
        provenance: { source: 'manual_ingest' },
      })

      const withStaleSource = attachSourceToClaim(claim, {
        sourceUrl: 'https://archive.example.org/study-2018.pdf',
        title: 'Storage Economics 2018',
        publishedDate: '2018-01-01T00:00:00.000Z',
        stance: 'supports',
        currentDate: fixedNow,
        staleThresholdYears: 3.0,
      })

      expect(withStaleSource.reviewStatus).toBe('outdated')
      expect(withStaleSource.sources[0].freshness.isStale).toBe(true)
    })

    it('upgrades review status from outdated to supported when an updated fresh source is attached', () => {
      const fixedNow = new Date('2026-09-25T12:00:00.000Z')
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Renewable power accounted for 30% of energy consumption.',
        quote: 'Renewable power accounted for 30% of energy consumption.',
        location: { paragraphIndex: 2 },
        provenance: { source: 'manual_ingest' },
      })

      // Attach 8-year-old stale source
      const withStale = attachSourceToClaim(claim, {
        sourceUrl: 'https://archive.energy.gov/report-2018.pdf',
        publishedDate: '2018-01-01T00:00:00.000Z',
        stance: 'supports',
        currentDate: fixedNow,
        staleThresholdYears: 3.0,
      })
      expect(withStale.reviewStatus).toBe('outdated')

      // Attach fresh recent source (< 1 year old)
      const withFresh = attachSourceToClaim(withStale, {
        sourceUrl: 'https://energy.gov/report-2026.pdf',
        publishedDate: '2026-06-01T00:00:00.000Z',
        stance: 'supports',
        currentDate: fixedNow,
        staleThresholdYears: 3.0,
      })
      expect(withFresh.reviewStatus).toBe('supported')
      expect(withFresh.sources.length).toBe(2)
      expect(withFresh.sources.some((s) => !s.freshness.isStale)).toBe(true)
    })
  })

  describe('3. Contradictory Sources & Conflict Detection', () => {
    it('detects direct contradiction when a source is attached with stance contradicts', () => {
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'New protocol reduces transaction fee volatility to zero.',
        quote: 'reduces transaction fee volatility to zero',
        location: { paragraphIndex: 2 },
        provenance: { source: 'manual_ingest' },
      })

      // Attach supporting source first
      const withSupport = attachSourceToClaim(claim, {
        sourceUrl: 'https://whitepaper.example.com/protocol',
        title: 'Protocol Whitepaper',
        stance: 'supports',
      })
      expect(withSupport.reviewStatus).toBe('supported')
      expect(withSupport.conflict.hasConflict).toBe(false)

      // Attach contradicting audit report
      const withContradiction = attachSourceToClaim(withSupport, {
        sourceUrl: 'https://audit.example.com/independent-review',
        title: 'Independent Protocol Audit',
        stance: 'contradicts',
        quote: 'Transaction fee spikes of up to 400% were observed during stress tests.',
      })

      expect(withContradiction.conflict.hasConflict).toBe(true)
      expect(withContradiction.conflict.conflictType).toBe('direct_contradiction')
      expect(withContradiction.conflict.conflictingEvidence.length).toBe(1)
      expect(withContradiction.reviewStatus).toBe('contradicted')
    })

    it('resets a human-verified claim to contradicted when new conflicting evidence is attached', () => {
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Security audit confirmed zero remote code execution vulnerabilities.',
        quote: 'zero remote code execution vulnerabilities',
        location: { paragraphIndex: 3 },
        provenance: { source: 'manual_ingest' },
      })

      const supported = attachSourceToClaim(claim, {
        sourceUrl: 'https://audit.firm.example/v1-clean.pdf',
        stance: 'supports',
      })

      const verified = verifyClaimHuman(
        supported,
        { userId: 'lead-editor', role: 'editor', notes: 'Initial audit verified clean.' },
        'verified',
      )
      expect(verified.reviewStatus).toBe('human_verified')

      // Attaching contradictory evidence later forces status back to contradicted
      const contested = attachSourceToClaim(verified, {
        sourceUrl: 'https://cve.mitre.org/incident-2026.json',
        stance: 'contradicts',
        quote: 'Post-release disclosure identified RCE vector in RPC parsing.',
      })

      expect(contested.reviewStatus).toBe('contradicted')
      expect(contested.conflict.hasConflict).toBe(true)
      expect(contested.conflict.conflictingEvidence.length).toBe(1)

      // Verification is now blocked until contradiction resolved
      expect(() => {
        verifyClaimHuman(contested, { userId: 'lead-editor', role: 'editor' }, 'verified')
      }).toThrow(/Cannot mark claim verified while unresolved contradictory sources exist/)
    })
  })

  describe('4. AI Cannot Auto-Verify & Strict Human Fact Review Separation', () => {
    it('forbids automated AI check from setting reviewStatus to human_verified', () => {
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'The network completed 1 million blocks without a fork.',
        quote: '1 million blocks without a fork',
        location: { paragraphIndex: 1 },
        provenance: { source: 'ai_extraction' },
      })

      // Attempt to exploit automated check by passing human_verified
      expect(() => {
        applyAutomatedCheckProposal(claim, {
          suggestedStatus: 'human_verified' as any,
          rationale: 'AI model agrees with this assertion.',
          modelOrRuleId: 'llm-check-v1',
        })
      }).toThrow(
        /Automated checks are strictly forbidden from setting reviewStatus to human_verified/,
      )

      // Legal automated proposal works without certifying as verified
      const proposed = applyAutomatedCheckProposal(claim, {
        suggestedStatus: 'supported',
        rationale: 'Model found corroborating statements in documentation.',
        modelOrRuleId: 'llm-check-v1',
      })
      expect(proposed.reviewStatus).toBe('supported')
      expect(proposed.automatedCheck?.suggestedStatus).toBe('supported')
      expect(proposed.humanVerification).toBeUndefined()
    })

    it('requires human review to certify claim as verified and preserves reviewer history', () => {
      const claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'The consensus protocol uses BLS signatures for validator aggregation.',
        quote: 'uses BLS signatures for validator aggregation',
        location: { paragraphIndex: 4 },
        provenance: { source: 'manual_ingest' },
      })

      // Human verification fails if no sources are attached
      expect(() => {
        verifyClaimHuman(claim, { userId: 'editor-1', role: 'editor' }, 'verified')
      }).toThrow(/Cannot mark claim verified without at least one supporting source citation/)

      // Human verification fails for unauthorized roles
      expect(() => {
        verifyClaimHuman(claim, { userId: 'user-guest', role: 'guest' as any }, 'verified')
      }).toThrow(/Role 'guest' is not authorized to verify or reject editorial claims/)

      expect(() => {
        verifyClaimHuman(
          claim,
          { userId: 'user-contributor', role: 'contributor' as any },
          'verified',
        )
      }).toThrow(/Role 'contributor' is not authorized to verify or reject editorial claims/)

      // Human verification fails without valid authenticated reviewer context
      expect(() => {
        verifyClaimHuman(claim, null as any, 'verified')
      }).toThrow(/Human verification requires an authenticated human user ID and valid role/)

      // Attach valid supporting source
      const supportedClaim = attachSourceToClaim(claim, {
        sourceUrl: 'https://spec.example.org/bls.pdf',
        title: 'Validator Specification',
        stance: 'supports',
      })

      // Human verification succeeds with editor sign-off
      const verifiedClaim = verifyClaimHuman(
        supportedClaim,
        {
          userId: 'editor-1',
          role: 'editor',
          notes: 'Verified against primary cryptographic specification document.',
        },
        'verified',
      )

      expect(verifiedClaim.reviewStatus).toBe('human_verified')
      expect(verifiedClaim.humanVerification?.verifiedBy).toBe('editor-1')
      expect(verifiedClaim.humanVerification?.decision).toBe('verified')
      expect(verifiedClaim.reviewerHistory.length).toBe(1)
      expect(verifiedClaim.reviewerHistory[0].reviewerId).toBe('editor-1')
      expect(verifiedClaim.reviewerHistory[0].contentRevision).toBe(sampleDocFacts.revision)

      // Subsequent revision preserves previous reviewer history
      const revisedClaim = { ...verifiedClaim, contentRevision: 'rev-20260925-02' }
      const reVerified = verifyClaimHuman(
        revisedClaim,
        {
          userId: 'publisher-99',
          role: 'publisher',
          notes: 'Re-certified for release 2.0.',
        },
        'verified',
      )
      expect(reVerified.reviewerHistory.length).toBe(2)
      expect(reVerified.reviewerHistory[0].reviewerId).toBe('editor-1')
      expect(reVerified.reviewerHistory[1].reviewerId).toBe('publisher-99')
    })

    it('prevents human verification if unresolved contradictory sources exist', () => {
      let claim = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Energy consumption was reduced by 99.9%.',
        quote: 'Energy consumption was reduced by 99.9%',
        location: { paragraphIndex: 1 },
        provenance: { source: 'manual_ingest' },
      })

      claim = attachSourceToClaim(claim, {
        sourceUrl: 'https://source-a.org',
        stance: 'supports',
      })
      claim = attachSourceToClaim(claim, {
        sourceUrl: 'https://source-b.org',
        stance: 'contradicts',
        quote: 'Energy reduction did not exceed 50% under production loads.',
      })

      expect(() => {
        verifyClaimHuman(claim, { userId: 'editor-1', role: 'editor' }, 'verified')
      }).toThrow(/Cannot mark claim verified while unresolved contradictory sources exist/)
    })
  })

  describe('5. JSON-LD Schema Audit & Strict Anti-Fabrication', () => {
    it('detects missing required fields and inconsistently formatted schema', () => {
      const incompleteJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        // Missing: headline, author, datePublished, publisher
      }

      const audit = auditJsonLdSchema({
        pageType: 'Article',
        currentJsonLd: incompleteJsonLd,
        docFacts: sampleDocFacts,
        siteFacts: sampleSiteFacts,
      })

      expect(audit.missingFields).toContain('headline')
      expect(audit.missingFields).toContain('author')
      expect(audit.missingFields).toContain('datePublished')
      expect(audit.missingFields).toContain('publisher')
      expect(audit.isEligibleForRichSnippet).toBe(false)
    })

    it('strictly catches fabricated ratings, fake authors, and hallucinated publication dates', () => {
      const fabricatedJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: sampleDocFacts.title,
        datePublished: '2019-01-01T00:00:00.000Z', // Fabricated date (actual is 2026-03-15)
        author: { '@type': 'Person', name: 'John Doe (Ghostwriter)' }, // Fabricated author (actual is Elena Rostova)
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '1500', // Fabricated rating (document has no verified reviews)
        },
        publisher: { '@type': 'Organization', name: 'Fake Syndicate LLC' }, // Fabricated publisher
      }

      const audit = auditJsonLdSchema({
        pageType: 'Article',
        currentJsonLd: fabricatedJsonLd,
        docFacts: sampleDocFacts,
        siteFacts: sampleSiteFacts,
      })

      expect(audit.antiFabrication.passed).toBe(false)
      const unsupportedFields = audit.antiFabrication.unsupportedFields.map((f) => f.field)
      expect(unsupportedFields).toContain('aggregateRating')
      expect(unsupportedFields).toContain('author')
      expect(unsupportedFields).toContain('datePublished')
      expect(unsupportedFields).toContain('publisher')

      expect(audit.antiFabrication.verifiedGrounding.ratingsVerified).toBe(false)
      expect(audit.antiFabrication.verifiedGrounding.authorVerified).toBe(false)
      expect(audit.antiFabrication.verifiedGrounding.datesVerified).toBe(false)
      expect(audit.antiFabrication.verifiedGrounding.publisherVerified).toBe(false)
    })

    it('generates grounded schema proposal repairing missing fields without fabrication', () => {
      const bareJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
      }

      const audit = auditJsonLdSchema({
        pageType: 'Article',
        currentJsonLd: bareJsonLd,
        docFacts: sampleDocFacts,
        siteFacts: sampleSiteFacts,
      })

      const proposal = generateSchemaProposal({
        audit,
        docFacts: sampleDocFacts,
        siteFacts: sampleSiteFacts,
        proposedBy: 'schema-auditor',
      })

      expect(proposal.validationStatus).toBe('valid')
      expect(proposal.antiFabricationPassed).toBe(true)
      expect(proposal.proposedJsonLd.headline).toBe(sampleDocFacts.title)
      expect(proposal.proposedJsonLd.datePublished).toBe(sampleDocFacts.publishedAt)
      expect((proposal.proposedJsonLd.author as any).name).toBe('Elena Rostova')
      expect((proposal.proposedJsonLd.publisher as any).name).toBe('Renegade CMoS')
      expect(proposal.proposedJsonLd.aggregateRating).toBeUndefined() // Zero fabricated rating
    })
  })

  describe('6. Schema Application through SEO Controls & Revision Lock', () => {
    it('applies approved schema proposal updating structuredDataManual and recording execution snapshot', async () => {
      let updatedPayloadData: any = null
      let executionAuditRecord: any = null

      const mockPayload = {
        findByID: vi.fn().mockResolvedValue({
          id: sampleDocFacts.id,
          updatedAt: sampleDocFacts.revision,
          structuredDataMode: 'none',
          structuredDataVersion: 1,
        }),
        update: vi.fn().mockImplementation(async ({ data }) => {
          updatedPayloadData = data
          return { id: sampleDocFacts.id, ...data }
        }),
        create: vi.fn().mockImplementation(async ({ collection, data }) => {
          if (collection === 'intelligence-executions') {
            executionAuditRecord = data
            return { id: 'exec-rec-1', ...data }
          }
          return { id: 'gen-1' }
        }),
      } as unknown as Payload

      const proposal: SchemaProposal = {
        id: 'prop-123',
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        pageType: 'Article',
        proposedJsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: sampleDocFacts.title,
          author: { '@type': 'Person', name: 'Elena Rostova' },
        },
        additions: {},
        corrections: {},
        removals: [],
        validationStatus: 'valid',
        issues: [],
        antiFabricationPassed: true,
        status: 'pending_review',
        proposedBy: 'audit-engine',
        proposedAt: new Date().toISOString(),
      }

      const res = await applyApprovedSchemaProposal(mockPayload, {
        proposal,
        editorUser: { id: 'editor-1', role: 'editor' },
        expectedRevision: sampleDocFacts.revision,
      })

      expect(res.success).toBe(true)
      expect(res.appliedRevision).toBe('rev-v2')
      expect(updatedPayloadData.structuredDataMode).toBe('manual')
      expect(updatedPayloadData.structuredDataPrimaryType).toBe('Article')
      expect(updatedPayloadData.structuredDataVersion).toBe(2)
      expect(updatedPayloadData.structuredDataManual.headline).toBe(sampleDocFacts.title)

      expect(executionAuditRecord).toBeDefined()
      expect(executionAuditRecord.beforeSnapshot.structuredDataMode).toBe('none')
      expect(executionAuditRecord.afterSnapshot.structuredDataMode).toBe('manual')
      expect(executionAuditRecord.executedBy).toBe('editor-1')
    })

    it('rejects schema application on revision mismatch (optimistic concurrency)', async () => {
      const mockPayload = {
        findByID: vi.fn().mockResolvedValue({
          id: sampleDocFacts.id,
          updatedAt: 'rev-20260925-02-MODIFIED',
        }),
      } as unknown as Payload

      const staleProposal: SchemaProposal = {
        id: 'prop-stale',
        contentId: sampleDocFacts.id,
        contentRevision: 'rev-20260925-01',
        pageType: 'Article',
        proposedJsonLd: {},
        additions: {},
        corrections: {},
        removals: [],
        validationStatus: 'valid',
        issues: [],
        antiFabricationPassed: true,
        status: 'pending_review',
        proposedBy: 'audit-engine',
        proposedAt: new Date().toISOString(),
      }

      await expect(
        applyApprovedSchemaProposal(mockPayload, {
          proposal: staleProposal,
          editorUser: { id: 'editor-1', role: 'editor' },
          expectedRevision: 'rev-20260925-02-MODIFIED',
        }),
      ).rejects.toThrow(/Revision conflict/)
    })
  })

  describe('7. Editorial Integrity Report (Automated vs Human Separation)', () => {
    it('generates report cleanly distinguishing automated validation from human fact review', () => {
      const claim1 = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Claim verified by human.',
        quote: 'Claim verified by human',
        location: { paragraphIndex: 1 },
        provenance: { source: 'manual_ingest' },
      })
      const claim1WithSource = attachSourceToClaim(claim1, {
        sourceUrl: 'https://primary.example.com',
        stance: 'supports',
      })
      const claim1Verified = verifyClaimHuman(
        claim1WithSource,
        { userId: 'chief-editor', role: 'editor', notes: 'Double checked archives.' },
        'verified',
      )

      const claim2 = ingestClaim({
        contentId: sampleDocFacts.id,
        contentRevision: sampleDocFacts.revision,
        statement: 'Claim lacking any citations.',
        quote: 'Claim lacking any citations',
        location: { paragraphIndex: 2 },
        provenance: { source: 'ai_extraction' },
      })

      const report = generateEditorialIntegrityReport({
        contentId: sampleDocFacts.id,
        contentTitle: sampleDocFacts.title,
        contentRevision: sampleDocFacts.revision,
        claims: [claim1Verified, claim2],
      })

      expect(report.summary.totalClaims).toBe(2)
      expect(report.summary.humanVerifiedCount).toBe(1)
      expect(report.summary.unreviewedCount).toBe(1)
      expect(report.humanFactReview.unsupportedClaims.length).toBe(1)

      // Section A: Automated Validation
      expect(report.automatedValidation.antiFabricationPassed).toBe(true)

      // Section B: Human Fact Review
      expect(report.humanFactReview.verifiedClaimsRatio).toBe('1/2 (50%)')
      expect(report.humanFactReview.reviewerSignoffs.length).toBe(1)
      expect(report.humanFactReview.reviewerSignoffs[0].verifiedBy).toBe('chief-editor')

      // Markdown export formatting test
      const markdown = formatReportAsMarkdown(report)
      expect(markdown).toContain('Section A: Automated Validation')
      expect(markdown).toContain('Section B: Human Fact Review')
      expect(markdown).toContain('chief-editor')
    })
  })
})
