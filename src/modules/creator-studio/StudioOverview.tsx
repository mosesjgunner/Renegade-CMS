import Link from 'next/link'
import type { studioOverview } from './studio-overview'

type Overview = Awaited<ReturnType<typeof studioOverview>>
const states: Record<string, string> = {
  pending: 'Awaiting review',
  open: 'In progress',
  finalizing: 'Preparing your file',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Changes requested',
  failed: 'Needs attention',
  ready: 'Ready',
  processing: 'Preparing',
  quarantined: 'On hold',
  stale: 'Refresh needed',
  disconnected: 'Disconnected',
  unverified: 'Unverified',
}

const state = (value?: string | null) => (value ? (states[value] ?? value) : 'Unknown')
const size = (bytes: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
  }).format(bytes / 1_000_000)

export function StudioOverview({ overview }: { overview: Overview }) {
  const { media, pending, reviews, targets, providers, live, quota, available } = overview
  const panel = 'surface-card min-w-0 rounded-lg space-y-3 p-4'
  const heading = 'font-semibold'
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className={panel} aria-labelledby="studio-media">
        <h2 id="studio-media" className={heading}>
          Recent media
        </h2>
        {media.length ? (
          <ul>
            {media.map(({ id, title, status }) => (
              <li className="break-words" key={id}>
                {title} · {state(status)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{available.media ? 'No files yet.' : 'Media is temporarily unavailable.'}</p>
        )}
        <Link className="underline" href="/studio/media-edit">
          Open media editor
        </Link>
      </section>
      <section className={panel} aria-labelledby="studio-uploads">
        <h2 id="studio-uploads" className={heading}>
          Upload progress
        </h2>
        {pending.length ? (
          <ul className="space-y-2">
            {pending.map((item) => (
              <li key={item.id}>
                <Link className="underline" href={item.href}>
                  {item.title}
                </Link>{' '}
                · {state(item.state)}
                {item.state === 'open' && item.expectedSize > 0 && (
                  <progress
                    className="block w-full"
                    aria-label={item.title + ' upload progress'}
                    value={Math.min(item.receivedBytes, item.expectedSize)}
                    max={item.expectedSize}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {available.uploads
              ? 'No uploads in progress.'
              : 'Upload progress is temporarily unavailable.'}
          </p>
        )}
        <Link className="underline" href="/studio/create/upload">
          Upload a file
        </Link>
      </section>
      <section className={panel} aria-labelledby="studio-live">
        <h2 id="studio-live" className={heading}>
          Live rooms and events
        </h2>
        {live.length ? (
          <ul>
            {live.map(({ id, name, status, time }) => (
              <li key={id}>
                <Link className="underline" href={'/rooms/' + id}>
                  {name}
                </Link>{' '}
                · {status}{' '}
                {time && <time dateTime={String(time)}>{new Date(time).toLocaleString()}</time>}
              </li>
            ))}
          </ul>
        ) : (
          <p>{available.live ? 'No live rooms yet.' : 'Live rooms are temporarily unavailable.'}</p>
        )}
        {!overview.liveConfigured && <p>Broadcasting is unavailable on this site.</p>}
        {overview.liveConfigured && (
          <Link className="underline" href="/studio/create/live">
            Open a live room
          </Link>
        )}
      </section>
      <section className={panel} aria-labelledby="studio-limits">
        <h2 id="studio-limits" className={heading}>
          Upload limits
        </h2>
        {quota ? (
          <dl>
            <dt>Files</dt>
            <dd>
              {quota.uploads.used} / {quota.uploads.limit}
            </dd>
            <dt>Storage</dt>
            <dd>
              {size(quota.bytes.used)} / {size(quota.bytes.limit)}
            </dd>
          </dl>
        ) : (
          <p>Upload limits are unavailable for this account.</p>
        )}
      </section>
      <section className={panel} aria-labelledby="studio-sources">
        <h2 id="studio-sources" className={heading}>
          Linked videos
        </h2>
        {providers ? (
          <>
            <p>YouTube · {providers.youtube}</p>
            {!!providers.items.length && (
              <ul>
                {providers.items.map(({ id, title, status }) => (
                  <li key={id}>
                    {title} · {state(status)}
                  </li>
                ))}
              </ul>
            )}
            <Link className="underline" href="/studio/external-video">
              Manage video links
            </Link>
          </>
        ) : (
          <p>No source management is available.</p>
        )}
      </section>
      <section className={panel} aria-labelledby="studio-approvals">
        <h2 id="studio-approvals" className={heading}>
          Approvals and publishing destinations
        </h2>
        {!!reviews.length && (
          <ul>
            {reviews.map(({ id, title, status }) => (
              <li key={id}>
                {title} · {state(status)}
              </li>
            ))}
          </ul>
        )}
        <p>
          {targets.length
            ? 'Available destinations'
            : available.destinations
              ? 'No publishing destinations are available yet.'
              : 'Publishing destinations are unavailable.'}
        </p>
        {!!targets.length && (
          <ul>
            {targets.map(({ key, title }) => (
              <li key={key}>
                <Link
                  className="underline"
                  href={'/studio/submissions?destination=' + encodeURIComponent(key)}
                >
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="underline" href="/studio/submissions">
          View submissions
        </Link>
      </section>
      {(pending.some((item) => item.state === 'failed') ||
        providers?.items.some((item) =>
          ['stale', 'removed', 'unavailable'].includes(item.status),
        )) && (
        <section className={panel} aria-labelledby="studio-alerts">
          <h2 id="studio-alerts" className={heading}>
            Needs attention
          </h2>
          <ul>
            {pending
              .filter((item) => item.state === 'failed')
              .map((item) => (
                <li key={item.id}>
                  <Link className="underline" href={item.href}>
                    Check {item.title}
                  </Link>
                </li>
              ))}
            {providers?.items
              .filter((item) => ['stale', 'removed', 'unavailable'].includes(item.status))
              .map((item) => (
                <li key={item.id}>
                  <Link className="underline" href="/studio/external-video">
                    Check {item.title}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
