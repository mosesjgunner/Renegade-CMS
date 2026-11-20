/**
 * POD-01 — structural Podcasting 2.0 feed validation (POD-REQ-05).
 *
 * Replaces the regex spot-checks that used to live in
 * `src/modules/media/publishing.ts` with a real parse: a compact,
 * dependency-free XML parser builds an element tree (attributes, text and
 * CDATA handled; entity references decoded and validated, so a raw `&` or an
 * unclosed tag fails the parse), and the checks below walk that tree.
 *
 * Core RSS checks (declaration, <rss>/<channel>, per-item enclosure
 * presence/length/audio type) always run. The Podcasting 2.0 namespace
 * checks (podcast:guid format, podcast:locked presence, episode GUID
 * presence + uniqueness, podcast:value splits, podcast:liveItem attributes,
 * podcast:transcript / podcast:person shape) run when the feed declares
 * `xmlns:podcast` — feeds that never claimed the namespace are held to the
 * RSS contract only, which keeps legacy validation callers honest.
 *
 * POD-RC-01 (Step 02) — three separate questions, three separate answers:
 * `valid`/`errors` say whether the XML and its enclosures are sound;
 * `prerequisites` lists what a podcast DIRECTORY additionally needs
 * before it will list the show (channel artwork, at least one episode,
 * an <itunes:owner> email when ownership verification is wanted). An
 * unmet prerequisite never flips `valid` — a structurally sound feed can
 * still be unlistable. Whether a directory actually ACCEPTS a submitted
 * feed is the directory's own decision and is never claimed here.
 */

export type XmlNode = {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(raw: string): string {
  let out = ''
  let index = 0
  while (index < raw.length) {
    const amp = raw.indexOf('&', index)
    if (amp === -1) {
      out += raw.slice(index)
      break
    }
    out += raw.slice(index, amp)
    const semi = raw.indexOf(';', amp)
    if (semi === -1 || semi - amp > 12) {
      throw new Error(
        `Invalid entity reference at offset ${amp}: raw "&" must be escaped as &amp;.`,
      )
    }
    const body = raw.slice(amp + 1, semi)
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      if (!Number.isFinite(code)) throw new Error(`Invalid character reference "&${body};".`)
      out += String.fromCodePoint(code)
    } else if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code)) throw new Error(`Invalid character reference "&${body};".`)
      out += String.fromCodePoint(code)
    } else if (body in ENTITIES) {
      out += ENTITIES[body]
    } else {
      throw new Error(`Unknown entity reference "&${body};".`)
    }
    index = semi + 1
  }
  return out
}

