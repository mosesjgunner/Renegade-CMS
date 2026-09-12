import { randomUUID } from 'node:crypto'
import type {
  ExtractedSeo,
  NormalizedAuthor,
  NormalizedItem,
  NormalizedMedia,
  NormalizedMenu,
  NormalizedMenuItem,
  NormalizedTaxonomy,
  NormalizedWxr,
  ParsedContentBlock,
  UnsupportedArtifact,
} from './types'

function extractCDataOrText(raw: string): string {
  if (!raw) return ''
  const cdataMatch = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdataMatch) return cdataMatch[1]
  return raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim()
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? extractCDataOrText(match[1]) : ''
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1])
  }
  return results
}

function extractMeta(xml: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const postMetaBlocks = extractAllTags(xml, 'wp:postmeta')
  for (const block of postMetaBlocks) {
    const key = extractTag(block, 'wp:meta_key').trim()
    const value = extractTag(block, 'wp:meta_value').trim()
    if (key) meta[key] = value
  }
  return meta
}

function extractSeo(meta: Record<string, string>, titleFallback: string): ExtractedSeo {
  const metaTitle =
    meta['_yoast_wpseo_title'] ||
    meta['rank_math_title'] ||
    meta['_seopress_titles_title'] ||
    meta['_aioseo_title'] ||
    undefined

  const metaDescription =
    meta['_yoast_wpseo_metadesc'] ||
    meta['rank_math_description'] ||
    meta['_seopress_titles_desc'] ||
    meta['_aioseo_description'] ||
    undefined

  const canonicalUrl =
    meta['_yoast_wpseo_canonical'] ||
    meta['rank_math_canonical_url'] ||
    meta['_seopress_titles_canonical'] ||
    undefined

  const ogTitle = meta['_yoast_wpseo_opengraph-title'] || meta['rank_math_facebook_title'] || undefined
  const ogDescription = meta['_yoast_wpseo_opengraph-description'] || meta['rank_math_facebook_description'] || undefined
  const noindex =
    meta['_yoast_wpseo_meta-robots-noindex'] === '1' ||
    meta['rank_math_robots']?.includes('noindex') ||
    undefined

  return {
    metaTitle: metaTitle?.replace('%%title%%', titleFallback),
    metaDescription,
    canonicalUrl,
    ogTitle,
    ogDescription,
    noindex,
  }
}

