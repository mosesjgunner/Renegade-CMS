/**
 * DISC-05 rendered-output audit.  This deliberately consumes HTTP responses:
 * resolver data is useful context, but it is never substituted for the page a
 * visitor or crawler actually receives.
 */
import { assertSafeOutboundUrl, type Lookup } from '../core/external-boundary'

export const DISCOVERY_AUDIT_RULE_VERSION = '1.0.0'
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export type AuditSeverity = 'informational' | 'warning' | 'publication_blocking'
export type RenderedAuditIssue = {
  ruleId: string
  ruleVersion: string
  severity: AuditSeverity
  evidence: string
  url: string
  repairTarget: string
}
export type RenderedLink = {
  target: string
  text: string
  attribute: 'href' | 'src'
  status?: number
}
export type RenderedPage = {
  url: string
  status: number
  finalUrl: string
  title: string | null
  description: string | null
  canonical: string | null
  robots: string | null
  headings: string[]
  links: RenderedLink[]
  issues: RenderedAuditIssue[]
  text: string
}
export type AuditOptions = {
  origin: string
  paths: readonly string[]
  concurrency?: number
  timeoutMs?: number
  maxPages?: number
  respectRobots?: boolean
  fetcher?: typeof fetch
  resolve?: Lookup
  allowPrivate?: boolean
}
export type RenderedAudit = {
  pages: RenderedPage[]
  issues: RenderedAuditIssue[]
  links: RenderedLink[]
  graph: Array<{ source: string; target: string; anchor: string; status?: number }>
}

const issue = (
  url: string,
  ruleId: string,
  severity: AuditSeverity,
  evidence: string,
  repairTarget: string,
): RenderedAuditIssue => ({
  url,
  ruleId,
  ruleVersion: DISCOVERY_AUDIT_RULE_VERSION,
  severity,
  evidence,
  repairTarget,
})
const unescape = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
const text = (value: string) =>
  unescape(
    value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2] ?? null
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []
const absolute = (value: string, base: string) => {
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}

/** Parses the small, stable audit surface without executing page scripts. */
export function inspectRenderedHtml(
  url: string,
  status: number,
  finalUrl: string,
  html: string,
): RenderedPage {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? text(titleMatch[1]) : null
  const meta = tags(html, 'meta')
  const description = meta.find((tag) => attr(tag, 'name')?.toLowerCase() === 'description')
  const robots = meta.find((tag) => attr(tag, 'name')?.toLowerCase() === 'robots')
  const canonicalTag = tags(html, 'link').find((tag) =>
    attr(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'),
  )
  const canonical = canonicalTag ? absolute(attr(canonicalTag, 'href') || '', finalUrl) : null
  const headings = Array.from(
    html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi),
    (m) => `h${m[1]}:${text(m[2])}`,
  )
  const links: RenderedLink[] = []
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const target = absolute(match[2], finalUrl)
    if (target && /^https?:/i.test(target))
      links.push({ target, text: text(match[3]), attribute: 'href' })
  }
  for (const tag of [...tags(html, 'img'), ...tags(html, 'script'), ...tags(html, 'link')]) {
    const attribute: 'href' | 'src' = /^<link\b/i.test(tag) ? 'href' : 'src'
    const raw = attr(tag, attribute)
    const target = raw && absolute(raw, finalUrl)
    if (target && /^https?:/i.test(target)) links.push({ target, text: text(tag), attribute })
  }
  const issues: RenderedAuditIssue[] = []
  if (!title)
    issues.push(
      issue(
        url,
        'DISC-05-TITLE-MISSING',
        'publication_blocking',
        'Rendered HTML has no title element.',
        'seoTitle',
      ),
    )
  else if (title.length < 15 || title.length > 70)
    issues.push(
      issue(
        url,
        'DISC-05-TITLE-BOUNDS',
        'warning',
        `Rendered title is ${title.length} characters; review its specificity and bounds.`,
        'seoTitle',
      ),
    )
  if (!description)
    issues.push(
      issue(
        url,
        'DISC-05-DESCRIPTION-MISSING',
        'warning',
        'Rendered HTML has no meta description.',
        'seoDescription',
      ),
    )
  else if (
    (attr(description, 'content') || '').length < 50 ||
    (attr(description, 'content') || '').length > 170
  )
    issues.push(
      issue(
        url,
        'DISC-05-DESCRIPTION-BOUNDS',
        'informational',
        'Rendered description is outside the cautious 50–170 character review range.',
        'seoDescription',
      ),
    )
  if (!canonical)
    issues.push(
      issue(
        url,
        'DISC-05-CANONICAL-MISSING',
        'warning',
        'Rendered HTML has no canonical link.',
        'seoCanonicalURL',
      ),
    )
  else if (canonical !== finalUrl)
    issues.push(
      issue(
        url,
        'DISC-05-CANONICAL-CONFLICT',
        'warning',
        `Rendered canonical ${canonical} differs from delivered URL ${finalUrl}.`,
        'seoCanonicalURL',
      ),
    )
  if (
    (attr(robots || '', 'content') || '').toLowerCase().includes('noindex') &&
    canonical === finalUrl
  )
    issues.push(
      issue(
        url,
        'DISC-05-INDEXABILITY-CONTRADICTION',
        'warning',
        'Canonical self-reference conflicts with a noindex directive; review publication intent.',
        'seoNoIndex',
      ),
    )
  if (headings.filter((h) => h.startsWith('h1:')).length !== 1)
    issues.push(
      issue(
        url,
        'DISC-05-HEADING-HIERARCHY',
        'warning',
        `Rendered page has ${headings.filter((h) => h.startsWith('h1:')).length} H1 headings.`,
        'body',
      ),
    )
  for (const tag of tags(html, 'img'))
    if (!attr(tag, 'alt'))
      issues.push(
        issue(
          url,
          'DISC-05-MEDIA-ALT-MISSING',
          'warning',
          'Rendered image has no alt attribute.',
          'heroMedia',
        ),
      )
  for (const block of Array.from(
    html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ))
    try {
      JSON.parse(block[1])
    } catch {
      issues.push(
        issue(
          url,
          'DISC-05-SCHEMA-INVALID',
          'warning',
          'Rendered JSON-LD is not valid JSON.',
          'discoveryOverrides',
        ),
      )
    }
  return {
    url,
    status,
    finalUrl,
    title,
    description: description ? attr(description, 'content') : null,
    canonical,
    robots: robots ? attr(robots, 'content') : null,
    headings,
    links,
    issues,
    text: text(html),
  }
}

