import { describe, expect, it } from 'vitest'
import { reconcileContentNavigation } from '@/modules/public/content-navigation'
import { Content } from '@/collections/Publishing'
import { migrations } from '@/migrations'

describe('content publication references', () => {
  it('updates nested references while preserving query, fragment and external links', () => {
    const menus = reconcileContentNavigation(
      {
        primary: [
          {
            label: 'Parent',
            href: '/keep',
            children: [{ label: 'Post', href: '/old?view=full#body' }],
          },
          { label: 'External', href: 'https://example.test/old' },
        ],
      },
      '/old',
      '/new',
    )
    expect(menus.primary[0].children[0].href).toBe('/new?view=full#body')
    expect(menus.primary[1].href).toBe('https://example.test/old')
  })
  it('removes unavailable parents and promotes remaining valid children', () => {
    const menus = reconcileContentNavigation(
      {
        footer: [
          {
            label: 'Removed',
            href: '/gone',
            children: [
              { label: 'Kept', href: '/kept' },
              { label: 'Removed child', href: '/gone#body' },
            ],
          },
        ],
      },
      '/gone',
      null,
    )
    expect(menus.footer).toEqual([{ label: 'Kept', href: '/kept', children: [] }])
  })
  it('persists content visibility in the native Publish tab with an additive migration', () => {
    const tabs = Content.fields.find((field) => field.type === 'tabs')
    expect(tabs?.type).toBe('tabs')
    if (tabs?.type !== 'tabs') throw new Error('Missing native publishing tabs')
    const field = tabs.tabs
      .find((tab) => tab.label === 'Publish')
      ?.fields.find((field) => 'name' in field && field.name === 'visibility')
    expect(field).toMatchObject({
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: ['public', 'unlisted', 'members', 'friends', 'private'],
    })
    expect(
      migrations.some((migration) => migration.name === '20261018_050000_rc1_content_visibility'),
    ).toBe(true)
  })
})
