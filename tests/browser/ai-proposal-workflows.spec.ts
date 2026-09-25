import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { loadConfig } from '@/modules/core/config'
import { importMarkdownToRichText } from '@/modules/editorial/markdown'

test('AI: operator connects a tested local adapter and editors review four workflows', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const payload = await getPayload({ config })
  const server: Server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'fixture' }] }))
      return
    }
    if (request.url !== '/api/generate') {
      response.writeHead(404)
      response.end('{}')
      return
    }
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const input = JSON.parse(raw) as { prompt: string; format?: string }
    let output = 'Ready.'
    if (input.format === 'json') {
      output = input.prompt.includes('title and description')
        ? JSON.stringify({
            title: 'A better search title',
            description: 'A clear summary of this local test article.',
          })
        : input.prompt.includes('altText string')
          ? JSON.stringify({ altText: 'A river at dusk' })
          : input.prompt.includes('variants:')
            ? JSON.stringify({ variants: ['First draft copy', 'Second draft copy'] })
            : JSON.stringify({ ok: true })
    } else if (input.prompt.includes('Revise the selected passage')) output = 'Revised passage.'
    response.end(JSON.stringify({ response: output, prompt_eval_count: 40, eval_count: 12 }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  try {
    const site = (
      await payload.find({
        collection: 'sites',
        where: { slug: { equals: 'demo-publication' } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0] as unknown as { id: string }
    const publication = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: site.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const user = (await payload.find({ collection: 'users', limit: 1, overrideAccess: true }))
      .docs[0]
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { role: 'owner' },
      overrideAccess: true,
    })
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
    await context.addCookies([
      { name: 'renegade-passkey', value: session.token, url: baseURL || 'http://localhost:3110' },
    ])
    const suffix = randomUUID().slice(0, 8)
    const article = await payload.create({
      collection: 'content',
      data: {
        site: site.id,
        publication: publication.id,
        contentType: 'article',
        title: `AI test ${suffix}`,
        slug: `ai-test-${suffix}`,
        status: 'draft',
        visibility: 'public',
        summary: 'Original summary.',
        body: importMarkdownToRichText('Original passage.').document.document,
      },
      overrideAccess: true,
    } as never)
    const media = await payload.create({
      collection: 'media-assets',
      data: {
        site: site.id,
        publication: publication.id,
        title: `River ${suffix}`,
        kind: 'image',
        description: 'River at dusk',
        storageProvider: 'local',
        altText: '',
      },
      overrideAccess: true,
    } as never)
    const account = await payload.create({
      collection: 'social-accounts' as never,
      data: {
        site: site.id,
        publication: publication.id,
        displayName: `Manual ${suffix}`,
        network: 'manual',
        actorType: 'site',
        externalAccountId: `manual-${suffix}`,
        capabilities: {},
      },
      overrideAccess: true,
    } as never)
    const draft = await payload.create({
      collection: 'social-drafts' as never,
      data: {
        site: site.id,
        publication: publication.id,
        title: `Distribution ${suffix}`,
        status: 'draft',
        createdBy: user.id,
      },
      overrideAccess: true,
    } as never)
    const variant = await payload.create({
      collection: 'social-network-variants' as never,
      data: {
        draft: draft.id,
        account: account.id,
        label: 'Manual',
        network: 'manual',
        text: 'Current copy',
        status: 'draft',
        idempotencyKey: `ai-${suffix}`,
      },
      overrideAccess: true,
    } as never)

    await page.goto('/admin/ai')
    await expect(page.getByRole('heading', { name: 'AI proposals' })).toBeVisible()
    await page.getByLabel('Site').selectOption(String(site.id))
    await page.getByLabel('label', { exact: true }).fill(`Local test ${suffix}`)
    await page.getByLabel('Adapter').selectOption('ai.ollama')
    await page.getByLabel('endpoint').fill(`http://127.0.0.1:${port}`)
    await page.getByLabel('model').fill('fixture')
    await page.getByRole('button', { name: 'Save and test connection' }).click()
    await expect(page.getByRole('status')).toContainText('Connection saved as active')
    const connection = (
      await payload.find({
        collection: 'ai-connections' as never,
        where: { label: { equals: `Local test ${suffix}` } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0] as unknown as { id: string }
    await page
      .getByRole('combobox', { name: 'Provider', exact: true })
      .selectOption(String(connection.id))

    const request = async (task: string, id: string, selection = '') => {
      await page.getByLabel('Workflow').selectOption(task)
      await page.locator('section[aria-label="Request proposal"] input').fill(id)
      if (task === 'editor.improve-selection')
        await page.getByLabel('Complete draft text node to revise').fill(selection)
      await page.getByRole('button', { name: 'Preview source context' }).click()
      await expect(page.getByText('Exact context to be supplied')).toBeVisible()
      await page.getByRole('button', { name: 'Request proposal' }).click()
      await expect(page.getByRole('status')).toContainText('Proposal ready')
      const row = page.locator('section[aria-label="Proposal audit"] article').first()
      await expect(row).toContainText(task)
      return row
    }
    let row = await request('editor.improve-selection', String(article.id), 'Original passage.')
    await row.getByRole('button', { name: 'Apply proposal' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal applied')
    const revised = await payload.findByID({
      collection: 'content',
      id: article.id,
      overrideAccess: true,
    })
    expect(JSON.stringify(revised.body)).toContain('Revised passage.')
    const companion = await payload.find({
      collection: 'article-family-content' as never,
      where: { content: { equals: article.id } },
      limit: 1,
      overrideAccess: true,
    })
    expect(
      Number(
        (companion.docs[0] as unknown as { currentRevisionSequence?: number })
          ?.currentRevisionSequence,
      ),
    ).toBeGreaterThan(1)

    row = await request('intelligence.metadata-seo', String(article.id))
    await row.getByRole('button', { name: 'Decline without changes' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal declined')
    expect(
      (await payload.findByID({ collection: 'content', id: article.id, overrideAccess: true }))
        .seoTitle,
    ).toBeFalsy()
    row = await request('intelligence.metadata-seo', String(article.id))
    await row.getByRole('button', { name: 'Apply proposal' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal applied')
    expect(
      (await payload.findByID({ collection: 'content', id: article.id, overrideAccess: true }))
        .seoTitle,
    ).toBe('A better search title')

    row = await request('media.alt-text', String(media.id))
    await row.getByRole('button', { name: 'Apply proposal' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal applied')
    expect(
      (await payload.findByID({ collection: 'media-assets', id: media.id, overrideAccess: true }))
        .altText,
    ).toBe('A river at dusk')

    row = await request('distribution.copy-variants', String(variant.id))
    await row.getByRole('button', { name: 'Apply variant 2' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal applied')
    expect(
      (
        (await payload.findByID({
          collection: 'social-network-variants' as never,
          id: variant.id,
          overrideAccess: true,
        })) as { text: string }
      ).text,
    ).toBe('Second draft copy')

    await payload.update({ collection: 'users', id: user.id, data: { role: 'staff' }, overrideAccess: true })
    await page.reload()
    await page.getByLabel('Site').selectOption(String(site.id))
    await expect(page.getByRole('heading', { name: 'Configure a tested provider' })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption(String(connection.id))
    row = await request('media.alt-text', String(media.id))
    await row.getByRole('button', { name: 'Decline without changes' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal declined')
    expect((await payload.findByID({ collection: 'media-assets', id: media.id, overrideAccess: true })).altText).toBe('A river at dusk')

    const wrongSite = (
      await payload.find({
        collection: 'sites',
        where: { slug: { equals: 'analytics-e2e' } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const denied = await page.request.post('/api/admin/ai/preview', {
      data: { siteId: wrongSite.id, task: 'media.alt-text', targetId: media.id },
    })
    expect(denied.status()).toBe(403)
    const privateSource = await payload.create({
      collection: 'content',
      data: {
        site: site.id,
        publication: publication.id,
        contentType: 'article',
        title: `Private AI source ${suffix}`,
        slug: `private-ai-source-${suffix}`,
        status: 'draft',
        visibility: 'private',
        body: importMarkdownToRichText('Private source passage.').document.document,
      },
      overrideAccess: true,
    } as never)
    const privateDraft = await payload.create({
      collection: 'social-drafts' as never,
      data: {
        site: site.id,
        publication: publication.id,
        title: `Private distribution ${suffix}`,
        status: 'draft',
        sourceContent: privateSource.id,
        createdBy: user.id,
      },
      overrideAccess: true,
    } as never)
    const privateVariant = await payload.create({
      collection: 'social-network-variants' as never,
      data: {
        draft: privateDraft.id,
        account: account.id,
        label: 'Private source',
        network: 'manual',
        text: 'Unsent copy',
        status: 'draft',
        idempotencyKey: `ai-private-${suffix}`,
      },
      overrideAccess: true,
    } as never)
    const privateDenied = await page.request.post('/api/admin/ai/preview', {
      data: { siteId: site.id, task: 'distribution.copy-variants', targetId: privateVariant.id },
    })
    expect(privateDenied.status()).toBe(400)
    expect((await privateDenied.json()).error).toContain('public, published')
    await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('')
    await page.getByLabel('Workflow').selectOption('media.alt-text')
    await page.locator('section[aria-label="Request proposal"] input').fill(String(media.id))
    await page.getByRole('button', { name: 'Preview source context' }).click()
    await page.getByRole('button', { name: 'Request proposal' }).click()
    await expect(page.getByRole('status')).toContainText('Proposal no-provider')
    await payload.update({ collection: 'users', id: user.id, data: { role: 'owner' }, overrideAccess: true })
    await page.reload()
    await page.getByLabel('Site').selectOption(String(site.id))
    await page.getByRole('combobox', { name: 'Adapter', exact: true }).selectOption('ai.ollama')
    await page.getByLabel('label', { exact: true }).fill(`Offline ${suffix}`)
    await page.getByLabel('model', { exact: true }).fill('test-model')
    await page.getByLabel('endpoint').fill('http://127.0.0.1:65534')
    await page.getByRole('button', { name: 'Save and test connection' }).click()
    await expect(page.getByRole('status')).toContainText('Connection saved as degraded')
    const activeConnection = page.getByRole('region', { name: 'Connection health' })
      .locator('div.rounded.border.p-3').filter({ hasText: `Local test ${suffix}` })
    await activeConnection.getByRole('button', { name: 'Disable' }).click()
    await expect(activeConnection).toContainText('disabled')
  } finally {
    server.close()
    await payload.db.destroy?.()
  }
})
