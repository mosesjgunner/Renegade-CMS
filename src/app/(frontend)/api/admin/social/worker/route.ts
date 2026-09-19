import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { processQueueBatch, type QueueBatchSummary } from '@/modules/social/worker'
import { type CanonicalSocialPost } from '@/modules/social/models'
import { type AuthContext } from '@/modules/social/contracts'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })

    const workerSecretHeader = request.headers.get('x-worker-secret')
    const configuredSecret = process.env.SOCIAL_WORKER_SECRET

    const isAuthorizedSecret =
      configuredSecret && workerSecretHeader && configuredSecret === workerSecretHeader

    if (!isAuthorizedSecret && !staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      posts?: CanonicalSocialPost[]
      workerId?: string
      maxItems?: number
    }

    const workerId = body.workerId || `worker-${Date.now()}`
    const incomingPosts = body.posts || []
    const authMap = new Map<string, AuthContext>()

    // Execute the batch processing pass
    const summary: QueueBatchSummary = await processQueueBatch(
      incomingPosts,
      authMap,
      undefined,
      { workerId },
    )

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Queue worker execution failed: ${message}` }, { status: 500 })
  }
}
