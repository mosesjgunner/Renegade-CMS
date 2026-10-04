import Link from 'next/link'
import type { Payload } from 'payload'

/** Task-oriented entry points backed by filtered views of the one content collection. */
export default function PublishingLinks({ payload }: { payload: Payload }) {
  const registered = (slug: keyof Payload['collections']) => Boolean(payload.collections[slug])
  return (
    <>
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/posts">Posts</Link>
      <Link href="/admin/pages">Pages</Link>
      <Link href="/admin/collections/page-layouts">Layouts</Link>
      <Link href="/admin/media-library">Media</Link>
      {registered('podcast-shows') && <Link href="/admin/collections/podcast-shows">Podcasts</Link>}
      <Link href="/admin/navigation">Menus</Link>
      <Link href="/admin/indexing">Indexing</Link>
      <Link href="/admin/redirects">Redirects</Link>
      <Link href="/admin/rendered-quality">Rendered Quality</Link>
      <Link href="/admin/workflow">Editorial Workflow</Link>
      {registered('content-releases') && <Link href="/admin/releases">Releases</Link>}
      <Link href="/admin/ai">AI Studio</Link>
      {registered('social-accounts') && <Link href="/admin/social">Social Distribution</Link>}
      {registered('email-messages') && <Link href="/admin/email-composer">Email Composer</Link>}
      <Link href="/admin/audience">Audience</Link>
      {registered('discussions') && <Link href="/admin/moderation">Community Moderation</Link>}
      {registered('analytics-events') && (
        <Link href="/admin/telemetry">Telemetry & Experiments</Link>
      )}
      {registered('products') && <Link href="/admin/catalog">Catalog</Link>}
      {registered('orders') && <Link href="/admin/commerce">Commerce Operations</Link>}
      {registered('pod-jobs') && <Link href="/admin/fulfillment">POD & Fulfillment</Link>}
      <Link href="/" target="_blank" rel="noreferrer">
        View Site
      </Link>
    </>
  )
}
