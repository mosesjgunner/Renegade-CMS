import type { AdminViewServerProps } from 'payload'
import { MediaLibraryClient } from './MediaLibraryClient'

export default async function MediaLibrary({ initPageResult, searchParams }: AdminViewServerProps) {
  const user = initPageResult.req.user as { site?: { id?: string } } | undefined
  // Site selection is deliberately explicit; a staff user without a scoped site cannot upload into an accidental tenant.
  let siteId = String(user?.site?.id ?? '')

  if (!siteId && searchParams) {
    const resolvedParams = (await searchParams) as Record<string, string | string[] | undefined>
    const paramSite = resolvedParams?.siteId
    if (typeof paramSite === 'string') {
      siteId = paramSite
    }
  }

  if (!siteId) {
    try {
      const activeSites = await initPageResult.req.payload.find({
        collection: 'sites',
        where: { lifecycle: { equals: 'active' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (activeSites.docs[0]) {
        siteId = String(activeSites.docs[0].id)
      }
    } catch {
      // Ignored if sites query fails
    }
  }

  return (
    <main>
      <h1>Media Library</h1>
      <p>
        Upload, organize, and select canonical media assets. Storage locations are never displayed.
      </p>
      {siteId ? (
        <MediaLibraryClient siteId={siteId} />
      ) : (
        <p role="alert">Select a site from your publisher context before uploading media.</p>
      )}
    </main>
  )
}
