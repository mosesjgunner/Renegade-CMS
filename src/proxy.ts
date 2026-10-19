import { NextResponse, type NextRequest } from 'next/server'

import { trustedAdminMutationOrigin } from './modules/operations/request-origin'

export async function proxy(request: NextRequest) {
  if (
    !trustedAdminMutationOrigin(request.method, request.headers, process.env.APP_URL ?? request.url)
  ) {
    return NextResponse.json(
      { error: 'Cross-origin authenticated mutation is forbidden.' },
      { status: 403 },
    )
  }
  // Resolve database-managed redirects before rendering so all four HTTP codes are exact.
  const path = request.nextUrl.pathname
  if (
    !/^\/(api|admin|_next)(\/|$)/.test(path) &&
    !/\.(ico|png|jpg|svg|css|js|woff2?)$/.test(path)
  ) {
    const [{ getPayload }, { default: config }, { publicSiteForHost }, { resolveRedirect }] =
      await Promise.all([
        import('payload'),
        import('@payload-config'),
        import('./modules/public/site-scope'),
        import('./modules/public/discovery'),
      ])
    const payload = await getPayload({ config })
    const siteId = await publicSiteForHost(payload, request.headers.get('host'))
    if (siteId) {
      const result = await payload.find({
        collection: 'public-redirects',
        where: { site: { equals: siteId } },
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
      })
      const resolution = resolveRedirect(
        result.docs.map((rule) => ({
          ...rule,
          siteId,
          preserveQuery: rule.preserveQuery !== false,
          enabled: rule.enabled !== false,
          statusCode: Number(rule.statusCode) as 301 | 302 | 307 | 308,
        })),
        siteId,
        path,
        request.nextUrl.search,
      )
      if (resolution && 'target' in resolution)
        return NextResponse.redirect(new URL(resolution.target, request.url), resolution.statusCode)
      if (resolution && 'error' in resolution)
        return new NextResponse('Page not found.', {
          status: 404,
          headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' },
        })
    }
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
