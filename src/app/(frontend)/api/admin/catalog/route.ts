import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  catalogChecksum,
  catalogProductFromDocument,
  catalogReadiness,
} from '@/modules/commerce/catalog'
import { publishProductRelease } from '@/modules/commerce/service'

export const runtime = 'nodejs'
const staff = (role: unknown) => ['owner', 'administrator', 'staff'].includes(String(role))
const relationId = (value: unknown) =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value ?? '')
const reviewRevision = (document: Record<string, unknown>) => {
  const { state: _lifecycleState, ...content } = catalogProductFromDocument(document)
  return catalogChecksum(content)
}

async function retainArchiveRedirect(
  payload: Awaited<ReturnType<typeof getPayload>>,
  product: Record<string, unknown>,
  redirectTo?: string,
) {
  if (!redirectTo) return
  const fromPath = String(product.canonicalPath ?? '')
  const site = relationId(product.site)
  if (!site || !fromPath || !redirectTo.startsWith('/') || redirectTo.startsWith('//'))
    throw new Error('Archive redirects must be site-local paths.')
  const existing = await payload.find({
    collection: 'public-redirects',
    where: { and: [{ site: { equals: site } }, { fromPath: { equals: fromPath } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const data = {
    site,
    fromPath,
    toPath: redirectTo,
    match: 'exact',
    statusCode: '308',
    preserveQuery: true,
    enabled: true,
  }
  if (existing.docs[0])
    await payload.update({
      collection: 'public-redirects',
      id: String(existing.docs[0].id),
      data,
      overrideAccess: true,
    } as never)
  else await payload.create({ collection: 'public-redirects', data, overrideAccess: true } as never)
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !staff(auth.user.role))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('siteId')
  const result = await payload.find({
    collection: 'products',
    where: siteId ? { site: { equals: siteId } } : undefined,
    limit: 500,
    depth: 1,
    overrideAccess: true,
  } as never)
  const products = (result.docs as unknown as Record<string, unknown>[]).map((document) => ({
    document,
    portable: catalogProductFromDocument(document),
    readiness: catalogReadiness(catalogProductFromDocument(document)),
  }))
  return NextResponse.json({ contractVersion: 1, products })
}

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !staff(auth.user.role))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  try {
    const body = (await request.json()) as {
      productId: string
      action: 'request-review' | 'approve' | 'publish' | 'archive'
      revision?: string
      redirectTo?: string
    }
    const current = (await payload.findByID({
      collection: 'products',
      id: body.productId,
      depth: 1,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
    const expected: Record<typeof body.action, string[]> = {
      'request-review': ['draft'],
      approve: ['review'],
      publish: ['approved'],
      archive: ['draft', 'review', 'approved', 'published'],
    }
    if (!expected[body.action].includes(String(current.state)))
      throw new Error(`Cannot ${body.action} a ${String(current.state)} product.`)
    if (body.revision && String(current.releaseRevision ?? '') !== body.revision)
      throw new Error('Pinned product revision is stale.')
    const target =
      body.action === 'request-review'
        ? 'review'
        : body.action === 'approve'
          ? 'approved'
          : body.action === 'publish'
            ? 'published'
            : 'archived'
    const now = new Date().toISOString()
    const audit = Array.isArray(current.workflowAudit) ? current.workflowAudit : []
    const revision = reviewRevision(current)
    if (
      ['approve', 'publish'].includes(body.action) &&
      String(current.releaseRevision ?? '') !== revision
    )
      throw new Error('Product changed after its reviewed revision was pinned.')
    const snapshots = Array.isArray(current.revisionSnapshots) ? current.revisionSnapshots : []
    if (body.action === 'publish')
      await publishProductRelease(payload, {
        productId: body.productId,
        revisionId: revision,
        idempotencyKey: `catalog:${body.productId}:${revision}`,
      })
    const updated = await payload.update({
      collection: 'products',
      id: body.productId,
      data: {
        ...(body.action === 'publish' ? {} : { state: target }),
        ...(body.action === 'request-review'
          ? {
              releaseRevision: revision,
              revisionSnapshots: [
                ...snapshots,
                { revision, capturedAt: now, product: catalogProductFromDocument(current) },
              ],
            }
          : {}),
        ...(target === 'published' ? { publishedAt: now } : {}),
        ...(target === 'archived' ? { archivedAt: now, redirectTo: body.redirectTo || null } : {}),
        workflowAudit: [
          ...audit,
          {
            action: body.action,
            actorId: String(auth.user.id),
            occurredAt: now,
            revision,
          },
        ],
      },
      depth: 1,
      overrideAccess: true,
    } as never)
    if (body.action === 'archive') await retainArchiveRedirect(payload, current, body.redirectTo)
    try {
      const { revalidatePath } = await import('next/cache.js')
      revalidatePath('/store', 'page')
      revalidatePath(String(current.canonicalPath || '/store'), 'page')
      revalidatePath('/search', 'page')
    } catch {
      /* cache invalidation is best effort outside Next request tests */
    }
    return NextResponse.json({ product: updated })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Catalog transition failed.' },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !staff(auth.user.role))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  try {
    const body = (await request.json()) as { productIds: string[]; redirectTo?: string }
    if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 100)
      throw new Error('Choose 1 to 100 products.')
    const now = new Date().toISOString()
    const warnings: { productId: string; dependencies: string[] }[] = []
    for (const productId of [...new Set(body.productIds)]) {
      const product = (await payload.findByID({
        collection: 'products',
        id: productId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Record<string, unknown>
      const orders = await payload
        .count({
          collection: 'orders',
          where: { items: { contains: productId } },
          overrideAccess: true,
        } as never)
        .catch(() => ({ totalDocs: 0 }))
      const dependencies = Number(orders.totalDocs) ? [`${orders.totalDocs} retained order(s)`] : []
      warnings.push({ productId, dependencies })
      await payload.update({
        collection: 'products',
        id: productId,
        data: { state: 'archived', archivedAt: now, redirectTo: body.redirectTo || null },
        overrideAccess: true,
      } as never)
      await retainArchiveRedirect(payload, product, body.redirectTo)
      try {
        const { revalidatePath } = await import('next/cache.js')
        revalidatePath(String(product.canonicalPath || '/store'), 'page')
      } catch {}
    }
    return NextResponse.json({ archived: [...new Set(body.productIds)], warnings })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk archive failed.' },
      { status: 400 },
    )
  }
}
