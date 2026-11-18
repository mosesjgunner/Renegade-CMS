/**
 * S2-05 regression tests: nested sections/columns through Puck slots.
 *
 * Children live in the container's slot-typed props (column0/column1).
 * Validation bounds nesting (one level, per-slot and total budgets,
 * layout-wide unique ids), the Puck adapter round-trips children with
 * their metadata and uniquifies cloned child ids, and the public
 * renderer composes children with the same availability/visibility
 * policy as top-level blocks. Flat v1 layouts are untouched.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PresentationDocument } from '@/modules/presentation/contracts'
import { puckVisualEditor } from '@/modules/presentation/puck-adapter'
import {
  renderLayout,
  validateLayout,
  type LayoutBlock,
  type PageLayout,
} from '@/modules/public/page-builder'

const rich = (id: string, over: Record<string, unknown> = {}): LayoutBlock =>
  ({
    id,
    component: 'publisher.rich-content',
    componentVersion: 1,
    props: {
      title: `Title ${id}`,
      body: `Body ${id}`,
      alignment: 'left',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'normal',
      variant: 'contained',
    },
    ...over,
  }) as LayoutBlock

const columns = (over: Record<string, unknown> = {}): LayoutBlock =>
  ({
    id: 'cols-1',
    component: 'publisher.columns',
    componentVersion: 1,
    props: {
      title: 'Two up',
      alignment: 'left',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'normal',
      balance: 'equal',
      column0: [rich('child-a')],
      column1: [rich('child-b')],
    },
    ...over,
  }) as LayoutBlock

const layout = (blocks: LayoutBlock[]): PageLayout => ({
  version: 1,
  id: 'l1',
  siteId: 'site-a',
  path: '/',
  status: 'draft',
  themeId: 'neutral-starter',
  surface: 'page',
  slot: 'main',
  blocks,
  unknownBlocks: [],
  revision: 1,
})

const document = (blocks: LayoutBlock[]): PresentationDocument => ({
  version: 1,
  siteId: 'site-a',
  theme: { id: 'neutral-starter', version: '1.0.0' },
  template: { id: 'layout', version: '1.0.0' },
  surface: 'layout',
  slots: { main: blocks },
})

describe('S2-05 nested layout validation', () => {
  it('accepts a valid two-column layout and leaves flat layouts unchanged', () => {
    const nested = validateLayout(layout([columns(), rich('solo')]))
    expect(nested.errors).toEqual([])
    expect(nested.layout.blocks).toHaveLength(2)

    const flat = validateLayout(layout([rich('a'), rich('b')]))
    expect(flat.errors).toEqual([])
    expect(flat.layout.blocks.map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('rejects duplicate child ids, nested containers, and editorial children with deterministic errors', () => {
    const duplicate = validateLayout(
      layout([
        rich('solo'),
        columns({
          props: {
            ...columns().props,
            column0: [rich('solo')],
            column1: [],
          },
        }),
      ]),
    )
    expect(duplicate.errors.some((e) => e.includes('duplicate child component id: solo'))).toBe(
      true,
    )

    const nestedContainer = validateLayout(
      layout([
        columns({
          props: {
            ...columns().props,
            column0: [columns({ id: 'inner' })],
            column1: [],
          },
        }),
      ]),
    )
    expect(nestedContainer.errors.some((e) => e.includes('publisher.columns is not allowed'))).toBe(
      true,
    )
    const outer = nestedContainer.layout.blocks[0]
    expect((outer.props.column0 as LayoutBlock[]).length).toBe(0)

    const editorial = validateLayout(
      layout([
        columns({
          props: {
            ...columns().props,
            column0: [
              {
                id: 'body-1',
                component: 'publisher.editorial',
                componentVersion: 1,
                props: {},
              } as LayoutBlock,
            ],
            column1: [],
          },
        }),
      ]),
    )
    expect(editorial.errors.some((e) => e.includes('publisher.editorial is not allowed'))).toBe(
      true,
    )
  })

  it('preserves unknown children in place and keeps visibility metadata', () => {
    const result = validateLayout(
      layout([
        columns({
          props: {
            ...columns().props,
            column0: [
              rich('kept', { visible: { mobile: false } }),
              {
                id: 'mystery',
                component: 'acme.future-widget',
                componentVersion: 3,
                props: { anything: true },
              } as unknown as LayoutBlock,
            ],
            column1: [],
          },
        }),
      ]),
    )
    expect(
      result.errors.some((e) =>
        e.startsWith('Unavailable component preserved: acme.future-widget@3'),
      ),
    ).toBe(true)
    const outer = result.layout.blocks[0]
    const children = outer.props.column0 as LayoutBlock[]
    expect(children.map((c) => c.id)).toEqual(['kept', 'mystery'])
    expect(children[0].visible).toEqual({ mobile: false })
  })

  it('bounds children per slot and rejects non-array slot values', () => {
    const many = Array.from({ length: 21 }, (_, i) => rich(`c-${i}`))
    const result = validateLayout(
      layout([columns({ props: { ...columns().props, column0: many, column1: [] } })]),
    )
    expect(result.errors.some((e) => e.includes('at most 20 components'))).toBe(true)
    expect((result.layout.blocks[0].props.column0 as LayoutBlock[]).length).toBe(20)

    const bad = validateLayout(
      layout([columns({ props: { ...columns().props, column0: 'nope', column1: [] } })]),
    )
    expect(bad.errors.some((e) => e.includes('column0 must be an array'))).toBe(true)
  })
})

describe('S2-05 Puck adapter nesting', () => {
  it('round-trips children with metadata through editor data', () => {
    const doc = document([
      columns({
        props: {
          ...columns().props,
          column0: [rich('child-a', { visible: { tablet: false } })],
          column1: [rich('child-b', { hidden: true })],
        },
      }),
    ])
    const data = puckVisualEditor.toEditor(doc)
    const item = data.content[0] as unknown as {
      props: Record<string, Array<{ props: Record<string, unknown> }>>
    }
    expect(item.props.column0[0].props.id).toBe('child-a')
    const back = puckVisualEditor.fromEditor(doc, data)
    const outer = back.slots.main![0]
    const col0 = outer.props.column0 as LayoutBlock[]
    const col1 = outer.props.column1 as LayoutBlock[]
    expect(col0[0].id).toBe('child-a')
    expect(col0[0].visible).toEqual({ tablet: false })
    expect(col1[0].hidden).toBe(true)
  })

  it('reorders children by identity and uniquifies cloned child ids on duplicate', () => {
    const doc = document([columns()])
    const data = puckVisualEditor.toEditor(doc)
    type Item = { type: string; props: Record<string, unknown> }
    const content = data.content as unknown as Item[]
    const original = content[0]
    const col0 = original.props.column0 as Item[]
    const col1 = original.props.column1 as Item[]
    // Reorder: move child-b into column0 ahead of child-a.
    original.props.column0 = [col1[0], col0[0]]
    original.props.column1 = []
    // Duplicate the whole container with cloned (not regenerated) child ids.
    const clone = structuredClone(original)
    clone.props = { ...clone.props, id: 'cols-2' }
    const back = puckVisualEditor.fromEditor(doc, {
      content: [original, clone],
      root: { props: {} },
    } as never)
    const first = back.slots.main![0]
    expect((first.props.column0 as LayoutBlock[]).map((c) => c.id)).toEqual(['child-b', 'child-a'])
    const second = back.slots.main![1]
    expect(second.id).toBe('cols-2')
    expect((second.props.column0 as LayoutBlock[]).map((c) => c.id)).toEqual([
      'child-b-2',
      'child-a-2',
    ])
  })
})

describe('S2-05 public rendering of nested blocks', () => {
  it('renders children inside the columns grid with visibility and availability policy', () => {
    const html = renderToStaticMarkup(
      renderLayout(
        layout([
          columns({
            props: {
              ...columns().props,
              column0: [rich('vis', { visible: { mobile: false } }), rich('hid', { hidden: true })],
              column1: [
                {
                  id: 'mystery',
                  component: 'acme.future-widget',
                  componentVersion: 3,
                  props: {},
                } as unknown as LayoutBlock,
              ],
            },
          }),
        ]),
        'all',
      ),
    )
    expect(html).toContain('rg-columns')
    expect(html).toContain('Title vis')
    expect(html).toContain('rg-hide-mobile')
    expect(html).not.toContain('Title hid')
    expect(html).toContain('data-unavailable-component="acme.future-widget"')
  })
})
