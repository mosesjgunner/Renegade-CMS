/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { starterDefinitions } from '@/modules/starters/definitions'
import {
  getStarterStatus,
  installStarter,
  upgradeStarter,
  rollbackStarterLayout,
} from '@/modules/starters/service'
import type { StarterId } from '@/modules/starters/contracts'
import { themePool, readThemeState, createThemePreview } from '@/modules/presentation/lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const staff = (role?: string | null) => role === 'owner'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!staff(user?.role)) {
    return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 })
  }

  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  const sites = await (payload as any).find({
    collection: 'sites',
    where: grant.isGlobalOwner ? undefined : { id: { in: grant.authorizedSiteIds } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const url = new URL(request.url)
  const site = url.searchParams.get('site') ?? sites.docs[0]?.id

  if (site && !sites.docs.some((s: any) => s.id === site))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

  if (!site) {
    return NextResponse.json({ error: 'No sites available.' }, { status: 400 })
  }

  const status = await getStarterStatus(payload, site)
  const pool = themePool(payload)
  let themeState: any = null
  try {
    themeState = await readThemeState(pool, site)
  } catch {
    // If table not yet ready
  }

  // Get layouts with revision history for rollback
  const layoutsResult = await (payload as any).find({
    collection: 'page-layouts',
    where: { site: { equals: site } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const rollbackOptions = (layoutsResult.docs as any[])
    .filter((l) => Array.isArray(l.revisionHistory) && l.revisionHistory.length > 1)
    .map((l) => ({
      id: l.id,
      name: l.name || l.path,
      path: l.path,
      currentRevision: Number(l.revision) || 1,
      history: l.revisionHistory.map((h: any) => ({
        revision: h.revision,
        savedAt: h.savedAt,
        action: h.action,
      })),
    }))

  const startersList = Object.values(starterDefinitions).map((s) => ({
    id: s.id,
    name: s.name,
    archetype: s.archetype,
    version: s.version,
    themeId: s.themeId,
    summary: s.summary,
    description: s.description,
    features: s.features,
    pagesCount: s.pages.length,
    articlesCount: s.articles.length,
    templatesCount: s.templates.length,
    patternsCount: s.patterns.length,
    globalsCount: s.globals.length,
    productsCount: s.products?.length ?? 0,
    donationsCount: s.donationCampaign ? 1 : 0,
  }))

  return NextResponse.json(
    {
      site,
      sites: sites.docs.map((s: any) => ({ id: s.id, name: s.name })),
      starters: startersList,
      status,
      themeState,
      rollbackOptions,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!staff(user?.role)) {
    return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 })
  }

  const publicURL = new URL(request.url)
  publicURL.host = request.headers.get('host') ?? publicURL.host
  if (request.headers.get('origin') !== publicURL.origin)
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  try {
    const text = await request.text()
    if (text.length > 65536) throw new Error('Starter request is too large.')
    const body = JSON.parse(text)
    const { action, siteId, starterId } = body

    if (!siteId) {
      throw new Error('siteId is required.')
    }

    const grant = await resolveOperatorGrantContext(payload, user)
    if (!grant.authorized || !grant.authorizedSiteIds.includes(siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: false, user })

    if (action === 'install') {
      if (!starterId || !Object.hasOwn(starterDefinitions, starterId)) {
        throw new Error(`Valid starterId is required. Received: ${starterId}`)
      }
      const result = await installStarter(payload, {
        siteId,
        starterId: starterId as StarterId,
        ownerEmail: user.email,
      })

      try {
        revalidatePath('/', 'layout')
      } catch {
        // no cache in local dev
      }

      return NextResponse.json(result)
    }

    if (action === 'upgrade') {
      if (!starterId || !Object.hasOwn(starterDefinitions, starterId)) {
        throw new Error(`Valid starterId is required. Received: ${starterId}`)
      }
      const result = await upgradeStarter(payload, {
        siteId,
        starterId: starterId as StarterId,
      })

      try {
        revalidatePath('/', 'layout')
      } catch {
        // no cache in local dev
      }

      return NextResponse.json(result)
    }

    if (action === 'rollback') {
      const { path, targetRevision } = body
      if (!path || typeof targetRevision !== 'number') {
        throw new Error('path and targetRevision number are required for rollback.')
      }

      const result = await rollbackStarterLayout(payload, {
        siteId,
        path,
        targetRevision,
      })

      try {
        revalidatePath('/', 'layout')
      } catch {
        // no cache in local dev
      }

      return NextResponse.json(result)
    }

    if (action === 'preview') {
      const starter = starterDefinitions[starterId as StarterId]
      if (!Object.hasOwn(starterDefinitions, starterId))
        throw new Error('Unknown starter for preview.')

      const pool = themePool(payload)
      const current = await readThemeState(pool, siteId)
      const token = await createThemePreview(pool, siteId, String(user.id), current.revision)

      const response = NextResponse.json({ success: true, previewToken: token })
      response.cookies.set('presentation-preview', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: new URL(request.url).protocol === 'https:',
        path: '/',
        maxAge: 900,
      })
      return response
    }

    throw new Error(`Unsupported starter action: ${action}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Starter operation failed.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
