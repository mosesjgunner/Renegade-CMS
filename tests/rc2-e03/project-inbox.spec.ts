/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { projectPendingInboxEvents } from '../../src/modules/community/inbox-notifications'

/**
 * RC2-E-03 seam proof: run the outbox -> inbox projector through its own
 * production module. The E-03 journey measures that no production path
 * (route, job, worker) calls this function; the inbox store stays empty
 * until the projector is run explicitly. Writes /tmp/e03-projection.json.
 */
describe('RC2-E-03 inbox projection', () => {
  it('projects pending outbox events into inbox notifications', async () => {
    const payload: Payload = await getPayload({ config })
    const result = await projectPendingInboxEvents(payload as any, 500)
    writeFileSync('/tmp/e03-projection.json', JSON.stringify(result, null, 2))
    expect(result.processed).toBeGreaterThanOrEqual(1)
  }, 120_000)
})
