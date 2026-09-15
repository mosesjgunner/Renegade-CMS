import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { discoverThemes } from '@/modules/presentation/packages'
import {
  changeTheme,
  createThemePreview,
  readThemeState,
  themePool,
} from '@/modules/presentation/lifecycle'
import { themes } from '@/modules/presentation/registry'
import { tokenDefaults } from '@/modules/presentation/tokens'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (user?.role !== 'owner')
    return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 })
  const sites = await payload.find({
    collection: 'sites',
    limit: 100,
    depth: 0,
    overrideAccess: false,
    user,
  })
  const site = new URL(request.url).searchParams.get('site') ?? sites.docs[0]?.id
  if (!sites.docs.some((s) => s.id === site))
    return NextResponse.json({ error: 'Select an available site.' }, { status: 400 })
  const installed = await discoverThemes()
  return NextResponse.json(
    {
      site,
      sites: sites.docs.map((s) => ({ id: s.id, name: s.name })),
      state: await readThemeState(themePool(payload), site),
      installed: installed.map((p) => ({
        ...p,
        capabilities: p.package ? themes[p.package.renderer].capabilities : [],
      })),
      tokenDefaults,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (user?.role !== 'owner')
    return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 })
  // Next may use its internal hostname in request.url behind the standalone server.
  const publicURL = new URL(request.url)
  publicURL.host = request.headers.get('host') ?? publicURL.host
  if (request.headers.get('origin') !== publicURL.origin)
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  try {
    const text = await request.text()
    if (text.length > 65536) throw new Error('Theme request is too large.')
    const body = JSON.parse(text)
    if (
      !['draft', 'activate', 'rollback', 'preview', 'end-preview'].includes(body.action) ||
      typeof body.site !== 'string' ||
      !Number.isSafeInteger(body.revision)
    )
      throw new Error('Select a site and refresh its current revision.')
    await payload.findByID({ collection: 'sites', id: body.site, overrideAccess: false, user })
    const pool = themePool(payload)
    if (body.action === 'activate' || body.action === 'rollback') {
      const current = await readThemeState(pool, body.site)
      const candidate = body.action === 'activate' ? current.draft : current.previous
      if (!candidate || current.revision !== body.revision)
        throw new Error('Theme candidate changed or is missing. Refresh before retrying.')
      const publications = await payload.find({
        collection: 'publications',
        where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const publication = publications.docs[0]
      const publicSite =
        typeof publication?.site === 'string' ? publication.site : publication?.site?.id
      if (publicSite === body.site) {
        const probe = await createThemePreview(
          pool,
          body.site,
          String(user.id),
          body.revision,
          body.action === 'rollback' ? 'previous' : 'draft',
        )
        const authCookies = (request.headers.get('cookie') ?? '')
          .split(';')
          .filter((cookie) => !cookie.trim().startsWith('presentation-preview='))
          .join(';')
        try {
          const content = await payload.find({
            collection: 'content',
            where: {
              and: [
                { site: { equals: body.site } },
                { status: { in: ['published', 'updated'] } },
                { contentType: { in: ['page', 'article'] } },
              ],
            },
            limit: 2,
            depth: 0,
            overrideAccess: true,
          })
          const paths = [
            '/',
            '/articles',
            '/search',
            ...content.docs
              .map((doc) => doc.canonicalPath)
              .filter(
                (p): p is string =>
                  typeof p === 'string' && p.startsWith('/') && !p.startsWith('//'),
              ),
          ]
          for (const path of new Set(paths)) {
            const rendered = await fetch(new URL(path, publicURL), {
              headers: { cookie: `${authCookies}; presentation-preview=${probe}` },
              cache: 'no-store',
              redirect: 'manual',
              signal: AbortSignal.timeout(30000),
            })
            const html = await rendered.text()
            if (
              !rendered.ok ||
              !html.includes(`data-theme="${candidate.id}"`) ||
              !html.includes(`data-theme-version="${candidate.version}"`)
            )
              throw new Error(
                'Render preflight failed. Repair the public route or theme package before activating; readers retain the active theme.',
              )
          }
        } finally {
          await pool.query(
            'DELETE FROM presentation_theme_previews WHERE site_id=$1 AND actor_id=$2',
            [body.site, String(user.id)],
          )
        }
      }
    }
    let token: string | undefined
    if (body.action === 'preview')
      token = await createThemePreview(pool, body.site, String(user.id), body.revision)
    else if (body.action === 'end-preview')
      await pool.query('DELETE FROM presentation_theme_previews WHERE site_id=$1 AND actor_id=$2', [
        body.site,
        String(user.id),
      ])
    else await changeTheme(pool, { ...body, actor: String(user.id) })
    revalidatePath('/', 'layout')
    const response = NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
    response.cookies.set('presentation-preview', token ?? '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: token ? 900 : 0,
    })
    return response
  } catch (error) {
    const message =
      error instanceof Error && !('code' in error) && !('status' in error)
        ? error.message
        : 'Theme operation failed. Check the selected site, database migrations, and installed package.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
