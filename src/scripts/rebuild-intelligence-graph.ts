import { getPayload } from 'payload'
import {
  defaultNeo4jAdapter,
  detectLinkOpportunities,
  detectMissingHubRelationships,
  detectOrphanPages,
  detectWeakTopicClusters,
  rebuildKnowledgeGraph,
} from '../modules/intelligence/graph'

async function main() {
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  // Optional --site flag
  const siteFlagIndex = process.argv.indexOf('--site')
  const siteId = siteFlagIndex !== -1 ? process.argv[siteFlagIndex + 1] : undefined

  console.log(`[intelligence:graph] Starting full rebuild of knowledge graph projection...`)

  try {
    const status = await rebuildKnowledgeGraph(payload, { siteId })
    const store = defaultNeo4jAdapter.getStore()

    const orphans = detectOrphanPages(store)
    const weakClusters = detectWeakTopicClusters(store)
    const missingHubs = detectMissingHubRelationships(store)
    const opportunities = await detectLinkOpportunities(store, payload, { siteId })

    const report = {
      timestamp: new Date().toISOString(),
      projectionStatus: status,
      summary: {
        totalContentProjected: status.nodes.contentCount,
        totalTopicsProjected: status.nodes.topicsCount,
        totalEntitiesProjected: status.nodes.entitiesCount,
        totalInternalLinksProjected: status.edges.linksCount,
        contentLagMs: status.contentLagMs,
        isAvailable: status.isAvailable,
        projector: status.projector,
        error: status.error,
        orphanPagesCount: orphans.length,
        weakTopicClustersCount: weakClusters.length,
        missingHubRelationshipsCount: missingHubs.length,
        linkOpportunitiesCount: opportunities.length,
      },
      topOrphanPages: orphans.slice(0, 5),
      weakTopicClusters: weakClusters,
      missingHubRelationships: missingHubs.slice(0, 5),
      topLinkOpportunities: opportunities.slice(0, 5).map((o) => ({
        source: o.source.title,
        target: o.target.title,
        anchor: o.anchor,
        score: o.score,
        reason: o.reason,
      })),
    }

    console.log(JSON.stringify(report, null, 2))
    console.log(`[intelligence:graph] Full rebuild completed successfully.`)
  } finally {
    await payload.db.destroy?.()
  }
}

await main().catch((error) => {
  console.error('[intelligence:graph] Rebuild failed:', error)
  process.exitCode = 1
})

await new Promise<void>((resolve) => process.stdout.write('', () => resolve()))
process.exit(process.exitCode ?? 0)
