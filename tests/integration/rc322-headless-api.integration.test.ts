/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { GET as restGet } from '@/app/(payload)/api/[...slug]/route'
import { POST as graphqlPost } from '@/app/(payload)/api/graphql/route'

/**
 * RC3-22 #74 — headless API proof, REST and GraphQL judged SEPARATELY.
 *
 * Before this pass, no test in the repository had ever executed either
 * generated handler. Both surfaces are driven here through the real
 * route handlers with a real passkey staff session whose operator grant
 * covers site A only. The probe collection is `sites`, whose read
 * access is the operator-grant boundary itself: an authorized site
 * reads, a foreign site is denied, and an unauthenticated caller gets
 * nothing — on each surface independently.
 */

const suffix = randomUUID().slice(0, 8)
const APP_ORIGIN = (process.env.APP_URL ?? 'http://127.0.0.1:3114').replace(/\/$/, '')

describe('headless REST and GraphQL surfaces (RC3-22)', () => {
  let payload: Payload
  let siteA = ''
  let siteB = ''
  let siteAName = ''
  let siteBName = ''
  let staffCookie = ''
  let sitesQueryField = ''

  const restRequest = (path: string, cookie?: string) =>
    new Request(`${APP_ORIGIN}/api${path}`, {
      method: 'GET',
      headers: {
        host: new URL(APP_ORIGIN).host,
        ...(cookie ? { cookie } : {}),
      },
    })

  const callRest = async (path: string, cookie?: string) => {
    const slug = path.split('?')[0].split('/').filter(Boolean)
    const response = await restGet(restRequest(path, cookie), {
      params: Promise.resolve({ slug }),
    })
    const text = await response.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // Non-JSON bodies are asserted through the raw text.
    }
    return { status: response.status, json, text }
  }

  const callGraphql = async (query: string, cookie?: string) => {
    const response = await graphqlPost(
      new Request(`${APP_ORIGIN}/api/graphql`, {
        method: 'POST',
        headers: {
          host: new URL(APP_ORIGIN).host,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ query }),
      }),
    )
    const json: any = await response.json().catch(() => null)
    return { status: response.status, json }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const mkSite = async (label: string) => {
      const site = await payload.create({
        collection: 'sites',
        data: {
          name: `RC3-22 API ${label} ${suffix}`,
          slug: `rc322-api-${label}-${suffix}`,
          lifecycle: 'active',
        } as never,
        overrideAccess: true,
      })
      return { id: String(site.id), name: `RC3-22 API ${label} ${suffix}` }
    }
    const a = await mkSite('alpha')
    siteA = a.id
    siteAName = a.name
    const b = await mkSite('beta')
    siteB = b.id
    siteBName = b.name

    // Staff user whose operator grant covers site A only (the RC3-21
    // journey pattern: user -> member -> member-site-role).
    const email = `rc322-api-staff-${suffix}@renegade.test`
    const user = (await payload.create({
      collection: 'users',
      data: { email, role: 'administrator' },
      overrideAccess: true,
    } as never)) as unknown as { id: string; email: string; member?: unknown }
    const memberId = String(
      typeof user.member === 'object' && user.member
        ? (user.member as { id?: unknown }).id
        : user.member,
    )
    await payload.create({
      collection: 'member-site-roles',
      data: { member: memberId, site: siteA, role: 'community-manager' },
      overrideAccess: true,
    } as never)
    const session = await createPasskeySession(
      { id: String(user.id), email: String(user.email) },
      loadConfig().payloadSecret,
      async (sessionId, expiresAt) => {
        await (payload.db as any).pool.query(
          'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
          [sessionId, user.id, expiresAt],
        )
      },
    )
    staffCookie = `renegade-passkey=${session.token}`

    // Discover the generated find query for the sites collection rather
    // than assuming its name.
    const introspection = await callGraphql(
      '{ __schema { queryType { fields { name } } } }',
      staffCookie,
    )
    const fields: Array<{ name: string }> =
      introspection.json?.data?.__schema?.queryType?.fields ?? []
    sitesQueryField =
      fields.find((field) => field.name === 'Sites')?.name ??
      fields.find((field) => /sites/i.test(field.name) && !/count/i.test(field.name))?.name ??
      ''
  })

  afterAll(async () => {
    for (const [collection, where] of [
      ['member-site-roles', { site: { in: [siteA, siteB] } }],
      ['sites', { id: { in: [siteA, siteB] } }],
    ] as const) {
      const found = await payload
        .find({
          collection: collection as never,
          where: where as never,
          limit: 50,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as Array<{ id: string }> }))
      for (const doc of found.docs as Array<{ id: string }>)
        await payload
          .delete({ collection: collection as never, id: doc.id, overrideAccess: true })
          .catch(() => undefined)
    }
  })

  it('REST: the site-scoped staff session reads its own site', async () => {
    const result = await callRest(`/sites/${siteA}`, staffCookie)
    expect(result.status).toBe(200)
    expect(String(result.json?.id)).toBe(siteA)
    expect(result.json?.name).toBe(siteAName)
  })

  it('REST: the same session is denied the foreign site', async () => {
    const byId = await callRest(`/sites/${siteB}`, staffCookie)
    expect([403, 404]).toContain(byId.status)
    expect(byId.text).not.toContain(siteBName)

    const list = await callRest('/sites', staffCookie)
    expect(list.status).toBe(200)
    const ids = (list.json?.docs ?? []).map((doc: any) => String(doc.id))
    expect(ids).toContain(siteA)
    expect(ids).not.toContain(siteB)
  })

  it('REST: an unauthenticated caller gets nothing', async () => {
    const byId = await callRest(`/sites/${siteA}`)
    expect(byId.status).not.toBe(200)
    expect(byId.text).not.toContain(siteAName)
    const list = await callRest('/sites')
    const ids = (list.json?.docs ?? []).map((doc: any) => String(doc.id))
    expect(ids).not.toContain(siteA)
  })

  it('GraphQL: the generated schema exposes the sites query and enforces the same grant', async () => {
    expect(sitesQueryField).toBeTruthy()
    const result = await callGraphql(`{ ${sitesQueryField} { docs { id name } } }`, staffCookie)
    expect(result.status).toBe(200)
    const docs = result.json?.data?.[sitesQueryField]?.docs ?? []
    const ids = docs.map((doc: any) => String(doc.id))
    expect(ids).toContain(siteA)
    expect(ids).not.toContain(siteB)
    expect(JSON.stringify(result.json)).not.toContain(siteBName)
  })

  it('GraphQL: an unauthenticated caller gets no tenant data', async () => {
    const result = await callGraphql(`{ ${sitesQueryField} { docs { id name } } }`)
    const serialized = JSON.stringify(result.json ?? {})
    expect(serialized).not.toContain(siteA)
    expect(serialized).not.toContain(siteAName)
  })
})
