import type { NormalizedItem, RedirectPlanItem } from './types'

function normalizePath(rawUrlOrPath: string): string {
  if (!rawUrlOrPath) return '/'
  let pathOnly = rawUrlOrPath
  if (rawUrlOrPath.startsWith('http://') || rawUrlOrPath.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrlOrPath)
      pathOnly = parsed.pathname + parsed.search
    } catch {
      pathOnly = rawUrlOrPath
    }
  }

  // Ensure leading slash
  if (!pathOnly.startsWith('/')) pathOnly = `/${pathOnly}`
  // Strip trailing slash unless it's just '/' or has query string
  if (pathOnly.length > 1 && pathOnly.endsWith('/') && !pathOnly.includes('?')) {
    pathOnly = pathOnly.slice(0, -1)
  }
  return pathOnly
}

export type UrlPlanResult = {
  plan: RedirectPlanItem[]
  hasCollisions: boolean
  hasLoops: boolean
  errors: Array<{ code: string; message: string; fromPath?: string }>
}

/**
 * Builds and validates a URL inventory and redirect plan.
 * Detects self-redirects, cycles/loops, and collisions before any database mutation.
 */
export function buildUrlAndRedirectPlan(
  items: NormalizedItem[],
  options: {
    postsBasePath?: string // default '/articles'
    pagesBasePath?: string // default ''
  } = {},
): UrlPlanResult {
  const postsBase = options.postsBasePath ?? '/articles'
  const pagesBase = options.pagesBasePath ?? ''
  const plan: RedirectPlanItem[] = []
  const errors: Array<{ code: string; message: string; fromPath?: string }> = []

  const fromPathMap = new Map<string, string>() // fromPath -> toPath
  const redirectGraph = new Map<string, string>() // fromPath -> toPath for cycle detection

  for (const item of items) {
    if (item.postType !== 'post' && item.postType !== 'page') continue

    const legacyPath = normalizePath(item.originalUrl)
    let canonicalPath: string

    if (item.postType === 'post') {
      canonicalPath = `${postsBase}/${item.slug}`.replace(/\/+/g, '/')
    } else {
      // Page: check if homepage
      if (item.slug === 'home' || item.slug === 'index' || legacyPath === '/') {
        canonicalPath = '/'
      } else {
        canonicalPath = `${pagesBase}/${item.slug}`.replace(/\/+/g, '/')
      }
    }
    canonicalPath = normalizePath(canonicalPath)

    // Check collision: if same legacyPath already mapped to a different canonicalPath
    if (fromPathMap.has(legacyPath)) {
      const existing = fromPathMap.get(legacyPath)!
      if (existing !== canonicalPath) {
        errors.push({
          code: 'REDIRECT_COLLISION',
          fromPath: legacyPath,
          message: `Collision detected: legacy URL '${legacyPath}' is claimed by both '${existing}' and '${canonicalPath}'.`,
        })
        plan.push({
          sourceUrl: item.originalUrl,
          legacyPath,
          canonicalPath,
          status: 'collision',
          statusCode: 308,
          error: `Collides with existing redirect to ${existing}`,
        })
        continue
      }
    } else {
      fromPathMap.set(legacyPath, canonicalPath)
    }

    // Check if legacyPath and canonicalPath are identical
    if (legacyPath === canonicalPath) {
      plan.push({
        sourceUrl: item.originalUrl,
        legacyPath,
        canonicalPath,
        status: 'compatible-direct',
        statusCode: 308,
      })
      continue
    }

    // Self-redirect check
    if (legacyPath === canonicalPath) {
      errors.push({
        code: 'SELF_REDIRECT',
        fromPath: legacyPath,
        message: `Self-redirect detected for '${legacyPath}'. Cannot redirect a URL to itself.`,
      })
      plan.push({
        sourceUrl: item.originalUrl,
        legacyPath,
        canonicalPath,
        status: 'loop',
        statusCode: 308,
        error: 'Self-redirect detected',
      })
      continue
    }

    // Record for cycle check
    redirectGraph.set(legacyPath, canonicalPath)

    plan.push({
      sourceUrl: item.originalUrl,
      legacyPath,
      canonicalPath,
      status: 'needs-redirect',
      statusCode: 308,
    })
  }

  // Cycle detection across the entire graph
  let hasLoops = false
  for (const [startNode] of redirectGraph.entries()) {
    const visited = new Set<string>()
    let current: string | undefined = startNode
    while (current) {
      if (visited.has(current)) {
        hasLoops = true
        errors.push({
          code: 'CIRCULAR_REDIRECT_LOOP',
          fromPath: startNode,
          message: `Circular redirect chain detected starting at '${startNode}'. Target cycle enters '${current}'.`,
        })
        // Mark relevant items in plan as loop
        for (const p of plan) {
          if (p.legacyPath === startNode || p.legacyPath === current) {
            p.status = 'loop'
            p.error = 'Circular loop detected'
          }
        }
        break
      }
      visited.add(current)
      current = redirectGraph.get(current)
    }
  }

  const hasCollisions = plan.some((p) => p.status === 'collision')

  return {
    plan,
    hasCollisions,
    hasLoops: hasLoops || plan.some((p) => p.status === 'loop'),
    errors,
  }
}
