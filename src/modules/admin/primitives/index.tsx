import Link from 'next/link'
import type { ReactNode } from 'react'

import styles from './primitives.module.css'

/**
 * GUI-02B — shared operator primitives.
 *
 * Server-component-safe building blocks for operator views, styled only
 * with the GUI-02A semantic tokens (`--admin-*`). Payload UI remains the
 * component source inside native Payload screens; these primitives serve
 * the custom operator views (dashboard, centers) that Payload does not
 * style. Full API notes: docs/beta/gui-overhaul/design-system.md.
 */

export function WorkspaceHeader({
  title,
  purpose,
  actions,
  crumbs,
}: {
  title: string
  purpose?: string
  actions?: ReactNode
  crumbs?: { label: string; href?: string }[]
}) {
  return (
    <header className={styles.header}>
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.label}>
              {i > 0 ? ' / ' : null}
              {crumb.href ? (
                <Link href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.headerTitle}>{title}</h1>
          {purpose ? <p className={styles.headerPurpose}>{purpose}</p> : null}
        </div>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
    </header>
  )
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className={styles.sectionHeader}>{children}</h2>
}

export function ActionLink({
  href,
  intent = 'secondary',
  children,
}: {
  href: string
  intent?: 'primary' | 'secondary' | 'destructive'
  children: ReactNode
}) {
  const className =
    intent === 'primary'
      ? `${styles.action} ${styles.actionPrimary}`
      : intent === 'destructive'
        ? `${styles.action} ${styles.actionDestructive}`
        : styles.action
  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  )
}

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'neutral'
  children: ReactNode
}) {
  const toneClass =
    tone === 'success'
      ? styles.statusSuccess
      : tone === 'warning'
        ? styles.statusWarning
        : tone === 'danger'
          ? styles.statusDanger
          : styles.statusNeutral
  return (
    <span className={`${styles.status} ${toneClass}`}>
      <span aria-hidden="true" className={styles.statusDot} />
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>
}

export function ErrorState({
  message,
  retryHref,
  onRetry,
  retryLabel = 'Retry',
}: {
  message: string
  retryHref?: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className={styles.errorBox} role="alert">
      <p>{message}</p>
      {retryHref ? (
        <p>
          <Link href={retryHref}>{retryLabel}</Link>
        </p>
      ) : onRetry ? (
        <p>
          <button type="button" onClick={onRetry}>
            {retryLabel}
          </button>
        </p>
      ) : null}
    </div>
  )
}

export function DetailContainer({ children }: { children: ReactNode }) {
  return <div className={styles.detail}>{children}</div>
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={styles.skeleton} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div className={styles.skeletonBar} key={i} style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  )
}

/**
 * Focus the first field matching `selector`, expanding any collapsed
 * Payload Collapsible ancestor first so a validation target hidden in a
 * collapsed section becomes visible and receives focus (GUI-02C pattern).
 * Returns false when no field matches.
 */
export function focusFieldBySelector(selector: string): boolean {
  if (typeof document === 'undefined') return false
  const field = document.querySelector<HTMLElement>(selector)
  if (!field) return false
  const collapsible = field.closest('.collapsible')
  if (collapsible?.classList.contains('collapsible--collapsed')) {
    collapsible
      .querySelector<HTMLElement>('.collapsible__toggle, [aria-expanded="false"]')
      ?.click()
  }
  window.setTimeout(() => {
    field.scrollIntoView({ block: 'center' })
    field.focus({ preventScroll: true })
  }, 60)
  return true
}

export function ValidationSummary({
  errors,
}: {
  errors: { label: string; fieldSelector?: string; message: string }[]
}) {
  if (!errors.length) return null
  return (
    <div aria-live="polite" className={styles.summary} role="alert">
      <p className={styles.summaryTitle}>
        {errors.length} {errors.length === 1 ? 'field needs' : 'fields need'} attention
      </p>
      <ul className={styles.summaryList}>
        {errors.map((error) => (
          <li key={`${error.label}:${error.message}`}>
            {error.fieldSelector ? (
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault()
                  focusFieldBySelector(error.fieldSelector!)
                }}
              >
                {error.label}
              </a>
            ) : (
              error.label
            )}
            {': '}
            {error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SaveStateNote({
  state,
  children,
}: {
  state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  children: ReactNode
}) {
  return (
    <p aria-live="polite" className={styles.saveState} data-state={state} role="status">
      {children}
    </p>
  )
}
