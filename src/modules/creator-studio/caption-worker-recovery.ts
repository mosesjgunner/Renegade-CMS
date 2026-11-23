import type { Payload } from 'payload'
import { withUploadLock } from '../media/upload-staging'
import { editAccessOptions } from './media-edit-projects'
import { mediaEditQueue } from './media-edit-recipe'

export async function recoverCreatorCaptionJobs(payload: Payload) {
  // Local ASR has a 30-minute deadline. Keep the lease above the longest adapter timeout.
  const cutoff = new Date(Date.now() - 35 * 60_000).toISOString()
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    ...editAccessOptions,
    limit: 10,
    where: {
      and: [
        { queue: { equals: mediaEditQueue } },
        {
          taskSlug: {
            in: [
              'podcast-transcribe',
              'media-peaks',
              'creator-transcript-assist',
              'creator-synthetic-dub',
            ],
          },
        },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  })
  for (const candidate of docs) {
    await withUploadLock(payload, 'creator-caption-recovery:' + candidate.id, async () => {
      const job = await payload.findByID({
        collection: 'payload-jobs',
        id: candidate.id,
        ...editAccessOptions,
        disableErrors: true,
      })
      if (!job?.processing || job.completedAt || job.updatedAt >= cutoff) return
      const attempts = job.totalTried ?? 0
      await payload.update({
        collection: 'payload-jobs',
        id: job.id,
        ...editAccessOptions,
        data: {
          processing: false,
          totalTried: attempts + 1,
          ...(attempts >= 2
            ? {
                hasError: true,
                error: {
                  name: 'CreatorCaptionClaimExpired',
                  message: 'The worker was interrupted. Retry the request.',
                },
              }
            : {}),
        },
      })
    })
  }
}
