import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

test('FLOW-01: Renegade CMoS Workflow Browser Acceptance & Editorial Loop Proof', async ({
  page,
  context,
  baseURL: fixtureBaseURL,
}) => {
  const payload = await getPayload({ config })
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string; email?: string }
  expect(user).toBeTruthy()

  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  const baseURL = process.env.FLOW01_BASE_URL || fixtureBaseURL || 'http://localhost:3110'
  await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])

  const articleId = `browser-flow01-art-${Date.now()}`

  // 1. Navigate to Editorial Workflow Command Center Admin Page
  await page.goto(`${baseURL}/admin/workflow`)
  await expect(page.getByText('Editorial Workflow Command Center')).toBeVisible()
  await expect(page.getByText('Personal Queues')).toBeVisible()
  await expect(page.getByText('Team Queues')).toBeVisible()
  await expect(page.getByText('Workflow Templates')).toBeVisible()

  // 2. Inspect Workflow Templates tab
  await page.getByRole('button', { name: 'Workflow Templates' }).click()
  await expect(page.getByText('Built-in Simple Editorial Workflow')).toBeVisible()
  await expect(page.getByText('VALIDATED (NO DEAD ENDS)')).toBeVisible()

  // Switch back to Personal Queues
  await page.getByRole('button', { name: 'Personal Queues' }).click()

  // 3. Test Workflow Action API: Submit for review as author
  const submitRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'submit',
      role: 'author',
    },
  })
  expect(submitRes.status()).toBe(200)
  const submitData = await submitRes.json()
  expect(submitData.item.status).toBe('review')
  expect(submitData.item.assignment.dueDate).toBeTruthy()

  // 4. Test Security: Attempt Unauthorized Self-Approval (author trying to self-approve)
  const selfApproveRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'approve',
      role: 'editor',
    },
  })
  // Authenticated user ID matches article owner, so self-approval is forbidden
  expect(selfApproveRes.status()).toBe(403)
  const selfApproveData = await selfApproveRes.json()
  expect(selfApproveData.error).toContain('Self-approval is forbidden')

  // 5. Test Security: Attempt Wrong-Site Action
  const wrongSiteRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'approve',
      role: 'publisher',
      actorSiteId: 'unauthorized-site-999',
    },
  })
  expect(wrongSiteRes.status()).toBe(403)
  const wrongSiteData = await wrongSiteRes.json()
  expect(wrongSiteData.error).toContain('Cross-site action forbidden')

  // 6. Execute Request Changes (by non-owner editor)
  const requestChangesRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'request-changes',
      role: 'publisher', // Publisher override
      comment: 'Please add references and citations.',
    },
  })
  expect(requestChangesRes.status()).toBe(200)
  const reqChangesData = await requestChangesRes.json()
  expect(reqChangesData.item.status).toBe('changes-requested')

  // 7. Revise draft & Re-submit for review
  await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: { articleId, action: 'save-draft', role: 'author' },
  })
  const resubmitRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: { articleId, action: 'submit', role: 'author' },
  })
  expect(resubmitRes.status()).toBe(200)

  // 8. Approve Review as distinct peer reviewer
  const approveRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'approve',
      role: 'publisher',
      reviewerId: 'user-peer-editor-01',
      comment: 'Approved by publisher team.',
    },
  })
  expect(approveRes.status()).toBe(200)
  const approveData = await approveRes.json()
  expect(approveData.item.status).toBe('approved')
  expect(approveData.item.staleApproval).toBe(false)

  // 9. Stale Approval Protection: Author saves a new draft AFTER approval
  const newDraftRes = await page.request.post(`${baseURL}/api/admin/workflow/actions`, {
    data: {
      articleId,
      action: 'save-draft',
      role: 'author',
    },
  })
  expect(newDraftRes.status()).toBe(200)
  const newDraftData = await newDraftRes.json()
  expect(newDraftData.item.status).toBe('updated')
  expect(newDraftData.item.staleApproval).toBe(true)
  expect(newDraftData.item.staleReason).toContain('created after approval decision')

  // 10. Execute Bulk Queue Operation
  const bulkRes = await page.request.post(`${baseURL}/api/admin/workflow/bulk`, {
    data: {
      articleIds: [articleId],
      action: 'reassign',
      role: 'publisher',
      update: { editorId: 'editor-team-alpha', priority: 'high' },
    },
  })
  expect(bulkRes.status()).toBe(200)
  const bulkData = await bulkRes.json()
  expect(bulkData.result.totalCount).toBe(1)
  expect(bulkData.result.succeededCount).toBe(1)

  // 11. Fetch Audit History & Verify Chronological Trail with Exact Identifiers
  const auditRes = await page.request.get(`${baseURL}/api/admin/workflow/audit?articleId=${articleId}`)
  expect(auditRes.status()).toBe(200)
  const auditData = await auditRes.json()
  expect(auditData.auditTrail.length).toBeGreaterThanOrEqual(5)
  expect(auditData.auditTrail.some((a: { action: string }) => a.action === 'workflow.submitted_for_review')).toBe(true)
  expect(auditData.auditTrail.some((a: { action: string }) => a.action === 'workflow.decided_approved')).toBe(true)
  expect(auditData.auditTrail.some((a: { staleApproval?: boolean }) => a.staleApproval === true)).toBe(true)
})