async function request(
  url: string,
  options: AuditOptions,
): Promise<{ status: number; finalUrl: string; html: string }> {
  const safe = await assertSafeOutboundUrl(url, options.resolve, {
    allowHttp: new URL(options.origin).protocol === 'http:',
    allowPrivate: options.allowPrivate,
  })
  if (safe.origin !== new URL(options.origin).origin)
    throw new Error('DISC-05 crawler refuses cross-origin targets.')
  const response = await (options.fetcher || fetch)(safe, {
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs || 10_000),
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
  return {
    status: response.status,
    finalUrl: safe.toString(),
    html: REDIRECTS.has(response.status) ? '' : await response.text(),
  }
}

export async function runRenderedAudit(options: AuditOptions): Promise<RenderedAudit> {
  const origin = new URL(options.origin).origin
  const maxPages = Math.min(Math.max(options.maxPages || 100, 1), 1_000),
    concurrency = Math.min(Math.max(options.concurrency || 4, 1), 12)
  const queue = [
    ...new Set(
      options.paths
        .map((path) => absolute(path, origin))
        .filter((url): url is string => url !== null && new URL(url).origin === origin),
    ),
  ].slice(0, maxPages)
  const pages: RenderedPage[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const url = queue[cursor++]
      try {
        const response = await request(url, options)
        const page = inspectRenderedHtml(url, response.status, response.finalUrl, response.html)
        if (REDIRECTS.has(response.status))
          page.issues.push(
            issue(
              url,
              'DISC-05-REDIRECT',
              'warning',
              `Rendered request returned ${response.status}; inspect target and hop count.`,
              'public-redirects',
            ),
          )
        if (response.status >= 400)
          page.issues.push(
            issue(
              url,
              'DISC-05-HTTP-ERROR',
              'publication_blocking',
              `Rendered request returned HTTP ${response.status}.`,
              'public-redirects',
            ),
          )
        pages.push(page)
      } catch (error) {
        pages.push({
          url,
          status: 0,
          finalUrl: url,
          title: null,
          description: null,
          canonical: null,
          robots: null,
          headings: [],
          links: [],
          text: '',
          issues: [
            issue(
              url,
              'DISC-05-FETCH-SAFETY',
              'publication_blocking',
              error instanceof Error ? error.message : 'Safe crawl failed.',
              'site-settings',
            ),
          ],
        })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  const titleCounts = new Map<string, number>()
  for (const p of pages)
    if (p.title)
      titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) || 0) + 1)
  for (const p of pages)
    if (p.title && (titleCounts.get(p.title.toLowerCase()) || 0) > 1)
      p.issues.push(
        issue(
          p.url,
          'DISC-05-TITLE-DUPLICATE',
          'warning',
          `Rendered title is shared by ${titleCounts.get(p.title.toLowerCase())} crawled pages.`,
          'seoTitle',
        ),
      )
  const known = new Set(pages.map((p) => p.finalUrl))
  for (const p of pages)
    for (const link of p.links)
      if (
        new URL(link.target).origin === origin &&
        !known.has(link.target) &&
        link.attribute === 'href'
      )
        p.issues.push(
          issue(
            p.url,
            'DISC-05-INTERNAL-LINK-UNREACHABLE',
            'warning',
            `Rendered internal link target was not crawled: ${link.target}`,
            'body',
          ),
        )
  const graph = pages.flatMap((page) =>
    page.links
      .filter((link) => link.attribute === 'href' && new URL(link.target).origin === origin)
      .map((link) => ({ source: page.finalUrl, target: link.target, anchor: link.text })),
  )
  return {
    pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
    issues: pages.flatMap((p) => p.issues),
    links: pages.flatMap((p) => p.links),
    graph,
  }
}
