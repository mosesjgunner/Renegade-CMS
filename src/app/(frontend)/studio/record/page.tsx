import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { captureAccess } from '@/modules/creator-studio/capture-service'
import { submissionActor } from '@/modules/creator-studio/submission-http'
import { RecorderWorkspace } from '@/modules/creator-studio/RecorderWorkspace'

export const dynamic = 'force-dynamic'

export default async function RecordPage() {
  const payload = await getPayload({ config })
  const request = new Request('http://localhost/studio/record', { headers: await headers() })
  const actor = await submissionActor(payload, request).catch(() => null)
  const permitted =
    actor &&
    (await captureAccess(payload, actor).then(
      () => true,
      () => false,
    ))
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <Link href="/studio">Creator Studio</Link>
      <h1 className="text-3xl font-bold">Record</h1>
      {actor && permitted ? (
        <RecorderWorkspace scope={`${actor.siteId}:${actor.memberId}`} />
      ) : (
        <p>Sign in with an account that has Creator Studio upload access on this site.</p>
      )}
    </main>
  )
}
