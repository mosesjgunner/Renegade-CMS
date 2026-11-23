import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { captureAccess } from '@/modules/creator-studio/capture-service'
import { requireEdit } from '@/modules/creator-studio/media-edit-projects'
import { submissionActor } from '@/modules/creator-studio/submission-http'
import { MediaEditWorkspace } from '@/modules/creator-studio/MediaEditWorkspace'

export const dynamic = 'force-dynamic'

export default async function MediaEditPage() {
  const payload = await getPayload({ config })
  const request = new Request('http://localhost/studio/media-edit', { headers: await headers() })
  const actor = await submissionActor(payload, request).catch(() => null)
  const allowed =
    actor &&
    (await requireEdit(payload, actor).then(
      () => true,
      () => false,
    ))
  const canRecord =
    allowed &&
    (await captureAccess(payload, actor).then(
      () => true,
      () => false,
    ))
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <Link href="/studio">Creator Studio</Link>
      <h1 className="text-3xl font-bold">Media editor</h1>
      {allowed ? (
        <MediaEditWorkspace
          canRecord={Boolean(canRecord)}
          siteId={actor.siteId}
          scope={`${actor.siteId}:${actor.memberId}`}
        />
      ) : (
        <p>Sign in with an account that has Creator Studio media editing access on this site.</p>
      )}
    </main>
  )
}
