import { describe, expect, it, vi } from 'vitest'
import {
  createPageFromTemplate,
  getPagesUsingTemplate,
  syncPageWithTemplate,
} from '@/modules/presentation/composition'
describe('04B canonical template tenant boundaries', () => {
  const template = {
    id: 'foreign',
    site: 'beta',
    surface: 'template',
    path: '__template__/foreign',
    themeId: 'neutral-starter',
    blocks: [],
    revision: 1,
  }
  it('rejects foreign template usage inspection before querying pages', async () => {
    const payload = { findByID: vi.fn(async () => template), find: vi.fn() }
    await expect(getPagesUsingTemplate(payload as never, 'foreign', 'alpha')).rejects.toThrow(
      'scope mismatch',
    )
    expect(payload.find).not.toHaveBeenCalled()
  })
  it('rejects foreign template instantiation before creating a page', async () => {
    const payload = { findByID: vi.fn(async () => template), create: vi.fn() }
    await expect(
      createPageFromTemplate(payload as never, {
        siteId: 'alpha',
        templateId: 'foreign',
        name: 'Page',
        path: '/page',
      }),
    ).rejects.toThrow('scope mismatch')
    expect(payload.create).not.toHaveBeenCalled()
  })
  it('rejects a stored foreign template link before updating a page', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({
          ...template,
          id: 'page',
          site: 'alpha',
          surface: 'page',
          templateId: 'foreign',
          templateMode: 'inherited',
        })
        .mockResolvedValueOnce(template),
      update: vi.fn(),
    }
    await expect(syncPageWithTemplate(payload as never, 'page')).rejects.toThrow('scope mismatch')
    expect(payload.update).not.toHaveBeenCalled()
  })
})
