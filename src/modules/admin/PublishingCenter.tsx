import type { AdminViewServerProps } from 'payload'
import { PublishingCenterClient } from './PublishingCenterClient'

export default async function PublishingCenter({ params }: AdminViewServerProps) {
  // Payload forwards Next's dynamic route params. In Next 16 these can be a
  // promise at runtime even though Payload's current public type is synchronous.
  // Reading it directly made both `/admin/posts` and `/admin/pages` select the
  // article fallback before the segment was available.
  const resolvedParams = await Promise.resolve(params)
  const seg = resolvedParams?.segments?.[0]
  const kind = seg === 'pages' ? 'page' : seg === 'podcasts' ? 'podcast' : 'article'
  if (kind === 'podcast')
    return (
      <main className="gutter--left gutter--right">
        <h1>Podcasts</h1>
      </main>
    )
  return <PublishingCenterClient kind={kind} />
}
