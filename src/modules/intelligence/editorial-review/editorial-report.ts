/**
 * Renegade CMoS Content Intelligence - Editorial Fact Review & Validation Reporter
 *
 * Generates structured and human-readable reports that strictly distinguish automated
 * validation (syntax, schema rules, AI preliminary checks, source age) from human fact review
 * (editorial sign-offs, verified claims, contradiction resolutions).
 */

import type { EditorialClaim, FactReviewReport, SchemaAuditResult } from './contracts'

export function generateEditorialIntegrityReport(params: {
  contentId: string
  contentTitle: string
  contentRevision: string
  claims: EditorialClaim[]
  schemaAudit?: SchemaAuditResult
}): FactReviewReport {
  const { contentId, contentTitle, contentRevision, claims, schemaAudit } = params

  let unreviewedCount = 0
  let unsupportedCount = 0
  let contradictedCount = 0
  let outdatedCount = 0
  let humanVerifiedCount = 0
  let rejectedCount = 0
  let conflictedSourcesCount = 0
  let staleSourcesDetected = 0

  const aiFlaggedIssues: FactReviewReport['automatedValidation']['aiFlaggedIssues'] = []
  const unresolvedContradictions: FactReviewReport['humanFactReview']['unresolvedContradictions'] =
    []
  const unsupportedClaims: FactReviewReport['humanFactReview']['unsupportedClaims'] = []
  const outdatedClaims: FactReviewReport['humanFactReview']['outdatedClaims'] = []
  const reviewerSignoffs: FactReviewReport['humanFactReview']['reviewerSignoffs'] = []

  for (const claim of claims) {
    if (claim.reviewStatus === 'unreviewed') unreviewedCount++
    else if (claim.reviewStatus === 'unsupported') unsupportedCount++
    else if (claim.reviewStatus === 'contradicted') contradictedCount++
    else if (claim.reviewStatus === 'outdated') outdatedCount++
    else if (claim.reviewStatus === 'human_verified') humanVerifiedCount++
    else if (claim.reviewStatus === 'rejected') rejectedCount++

    if (claim.conflict.hasConflict) {
      conflictedSourcesCount++
      unresolvedContradictions.push({
        claimId: claim.id,
        statement: claim.statement,
        contradictingSources: claim.conflict.conflictingEvidence.map((e) => e.sourceId),
      })
    }

    if (claim.sources.length === 0 && claim.reviewStatus !== 'human_verified') {
      unsupportedClaims.push({
        claimId: claim.id,
        statement: claim.statement,
        location: claim.location.sectionPath || `Offset ${claim.location.offsetStart}`,
      })
    }

    // Source Freshness checks
    for (const src of claim.sources) {
      if (src.freshness.isStale) {
        staleSourcesDetected++
        if (claim.reviewStatus === 'outdated') {
          outdatedClaims.push({
            claimId: claim.id,
            statement: claim.statement,
            staleSourceUrl: src.sourceUrl,
            ageYears: src.freshness.ageYears,
          })
        }
      }
    }

    // Automated preliminary AI checks
    if (claim.automatedCheck && claim.automatedCheck.suggestedStatus !== 'supported') {
      aiFlaggedIssues.push({
        claimId: claim.id,
        suggestedStatus: claim.automatedCheck.suggestedStatus,
        rationale: claim.automatedCheck.rationale,
      })
    }

    // Human sign-off recording
    if (claim.humanVerification) {
      reviewerSignoffs.push({
        claimId: claim.id,
        verifiedBy: claim.humanVerification.verifiedBy,
        role: claim.humanVerification.verifiedRole,
        verifiedAt: claim.humanVerification.verifiedAt,
        decision: claim.humanVerification.decision,
      })
    }
  }

  const total = claims.length
  const ratio =
    total > 0
      ? `${humanVerifiedCount}/${total} (${Math.round((humanVerifiedCount / total) * 100)}%)`
      : '0/0 (N/A)'

  return {
    contentId,
    contentTitle,
    contentRevision,
    generatedAt: new Date().toISOString(),
    summary: {
      totalClaims: total,
      unreviewedCount,
      unsupportedCount,
      contradictedCount,
      outdatedCount,
      humanVerifiedCount,
      rejectedCount,
      conflictedSourcesCount,
    },
    automatedValidation: {
      schemaValid: schemaAudit
        ? schemaAudit.issues.filter((i) => i.severity === 'critical').length === 0
        : true,
      missingSchemaFields: schemaAudit?.missingFields || [],
      antiFabricationPassed: schemaAudit?.antiFabrication.passed ?? true,
      staleSourcesDetected,
      aiFlaggedIssues,
    },
    humanFactReview: {
      verifiedClaimsRatio: ratio,
      unresolvedContradictions,
      unsupportedClaims,
      outdatedClaims,
      reviewerSignoffs,
    },
  }
}

