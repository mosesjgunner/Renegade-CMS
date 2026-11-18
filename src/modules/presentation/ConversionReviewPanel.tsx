'use client'

import { useCallback, useEffect, useState } from 'react'

import type {
  ConversionReview,
  ConversionReviewDecisionKind,
  ConversionReviewItem,
} from '../portability/legacy-migration/conversion-review'

/**
 * Conversion review panel for the normal builder (S2-14). It renders
 * the S2-12 report alongside the draft, straight from the layout
 * record's own history — no separate store, no competing editor. The
 * operator locates each region, accepts approximations, and records
 * replacements (blocks they added through the normal editor) or media
 * resolutions. Publication stays blocked by the layout route while
 * blockers remain.
 */
export function ConversionReviewPanel({
  layoutId,
  blocks,
  onLocate,
  initialReview,
}: {
  layoutId: string
  blocks: Array<{ id: string; component: string }>
  onLocate?: (item: ConversionReviewItem) => void
  initialReview?: ConversionReview | null
}) {
  const [review, setReview] = useState<ConversionReview | null>(initialReview ?? null)
  const [loaded, setLoaded] = useState(initialReview !== undefined)
  const [error, setError] = useState('')
  const [located, setLocated] = useState('')
  const [replacements, setReplacements] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    void fetch(`/api/layouts/${layoutId}/conversion-review`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setReview((data?.review as ConversionReview | null) ?? null)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [layoutId])

  useEffect(load, [load])

  const decide = useCallback(
    async (item: ConversionReviewItem, decision: ConversionReviewDecisionKind) => {
      setError('')
      const response = await fetch(`/api/layouts/${layoutId}/conversion-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          location: item.location,
          decision,
          replacementBlockId:
            decision === 'replaced' || decision === 'media-resolved'
              ? replacements[item.location]
              : undefined,
        }),
      })
      const data = (await response.json().catch(() => null)) as {
        review?: ConversionReview
        error?: string
      } | null
      if (!response.ok) {
        setError(data?.error ?? 'The decision could not be recorded.')
        return
      }
      if (data?.review) setReview(data.review)
    },
    [layoutId, replacements],
  )

  if (!loaded || !review) return null

  return (
    <section
      aria-label="Conversion review"
      className="border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-950"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Conversion review</h2>
        <span className="text-xs text-stone-500">
          Source {review.sourceId} · applied {new Date(review.appliedAt).toLocaleString()}
        </span>
      </div>
      {review.blockers.length > 0 ? (
        <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          {review.blockers.length} conversion item(s) must be resolved before publishing.
        </p>
      ) : (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          All conversion items are resolved. This draft can publish.
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-stone-100 dark:divide-stone-900">
        {review.items.map((item) => (
          <li
            key={item.location}
            className={`py-2 text-sm ${located === item.location ? 'bg-amber-50 dark:bg-amber-950' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{item.location}</span>
              <span>{item.blockName ?? 'freeform'}</span>
              <span className="badge-neutral badge text-[10px]">{item.outcome}</span>
              <span
                className={`badge text-[10px] ${item.state === 'ready' ? 'badge-brand' : 'badge-neutral'}`}
              >
                {item.state}
              </span>
              {item.targetIds.length ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setLocated(item.location)
                    onLocate?.(item)
                  }}
                >
                  Locate {item.targetIds.join(', ')}
                </button>
              ) : null}
            </div>
            {item.reason ? <p className="mt-1 text-xs text-stone-600">{item.reason}</p> : null}
            {item.state === 'needs-acceptance' ? (
              <button
                type="button"
                className="btn btn-secondary mt-2 px-3 py-1 text-xs"
                onClick={() => void decide(item, 'accepted')}
              >
                Accept approximation
              </button>
            ) : null}
            {item.state === 'needs-replacement' ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs">
                  Replacement block{' '}
                  <select
                    aria-label={`Replacement block for ${item.location}`}
                    className="border px-2 py-1 text-xs"
                    value={replacements[item.location] ?? ''}
                    onChange={(event) =>
                      setReplacements((current) => ({
                        ...current,
                        [item.location]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose a block you added…</option>
                    {blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.component} ({block.id})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary px-3 py-1 text-xs"
                  onClick={() => void decide(item, 'replaced')}
                >
                  Mark replaced
                </button>
                <button
                  type="button"
                  className="btn btn-secondary px-3 py-1 text-xs"
                  onClick={() => void decide(item, 'media-resolved')}
                >
                  Media resolved
                </button>
                <button
                  type="button"
                  className="btn btn-secondary px-3 py-1 text-xs"
                  onClick={() => void decide(item, 'accepted')}
                >
                  Accept omission
                </button>
              </div>
            ) : null}
            {item.state === 'conflict-unresolved' ? (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                The source changed under a local edit. Re-run the import with an explicit resolution
                to clear this item.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
