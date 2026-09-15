import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { getAllIndexableDiscoveryDocuments } from '../public/discovery'
import { crawlerEntries, crawlerScale } from '../public/crawler'
import { ManualWebmasterAdapter } from '../public/indexing'
import { searchHealth, SEARCH_ADAPTER_THRESHOLD } from '../public/search-projection'

const stateOf = (event: Record<string, unknown>) => {
  const payload = event.payload as Record<string, unknown> | undefined
  return String(payload?.indexingState || 'queued')
}

export default async function IndexingCenter({ initPageResult }: AdminViewServerProps) {
  const req = initPageResult.req
  const role = String((req.user as { role?: string } | null)?.role || '')
  if (!['owner', 'administrator', 'staff'].includes(role))
    return (
      <main>
        <h1>Indexing Center</h1>
        <p>Staff access is required.</p>
      </main>
    )
  const docs = await getAllIndexableDiscoveryDocuments(req.payload)
  const entries = crawlerEntries(docs)
  const recent = await req.payload.find({
    collection: 'execution-events',
    where: { eventType: { equals: 'discovery.indexing.changed' } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  } as never)
  const provider = new ManualWebmasterAdapter()
  const providerHealth = await provider.health()
  const counts = recent.docs.reduce<Record<string, number>>((all, raw) => {
    const state = stateOf(raw as unknown as Record<string, unknown>)
    all[state] = (all[state] || 0) + 1
    return all
  }, {})
  const scale = crawlerScale(entries.length)
  const health = await searchHealth(req.payload).catch(() => [])
  return (
    <main className="gutter--left gutter--right">
      <h1>Indexing Center</h1>
      <p>
        {entries.length} eligible canonical URLs · {scale.partitions} sitemap partition(s) ·{' '}
        {scale.generation}
      </p>
      <p>
        <a href="/sitemap.xml" target="_blank">
          Sitemap index
        </a>{' '}
        ·{' '}
        <a href="/feed.xml" target="_blank">
          RSS
        </a>{' '}
        ·{' '}
        <a href="/feed.json" target="_blank">
          JSON Feed
        </a>{' '}
        ·{' '}
        <a href="/robots.txt" target="_blank">
          Robots
        </a>
      </p>
      <h2>Submission state</h2>
      <p>
        Queued {counts.queued || 0} · Submitted {counts.submitted || 0} · Acknowledged{' '}
        {counts.acknowledged || 0} · Failed {counts.failed || 0} · Manual {counts.manual || 0}
      </p>
      <h2>Local search health</h2>
      <p>
        PostgreSQL is the active search provider. External-search evaluation is triggered only after{' '}
        {SEARCH_ADAPTER_THRESHOLD.corpusDocuments.toLocaleString()} documents or p95 above{' '}
        {SEARCH_ADAPTER_THRESHOLD.p95LatencyMs}ms for{' '}
        {SEARCH_ADAPTER_THRESHOLD.consecutiveMeasurementWindows} windows.
      </p>
      <table>
        <thead>
          <tr>
            <th>Site</th>
            <th>Type</th>
            <th>Documents</th>
            <th>Missing body</th>
            <th>Version mismatch</th>
            <th>Last indexed</th>
          </tr>
        </thead>
        <tbody>
          {health.map((row) => (
            <tr key={`${row.site_id}:${row.content_type}`}>
              <td>{String(row.site_id)}</td>
              <td>{String(row.content_type)}</td>
              <td>{String(row.count)}</td>
              <td>{String(row.missing_body)}</td>
              <td>{String(row.version_mismatch)}</td>
              <td>{String(row.last_indexed_at || 'Never')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link href="/api/admin/indexing/search/reconcile">
          Reconcile search projection (staff only)
        </Link>
      </p>
      <h2>Provider configuration</h2>
      <p>
        {providerHealth.configured ? 'Healthy' : 'Not configured'}: {providerHealth.detail}
      </p>
      <p>
        No provider credentials are configured. Manual exports are handoffs and are never labelled
        submitted. <Link href="/api/admin/indexing/export">Download manual handoff JSON</Link>
      </p>
      <h2>Recent changes</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>State</th>
            <th>Action</th>
            <th>URL / issue</th>
          </tr>
        </thead>
        <tbody>
          {recent.docs.map((raw) => {
            const event = raw as unknown as Record<string, unknown>
            const payload = event.payload as Record<string, unknown> | undefined
            return (
              <tr key={String(event.id)}>
                <td>{String(event.occurredAt || event.createdAt)}</td>
                <td>{stateOf(event)}</td>
                <td>{String(payload?.action || '')}</td>
                <td>
                  <a href={String(payload?.url || '/admin/collections/content')}>
                    {String(payload?.url || 'Inspect event')}
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
