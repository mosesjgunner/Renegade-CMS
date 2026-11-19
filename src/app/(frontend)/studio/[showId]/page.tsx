import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'
import { probeAudioEngine } from '@/modules/media/ffmpeg'
import {
  listStudioSessionRecords,
  type StudioSessionRecord,
} from '@/modules/podcast-studio/sessions'
import { StudioWorkspace } from './StudioWorkspace'

export const dynamic = 'force-dynamic'

/**
 * POD-05 Podcast Studio workspace (state only — no audio in this
 * stage). A frontend route rather than a Payload admin custom view:
 * the repo's admin custom views are read-mostly dashboards, while the
 * studio is a full interactive desk (rundown editor, cartwall, mixer)
 * that already talks to the staff API under
 * /api/podcast-studio/sessions — the frontend route keeps the desk in
 * one client component next to that API, gated exactly like the API
 * (staff role + operator grant on the show's site).
 */
export default async function StudioPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  const payload = await getPayload({ config: configPromise })
  const incomingHeaders = await headers()
  const auth = await payload.auth({ headers: incomingHeaders }).catch(() => ({ user: null }))
  const user = auth.user as { id?: string; role?: string } | null
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    redirect('/login')
  }

  const show = await payload
    .findByID({ collection: 'podcast-shows', id: showId, depth: 0, overrideAccess: true } as never)
    .catch(() => null)
  if (!show) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Podcast Studio</h1>
        <p className="mt-3 text-sm">Show not found.</p>
      </main>
    )
  }
  const showDoc = show as unknown as { id: string; title: string; site: string | { id: string } }
  const siteId = typeof showDoc.site === 'string' ? showDoc.site : showDoc.site?.id
  const allowed = siteId
    ? await checkOperatorSiteAccess(payload, user, siteId).catch(() => false)
    : false
  if (!allowed) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Podcast Studio</h1>
        <p className="mt-3 text-sm">You do not have access to this show&apos;s site.</p>
      </main>
    )
  }

  const records = await listStudioSessionRecords(payload as never, showId).catch(
    () => [] as StudioSessionRecord[],
  )

  const audioEngineMissing = await probeAudioEngine()
    .then((engine) => engine.status === 'missing')
    .catch(() => true)

  return (
    <>
      {audioEngineMissing ? (
        <div
          role="alert"
          className="mx-auto mt-6 max-w-4xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Audio processing isn&apos;t set up on this server yet — recording in the browser and
          editing still work, but rendering, cleanup, live streaming and guest-track conforming are
          paused until an owner installs the audio engine from the Capability Center.
        </div>
      ) : null}
      <StudioWorkspace
        participantId={user?.id ? String(user.id) : 'host'}
        showId={showId}
        showTitle={String(showDoc.title ?? 'Untitled show')}
        initialSessions={JSON.parse(JSON.stringify(records))}
      />
    </>
  )
}
