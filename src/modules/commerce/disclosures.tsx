import React from 'react'
import { isSafeAffiliateDestinationUrl, type AffiliateOffer } from './affiliate-referral-contracts'

export type DisclosurePlacement = 'above' | 'inline' | 'below' | 'badge'

export interface AffiliateDisclosureBannerProps {
  text?: string
  placement?: DisclosurePlacement
  className?: string
}

/**
 * Accessible disclosure banner compliant with FTC / ASA advertising disclosure guidelines.
 * Uses semantic <aside> with aria-label and role="note".
 */
export function AffiliateDisclosureBanner({
  text = 'Disclosure: We may earn a commission from qualifying purchases made through links on this page at no extra cost to you.',
  placement = 'above',
  className = '',
}: AffiliateDisclosureBannerProps) {
  return (
    <aside
      aria-label="Affiliate and advertising disclosure"
      role="note"
      className={`renegade-affiliate-disclosure rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 ${
        placement === 'above' ? 'mb-4' : 'mt-4'
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="font-semibold text-amber-700 dark:text-amber-400">
          ⓘ
        </span>
        <p className="m-0 leading-relaxed">{text}</p>
      </div>
    </aside>
  )
}

export interface AffiliateLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children?: React.ReactNode
  disclosureText?: string
  offerSlug?: string
}

/**
 * Accessible affiliate link:
 * - Always includes rel="sponsored nofollow noopener"
 * - Injects screen-reader notification of commercial partnership
 */
export function AffiliateLink({
  href,
  children,
  disclosureText,
  offerSlug,
  className = '',
  ...props
}: AffiliateLinkProps) {
  return (
    <a
      href={href}
      rel="sponsored nofollow noopener"
      target="_blank"
      data-offer-slug={offerSlug}
      className={`renegade-affiliate-link inline-flex items-baseline font-medium text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 ${className}`}
      {...props}
    >
      {children}
      <span className="sr-only"> (Affiliate link; opens in a new tab)</span>
    </a>
  )
}

/**
 * Editorial validation for content or catalog products containing affiliate offers.
 * Blocks publication if disclosure is missing or destinations are broken / unsafe.
 */
export function validateAffiliateEditorial(input: {
  hasAffiliateContent: boolean
  disclosureText?: string
  offers?: readonly AffiliateOffer[]
  destinationUrls?: readonly string[]
}): {
  allowed: boolean
  issues: readonly string[]
  warnings: readonly string[]
} {
  const issues: string[] = []
  const warnings: string[] = []

  if (!input.hasAffiliateContent) {
    return { allowed: true, issues: [], warnings: [] }
  }

  // 1. Mandatory prominent disclosure
  if (!input.disclosureText?.trim()) {
    issues.push('Affiliate content requires a prominent, accessible disclosure statement.')
  } else if (input.disclosureText.trim().length < 15) {
    issues.push('Affiliate disclosure statement is too brief to meet regulatory requirements.')
  }

  // 2. Validate destination URLs
  const urlsToCheck = [
    ...(input.destinationUrls ?? []),
    ...(input.offers?.map((o) => o.destinationUrl) ?? []),
  ]

  for (const url of urlsToCheck) {
    if (!isSafeAffiliateDestinationUrl(url)) {
      issues.push(`Affiliate destination '${url}' is unsafe or does not use HTTPS.`)
    }
  }

  // 3. Link health & status checks
  if (input.offers) {
    for (const offer of input.offers) {
      if (offer.status === 'archived' || offer.status === 'expired') {
        issues.push(`Offer '${offer.name}' is ${offer.status} and cannot be published.`)
      }
      if (offer.linkHealth?.status === 'broken') {
        issues.push(
          `Offer '${offer.name}' has broken link health (${offer.linkHealth.error ?? 'HTTP failure'}).`,
        )
      } else if (offer.linkHealth?.status === 'rate-limited') {
        warnings.push(`Offer '${offer.name}' target network is rate-limited; link check deferred.`)
      } else if (offer.linkHealth?.status === 'warning') {
        warnings.push(
          `Offer '${offer.name}' has link health warnings (${offer.linkHealth.error ?? 'redirect issue'}).`,
        )
      }

      // Check freshness
      if (offer.pricingFreshness) {
        const observedTime = Date.parse(offer.pricingFreshness.observedAt)
        if (
          Number.isFinite(observedTime) &&
          Date.now() - observedTime > offer.pricingFreshness.freshnessHours * 3600000
        ) {
          warnings.push(
            `Offer '${offer.name}' remote price/stock is stale; displayed as unconfirmed.`,
          )
        }
      }
    }
  }

  return {
    allowed: issues.length === 0,
    issues,
    warnings,
  }
}
