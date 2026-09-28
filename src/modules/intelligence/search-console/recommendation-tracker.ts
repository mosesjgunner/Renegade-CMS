/**
 * Recommendation Lifecycle & Impact Measurement Tracker
 *
 * Tracks recommendations through:
 * baseline -> proposed -> approved -> implemented -> measuring -> evaluated
 *
 * Records exact intervention dates and confounding changes.
 * Reports before/after performance changes strictly as observational association,
 * never claiming definitive causation.
 */

import { randomUUID } from 'node:crypto'
import type {
  ConfoundingChange,
  RecommendationStatus,
  SearchConsoleOpportunity,
  TrackedRecommendation,
  TrackedRecommendationMetrics,
} from './contracts'

const recommendationsStore = new Map<string, TrackedRecommendation>()

export class RecommendationTracker {
  /**
   * Retrieves all tracked recommendations for a site.
   */
  static getRecommendations(siteId: string): TrackedRecommendation[] {
    return Array.from(recommendationsStore.values()).filter((r) => r.siteId === siteId)
  }

  /**
   * Retrieves a single recommendation by ID.
   */
  static getRecommendation(id: string): TrackedRecommendation | null {
    return recommendationsStore.get(id) || null
  }

  /**
   * Creates a tracked recommendation from an evidence-backed opportunity.
   */
  static createFromOpportunity(params: {
    siteId: string
    opportunity: SearchConsoleOpportunity
    baselineMetrics: TrackedRecommendationMetrics
    baselineWindow: { start: string; end: string }
    createdBy: string
    interventionType?: TrackedRecommendation['interventionType']
  }): TrackedRecommendation {
    const { siteId, opportunity, baselineMetrics, baselineWindow, createdBy, interventionType } =
      params
    const id = `rec-track-${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    const rec: TrackedRecommendation = {
      id,
      siteId,
      opportunityId: opportunity.id,
      contentId: opportunity.contentId || 'content-generic',
      canonicalPath: opportunity.canonicalPath,
      title: opportunity.title,
      interventionType:
        interventionType ||
        (opportunity.type === 'high_impression_low_ctr'
          ? 'title_optimization'
          : opportunity.type === 'weak_coverage_query'
            ? 'content_expansion'
            : 'custom'),
      status: 'proposed',
      baselineWindow: {
        start: baselineWindow.start,
        end: baselineWindow.end,
        metrics: baselineMetrics,
      },
      interventionDate: null,
      implementedBy: null,
      confoundingChanges: [],
      history: [
        {
          status: 'proposed',
          changedAt: now,
          changedBy: createdBy,
          notes: `Recommendation generated from ${opportunity.type}. Baseline established (${baselineMetrics.clicks} clicks, ${baselineMetrics.impressions} impressions).`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    }

    recommendationsStore.set(id, rec)
    return rec
  }

  /**
   * Approves a recommendation for implementation.
   */
  static approveRecommendation(
    id: string,
    approvedBy: string,
    notes?: string,
  ): TrackedRecommendation {
    const rec = recommendationsStore.get(id)
    if (!rec) throw new Error(`Recommendation '${id}' not found.`)

    const now = new Date().toISOString()
    rec.status = 'approved'
    rec.history.push({
      status: 'approved',
      changedAt: now,
      changedBy: approvedBy,
      notes: notes || 'Editorial approval granted.',
    })
    rec.updatedAt = now

    recommendationsStore.set(id, rec)
    return rec
  }

  /**
   * Records the implementation of a recommendation with exact intervention date.
   */
  static recordImplementation(params: {
    id: string
    implementedBy: string
    interventionDate?: string
    notes?: string
  }): TrackedRecommendation {
    const { id, implementedBy, notes } = params
    const rec = recommendationsStore.get(id)
    if (!rec) throw new Error(`Recommendation '${id}' not found.`)

    const now = new Date().toISOString()
    const interventionDate = params.interventionDate || now.split('T')[0]!

    rec.status = 'implemented'
    rec.interventionDate = interventionDate
    rec.implementedBy = implementedBy
    rec.history.push({
      status: 'implemented',
      changedAt: now,
      changedBy: implementedBy,
      notes: notes || `Intervention deployed to production on ${interventionDate}.`,
    })
    rec.updatedAt = now

    recommendationsStore.set(id, rec)
    return rec
  }

  /**
   * Records an external confounding change (e.g. Google algorithm update, site redesign).
   */
  static recordConfoundingChange(params: {
    id: string
    category: ConfoundingChange['category']
    description: string
    date?: string
    recordedBy: string
  }): TrackedRecommendation {
    const { id, category, description, recordedBy } = params
    const rec = recommendationsStore.get(id)
    if (!rec) throw new Error(`Recommendation '${id}' not found.`)

    const changeDate = params.date || new Date().toISOString().split('T')[0]!
    const confounder: ConfoundingChange = {
      id: `conf-${randomUUID().slice(0, 6)}`,
      date: changeDate,
      category,
      description,
    }

    rec.confoundingChanges.push(confounder)
    rec.history.push({
      status: rec.status,
      changedAt: new Date().toISOString(),
      changedBy: recordedBy,
      notes: `Confounding factor recorded: [${category}] ${description} (${changeDate}).`,
    })
    rec.updatedAt = new Date().toISOString()

    recommendationsStore.set(id, rec)
    return rec
  }

  /**
   * Evaluates post-intervention measurement results.
   * Reports before/after results strictly as observational association, never proof of causation.
   */
  static evaluateImpact(params: {
    id: string
    postWindow: { start: string; end: string }
    postMetrics: TrackedRecommendationMetrics
    evaluatedBy: string
  }): TrackedRecommendation {
    const { id, postWindow, postMetrics, evaluatedBy } = params
    const rec = recommendationsStore.get(id)
    if (!rec) throw new Error(`Recommendation '${id}' not found.`)

    const base = rec.baselineWindow.metrics
    const clickDeltaPercent =
      base.clicks > 0
        ? Number((((postMetrics.clicks - base.clicks) / base.clicks) * 100).toFixed(1))
        : 0

    const impressionDeltaPercent =
      base.impressions > 0
        ? Number(
            (((postMetrics.impressions - base.impressions) / base.impressions) * 100).toFixed(1),
          )
        : 0

    const ctrDeltaPercent =
      base.ctr > 0 ? Number((((postMetrics.ctr - base.ctr) / base.ctr) * 100).toFixed(1)) : 0

    const positionDelta = Number((base.position - postMetrics.position).toFixed(1)) // Positive means rank improved (e.g. 8.0 -> 5.0 is +3.0)

    // Formulate report statement framing as association, NOT proof of causation
    const confounderSummary =
      rec.confoundingChanges.length > 0
        ? ` Note: ${rec.confoundingChanges.length} confounding factor(s) recorded during this observation window (${rec.confoundingChanges.map((c) => `[${c.category}] ${c.description}`).join('; ')}).`
        : ' No major confounding events were documented during this measurement period.'

    const reportStatement =
      `Between baseline (${rec.baselineWindow.start} to ${rec.baselineWindow.end}) and post-intervention (${postWindow.start} to ${postWindow.end}), ` +
      `organic clicks changed by ${clickDeltaPercent >= 0 ? '+' : ''}${clickDeltaPercent}% (${base.clicks} → ${postMetrics.clicks} clicks), ` +
      `impressions changed by ${impressionDeltaPercent >= 0 ? '+' : ''}${impressionDeltaPercent}% (${base.impressions} → ${postMetrics.impressions}), ` +
      `and average position shifted from ${base.position} to ${postMetrics.position}. ` +
      `This change is correlated with the editorial intervention on ${rec.interventionDate || 'recorded date'}. ` +
      `Important: This report documents an observational association, not proof of causation, as broader search algorithm shifts and market dynamics may also contribute.${confounderSummary}`

    rec.status = 'evaluated'
    rec.postInterventionWindow = {
      start: postWindow.start,
      end: postWindow.end,
      metrics: postMetrics,
    }
    rec.measurementResult = {
      clickDeltaPercent,
      impressionDeltaPercent,
      ctrDeltaPercent,
      positionDelta,
      reportStatement,
    }

    const now = new Date().toISOString()
    rec.history.push({
      status: 'evaluated',
      changedAt: now,
      changedBy: evaluatedBy,
      notes: `Measurement evaluated. Click delta: ${clickDeltaPercent >= 0 ? '+' : ''}${clickDeltaPercent}%. Reported as association.`,
    })
    rec.updatedAt = now

    recommendationsStore.set(id, rec)
    return rec
  }

  /**
   * Resets the store for testing.
   */
  static _resetForTesting(): void {
    recommendationsStore.clear()
  }
}
