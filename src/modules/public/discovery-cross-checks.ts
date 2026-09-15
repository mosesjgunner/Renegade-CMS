import type { RenderedAuditIssue, RenderedPage } from './discovery-audit'

export type SitemapEntryInput = {
  url: string
  lastmod?: string
}

export type FeedItemInput = {
  url: string
  title?: string
}

export type CrossCheckOptions = {
  origin: string
  pages: readonly RenderedPage[]
  sitemapEntries: readonly SitemapEntryInput[]
  feedItems: readonly FeedItemInput[]
  robotsTxt?: string | null
}

export type CrossCheckResult = {
  issues: RenderedAuditIssue[]
  checkedSitemapUrls: number
  checkedFeedUrls: number
  hasRobotsSitemapLink: boolean
}

const DISCOVERY_AUDIT_RULE_VERSION = '1.0.0'

const issue = (
  url: string,
  ruleId: string,
  severity: 'informational' | 'warning' | 'publication_blocking',
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

function pathFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr).pathname
  } catch {
    return urlStr
  }
}

function isPathDisallowed(path: string, robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim())
  let inUserAgentAll = false
  for (const line of lines) {
    if (/^User-agent:\s*\*/i.test(line)) {
      inUserAgentAll = true
      continue
    }
    if (/^User-agent:/i.test(line)) {
      inUserAgentAll = false
      continue
    }
    if (inUserAgentAll && /^Disallow:\s*/i.test(line)) {
      const disallowed = line.replace(/^Disallow:\s*/i, '').trim()
      if (disallowed && path.startsWith(disallowed)) {
        return true
      }
    }
  }
  return false
}

export function crossCheckDiscoveryOutputs(options: CrossCheckOptions): CrossCheckResult {
  const issues: RenderedAuditIssue[] = []
  const pageMap = new Map<string, RenderedPage>()
  for (const page of options.pages) {
    pageMap.set(page.url, page)
    if (page.finalUrl) pageMap.set(page.finalUrl, page)
  }

  const origin = new URL(options.origin).origin

  // 1. Cross-check sitemap entries
  for (const entry of options.sitemapEntries) {
    const page = pageMap.get(entry.url)
    if (page) {
      if (page.status >= 400 || page.status === 0) {
        issues.push(
          issue(
            entry.url,
            'DISC-05-SITEMAP-UNREACHABLE',
            'publication_blocking',
            `Sitemap entry ${entry.url} returned HTTP status ${page.status}.`,
            'sitemap.xml',
          ),
        )
      } else if (page.status >= 300 && page.status < 400) {
        issues.push(
          issue(
            entry.url,
            'DISC-05-SITEMAP-REDIRECT',
            'warning',
            `Sitemap entry ${entry.url} redirects to ${page.finalUrl}; sitemap should contain canonical URLs directly.`,
            'sitemap.xml',
          ),
        )
      }

      if (page.robots && page.robots.toLowerCase().includes('noindex')) {
        issues.push(
          issue(
            entry.url,
            'DISC-05-SITEMAP-NOINDEX',
            'publication_blocking',
            `Sitemap entry ${entry.url} includes a noindex directive in its rendered HTML.`,
            'sitemap.xml',
          ),
        )
      }

      if (page.canonical && page.canonical !== entry.url) {
        issues.push(
          issue(
            entry.url,
            'DISC-05-SITEMAP-CANONICAL-MISMATCH',
            'warning',
            `Sitemap entry ${entry.url} differs from rendered canonical URL ${page.canonical}.`,
            'sitemap.xml',
          ),
        )
      }
    }
  }

  // 2. Cross-check RSS Feed items
  for (const item of options.feedItems) {
    const page = pageMap.get(item.url)
    if (page) {
      if (page.status >= 400 || page.status === 0) {
        issues.push(
          issue(
            item.url,
            'DISC-05-FEED-UNREACHABLE',
            'publication_blocking',
            `RSS feed item URL ${item.url} returned HTTP status ${page.status}.`,
            'feed.xml',
          ),
        )
      }
      if (page.canonical && page.canonical !== item.url) {
        issues.push(
          issue(
            item.url,
            'DISC-05-FEED-CANONICAL-MISMATCH',
            'warning',
            `RSS feed item URL ${item.url} differs from rendered canonical URL ${page.canonical}.`,
            'feed.xml',
          ),
        )
      }
    }
  }

  // 3. Cross-check robots.txt
  let hasRobotsSitemapLink = false
  if (options.robotsTxt) {
    const sitemapDirectivePattern = new RegExp(
      `Sitemap:\\s*${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`,
      'i',
    )
    hasRobotsSitemapLink =
      /Sitemap:\s*https?:\/\//i.test(options.robotsTxt) ||
      sitemapDirectivePattern.test(options.robotsTxt)

    if (!hasRobotsSitemapLink) {
      issues.push(
        issue(
          `${origin}/robots.txt`,
          'DISC-05-ROBOTS-SITEMAP-MISSING',
          'warning',
          'robots.txt does not contain a Sitemap reference pointing to sitemap.xml.',
          'robots.txt',
        ),
      )
    }

    for (const entry of options.sitemapEntries) {
      const path = pathFromUrl(entry.url)
      if (isPathDisallowed(path, options.robotsTxt)) {
        issues.push(
          issue(
            entry.url,
            'DISC-05-ROBOTS-CONTRADICTION',
            'publication_blocking',
            `robots.txt disallows path '${path}' which is included in sitemap.xml.`,
            'robots.txt',
          ),
        )
      }
    }
  }

  return {
    issues,
    checkedSitemapUrls: options.sitemapEntries.length,
    checkedFeedUrls: options.feedItems.length,
    hasRobotsSitemapLink,
  }
}
