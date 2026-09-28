import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'
import {
  extractClaimsFromText,
  ingestClaim,
  attachSourceToClaim,
  verifyClaimHuman,
  applyAutomatedCheckProposal,
  auditJsonLdSchema,
  generateSchemaProposal,
  applyApprovedSchemaProposal,
  generateEditorialIntegrityReport,
  type EditorialClaim,
  type SchemaAuditResult,
  type SchemaProposal,
} from '@/modules/intelligence/editorial-review'

export const runtime = 'nodejs'

// In-memory claims & proposals store for active editorial sessions
const claimsStore = new Map<string, EditorialClaim[]>()
const schemaProposalsStore = new Map<string, SchemaProposal[]>()

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const contentId = url.searchParams.get('contentId')

  if (!siteId) {
    return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 })
  }

  if (!canManageAdminSite(auth.user, siteId)) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }

  if (!contentId) {
    return NextResponse.json({ error: 'contentId parameter is required.' }, { status: 400 })
  }

  try {
    const doc = (await payload.findByID({
      collection: 'content',
      id: contentId,
    })) as any

    if (!doc) {
      return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
    }

    const claims = claimsStore.get(contentId) || []
    const proposals = schemaProposalsStore.get(contentId) || []

    // Fetch site identity facts
    const siteSettings = (await payload
      .findGlobal({ slug: 'site-settings' })
      .catch(() => null)) as any
    const siteFacts = {
      name: siteSettings?.siteTitle || 'Renegade CMoS',
      url: siteSettings?.siteUrl || 'https://renegade.example.com',
      legalName: siteSettings?.legalName || null,
      logoUrl: siteSettings?.logo?.url || null,
    }

    const docFacts = {
      id: String(doc.id),
      revision: String(doc.updatedAt || 'rev-1'),
      title: doc.title || 'Untitled',
      canonicalUrl: doc.canonicalPath || `/${doc.slug || ''}`,
      publishedAt: doc.publishedAt || null,
      updatedAt: doc.updatedAt || null,
      summary: doc.summary || doc.excerpt || null,
      authors: Array.isArray(doc.authors)
        ? doc.authors.map((a: any) => ({ name: a.author?.name || a.role || 'Staff', url: null }))
        : [],
      heroImageUrl: doc.heroMedia?.url || null,
      section: doc.sections?.[0]?.name || null,
      topics: Array.isArray(doc.topics) ? doc.topics.map((t: any) => t.name || String(t)) : [],
      pageType: doc.contentType === 'page' ? 'WebPage' : 'Article',
      hasVerifiedReviews: false,
    }

    // Existing JSON-LD from document
    const currentJsonLd = doc.structuredDataManual || {
      '@context': 'https://schema.org',
      '@type': docFacts.pageType,
      headline: docFacts.title,
    }

    const schemaAudit = auditJsonLdSchema({
      pageType: docFacts.pageType,
      currentJsonLd,
      docFacts,
      siteFacts,
    })

    const report = generateEditorialIntegrityReport({
      contentId,
      contentTitle: docFacts.title,
      contentRevision: docFacts.revision,
      claims,
      schemaAudit,
    })

    return NextResponse.json({
      content: {
        id: docFacts.id,
        title: docFacts.title,
        revision: docFacts.revision,
        canonicalUrl: docFacts.canonicalUrl,
        structuredDataMode: doc.structuredDataMode || 'none',
        structuredDataVersion: doc.structuredDataVersion || 1,
      },
      claims,
      schemaAudit,
      proposals,
      report,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch editorial review data.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action, siteId, contentId } = body

    if (!siteId || !canManageAdminSite(auth.user, siteId)) {
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    }

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required.' }, { status: 400 })
    }

    const doc = (await payload.findByID({ collection: 'content', id: contentId })) as any
    if (!doc) {
      return NextResponse.json({ error: 'Content document not found.' }, { status: 404 })
    }

    const existingClaims = claimsStore.get(contentId) || []

    if (action === 'extract_claims') {
      const textToExtract = body.text || doc.summary || doc.title || ''
      const extracted = extractClaimsFromText(textToExtract, {
        contentId,
        contentRevision: String(doc.updatedAt || 'rev-1'),
        extractedBy: auth.user.email || String(auth.user.id),
      })
      const merged = [...existingClaims, ...extracted]
      claimsStore.set(contentId, merged)
      return NextResponse.json({ success: true, count: extracted.length, claims: merged })
    }

    if (action === 'ingest_claim') {
      const ingested = ingestClaim({
        contentId,
        contentRevision: String(doc.updatedAt || 'rev-1'),
        statement: body.statement,
        quote: body.quote,
        location: body.location || {},
        provenance: {
          source: body.provenanceSource || 'manual_ingest',
          extractedBy: auth.user.email || String(auth.user.id),
          rawContext: body.rawContext,
        },
      })
      existingClaims.push(ingested)
      claimsStore.set(contentId, existingClaims)
      return NextResponse.json({ success: true, claim: ingested })
    }

    if (action === 'attach_source') {
      const { claimId, sourceUrl, title, author, publisher, publishedDate, stance, quote } = body
      const claimIdx = existingClaims.findIndex((c) => c.id === claimId)
      if (claimIdx === -1) {
        return NextResponse.json({ error: 'Claim not found.' }, { status: 404 })
      }
      const updated = attachSourceToClaim(existingClaims[claimIdx], {
        sourceUrl,
        title,
        author,
        publisher,
        publishedDate,
        stance: stance || 'supports',
        quote,
        addedBy: auth.user.email || String(auth.user.id),
      })
      existingClaims[claimIdx] = updated
      claimsStore.set(contentId, existingClaims)
      return NextResponse.json({ success: true, claim: updated })
    }

    if (action === 'propose_schema') {
      const siteSettings = (await payload
        .findGlobal({ slug: 'site-settings' })
        .catch(() => null)) as any
      const siteFacts = {
        name: siteSettings?.siteTitle || 'Renegade CMoS',
        url: siteSettings?.siteUrl || 'https://renegade.example.com',
        legalName: siteSettings?.legalName || null,
        logoUrl: siteSettings?.logo?.url || null,
      }
      const docFacts = {
        id: String(doc.id),
        revision: String(doc.updatedAt || 'rev-1'),
        title: doc.title || 'Untitled',
        canonicalUrl: doc.canonicalPath || `/${doc.slug || ''}`,
        publishedAt: doc.publishedAt || null,
        updatedAt: doc.updatedAt || null,
        summary: doc.summary || doc.excerpt || null,
        authors: Array.isArray(doc.authors)
          ? doc.authors.map((a: any) => ({ name: a.author?.name || a.role || 'Staff', url: null }))
          : [],
        heroImageUrl: doc.heroMedia?.url || null,
        section: doc.sections?.[0]?.name || null,
        topics: Array.isArray(doc.topics) ? doc.topics.map((t: any) => t.name || String(t)) : [],
        pageType: doc.contentType === 'page' ? 'WebPage' : 'Article',
      }
      const currentJsonLd = doc.structuredDataManual || {
        '@context': 'https://schema.org',
        '@type': docFacts.pageType,
      }
      const audit = auditJsonLdSchema({
        pageType: docFacts.pageType,
        currentJsonLd,
        docFacts,
        siteFacts,
      })
      const proposal = generateSchemaProposal({
        audit,
        docFacts,
        siteFacts,
        proposedBy: auth.user.email || String(auth.user.id),
      })

      const proposals = schemaProposalsStore.get(contentId) || []
      proposals.push(proposal)
      schemaProposalsStore.set(contentId, proposals)
      return NextResponse.json({ success: true, proposal })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Action failed.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action, siteId, contentId } = body

    if (!siteId || !canManageAdminSite(auth.user, siteId)) {
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    }

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required.' }, { status: 400 })
    }

    const existingClaims = claimsStore.get(contentId) || []

    if (action === 'verify_claim_human') {
      const { claimId, decision, notes } = body
      const claimIdx = existingClaims.findIndex((c) => c.id === claimId)
      if (claimIdx === -1) {
        return NextResponse.json({ error: 'Claim not found.' }, { status: 404 })
      }

      const verified = verifyClaimHuman(
        existingClaims[claimIdx],
        {
          userId: String(auth.user.id),
          role: auth.user.role as any,
          notes,
        },
        decision || 'verified',
      )

      existingClaims[claimIdx] = verified
      claimsStore.set(contentId, existingClaims)
      return NextResponse.json({ success: true, claim: verified })
    }

    if (action === 'apply_schema') {
      const { proposalId } = body
      const proposals = schemaProposalsStore.get(contentId) || []
      const proposal = proposals.find((p) => p.id === proposalId)
      if (!proposal) {
        return NextResponse.json({ error: 'Schema proposal not found.' }, { status: 404 })
      }

      const result = await applyApprovedSchemaProposal(payload, {
        proposal,
        editorUser: {
          id: String(auth.user.id),
          role: auth.user.role as any,
        },
        expectedRevision: proposal.contentRevision,
      })

      return NextResponse.json({ success: true, result })
    }

    return NextResponse.json({ error: `Unknown patch action: ${action}` }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Update failed.' }, { status: 500 })
  }
}
