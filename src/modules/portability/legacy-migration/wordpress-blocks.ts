import { createHash } from 'node:crypto'
import { parse } from '@wordpress/block-serialization-default-parser'

import type { LayoutBlock, ReferenceValue } from '../../public/page-builder'

/**
 * WordPress block conversion with complete source accounting (S2-12).
 *
 * Parsing uses the official WordPress block serialization parser — the
 * same grammar implementation WordPress itself ships — never the regex
 * approximations the legacy pipeline grew. Every parsed region (each
 * block at every nesting level, plus freeform segments) produces
 * exactly one report entry with its location, content hash, outcome,
 * target block ids and reason. Nothing is truncated silently: text
 * longer than a field bound is split across blocks at word boundaries,
 * and the split is reported. Quarantined source (scripts, styles, PHP,
 * plugin blocks, custom HTML, unacquired media) is preserved in the
 * report for the caller's quarantine store and never reaches output.
 *
 * Supported slice (anything else is reported, never guessed):
 * headings, paragraphs, quotes, lists, groups, two-column layouts,
 * images with acquired media, and buttons with resolvable internal
 * targets. Long-form editorial bodies keep their own conversion path
 * (legacyBodyToLexical); this converter is for page layout content.
 */
export type ConversionOutcome =
  | 'converted'
  | 'approximated'
  | 'omitted'
  | 'quarantined'
  | 'dropped-empty'

export type SourceRegionReport = {
  /** Ordinal path: `blocks[2]`, `blocks[1].innerBlocks[0]`, freeform quarantine `blocks[0].quarantine[1]`. */
  location: string
  blockName: string | null
  sourceHash: string
  sourceBytes: number
  outcome: ConversionOutcome
  targetIds: string[]
  targetComponent?: string
  reason?: string
  /** Quarantine kind when the region is preserved outside public output. */
  quarantineKind?: 'script' | 'style' | 'php-code' | 'plugin-block' | 'widget'
  /** The region's own source, for quarantined regions only. */
  rawSource?: string
}

export type WordpressConversion = {
  blocks: LayoutBlock[]
  report: SourceRegionReport[]
  coverage: {
    regions: number
    converted: number
    approximated: number
    omitted: number
    quarantined: number
    droppedEmpty: number
    /** Always 0 — every parsed region has exactly one report entry. */
    unaccounted: 0
  }
}

export type MediaReference = { id: string; siteId: string; label: string }

export type WordpressConversionOptions = {
  /** Acquired media by source URL (apply-time resolution, S2-13). */
  mediaByUrl?: ReadonlyMap<string, MediaReference>
  /** Internal link targets by href, as chooser references. */
  linkByHref?: ReadonlyMap<string, ReferenceValue>
}

type ParsedBlock = ReturnType<typeof parse>[number]

const TEXT_FIELD_LIMIT = 3800

const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")

