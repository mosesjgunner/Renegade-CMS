/**
 * DISC-05 rendered-output audit.  This deliberately consumes HTTP responses:
 * resolver data is useful context, but it is never substituted for the page a
 * visitor or crawler actually receives.
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import { assertSafeOutboundUrl, safeSocketLookup, type Lookup } from '../core/external-boundary'

export const DISCOVERY_AUDIT_RULE_VERSION = '1.0.0'
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const MAX_RENDERED_PAGE_BYTES = 2 * 1024 * 1024

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
  resource?: boolean
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
  /**
   * Internal origin pages are actually fetched from when it differs from
   * the canonical `origin` (staging, proxy, local, split-origin deploys).
   * Only the path + query of each canonical URL is carried onto it, so a
   * hostile absolute-URL input can never move the crawl off this base.
   */
  fetchBase?: string
  /** Host header presented on fetches when it differs from the fetch base host. */
  siteHost?: string
}
export type RenderedAuditScopeState = 'complete' | 'partial' | 'empty' | 'no-eligible'
export type RenderedAuditScope = {
  /** Deduped input paths the audit was asked to examine. */
  eligible: number
  queued: number
  /** Pages that returned an HTTP response and were inspected (errors included). */
  examined: number
  fetched: number
  /** Pages whose fetch failed before any response (status 0). */
  failed: number
  skipped: Array<{ url: string; reason: string }>
  state: RenderedAuditScopeState
  complete: boolean
}
export type RenderedAudit = {
  pages: RenderedPage[]
  issues: RenderedAuditIssue[]
  links: RenderedLink[]
  graph: Array<{ source: string; target: string; anchor: string; status?: number }>
  scope: RenderedAuditScope
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
  expectedCanonical?: string,
): RenderedPage {
  // Relative references and the canonical verdict resolve against the
  // document's canonical URL when one is known: under split-origin
  // fetching `finalUrl` is an internal fetch URL that must never be
  // mistaken for the page's public identity.
  const base = expectedCanonical ?? finalUrl
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? text(titleMatch[1]) : null
  const meta = tags(html, 'meta')
  const description = meta.find((tag) => attr(tag, 'name')?.toLowerCase() === 'description')
  const robots = meta.find((tag) => attr(tag, 'name')?.toLowerCase() === 'robots')
  const canonicalTag = tags(html, 'link').find((tag) =>
    attr(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'),
  )
  const canonical = canonicalTag ? absolute(attr(canonicalTag, 'href') || '', base) : null
  const headings = Array.from(
    html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi),
    (m) => `h${m[1]}:${text(m[2])}`,
  )
  const links: RenderedLink[] = []
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const target = absolute(match[2], base)
    if (target && /^https?:/i.test(target))
      links.push({ target, text: text(match[3]), attribute: 'href' })
  }
  for (const tag of [...tags(html, 'img'), ...tags(html, 'script'), ...tags(html, 'link')]) {
    const attribute: 'href' | 'src' = /^<link\b/i.test(tag) ? 'href' : 'src'
    const raw = attr(tag, attribute)
    const target = raw && absolute(raw, base)
    if (target && /^https?:/i.test(target))
      links.push({ target, text: text(tag), attribute, resource: true })
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
  else if (canonical !== base)
    issues.push(
      issue(
        url,
        'DISC-05-CANONICAL-CONFLICT',
        'warning',
        `Rendered canonical ${canonical} differs from delivered URL ${base}.`,
        'seoCanonicalURL',
      ),
    )
  if ((attr(robots || '', 'content') || '').toLowerCase().includes('noindex') && canonical === base)
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

/** GET via node:http/https so a Host header can be presented; fetch cannot set one. */
function requestRenderedPage(
  url: URL,
  hostHeader: string | undefined,
  timeoutMs: number,
  allowPrivate: boolean | undefined,
): Promise<{ status: number; html: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = transport(
      url,
      {
        method: 'GET',
        headers: {
          ...(hostHeader ? { Host: hostHeader } : {}),
          Accept: 'text/html,application/xhtml+xml',
        },
        lookup: safeSocketLookup(allowPrivate),
        signal: AbortSignal.timeout(timeoutMs),
        agent: false,
      },
      (res) => {
        const status = res.statusCode || 0
        if (REDIRECTS.has(status)) {
          res.destroy()
          resolvePromise({ status, html: '' })
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > MAX_RENDERED_PAGE_BYTES) {
            res.destroy(new Error('Rendered page exceeds the audit size limit.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('error', rejectPromise)
        res.on('end', () =>
          resolvePromise({ status, html: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`DISC-05 crawler timed out after ${timeoutMs}ms.`)),
    )
    req.on('error', rejectPromise)
    req.end()
  })
}

async function request(
  url: string,
  options: AuditOptions,
): Promise<{ status: number; finalUrl: string; html: string }> {
  const fetchBase = options.fetchBase
    ? new URL(options.fetchBase).origin
    : new URL(options.origin).origin
  // Only the path + query of the canonical URL is carried onto the fetch
  // base: the crawl can never be steered off it by a hostile input URL,
  // and the SSRF guard below always vets the URL actually fetched.
  const target = new URL(url)
  const fetchUrl = `${fetchBase}${target.pathname}${target.search}`
  const safe = await assertSafeOutboundUrl(fetchUrl, options.resolve, {
    allowHttp: new URL(fetchBase).protocol === 'http:',
    allowPrivate: options.allowPrivate,
  })
  if (safe.origin !== new URL(fetchBase).origin)
    throw new Error('DISC-05 crawler refuses cross-origin targets.')
  const hostOverride =
    options.siteHost && options.siteHost !== safe.host ? options.siteHost : undefined
  // Results are reported in canonical space: the internal fetch origin is
  // transport, never identity, so a split-origin crawl must not leak it
  // into page records or issue evidence. Redirects are never followed, so
  // the rendered URL is the requested page — expressed on its canonical
  // origin with the fetched path.
  const canonicalOrigin = new URL(url).origin
  const finalUrl =
    safe.origin === fetchBase ? `${canonicalOrigin}${safe.pathname}${safe.search}` : safe.toString()
  if (!options.fetcher) {
    const response = await requestRenderedPage(
      safe,
      hostOverride,
      options.timeoutMs || 10_000,
      options.allowPrivate,
    )
    return { status: response.status, finalUrl, html: response.html }
  }
  const response = await (options.fetcher || fetch)(safe, {
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs || 10_000),
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
  return {
    status: response.status,
    finalUrl,
    html: REDIRECTS.has(response.status) ? '' : await response.text(),
  }
}

export async function runRenderedAudit(options: AuditOptions): Promise<RenderedAudit> {
  const origin = new URL(options.origin).origin
  const maxPages = Math.min(Math.max(options.maxPages || 100, 1), 1_000),
    concurrency = Math.min(Math.max(options.concurrency || 4, 1), 12)
  // Scope accounting (DEBT-14): nothing is dropped silently. Every input
  // path is either queued or recorded in `skipped` with its reason.
  const skipped: RenderedAuditScope['skipped'] = []
  const seen = new Set<string>()
  const eligibleUrls: string[] = []
  for (const path of options.paths) {
    const parsed = absolute(path, origin)
    if (parsed === null) {
      skipped.push({ url: path, reason: 'unparseable URL' })
      continue
    }
    if (seen.has(parsed)) continue
    seen.add(parsed)
    eligibleUrls.push(parsed)
  }
  const queue = eligibleUrls.slice(0, maxPages)
  for (const url of eligibleUrls.slice(maxPages))
    skipped.push({ url, reason: `over the maxPages cap of ${maxPages}` })
  const eligible =
    eligibleUrls.length + skipped.filter((s) => s.reason === 'unparseable URL').length
  const pages: RenderedPage[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const url = queue[cursor++]
      try {
        const response = await request(url, options)
        const page = inspectRenderedHtml(
          url,
          response.status,
          response.finalUrl,
          response.html,
          url,
        )
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
  const withoutFragment = (value: string) => {
    const target = new URL(value)
    target.hash = ''
    return target.toString()
  }
  const checked = new Map(pages.map((p) => [withoutFragment(p.url), p.status]))
  const linkTargets = [
    ...new Set(
      pages
        .flatMap((p) => p.links)
        .filter(
          (link) =>
            !link.resource && link.attribute === 'href' && new URL(link.target).origin === origin,
        )
        .map((link) => withoutFragment(link.target)),
    ),
  ]
    .filter((target) => !checked.has(target))
    .slice(0, maxPages)
  let linkCursor = 0
  const checkLinks = async () => {
    while (linkCursor < linkTargets.length) {
      const target = linkTargets[linkCursor++]
      try {
        checked.set(target, (await request(target, options)).status)
      } catch {
        checked.set(target, 0)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, checkLinks))
  for (const p of pages)
    for (const link of p.links)
      if (new URL(link.target).origin === origin && !link.resource && link.attribute === 'href') {
        link.status = checked.get(withoutFragment(link.target))
        if (link.status === 0 || (link.status !== undefined && link.status >= 400))
          p.issues.push(
            issue(
              p.url,
              'DISC-05-INTERNAL-LINK-UNREACHABLE',
              'warning',
              `Rendered internal link returned HTTP ${link.status}: ${link.target}`,
              'body',
            ),
          )
      }
  const graph = pages.flatMap((page) =>
    page.links
      .filter(
        (link) =>
          !link.resource && link.attribute === 'href' && new URL(link.target).origin === origin,
      )
      .map((link) => ({
        source: page.url,
        target: link.target,
        anchor: link.text,
        status: link.status,
      })),
  )
  const examined = pages.filter((p) => p.status > 0).length
  const failed = pages.filter((p) => p.status === 0).length
  const state: RenderedAuditScopeState =
    eligible === 0
      ? 'no-eligible'
      : examined === 0
        ? 'empty'
        : examined < eligible
          ? 'partial'
          : 'complete'
  const scope: RenderedAuditScope = {
    eligible,
    queued: queue.length,
    examined,
    fetched: examined,
    failed,
    skipped,
    state,
    complete: state === 'complete' || state === 'no-eligible',
  }
  // An incomplete crawl cannot establish the absence of an inbound link.
  // Self-links do not make a page reachable from another audited page.
  if (state === 'complete' && pages.every((page) => page.status >= 200 && page.status < 300)) {
    const inbound = new Set(
      graph
        .filter((link) => withoutFragment(link.source) !== withoutFragment(link.target))
        .map((link) => withoutFragment(link.target)),
    )
    for (const page of pages) {
      if (new URL(page.url).pathname === '/' || inbound.has(withoutFragment(page.url))) continue
      page.issues.push(
        issue(
          page.url,
          'DISC-05-NO-AUDITED-INBOUND-LINK',
          'informational',
          'No other audited page links to this URL. Review navigation and links outside this audit scope.',
          'body',
        ),
      )
    }
  }
  return {
    pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
    issues: pages.flatMap((p) => p.issues),
    links: pages.flatMap((p) => p.links),
    graph,
    scope,
  }
}
