import {
  emptyPortfolio, portfolioBlockKinds, portfolioEmbed, portfolioLayouts, portfolioVisibilities,
  type Portfolio,
} from './portfolio-contract'
import { uuid } from './submission-targets'

export class PortfolioError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function text(value: unknown, max: number) {
  if (value == null) return ''
  if (typeof value !== 'string' || value.length > max) throw new PortfolioError('A text field is too long or invalid.')
  return value.trim()
}
function list(value: unknown, max: number) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > max) throw new PortfolioError('Too many entries in this portfolio.')
  return value
}
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new PortfolioError('Select a supported portfolio option.')
  return value as T
}
function reference(value: unknown) {
  const id = text(value, 36)
  if (id && !uuid.test(id)) throw new PortfolioError('Choose a valid library reference.')
  return id
}
function date(value: unknown) {
  const valueText = text(value, 10)
  if (!valueText) return ''
  const dateValue = new Date(valueText + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText) ||
    !Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== valueText)
    throw new PortfolioError('Enter a valid calendar date.')
  return valueText
}

export function parsePortfolio(value: unknown): Portfolio {
  const input = record(value)
  const defaults = emptyPortfolio()
  const keys = new Set<string>()
  function entryId(value: unknown) {
    const id = reference(value)
    if (!id || keys.has(id)) throw new PortfolioError('Portfolio entries need distinct identifiers.')
    keys.add(id)
    return id
  }
  const content: Portfolio = {
    title: text(input.title, 180),
    summary: text(input.summary, 5000),
    layout: choice(input.layout ?? defaults.layout, portfolioLayouts),
    visibility: choice(input.visibility ?? defaults.visibility, portfolioVisibilities),
    cover: reference(input.cover),
    credits: text(input.credits, 2000),
    startsOn: date(input.startsOn),
    endsOn: date(input.endsOn),
    tags: [...new Set(list(input.tags, 30).map((tag) => text(tag, 80)).filter(Boolean))],
    sourceRights: text(input.sourceRights, 2000),
    canonicalContent: reference(input.canonicalContent),
    relatedContent: [...new Set(list(input.relatedContent, 30).map(reference).filter(Boolean))],
    relatedProducts: [...new Set(list(input.relatedProducts, 30).map(reference).filter(Boolean))],
    sections: list(input.sections, 30).map((value) => {
      const section = record(value)
      return {
        id: entryId(section.id),
        title: text(section.title, 180),
        blocks: list(section.blocks, 100).map((value) => {
          const block = record(value)
          const kind = choice(block.kind, portfolioBlockKinds)
          const url = kind === 'embed' ? text(block.url, 1000) : ''
          const embed = url ? portfolioEmbed(url) : null
          if (url && !embed) throw new PortfolioError('Use a supported YouTube or Vimeo video URL.')
          return {
            id: entryId(block.id),
            kind,
            title: text(block.title, 180),
            text: kind === 'text' ? text(block.text, 10000) : '',
            media: ['image', 'audio', 'video'].includes(kind) ? reference(block.media) : '',
            url: embed?.link ?? '',
            alt: kind === 'image' ? text(block.alt, 500) : '',
            caption: text(block.caption, 2000),
            credit: text(block.credit, 300),
            rights: text(block.rights, 500),
          }
        }),
      }
    }),
  }
  if (!content.title) throw new PortfolioError('Enter a title.')
  if (keys.size > 150) throw new PortfolioError('Portfolio sections and blocks are limited to 150 entries.')
  if (content.startsOn && content.endsOn && content.startsOn > content.endsOn)
    throw new PortfolioError('The end date must be on or after the start date.')
  return content
}