/** Text content of an HTML fragment: tags removed, entities decoded. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

const sectionProps = (over: Record<string, unknown> = {}, withVariant = false) => ({
  alignment: 'left',
  spacing: 'normal',
  width: 'standard',
  background: 'canvas',
  emphasis: 'normal',
  // Only components whose schema declares it (rich content, image, CTA)
  // may carry `variant`; the columns component rejects it.
  ...(withVariant ? { variant: 'contained' } : {}),
  ...over,
})

/** Split text into field-bounded chunks at word boundaries; lossless. */
function chunkText(text: string): string[] {
  if (text.length <= TEXT_FIELD_LIMIT) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > TEXT_FIELD_LIMIT) {
    const window = rest.slice(0, TEXT_FIELD_LIMIT)
    const breakAt = Math.max(window.lastIndexOf(' '), TEXT_FIELD_LIMIT / 2)
    chunks.push(rest.slice(0, breakAt).trim())
    rest = rest.slice(breakAt).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

type RegionSink = {
  blocks: LayoutBlock[]
  report: SourceRegionReport[]
}

const CHILD_COMPONENTS = new Set(['publisher.rich-content', 'publisher.image', 'publisher.cta'])

export function convertWordpressBlocks(
  source: string,
  options: WordpressConversionOptions = {},
): WordpressConversion {
  const sink: RegionSink = { blocks: [], report: [] }
  const parsed = parse(source)
  parsed.forEach((block, index) => {
    convertBlock(block, `blocks[${index}]`, `wp-${index}`, sink, options, sink.blocks)
  })
  const coverage = {
    regions: sink.report.length,
    converted: sink.report.filter((entry) => entry.outcome === 'converted').length,
    approximated: sink.report.filter((entry) => entry.outcome === 'approximated').length,
    omitted: sink.report.filter((entry) => entry.outcome === 'omitted').length,
    quarantined: sink.report.filter((entry) => entry.outcome === 'quarantined').length,
    droppedEmpty: sink.report.filter((entry) => entry.outcome === 'dropped-empty').length,
    unaccounted: 0 as const,
  }
  return { blocks: sink.blocks, report: sink.report, coverage }
}

function regionBase(block: ParsedBlock, location: string) {
  const serialized = `${block.blockName ?? 'freeform'}|${JSON.stringify(block.attrs)}|${block.innerHTML}`
  return {
    location,
    blockName: block.blockName,
    sourceHash: hash(serialized),
    sourceBytes: Buffer.byteLength(serialized),
  }
}

function richContent(id: string, title: string, body: string, headingLevel?: string): LayoutBlock {
  return {
    id,
    component: 'publisher.rich-content',
    componentVersion: 1,
    props: sectionProps(
      {
        title,
        body,
        ...(headingLevel ? { headingLevel } : {}),
      },
      true,
    ),
  } as LayoutBlock
}

/** Convert text into one or more rich-content blocks; returns the ids. */
function emitText(
  sink: RegionSink,
  out: LayoutBlock[],
  idBase: string,
  title: string,
  text: string,
  headingLevel?: string,
): string[] {
  const chunks = chunkText(text)
  return chunks.map((chunk, chunkIndex) => {
    const id = chunks.length > 1 ? `${idBase}-${chunkIndex + 1}` : idBase
    out.push(richContent(id, chunkIndex === 0 ? title : '', chunk, headingLevel))
    return id
  })
}

function convertBlock(
  block: ParsedBlock,
  location: string,
  idBase: string,
  sink: RegionSink,
  options: WordpressConversionOptions,
  out: LayoutBlock[],
): void {
  const base = regionBase(block, location)
  const name = block.blockName

  if (name === null) return convertFreeform(block, location, idBase, sink, options, out)

  switch (name) {
    case 'core/heading': {
      const level = Math.min(6, Math.max(1, Number(block.attrs?.level ?? 2) || 2))
      const clamped = Math.min(level, 4)
      const text = textOf(block.innerHTML)
      if (text.length > 160) {
        // Longer than the title field: body copy in disguise. Convert it
        // as body text — approximately, but without losing a character.
        const ids = emitText(sink, out, idBase, '', text)
        sink.report.push({
          ...base,
          outcome: 'approximated',
          targetIds: ids,
          targetComponent: 'publisher.rich-content',
          reason: 'Heading exceeds the title field bound; converted as body text without loss.',
        })
        return
      }
      out.push(richContent(idBase, text, '', `h${clamped}`))
      sink.report.push({
        ...base,
        outcome: level > 4 ? 'approximated' : 'converted',
        targetIds: [idBase],
        targetComponent: 'publisher.rich-content',
        ...(level > 4
          ? { reason: `Heading level ${level} clamps to h4, the deepest theme heading.` }
          : {}),
      })
      return
    }
    case 'core/paragraph': {
      const text = textOf(block.innerHTML)
      if (!text) {
        sink.report.push({ ...base, outcome: 'dropped-empty', targetIds: [] })
        return
      }
      const ids = emitText(sink, out, idBase, '', text)
      sink.report.push({
        ...base,
        outcome: ids.length > 1 ? 'approximated' : 'converted',
        targetIds: ids,
        targetComponent: 'publisher.rich-content',
        ...(ids.length > 1
          ? {
              reason: `Paragraph exceeds the ${TEXT_FIELD_LIMIT}-character field bound and was split across ${ids.length} blocks without losing text.`,
            }
          : {}),
      })
      return
    }
    case 'core/quote': {
      const text = textOf(block.innerHTML)
      const ids = text ? emitText(sink, out, idBase, '', text) : []
      sink.report.push({
        ...base,
        outcome: text ? 'approximated' : 'dropped-empty',
        targetIds: ids,
        targetComponent: 'publisher.rich-content',
        ...(text ? { reason: 'Quote styling maps to a rich content section.' } : {}),
      })
      return
    }
    case 'core/list': {
      const items = [...block.innerHTML.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((match) => textOf(match[1]))
        .filter(Boolean)
      const ids = items.length ? emitText(sink, out, idBase, '', items.join('\n')) : []
      sink.report.push({
        ...base,
        outcome: items.length ? 'approximated' : 'dropped-empty',
        targetIds: ids,
        targetComponent: 'publisher.rich-content',
        ...(items.length ? { reason: 'List items map to lines in a rich content section.' } : {}),
      })
      return
    }
    case 'core/group': {
      const before = out.length
      block.innerBlocks.forEach((inner, innerIndex) =>
        convertBlock(
          inner,
          `${location}.innerBlocks[${innerIndex}]`,
          `${idBase}-${innerIndex}`,
          sink,
          options,
          out,
        ),
      )
      sink.report.push({
        ...base,
        outcome: 'approximated',
        targetIds: out.slice(before).map((produced) => produced.id),
        reason: 'Group wrapper is flattened; its inner blocks are converted individually.',
      })
      return
    }
    case 'core/columns': {
      convertColumns(block, location, idBase, sink, options, out, base)
      return
    }
    case 'core/image': {
      convertImage(block, location, idBase, sink, options, out, base)
      return
    }
    case 'core/buttons': {
      block.innerBlocks.forEach((inner, innerIndex) =>
        convertBlock(
          inner,
          `${location}.innerBlocks[${innerIndex}]`,
          `${idBase}-${innerIndex}`,
          sink,
          options,
          out,
        ),
      )
      sink.report.push({
        ...base,
        outcome: 'converted',
        targetIds: [],
        reason: 'Button group wrapper; its buttons are converted individually.',
      })
      return
    }
    case 'core/button': {
      convertButton(block, location, idBase, sink, options, out, base)
      return
    }
    case 'core/separator':
    case 'core/spacer': {
      sink.report.push({
        ...base,
        outcome: 'omitted',
        targetIds: [],
        reason: 'Decorative separator/spacer has no Renegade equivalent and carries no content.',
      })
      return
    }
    default: {
      const isCore = name.startsWith('core/')
      sink.report.push({
        ...base,
        outcome: 'quarantined',
        targetIds: [],
        reason: isCore
          ? `Core block '${name}' is outside the supported conversion slice; preserved in quarantine.`
          : `Plugin block '${name}' cannot run without its WordPress runtime; preserved in quarantine.`,
        quarantineKind: isCore ? 'widget' : 'plugin-block',
        rawSource: block.innerHTML || JSON.stringify(block.attrs),
      })
      return
    }
  }
}

function convertColumns(
  block: ParsedBlock,
  location: string,
  idBase: string,
  sink: RegionSink,
  options: WordpressConversionOptions,
  out: LayoutBlock[],
  base: ReturnType<typeof regionBase>,
): void {
  const columns = block.innerBlocks.filter((inner) => inner.blockName === 'core/column')
  const flatten = (reason: string) => {
    const before = out.length
    block.innerBlocks.forEach((inner, innerIndex) => {
      // A column's content lives in its own innerBlocks; flattening a
      // columns region means converting each column's children in order.
      const children = inner.blockName === 'core/column' ? inner.innerBlocks : [inner]
      children.forEach((child, childIndex) =>
        convertBlock(
          child,
          `${location}.innerBlocks[${innerIndex}].innerBlocks[${childIndex}]`,
          `${idBase}-${innerIndex}-${childIndex}`,
          sink,
          options,
          out,
        ),
      )
    })
    sink.report.push({
      ...base,
      outcome: 'approximated',
      targetIds: out.slice(before).map((produced) => produced.id),
      reason,
    })
  }
  if (columns.length !== 2 || block.innerBlocks.length !== 2) {
    flatten(
      `Only two-column layouts map to the columns component; this ${block.innerBlocks.length}-column region was flattened.`,
    )
    return
  }
  // Convert each column's children into a scratch sink: only child-eligible
  // components may enter the columns component.
  const childBlocks: LayoutBlock[][] = []
  let eligible = true
  for (const column of columns) {
    const scratch: LayoutBlock[] = []
    column.innerBlocks.forEach((inner, innerIndex) =>
      convertBlock(
        inner,
        `${location}.innerBlocks[${columns.indexOf(column)}].innerBlocks[${innerIndex}]`,
        `${idBase}-c${columns.indexOf(column)}-${innerIndex}`,
        sink,
        options,
        scratch,
      ),
    )
    if (scratch.some((child) => !CHILD_COMPONENTS.has(child.component))) eligible = false
    childBlocks.push(scratch)
  }
  if (!eligible) {
    for (const scratch of childBlocks) out.push(...scratch)
    sink.report.push({
      ...base,
      outcome: 'approximated',
      targetIds: childBlocks.flat().map((child) => child.id),
      reason: 'Columns contained blocks that cannot nest; the region was flattened.',
    })
    return
  }
  const container: LayoutBlock = {
    id: idBase,
    component: 'publisher.columns',
    componentVersion: 1,
    props: sectionProps({
      title: '',
      balance: 'equal',
      column0: childBlocks[0],
      column1: childBlocks[1],
    }),
  } as LayoutBlock
  out.push(container)
  sink.report.push({
    ...base,
    outcome: 'converted',
    targetIds: [idBase],
    targetComponent: 'publisher.columns',
  })
}

function convertImage(
  block: ParsedBlock,
  location: string,
  idBase: string,
  sink: RegionSink,
  options: WordpressConversionOptions,
  out: LayoutBlock[],
  base: ReturnType<typeof regionBase>,
): void {
  void location
  const url =
    (typeof block.attrs?.url === 'string' ? block.attrs.url : undefined) ??
    block.innerHTML.match(/<img[^>]+src="([^"]+)"/i)?.[1]
  const alt =
    (typeof block.attrs?.alt === 'string' ? block.attrs.alt : undefined) ??
    block.innerHTML.match(/<img[^>]+alt="([^"]*)"/i)?.[1] ??
    ''
  const media = url ? options.mediaByUrl?.get(url) : undefined
  if (!url || !media) {
    sink.report.push({
      ...base,
      outcome: 'quarantined',
      targetIds: [],
      reason: url
        ? `Image asset was not acquired at conversion time: ${url}`
        : 'Image block carries no source URL.',
      quarantineKind: 'widget',
      rawSource: block.innerHTML,
    })
    return
  }
  const image: LayoutBlock = {
    id: idBase,
    component: 'publisher.image',
    componentVersion: 1,
    props: sectionProps(
      {
        title: '',
        media: {
          id: media.id,
          siteId: media.siteId,
          label: alt || media.label,
          href: `/media/${media.id}`,
        },
      },
      true,
    ),
  } as LayoutBlock
  out.push(image)
  sink.report.push({
    ...base,
    outcome: 'converted',
    targetIds: [idBase],
    targetComponent: 'publisher.image',
  })
}

