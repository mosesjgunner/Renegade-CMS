import { GuestJoinClient } from './GuestJoinClient'

export const dynamic = 'force-dynamic'

/**
 * POD-10 guest page. The invite token in the URL is the only
 * credential — guests have no account. The token is consumed by the
 * join call (single-use); everything after join runs on the separate
 * signalling credential the join returns.
 */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold">Join the show</h1>
      <GuestJoinClient token={token} />
    </main>
  )
}
