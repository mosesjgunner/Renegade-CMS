import type { Payload } from 'payload'
import type {
  IngestionBatchPayload,
  IntelligenceClaimInput,
  IntelligenceCitationInput,
  IntelligenceEntityInput,
} from './contracts'

export type IngestionResult = {
  success: boolean
  dryRun: boolean
  counts: {
    entitiesCreated: number
    entitiesUpdated: number
    claimsCreated: number
    claimsUpdated: number
    citationsCreated: number
    citationsUpdated: number
  }
  errors: string[]
  warnings: string[]
}

/**
 * Validates and imports external compiler / scraper intelligence datasets via JSON.
 * Writes exclusively via Payload ORM/Collections API, never raw SQL.
 * Enforces provenance preservation and ensures claims default to 'unverified'.
 */
export async function importIntelligenceJson(
  payload: Payload,
  input: {
    siteId: string
    payload: IngestionBatchPayload
    dryRun?: boolean
  },
): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: true,
    dryRun: Boolean(input.dryRun),
    counts: {
      entitiesCreated: 0,
      entitiesUpdated: 0,
      claimsCreated: 0,
      claimsUpdated: 0,
      citationsCreated: 0,
      citationsUpdated: 0,
    },
    errors: [],
    warnings: [],
  }

  const siteId = input.siteId
  const batch = input.payload

  if (!siteId) {
    result.errors.push('siteId is required for intelligence ingestion.')
    result.success = false
    return result
  }

  if (!batch || typeof batch !== 'object') {
    result.errors.push('Invalid JSON payload: expected batch object.')
    result.success = false
    return result
  }

  const entities = Array.isArray(batch.entities) ? batch.entities : []
  const claims = Array.isArray(batch.claims) ? batch.claims : []
  const citations = Array.isArray(batch.citations) ? batch.citations : []

  // Map to hold externalId -> internal ID mapping
  const entityIdMap = new Map<string, string>()
  const claimIdMap = new Map<string, string>()

  // 1. Ingest Entities
  for (const ent of entities) {
    if (!ent.name || !ent.externalId || !ent.entityType) {
      result.warnings.push(`Skipping entity missing required fields: ${JSON.stringify(ent)}`)
      continue
    }

    try {
      const existing = await payload.find({
        collection: 'intelligence-entities' as never,
        where: {
          and: [{ site: { equals: siteId } }, { externalId: { equals: ent.externalId } }],
        },
        limit: 1,
        overrideAccess: true,
      })

      const entityData = {
        site: siteId,
        name: ent.name,
        slug: ent.slug || ent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        entityType: ent.entityType,
        description: ent.description || '',
        aliases: ent.aliases || [],
        sameAs: ent.sameAs || [],
        confidence: typeof ent.confidence === 'number' ? ent.confidence : 1.0,
        externalId: ent.externalId,
        provenance: ent.provenance || {
          source: batch.compiler || 'external-scraper',
          compilerVersion: batch.version || '1.0.0',
          importedAt: new Date().toISOString(),
        },
      }

      if (existing.docs.length > 0) {
        const id = String((existing.docs[0] as unknown as { id: string | number }).id)
        entityIdMap.set(ent.externalId, id)
        if (!input.dryRun) {
          await payload.update({
            collection: 'intelligence-entities' as never,
            id,
            data: entityData as never,
            overrideAccess: true,
          })
        }
        result.counts.entitiesUpdated++
      } else {
        if (!input.dryRun) {
          const created = await payload.create({
            collection: 'intelligence-entities' as never,
            data: entityData as never,
            overrideAccess: true,
          })
          entityIdMap.set(
            ent.externalId,
            String((created as unknown as { id: string | number }).id),
          )
        } else {
          entityIdMap.set(ent.externalId, `mock-${ent.externalId}`)
        }
        result.counts.entitiesCreated++
      }
    } catch (err) {
      result.errors.push(
        `Error processing entity "${ent.externalId}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // 2. Ingest Claims
  for (const clm of claims) {
    if (!clm.statement || !clm.externalId) {
      result.warnings.push(`Skipping claim missing statement or externalId: ${JSON.stringify(clm)}`)
      continue
    }

    try {
      const subjectEntityId = clm.subjectEntityExternalId
        ? entityIdMap.get(clm.subjectEntityExternalId)
        : undefined

      const existing = await payload.find({
        collection: 'intelligence-claims' as never,
        where: {
          and: [{ site: { equals: siteId } }, { externalId: { equals: clm.externalId } }],
        },
        limit: 1,
        overrideAccess: true,
      })

      // IMPORTANT INVARIANT: Ingestion MUST NOT mark imported claims as verified facts.
      // Always enforce 'unverified' status regardless of incoming payload flags unless manually decided.
      const claimData = {
        site: siteId,
        statement: clm.statement,
        subjectEntity: subjectEntityId || null,
        predicate: clm.predicate || null,
        objectValue: clm.objectValue || null,
        uncertainty:
          typeof clm.uncertainty === 'number' ? Math.max(0, Math.min(1, clm.uncertainty)) : 0.5,
        verificationStatus: 'unverified' as const,
        externalId: clm.externalId,
        provenance: {
          ...(clm.provenance || {
            sourceUrl: batch.compiler,
            compilerVersion: batch.version,
            importedAt: new Date().toISOString(),
            method: 'imported',
          }),
          rawVerificationStatusAttempted: clm.verificationStatus,
        },
        quote: clm.quote || null,
      }

      if (existing.docs.length > 0) {
        const id = String((existing.docs[0] as unknown as { id: string | number }).id)
        claimIdMap.set(clm.externalId, id)
        if (!input.dryRun) {
          await payload.update({
            collection: 'intelligence-claims' as never,
            id,
            data: claimData as never,
            overrideAccess: true,
          })
        }
        result.counts.claimsUpdated++
      } else {
        if (!input.dryRun) {
          const created = await payload.create({
            collection: 'intelligence-claims' as never,
            data: claimData as never,
            overrideAccess: true,
          })
          claimIdMap.set(clm.externalId, String((created as unknown as { id: string | number }).id))
        } else {
          claimIdMap.set(clm.externalId, `mock-${clm.externalId}`)
        }
        result.counts.claimsCreated++
      }
    } catch (err) {
      result.errors.push(
        `Error processing claim "${clm.externalId}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // 3. Ingest Citations
  for (const cit of citations) {
    if (!cit.sourceUrl || !cit.externalId) {
      result.warnings.push(
        `Skipping citation missing sourceUrl or externalId: ${JSON.stringify(cit)}`,
      )
      continue
    }

    try {
      const claimId = cit.claimExternalId ? claimIdMap.get(cit.claimExternalId) : undefined

      const existing = await payload.find({
        collection: 'intelligence-citations' as never,
        where: {
          and: [{ site: { equals: siteId } }, { externalId: { equals: cit.externalId } }],
        },
        limit: 1,
        overrideAccess: true,
      })

      const citationData = {
        site: siteId,
        claim: claimId || null,
        sourceUrl: cit.sourceUrl,
        title: cit.title || null,
        author: cit.author || null,
        publisher: cit.publisher || null,
        publishedAt: cit.publishedAt || null,
        accessedAt: cit.accessedAt || new Date().toISOString(),
        quote: cit.quote || null,
        locator: cit.locator || null,
        relevanceScore: typeof cit.relevanceScore === 'number' ? cit.relevanceScore : 1.0,
        externalId: cit.externalId,
      }

      if (existing.docs.length > 0) {
        const id = String((existing.docs[0] as unknown as { id: string | number }).id)
        if (!input.dryRun) {
          await payload.update({
            collection: 'intelligence-citations' as never,
            id,
            data: citationData as never,
            overrideAccess: true,
          })
        }
        result.counts.citationsUpdated++
      } else {
        if (!input.dryRun) {
          await payload.create({
            collection: 'intelligence-citations' as never,
            data: citationData as never,
            overrideAccess: true,
          })
        }
        result.counts.citationsCreated++
      }
    } catch (err) {
      result.errors.push(
        `Error processing citation "${cit.externalId}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  result.success = result.errors.length === 0
  return result
}

/**
 * Validates and imports tabular CSV records for entities, claims, or citations.
 */
export async function importIntelligenceCsv(
  payload: Payload,
  input: {
    siteId: string
    type: 'entities' | 'claims' | 'citations'
    csvContent: string
    compilerVersion?: string
    dryRun?: boolean
  },
): Promise<IngestionResult> {
  const lines = input.csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))

  if (lines.length < 2) {
    return {
      success: false,
      dryRun: Boolean(input.dryRun),
      counts: {
        entitiesCreated: 0,
        entitiesUpdated: 0,
        claimsCreated: 0,
        claimsUpdated: 0,
        citationsCreated: 0,
        citationsUpdated: 0,
      },
      errors: ['CSV must have a header row and at least one data row.'],
      warnings: [],
    }
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const rows = lines.slice(1).map((line) => {
    // Simple CSV parser handling quotes
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ''))
    const record: Record<string, string> = {}
    headers.forEach((h, idx) => {
      record[h] = values[idx] || ''
    })
    return record
  })

  const batchPayload: IngestionBatchPayload = {
    version: input.compilerVersion || '1.0.0',
    compiler: 'csv-ingestion-adapter',
    generatedAt: new Date().toISOString(),
    siteId: input.siteId,
  }

  if (input.type === 'entities') {
    batchPayload.entities = rows.map((r) => ({
      name: r.name || r.title || '',
      slug: r.slug || (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      entityType: (r.entityType || r.type || 'concept') as IntelligenceEntityInput['entityType'],
      description: r.description,
      externalId: r.externalId || r.id,
      provenance: {
        sourceUrl: r.sourceUrl,
        compilerVersion: input.compilerVersion,
        importedAt: new Date().toISOString(),
        method: 'imported',
      },
    }))
  } else if (input.type === 'claims') {
    batchPayload.claims = rows.map((r) => ({
      statement: r.statement || r.claim || '',
      externalId: r.externalId || r.id,
      subjectEntityExternalId: r.subjectEntityExternalId || r.entityId,
      predicate: r.predicate,
      objectValue: r.objectValue || r.value,
      uncertainty: r.uncertainty ? parseFloat(r.uncertainty) : 0.5,
      verificationStatus: 'unverified',
      provenance: {
        sourceUrl: r.sourceUrl,
        compilerVersion: input.compilerVersion,
        importedAt: new Date().toISOString(),
        method: 'imported',
      },
      quote: r.quote,
    }))
  } else if (input.type === 'citations') {
    batchPayload.citations = rows.map((r) => ({
      externalId: r.externalId || r.id,
      claimExternalId: r.claimExternalId || r.claimId,
      sourceUrl: r.sourceUrl || r.url || '',
      title: r.title,
      author: r.author,
      publisher: r.publisher,
      locator: r.locator,
      relevanceScore: r.relevanceScore ? parseFloat(r.relevanceScore) : 1.0,
    }))
  }

  return importIntelligenceJson(payload, {
    siteId: input.siteId,
    payload: batchPayload,
    dryRun: input.dryRun,
  })
}
