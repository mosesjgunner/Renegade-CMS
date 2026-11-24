import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  GET as getTranslations,
  POST as postTranslations,
} from '../../src/app/(frontend)/api/admin/translations/route'
import { computeHreflangAlternates } from '../../src/modules/editorial/localization/hreflang'
import type { TranslationGroup } from '../../src/modules/editorial/localization/contracts'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC3-21 (#61) localization journey: real Payload + real DB + a real
 * passkey staff session (the pattern `tests/beta-gui01b-v2/seed-session.mts`
 * uses to mint `renegade-passkey` sessions), driving the actual
 * translations route handlers. Unlike flow-05's full getPayload mock,
 * nothing here is mocked: the bridge must read and write real content.
 * The engine itself remains in-memory by design (named gap).
 */

let payload: Payload
let siteId: string
let userId: string
let authHeaders: Record<string, string>
let sourceContentId: string
let materializedContentId: string | null = null
const suffix = randomUUID().slice(0, 8)
const sourceSlug = `rc321-journey-${suffix}`

const post = async (body: Record<string, unknown>) => {
  const res = await postTranslations(
    new Request('http://127.0.0.1:3113/api/admin/translations', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, data: (await res.json()) as Record<string, any> }
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const site = (await payload.create({
    collection: 'sites',
    data: { name: `RC321 W3 Site ${suffix}`, slug: `rc321w3-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)) as { id: string }
  siteId = site.id

  const user = (await payload.create({
    collection: 'users',
    data: { email: `rc321w3-${suffix}@example.test`, role: 'owner' },
    overrideAccess: true,
  } as never)) as { id: string; email: string }
  userId = user.id

  const session = await createPasskeySession(
    { id: user.id, email: user.email },
    process.env.PAYLOAD_SECRET!,
    async (sessionId, expiresAt) => {
      await (
        payload.db as unknown as {
          pool: { query: (text: string, values: unknown[]) => Promise<unknown> }
        }
      ).pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  authHeaders = {
    'Content-Type': 'application/json',
    Cookie: `renegade-passkey=${session.token}`,
  }
})

afterAll(async () => {
  for (const id of [materializedContentId, sourceContentId]) {
    if (id)
      await payload
        .delete({ collection: 'content', id, overrideAccess: true } as never)
        .catch(() => undefined)
  }
  if (userId)
    await payload
      .delete({ collection: 'users', id: userId, overrideAccess: true } as never)
      .catch(() => undefined)
  if (siteId)
    await payload
      .delete({ collection: 'sites', id: siteId, overrideAccess: true } as never)
      .catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('RC3-21 localization bridge journey (real content, real DB)', () => {
  it('bridges a real published doc through translation, review and materialized publish', async () => {
    // 1. Real source content doc, published, with in-bounds SEO fields.
    const source = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        contentType: 'article',
        title: 'Localization Journey Source Story',
        slug: sourceSlug,
        status: 'published',
        publishedAt: new Date().toISOString(),
        visibility: 'public',
        summary: 'A source summary for the localization journey test article.',
        seoTitle: 'Localization Journey Source Story',
        seoDescription:
          'A complete source description for the localization journey test, written for readers.',
        body: fixtureRichText('The source body paragraph for the localization journey test.'),
      },
      overrideAccess: true,
    } as never)) as Record<string, any>
    sourceContentId = String(source.id)
    const sourceCanonicalPath = String(source.canonicalPath)
    expect(sourceCanonicalPath.length).toBeGreaterThan(1)

    // The editorial companion the bridge must read the revision pin from.
    const companions = (await payload.find({
      collection: 'article-family-content',
      where: { content: { equals: sourceContentId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)) as { docs: Array<Record<string, any>> }
    const companion = companions.docs[0]
    expect(companion).toBeDefined()
    const companionSequence = Number(companion.currentRevisionSequence)
    expect(companionSequence).toBeGreaterThanOrEqual(1)

    // 2. create-group-from-content builds the group from the REAL doc.
    const created = await post({ action: 'create-group-from-content', contentId: sourceContentId })
    expect(created.status).toBe(200)
    expect(created.data.success).toBe(true)
    const group = created.data.group as TranslationGroup
    expect(group.sourceDocumentId).toBe(sourceContentId)
    expect(group.sourceLocale).toBe('en')
    expect(group.variants.en.revisionSequence).toBe(companionSequence)
    expect(group.variants.en.title).toBe('Localization Journey Source Story')
    const groupId = group.id

    // 3. Request a Spanish translation and draft it with the fixture provider.
    const requested = await post({
      action: 'request-translation',
      groupId,
      targetLocale: 'es',
    })
    expect(requested.status).toBe(200)
    const requestId = String(requested.data.request.id)

    const drafted = await post({ action: 'draft-provider', requestId })
    expect(drafted.status).toBe(200)
    expect(drafted.data.success).toBe(true)
    expect(drafted.data.request.attribution.isMachineDraft).toBe(true)
    expect(drafted.data.request.attribution.provider).toBe('simulated-ai-translator')
    expect(drafted.data.request.attribution.humanReviewed).toBe(false)

    // 4. Publish before human review is blocked by the policy gate, and
    // no localized content document exists yet.
    const earlyPublish = await post({ action: 'publish', groupId, locale: 'es' })
    expect(earlyPublish.status).toBe(500)
    expect(String(earlyPublish.data.error)).toContain('PUBLICATION_GATE_BLOCKED')
    const beforePublish = (await payload.find({
      collection: 'content',
      where: { slug: { equals: `${sourceSlug}-es` } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)) as { docs: unknown[] }
    expect(beforePublish.docs).toHaveLength(0)

    // 5. Human edit (in-bounds SEO), review, approve, publish.
    const edited = await post({
      action: 'update-target',
      requestId,
      updates: {
        title: 'Historia de localización en español',
        summary: 'Resumen en español de la historia de prueba de localización.',
        seoTitle: 'Historia de localización en español para lectores',
        seoDescription:
          'Descripción completa en español para la historia de prueba de localización editorial.',
      },
    })
    expect(edited.status).toBe(200)
    expect(edited.data.variant.title).toBe('Historia de localización en español')

    const submitted = await post({ action: 'submit-review', requestId })
    expect(submitted.status).toBe(200)
    expect(submitted.data.request.status).toBe('in-review')

    const approved = await post({ action: 'approve', requestId })
    expect(approved.status).toBe(200)
    expect(approved.data.request.status).toBe('approved')

    const published = await post({ action: 'publish', groupId, locale: 'es' })
    expect(published.status).toBe(200)
    expect(published.data.success).toBe(true)
    expect(published.data.variant.status).toBe('published')
    expect(typeof published.data.materializedContentId).toBe('string')
    materializedContentId = String(published.data.materializedContentId)

    // 6. Read back the materialized document via Payload.
    const materialized = (await payload.findByID({
      collection: 'content',
      id: materializedContentId,
      depth: 0,
      overrideAccess: true,
    } as never)) as Record<string, any>
    expect(materialized.slug).toBe(`${sourceSlug}-es`)
    expect(materialized.canonicalPath).toBe(`/es${sourceCanonicalPath}`)
    expect(materialized.title).toBe('Historia de localización en español')
    expect(JSON.stringify(materialized.body)).toContain(
      'The source body paragraph for the localization journey test.',
    )
    // Source was published, so the localized doc is published too.
    expect(materialized.status).toBe('published')
    expect(materialized.seoTitle).toBe('Historia de localización en español para lectores')
    const overrides = materialized.discoveryOverrides as Record<string, any>
    expect(overrides.locale).toBe('es')
    expect(overrides.alternates.en).toBe(sourceCanonicalPath)
    expect(overrides.alternates.es).toBe(`/es${sourceCanonicalPath}`)
    expect(overrides.sourceContentId).toBe(sourceContentId)
    expect(overrides.translationGroupId).toBe(groupId)

    // Hreflang for the group (live engine state via the route's GET)
    // includes both approved/published locales.
    const getRes = await getTranslations(
      new Request(`http://127.0.0.1:3113/api/admin/translations?groupId=${groupId}`, {
        method: 'GET',
        headers: authHeaders,
      }),
    )
    expect(getRes.status).toBe(200)
    const liveGroup = ((await getRes.json()) as Record<string, any>).group as TranslationGroup
    const hreflang = computeHreflangAlternates(liveGroup, 'es', 'https://example.com')
    expect(hreflang.activeLocales).toContain('en')
    expect(hreflang.activeLocales).toContain('es')
    expect(hreflang.alternateLocales.es).toBeDefined()
    expect(hreflang.alternateLocales.en).toBeDefined()
    // The publish response's own hreflang (computed by the engine from
    // live group state) agrees.
    expect(published.data.hreflang.activeLocales).toContain('en')
    expect(published.data.hreflang.activeLocales).toContain('es')
  })
})