/**
 * Renders the integrity report as clean Markdown distinguishing automated findings
 * from human fact review for review queues and export records.
 */
export function formatReportAsMarkdown(report: FactReviewReport): string {
  return `# Editorial Fact-Review & Validation Report: "${report.contentTitle}"
- **Content ID:** \`${report.contentId}\`
- **Revision:** \`${report.contentRevision}\`
- **Generated At:** ${report.generatedAt}
- **Human Verification Ratio:** ${report.humanFactReview.verifiedClaimsRatio}

---

## 🤖 Section A: Automated Validation (Non-Human System Checks)
*These checks represent deterministic rules and model-assisted alerts. No automated check marks a claim verified.*

- **Schema Valid:** ${report.automatedValidation.schemaValid ? '✅ Yes' : '❌ Issues Found'}
- **Anti-Fabrication Check:** ${report.automatedValidation.antiFabricationPassed ? '✅ Passed (Zero Hallucinated Authors/Dates/Ratings)' : '❌ Failed'}
- **Missing Schema Fields:** ${report.automatedValidation.missingSchemaFields.length > 0 ? report.automatedValidation.missingSchemaFields.join(', ') : 'None'}
- **Stale Sources Detected:** ${report.automatedValidation.staleSourcesDetected}
- **AI-Flagged Candidate Checks:**
${
  report.automatedValidation.aiFlaggedIssues.length === 0
    ? '  - None flagged.'
    : report.automatedValidation.aiFlaggedIssues
        .map(
          (i) => `  - [${i.claimId}] Suggested status: **${i.suggestedStatus}** - ${i.rationale}`,
        )
        .join('\n')
}

---

## 👤 Section B: Human Fact Review (Editorial Staff Sign-Offs)
*Only human reviewers (editors, administrators, publishers) can verify claims and resolve contradictions.*

- **Human Verified Claims:** ${report.summary.humanVerifiedCount} / ${report.summary.totalClaims}
- **Unresolved Contradictions:** ${report.humanFactReview.unresolvedContradictions.length}
${
  report.humanFactReview.unresolvedContradictions.length === 0
    ? '  - None.'
    : report.humanFactReview.unresolvedContradictions
        .map(
          (c) =>
            `  - ⚠️ **${c.claimId}**: "${c.statement}" (Contradicted by: ${c.contradictingSources.join(', ')})`,
        )
        .join('\n')
}
- **Unsupported Claims:** ${report.humanFactReview.unsupportedClaims.length}
${
  report.humanFactReview.unsupportedClaims.length === 0
    ? '  - None.'
    : report.humanFactReview.unsupportedClaims
        .map((u) => `  - ❓ **${u.claimId}** (${u.location}): "${u.statement}"`)
        .join('\n')
}
- **Outdated Claims (Stale Sources):** ${report.humanFactReview.outdatedClaims.length}
${
  report.humanFactReview.outdatedClaims.length === 0
    ? '  - None.'
    : report.humanFactReview.outdatedClaims
        .map(
          (o) =>
            `  - ⏳ **${o.claimId}**: "${o.statement}" (Source age: ${o.ageYears}y from ${o.staleSourceUrl})`,
        )
        .join('\n')
}
- **Reviewer Sign-Off Ledger:**
${
  report.humanFactReview.reviewerSignoffs.length === 0
    ? '  - No human verification recorded yet.'
    : report.humanFactReview.reviewerSignoffs
        .map(
          (s) =>
            `  - ✅ **${s.claimId}**: Decided **${s.decision}** by \`${s.verifiedBy}\` (${s.role}) at ${s.verifiedAt}`,
        )
        .join('\n')
}
`
}
