import { createHmac } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { rotateOwnerRecoveryCodes } from '../../src/modules/operations/owner-recovery'
import type { Payload } from 'payload'

function fixture(owner = true, failInsert = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return { rows: owner ? [{ id: 'existing-owner' }] : [] }
    if (failInsert && sql.startsWith('INSERT INTO recovery_codes'))
      throw new Error('Storage failed')
    return { rows: [] }
  })
  const release = vi.fn()
  const payload = {
    config: { secret: 'local-test-secret' },
    db: { pool: { connect: async () => ({ query, release }) } },
  } as unknown as Payload
  return { payload, query, release }
}
it('rotates only an existing owner and atomically audits and revokes sessions', async () => {
  const { payload, query, release } = fixture()
  const codes = await rotateOwnerRecoveryCodes(payload, 'Owner@Example.test')
  expect(new Set(codes).size).toBe(10)
  expect(codes.every((code) => /^[A-F0-9]{20}$/.test(code))).toBe(true)
  expect(query).toHaveBeenCalledWith(expect.stringContaining("role = 'owner' FOR UPDATE"), [
    'owner@example.test',
  ])
  for (const code of codes)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO recovery_codes'), [
      'existing-owner',
      createHmac('sha256', 'local-test-secret').update(code).digest('hex'),
    ])
  expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE admin_sessions'), [
    'existing-owner',
  ])
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('owner.local_recovery_codes.rotated'),
    ['existing-owner'],
  )
  expect(query).toHaveBeenLastCalledWith('COMMIT')
  expect(release).toHaveBeenCalledOnce()
})
it('rejects nonowners before invalidating any credentials', async () => {
  const { payload, query } = fixture(false)
  await expect(rotateOwnerRecoveryCodes(payload, 'staff@example.test')).rejects.toThrow(
    'existing owner',
  )
  expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false)
  expect(query).toHaveBeenLastCalledWith('ROLLBACK')
})
it('rolls back credential changes when storage fails', async () => {
  const { payload, query } = fixture(true, true)
  await expect(rotateOwnerRecoveryCodes(payload, 'owner@example.test')).rejects.toThrow(
    'Storage failed',
  )
  expect(query).toHaveBeenLastCalledWith('ROLLBACK')
  expect(query).not.toHaveBeenCalledWith('COMMIT')
})
