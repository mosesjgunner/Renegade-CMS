/* AUD-03's deterministic email channel projection.  This deliberately has no
 * dependency on Puck, site CSS, or a browser DOM. */
import { createHash } from 'node:crypto'

export const PERSONALIZATION_KEYS = [
  'recipient.firstName',
  'recipient.lastName',
  'recipient.email',
  'site.name',
] as const
type PersonalizationKey = (typeof PERSONALIZATION_KEYS)[number]
export type MissingValuePolicy = 'fallback' | 'blank' | 'error'
export type EmailDesignBlock =
  | { type: 'heading' | 'text'; text: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'image'; assetId: string; src: string; alt: string }
  | { type: 'divider' | 'spacer' }
  | {
      type: 'content-card'
      source: {
        contentId: string
        revisionId: string
        url: string
        title: string
        summary?: string
      }
      title?: string
      summary?: string
    }
  | { type: 'social-links'; links: { label: string; href: string }[] }
  | { type: 'legal'; address: string; preferenceUrl: string; unsubscribeUrl?: string }

export type MessageDesign = {
  version: 1
  templateVersion: string
  locale: string
  tokens: { background?: string; foreground?: string; accent?: string; fontFamily?: string }
  blocks: EmailDesignBlock[]
  plainTextStrategy: 'generated' | 'custom'
  plainText?: string
  personalization: {
    missingValue: MissingValuePolicy
    fallbacks: Partial<Record<PersonalizationKey, string>>
  }
}
export type RenderedEmail = { html: string; text: string; hash: string; warnings: string[] }

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const absolute = (value: string, origin: string) => new URL(value, origin).toString()
const interpolate = (
  value: string,
  data: Record<string, unknown>,
  policy: MessageDesign['personalization'],
) =>
  value.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
    if (!(PERSONALIZATION_KEYS as readonly string[]).includes(key))
      throw new Error(`Unsupported personalization token: ${key}`)
    const resolved = data[key]
    if (resolved !== undefined && resolved !== null && resolved !== '') return escape(resolved)
    if (policy.missingValue === 'error') throw new Error(`Missing personalization value: ${key}`)
    return policy.missingValue === 'blank'
      ? ''
      : escape(policy.fallbacks[key as PersonalizationKey] ?? '')
  })

export function validateEmailDesign(design: MessageDesign, kind: string) {
  const errors: string[] = []
  if (design.version !== 1) errors.push('Unsupported message design version.')
  let controls = 0
  for (const block of design.blocks) {
    if (
      block.type === 'image' &&
      (!block.assetId || !block.alt.trim() || !/^https?:\/\//.test(block.src))
    )
      errors.push('Images require governed media, absolute source, and alt text.')
    if (block.type === 'button' && !/^https?:\/\//.test(block.href))
      errors.push('Buttons require absolute http(s) URLs.')
    if (
      block.type === 'content-card' &&
      (!block.source.revisionId || !/^https?:\/\//.test(block.source.url))
    )
      errors.push('Content cards must pin a source revision and resolved canonical URL.')
    if (block.type === 'legal') {
      controls++
      if (!block.address.trim() || !block.preferenceUrl)
        errors.push('Legal block requires address and preference URL.')
    }
  }
  if (kind !== 'transactional' && controls !== 1)
    errors.push('Marketing messages require exactly one legal preference block.')
  return errors
}

/** Render is pure: recipient values are supplied by the caller and never become a shared cache key. */
export function renderEmailDesign(
  design: MessageDesign,
  input: { origin: string; recipient?: Record<string, unknown>; siteName?: string },
): RenderedEmail {
  const errors = validateEmailDesign(design, 'bulk')
  if (errors.length) throw new Error(errors.join(' '))
  const data = { ...(input.recipient ?? {}), 'site.name': input.siteName ?? '' }
  const t = (value: string) => interpolate(value, data, design.personalization)
  const foreground = /^#[0-9a-f]{6}$/i.test(design.tokens.foreground ?? '')
    ? design.tokens.foreground
    : '#172033'
  const background = /^#[0-9a-f]{6}$/i.test(design.tokens.background ?? '')
    ? design.tokens.background
    : '#ffffff'
  const accent = /^#[0-9a-f]{6}$/i.test(design.tokens.accent ?? '')
    ? design.tokens.accent
    : '#164e9b'
  const blocks = design.blocks
    .map((block) => {
      if (block.type === 'heading')
        return `<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">${t(block.text)}</h1>`
      if (block.type === 'text')
        return `<p style="margin:0 0 16px;line-height:1.55">${t(block.text)}</p>`
      if (block.type === 'button')
        return `<p><a href="${escape(absolute(block.href, input.origin))}" style="background:${accent};color:#ffffff;padding:12px 18px;display:inline-block;text-decoration:none;border-radius:4px">${t(block.label)}</a></p>`
      if (block.type === 'image')
        return `<img src="${escape(absolute(block.src, input.origin))}" alt="${t(block.alt)}" width="600" style="display:block;max-width:100%;height:auto;border:0" />`
      if (block.type === 'divider')
        return '<hr style="border:0;border-top:1px solid #d8dee9;margin:24px 0" />'
      if (block.type === 'spacer') return '<div style="height:20px;line-height:20px">&nbsp;</div>'
      if (block.type === 'content-card')
        return `<article><h2>${t(block.title ?? block.source.title)}</h2><p>${t(block.summary ?? block.source.summary ?? '')}</p><a href="${escape(block.source.url)}">Read more</a></article>`
      if (block.type === 'social-links')
        return `<p>${block.links.map((l) => `<a href="${escape(absolute(l.href, input.origin))}">${t(l.label)}</a>`).join(' · ')}</p>`
      if (block.type === 'legal')
        return `<footer><p>${t(block.address)}</p><p><a href="${escape(absolute(block.preferenceUrl, input.origin))}">Manage preferences</a>${block.unsubscribeUrl ? ` · <a href="${escape(absolute(block.unsubscribeUrl, input.origin))}">Unsubscribe</a>` : ''}</p></footer>`
      return ''
    })
    .join('')
  const html = `<!doctype html><html><body style="margin:0;background:${background};color:${foreground}"><main role="main" style="max-width:600px;margin:0 auto;padding:24px;font-family:${escape(design.tokens.fontFamily ?? 'Arial, sans-serif')}">${blocks}</main></body></html>`
  const text =
    design.plainTextStrategy === 'custom' && design.plainText ? t(design.plainText) : strip(html)
  return {
    html,
    text,
    hash: createHash('sha256').update(`${html}\n${text}`).digest('hex'),
    warnings: ['Mailbox/device previews are approximations; provider rendering can differ.'],
  }
}

export function sourceIsStale(block: EmailDesignBlock, currentRevisionId: string) {
  return block.type === 'content-card' && block.source.revisionId !== currentRevisionId
}
export function rebaseContentCard(
  block: EmailDesignBlock,
  source: Extract<EmailDesignBlock, { type: 'content-card' }>['source'],
) {
  if (block.type !== 'content-card') throw new Error('Only canonical content cards can be rebased.')
  return { ...block, source } // title/summary overrides remain the editor's projection.
}
export function approvedRenderSnapshot(
  design: MessageDesign,
  input: {
    origin: string
    subject: string
    recipient?: Record<string, unknown>
    siteName?: string
  },
) {
  const rendered = renderEmailDesign(design, input)
  return {
    subject: input.subject,
    templateVersion: design.templateVersion,
    html: rendered.html,
    text: rendered.text,
    hash: rendered.hash,
    approvedAt: new Date().toISOString(),
  }
}
