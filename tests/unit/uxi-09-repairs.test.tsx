import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import POS from '../../src/app/(frontend)/pos/POS'

// UXI-09 (Stage 5, workstream B) — regression proof for the Stage 1
// inventory defects repaired in this stage:
//   UXI-D10 (/pos dead controls), UXI-D12 (email composer legal block),
//   UXI-D14 (/moderation gate), UXI-D16 (/videos empty state).
// The DB-level journeys live in
// tests/integration/uxi-09-journey.integration.test.ts.

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), 'utf8')

describe('UXI-D10 — /pos is an honest preview with no fake-working controls', () => {
  it('renders no buttons and no payment form controls at all', () => {
    const html = renderToStaticMarkup(<POS />)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
    expect(html).toContain('Preview — not a working till.')
    expect(html).toContain('cannot create a crypto invoice')
  })

  it('source contains none of the dead controls and links to the real store loop', () => {
    const source = read('src/app/(frontend)/pos/POS.tsx')
    expect(source).not.toContain('Generate crypto invoice')
    expect(source).not.toContain('awaiting_payment')
    expect(source).not.toContain('PosQr')
    expect(source).toContain('href="/store"')
    expect(source).toContain('href="/cart"')
  })

  it('/pos page carries the staff gate', () => {
    const source = read('src/app/(frontend)/pos/page.tsx')
    expect(source).toContain("redirect('/login')")
    expect(source).toContain("'owner', 'administrator', 'staff'")
  })
})

describe('UXI-D14 — /moderation is server-gated and recovers via staff sign-in', () => {
  it('page redirects non-staff to /login before rendering the center', () => {
    const source = read('src/app/(frontend)/moderation/page.tsx')
    expect(source).toContain('payload.auth')
    expect(source).toContain("redirect('/login')")
    expect(source).toContain("'owner', 'administrator', 'staff'")
  })

  it('the center unavailable state links to staff sign-in, never member sign-in', () => {
    const source = read('src/modules/admin/CommunityModerationCenter.tsx')
    expect(source).toContain('href="/login"')
    expect(source).not.toContain('href="/member-auth"')
  })
})

describe('UXI-D12 — email composer legal block has no fabricated defaults', () => {
  const source = read('src/modules/admin/EmailComposer.tsx')

  it('contains no placeholder postal address and no non-existent audience URLs', () => {
    expect(source).not.toContain('123 Renegade Way')
    expect(source).not.toContain('/audience/preferences')
    expect(source).not.toContain('/audience/unsubscribe')
  })

  it('defaults to the real preference/unsubscribe routes and an empty address', () => {
    expect(source).toContain("useState<string>('/subscribe/preferences')")
    expect(source).toContain("useState<string>('/unsubscribe')")
    expect(source).toContain("const [legalAddress, setLegalAddress] = useState<string>('')")
    expect(source).toContain('/subscribe/preferences`')
    expect(source).toContain('legal-address-unconfigured')
  })
})

describe('UXI-D16 — /videos has a real empty state', () => {
  it('renders explanation and a next action when zero videos exist', () => {
    const source = read('src/app/(frontend)/videos/page.tsx')
    expect(source).toContain('videos.docs.length === 0')
    expect(source).toContain('No videos have been published yet.')
    expect(source).toContain('href="/articles"')
  })
})
