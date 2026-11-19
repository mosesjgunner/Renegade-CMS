import {
  assertArray,
  assertBoolean,
  assertFiniteNumber,
  assertNonEmptyString,
  assertNonNegativeTime,
  assertOptionalString,
  assertRecord,
  assertString,
  assertVersion1,
  coerceInput,
  requireField,
  requirePresentField,
} from './validation'

/**
 * StudioSession v1 — the Podcast Studio session contract (POD-00).
 *
 * Core shape is the PT-E prototype fixture
 * (`tests/fixtures/podcast-studio/session-pt-e.json`): rundown, cartwall
 * banks/clips and a mixer snapshot, plus chapters, markers and the session
 * log. The PT-E prototype predates versioning, so the v1 envelope adds the
 * required `version: 1` and `showId` fields on top of that shape.
 *
 * Optional extensions (`players`, `liveState`, `deviceRoles`, and any other
 * extra field at any level) are allowed and preserved verbatim: the parser
 * validates known fields and never strips unknown ones, so a
 * parse -> serialize round trip is lossless.
 */

export type StudioSessionState =
  | 'draft'
  | 'ready'
  | 'live'
  | 'paused'
  | 'recording'
  | 'stopped'
  | 'ended'
  | string

export type RundownItemType = 'segment' | 'clip' | 'guest' | 'link' | 'note' | 'section' | string

export type RundownItemStatus = 'pending' | 'playing' | 'done' | 'skipped' | string

export type StudioRundownItem = {
  id: string
  type: RundownItemType
  title: string
  plannedSec: number
  actualSec: number | null
  status: RundownItemStatus
  clipId?: string
  url?: string
  startedAtElapsedSec?: number
}

export type CartClipState = 'idle' | 'playing' | 'paused' | 'played' | string

export type StudioCartClip = {
  id: string
  title: string
  cueInSec: number
  cueOutSec: number
  fadeInSec: number
  fadeOutSec: number
  loop: boolean
  armed: boolean
  state: CartClipState
}

export type StudioCartBank = {
  id: string
  name: string
  clips: StudioCartClip[]
}

export type StudioCartwall = {
  banks: StudioCartBank[]
}

export type StudioMixerChannel = {
  id: string
  gainDb: number
  muted: boolean
}

export type StudioMixerSnapshot = {
  channels: StudioMixerChannel[]
  masterGainDb: number
  limiterCeilingDb: number
}

export type StudioChapter = {
  /** PT-E chapter markers carry `startTime`; `start` is accepted as an alias. */
  startTime?: number
  start?: number
  title: string
  rundownItemId?: string
}

export type StudioMarker = {
  startTime?: number
  atElapsedSec?: number
  start?: number
  title?: string
  label?: string
  type?: string
}

export type StudioLogEntry = {
  type: string
  atElapsedSec?: number
  [key: string]: unknown
}

export type StudioSession = {
  version: 1
  id: string
  showId: string
  showTitle: string
  state: StudioSessionState
  elapsedSec: number
  rundown: StudioRundownItem[]
  cartwall: StudioCartwall
  mixer: StudioMixerSnapshot
  chapters: StudioChapter[]
  markers?: StudioMarker[]
  log: StudioLogEntry[]
  /** Optional extensions (POD-05+): preserved verbatim, not yet interpreted. */
  players?: unknown
  liveState?: unknown
  deviceRoles?: unknown
}

const assertChapterLike = (value: unknown, label: string, requireTitle: boolean) => {
  const chapter = assertRecord(value, label)
  const time = chapter.startTime ?? chapter.start ?? chapter.atElapsedSec
  if (time === undefined) throw new Error(`${label} must carry a start time.`)
  assertNonNegativeTime(time, `${label} start time`)
  if (requireTitle) assertString(requireField(chapter, 'title', label), `${label}.title`)
  else {
    assertOptionalString(chapter.title, `${label}.title`)
    assertOptionalString(chapter.label, `${label}.label`)
  }
  assertOptionalString(chapter.rundownItemId, `${label}.rundownItemId`)
}

