import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

// RC3-06 regression: the health probes must be answered by their own
// route handlers, never by the proxy's database-backed site resolution.
// With the database unreachable, /health/live (a static response) and
// /health/ready (which performs its own checks and returns a designed
// 503 body) both used to die as bare 500s inside the proxy because it
// resolved the site from the database for every non-API path first.
// Simulate the outage by making getPayload throw, exactly what a dead
// or unmigrated database does to the proxy's resolution block.
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => {
    throw new Error('database unavailable')
  }),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/modules/public/site-scope', () => ({
  publicSiteForHost: vi.fn(async () => null),
}))
vi.mock('@/modules/public/discovery', () => ({
  resolveRedirectForSite: vi.fn(async () => ({ resolution: null })),
}))

import { proxy } from '@/proxy'

const get = (path: string) => proxy(new NextRequest(`http://localhost:3110${path}`))

describe('proxy health paths during a database outage', () => {
  it('lets /health/live through without touching the database', async () => {
    const response = await get('/health/live')
    expect(response.status).toBe(200)
  })

  it('lets /health/ready through so the route can report not_ready itself', async () => {
    const response = await get('/health/ready')
    expect(response.status).toBe(200)
  })

  it('still resolves sites from the database for ordinary public paths', async () => {
    await expect(get('/')).rejects.toThrow('database unavailable')
  })

  it('leaves API paths to their handlers', async () => {
    const response = await get('/api/setup/readiness')
    expect(response.status).toBe(200)
  })
})
