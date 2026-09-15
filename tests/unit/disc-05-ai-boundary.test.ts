import { describe, expect, it } from 'vitest'
import { generateSeoAiSuggestions } from '../../src/modules/public/ai-boundary-suggestions'
import type { RenderedAuditIssue, RenderedPage } from '../../src/modules/public/discovery-audit'

describe('DISC-05 AI-Boundary SEO Proposals', () => {
  it('generates non-mutating proposals for pages with title and description issues', () => {
    const pages: RenderedPage[] = [
      {
        url: 'https://example.test/short',
        status: 200,
        finalUrl: 'https://example.test/short',
        title: 'Short Title',
        description: null,
        canonical: 'https://example.test/short',
        robots: null,
        headings: ['h1:Short Title Page'],
        links: [],
        issues: [],
        text: 'This is body content for short title page.',
      },
    ]

    const issues: RenderedAuditIssue[] = [
      {
        url: 'https://example.test/short',
        ruleId: 'DISC-05-TITLE-BOUNDS',
        ruleVersion: '1.0.0',
        severity: 'warning',
        evidence: 'Rendered title is 11 characters.',
        repairTarget: 'seoTitle',
      },
      {
        url: 'https://example.test/short',
        ruleId: 'DISC-05-DESCRIPTION-MISSING',
        ruleVersion: '1.0.0',
        severity: 'warning',
        evidence: 'Missing meta description.',
        repairTarget: 'seoDescription',
      },
    ]

    const result = generateSeoAiSuggestions(pages, issues)
    expect(result.provider).toBe('renegade-ai-boundary')
    expect(result.nonMutationGuaranteed).toBe(true)
    expect(result.suggestions).toHaveLength(1)

    const sug = result.suggestions[0]
    expect(sug.accepted).toBe(false)
    expect(sug.suggestedTitle).toContain('Short Title')
    expect(sug.suggestedDescription).toBeTruthy()
    expect(sug.rationale).toContain('Expanded title proposal')
  })
})
