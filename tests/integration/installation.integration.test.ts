import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  beginPasskeyRegistration,
  ensureBootstrap,
  rotateBootstrapToken,
} from '../../src/modules/operations/installation'

let payload: Payload
let token = ''

beforeEach(async () => {
  payload = await getPayload({ config })
  await payload.db.pool.query('DELETE FROM installation_state')
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const status = await ensureBootstrap(payload, loadConfig())
  expect(status.state).toBe('incomplete')
  token = consoleWarn.mock.calls[0]?.[0].match(/: ([A-Za-z0-9_-]+)$/)?.[1] ?? ''
  expect(token).toHaveLength(43)
  consoleWarn.mockRestore()
})

afterEach(async () => {
  await payload.db.pool.query('DELETE FROM installation_state')
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('first-run installation state', () => {
  it('persists bootstrap availability and rejects an invalid token', async () => {
    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'owner@example.test',
        token: 'not-the-operator-token',
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_TOKEN_INVALID' })

    const options = await beginPasskeyRegistration(payload, loadConfig(), {
      email: 'owner@example.test',
      token,
    })
    expect(options.options.challenge).toBeTruthy()

    await expect(
      beginPasskeyRegistration(payload, loadConfig(), { email: 'owner@example.test', token }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_IN_PROGRESS' })

    const restartedStatus = await ensureBootstrap(payload, loadConfig())
    expect(restartedStatus).toMatchObject({ state: 'installing', ownerEmail: 'owner@example.test' })
  })

  it('rotates a local recovery token but refuses to reopen a completed install', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await rotateBootstrapToken(payload, loadConfig())
    const replacement = consoleWarn.mock.calls[0]?.[0].match(/: ([A-Za-z0-9_-]+)$/)?.[1] ?? ''
    consoleWarn.mockRestore()
    expect(replacement).toHaveLength(43)

    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'owner@example.test',
        token,
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_TOKEN_INVALID' })

    await payload.db.pool.query(
      `UPDATE installation_state
       SET state = 'complete', bootstrap_token_hash = NULL, bootstrap_expires_at = NULL
       WHERE singleton = true`,
    )
    await expect(rotateBootstrapToken(payload, loadConfig())).rejects.toMatchObject({
      code: 'INSTALLATION_COMPLETE',
    })
  })
})
