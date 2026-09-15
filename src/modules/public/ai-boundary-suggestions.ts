import type { Payload } from 'payload'
import type { RenderedAuditIssue, RenderedPage } from './discovery-audit'

export type SeoAiSuggestion = {
  id: string
  url: string
  provider: 'renegade-ai-boundary'
  originalTitle: string | null
  suggestedTitle: string | null
  originalDescription: string | null
  suggestedDescription: string | null
  rationale: string
  accepted: boolean
  acceptedAt?: string | null
}

export type AiBoundarySuggestionsResult = {
  suggestions: SeoAiSuggestion[]
  provider: 'renegade-ai-boundary'
  nonMutationGuaranteed: boolean
}

export function generateSeoAiSuggestions(
  pages: readonly RenderedPage[],
  issues: readonly RenderedAuditIssue[],
): AiBoundarySuggestionsResult {
  const suggestions: SeoAiSuggestion[] = []

  const issuesByUrl = new Map<string, RenderedAuditIssue[]>()
  for (const issue of issues) {
    const list = issuesByUrl.get(issue.url) || []
    list.push(issue)
    issuesByUrl.set(issue.url, list)
  }

  for (const page of pages) {
    const pageIssues = issuesByUrl.get(page.url) || []
    const hasTitleIssue = pageIssues.some(
      (i) => i.ruleId === 'DISC-05-TITLE-MISSING' || i.ruleId === 'DISC-05-TITLE-BOUNDS',
    )
    const hasDescIssue = pageIssues.some(
      (i) =>
        i.ruleId === 'DISC-05-DESCRIPTION-MISSING' || i.ruleId === 'DISC-05-DESCRIPTION-BOUNDS',
    )

    if (!hasTitleIssue && !hasDescIssue) continue

    let suggestedTitle: string | null = null
    let suggestedDescription: string | null = null
    const rationales: string[] = []

    if (hasTitleIssue) {
      if (!page.title) {
        // Derive clean title proposal from primary heading or URL slug
        const h1 = page.headings.find((h) => h.startsWith('h1:'))?.replace(/^h1:/, '')
        const slug = new URL(page.url).pathname.split('/').filter(Boolean).pop() || 'Home'
        const base = h1 || slug.replace(/[-_]/g, ' ')
        suggestedTitle = `${base.charAt(0).toUpperCase() + base.slice(1)} | Renegade Publishing`
        rationales.push('Generated concise title proposal derived from page heading and brand.')
      } else if (page.title.length < 15) {
        suggestedTitle = `${page.title} — Comprehensive Guide & Overview`
        rationales.push('Expanded title proposal to satisfy optimal 30-60 character target length.')
      } else if (page.title.length > 70) {
        suggestedTitle = page.title.slice(0, 65).trim() + '…'
        rationales.push('Trimmed title proposal to prevent search result truncation.')
      }
    }

    if (hasDescIssue) {
      if (!page.description) {
        const textSample = page.text.slice(0, 140).trim()
        suggestedDescription = textSample
          ? `${textSample}…`
          : `Explore ${page.title || 'this page'} on Renegade Publishing.`
        rationales.push('Extracted initial paragraph preview to create missing meta description.')
      } else if (page.description.length < 50) {
        suggestedDescription = `${page.description} Discover key insights, detailed analysis, and resources on Renegade Publishing.`
        rationales.push(
          'Expanded meta description to meet minimum 120-160 character recommendation.',
        )
      } else if (page.description.length > 170) {
        suggestedDescription = page.description.slice(0, 155).trim() + '…'
        rationales.push('Shortened description proposal to fit SERP display boundaries.')
      }
    }

    const id = `ai-sug-${Buffer.from(page.url).toString('hex').slice(0, 12)}`

    suggestions.push({
      id,
      url: page.url,
      provider: 'renegade-ai-boundary',
      originalTitle: page.title,
      suggestedTitle: suggestedTitle || page.title,
      originalDescription: page.description,
      suggestedDescription: suggestedDescription || page.description,
      rationale: rationales.join(' '),
      accepted: false,
      acceptedAt: null,
    })
  }

  return {
    suggestions,
    provider: 'renegade-ai-boundary',
    nonMutationGuaranteed: true,
  }
}

export async function acceptSeoAiSuggestion(
  payload: Payload,
  contentId: string,
  suggestion: { suggestedTitle?: string | null; suggestedDescription?: string | null },
): Promise<{ success: boolean; message: string }> {
  try {
    const existing = (await payload.findByID({
      collection: 'content',
      id: contentId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null

    if (!existing) {
      return { success: false, message: `Content item ${contentId} not found.` }
    }

    const updateData: Record<string, unknown> = {}
    if (suggestion.suggestedTitle) {
      updateData.seoTitle = suggestion.suggestedTitle
    }
    if (suggestion.suggestedDescription) {
      updateData.seoDescription = suggestion.suggestedDescription
    }

    await payload.update({
      collection: 'content',
      id: contentId,
      data: updateData as never,
      overrideAccess: true,
    })

    return {
      success: true,
      message: `AI SEO suggestion applied successfully to content ${contentId}.`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to apply AI suggestion.',
    }
  }
}
