import { expect, type Page, type BrowserContext } from '@playwright/test'
import type { Payload } from 'payload'
import assert from 'node:assert/strict'
import { createStaffEnrollmentToken } from '../../src/modules/operations/staff-enrollment'
import { loadConfig } from '../../src/modules/core/config'

export async function loginEditor(
  payload: Payload,
  page: Page,
  context: BrowserContext,
  siteId: string,
) {
  const invite = await createStaffEnrollmentToken(payload, loadConfig(), {
    email: `editor-${Date.now()}@rc104a.test`,
    role: 'administrator',
    siteId: siteId,
  })
  await page.goto('/login', { timeout: 180000 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const optionsResult = await page.evaluate(
    async (data) => {
      const response = await fetch('/api/auth/passkey/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      return { status: response.status, body: await response.json() }
    },
    { action: 'options', enrollmentToken: invite.enrollmentToken, siteId: siteId },
  )
  assert.equal(optionsResult.status, 200, JSON.stringify(optionsResult.body))
  const credential = await page.evaluate(`(async (opts) => {
      const decode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      const encode = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
      opts.challenge = decode(opts.challenge); opts.user.id = decode(opts.user.id)
      const result = await navigator.credentials.create({ publicKey: opts })
      const response = result.response
      return { id: result.id, rawId: encode(result.rawId), type: result.type, response: { clientDataJSON: encode(response.clientDataJSON), attestationObject: encode(response.attestationObject), transports: response.getTransports() } }
    })(${JSON.stringify(optionsResult.body.options)})`)
  const completeStatus = await page.evaluate(
    async (data) => {
      const response = await fetch('/api/auth/passkey/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      return response.status
    },
    {
      action: 'complete',
      enrollmentToken: invite.enrollmentToken,
      siteId: siteId,
      credential,
    },
  )
  assert.equal(completeStatus, 200)
  await page.waitForLoadState('networkidle', { timeout: 60000 })
  await page.waitForFunction(
    () =>
      Object.keys(document.querySelector('form') ?? {}).some((key) =>
        key.startsWith('__reactProps$'),
      ),
    { timeout: 60000 },
  )
  await page.getByLabel('Owner / Staff Email').fill(invite.user.email)
  const login = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/passkey/complete') && r.status() === 200,
  )
  await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await login
  await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 180000 })
}
