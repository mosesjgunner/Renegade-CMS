import type {
  CompletenessFinding,
  LocaleVariant,
  RichTextNode,
  TranslationCompletenessReport,
} from './contracts'

// Whitelist of standard supported rich text / layout node types
export const SUPPORTED_RICH_TEXT_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'heading',
  'text',
  'list',
  'listitem',
  'quote',
  'link',
  'autolink',
  'image',
  'upload',
  'horizontalrule',
  'table',
  'tablerow',
  'tablecell',
  'code',
  'linebreak',
])

/**
 * Recursively inspects rich-text AST to discover any unsupported or corrupted node types,
 * collect plain text tokens, and extract links and media embeds.
 */
export function inspectRichTextNode(node: unknown): {
  unsupportedNodeTypes: string[]
  plainText: string
  links: string[]
  mediaIds: string[]
  blockCount: number
} {
  const unsupportedNodeTypes: string[] = []
  let plainText = ''
  const links: string[] = []
  const mediaIds: string[] = []
  let blockCount = 0

  if (!node || typeof node !== 'object') {
    return { unsupportedNodeTypes, plainText, links, mediaIds, blockCount }
  }

  const current = node as RichTextNode
  const nodeType = typeof current.type === 'string' ? current.type.toLowerCase() : ''

  if (nodeType) {
    if (
      [
        'paragraph',
        'heading',
        'quote',
        'list',
        'listitem',
        'table',
        'code',
        'horizontalrule',
      ].includes(nodeType)
    ) {
      blockCount++
    }

    if (!SUPPORTED_RICH_TEXT_NODE_TYPES.has(nodeType)) {
      unsupportedNodeTypes.push(nodeType)
    }

    if (nodeType === 'link' || nodeType === 'autolink') {
      const href = typeof current.url === 'string' ? current.url : (current.fields as any)?.url
      if (typeof href === 'string') {
        links.push(href)
      }
    }

    if (nodeType === 'upload' || nodeType === 'image') {
      const mediaId =
        typeof (current.value as any)?.id === 'string'
          ? (current.value as any).id
          : typeof current.value === 'string'
            ? current.value
            : typeof (current.fields as any)?.media === 'string'
              ? (current.fields as any).media
              : ''
      if (mediaId) {
        mediaIds.push(mediaId)
      }
    }
  }

  if (typeof current.text === 'string') {
    plainText += current.text + ' '
  }

  if (Array.isArray(current.children)) {
    for (const child of current.children) {
      const childRes = inspectRichTextNode(child)
      unsupportedNodeTypes.push(...childRes.unsupportedNodeTypes)
      plainText += childRes.plainText + ' '
      links.push(...childRes.links)
      mediaIds.push(...childRes.mediaIds)
      blockCount += childRes.blockCount
    }
  }

  return {
    unsupportedNodeTypes: Array.from(new Set(unsupportedNodeTypes)),
    plainText: plainText.trim(),
    links,
    mediaIds,
    blockCount,
  }
}

export interface CompletenessInspectionInput {
  source: {
    title: string
    summary?: string
    body?: Record<string, unknown> | string
    links?: string[]
    media?: Array<{ id: string; altText?: string; caption?: string }>
    seoTitle?: string
    seoDescription?: string
    author?: string
    publishedAt?: string
    presentationSlots?: string[]
  }
  target: {
    id?: string
    title: string
    summary?: string
    body?: Record<string, unknown> | string
    links?: string[]
    mediaChoices?: Record<string, { mediaId: string; altText: string; caption?: string }>
    seoTitle?: string
    seoDescription?: string
    author?: string
    publishedAt?: string
    presentationSlots?: string[]
  }
}

/**
 * Executes a deterministic, side-by-side completeness check across title, body blocks,
 * links, media alt/captions, SEO fields, schema facts, and presentation slots.
 * Unsupported rich-text/layout nodes fail visibly as blockers.
 */
