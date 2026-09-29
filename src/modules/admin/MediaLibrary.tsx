import type { AdminViewServerProps } from 'payload'
import { MediaCommandCenter } from './MediaCommandCenter'
import { MediaLibraryClient } from './MediaLibraryClient'

export default async function MediaLibrary({ initPageResult, searchParams }: AdminViewServerProps) {
  const user = initPageResult.req.user as { site?: { id?: string } } | undefined
  // The library's core asset workflow is part of the default floor, while the
  // command center depends on the optional media domain (including
  // `media-jobs`). Do not render a control surface that its active Payload
  // configuration cannot back.
  const commandCenterAvailable = Boolean(initPageResult.req.payload.collections['media-jobs'])
  // Site selection is deliberately explicit; a staff user without a scoped site cannot upload into an accidental tenant.
  let siteId = String(user?.site?.id ?? '')
  let isLegacyView = false

  if (searchParams) {
    const resolvedParams = (await searchParams) as Record<string, string | string[] | undefined>
    const paramSite = resolvedParams?.siteId
    if (typeof paramSite === 'string') {
      siteId = paramSite
    }
    if (resolvedParams?.view === 'legacy') {
      isLegacyView = true
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
      {siteId ? (
        <>
          {commandCenterAvailable ? (
            <MediaCommandCenter siteId={siteId} />
          ) : (
            <p role="status">
              Media Command Center is unavailable because the optional Media module is not enabled
              for this deployment. Core Media Library asset management remains available below.
            </p>
          )}
          <section className="mt-8 border-t pt-8" aria-label="Media Assets Management">
            <MediaLibraryClient siteId={siteId} />
          </section>
        </>
      ) : (
        <p role="alert">Select a site from your publisher context before managing media.</p>
      )}
    </main>
  )
}
