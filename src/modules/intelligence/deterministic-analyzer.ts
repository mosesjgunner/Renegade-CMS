import type { DeterministicCheckResult } from './contracts'

export type ContentEvaluationInput = {
  id: string
  title?: string | null
  seoTitle?: string | null
  description?: string | null
  seoDescription?: string | null
  canonicalPath?: string | null
  slug?: string | null
  bodyText?: string | null
  headings?: Array<{ level: number; text: string }>
  knownEntities?: Array<{ id: string; name: string; slug: string }>
  associatedClaims?: Array<{
    id: string
    statement: string
    verificationStatus: string
    citationCount: number
  }>
}

export function runDeterministicContentChecks(
  input: ContentEvaluationInput,
): DeterministicCheckResult[] {
  const results: DeterministicCheckResult[] = []

  const effectiveTitle = (input.seoTitle || input.title || '').trim()
  const effectiveDescription = (input.seoDescription || input.description || '').trim()
  const bodyText = (input.bodyText || '').trim()

  // 1. Title Checks
  if (!input.seoTitle) {
    results.push({
      ruleId: 'DET-SEO-TITLE-MISSING',
      severity: !input.title ? 'critical' : 'warning',
      message: input.title
        ? 'Content has no dedicated SEO title; currently relying on fallback title.'
        : 'Page is missing an SEO title and post title.',
      evidence: { title: input.title, seoTitle: input.seoTitle },
      recommendation: {
        action: 'update_seo_title',
        currentValue: null,
        proposedValue: input.title
          ? `${input.title.slice(0, 55)} | Renegade`
          : 'Default Article Title',
        rationale:
          'An explicit, descriptive title is required for search engines and user discovery.',
      },
    })
  } else if (effectiveTitle.length < 15) {
    results.push({
      ruleId: 'DET-SEO-TITLE-TOO-SHORT',
      severity: 'warning',
      message: `SEO title is too short (${effectiveTitle.length} chars, recommended 30-60).`,
      evidence: { length: effectiveTitle.length, text: effectiveTitle },
      recommendation: {
        action: 'update_seo_title',
        currentValue: effectiveTitle,
        proposedValue: `${effectiveTitle} — Overview & Guide`,
        rationale: 'Expand the title to provide sufficient context for search engines and readers.',
      },
    })
  } else if (effectiveTitle.length > 70) {
    results.push({
      ruleId: 'DET-SEO-TITLE-TOO-LONG',
      severity: 'warning',
      message: `SEO title exceeds 70 characters (${effectiveTitle.length} chars) and may truncate in SERPs.`,
      evidence: { length: effectiveTitle.length, text: effectiveTitle },
      recommendation: {
        action: 'update_seo_title',
        currentValue: effectiveTitle,
        proposedValue: effectiveTitle.slice(0, 65).trim() + '…',
        rationale: 'Trim title below search engine display cutoff to prevent abrupt truncation.',
      },
    })
  }

  // 2. Description Checks
  if (!effectiveDescription) {
    results.push({
      ruleId: 'DET-SEO-DESCRIPTION-MISSING',
      severity: 'warning',
      message: 'Page is missing an SEO meta description.',
      evidence: { description: input.description, seoDescription: input.seoDescription },
      recommendation: {
        action: 'update_seo_description',
        currentValue: null,
        proposedValue: bodyText
          ? `${bodyText.slice(0, 140).trim()}…`
          : 'Explore this topic on Renegade Publishing.',
        rationale: 'A compelling meta description improves search snippet click-through rates.',
      },
    })
  } else if (effectiveDescription.length < 50) {
    results.push({
      ruleId: 'DET-SEO-DESCRIPTION-TOO-SHORT',
      severity: 'info',
      message: `SEO description is very brief (${effectiveDescription.length} chars, recommended 120-160).`,
      evidence: { length: effectiveDescription.length, text: effectiveDescription },
      recommendation: {
        action: 'update_seo_description',
        currentValue: effectiveDescription,
        proposedValue: `${effectiveDescription} Read the full analysis on Renegade CMS.`,
        rationale:
          'Elaborate on key value propositions to occupy optimal SERP snippet real estate.',
      },
    })
  } else if (effectiveDescription.length > 170) {
    results.push({
      ruleId: 'DET-SEO-DESCRIPTION-TOO-LONG',
      severity: 'info',
      message: `SEO description exceeds 170 characters (${effectiveDescription.length} chars) and will likely truncate.`,
      evidence: { length: effectiveDescription.length, text: effectiveDescription },
      recommendation: {
        action: 'update_seo_description',
        currentValue: effectiveDescription,
        proposedValue: effectiveDescription.slice(0, 155).trim() + '…',
        rationale:
          'Shorten meta description to fit standard mobile and desktop search preview displays.',
      },
    })
  }

  // 3. Canonical Path Checks
  if (!input.canonicalPath) {
    results.push({
      ruleId: 'DET-SEO-CANONICAL-MISSING',
      severity: 'critical',
      message: 'Page has no canonical URL path assigned.',
      evidence: { canonicalPath: input.canonicalPath, slug: input.slug },
      recommendation: {
        action: 'update_canonical_path',
        currentValue: null,
        proposedValue: input.slug ? `/articles/${input.slug}` : '/articles',
        rationale: 'Explicit canonical path prevents duplicate content indexing.',
      },
    })
  }

  // 4. Headings Structure Checks
  const headings = input.headings || []
  const h1s = headings.filter((h) => h.level === 1)
  if (h1s.length === 0) {
    results.push({
      ruleId: 'DET-SEO-H1-MISSING',
      severity: 'warning',
      message: 'Content body lacks a level 1 heading (H1).',
      evidence: { h1Count: 0 },
    })
  } else if (h1s.length > 1) {
    results.push({
      ruleId: 'DET-SEO-H1-MULTIPLE',
      severity: 'info',
      message: `Content body contains ${h1s.length} H1 headings; a single primary H1 is recommended.`,
      evidence: { h1Count: h1s.length, titles: h1s.map((h) => h.text) },
    })
  }

  // 5. Content Depth Checks
  const words = bodyText.split(/\s+/).filter(Boolean)
  if (words.length > 0 && words.length < 150) {
    results.push({
      ruleId: 'DET-SEO-THIN-CONTENT',
      severity: 'warning',
      message: `Content is relatively thin (${words.length} words, recommended 300+ for standard articles).`,
      evidence: { wordCount: words.length },
    })
  }

  // 6. Entity Mention Detection
  if (input.knownEntities && input.knownEntities.length > 0 && bodyText) {
    for (const ent of input.knownEntities) {
      const regex = new RegExp(`\\b${ent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(bodyText)) {
        results.push({
          ruleId: 'DET-ENTITY-MENTION-DETECTED',
          severity: 'info',
          message: `Recognized entity "${ent.name}" is mentioned in text.`,
          evidence: { entityId: ent.id, entityName: ent.name, slug: ent.slug },
          recommendation: {
            action: 'link_entity',
            currentValue: null,
            proposedValue: { entityId: ent.id, name: ent.name },
            rationale: `Associate entity "${ent.name}" with content metadata for schema.org graph enrichment.`,
          },
        })
      }
    }
  }

  // 7. Claim Verification & Citation Checks
  if (input.associatedClaims && input.associatedClaims.length > 0) {
    for (const claim of input.associatedClaims) {
      if (claim.verificationStatus === 'unverified') {
        results.push({
          ruleId: 'DET-CLAIM-UNVERIFIED',
          severity: 'info',
          message: `Claim "${claim.statement.slice(0, 50)}…" is marked unverified.`,
          evidence: { claimId: claim.id, verificationStatus: claim.verificationStatus },
        })
      }
      if (claim.citationCount === 0) {
        results.push({
          ruleId: 'DET-CLAIM-MISSING-CITATION',
          severity: 'warning',
          message: `Claim "${claim.statement.slice(0, 50)}…" has 0 supporting citations.`,
          evidence: { claimId: claim.id },
          recommendation: {
            action: 'add_citation',
            currentValue: null,
            proposedValue: { claimId: claim.id },
            rationale:
              'Attach an authoritative source or citation to support this factual assertion.',
          },
        })
      }
    }
  }

  return results
}