export function evaluateTranslationCompleteness(
  input: CompletenessInspectionInput,
  options: { repairUrlPrefix?: string } = {},
): TranslationCompletenessReport {
  const repairPrefix = options.repairUrlPrefix || '/admin/workflow/translations'
  const targetId = input.target.id || 'target'
  const blockers: CompletenessFinding[] = []
  const warnings: CompletenessFinding[] = []

  // 1. Title Completeness
  const sourceTitle = (input.source.title || '').trim()
  const targetTitle = (input.target.title || '').trim()

  let titleStatus: 'ok' | 'missing' | 'untranslated_duplicate' = 'ok'
  if (!targetTitle) {
    titleStatus = 'missing'
    blockers.push({
      field: 'title',
      code: 'TRANSLATION_TITLE_MISSING',
      message: 'Target locale title is empty or missing.',
      severity: 'blocker',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=title`,
    })
  } else if (targetTitle.toLowerCase() === sourceTitle.toLowerCase() && sourceTitle.length > 5) {
    titleStatus = 'untranslated_duplicate'
    warnings.push({
      field: 'title',
      code: 'TRANSLATION_TITLE_IDENTICAL',
      message: 'Target title is identical to source title; verify if translation was completed.',
      severity: 'warning',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=title`,
    })
  }

  // 2. Body / Excerpt Blocks & Unsupported Nodes
  const sourceInspection =
    typeof input.source.body === 'object' && input.source.body !== null
      ? inspectRichTextNode((input.source.body as any).root || input.source.body)
      : {
          unsupportedNodeTypes: [],
          plainText: typeof input.source.body === 'string' ? input.source.body : '',
          links: input.source.links || [],
          mediaIds: (input.source.media || []).map((m) => m.id),
          blockCount: typeof input.source.body === 'string' ? 1 : 0,
        }

  const targetInspection =
    typeof input.target.body === 'object' && input.target.body !== null
      ? inspectRichTextNode((input.target.body as any).root || input.target.body)
      : {
          unsupportedNodeTypes: [],
          plainText: typeof input.target.body === 'string' ? input.target.body : '',
          links: input.target.links || [],
          mediaIds: Object.keys(input.target.mediaChoices || {}),
          blockCount: typeof input.target.body === 'string' ? 1 : 0,
        }

  // Check for unsupported rich-text / layout nodes - MUST fail visibly
  if (targetInspection.unsupportedNodeTypes.length > 0) {
    for (const nodeType of targetInspection.unsupportedNodeTypes) {
      blockers.push({
        field: 'body',
        code: 'TRANSLATION_UNSUPPORTED_NODE_TYPE',
        message: `Unsupported rich-text/layout node '${nodeType}' detected in target document. Unsupported nodes must be converted or removed.`,
        severity: 'blocker',
        repairUrl: `${repairPrefix}?id=${targetId}&focus=body`,
        details: { nodeType },
      })
    }
  }

  let bodyStatus: 'ok' | 'missing' | 'unsupported_nodes' | 'block_count_mismatch' = 'ok'
  if (!targetInspection.plainText && !input.target.summary) {
    bodyStatus = 'missing'
    blockers.push({
      field: 'body',
      code: 'TRANSLATION_BODY_MISSING',
      message: 'Target body content and summary are missing or empty.',
      severity: 'blocker',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=body`,
    })
  } else if (targetInspection.unsupportedNodeTypes.length > 0) {
    bodyStatus = 'unsupported_nodes'
  } else if (
    sourceInspection.blockCount > 1 &&
    targetInspection.blockCount < Math.floor(sourceInspection.blockCount * 0.5)
  ) {
    bodyStatus = 'block_count_mismatch'
    warnings.push({
      field: 'body',
      code: 'TRANSLATION_BODY_BLOCK_COUNT_MISMATCH',
      message: `Target body has ${targetInspection.blockCount} blocks compared to source ${sourceInspection.blockCount} blocks. Content may be truncated.`,
      severity: 'warning',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=body`,
    })
  }

  // 3. Links Validation
  const allTargetLinks = [
    ...(input.target.links || []),
    ...targetInspection.links,
  ]
  const brokenLinks: string[] = []
  for (const link of allTargetLinks) {
    if (!link || link.trim() === '' || link.startsWith('javascript:')) {
      brokenLinks.push(link || '<empty>')
    } else if (
      !link.startsWith('/') &&
      !link.startsWith('#') &&
      !link.startsWith('http://') &&
      !link.startsWith('https://') &&
      !link.startsWith('mailto:')
    ) {
      brokenLinks.push(link)
    }
  }

  let linksStatus: 'ok' | 'broken_links' | 'missing_links' = 'ok'
  if (brokenLinks.length > 0) {
    linksStatus = 'broken_links'
    blockers.push({
      field: 'links',
      code: 'TRANSLATION_BROKEN_LINKS',
      message: `Target content contains ${brokenLinks.length} broken or malformed link(s): ${brokenLinks.join(', ')}`,
      severity: 'blocker',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=links`,
      details: { brokenLinks },
    })
  }

  // 4. Media Alt & Captions Validation
  const sourceMedia = input.source.media || []
  const targetChoices = input.target.mediaChoices || {}
  const missingAltOrCaptions: Array<{ mediaId: string; issue: string }> = []

  // Check every source media to see if target provided localized choice with alt text
  for (const sm of sourceMedia) {
    const choice = targetChoices[sm.id]
    if (!choice || !choice.altText || choice.altText.trim() === '') {
      missingAltOrCaptions.push({
        mediaId: sm.id,
        issue: 'Missing localized alt text for media asset',
      })
    }
  }

  let mediaStatus: 'ok' | 'missing_alt_caption' = 'ok'
  if (missingAltOrCaptions.length > 0) {
    mediaStatus = 'missing_alt_caption'
    blockers.push({
      field: 'media',
      code: 'TRANSLATION_MEDIA_ALT_MISSING',
      message: `Target content has ${missingAltOrCaptions.length} media asset(s) without localized alt text or captions.`,
      severity: 'blocker',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=media`,
      details: { missingAltOrCaptions },
    })
  }

  // 5. SEO Fields Validation
  const seoTitle = (input.target.seoTitle || '').trim()
  const seoDesc = (input.target.seoDescription || '').trim()

  let metaTitleStatus: 'ok' | 'missing' | 'length_warning' = 'ok'
  if (!seoTitle && !targetTitle) {
    metaTitleStatus = 'missing'
    blockers.push({
      field: 'seoTitle',
      code: 'TRANSLATION_SEO_TITLE_MISSING',
      message: 'Target SEO Title is missing and fallback target title is empty.',
      severity: 'blocker',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=seo`,
    })
  } else {
    const titleLen = (seoTitle || targetTitle).length
    if (titleLen < 10 || titleLen > 70) {
      metaTitleStatus = 'length_warning'
      warnings.push({
        field: 'seoTitle',
        code: 'TRANSLATION_SEO_TITLE_LENGTH',
        message: `SEO title length (${titleLen} chars) should ideally be between 10 and 70 characters.`,
        severity: 'warning',
        repairUrl: `${repairPrefix}?id=${targetId}&focus=seo`,
      })
    }
  }

  let metaDescStatus: 'ok' | 'missing' | 'length_warning' = 'ok'
  if (!seoDesc && !input.target.summary) {
    metaDescStatus = 'missing'
    warnings.push({
      field: 'seoDescription',
      code: 'TRANSLATION_SEO_DESC_MISSING',
      message: 'Target SEO Description and summary are missing.',
      severity: 'warning',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=seo`,
    })
  } else {
    const descLen = (seoDesc || input.target.summary || '').length
    if (descLen < 40 || descLen > 160) {
      metaDescStatus = 'length_warning'
      warnings.push({
        field: 'seoDescription',
        code: 'TRANSLATION_SEO_DESC_LENGTH',
        message: `SEO description length (${descLen} chars) should ideally be between 40 and 160 characters.`,
        severity: 'warning',
        repairUrl: `${repairPrefix}?id=${targetId}&focus=seo`,
      })
    }
  }

  // 6. Schema Facts Validation
  let authorStatus: 'ok' | 'missing' = 'ok'
  if (!input.target.author && input.source.author) {
    authorStatus = 'missing'
    warnings.push({
      field: 'author',
      code: 'TRANSLATION_AUTHOR_MISSING',
      message: 'Target document does not specify an author; source author exists.',
      severity: 'warning',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=author`,
    })
  }

  let publishDateStatus: 'ok' | 'missing' = 'ok'
  if (!input.target.publishedAt && input.source.publishedAt) {
    // Not a blocker if drafting, but warning
    publishDateStatus = 'missing'
  }

  // 7. Presentation Slots Validation
  const sourceSlots = input.source.presentationSlots || []
  const targetSlots = input.target.presentationSlots || []
  const missingSlots: string[] = []
  for (const s of sourceSlots) {
    if (!targetSlots.includes(s)) {
      missingSlots.push(s)
    }
  }

  let presentationStatus: 'ok' | 'missing_slots' = 'ok'
  if (missingSlots.length > 0) {
    presentationStatus = 'missing_slots'
    warnings.push({
      field: 'presentationSlots',
      code: 'TRANSLATION_PRESENTATION_SLOTS_MISMATCH',
      message: `Target presentation slots missing: ${missingSlots.join(', ')}`,
      severity: 'warning',
      repairUrl: `${repairPrefix}?id=${targetId}&focus=presentation`,
      details: { missingSlots },
    })
  }

  const isComplete = blockers.length === 0
  const totalChecks = 7
  const failedChecks = (blockers.length > 0 ? 1 : 0) + (warnings.length > 0 ? 0.5 : 0)
  const score = Math.max(0, Math.min(100, Math.round(((totalChecks - failedChecks) / totalChecks) * 100)))

  return {
    isComplete,
    score,
    blockers,
    warnings,
    details: {
      title: {
        source: sourceTitle,
        target: targetTitle,
        status: titleStatus,
      },
      bodyBlocks: {
        sourceBlocksCount: sourceInspection.blockCount,
        targetBlocksCount: targetInspection.blockCount,
        unsupportedNodes: targetInspection.unsupportedNodeTypes,
        status: bodyStatus,
      },
      links: {
        sourceLinksCount: (input.source.links || []).length + sourceInspection.links.length,
        targetLinksCount: allTargetLinks.length,
        brokenLinks,
        status: linksStatus,
      },
      media: {
        sourceMediaCount: sourceMedia.length,
        targetMediaCount: Object.keys(targetChoices).length,
        missingAltOrCaptions,
        status: mediaStatus,
      },
      seoFields: {
        metaTitleStatus,
        metaDescriptionStatus: metaDescStatus,
        status: metaTitleStatus === 'ok' && metaDescStatus === 'ok' ? 'ok' : 'issue',
      },
      schemaFacts: {
        authorStatus,
        publishDateStatus,
        status: authorStatus === 'ok' ? 'ok' : 'issue',
      },
      presentationSlots: {
        matchedSlots: targetSlots.filter((s) => sourceSlots.includes(s)),
        missingSlots,
        status: presentationStatus,
      },
    },
  }
}
