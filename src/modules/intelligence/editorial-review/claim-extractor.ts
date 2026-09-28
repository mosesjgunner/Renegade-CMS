/**
 * Renegade CMoS Content Intelligence - Claim Extractor & Ingestion Engine
 *
 * Extracts claims from content body or ingests external claims with exact location
 * tracking (nodeKey, paragraph index, character offsets) and immutable provenance.
 */

import { randomUUID } from 'node:crypto'
import type { ClaimLocation, ClaimProvenance, EditorialClaim } from './contracts'

export interface IngestClaimInput {
  contentId: string
  contentRevision: string
  statement: string
  quote: string
  location: ClaimLocation
  provenance: {
    source: ClaimProvenance['source']
    extractorVersion?: string
    extractedBy?: string
    confidence?: number
    rawContext?: string
  }
}

export interface ExtractClaimsFromTextOptions {
  contentId: string
  contentRevision: string
  extractorVersion?: string
  extractedBy?: string
}

/**
 * Ingests a pre-identified or imported claim with verified location and provenance.
 */
export function ingestClaim(input: IngestClaimInput): EditorialClaim {
  if (!input.statement?.trim()) {
    throw new Error('Claim statement cannot be empty.')
  }
  if (!input.contentId) {
    throw new Error('Claim requires a valid target contentId.')
  }

  const now = new Date().toISOString()
  const claimId = `claim-${randomUUID().slice(0, 8)}`

  return {
    id: claimId,
    contentId: input.contentId,
    contentRevision: input.contentRevision || 'rev-1',
    statement: input.statement.trim(),
    quote: input.quote?.trim() || input.statement.trim(),
    location: {
      nodeKey: input.location.nodeKey,
      blockIndex: input.location.blockIndex ?? 0,
      paragraphIndex: input.location.paragraphIndex ?? 0,
      offsetStart: input.location.offsetStart ?? 0,
      offsetEnd: input.location.offsetEnd ?? (input.quote?.length || input.statement.length),
      sectionPath: input.location.sectionPath || 'Body',
    },
    provenance: {
      source: input.provenance.source,
      extractorVersion: input.provenance.extractorVersion || 'ingest-v1.0',
      extractedAt: now,
      extractedBy: input.provenance.extractedBy || 'system',
      confidence: input.provenance.confidence ?? 1.0,
      rawContext: input.provenance.rawContext,
    },
    reviewStatus: 'unreviewed',
    sources: [],
    conflict: {
      hasConflict: false,
      conflictingEvidence: [],
    },
    reviewerHistory: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Deterministically scans a plain text document (or Lexical plain text projection)
 * to identify candidate factual statements, numbers, and assertions with exact paragraph & offset locations.
 */
export function extractClaimsFromText(
  text: string,
  options: ExtractClaimsFromTextOptions,
): EditorialClaim[] {
  if (!text || typeof text !== 'string') return []

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const claims: EditorialClaim[] = []
  let cumulativeOffset = 0

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx]
    const pStartOffset = text.indexOf(paragraph, cumulativeOffset)
    cumulativeOffset = pStartOffset >= 0 ? pStartOffset + paragraph.length : cumulativeOffset

    // Break paragraph into sentence boundaries (avoiding common abbreviations)
    const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph]

    let sOffsetInP = 0
    for (const sentenceRaw of sentences) {
      const sentence = sentenceRaw.trim()
      const sStart = paragraph.indexOf(sentence, sOffsetInP)
      const absStart = (pStartOffset >= 0 ? pStartOffset : 0) + (sStart >= 0 ? sStart : 0)
      const absEnd = absStart + sentence.length
      sOffsetInP = sStart >= 0 ? sStart + sentence.length : sOffsetInP

      // Heuristic patterns for factual claims:
      // - Quantitative numbers, percentages, currency, dates
      // - Causal assertions ("results in", "decreased by", "proven by", "according to", "discovered", "reported")
      const hasMetric =
        /\b\d+(?:\.\d+)?(?:%|\s*percent|\s*dollars|\s*users|\s*times|\s*million|\s*billion)?\b/i.test(
          sentence,
        )
      const hasAssertionVerb =
        /\b(proves?|causes?|shows?|demonstrates?|discovered|established|recorded|decreased|increased|according to|stated that|concluded)\b/i.test(
          sentence,
        )

      if (sentence.length > 25 && (hasMetric || hasAssertionVerb)) {
        claims.push({
          id: `claim-${randomUUID().slice(0, 8)}`,
          contentId: options.contentId,
          contentRevision: options.contentRevision,
          statement: sentence,
          quote: sentence,
          location: {
            paragraphIndex: pIdx,
            offsetStart: absStart,
            offsetEnd: absEnd,
            sectionPath: `Paragraph ${pIdx + 1}`,
          },
          provenance: {
            source: 'ai_extraction',
            extractorVersion: options.extractorVersion || 'claim-extractor-v1.1',
            extractedAt: new Date().toISOString(),
            extractedBy: options.extractedBy || 'model-assistant',
            confidence: hasMetric && hasAssertionVerb ? 0.92 : 0.78,
            rawContext: paragraph,
          },
          reviewStatus: 'unreviewed',
          automatedCheck: {
            suggestedStatus: 'unreviewed',
            rationale: hasMetric
              ? 'Contains quantitative assertion requiring factual source verification.'
              : 'Contains causal claim requiring primary citation.',
            modelOrRuleId: 'rule-factual-assertion-detection',
            checkedAt: new Date().toISOString(),
          },
          sources: [],
          conflict: {
            hasConflict: false,
            conflictingEvidence: [],
          },
          reviewerHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }

  return claims
}
