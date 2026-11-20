/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { getStarterStatus } from '@/modules/starters/service'
import { listStarterExamples } from '@/modules/starters/examples'
import { normalizeSiteVisibility } from '@/modules/public/site-visibility'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'renegade-active-site'

function readCookie(headers: Headers, name: string): string | undefined {
  const cookieHeader = headers.get('cookie')
  if (!cookieHeader) return undefined
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

/**
 * Guided-setup context (UXI-05 remainder / UXI-D11): the signed-in
 * user's authorized sites, resolved SERVER-side. The guided-setup page
 * never asks for — and never displays — a site slug, ID, or path as an
 * implementation concept; it works with site names and hands the
 * resolved internal ID straight to the install APIs.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return NextResponse.json(
      { error: 'Sign in with a staff account to use guided setup.', sites: [] },
      { status: 401 },
    )
  }
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) {
    return NextResponse.json(
      { error: 'Your account does not have access to any site yet.', sites: [] },
      { status: 403 },
    )
  }
  const found = await (payload as any).find({
    collection: 'sites',
    where: grant.isGlobalOwner ? undefined : { id: { in: grant.authorizedSiteIds } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const settings = await resolveSiteSettings(payload).catch(() => null)
  const cookieSiteId = readCookie(request.headers, COOKIE_NAME)
  const docs = found.docs as any[]
  const active = docs.find((site) => String(site.id) === cookieSiteId) ?? docs[0] ?? null

  const sites = await Promise.all(
    docs.map(async (site) => {
      const siteId = String(site.id)
      const origin = settings?.canonicalOriginsBySite?.[siteId] ?? settings?.canonicalOrigin ?? ''
      let status = null
      let examples = null
      try {
        status = await getStarterStatus(payload, siteId)
      } catch {
        status = null
      }
      try {
        examples = await listStarterExamples(payload, siteId)
      } catch {
        examples = null
      }
      return {
        id: siteId,
        name: String(site.name ?? 'Untitled site'),
        visibility: normalizeSiteVisibility(site.visibility),
        publicOrigin: origin,
        starterStatus: status
          ? {
              installed: status.installed,
              starterId: status.starterId ?? null,
              pagesCount: status.stats.pagesCount,
              articlesCount: status.stats.articlesCount,
            }
          : null,
        examples: examples
          ? {
              removableCount: examples.removableCount,
              protectedCount: examples.protectedCount,
              removable: examples.removable.map((item) => ({
                title: item.title,
                path: item.path,
                kind: item.kind,
              })),
              protectedEdited: examples.protectedEdited.map((item) => ({
                title: item.title,
                path: item.path,
                kind: item.kind,
              })),
            }
          : null,
      }
    }),
  )

  return NextResponse.json(
    { sites, activeSiteId: active ? String(active.id) : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
