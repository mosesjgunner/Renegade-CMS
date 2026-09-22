import { describe, expect, it, vi } from 'vitest'
import { up } from '@/migrations/20260922_090000_comm_07c_message_attachments'
import { cleanupOrphanedMessageAttachments, messageAttachmentMaxBytes, scanMessageAttachment, linkMessageAttachments } from '@/modules/community/message-attachments'
import { presignS3Put } from '@/modules/media/storage'

const s3 = { endpoint: 'https://objects.example.test', bucket: 'community', region: 'us-east-1', accessKeyId: 'KEY', secretAccessKey: 'SECRET' }
describe('COMM-07C governed message attachments', () => {
  it('persists restricted statuses, ten megabyte boundary, and orphan cleanup index', async () => {
    const execute = vi.fn(async () => undefined); await up({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0][0])
    expect(schema).toContain('message_attachments'); expect(schema).toContain('pending_scan'); expect(schema).toContain('quarantined'); expect(schema).toContain(String(messageAttachmentMaxBytes)); expect(schema).toContain('orphan_cleanup_idx')
  })
  it('mints a direct PUT capability that expires exactly after fifteen minutes', () => {
    const now = new Date('2026-09-22T12:00:00.000Z')
    const signed = presignS3Put(s3, 'community/site/file', 'image/png', 900, now)
    expect(signed.url).toContain('X-Amz-Expires=900'); expect(signed.headers).toEqual({ 'content-type': 'image/png' }); expect(signed.expiresAt).toBe('2026-09-22T12:15:00.000Z')
    expect(() => presignS3Put(s3, 'k', 'image/png', 901, now)).toThrow('fifteen minutes')
  })
  it('rejects ELF bytes renamed as PNG during worker scan', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT') ? { rows: [{ id: 'a', status: 'pending_scan', storage_key: 'k', byte_size: 4, claimed_mime_type: 'image/png' }] } : { rows: [] })
    const payload = { db: { pool: { query } } } as never
    const config = { storage: { driver: 'local', mediaDir: '/tmp/comm-07c-no-object', maxUploadBytes: messageAttachmentMaxBytes } } as never
    await expect(scanMessageAttachment(payload, config, 'a')).resolves.toBe('rejected')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE message_attachments'), ['a', 'rejected'])
  })
  it('refuses cross-site attachment linking', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    await expect(linkMessageAttachments(query, { siteId: 'site-a', memberId: 'member-a', messageId: 'message-a', attachmentIds: ['00000000-0000-7000-8000-000000000001'] })).rejects.toMatchObject({ code: 'ATTACHMENT_SCOPE_DENIED', status: 403 })
  })
  it('deletes unlinked expired metadata and its storage object', async () => {
    const fetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }))
    try {
      const query = vi.fn(async () => ({ rows: [{ id: 'a', storage_key: 'community/site/a' }] }))
      const count = await cleanupOrphanedMessageAttachments({ db: { pool: { query } } } as never, { storage: { driver: 's3', s3, mediaDir: '/tmp', maxUploadBytes: messageAttachmentMaxBytes } } as never)
      expect(count).toBe(1); expect(query).toHaveBeenCalledWith(expect.stringContaining("created_at < now() - interval '24 hours'")); expect(query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM message_attachments'), [['a']]); expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain('/community/community/site/a'); expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
    } finally { globalThis.fetch = fetch }
  })
})
