import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { withLayoutWriteLock } from '../../src/modules/presentation/layout-write-lock'
import { puckVisualEditor } from '../../src/modules/presentation/puck-adapter'
import { resolveTheme } from '../../src/modules/presentation/registry'
import { validateLayout } from '../../src/modules/public/page-builder'

describe('04A visual editor write safety', () => {
  it('holds a PostgreSQL lock through work and releases it on failure', async () => {
    const calls: string[] = []
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql.includes('unlock') ? 'unlock' : 'lock')
      }),
      release: vi.fn(() => calls.push('release')),
    }
    const payload = { db: { pool: { connect: async () => client } } } as unknown as Payload
    await expect(
      withLayoutWriteLock(payload, 'layout-id', async () => {
        calls.push('write')
        throw new Error('failed write')
      }),
    ).rejects.toThrow('failed write')
    expect(calls).toEqual(['lock', 'write', 'unlock', 'release'])
    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_lock')
  })
  it('maps Puck generated namespaced ids to stable portable ids without losing metadata', () => {
    const original = {
      version: 1 as const,
      siteId: 'alpha',
      theme: { id: 'neutral-starter', version: '1.0.0' },
      template: { id: 'layout', version: '1.0.0' },
      surface: 'layout' as const,
      slots: {
        main: [
          {
            id: 'publisher_hero-uuid',
            component: 'publisher.hero',
            componentVersion: 1,
            props: { title: 'Original' },
            visible: { mobile: false },
          },
        ],
      },
    }
    const result = puckVisualEditor.fromEditor(original, {
      root: {},
      content: [{ type: 'publisher.hero', props: { id: 'publisher.hero-uuid', title: 'Updated' } }],
    })
    expect(result.slots.main?.[0]).toMatchObject({
      id: 'publisher_hero-uuid',
      visible: { mobile: false },
      props: { title: 'Updated' },
    })
    expect(puckVisualEditor.toEditor(result).content[0].props.id).toBe('publisher_hero-uuid')
  })
  it('reports malformed component shapes without throwing', () => {
    const base = {
      version: 1 as const,
      id: 'test',
      siteId: 'alpha',
      path: '/test',
      status: 'draft' as const,
      themeId: 'neutral-starter',
      revision: 1,
      blocks: [],
    }
    for (const blocks of [
      null,
      [null],
      [{}],
      [{ id: 'x', component: 'publisher.hero', componentVersion: 1, props: null }],
    ]) {
      expect(
        validateLayout({ ...base, blocks } as unknown as Parameters<typeof validateLayout>[0])
          .errors.length,
      ).toBeGreaterThan(0)
    }
  })
  it('navigation uses canonical link fields and rejects unsafe destinations', () => {
    const nav = resolveTheme('neutral-starter').componentRegistry['publisher.navigation']
    expect(nav.fields.link.type).toBe('link')
    expect(nav.fields.secondaryLink.type).toBe('link')
    const result = validateLayout({
      version: 1,
      id: 'test',
      siteId: 'alpha',
      path: '/test',
      status: 'draft',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      revision: 1,
      blocks: [
        {
          id: 'nav',
          component: nav.id,
          componentVersion: 1,
          props: {
            link: {
              id: 'content:one',
              siteId: 'alpha',
              label: 'Unsafe',
              href: 'javascript:alert(1)',
            },
          },
        },
      ],
    })
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