/** Parse Gutenberg blocks and identify unsupported artifacts */
export function parseContentAndArtifacts(
  rawContent: string,
  location: string,
): {
  cleanContent: string
  parsedBlocks: ParsedContentBlock[]
  unsupported: UnsupportedArtifact[]
} {
  const unsupported: UnsupportedArtifact[] = []
  let text = rawContent

  // 1. Detect and quarantine raw PHP
  const phpRegex = /<\?php([\s\S]*?)\?>/gi
  let phpMatch: RegExpExecArray | null
  while ((phpMatch = phpRegex.exec(rawContent)) !== null) {
    unsupported.push({
      id: randomUUID(),
      kind: 'php-code',
      name: 'inline-php',
      rawSource: phpMatch[0],
      location,
      reason: 'Arbitrary PHP execution is disallowed in Renegade CMS for security; preserved in quarantine.',
    })
  }
  text = text.replace(phpRegex, '<!-- QUARANTINED_PHP: Arbitrary PHP code -->')

  // 2. Detect and quarantine raw <script> tags
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch: RegExpExecArray | null
  while ((scriptMatch = scriptRegex.exec(rawContent)) !== null) {
    unsupported.push({
      id: randomUUID(),
      kind: 'script',
      name: 'inline-script',
      rawSource: scriptMatch[0],
      location,
      reason: 'Raw client-side script tags are rejected by Renegade presentation boundary; preserved in quarantine.',
    })
  }
  text = text.replace(scriptRegex, '<!-- QUARANTINED_SCRIPT: Client-side JavaScript -->')

  // 3. Detect and quarantine raw <style> tags
  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let styleMatch: RegExpExecArray | null
  while ((styleMatch = styleRegex.exec(rawContent)) !== null) {
    unsupported.push({
      id: randomUUID(),
      kind: 'style',
      name: 'inline-style',
      rawSource: styleMatch[0],
      location,
      reason: 'Untrusted CSS stylesheets are disallowed to protect theme token integrity; preserved in quarantine.',
    })
  }
  text = text.replace(styleRegex, '<!-- QUARANTINED_STYLE: Untrusted CSS stylesheet -->')

  // 4. Detect and quarantine plugin blocks (e.g. wp:woocommerce, wp:elementor, wp:gravityforms, wp:wpforms)
  const pluginBlockRegex = /<!--\s+wp:([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-]+)(\s+[^>]*?)?\s*(?:\/-->|-->([\s\S]*?)<!--\s+\/wp:\1\/\2\s+-->)/gi
  let pbMatch: RegExpExecArray | null
  while ((pbMatch = pluginBlockRegex.exec(rawContent)) !== null) {
    const pluginNamespace = pbMatch[1].toLowerCase()
    const blockName = pbMatch[2]
    // Filter out core/standard blocks
    if (pluginNamespace !== 'core') {
      unsupported.push({
        id: randomUUID(),
        kind: pluginNamespace.includes('form') ? 'form' : pluginNamespace.includes('commerce') || pluginNamespace.includes('woocommerce') ? 'commerce' : 'plugin-block',
        name: `${pluginNamespace}/${blockName}`,
        rawSource: pbMatch[0],
        location,
        reason: `WordPress plugin block '${pluginNamespace}/${blockName}' cannot run without its proprietary PHP runtime; preserved in quarantine.`,
      })
    }
  }
  text = text.replace(pluginBlockRegex, (match, ns) => {
    if (ns.toLowerCase() === 'core') return match
    return `<!-- QUARANTINED_PLUGIN_BLOCK: ${ns} -->`
  })

  // 5. Detect and quarantine shortcodes (e.g. [contact-form-7 ...], [gallery ...], [woocommerce_cart])
  const shortcodeRegex = /\[([a-zA-Z0-9_\-]+)([^\]]*)\](?:([\s\S]*?)\[\/\1\])?/g
  let scMatch: RegExpExecArray | null
  while ((scMatch = shortcodeRegex.exec(text)) !== null) {
    const codeName = scMatch[1].toLowerCase()
    // Exclude basic markdown-like or non-plugin shortcodes if any, but in WP all bracket codes are shortcodes
    unsupported.push({
      id: randomUUID(),
      kind: codeName.includes('form') ? 'form' : codeName.includes('cart') || codeName.includes('shop') ? 'commerce' : 'shortcode',
      name: codeName,
      rawSource: scMatch[0],
      location,
      reason: `WordPress shortcode '[${codeName}]' requires custom PHP shortcode handlers; preserved in quarantine.`,
    })
  }
  text = text.replace(shortcodeRegex, (match, name) => `<!-- QUARANTINED_SHORTCODE: ${name} -->`)

  // 6. Parse structured Gutenberg blocks into clean content blocks
  const parsedBlocks: ParsedContentBlock[] = []
  const blockRegex = /<!--\s+wp:([a-zA-Z0-9_\-]+)(?:\s+(\{[\s\S]*?\}))?\s*-->([\s\S]*?)<!--\s+\/wp:\1\s+-->/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const blockType = blockMatch[1]
    const blockAttrs = blockMatch[2] ? safeParseJson(blockMatch[2]) : {}
    const innerHtml = blockMatch[3].trim()

    if (blockType === 'paragraph') {
      const clean = stripTags(innerHtml)
      if (clean) parsedBlocks.push({ type: 'paragraph', content: clean })
    } else if (blockType === 'heading') {
      const level = Number(blockAttrs.level ?? 2)
      const clean = stripTags(innerHtml)
      if (clean) parsedBlocks.push({ type: 'heading', level, content: clean })
    } else if (blockType === 'list') {
      parsedBlocks.push({ type: 'list', content: innerHtml })
    } else if (blockType === 'quote') {
      parsedBlocks.push({ type: 'quote', content: stripTags(innerHtml) })
    } else if (blockType === 'image') {
      const srcMatch = innerHtml.match(/src=["']([^"']+)["']/i)
      const altMatch = innerHtml.match(/alt=["']([^"']*)["']/i)
      parsedBlocks.push({
        type: 'image',
        content: altMatch ? altMatch[1] : '',
        mediaUrl: srcMatch ? srcMatch[1] : undefined,
      })
    } else {
      parsedBlocks.push({ type: 'raw-html', content: innerHtml })
    }
  }

  // If no Gutenberg blocks were found, parse classic paragraphs
  if (parsedBlocks.length === 0 && text.trim()) {
    const paragraphs = text.split(/\n\s*\n/)
    for (const p of paragraphs) {
      const trimmed = p.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('# ')) {
        parsedBlocks.push({ type: 'heading', level: 1, content: trimmed.slice(2).trim() })
      } else if (trimmed.startsWith('## ')) {
        parsedBlocks.push({ type: 'heading', level: 2, content: trimmed.slice(3).trim() })
      } else if (trimmed.startsWith('### ')) {
        parsedBlocks.push({ type: 'heading', level: 3, content: trimmed.slice(4).trim() })
      } else {
        parsedBlocks.push({ type: 'paragraph', content: stripTags(trimmed) })
      }
    }
  }

  return {
    cleanContent: text.trim(),
    parsedBlocks,
    unsupported,
  }
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
}

