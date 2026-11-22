import Link from 'next/link'
import type { Payload } from 'payload'
import { submissionTarget } from './submission-targets'

export async function SubmissionTargetLink({
  payload,
  siteId,
  target,
}: {
  payload: Payload
  siteId: string
  target: string
}) {
  const open = await submissionTarget(payload, { siteId, memberId: '' }, target, 'read').catch(
    () => null,
  )
  if (!open) return null
  return (
    <p className="mx-auto max-w-4xl px-6 py-4">
      <Link href={`/studio/submissions?target=${encodeURIComponent(target)}`}>
        Community submissions
      </Link>
    </p>
  )
}