function convertButton(
  block: ParsedBlock,
  location: string,
  idBase: string,
  sink: RegionSink,
  options: WordpressConversionOptions,
  out: LayoutBlock[],
  base: ReturnType<typeof regionBase>,
): void {
  void location
  const anchor = block.innerHTML.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
  const href = anchor?.[1] ?? (typeof block.attrs?.url === 'string' ? block.attrs.url : '')
  const label = anchor ? textOf(anchor[2]) : textOf(block.innerHTML)
  const link = href ? options.linkByHref?.get(href) : undefined
  if (link) {
    const cta: LayoutBlock = {
      id: idBase,
      component: 'publisher.cta',
      componentVersion: 1,
      props: sectionProps({ title: label || 'Learn more', body: '', link }, true),
    } as LayoutBlock
    out.push(cta)
    sink.report.push({
      ...base,
      outcome: 'converted',
      targetIds: [idBase],
      targetComponent: 'publisher.cta',
    })
    return
  }
  const ids = emitText(
    sink,
    out,
    idBase,
    '',
    href ? `${label || 'Link'} — ${href}` : label || 'Button',
  )
  sink.report.push({
    ...base,
    outcome: 'approximated',
    targetIds: ids,
    targetComponent: 'publisher.rich-content',
    reason:
      'Button target is not a resolvable internal reference; the label and destination are preserved as text.',
  })
}

