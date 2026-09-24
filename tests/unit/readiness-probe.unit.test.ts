import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/(frontend)/health/ready/route'
import { migrations } from '@/migrations'

const mockFind = vi.fn()
const mockQuery = vi.fn()

vi.mock('@payload-config', () => ({
  default: {},
}))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find: mockFind,
    db: {
      pool: {
        query: mockQuery,
      },
    },
  })),
}))

describe('GET /health/ready probe integrity', () => {
  it('returns 200 ready when migrations and schema columns are all valid', async () => {
    mockFind.mockResolvedValueOnce([{ id: 'site-1' }])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: String(migrations.length) }] }) // migration count check
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'events', column_name: 'required_entitlement' },
          { table_name: 'scheduled_publish_jobs', column_name: 'lease_owner' },
        ],
      }) // schema columns check

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      status: 'ready',
      checks: { database: 'ok', migrations: 'applied' },
    })
  })

  it('returns 503 not_ready when migrations are pending', async () => {
    mockFind.mockResolvedValueOnce([{ id: 'site-1' }])
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] }) // fewer than migrations.length

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      status: 'not_ready',
      checks: { database: 'ok', migrations: 'pending' },
    })
  })

  it('returns 503 not_ready when critical runtime columns are missing in schema', async () => {
    mockFind.mockResolvedValueOnce([{ id: 'site-1' }])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: String(migrations.length) }] })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'events', column_name: 'required_entitlement' }], // only 1 column found, scheduled_publish_jobs.lease_owner missing!
      })

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      status: 'not_ready',
      checks: { database: 'ok', schema: 'corrupted' },
    })
  })

  it('returns 503 not_ready when database is unavailable', async () => {
    mockFind.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      status: 'not_ready',
      checks: { database: 'unavailable' },
    })
  })
})
