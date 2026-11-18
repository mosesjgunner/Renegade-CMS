/**
 * S2-14 regression tests: conversion review in the normal builder.
 *
 * A real S2-13 apply produces the record; the review read model then
 * drives the workflow: approximations wait for acceptance, quarantined
 * regions wait for a replacement block added through normal editing,
 * publication blockers clear only when every item resolves, decisions
 * go stale when the source moves, and the source mapping survives the
 * manual corrections. The panel renders the same model with its
 * blocker banner and per-item controls.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ConversionReviewPanel } from '@/modules/presentation/ConversionReviewPanel'
import { applyWordpressConversion } from '@/modules/portability/legacy-migration/conversion-apply'
import {
  conversionPublicationBlockers,
  readConversionDecisions,
  readConversionReview,
  recordConversionReviewDecision,
} from '@/modules/portability/legacy-migration/conversion-review'
import { readConversionBinding } from '@/modules/portability/legacy-migration/conversion-apply'
import type { LayoutBlock } from '@/modules/public/page-builder'

type Row = Record<string, unknown> & { id: string }

function makeWorld() {
  const layouts: Row[] = []
  let seq = 0
  const payload = {
    find: async ({ collection, where }: { collection: string; where?: Row }) => {
      if (collection !== 'page-layouts') return { docs: [] }
      const site = (where?.site as { equals?: string } | undefined)?.equals
      return {
        docs: structuredClone(layouts.filter((row) => !site || row.site === site)),
      }
    },
    findByID: async ({ id }: { id: string }) => {
      const row = layouts.find((candidate) => candidate.id === String(id))
      if (!row) throw new Error('not found')
      return structuredClone(row)
    },
    create: async ({ data }: { data: Row }) => {
      const row: Row = { ...structuredClone(data), id: `layout-${++seq}` }
      layouts.push(row)
      return structuredClone(row)
    },
    update: async ({ id, data }: { id: string; data: Partial<Row> }) => {
      const row = layouts.find((candidate) => candidate.id === String(id))
      if (!row) throw new Error('not found')
      Object.assign(row, structuredClone(data))
      return structuredClone(row)
    },
    jobs: { queue: async () => ({}) },
    db: {
      beginTransaction: async () => 'tx-1',
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
    },
  }
  return { payload: payload as never, raw: payload, layouts }
}

const asRecord = (row: Row) => row as unknown as { blocks?: unknown; revisionHistory?: unknown }

const OWNER = { id: 'op-1', role: 'owner', email: 'op@example.test' }

const SOURCE =
  '<!-- wp:paragraph --><p>Clean intro.</p><!-- /wp:paragraph -->' +
  '<!-- wp:quote --><blockquote><p>Quoted wisdom.</p></blockquote><!-- /wp:quote -->' +
  '<!-- wp:acme/pricing-table --><div>pricing</div><!-- /wp:acme/pricing-table -->'

describe('S2-14 conversion review', () => {
  it('drives the review workflow and gates publication until every item resolves', async () => {
    const world = makeWorld()
    const applied = await applyWordpressConversion(world.payload, {
      siteId: 'site-a',
      user: OWNER,
      sourceId: 'wxr-page-9',
      path: '/reviewed',
      name: 'Reviewed',
      themeId: 'neutral-starter',
      source: SOURCE,
    })
    expect(applied.applied).toBe(true)
    const record = world.layouts.find((row) => row.path === '/reviewed')!
    const layoutId = String(record.id)

    /* Review state straight after apply. */
    let review = readConversionReview(asRecord(record))!
    expect(review.publishable).toBe(false)
    const quote = review.items.find((item) => item.blockName === 'core/quote')!
    const plugin = review.items.find((item) => item.blockName === 'acme/pricing-table')!
    const paragraph = review.items.find((item) => item.blockName === 'core/paragraph')!
    expect(paragraph.state).toBe('ready')
    expect(quote.state).toBe('needs-acceptance')
    expect(plugin.state).toBe('needs-replacement')
    expect(conversionPublicationBlockers(asRecord(record))).toHaveLength(2)

    /* Accept the approximation. */
    review = await recordConversionReviewDecision(world.payload, {
      layoutId,
      user: OWNER,
      location: quote.location,
      decision: 'accepted',
    })
    expect(review.blockers).toHaveLength(1)

    /* Replace the widget with a normal component added through editing,
       then record the replacement against that block. */
    const withReplacement = structuredClone(
      world.layouts.find((row) => row.id === layoutId)!,
    ) as Row
    const replacement: LayoutBlock = {
      id: 'operator-pricing',
      component: 'publisher.rich-content',
      componentVersion: 1,
      props: { title: 'Pricing', body: 'Plans from $10.' },
    } as LayoutBlock
    withReplacement.blocks = [...(withReplacement.blocks as LayoutBlock[]), replacement]
    await world.raw.update({ id: layoutId, data: { blocks: withReplacement.blocks } })

    await expect(
      recordConversionReviewDecision(world.payload, {
        layoutId,
        user: OWNER,
        location: plugin.location,
        decision: 'replaced',
      }),
    ).rejects.toThrow(/replacement block is required/i)
    review = await recordConversionReviewDecision(world.payload, {
      layoutId,
      user: OWNER,
      location: plugin.location,
      decision: 'replaced',
      replacementBlockId: 'operator-pricing',
    })
    expect(review.publishable).toBe(true)
    const final = world.layouts.find((row) => row.id === layoutId)!
    expect(conversionPublicationBlockers(asRecord(final))).toEqual([])

    /* Mapping and decisions survive the manual corrections. The binding
       holds the two regions that produced target blocks; the quarantined
       region's census is the report, which still lists all three. */
    expect(readConversionBinding(asRecord(final))?.regions.length).toBe(2)
    expect(readConversionReview(asRecord(final))?.items).toHaveLength(3)
    expect(
      readConversionDecisions(asRecord(final))
        .map((decision) => decision.decision)
        .sort(),
    ).toEqual(['accepted', 'replaced'])

    /* A later source change makes the acceptance stale: the region's
       binding no longer matches the newest report. */
    const history = structuredClone(final.revisionHistory) as Array<Row>
    const lastApply = [...history].reverse().find((entry) => entry.action === 'conversion-apply')!
    const staleEntry = structuredClone(lastApply)
    const report = staleEntry.report as Array<{ location: string; sourceHash: string }>
    report.find((entry) => entry.location === quote.location)!.sourceHash = 'sha256:moved'
    history.push(staleEntry)
    const staleReview = readConversionReview({ blocks: final.blocks, revisionHistory: history })!
    expect(staleReview.items.find((item) => item.location === quote.location)?.state).toBe(
      'conflict-unresolved',
    )
    expect(staleReview.publishable).toBe(false)
  })

  it('renders the panel with blocker banner, item states and decision controls', () => {
    const html = renderToStaticMarkup(
      <ConversionReviewPanel
        layoutId="layout-1"
        blocks={[{ id: 'operator-pricing', component: 'publisher.rich-content' }]}
        initialReview={{
          sourceId: 'wxr-page-9',
          path: '/reviewed',
          appliedAt: '2026-11-17T00:00:00.000Z',
          publishable: false,
          blockers: [
            {
              location: 'blocks[1]',
              blockName: 'core/quote',
              outcome: 'approximated',
              reason: 'Quote styling maps to a rich content section.',
              sourceHash: 'sha256:abc',
              targetIds: ['wp-1'],
              targetPresent: [true],
              state: 'needs-acceptance',
            },
          ],
          items: [
            {
              location: 'blocks[1]',
              blockName: 'core/quote',
              outcome: 'approximated',
              reason: 'Quote styling maps to a rich content section.',
              sourceHash: 'sha256:abc',
              targetIds: ['wp-1'],
              targetPresent: [true],
              state: 'needs-acceptance',
            },
            {
              location: 'blocks[2]',
              blockName: 'acme/pricing-table',
              outcome: 'quarantined',
              sourceHash: 'sha256:def',
              targetIds: [],
              targetPresent: [],
              state: 'needs-replacement',
            },
          ],
        }}
      />,
    )
    expect(html).toContain('Conversion review')
    expect(html).toContain('must be resolved before publishing')
    expect(html).toContain('Accept approximation')
    expect(html).toContain('Mark replaced')
    expect(html).toContain('Media resolved')
    expect(html).toContain('Locate wp-1')
    expect(html).toContain('aria-label="Conversion review"')
  })
})
