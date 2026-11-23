import type { TranscriptSegment } from '../../media/contracts'
import { assertTranscriptSegments } from '../../media/transcript-validation'

type TimedSegment = TranscriptSegment
const round3 = (value: number) => Math.round(value * 1000) / 1000

const parseTimestamp = (value: string): number => {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/)
  if (!match) return Number.NaN
  const [, hours, minutes, seconds, millis] = match
  if (Number(seconds) >= 60 || (hours && Number(minutes) >= 60)) return Number.NaN
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, '0')) / 1000
  )
}

const formatTimestamp = (seconds: number, separator: ',' | '.'): string => {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000))
  const value = Math.floor(totalMs / 1000)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const millis = totalMs % 1000
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(millis, 3)}`
}

const collapseCueText = (text: string) => text.trim().replace(/\r?\n[ \t]*\r?\n/g, '\n')
const escapeVtt = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const unescapeVtt = (text: string) =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

const TIMING_LINE = /^(\S+)\s+-->\s+(\S+)/

const parseCueBlocks = (text: string): TimedSegment[] => {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/)
  const segments: TimedSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line.trim()))
    if (timingIndex < 0 || /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0] ?? '')) continue
    const match = lines[timingIndex].trim().match(TIMING_LINE)!
    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      throw new Error('Invalid caption timing.')
    let body = lines
      .slice(timingIndex + 1)
      .join(' ')
      .trim()
    let speaker: string | undefined
    const voice = body.match(/^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/)
    if (voice) {
      speaker = unescapeVtt(voice[1].trim())
      body = voice[2].trim()
    }
    body = unescapeVtt(body.replace(/<[^>]+>/g, '').trim())
    if (!body) continue
    segments.push({
      id: `seg-${segments.length + 1}`,
      startSeconds: round3(start),
      endSeconds: round3(end),
      text: body,
      ...(speaker ? { speaker } : {}),
    })
  }
  assertTranscriptSegments(segments)
  return segments
}

export const parseSrt = (text: string): TimedSegment[] => parseCueBlocks(text)
export const parseVtt = (text: string): TimedSegment[] =>
  parseCueBlocks(text.replace(/^\uFEFF?WEBVTT[^\n]*\n/, ''))

export const segmentsToSrt = (segments: readonly TimedSegment[]): string => {
  if (!segments.length) return ''
  return (
    segments
      .map(
        (segment, index) =>
          // SRT carries no speaker channel in the POD-01 serialisation
          // either; speakers round-trip through VTT (<v> spans) and JSON.
          `${index + 1}\n${formatTimestamp(segment.startSeconds, ',')} --> ${formatTimestamp(segment.endSeconds, ',')}\n${collapseCueText(segment.text)}`,
      )
      .join('\n\n') + '\n'
  )
}

export const segmentsToVtt = (segments: readonly TimedSegment[]): string => {
  if (!segments.length) return 'WEBVTT\n'
  const cues = segments
    .map(
      (segment) =>
        `${formatTimestamp(segment.startSeconds, '.')} --> ${formatTimestamp(segment.endSeconds, '.')}\n${segment.speaker ? `<v ${escapeVtt(segment.speaker.replace(/\s+/g, ' '))}>${escapeVtt(collapseCueText(segment.text))}</v>` : escapeVtt(collapseCueText(segment.text))}`,
    )
    .join('\n\n')
  return `WEBVTT\n\n${cues}\n`
}