/** Parse XML into an element tree. Throws with a named message on any malformation. */
export function parseXml(xmlText: string): XmlNode {
  let index = 0
  const length = xmlText.length
  const fail = (message: string): never => {
    throw new Error(`Malformed XML: ${message}`)
  }
  const skipMisc = () => {
    for (;;) {
      while (index < length && /\s/.test(xmlText[index]!)) index++
      if (xmlText.startsWith('<?', index)) {
        const end = xmlText.indexOf('?>', index + 2)
        if (end === -1) fail('unterminated processing instruction.')
        index = end + 2
      } else if (xmlText.startsWith('<!--', index)) {
        const end = xmlText.indexOf('-->', index + 4)
        if (end === -1) fail('unterminated comment.')
        index = end + 3
      } else if (xmlText.startsWith('<!DOCTYPE', index)) {
        const end = xmlText.indexOf('>', index + 9)
        if (end === -1) fail('unterminated DOCTYPE.')
        index = end + 1
      } else {
        return
      }
    }
  }
  const parseElement = (): XmlNode => {
    // xmlText[index] === '<' and this is an opening tag.
    index++
    const nameStart = index
    while (index < length && /[\w:.-]/.test(xmlText[index]!)) index++
    const name = xmlText.slice(nameStart, index)
    if (!name) fail(`expected an element name at offset ${nameStart}.`)
    const attrs: Record<string, string> = {}
    for (;;) {
      while (index < length && /\s/.test(xmlText[index]!)) index++
      if (index >= length) fail(`unterminated opening tag <${name}>.`)
      if (xmlText.startsWith('/>', index)) {
        index += 2
        return { name, attrs, children: [], text: '' }
      }
      if (xmlText[index] === '>') {
        index++
        break
      }
      const attrStart = index
      while (index < length && /[\w:.-]/.test(xmlText[index]!)) index++
      const attrName = xmlText.slice(attrStart, index)
      if (!attrName) fail(`expected an attribute name in <${name}> at offset ${attrStart}.`)
      while (index < length && /\s/.test(xmlText[index]!)) index++
      if (xmlText[index] !== '=') fail(`expected "=" after attribute "${attrName}" in <${name}>.`)
      index++
      while (index < length && /\s/.test(xmlText[index]!)) index++
      const quote = xmlText[index]
      if (quote !== '"' && quote !== "'")
        fail(`attribute "${attrName}" in <${name}> must be quoted.`)
      const valueStart = ++index
      const valueEnd = xmlText.indexOf(quote, index)
      if (valueEnd === -1) fail(`unterminated attribute "${attrName}" in <${name}>.`)
      const rawValue = xmlText.slice(valueStart, valueEnd)
      if (rawValue.includes('<')) fail(`attribute "${attrName}" in <${name}> contains a raw "<".`)
      attrs[attrName] = decodeEntities(rawValue)
      index = valueEnd + 1
    }
    const children: XmlNode[] = []
    let text = ''
    for (;;) {
      if (index >= length) fail(`unclosed element <${name}>.`)
      if (xmlText.startsWith('</', index)) {
        const end = xmlText.indexOf('>', index + 2)
        if (end === -1) fail(`unterminated closing tag for <${name}>.`)
        const closing = xmlText.slice(index + 2, end).trim()
        if (closing !== name) fail(`mismatched closing tag </${closing}>; expected </${name}>.`)
        index = end + 1
        return { name, attrs, children, text: text.trim() }
      }
      if (xmlText.startsWith('<![CDATA[', index)) {
        const end = xmlText.indexOf(']]>', index + 9)
        if (end === -1) fail(`unterminated CDATA section in <${name}>.`)
        text += xmlText.slice(index + 9, end)
        index = end + 3
        continue
      }
      if (xmlText.startsWith('<!--', index)) {
        const end = xmlText.indexOf('-->', index + 4)
        if (end === -1) fail('unterminated comment.')
        index = end + 3
        continue
      }
      if (xmlText[index] === '<') {
        children.push(parseElement())
        continue
      }
      const nextTag = xmlText.indexOf('<', index)
      const rawText = xmlText.slice(index, nextTag === -1 ? length : nextTag)
      text += decodeEntities(rawText)
      index = nextTag === -1 ? length : nextTag
    }
  }
  skipMisc()
  if (index >= length || xmlText[index] !== '<' || xmlText.startsWith('</', index)) {
    fail('no root element found.')
  }
  const root = parseElement()
  skipMisc()
  if (index < length) fail('content found after the root element.')
  return root
}

const childrenNamed = (node: XmlNode, name: string) => node.children.filter((c) => c.name === name)
const firstChild = (node: XmlNode, name: string) => node.children.find((c) => c.name === name)
const descendantsNamed = (node: XmlNode, name: string): XmlNode[] => {
  const found: XmlNode[] = []
  const walk = (current: XmlNode) => {
    for (const child of current.children) {
      if (child.name === name) found.push(child)
      walk(child)
    }
  }
  walk(node)
  return found
}

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg']
const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIVE_STATUSES = ['pending', 'live', 'ended']

export type PodcastFeedInspection = {
  valid: boolean
  errors: string[]
  warnings: string[]
  /**
   * Directory prerequisites NOT yet met (POD-RC-01): reported separately
   * from `errors`. A feed can be `valid` and still have unmet
   * prerequisites; meeting them all still does not guarantee a directory
   * accepts the show — acceptance is the directory's decision.
   */
  prerequisites: string[]
  counts: { items: number; liveItems: number; enclosures: number; persons: number }
  enclosureLength?: number
  enclosureType?: string
}

