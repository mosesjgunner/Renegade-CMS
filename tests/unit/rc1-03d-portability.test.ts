import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { legacyBodyToLexical } from '../../src/modules/portability/legacy-migration/body'
import {
  inspectLegacySite,
  executeLegacyMigration,
  verifyLegacyMigration,
  activateLegacyMigration,
  rollbackLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import { MemoryLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import { acquireLegacyMedia } from '../../src/modules/portability/legacy-migration/media'
import { canMigrateLegacySite } from '../../src/modules/portability/legacy-migration/access'
import type { Payload } from 'payload'
import { validatePublicPath } from '../../src/modules/public/semantic-url'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=',
  'base64',
)
const fixture = async () => ({
  wxr: await readFile('tests/fixtures/legacy-migration/wordpress-fixture.xml', 'utf8'),
  mediaFiles: { 'tribune-hero.png': { fileName: 'tribune-hero.png', buffer: png } },
})

describe('03D migration safety', () => {
  it('accepts the canonical homepage root while rejecting reserved and unsafe paths', () => {
    expect(validatePublicPath('/')).toBe('/')
    for (const path of ['//', '/admin', '/api', '/a/../b', '/%2f', '/bad_name', '/Upper'])
      expect(() => validatePublicPath(path)).toThrow()
  })
  it('rejects non-WXR and entity declarations with actionable errors', () => {
    for (const wxr of [
      '<<<broken>>>',
      '<rss><channel></channel></rss>',
      '<!DOCTYPE rss><rss><channel><wp:wxr_version>1.2</wp:wxr_version></channel></rss>',
    ]) {
      const report = inspectLegacySite({ wxr })
      expect(report.valid).toBe(false)
      expect(report.errors[0]).toContain('WordPress WXR')
    }
  })
  it('converts safe headings and acquired images to editable Lexical nodes without executable markup', () => {
    const body = legacyBodyToLexical(
      '<!-- wp:heading --><h2>A heading</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Hello<script>evil()</script> world</p><!-- /wp:paragraph --><!-- wp:image --><img src="/media/asset-123" /><!-- /wp:image -->',
    )
    expect(body.root.children[0]).toMatchObject({ type: 'heading', tag: 'h2' })
    expect(body.root.children[2]).toMatchObject({
      type: 'upload',
      relationTo: 'media-assets',
      value: 'asset-123',
    })
    expect(JSON.stringify(body)).not.toContain('evil()')
    expect(JSON.stringify(body)).not.toContain('<h2>')
  })
  it('denies member and foreign-site migration before any writes', async () => {
    const payload = { count: vi.fn().mockResolvedValue({ totalDocs: 1 }) } as unknown as Payload
    expect(await canMigrateLegacySite(payload, { id: 'member', role: 'member' }, 'site-a')).toBe(
      false,
    )
    const user = { id: 'staff', role: 'staff', authorizedSiteIds: ['site-a'], isGlobalOwner: false }
    expect(await canMigrateLegacySite(payload, user, 'site-b')).toBe(false)
    expect(await canMigrateLegacySite(payload, user, 'site-a', true)).toBe(false)
    expect(await canMigrateLegacySite(payload, user, 'site-a')).toBe(false)
  })
  it('checks all-sites authority for global author writes', async () => {
    const payload = { count: vi.fn().mockResolvedValue({ totalDocs: 0 }) } as unknown as Payload
    expect(
      await canMigrateLegacySite(
        payload,
        { id: 'admin', role: 'administrator', authorizedSiteIds: ['site-a'] } as never,
        'site-a',
      ),
    ).toBe(true)
  })
  it('refuses cross-source and cross-site checkpoint reuse', async () => {
    const pkg = await fixture(),
      store = new MemoryLegacyMigrationStore()
    const report = await executeLegacyMigration(pkg, store, {})
    await expect(
      executeLegacyMigration({ ...pkg, wxr: pkg.wxr + ' ' }, store, {}, report.runId),
    ).rejects.toThrow('different source XML or target site')
    await expect(
      executeLegacyMigration(pkg, store, { targetSiteId: 'foreign' }, report.runId),
    ).rejects.toThrow('different source XML or target site')
  })
  it('verifies persisted records and refuses activation after content disappears', async () => {
    const store = new MemoryLegacyMigrationStore(),
      report = await executeLegacyMigration(await fixture(), store, {})
    store.content.delete(report.createdEntityIds.contentIds[0])
    const verified = await verifyLegacyMigration(report.runId, store)
    expect(verified.stage).toBe('failed')
    expect(verified.acceptanceChecklist.contentCountsMatch).toBe(false)
    await expect(activateLegacyMigration(report.runId, store, 'owner')).rejects.toThrow()
  })
  it('does not report activation when publishing one layout fails', async () => {
    const store = new MemoryLegacyMigrationStore(),
      report = await executeLegacyMigration(await fixture(), store, {})
    await verifyLegacyMigration(report.runId, store)
    store.publishLayout = vi.fn().mockRejectedValue(new Error('layout write failed'))
    await expect(activateLegacyMigration(report.runId, store, 'owner')).rejects.toThrow(
      'layout write failed',
    )
    expect((await store.getMigrationRun(report.runId))?.stage).toBe('verified')
  })
  it('never deletes reused media during rollback and does not suppress native retention refusal', async () => {
    const store = new MemoryLegacyMigrationStore(),
      pkg = await fixture()
    const first = await executeLegacyMigration(pkg, store, {})
    const rerun = await executeLegacyMigration(pkg, store, {
      targetSiteMode: 'existing-site',
      targetSiteId: first.siteId,
    })
    expect(rerun.createdEntityIds.mediaIds).toEqual([])
    store.deleteEntity = vi.fn().mockRejectedValue(new Error('retained content'))
    await expect(rollbackLegacyMigration(first.runId, store, 'owner')).rejects.toThrow(
      'retained content',
    )
    expect((await store.getMigrationRun(first.runId))?.stage).not.toBe('rolled-back')
  })
  it('accepts Buffer JSON media transport while rejecting malformed bytes', async () => {
    const pkg = await fixture(),
      { parseWxr } = await import('../../src/modules/portability/legacy-migration/parser')
    const media = parseWxr(pkg.wxr).media
    const store = new MemoryLegacyMigrationStore()
    const result = await acquireLegacyMedia(media, store, {
      siteId: 'site',
      localMediaFiles: JSON.parse(JSON.stringify(pkg.mediaFiles)),
    })
    expect(result.createdMediaIds).toHaveLength(1)
    expect(result.acquiredMedia.size).toBe(1)
    const invalid = await acquireLegacyMedia(media, store, {
      siteId: 'site',
      localMediaFiles: {
        'tribune-hero.png': { fileName: 'bad', buffer: { type: 'Buffer', data: [999] } },
      } as never,
    })
    expect(invalid.errors[0].code).toBe('INVALID_LOCAL_MEDIA')
    expect(invalid.acquiredMedia.size).toBe(0)
  })
})
