import Link from 'next/link'
import type { Payload } from 'payload'
import SiteSwitcher from './SiteSwitcher'

/**
 * GUI-03B — task-first navigation.
 *
 * Daily entries first (Dashboard, Publishing, Media, Presentation),
 * then grouped operator areas in expandable <details> groups. Every
 * link targets a route registered in the GUI-03A ownership map;
 * module-gated links keep their existing registration checks.
 * Visibility here is NOT authorization — server policies still decide
 * what a role may open. <details> gives keyboard-operable disclosure
 * with no client JS; the group containing the destination is the
 * operator's to open — active-route auto-expansion rides the shell
 * work in later passes.
 */
export default function PublishingLinks({ payload }: { payload: Payload }) {
  const registered = (slug: keyof Payload['collections']) => Boolean(payload.collections[slug])
  return (
    <>
      <SiteSwitcher />
      <strong>Everyday</strong>
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/posts">Posts</Link>
      <Link href="/admin/pages">Pages</Link>
      <Link href="/admin/collections/sections">Sections</Link>
      <Link href="/admin/collections/categories">Categories</Link>
      <Link href="/admin/collections/albums">Collections</Link>
      <Link href="/admin/media-library">Media</Link>
      {registered('podcast-shows') && <Link href="/admin/collections/podcast-shows">Podcasts</Link>}
      <Link href="/admin/collections/page-layouts">Layouts</Link>
      <Link href="/admin/navigation">Menus</Link>
      {/* GUI-06C: themes live inside the Capability Center today (its
          ThemeCenter section) with no route of their own — the
          prompt forbids inventing one, so the nav names the real
          destination instead of leaving themes undiscoverable. */}
      <Link href="/admin/capabilities">Themes (in Capability Center)</Link>
      <details>
        <summary>Discovery</summary>
        <Link href="/admin/indexing">Indexing</Link>
        <Link href="/admin/redirects">Redirects</Link>
        <Link href="/admin/rendered-quality">Rendered Quality</Link>
      </details>
      <details>
        <summary>Workflow</summary>
        <Link href="/admin/workflow">Editorial Workflow</Link>
        {registered('content-releases') && <Link href="/admin/releases">Releases</Link>}
        <Link href="/admin/history">History</Link>
      </details>
      <details>
        <summary>Distribution</summary>
        {registered('social-accounts') && <Link href="/admin/social">Social Distribution</Link>}
        {registered('email-messages') && <Link href="/admin/email-composer">Email Composer</Link>}
      </details>
      <details>
        <summary>Audience & Community</summary>
        <Link href="/admin/audience">Audience</Link>
        {registered('discussions') && <Link href="/admin/moderation">Community Moderation</Link>}
      </details>
      <details>
        <summary>Commerce</summary>
        {registered('products') && <Link href="/admin/catalog">Catalog</Link>}
        {registered('orders') && <Link href="/admin/commerce">Commerce Operations</Link>}
        {registered('pod-jobs') && <Link href="/admin/fulfillment">POD & Fulfillment</Link>}
      </details>
      <details>
        <summary>Intelligence</summary>
        <Link href="/admin/ai">AI Studio</Link>
        {registered('analytics-events') && (
          <Link href="/admin/telemetry">Telemetry & Experiments</Link>
        )}
      </details>
      <details>
        <summary>Platform</summary>
        <Link href="/admin/capabilities">Capability Center</Link>
        <Link href="/admin/security">Security</Link>
        <Link href="/admin/design-system">Design System</Link>
        <Link href="/admin/migration">Migration</Link>
      </details>
      <Link href="/" target="_blank" rel="noreferrer">
        View Site
      </Link>
    </>
  )
}