export const parseStudioSession = (value: unknown): StudioSession => {
  const session = coerceInput(value, 'StudioSession')
  assertVersion1(session, 'StudioSession')
  assertNonEmptyString(requireField(session, 'id', 'StudioSession'), 'StudioSession.id')
  assertNonEmptyString(requireField(session, 'showId', 'StudioSession'), 'StudioSession.showId')
  assertString(requireField(session, 'showTitle', 'StudioSession'), 'StudioSession.showTitle')
  assertNonEmptyString(requireField(session, 'state', 'StudioSession'), 'StudioSession.state')
  assertNonNegativeTime(
    requireField(session, 'elapsedSec', 'StudioSession'),
    'StudioSession.elapsedSec',
  )

  const rundown = assertArray(
    requireField(session, 'rundown', 'StudioSession'),
    'StudioSession.rundown',
  )
  rundown.forEach((entry, index) => {
    const label = `StudioSession.rundown[${index}]`
    const item = assertRecord(entry, label)
    assertNonEmptyString(requireField(item, 'id', label), `${label}.id`)
    assertNonEmptyString(requireField(item, 'type', label), `${label}.type`)
    assertString(requireField(item, 'title', label), `${label}.title`)
    assertNonNegativeTime(requireField(item, 'plannedSec', label), `${label}.plannedSec`)
    const actual = requirePresentField(item, 'actualSec', label)
    if (actual !== null) assertNonNegativeTime(actual, `${label}.actualSec`)
    assertNonEmptyString(requireField(item, 'status', label), `${label}.status`)
    assertOptionalString(item.clipId, `${label}.clipId`)
    assertOptionalString(item.url, `${label}.url`)
    if (item.startedAtElapsedSec !== undefined)
      assertNonNegativeTime(item.startedAtElapsedSec, `${label}.startedAtElapsedSec`)
  })

  const cartwall = assertRecord(
    requireField(session, 'cartwall', 'StudioSession'),
    'StudioSession.cartwall',
  )
  const banks = assertArray(
    requireField(cartwall, 'banks', 'StudioSession.cartwall'),
    'cartwall.banks',
  )
  banks.forEach((entry, bankIndex) => {
    const bankLabel = `StudioSession.cartwall.banks[${bankIndex}]`
    const bank = assertRecord(entry, bankLabel)
    assertNonEmptyString(requireField(bank, 'id', bankLabel), `${bankLabel}.id`)
    assertString(requireField(bank, 'name', bankLabel), `${bankLabel}.name`)
    const clips = assertArray(requireField(bank, 'clips', bankLabel), `${bankLabel}.clips`)
    clips.forEach((clipEntry, clipIndex) => {
      const label = `${bankLabel}.clips[${clipIndex}]`
      const clip = assertRecord(clipEntry, label)
      assertNonEmptyString(requireField(clip, 'id', label), `${label}.id`)
      assertString(requireField(clip, 'title', label), `${label}.title`)
      const cueIn = assertNonNegativeTime(
        requireField(clip, 'cueInSec', label),
        `${label}.cueInSec`,
      )
      const cueOut = assertNonNegativeTime(
        requireField(clip, 'cueOutSec', label),
        `${label}.cueOutSec`,
      )
      if (cueOut < cueIn) throw new Error(`${label}.cueOutSec must not precede cueInSec.`)
      assertNonNegativeTime(requireField(clip, 'fadeInSec', label), `${label}.fadeInSec`)
      assertNonNegativeTime(requireField(clip, 'fadeOutSec', label), `${label}.fadeOutSec`)
      assertBoolean(requireField(clip, 'loop', label), `${label}.loop`)
      assertBoolean(requireField(clip, 'armed', label), `${label}.armed`)
      assertNonEmptyString(requireField(clip, 'state', label), `${label}.state`)
    })
  })

  const mixer = assertRecord(requireField(session, 'mixer', 'StudioSession'), 'StudioSession.mixer')
  const channels = assertArray(
    requireField(mixer, 'channels', 'StudioSession.mixer'),
    'mixer.channels',
  )
  channels.forEach((entry, index) => {
    const label = `StudioSession.mixer.channels[${index}]`
    const channel = assertRecord(entry, label)
    assertNonEmptyString(requireField(channel, 'id', label), `${label}.id`)
    assertFiniteNumber(requireField(channel, 'gainDb', label), `${label}.gainDb`)
    assertBoolean(requireField(channel, 'muted', label), `${label}.muted`)
  })
  assertFiniteNumber(
    requireField(mixer, 'masterGainDb', 'StudioSession.mixer'),
    'mixer.masterGainDb',
  )
  assertFiniteNumber(
    requireField(mixer, 'limiterCeilingDb', 'StudioSession.mixer'),
    'mixer.limiterCeilingDb',
  )

  const chapters = assertArray(
    requireField(session, 'chapters', 'StudioSession'),
    'StudioSession.chapters',
  )
  chapters.forEach((entry, index) =>
    assertChapterLike(entry, `StudioSession.chapters[${index}]`, true),
  )
  if (session.markers !== undefined)
    assertArray(session.markers, 'StudioSession.markers').forEach((entry, index) =>
      assertChapterLike(entry, `StudioSession.markers[${index}]`, false),
    )

  const log = assertArray(requireField(session, 'log', 'StudioSession'), 'StudioSession.log')
  log.forEach((entry, index) => {
    const label = `StudioSession.log[${index}]`
    const entryRecord = assertRecord(entry, label)
    assertNonEmptyString(requireField(entryRecord, 'type', label), `${label}.type`)
    if (entryRecord.atElapsedSec !== undefined)
      assertNonNegativeTime(entryRecord.atElapsedSec, `${label}.atElapsedSec`)
  })

  return session as unknown as StudioSession
}

export const assertStudioSession = (value: unknown): StudioSession => parseStudioSession(value)

/** Serializes a validated session to JSON; `parseStudioSession` accepts this string directly. */
export const serializeStudioSession = (session: StudioSession): string =>
  JSON.stringify(session, null, 2)