export type PodcastFeedInspectionOptions = {
  /**
   * Set when the operator wants directory ownership verification: the
   * absence of a usable <itunes:owner><itunes:email> is then reported
   * as an unmet prerequisite. Off by default — publishing an owner
   * email is an explicit opt-in, never a requirement to be valid.
   */
  requireOwnerEmail?: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Non-throwing structural inspection; `validatePodcastFeed` is the throwing wrapper. */
export function inspectPodcastFeed(
  xmlText: string,
  options: PodcastFeedInspectionOptions = {},
): PodcastFeedInspection {
  const errors: string[] = []
  const warnings: string[] = []
  const prerequisites: string[] = []
  const counts = { items: 0, liveItems: 0, enclosures: 0, persons: 0 }
  let enclosureLength: number | undefined
  let enclosureType: string | undefined

  if (!xmlText.startsWith('<?xml')) errors.push('Missing XML declaration.')

  let root: XmlNode | undefined
  try {
    root = parseXml(xmlText)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Malformed XML.')
    return { valid: false, errors, warnings, prerequisites, counts }
  }

  if (root.name !== 'rss') {
    errors.push('Missing <rss> root.')
    return { valid: false, errors, warnings, prerequisites, counts }
  }
  const channel = firstChild(root, 'channel')
  if (!channel) {
    errors.push('Missing <channel> element.')
    return { valid: false, errors, warnings, prerequisites, counts }
  }

  const items = childrenNamed(channel, 'item')
  const liveItems = childrenNamed(channel, 'podcast:liveItem')
  counts.items = items.length
  counts.liveItems = liveItems.length
  counts.persons = descendantsNamed(channel, 'podcast:person').length
  if (!items.length && !liveItems.length) warnings.push('Feed contains no episodes yet.')

  items.forEach((item, position) => {
    const label = `Item ${position + 1}`
    const enclosure = firstChild(item, 'enclosure')
    if (!enclosure) {
      errors.push(`${label} is missing an enclosure.`)
      return
    }
    counts.enclosures++
    // POD-RC-01: the URL itself is part of validity. Before this check a
    // feed whose enclosure carried a length and type but NO url came
    // back valid — a false green directories would have rejected.
    const enclosureUrl = (enclosure.attrs.url ?? '').trim()
    if (!enclosureUrl) {
      errors.push(`${label} is missing an enclosure URL.`)
    } else {
      let parsed: URL | undefined
      try {
        parsed = new URL(enclosureUrl)
      } catch {
        parsed = undefined
      }
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        errors.push(`${label} enclosure URL "${enclosureUrl}" is not a valid http(s) URL.`)
      }
    }
    const length = Number(enclosure.attrs.length)
    if (!enclosure.attrs.length || !Number.isFinite(length) || length < 1) {
      errors.push(`${label} enclosure length must be at least 1.`)
    }
    if (!AUDIO_TYPES.includes(enclosure.attrs.type ?? '')) {
      errors.push(
        `${label} enclosure type "${enclosure.attrs.type ?? ''}" is not a supported audio type.`,
      )
    }
    if (enclosureLength === undefined) {
      enclosureLength = length
      enclosureType = enclosure.attrs.type
    }
  })

  // Directory prerequisites (POD-RC-01): separate from validity above.
  // An empty feed is well-formed XML — it is simply not listable yet —
  // so it is reported here, not as a structural error.
  const artwork = firstChild(channel, 'itunes:image')
  if (!artwork || !(artwork.attrs.href ?? '').trim()) {
    prerequisites.push(
      'Missing channel artwork: directories require an <itunes:image> before they will list a show.',
    )
  }
  if (!items.length && !liveItems.length) {
    prerequisites.push(
      'Feed has no episodes yet: directories list a show only once at least one episode is published.',
    )
  }
  const ownerElement = firstChild(channel, 'itunes:owner')
  const ownerEmailValue = ownerElement ? (firstChild(ownerElement, 'itunes:email')?.text ?? '') : ''
  if (ownerElement && ownerEmailValue && !EMAIL_PATTERN.test(ownerEmailValue)) {
    warnings.push(
      `The <itunes:owner> email "${ownerEmailValue}" does not look like an email address; directories will not be able to verify ownership with it.`,
    )
  }
  if (options.requireOwnerEmail && !EMAIL_PATTERN.test(ownerEmailValue)) {
    prerequisites.push(
      'No usable <itunes:owner> email: set the show\u2019s directory owner email so directories can verify ownership.',
    )
  }

  const podcastDeclared = typeof root.attrs['xmlns:podcast'] === 'string'
  if (podcastDeclared) {
    const channelGuid = firstChild(channel, 'podcast:guid')
    if (!channelGuid || !channelGuid.text) {
      errors.push('Missing <podcast:guid> element.')
    } else if (!UUID_V5_PATTERN.test(channelGuid.text)) {
      errors.push(`podcast:guid "${channelGuid.text}" is not a valid UUIDv5.`)
    }

    const locked = firstChild(channel, 'podcast:locked')
    if (!locked) {
      errors.push('Missing <podcast:locked> element.')
    } else if (!['yes', 'no'].includes(locked.text)) {
      errors.push('podcast:locked must be "yes" or "no".')
    }

    const seenGuids = new Map<string, string>()
    const checkGuid = (holder: XmlNode, label: string) => {
      const guid = firstChild(holder, 'guid')
      if (!guid || !guid.text) {
        errors.push(`${label} is missing a <guid>.`)
        return
      }
      const previous = seenGuids.get(guid.text)
      if (previous) {
        errors.push(`Duplicate GUID "${guid.text}" in feed items (${previous} and ${label}).`)
      } else {
        seenGuids.set(guid.text, label)
      }
    }
    items.forEach((item, position) => checkGuid(item, `Item ${position + 1}`))
    liveItems.forEach((liveItem, position) => checkGuid(liveItem, `Live item ${position + 1}`))

    for (const value of descendantsNamed(channel, 'podcast:value')) {
      const recipients = childrenNamed(value, 'podcast:valueRecipient')
      if (!recipients.length) {
        errors.push('podcast:value has no valueRecipient entries.')
        continue
      }
      let sum = 0
      for (const recipient of recipients) {
        for (const attr of ['name', 'type', 'address', 'split']) {
          if (!recipient.attrs[attr]) {
            errors.push(`podcast:valueRecipient is missing the "${attr}" attribute.`)
          }
        }
        sum += Number(recipient.attrs.split ?? 0)
      }
      if (sum !== 100) {
        errors.push(`podcast:value recipient splits sum to ${sum}, not 100.`)
      }
    }

    for (const transcript of descendantsNamed(channel, 'podcast:transcript')) {
      if (!transcript.attrs.url || !transcript.attrs.type) {
        errors.push('podcast:transcript is missing the required "url" or "type" attribute.')
      }
    }
    for (const person of descendantsNamed(channel, 'podcast:person')) {
      if (!person.text) errors.push('podcast:person is missing a name.')
    }

    liveItems.forEach((liveItem, position) => {
      const label = `Live item ${position + 1}`
      const status = liveItem.attrs.status ?? ''
      if (!LIVE_STATUSES.includes(status)) {
        errors.push(`${label} status "${status}" is invalid (expected pending, live, or ended).`)
      }
      const start = liveItem.attrs.start
      if (!start || Number.isNaN(Date.parse(start))) {
        errors.push(`${label} is missing a valid "start" attribute.`)
      }
      if (
        status === 'ended' &&
        (!liveItem.attrs.end || Number.isNaN(Date.parse(liveItem.attrs.end)))
      ) {
        errors.push(`${label} with status "ended" requires a valid "end" attribute.`)
      }
      const enclosure = firstChild(liveItem, 'enclosure')
      if (enclosure) counts.enclosures++
      if (!enclosure?.attrs.url && !firstChild(liveItem, 'podcast:alternateEnclosure')) {
        errors.push(`${label} is missing an enclosure URL.`)
      }
      if (!firstChild(liveItem, 'podcast:contentLink')) {
        warnings.push(`${label} has no podcast:contentLink (web fallback player).`)
      }
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    prerequisites,
    counts,
    enclosureLength,
    enclosureType,
  }
}

/**
 * Throwing validator kept for the existing call signature: returns
 * `{ valid: true, enclosureLength, enclosureType }` for the first item
 * enclosure, or throws `Podcast feed validation failed: <named errors>`
 * with the full per-error list attached as `error.errors`.
 */
export function validatePodcastFeed(xmlText: string, options: PodcastFeedInspectionOptions = {}) {
  const inspection = inspectPodcastFeed(xmlText, options)
  if (!inspection.valid) {
    const error = new Error(
      `Podcast feed validation failed: ${inspection.errors.join(', ')}`,
    ) as Error & { errors?: string[]; warnings?: string[]; prerequisites?: string[] }
    error.errors = inspection.errors
    error.warnings = inspection.warnings
    error.prerequisites = inspection.prerequisites
    throw error
  }
  return {
    valid: true as const,
    enclosureLength: inspection.enclosureLength ?? 0,
    enclosureType: inspection.enclosureType ?? '',
  }
}
