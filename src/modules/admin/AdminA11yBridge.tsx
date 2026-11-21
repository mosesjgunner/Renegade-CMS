'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Admin accessibility bridge (RC2-DEBT-23).
 *
 * Payload 3.90's stock admin chrome renders two things without the
 * semantics assistive technology needs, and offers no global override
 * for either (the field Error component resolves strictly per field,
 * and the stock Nav renders no current-page marker):
 *
 * 1. The nav link for the page being viewed gets no `aria-current`.
 * 2. A field validation error renders as plain text (`.field-error`)
 *    with no `role="alert"`, and the invalid input gets no
 *    `aria-invalid` / `aria-describedby`. (RC3-03: the errors
 *    themselves now reach the form — see validation-error-response —
 *    and this bridge additionally moves focus to the first failing
 *    control after a failed save.)
 *
 * This provider annotates the rendered chrome in place: it marks the
 * best-matching nav link `aria-current="page"` for the current route,
 * and upgrades each rendered field error into an alert associated
 * with its input. It renders nothing of its own and removes its
 * annotations' effects when errors disappear. Replacing the stock
 * components wholesale remains the Payload-upgrade path; this bridge
 * carries the semantics until then.
 */

const normalizePath = (value: string): string => {
  const path = value.split(/[?#]/, 1)[0]
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/**
 * Which nav href (if any) names the current page: an exact match
 * wins; otherwise the longest href that is a whole-segment prefix of
 * the pathname. The admin root (`/admin`) only ever matches exactly,
 * so the dashboard link does not claim every admin page.
 */
export function bestNavCurrentHref(pathname: string, hrefs: readonly string[]): string | null {
  const current = normalizePath(pathname)
  const candidates = hrefs.map(normalizePath).filter((href) => href.startsWith('/'))
  if (candidates.includes(current)) return current
  let best: string | null = null
  for (const href of candidates) {
    if (href === '/admin' || href === '/') continue
    if (current.startsWith(`${href}/`) && (best === null || href.length > best.length)) {
      best = href
    }
  }
  return best
}

function annotateNav(pathname: string) {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav a[href]')]
  if (links.length === 0) return
  const winner = bestNavCurrentHref(
    pathname,
    links.map((link) => link.getAttribute('href') ?? ''),
  )
  for (const link of links) {
    const isWinner = winner !== null && normalizePath(link.getAttribute('href') ?? '') === winner
    if (isWinner) {
      if (link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page')
    } else if (link.hasAttribute('aria-current')) {
      link.removeAttribute('aria-current')
    }
  }
}

const FIELD_CONTROL = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'

/**
 * RC3-03: after a failed save, focus belongs on the first failing
 * control — but only when the failure is news and the user is not
 * already working in a field. A submit leaves focus on the Save
 * button (or nowhere, when React replaces it); both mean "the save
 * just answered", so the bridge may move focus. If the user is
 * typing in another field when an error appears, focus stays put.
 * A control inside a collapsed section is not a focus target: the
 * error still renders and announces, and the section header carries
 * the failure state.
 */
export function shouldFocusErrorControl(args: {
  activeKind: 'none' | 'button' | 'field' | 'other'
  hasNewError: boolean
  targetVisible: boolean
}): boolean {
  return (
    args.hasNewError &&
    args.targetVisible &&
    (args.activeKind === 'none' || args.activeKind === 'button')
  )
}

const activeElementKind = (): 'none' | 'button' | 'field' | 'other' => {
  const el = document.activeElement
  if (!el || el === document.body) return 'none'
  if (
    el.tagName === 'BUTTON' ||
    el.getAttribute('role') === 'button' ||
    (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'submit')
  ) {
    return 'button'
  }
  if (el.matches(FIELD_CONTROL)) return 'field'
  return 'other'
}

export default function AdminA11yBridge({ children }: { children?: ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    // input -> error element id this bridge associated with it, so the
    // association can be withdrawn when the error leaves the document.
    const upgraded = new Map<HTMLElement, string>()
    // Error ids live on the previous pass, so a genuinely new failure
    // (a fresh failed save) can be told apart from the standing set.
    let knownErrorIds = new Set<string>()
    let errorSeq = 0
    let raf = 0

    const withdraw = (input: HTMLElement, errorId: string) => {
      if (input.getAttribute('aria-invalid') === 'true') input.removeAttribute('aria-invalid')
      const describedBy = (input.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((token) => token && token !== errorId)
      if (describedBy.length > 0) input.setAttribute('aria-describedby', describedBy.join(' '))
      else input.removeAttribute('aria-describedby')
    }

    const upgradeErrors = () => {
      const errors = [...document.querySelectorAll<HTMLElement>('.field-error')]
      const liveIds = new Set<string>()
      let firstNewInput: HTMLElement | null = null
      for (const error of errors) {
        if (!error.id) {
          errorSeq += 1
          error.id = `rg-field-error-${errorSeq}`
        }
        liveIds.add(error.id)
        if (error.getAttribute('role') !== 'alert') error.setAttribute('role', 'alert')
        const field = error.closest('.field-type') ?? error.parentElement
        const input = field?.querySelector<HTMLElement>(FIELD_CONTROL)
        if (!input) continue
        if (firstNewInput === null && !knownErrorIds.has(error.id)) firstNewInput = input
        const previous = upgraded.get(input)
        if (previous && previous !== error.id) withdraw(input, previous)
        upgraded.set(input, error.id)
        if (input.getAttribute('aria-invalid') !== 'true') {
          input.setAttribute('aria-invalid', 'true')
        }
        const describedBy = new Set(
          (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
        )
        if (!describedBy.has(error.id)) {
          describedBy.add(error.id)
          input.setAttribute('aria-describedby', [...describedBy].join(' '))
        }
      }
      for (const [input, errorId] of upgraded) {
        if (!liveIds.has(errorId) || !input.isConnected) {
          withdraw(input, errorId)
          upgraded.delete(input)
        }
      }
      // RC3-03: a fresh failure moves focus to its first control (see
      // shouldFocusErrorControl for the exact conditions).
      if (
        firstNewInput &&
        shouldFocusErrorControl({
          activeKind: activeElementKind(),
          hasNewError: true,
          targetVisible: firstNewInput.getClientRects().length > 0,
        })
      ) {
        firstNewInput.focus()
        firstNewInput.scrollIntoView({ block: 'center' })
      }
      knownErrorIds = liveIds
    }

    const run = () => {
      if (pathname) annotateNav(pathname)
      upgradeErrors()
    }
    run()
    // Attribute writes by this bridge are not observed (childList
    // only), so annotation cannot retrigger itself.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(run)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [pathname])

  return <>{children}</>
}
