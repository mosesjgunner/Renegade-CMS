import config from '@payload-config'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { ExternalVideoWorkspace } from '@/modules/creator-studio/ExternalVideoWorkspace'
import { creatorWorkspace } from '@/modules/creator-studio/workspace'
import { submissionActor } from '@/modules/creator-studio/submission-http'
import { listVideoExports } from '@/modules/creator-studio/video-export'

export const dynamic = 'force-dynamic'

export default async function ExternalVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ youtube?: string }>
}) {
  const payload = await getPayload({ config })
  const request = new Request('http://localhost/studio/external-video', {
    headers: await headers(),
  })
  const actor = await submissionActor(payload, request).catch(() => null)
  const workspace =
    actor && (await creatorWorkspace(payload, actor.siteId, actor.memberId).catch(() => null))
  const exports = actor ? await listVideoExports(payload, actor).catch(() => []) : []
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/studio">Creator Studio</Link>
      <h1 className="text-3xl font-bold">External videos</h1>
      <ExternalVideoWorkspace
        spaceId={workspace?.space?.id ?? null}
        oauthResult={(await searchParams).youtube}
        exports={exports}
      />
    </main>
  )
}
