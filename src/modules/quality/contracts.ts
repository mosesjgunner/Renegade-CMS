import { createHash } from 'node:crypto'
export type QualitySeverity = 'informational' | 'warning' | 'publication_blocking'
export type QualityFinding = Readonly<{
  rule: string
  severity: QualitySeverity
  message: string
  remediation: string
  uncertain?: boolean
  location?: string
}>
export const qualityDedupeKey = (input: {
  rule: string
  targetId: string
  revisionId?: string
  location?: string
  dependencyFingerprint?: string
}) => `quality:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`
export const canWaive = (input: {
  severity: QualitySeverity
  category: string
  actorRole: 'owner' | 'staff'
}) => {
  if (input.actorRole !== 'owner') return false
  return (
    input.category !== 'security' &&
    input.category !== 'privacy' &&
    input.severity !== 'publication_blocking'
  )
}
export function scanLocal(input: {
  targetId: string
  canonicalUrl?: string
  headings?: readonly number[]
  images?: readonly {
    id: string
    altText?: string
    rightsStatus?: string
    rightsExpiresAt?: string
  }[]
  internalLinks?: readonly { href: string; exists: boolean; visible: boolean }[]
  translationStatus?: string
  now?: Date
}): QualityFinding[] {
  const findings: QualityFinding[] = []
  const now = input.now ?? new Date()
  if (input.canonicalUrl && !/^https?:\/\/[^\s]+$/i.test(input.canonicalUrl))
    findings.push({
      rule: 'canonical-valid',
      severity: 'publication_blocking',
      message: 'Canonical URL is invalid.',
      remediation: 'Use an absolute http(s) canonical URL.',
    })
  if (
    input.headings?.some((heading, index) => index > 0 && heading > input.headings![index - 1] + 1)
  )
    findings.push({
      rule: 'heading-hierarchy',
      severity: 'warning',
      message: 'Heading hierarchy skips a level.',
      remediation: 'Use heading levels in order.',
    })
  for (const image of input.images ?? []) {
    if (!image.altText?.trim())
      findings.push({
        rule: 'media-alt-text',
        severity: 'publication_blocking',
        message: `Image ${image.id} is missing alt text.`,
        remediation: 'Add concise, meaningful alt text.',
      })
    if (
      image.rightsStatus === 'expired' ||
      (image.rightsExpiresAt && new Date(image.rightsExpiresAt) <= now)
    )
      findings.push({
        rule: 'media-rights',
        severity: 'publication_blocking',
        message: `Image ${image.id} has expired rights.`,
        remediation: 'Replace the asset or renew its rights.',
      })
  }
  for (const link of input.internalLinks ?? [])
    if (!link.exists || !link.visible)
      findings.push({
        rule: 'internal-link',
        severity: 'publication_blocking',
        message: `Internal link ${link.href} is unavailable or unauthorized.`,
        remediation: 'Repair the link or change the target visibility.',
      })
  if (
    input.translationStatus &&
    ['stale', 'outdated', 'incomplete'].includes(input.translationStatus)
  )
    findings.push({
      rule: 'translation-current',
      severity: 'publication_blocking',
      message: 'Required translation is stale or incomplete.',
      remediation: 'Update and review the translation.',
    })
  return findings
}
export const externalLinkFinding = (
  href: string,
  available: boolean | null,
): QualityFinding | null =>
  available === true
    ? null
    : {
        rule: 'external-link',
        severity: 'warning',
        message:
          available === false
            ? `External link ${href} could not be verified.`
            : `External link ${href} provider status is uncertain.`,
        remediation: 'Retry later or manually verify the external destination.',
        uncertain: true,
      }
export const releaseEligible = (findings: readonly Pick<QualityFinding, 'severity'>[]) =>
  !findings.some((finding) => finding.severity === 'publication_blocking')

export function qualityDashboard(
  issues: readonly {
    severity: QualitySeverity
    status: string
    ownerId?: string
    surface?: string
    targetId: string
    remediation?: unknown
  }[],
) {
  const open = issues.filter((issue) => issue.status === 'open' || issue.status === 'uncertain')
  const group = (key: (issue: (typeof open)[number]) => string) =>
    open.reduce<Record<string, typeof open>>((groups, issue) => {
      const bucket = key(issue)
      ;(groups[bucket] ??= []).push(issue)
      return groups
    }, {})
  return {
    open,
    blocking: open.filter((issue) => issue.severity === 'publication_blocking'),
    bySeverity: group((issue) => issue.severity),
    byOwner: group((issue) => issue.ownerId ?? 'unassigned'),
    bySurface: group((issue) => issue.surface ?? issue.targetId),
    byRemediation: group((issue) => JSON.stringify(issue.remediation ?? 'unspecified')),
  }
}
