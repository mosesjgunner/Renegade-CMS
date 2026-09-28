import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'
import { defaultNeo4jAdapter, rebuildKnowledgeGraph } from '@/modules/intelligence/graph'
import {
  assessInformationGain,
  buildTopicAuthorityMaps,
  detectCannibalizationCandidates,
  detectCoverageGaps,
  diagnoseContentDecay,
  executeEditorialWorkflowAction,
  generateContentBrief,
  type PageForCannibalization,
  type PageDecayInput,
} from '@/modules/intelligence/workflows'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  let siteId = url.searchParams.get('siteId')
  const view = url.searchParams.get('view') || 'all'

  if (!siteId || siteId === 'default-site') {
    const sites = await payload.find({
      collection: 'sites',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (sites.docs.length > 0) {
      siteId = String(sites.docs[0].id)
    } else {
      siteId = siteId || 'default-site'
    }
  }

  if (!canManageAdminSite(auth.user, siteId)) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }

  try {
    const store = defaultNeo4jAdapter.getStore()

    // Ensure graph store has data
    if (store.getNodeCounts().contentCount === 0) {
      await rebuildKnowledgeGraph(payload, { siteId })
    }

    const allContent = store.getAllContent()

    // 1. Topic Authority Maps
    const authorityMaps = buildTopicAuthorityMaps(store)

    // 2. Coverage Gaps
    const coverageGaps = detectCoverageGaps(store)

    // 3. Cannibalization Candidates
    const pagesForCannibalization: PageForCannibalization[] = allContent.map((c) => ({
      id: c.id,
      title: c.title,
      canonicalPath: c.canonicalPath,
    }))
    const cannibalizationCandidates = detectCannibalizationCandidates(pagesForCannibalization)

    // 4. Content Decay Signals
    const pagesForDecay: PageDecayInput[] = allContent.slice(0, 50).map((c) => ({
      id: c.id,
      title: c.title,
      canonicalPath: c.canonicalPath,
      publishedAt: c.publishedAt,
      updatedAt: c.updatedAt,
    }))
    const decaySignals = diagnoseContentDecay(pagesForDecay)

    // 5. End-to-End Example from existing content
    let e2eExample = null
    const exampleDoc = allContent[0]
    if (exampleDoc) {
      const exampleTopicId = exampleDoc.topics[0] || (authorityMaps[0]?.topicId ?? '')
      const exampleHub =
        authorityMaps.find((h) => h.topicId === exampleTopicId) || authorityMaps[0] || null

      const exampleBrief = await generateContentBrief(store, payload, {
        topicId: exampleTopicId,
        proposedTitle: `Operational Brief: Advanced Guide to ${exampleDoc.title}`,
        userAngle: 'Practical step-by-step verification and edge case handling',
        searchIntent: 'informational',
        siteId,
      })

      const peers = allContent.filter((c) => c.id !== exampleDoc.id)
      const benchmarkSources = peers.slice(0, 2).map((p) => ({
        type: 'internal_content' as const,
        title: p.title,
        identifier: p.canonicalPath,
        bodyText: p.title,
        entities: p.entities.map((id) => store.getEntity(id)?.name || id),
      }))

      const exampleGain = assessInformationGain({
        contentId: exampleDoc.id,
        contentTitle: exampleDoc.title,
        contentBodyText: `${exampleDoc.title}. Covers domain processes, local verification, and structured data standards.`,
        contentEntities: exampleDoc.entities.map((id) => store.getEntity(id)?.name || id),
        contentClaims: [`Canonical content established at ${exampleDoc.canonicalPath}`],
        benchmarkSources,
      })

      const exampleCannibalization =
        cannibalizationCandidates.find(
          (c) => c.pageA.id === exampleDoc.id || c.pageB.id === exampleDoc.id,
        ) ||
        cannibalizationCandidates[0] ||
        null

      const exampleDecay =
        decaySignals.find((s) => s.contentId === exampleDoc.id) ||
        diagnoseContentDecay([
          {
            id: exampleDoc.id,
            title: exampleDoc.title,
            canonicalPath: exampleDoc.canonicalPath,
            publishedAt: exampleDoc.publishedAt,
            updatedAt: exampleDoc.updatedAt,
            metrics: { currentTraffic: 140, previousTraffic: 150 },
          },
        ])[0] ||
        null

      const exampleGaps = coverageGaps.filter((g) => g.topicId === exampleTopicId)

      e2eExample = {
        targetContent: {
          id: exampleDoc.id,
          title: exampleDoc.title,
          canonicalPath: exampleDoc.canonicalPath,
          contentType: exampleDoc.contentType,
          wordCount: exampleDoc.wordCount,
          publishedAt: exampleDoc.publishedAt,
        },
        topicHub: exampleHub,
        contentBrief: exampleBrief,
        informationGain: exampleGain,
        cannibalization: exampleCannibalization,
        decaySignal: exampleDecay,
        coverageGaps: exampleGaps,
      }
    }

    if (view === 'authority-maps') {
      return NextResponse.json({ siteId, authorityMaps })
    }
    if (view === 'coverage-gaps') {
      return NextResponse.json({ siteId, coverageGaps })
    }
    if (view === 'cannibalization') {
      return NextResponse.json({ siteId, cannibalizationCandidates })
    }
    if (view === 'decay') {
      return NextResponse.json({ siteId, decaySignals })
    }
    if (view === 'e2e-example') {
      return NextResponse.json({ siteId, e2eExample })
    }

    return NextResponse.json({
      siteId,
      authorityMaps,
      coverageGaps,
      cannibalizationCandidates,
      decaySignals,
      e2eExample,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Workflow analysis failed.' },
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
    const body = (await request.json()) as Record<string, unknown>
    const action = String(body.action || '')
    let siteId = String(body.siteId || '')
    if (!siteId || siteId === 'default-site') {
      const sites = await payload.find({
        collection: 'sites',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (sites.docs.length > 0) {
        siteId = String(sites.docs[0].id)
      } else {
        siteId = siteId || 'default-site'
      }
    }

    if (!canManageAdminSite(auth.user, siteId)) {
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    }

    const store = defaultNeo4jAdapter.getStore()
    if (store.getNodeCounts().contentCount === 0) {
      await rebuildKnowledgeGraph(payload, { siteId })
    }

    switch (action) {
      case 'generate-brief': {
        const topicId = String(body.topicId || '')
        const proposedTitle = String(body.proposedTitle || '')
        const targetAudience = body.targetAudience ? String(body.targetAudience) : undefined
        const searchIntent = body.searchIntent as never
        const userAngle = body.userAngle ? String(body.userAngle) : undefined

        if (!topicId || !proposedTitle) {
          return NextResponse.json(
            { error: 'topicId and proposedTitle are required to generate a content brief.' },
            { status: 400 },
          )
        }

        const brief = await generateContentBrief(store, payload, {
          topicId,
          proposedTitle,
          targetAudience,
          searchIntent,
          userAngle,
          siteId,
        })
        return NextResponse.json({ success: true, brief })
      }

      case 'assess-information-gain': {
        const contentId = String(body.contentId || '')
        if (!contentId) {
          return NextResponse.json({ error: 'contentId is required.' }, { status: 400 })
        }

        const subjectContent = store.getContent(contentId)
        if (!subjectContent) {
          return NextResponse.json(
            { error: `Content ${contentId} not found in graph.` },
            { status: 404 },
          )
        }

        // Find benchmark sources in the same topic
        const peers = store
          .getAllContent()
          .filter(
            (c) => c.id !== contentId && c.topics.some((t) => subjectContent.topics.includes(t)),
          )

        const benchmarkSources = peers.slice(0, 3).map((p) => ({
          type: 'internal_content' as const,
          title: p.title,
          identifier: p.canonicalPath,
          bodyText: p.title, // In real graph, title and content
          entities: p.entities.map((id) => store.getEntity(id)?.name || id),
        }))

        const assessment = assessInformationGain({
          contentId,
          contentTitle: subjectContent.title,
          contentBodyText: subjectContent.title,
          contentEntities: subjectContent.entities.map((id) => store.getEntity(id)?.name || id),
          benchmarkSources,
        })

        return NextResponse.json({ success: true, assessment })
      }

      case 'editorial-action': {
        const workflowAction = body.workflowAction as 'dismiss' | 'defer' | 'merge' | 'create_task'
        const findingType = body.findingType as
          | 'cannibalization'
          | 'decay'
          | 'coverage_gap'
          | 'hub_health'
        const findingId = String(body.findingId || '')

        if (!workflowAction || !findingType || !findingId) {
          return NextResponse.json(
            { error: 'workflowAction, findingType, and findingId are required.' },
            { status: 400 },
          )
        }

        const result = await executeEditorialWorkflowAction(payload, {
          action: workflowAction,
          findingType,
          findingId,
          siteId,
          userId: String(auth.user.id),
          deferUntilDate: body.deferUntilDate ? String(body.deferUntilDate) : undefined,
          mergeConfig: body.mergeConfig as never,
          taskConfig: body.taskConfig as never,
        })

        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}. Valid actions: generate-brief, assess-information-gain, editorial-action`,
          },
          { status: 400 },
        )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Workflow execution failed.' },
      { status: 500 },
    )
  }
}