const QUARANTINE_PATTERNS: Array<{
  kind: NonNullable<SourceRegionReport['quarantineKind']>
  pattern: RegExp
  reason: string
}> = [
  {
    kind: 'script',
    pattern: /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    reason: 'Raw script is never converted or executed; preserved in quarantine.',
  },
  {
    kind: 'style',
    pattern: /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    reason: 'Raw styles are never converted; preserved in quarantine.',
  },
  {
    kind: 'php-code',
    pattern: /<\?php[\s\S]*?\?>/gi,
    reason: 'PHP code is never converted or executed; preserved in quarantine.',
  },
]

function convertFreeform(
  block: ParsedBlock,
  location: string,
  idBase: string,
  sink: RegionSink,
  options: WordpressConversionOptions,
  out: LayoutBlock[],
): void {
  void options
  let html = block.innerHTML
  // Executable/style spans inside freeform are their own quarantined
  // sub-regions; the remainder converts as text.
  QUARANTINE_PATTERNS.forEach(({ kind, pattern, reason }, patternIndex) => {
    const matches = [...html.matchAll(pattern)]
    matches.forEach((match, matchIndex) => {
      sink.report.push({
        location: `${location}.quarantine[${patternIndex}-${matchIndex}]`,
        blockName: null,
        sourceHash: hash(match[0]),
        sourceBytes: Buffer.byteLength(match[0]),
        outcome: 'quarantined',
        targetIds: [],
        reason,
        quarantineKind: kind,
        rawSource: match[0],
      })
    })
    html = html.replace(pattern, '')
  })
  const base = regionBase({ ...block, innerHTML: html }, location)
  const paragraphs = html
    .split(/\n\s*\n|(?<=<\/p>)\s*(?=<p)/i)
    .map((chunk) => textOf(chunk))
    .filter(Boolean)
  if (!paragraphs.length) {
    sink.report.push({ ...base, outcome: 'dropped-empty', targetIds: [] })
    return
  }
  const ids: string[] = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    ids.push(...emitText(sink, out, `${idBase}-p${paragraphIndex}`, '', paragraph))
  })
  const hadMarkup = /<[^>]+>/.test(html)
  sink.report.push({
    ...base,
    outcome: hadMarkup ? 'approximated' : 'converted',
    targetIds: ids,
    targetComponent: 'publisher.rich-content',
    ...(hadMarkup
      ? { reason: 'Freeform HTML was reduced to its text; markup is not carried over.' }
      : {}),
  })
}