/** Parse full WordPress WXR XML into NormalizedWxr */
export function parseWxr(xml: string): NormalizedWxr {
  // Site metadata
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i)
  const channelXml = channelMatch ? channelMatch[1] : xml

  const site = {
    title: extractTag(channelXml, 'title') || 'Migrated Site',
    link: extractTag(channelXml, 'link') || '/',
    description: extractTag(channelXml, 'description') || '',
    language: extractTag(channelXml, 'language') || 'en',
    baseSiteUrl: extractTag(channelXml, 'wp:base_site_url') || '',
    baseBlogUrl: extractTag(channelXml, 'wp:base_blog_url') || '',
  }

  // Authors
  const authors: NormalizedAuthor[] = []
  const authorBlocks = extractAllTags(channelXml, 'wp:author')
  for (const ab of authorBlocks) {
    const id = extractTag(ab, 'wp:author_id') || randomUUID()
    const login = extractTag(ab, 'wp:author_login')
    const email = extractTag(ab, 'wp:author_email')
    const displayName = extractTag(ab, 'wp:author_display_name') || login
    const firstName = extractTag(ab, 'wp:author_first_name')
    const lastName = extractTag(ab, 'wp:author_last_name')
    if (login) {
      authors.push({ id, login, email, displayName, firstName, lastName })
    }
  }

  // Categories
  const categories: NormalizedTaxonomy[] = []
  const categoryBlocks = extractAllTags(channelXml, 'wp:category')
  for (const cb of categoryBlocks) {
    const id = extractTag(cb, 'wp:term_id') || randomUUID()
    const slug = extractTag(cb, 'wp:category_nicename')
    const name = extractTag(cb, 'wp:cat_name') || slug
    const parentSlug = extractTag(cb, 'wp:category_parent') || undefined
    const description = extractTag(cb, 'wp:category_description') || undefined
    if (slug) {
      categories.push({ id, name, slug, taxonomy: 'category', parentSlug, description })
    }
  }

  // Tags
  const tags: NormalizedTaxonomy[] = []
  const tagBlocks = extractAllTags(channelXml, 'wp:tag')
  for (const tb of tagBlocks) {
    const id = extractTag(tb, 'wp:term_id') || randomUUID()
    const slug = extractTag(tb, 'wp:tag_slug')
    const name = extractTag(tb, 'wp:tag_name') || slug
    const description = extractTag(tb, 'wp:tag_description') || undefined
    if (slug) {
      tags.push({ id, name, slug, taxonomy: 'tag', description })
    }
  }

  // Items
  const items: NormalizedItem[] = []
  const media: NormalizedMedia[] = []
  const menuItems: NormalizedMenuItem[] = []
  const itemBlocks = extractAllTags(channelXml, 'item')

  for (const ib of itemBlocks) {
    const id = extractTag(ib, 'wp:post_id') || randomUUID()
    const postType = extractTag(ib, 'wp:post_type') || 'post'
    const title = extractTag(ib, 'title')
    const slug = extractTag(ib, 'wp:post_name') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const link = extractTag(ib, 'link')
    const publishedAt = extractTag(ib, 'wp:post_date_gmt') || extractTag(ib, 'wp:post_date') || new Date().toISOString()
    const status = (extractTag(ib, 'wp:status') || 'publish') as NormalizedItem['status']
    const authorLogin = extractTag(ib, 'dc:creator') || authors[0]?.login || 'admin'
    const excerpt = extractTag(ib, 'excerpt:encoded') || ''
    const rawContent = extractTag(ib, 'content:encoded') || ''

    // Post meta
    const meta = extractMeta(ib)

    // Check for comments (unsupported artifact)
    const commentBlocks = extractAllTags(ib, 'wp:comment')
    const unsupportedFromItem: UnsupportedArtifact[] = []
    if (commentBlocks.length > 0) {
      unsupportedFromItem.push({
        id: randomUUID(),
        kind: 'comment',
        name: 'wordpress-comments',
        rawSource: `${commentBlocks.length} comments attached to post ${id}`,
        location: `Item: ${title || slug}`,
        reason: 'WordPress user comments are not auto-imported into editorial content; comments preserved in quarantine.',
      })
    }

    if (postType === 'attachment') {
      const sourceUrl = extractTag(ib, 'wp:attachment_url') || link
      const fileName = sourceUrl.split('/').pop()?.split('?')[0] || `attachment-${id}`
      media.push({
        id,
        title: title || fileName,
        sourceUrl,
        fileName,
        caption: excerpt || undefined,
        altText: meta['_wp_attachment_image_alt'] || title || undefined,
      })
      continue
    }

    if (postType === 'nav_menu_item') {
      const order = Number(extractTag(ib, 'wp:menu_order') || 0)
      const url = meta['_menu_item_url'] || link
      const parentId = meta['_menu_item_menu_item_parent'] || undefined
      menuItems.push({
        id,
        title: title || extractTag(ib, 'title'),
        url,
        order,
        parentId: parentId && parentId !== '0' ? parentId : undefined,
      })
      continue
    }

    // Custom post type detection
    if (postType !== 'post' && postType !== 'page') {
      unsupportedFromItem.push({
        id: randomUUID(),
        kind: 'custom-post-type',
        name: `cpt:${postType}`,
        rawSource: ib,
        location: `Post type: ${postType}, ID: ${id}`,
        reason: `Custom post type '${postType}' has custom schema not registered in Renegade; preserved in quarantine.`,
      })
    }

    // Parse categories and tags associated with item
    const itemCategories: string[] = []
    const itemTags: string[] = []
    const catMatches = ib.matchAll(/<category\s+domain=["']([^"']+)["']\s+nicename=["']([^"']+)["'][^>]*>([\s\S]*?)<\/category>/gi)
    for (const match of catMatches) {
      const domain = match[1]
      const nicename = match[2]
      if (domain === 'category') itemCategories.push(nicename)
      else if (domain === 'post_tag') itemTags.push(nicename)
    }

    // SEO extraction
    const seo = extractSeo(meta, title)

    // Parse content and detect unsupported elements
    const { cleanContent, parsedBlocks, unsupported: contentUnsupported } = parseContentAndArtifacts(
      rawContent,
      `Item: ${title || slug} (ID: ${id})`,
    )

    items.push({
      id,
      postType,
      title: title || slug,
      slug,
      originalUrl: link,
      publishedAt,
      status,
      authorLogin,
      excerpt,
      rawContent: cleanContent,
      parsedBlocks,
      categories: itemCategories,
      tags: itemTags,
      featuredMediaId: meta['_thumbnail_id'] || undefined,
      seo,
      unsupported: [...unsupportedFromItem, ...contentUnsupported],
    })
  }

  // Menus
  const menus: NormalizedMenu[] = []
  if (menuItems.length > 0) {
    menus.push({
      name: 'Main Navigation',
      slug: 'main-menu',
      items: menuItems.sort((a, b) => a.order - b.order),
    })
  }

  return {
    site,
    authors,
    categories,
    tags,
    menus,
    media,
    items,
  }
}
